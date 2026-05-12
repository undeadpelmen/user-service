import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import UserRouter from '../api/userRouter.js';
import { errorHandler } from '../api/errorHandler.js';
import { AppError } from '../api/errorHandler.js';

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

const mockService = {
    register: vi.fn(),
    login: vi.fn(),
    authorize: vi.fn(),
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getHealth: vi.fn(),
    getStats: vi.fn(),
};

function createApp() {
    const app = express();
    app.use(express.json());

    app.get('/health', async (req, res) => {
        const health = await mockService.getHealth();
        const statusCode = health.status === 'ok' ? 200 : 503;
        res.status(statusCode).json(health);
    });

    const userRouter = new UserRouter(mockService);
    app.use('/', userRouter.Router());
    app.use(errorHandler);

    return app;
}

function adminToken() {
    return jwt.sign({ id: 'admin-id', name: 'admin', role: 'admin' }, 'test-secret');
}

function userToken() {
    return jwt.sign({ id: 'user-id', name: 'user', role: 'user' }, 'test-secret');
}

describe('API', () => {
    let app;

    beforeEach(() => {
        vi.clearAllMocks();
        app = createApp();
    });

    describe('GET /health', () => {
        it('should return 200 when healthy', async () => {
            mockService.getHealth.mockResolvedValue({ status: 'ok', database: 'connected', uptime: 100 });
            const res = await request(app).get('/health');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('ok');
        });

        it('should return 503 when degraded', async () => {
            mockService.getHealth.mockResolvedValue({ status: 'degraded', database: 'disconnected', uptime: 100 });
            const res = await request(app).get('/health');
            expect(res.status).toBe(503);
            expect(res.body.status).toBe('degraded');
        });
    });

    describe('POST /register', () => {
        it('should register a new user', async () => {
            mockService.register.mockResolvedValue({ _id: '1', name: 'alice', role: 'user' });
            const res = await request(app).post('/register').send({ name: 'alice', password: 'password123' });
            expect(res.status).toBe(201);
            expect(res.body.name).toBe('alice');
        });

        it('should return 400 on validation error', async () => {
            mockService.register.mockRejectedValue(new AppError('Name and password are required', 400));
            const res = await request(app).post('/register').send({ name: '', password: '' });
            expect(res.status).toBe(400);
        });

        it('should return 409 on duplicate', async () => {
            mockService.register.mockRejectedValue(new AppError('User already exists', 409));
            const res = await request(app).post('/register').send({ name: 'alice', password: 'password123' });
            expect(res.status).toBe(409);
        });
    });

    describe('POST /login', () => {
        it('should return token on success', async () => {
            mockService.login.mockResolvedValue({ token: 'jwt', token_type: 'Bearer', expires_in: 3600 });
            const res = await request(app).post('/login').send({ name: 'alice', password: 'password123' });
            expect(res.status).toBe(200);
            expect(res.body.token).toBe('jwt');
        });

        it('should return 401 on bad credentials', async () => {
            mockService.login.mockRejectedValue(new AppError('Invalid credentials', 401));
            const res = await request(app).post('/login').send({ name: 'alice', password: 'wrong' });
            expect(res.status).toBe(401);
        });
    });

    describe('GET /authorize', () => {
        it('should return user info for valid token', async () => {
            mockService.authorize.mockReturnValue({ id: '1', name: 'alice', role: 'user' });
            const res = await request(app).get('/authorize').set('Authorization', `Bearer ${adminToken()}`);
            expect(res.status).toBe(200);
            expect(res.body.name).toBe('alice');
        });

        it('should return 401 without token', async () => {
            const res = await request(app).get('/authorize');
            expect(res.status).toBe(401);
        });
    });

    describe('GET /users', () => {
        it('should return paginated users for admin', async () => {
            mockService.getAll.mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0, total_pages: 0 } });
            const res = await request(app).get('/users').set('Authorization', `Bearer ${adminToken()}`);
            expect(res.status).toBe(200);
        });

        it('should return 403 for non-admin', async () => {
            const res = await request(app).get('/users').set('Authorization', `Bearer ${userToken()}`);
            expect(res.status).toBe(403);
        });

        it('should return 401 without token', async () => {
            const res = await request(app).get('/users');
            expect(res.status).toBe(401);
        });
    });

    describe('POST /users', () => {
        it('should create user for admin', async () => {
            mockService.create.mockResolvedValue({ _id: '2', name: 'bob', role: 'admin' });
            const res = await request(app).post('/users').set('Authorization', `Bearer ${adminToken()}`).send({ name: 'bob', password: 'pass123', role: 'admin' });
            expect(res.status).toBe(201);
        });

        it('should return 403 for non-admin', async () => {
            const res = await request(app).post('/users').set('Authorization', `Bearer ${userToken()}`).send({ name: 'bob', password: 'pass123', role: 'admin' });
            expect(res.status).toBe(403);
        });
    });

    describe('GET /users/:id', () => {
        it('should return user for admin', async () => {
            mockService.getById.mockResolvedValue({ _id: '1', name: 'alice', role: 'user' });
            const res = await request(app).get('/users/1').set('Authorization', `Bearer ${adminToken()}`);
            expect(res.status).toBe(200);
        });

        it('should return 404 if not found', async () => {
            mockService.getById.mockRejectedValue(new AppError('User not found', 404));
            const res = await request(app).get('/users/nonexistent').set('Authorization', `Bearer ${adminToken()}`);
            expect(res.status).toBe(404);
        });
    });

    describe('PUT /users/:id', () => {
        it('should update user for admin', async () => {
            mockService.update.mockResolvedValue({ _id: '1', name: 'updated', role: 'user' });
            const res = await request(app).put('/users/1').set('Authorization', `Bearer ${adminToken()}`).send({ name: 'updated' });
            expect(res.status).toBe(200);
        });
    });

    describe('DELETE /users/:id', () => {
        it('should delete user for admin', async () => {
            mockService.delete.mockResolvedValue({ deletedCount: 1 });
            const res = await request(app).delete('/users/1').set('Authorization', `Bearer ${adminToken()}`);
            expect(res.status).toBe(204);
        });
    });

    describe('unknown route', () => {
        it('should return 404', async () => {
            const res = await request(app).get('/nonexistent');
            expect(res.status).toBe(404);
        });
    });
});
