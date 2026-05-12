import { describe, it, expect, vi } from 'vitest';
import { AppError, errorHandler } from '../api/errorHandler.js';

function mockReq() {
    return {
        path: '/test',
        method: 'GET',
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
}

function mockRes() {
    let statusCode;
    return {
        status: vi.fn((code) => { statusCode = code; return { json: vi.fn(), statusCode }; }),
        json: vi.fn().mockReturnThis(),
    };
}

describe('AppError', () => {
    it('should set statusCode and isOperational', () => {
        const err = new AppError('Not found', 404);
        expect(err.message).toBe('Not found');
        expect(err.statusCode).toBe(404);
        expect(err.isOperational).toBe(true);
    });
});

describe('errorHandler', () => {
    it('should use the error statusCode for operational errors', () => {
        const err = new AppError('Bad request', 400);
        const req = mockReq();
        const res = mockRes();
        const next = vi.fn();
        errorHandler(err, req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 500 for non-operational errors', () => {
        const err = new Error('Unexpected');
        const req = mockReq();
        const res = mockRes();
        const next = vi.fn();
        errorHandler(err, req, res, next);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});
