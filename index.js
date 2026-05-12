import { config, logger } from "./config/index.js";
import UserRouter from "./api/userRouter.js";
import cors from "cors"
import express from "express";
import UserService from "./service/userService.js";
import { MongoClient } from "mongodb";
import { errorHandler } from "./api/errorHandler.js";

const SHUTDOWN_TIMEOUT = 30000;

const shutdown = async (server, client, signal) => {
    logger.info({ signal }, 'Shutting down gracefully');

    server.close(async () => {
        logger.info('HTTP server closed');
    });

    const timeout = setTimeout(() => {
        logger.error(`Shutdown timed out after ${SHUTDOWN_TIMEOUT}ms`);
        process.exit(1);
    }, SHUTDOWN_TIMEOUT);
    timeout.unref();

    try {
        await client.close();
        logger.info('MongoDB connection closed');
    } catch (err) {
        logger.error({ err }, 'Error closing MongoDB connection');
    }

    clearTimeout(timeout);
    process.exit(0);
};

const main = async () => {
    const app = express();
    app.use(cors());
    let client;
    let server;

    try {
        client = new MongoClient(config.database.mongoUri);
        await client.connect();
        logger.info('Connected to MongoDB');

        const db = client.db(config.database.mongoDbName);
        const collection = db.collection(config.database.mongoCollectionName);

        const service = new UserService(collection, db);
        await service.initAdmin();

        app.get("/health", async (req, res) => {
            const health = await service.getHealth();
            const statusCode = health.status === 'ok' ? 200 : 503;
            res.status(statusCode).json(health);
        });

        const userRouter = new UserRouter(service);
        app.use("/", userRouter.Router());
        app.use(errorHandler);

        server = app.listen(config.server.port, () => {
            logger.info({ port: config.server.port }, 'Server started');
        });

        process.on('SIGTERM', () => shutdown(server, client, 'SIGTERM'));
        process.on('SIGINT', () => shutdown(server, client, 'SIGINT'));
    } catch (err) {
        logger.error({ err }, 'Failed to start server');
        if (client) {
            await client.close();
        }
        process.exit(1);
    }
}

main();
