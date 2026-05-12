import { describe, it, expect, beforeEach, vi } from 'vitest';
import UserService from '../service/userService.js';
import { AppError } from '../api/errorHandler.js';

vi.mock('uuid', () => ({ v4: () => 'mocked-uuid' }));
vi.mock('../config/index.js', () => ({
    config: {
        auth: {
            saltRounds: 1,
            jwtSecret: 'test-secret',
            jwtExpiresIn: 3600,
            admin: { name: 'admin', passwordHash: 'hash', role: 'admin', _id: 'admin-id' },
        },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const makeMockCollection = (initialData = []) => {
    let data = [...initialData];
    return {
        data,
        findOne: vi.fn(async (filter) => data.find((d) => Object.keys(filter).every((k) => d[k] === filter[k])) || null),
        find: vi.fn(() => ({
            skip: vi.fn(() => ({
                limit: vi.fn(() => ({
                    toArray: vi.fn(async () => data),
                })),
            })),
        })),
        insertOne: vi.fn(async (doc) => { data.push(doc); return { insertedId: doc._id }; }),
        updateOne: vi.fn(async (filter, update) => {
            const idx = data.findIndex((d) => d._id === filter._id);
            if (idx !== -1) Object.assign(data[idx], update.$set);
            return { modifiedCount: idx !== -1 ? 1 : 0 };
        }),
        deleteOne: vi.fn(async (filter) => {
            const idx = data.findIndex((d) => d._id === filter._id);
            if (idx !== -1) data.splice(idx, 1);
            return { deletedCount: idx !== -1 ? 1 : 0 };
        }),
        countDocuments: vi.fn(async () => data.length),
        aggregate: vi.fn(() => ({
            toArray: vi.fn(async () => {
                const counts = {};
                for (const d of data) counts[d.role] = (counts[d.role] || 0) + 1;
                return Object.entries(counts).map(([_id, count]) => ({ _id, count }));
            }),
        })),
    };
};

const makeMockDb = (pingOk = true) => ({
    command: vi.fn(async (cmd) => {
        if (!pingOk) throw new Error('DB down');
        if (cmd.ping === 1) return { ok: 1 };
    }),
});

describe('UserService', () => {
    let collection;
    let db;
    let service;

    beforeEach(() => {
        collection = makeMockCollection();
        db = makeMockDb();
        service = new UserService(collection, db);
    });

    describe('constructor', () => {
        it('should throw if collection is null', () => {
            expect(() => new UserService(null, db)).toThrow(AppError);
        });

        it('should throw if collection is undefined', () => {
            expect(() => new UserService(undefined, db)).toThrow(AppError);
        });
    });

    describe('validatePassword', () => {
        it('should throw for short password', () => {
            expect(() => UserService.validatePassword('ab')).toThrow(AppError);
        });

        it('should throw for long password', () => {
            expect(() => UserService.validatePassword('a'.repeat(21))).toThrow(AppError);
        });

        it('should pass for valid password', () => {
            expect(() => UserService.validatePassword('abcdef')).not.toThrow();
        });
    });

    describe('getHealth', () => {
        it('should return ok when DB responds', async () => {
            const result = await service.getHealth();
            expect(result.status).toBe('ok');
            expect(result.database).toBe('connected');
        });

        it('should return degraded when DB fails', async () => {
            const badDb = makeMockDb(false);
            const svc = new UserService(collection, badDb);
            const result = await svc.getHealth();
            expect(result.status).toBe('degraded');
            expect(result.database).toBe('disconnected');
        });
    });

    describe('getStats', () => {
        it('should return stats', async () => {
            collection.data.push({ _id: '1', role: 'user' }, { _id: '2', role: 'admin' });
            const result = await service.getStats();
            expect(result.total_users).toBe(2);
            expect(result.by_role).toEqual({ user: 1, admin: 1 });
        });
    });

    describe('initAdmin', () => {
        it('should insert admin if not exists', async () => {
            await service.initAdmin();
            expect(collection.insertOne).toHaveBeenCalled();
        });

        it('should not insert admin if already exists', async () => {
            collection.data.push({ name: 'admin' });
            await service.initAdmin();
            expect(collection.insertOne).not.toHaveBeenCalled();
        });
    });

    describe('register', () => {
        it('should register a new user', async () => {
            const result = await service.register('alice', 'password123');
            expect(result).toHaveProperty('_id', 'mocked-uuid');
            expect(result).toHaveProperty('name', 'alice');
            expect(result).toHaveProperty('role', 'user');
            expect(result).not.toHaveProperty('passwordHash');
        });

        it('should throw if name is missing', async () => {
            await expect(service.register('', 'pass')).rejects.toThrow(AppError);
        });

        it('should throw if password is missing', async () => {
            await expect(service.register('alice', '')).rejects.toThrow(AppError);
        });

        it('should throw if user already exists', async () => {
            collection.data.push({ name: 'alice' });
            await expect(service.register('alice', 'password123')).rejects.toThrow(AppError);
        });
    });

    describe('login', () => {
        it('should return token for valid credentials', async () => {
            const bcrypt = await import('bcrypt');
            const hash = await bcrypt.hash('password123', 1);
            collection.data.push({ _id: '1', name: 'alice', role: 'user', passwordHash: hash });
            const result = await service.login('alice', 'password123');
            expect(result).toHaveProperty('token');
            expect(result).toHaveProperty('token_type', 'Bearer');
            expect(result).toHaveProperty('expires_in');
        });

        it('should throw for invalid password', async () => {
            collection.data.push({ _id: '1', name: 'alice', role: 'user', passwordHash: 'badhash' });
            await expect(service.login('alice', 'wrong')).rejects.toThrow(AppError);
        });

        it('should throw for unknown user', async () => {
            await expect(service.login('nobody', 'pass')).rejects.toThrow(AppError);
        });
    });

    describe('getAll', () => {
        it('should return paginated users without passwordHash', async () => {
            collection.data.push({ _id: '1', name: 'a', role: 'user', passwordHash: 'h1' });
            collection.data.push({ _id: '2', name: 'b', role: 'admin', passwordHash: 'h2' });
            const result = await service.getAll({ page: 1, limit: 20 });
            expect(result.data).toHaveLength(2);
            expect(result.data[0]).not.toHaveProperty('passwordHash');
            expect(result.pagination).toEqual({ page: 1, limit: 20, total: 2, total_pages: 1 });
        });
    });

    describe('getById', () => {
        it('should return user without passwordHash', async () => {
            collection.data.push({ _id: '42', name: 'alice', role: 'user', passwordHash: 'hash' });
            const result = await service.getById('42');
            expect(result).toHaveProperty('_id', '42');
            expect(result).not.toHaveProperty('passwordHash');
        });

        it('should throw for missing user', async () => {
            await expect(service.getById('nonexistent')).rejects.toThrow(AppError);
        });
    });

    describe('create', () => {
        it('should create a user with specified role', async () => {
            const result = await service.create('bob', 'password123', 'admin');
            expect(result).toHaveProperty('name', 'bob');
            expect(result).toHaveProperty('role', 'admin');
            expect(result).not.toHaveProperty('passwordHash');
        });

        it('should throw if name is missing', async () => {
            await expect(service.create('', 'pass', 'user')).rejects.toThrow(AppError);
        });

        it('should throw if password is missing', async () => {
            await expect(service.create('bob', '', 'user')).rejects.toThrow(AppError);
        });

        it('should throw if role is missing', async () => {
            await expect(service.create('bob', 'pass', '')).rejects.toThrow(AppError);
        });

        it('should throw if user already exists', async () => {
            collection.data.push({ name: 'bob' });
            await expect(service.create('bob', 'pass', 'user')).rejects.toThrow(AppError);
        });
    });

    describe('update', () => {
        it('should update user fields', async () => {
            collection.data.push({ _id: '1', name: 'old', role: 'user', passwordHash: 'oldhash' });
            const result = await service.update('1', { name: 'new' });
            expect(result).toHaveProperty('name', 'new');
            expect(result).not.toHaveProperty('passwordHash');
        });

        it('should throw for missing user', async () => {
            await expect(service.update('nonexistent', { name: 'x' })).rejects.toThrow(AppError);
        });
    });

    describe('delete', () => {
        it('should delete existing user', async () => {
            collection.data.push({ _id: '1', name: 'alice', role: 'user' });
            await expect(service.delete('1')).resolves.not.toThrow();
        });

        it('should throw for missing user', async () => {
            await expect(service.delete('nonexistent')).rejects.toThrow(AppError);
        });
    });

    describe('authorize', () => {
        it('should return payload fields', () => {
            const payload = { id: '1', name: 'alice', role: 'user', iat: 123, exp: 456 };
            const result = service.authorize(payload);
            expect(result).toEqual({ id: '1', name: 'alice', role: 'user' });
        });
    });
});
