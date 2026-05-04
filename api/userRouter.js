import express from 'express';
import { adminOnly, authMiddleware, logMiddleware, errorResponse } from './middleware.js';

export default class UserRouter {
    constructor(service) {
        this.service = service;
        this.Register = this.Register.bind(this);
        this.Login = this.Login.bind(this);
        this.Authorize = this.Authorize.bind(this);
        this.GetAllUsers = this.GetAllUsers.bind(this);
        this.CreateUser = this.CreateUser.bind(this);
        this.GetUserById = this.GetUserById.bind(this);
        this.UpdateUser = this.UpdateUser.bind(this);
        this.DeleteUser = this.DeleteUser.bind(this);

        const router = express.Router();
        router.use(express.json());
        router.use(logMiddleware);

        router.post("/register", this.Register);
        router.post("/login", this.Login);
        router.get("/authorize", authMiddleware, this.Authorize);

        const userRouter = express.Router();

        userRouter.use(authMiddleware);
        userRouter.use(adminOnly);

        userRouter.get("/", this.GetAllUsers);
        userRouter.post("/", this.CreateUser);
        userRouter.get("/:id", this.GetUserById);
        userRouter.put("/:id", this.UpdateUser);
        userRouter.delete("/:id", this.DeleteUser);

        router.use("/users", userRouter);

        this.router = router;
    }

    Router() {
        return this.router;
    }

    async Register(req, res) {
        try {
            const { name, password } = req.body;
            const result = await this.service.register(name, password);
            req.logger.info({ userId: result._id, name }, 'User registered');
            res.status(201).json(result);
        } catch (err) {
            req.logger.error({ err, name: req.body?.name }, 'Register endpoint error');
            if (err.message === 'User already exists') {
                return res.status(409).json(errorResponse(err.message));
            }
            return res.status(400).json(errorResponse(err.message));
        }
    }

    async Login(req, res) {
        try {
            const { name, password } = req.body;
            const result = await this.service.login(name, password);
            req.logger.info({ name }, 'User logged in');
            res.json(result);
        } catch (err) {
            req.logger.error({ err, name: req.body?.name }, 'Login endpoint error');
            return res.status(401).json(errorResponse(err.message));
        }
    }

    Authorize(req, res) {
        try {
            res.json(this.service.authorize(req.user));
        } catch (err) {
            req.logger.error({ err }, 'Authorize endpoint error');
            return res.status(500).json(errorResponse('Internal server error'));
        }
    }

    async GetAllUsers(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const result = await this.service.getAll({ page, limit });
            res.json(result);
        } catch (err) {
            req.logger.error({ err }, 'GetAllUsers endpoint error');
            return res.status(500).json(errorResponse('Internal server error'));
        }
    }

    async GetUserById(req, res) {
        try {
            const result = await this.service.getById(req.params.id);
            res.json(result);
        } catch (err) {
            req.logger.error({ err, userId: req.params.id }, 'GetUserById endpoint error');
            if (err.message === 'User not found') {
                return res.status(404).json(errorResponse(err.message));
            }
            return res.status(500).json(errorResponse('Internal server error'));
        }
    }

    async CreateUser(req, res) {
        try {
            const { name, password, role } = req.body;
            const result = await this.service.create(name, password, role);
            req.logger.info({ userId: result._id, name, role }, 'User created by admin');
            res.status(201).json(result);
        } catch (err) {
            req.logger.error({ err, name: req.body?.name }, 'CreateUser endpoint error');
            if (err.message === 'User already exists') {
                return res.status(409).json(errorResponse(err.message));
            }
            return res.status(400).json(errorResponse(err.message));
        }
    }

    async UpdateUser(req, res) {
        try {
            const result = await this.service.update(req.params.id, req.body);
            req.logger.info({ userId: req.params.id }, 'User updated');
            res.json(result);
        } catch (err) {
            req.logger.error({ err, userId: req.params.id }, 'UpdateUser endpoint error');
            if (err.message === 'User not found') {
                return res.status(404).json(errorResponse(err.message));
            }
            return res.status(500).json(errorResponse('Internal server error'));
        }
    }

    async DeleteUser(req, res) {
        try {
            await this.service.delete(req.params.id);
            req.logger.info({ userId: req.params.id }, 'User deleted');
            res.status(204).send();
        } catch (err) {
            req.logger.error({ err, userId: req.params.id }, 'DeleteUser endpoint error');
            if (err.message === 'User not found') {
                return res.status(404).json(errorResponse(err.message));
            }
            return res.status(500).json(errorResponse('Internal server error'));
        }
    }
}