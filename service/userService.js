import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { config, logger } from './../config/index.js'

export default class UserService {
    constructor(collection) {
        if (collection === null || collection === undefined) {
            logger.error('UserService initialized with null/undefined collection');
            throw new Error("collection null or undefined");
        };

        this.collection = collection;
        logger.info('UserService initialized');
    }

    async initAdmin() {
        try {
            const existing = await this.collection.findOne({ name: config.auth.admin.name });
            if (!existing) {
                await this.collection.insertOne(config.auth.admin);
                logger.info('Admin user created');
            }
        } catch (err) {
            logger.error({ err }, 'Failed to initialize admin user');
            throw err;
        }
    }

    async register(name, password) {
        try {
            if (!name || !password) {
                logger.warn('Register called with missing name or password');
                throw new Error('Invalid request body');
            }

            const existing = await this.collection.findOne({ name });
            if (existing) {
                logger.warn({ name }, 'Registration failed: user already exists');
                throw new Error('User already exists');
            }

            const _id = uuidv4();
            const passwordHash = await bcrypt.hash(password, config.auth.saltRounds);
            const user = { _id, name, role: 'user' };
            await this.collection.insertOne({
                ...user,
                passwordHash,
            });
            logger.info({ userId: _id, name }, 'User registered successfully');

            const { passwordHash: _, ...result } = user;
            return result;
        } catch (err) {
            logger.error({ err, name }, 'Error during user registration');
            throw err;
        }
    }

    async login(name, password) {
        try {
            if (!name || !password) {
                logger.warn('Login called with missing name or password');
                throw new Error('Invalid credentials');
            }

            const user = await this.collection.findOne({ name });
            if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
                logger.warn({ name }, 'Login failed: invalid credentials');
                throw new Error('Invalid credentials');
            }

            const token = jwt.sign({ id: user._id, name: user.name, role: user.role }, config.auth.jwtSecret, { expiresIn: config.auth.jwtExpiresIn });
            logger.info({ userId: user._id, name }, 'User logged in successfully');
            return { token, token_type: 'Bearer', expires_in: config.auth.jwtExpiresIn };
        } catch (err) {
            logger.error({ err, name }, 'Error during login');
            throw err;
        }
    }

    async getAll({ page = 1, limit = 20 } = {}) {
        try {
            const total = await this.collection.countDocuments();
            const totalPages = Math.ceil(total / limit);
            const users = await this.collection.find()
                .skip((page - 1) * limit)
                .limit(limit)
                .toArray();
            const data = users.map((u) => { const { passwordHash: _, ...safe } = u; return safe });

            logger.debug({ page, limit, total, totalPages }, 'Fetched all users');
            return {
                data,
                pagination: { page, limit, total, total_pages: totalPages },
            };
        } catch (err) {
            logger.error({ err }, 'Error fetching users');
            throw err;
        }
    }

    async getById(id) {
        try {
            const user = await this.collection.findOne({ _id: id });
            if (!user) {
                logger.warn({ userId: id }, 'User not found');
                throw new Error('User not found');
            }
            logger.debug({ userId: id }, 'Fetched user by ID');
            const { passwordHash, ...result } = user;
            return result;
        } catch (err) {
            logger.error({ err, userId: id }, 'Error fetching user by ID');
            throw err;
        }
    }

    async create(name, password, role) {
        try {
            if (!name || !password || !role) {
                logger.warn('Create called with missing fields');
                throw new Error('Invalid request body');
            }

            const existing = await this.collection.findOne({ name });
            if (existing) {
                logger.warn({ name }, 'Create failed: user already exists');
                throw new Error('User already exists');
            }

            const _id = uuidv4();
            const passwordHash = await bcrypt.hash(password, config.auth.saltRounds);
            const user = { _id, name, role };
            await this.collection.insertOne({
                passwordHash,
                ...user,
            });
            logger.info({ userId: _id, name, role }, 'User created by admin');

            const { passwordHash: _, ...result } = user;
            return result;
        } catch (err) {
            logger.error({ err, name }, 'Error creating user');
            throw err;
        }
    }

    async update(id, data) {
        try {
            const user = await this.collection.findOne({ _id: id });
            if (!user) {
                logger.warn({ userId: id }, 'Update failed: user not found');
                throw new Error('User not found');
            }

            const { name, password, role } = data;
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

            logger.info({ userId: id }, 'User updated successfully');
            const { passwordHash: _, ...safeResult } = updated;
            return safeResult;
        } catch (err) {
            logger.error({ err, userId: id }, 'Error updating user');
            throw err;
        }
    }

    async delete(id) {
        try {
            const result = await this.collection.deleteOne({ _id: id });
            if (result.deletedCount === 0) {
                logger.warn({ userId: id }, 'Delete failed: user not found');
                throw new Error('User not found');
            }
            logger.info({ userId: id }, 'User deleted successfully');
            return result;
        } catch (err) {
            logger.error({ err, userId: id }, 'Error deleting user');
            throw err;
        }
    }

    authorize(payload) {
        return { id: payload.id, name: payload.name, role: payload.role };
    }
}
