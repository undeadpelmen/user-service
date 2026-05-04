import jwt from 'jsonwebtoken';
import { config, logger } from '../config/index.js';

export const errorResponse = (message) => {
    return { timestamp: new Date().toISOString(), error: message };
}

export const authMiddleware = (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        req.logger.warn({ path: req.path, method: req.method }, 'Missing or invalid authorization header');
        return res.status(401).json(errorResponse('Invalid or expired token'));
    }

    logger.info({ token: auth });

    try {
        const token = auth.slice(7);
        const payload = jwt.verify(token, config.auth.jwtSecret);

        logger.info({ payload: payload });

        req.user = payload;
        req.logger.info({ userId: payload.id }, 'Authenticated request');
        next();
    } catch (err) {
        logger.error({ err });

        req.logger.warn({ path: req.path, method: req.method, error: err.message }, 'Invalid token');
        return res.status(401).json(errorResponse('Invalid or expired token'));
    }
}

export const adminOnly = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        req.logger.warn({ userId: req.user?.id, path: req.path }, 'Admin access denied');
        return res.status(403).json(errorResponse('Forbidden - admin role required'));
    }
    next();
}

export const logMiddleware = (req, res, next) => {
    req.logger = logger;
    const start = Date.now();
    res.on('finish', () => {
        logger.info({ method: req.method, path: req.path, status: res.statusCode, duration: Date.now() - start }, 'Request completed');
    });
    next();
}