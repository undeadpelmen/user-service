import { describe, it, expect, vi } from 'vitest';
import { authMiddleware, adminOnly, logMiddleware } from '../api/middleware.js';
import { AppError } from '../api/errorHandler.js';
import jwt from 'jsonwebtoken';

vi.mock('../config/index.js', () => ({
    config: {
        auth: { jwtSecret: 'test-secret' },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function mockReq(headers = {}, user = null) {
    return {
        headers,
        path: '/test',
        method: 'GET',
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        user,
        on: vi.fn(),
    };
}

function mockRes() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        on: vi.fn(),
    };
}

describe('authMiddleware', () => {
    it('should call next with error when no auth header', () => {
        const req = mockReq({});
        const res = mockRes();
        const next = vi.fn();
        authMiddleware(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.any(AppError));
        expect(next.mock.calls[0][0].statusCode).toBe(401);
    });

    it('should call next with error for non-Bearer auth', () => {
        const req = mockReq({ authorization: 'Basic xxx' });
        const res = mockRes();
        const next = vi.fn();
        authMiddleware(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });

    it('should call next with error for invalid token', () => {
        const req = mockReq({ authorization: 'Bearer invalid-token' });
        const res = mockRes();
        const next = vi.fn();
        authMiddleware(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });

    it('should set req.user and call next for valid token', () => {
        const token = jwt.sign({ id: '1', role: 'user' }, 'test-secret');
        const req = mockReq({ authorization: `Bearer ${token}` });
        const res = mockRes();
        const next = vi.fn();
        authMiddleware(req, res, next);
        expect(req.user).toBeDefined();
        expect(req.user.id).toBe('1');
        expect(next).toHaveBeenCalledWith();
    });
});

describe('adminOnly', () => {
    it('should call next with error for non-admin', () => {
        const req = mockReq({}, { role: 'user' });
        const res = mockRes();
        const next = vi.fn();
        adminOnly(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.any(AppError));
        expect(next.mock.calls[0][0].statusCode).toBe(403);
    });

    it('should call next for admin', () => {
        const req = mockReq({}, { role: 'admin' });
        const res = mockRes();
        const next = vi.fn();
        adminOnly(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('should call next with error when no user', () => {
        const req = mockReq({}, null);
        const res = mockRes();
        const next = vi.fn();
        adminOnly(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
});

describe('logMiddleware', () => {
    it('should set req.logger and call next', () => {
        const req = mockReq();
        const res = mockRes();
        const next = vi.fn();
        logMiddleware(req, res, next);
        expect(req.logger).toBeDefined();
        expect(next).toHaveBeenCalledWith();
    });
});
