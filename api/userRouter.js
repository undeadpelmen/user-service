import express from 'express';
import { adminOnly, authMiddleware, logMiddleware } from './middleware.js';

const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

export default class UserRouter {
    constructor(service) {
        this.service = service;

        const router = express.Router();
        router.use(express.json());
        router.use(logMiddleware);

        router.post("/register", asyncHandler(this.Register.bind(this)));
        router.post("/login", asyncHandler(this.Login.bind(this)));
        router.get("/authorize", authMiddleware, asyncHandler(this.Authorize.bind(this)));

        const userRouter = express.Router();

        userRouter.use(authMiddleware);
        userRouter.use(adminOnly);

        userRouter.get("/", asyncHandler(this.GetAllUsers.bind(this)));
        userRouter.post("/", asyncHandler(this.CreateUser.bind(this)));
        userRouter.get("/:id", asyncHandler(this.GetUserById.bind(this)));
        userRouter.put("/:id", asyncHandler(this.UpdateUser.bind(this)));
        userRouter.delete("/:id", asyncHandler(this.DeleteUser.bind(this)));

        router.use("/users", userRouter);

        this.router = router;
    }

    Router() {
        return this.router;
    }

    async Register(req, res) {
        const { name, password } = req.body;
        const result = await this.service.register(name, password);
        req.logger.info({ userId: result._id, name }, 'User registered');
        res.status(201).json(result);
    }

    async Login(req, res) {
        const { name, password } = req.body;
        const result = await this.service.login(name, password);
        req.logger.info({ name }, 'User logged in');
        res.json(result);
    }

    Authorize(req, res) {
        res.json(this.service.authorize(req.user));
    }

    async GetAllUsers(req, res) {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const result = await this.service.getAll({ page, limit });
        res.json(result);
    }

    async GetUserById(req, res) {
        const result = await this.service.getById(req.params.id);
        res.json(result);
    }

    async CreateUser(req, res) {
        const { name, password, role } = req.body;
        const result = await this.service.create(name, password, role);
        req.logger.info({ userId: result._id, name, role }, 'User created by admin');
        res.status(201).json(result);
    }

    async UpdateUser(req, res) {
        const result = await this.service.update(req.params.id, req.body);
        req.logger.info({ userId: req.params.id }, 'User updated');
        res.json(result);
    }

    async DeleteUser(req, res) {
        await this.service.delete(req.params.id);
        req.logger.info({ userId: req.params.id }, 'User deleted');
        res.status(204).send();
    }
}
