export class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

export const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.isOperational ? err.message : 'Internal server error';

    req.logger.error({
        err: err.isOperational ? undefined : err,
        message: err.message,
        statusCode,
        path: req.path,
        method: req.method,
    }, 'Request error');

    if (!err.isOperational) {
        console.error('Unhandled error:', err);
    }

    res.status(statusCode).json({
        timestamp: new Date().toISOString(),
        error: message,
    });
};
