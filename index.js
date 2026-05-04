import { config, logger } from "./config/index.js";
import UserRouter from "./api/userRouter.js";
import express from "express"
import UserService from "./service/userService.js";
import { MongoClient } from "mongodb";
import { errorHandler } from "./api/errorHandler.js";

const shutdown = async (server, client, signal) => {
    logger.info({ signal }, 'Shutting down gracefully');
    server.close(async () => {
        try {
            await client.close();
            logger.info('MongoDB connection closed');
        } catch (err) {
            logger.error({ err }, 'Error closing MongoDB connection');
        }
        process.exit(0);
    });
};

const main = async () => {
    const app = express();
    let client;
    let server;

    try {
        client = new MongoClient(config.database.mongoUri);
        await client.connect();
        logger.info('Connected to MongoDB');

        const db = client.db(config.database.mongoDbName);
        const collection = db.collection(config.database.mongoCollectionName);

        const service = new UserService(collection);
        await service.initAdmin();

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
