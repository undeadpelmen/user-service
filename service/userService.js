import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { config } from './../config/index.js';
import { AppError } from '../api/errorHandler.js';

export default class UserService {
    static MIN_PASSWORD_LENGTH = 6;
    static MAX_PASSWORD_LENGTH = 20;

    static validatePassword(password) {
        if (password.length < this.MIN_PASSWORD_LENGTH) {
            throw new AppError(`Password must be at least ${this.MIN_PASSWORD_LENGTH} characters`, 400);
        }
        if (password.length > this.MAX_PASSWORD_LENGTH) {
            throw new AppError(`Password must be at most ${this.MAX_PASSWORD_LENGTH} characters`, 400);
        }
    }

    constructor(collection, db) {
        if (collection === null || collection === undefined) {
            throw new AppError('UserService initialized with null/undefined collection', 500);
        }

        this.collection = collection;
        this.db = db;
    }

    async getHealth() {
        try {
            await this.db.command({ ping: 1 });
            return { status: 'ok', database: 'connected', uptime: process.uptime() };
        } catch {
            return { status: 'degraded', database: 'disconnected', uptime: process.uptime() };
        }
    }

    async getStats() {
        const total = await this.collection.countDocuments();
        const roleStats = await this.collection.aggregate([
            { $group: { _id: '$role', count: { $sum: 1 } } },
        ]).toArray();

        const roles = {};
        for (const { _id, count } of roleStats) {
            roles[_id] = count;
        }

        return { total_users: total, by_role: roles };
    }

    async initAdmin() {
        const existing = await this.collection.findOne({ name: config.auth.admin.name });
        if (!existing) {
            await this.collection.insertOne(config.auth.admin);
        }
    }

    async register(name, password) {
        if (!name || !password) {
            throw new AppError('Name and password are required', 400);
        }

        UserService.validatePassword(password);

        const existing = await this.collection.findOne({ name });
        if (existing) {
            throw new AppError('User already exists', 409);
        }

        const _id = uuidv4();
        const passwordHash = await bcrypt.hash(password, config.auth.saltRounds);
        const user = { _id, name, role: 'user' };
        await this.collection.insertOne({
            ...user,
            passwordHash,
        });

        const { passwordHash: _, ...result } = user;
        return result;
    }

    async login(name, password) {
        if (!name || !password) {
            throw new AppError('Invalid credentials', 401);
        }

        const user = await this.collection.findOne({ name });
        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
            throw new AppError('Invalid credentials', 401);
        }

        const token = jwt.sign({ id: user._id, name: user.name, role: user.role }, config.auth.jwtSecret, { expiresIn: config.auth.jwtExpiresIn });

        return { token, token_type: 'Bearer', expires_in: config.auth.jwtExpiresIn };
    }

    async getAll({ page = 1, limit = 20 } = {}) {
        const total = await this.collection.countDocuments();
        const totalPages = Math.ceil(total / limit);
        const users = await this.collection.find()
            .skip((page - 1) * limit)
            .limit(limit)
            .toArray();
        const data = users.map((u) => { const { passwordHash: _, ...safe } = u; return safe });

        return {
            data,
            pagination: { page, limit, total, total_pages: totalPages },
        };
    }

    async getById(id) {
        const user = await this.collection.findOne({ _id: id });
        if (!user) {
            throw new AppError('User not found', 404);
        }

        const { passwordHash, ...result } = user;
        return result;
    }

    async create(name, password, role) {
        if (!name || !password || !role) {
            throw new AppError('Name, password, and role are required', 400);
        }

        UserService.validatePassword(password);

        const existing = await this.collection.findOne({ name });
        if (existing) {
            throw new AppError('User already exists', 409);
        }

        const _id = uuidv4();
        const passwordHash = await bcrypt.hash(password, config.auth.saltRounds);
        const user = { _id, name, role };
        await this.collection.insertOne({
            passwordHash,
            ...user,
        });

        const { passwordHash: _, ...result } = user;
        return result;
    }

    async update(id, data) {
        const user = await this.collection.findOne({ _id: id });
        if (!user) {
            throw new AppError('User not found', 404);
        }

        const { name, password, role } = data;
        if (password) {
            UserService.validatePassword(password);
        }
        const passwordHash = password ? await bcrypt.hash(password, config.auth.saltRounds) : user.passwordHash;
        const updated = {
            name: name || user.name,
            role: role || user.role,
            passwordHash,
        };

        const result = await this.collection.updateOne(
            { _id: id },
            { $set: updated }
        );

        const { passwordHash: _, ...safeResult } = updated;
        return safeResult;
    }

    async delete(id) {
        const result = await this.collection.deleteOne({ _id: id });
        if (result.deletedCount === 0) {
            throw new AppError('User not found', 404);
        }

        return result;
    }

    authorize(payload) {
        return { id: payload.id, name: payload.name, role: payload.role };
    }
}
