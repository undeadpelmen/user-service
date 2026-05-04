import bcrypt from 'bcrypt';
import pino from 'pino';

const saltRounds = parseInt(process.env.SALT_ROUNDS) || 10;

export const config = {
    server: {
        port: parseInt(process.env.PORT) || 6666,
    },
    database: {
        mongoUri: process.env.MONGO_URI || 'mongodb://undead:w@localhost:27017',
        mongoDbName: 'film',
        mongoCollectionName: 'users',
    },
    auth: {
        saltRounds,
        jwtSecret: process.env.JWT_SECRET || 'dev-secret',
        jwtExpiresIn: 3600,
        admin: {
            name: 'admin',
            passwordHash: bcrypt.hashSync('admin-secret', saltRounds),
            role: 'admin',
            _id: '00000000-0000-0000-0000-000000000001',
        },
    },
    logging: {
        level: process.env.LOG_LEVEL || 'info',
    },
};

export const logger = pino({ level: config.logging.level });
