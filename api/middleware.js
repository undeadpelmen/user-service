import jwt from 'jsonwebtoken';
import { config, logger } from '../config/index.js';
import { AppError } from './errorHandler.js';

export const authMiddleware = (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        req.logger.warn({ path: req.path, method: req.method }, 'Missing or invalid authorization header');
        return next(new AppError('Invalid or expired token', 401));
    }

    try {
        const token = auth.slice(7);
        const payload = jwt.verify(token, config.auth.jwtSecret);

        req.user = payload;
        req.logger.info({ userId: payload.id }, 'Authenticated request');
        next();
    } catch (err) {
        req.logger.warn({ path: req.path, method: req.method, error: err.message }, 'Invalid token');
        return next(new AppError('Invalid or expired token', 401));
    }
};

export const adminOnly = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        req.logger.warn({ userId: req.user?.id, path: req.path }, 'Admin access denied');
        return next(new AppError('Forbidden - admin role required', 403));
    }
    next();
};

export const logMiddleware = (req, res, next) => {
    req.logger = logger;
    const start = Date.now();
    res.on('finish', () => {
        logger.info({ method: req.method, path: req.path, status: res.statusCode, duration: Date.now() - start }, 'Request completed');
    });
    next();
};
