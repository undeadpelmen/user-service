# user-service

User management microservice with JWT authentication, role-based access (user/admin), and MongoDB storage.

## Features

- Register and login with bcrypt-hashed passwords
- JWT-based authorization
- Role-based access control (user / admin)
- Admin CRUD for user management
- Health check endpoint
- Structured logging with Pino

## Quick Start

```
npm install
npm start
```

Requires a MongoDB instance. Configure via environment variables (see below).

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `6666` | HTTP server port |
| `MONGO_URI` | `mongodb://undead:w@localhost:27017` | MongoDB connection string |
| `JWT_SECRET` | `dev-secret` | JWT signing secret |
| `SALT_ROUNDS` | `10` | bcrypt salt rounds |
| `LOG_LEVEL` | `info` | Pino log level |

## API

Full specification in [`openapi.yaml`](openapi.yaml).

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | — | Register a new user |
| POST | `/login` | — | Login, returns JWT |
| GET | `/authorize` | Bearer | Validate token and return user info |

### System

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Health check (DB connectivity + uptime) |

### Admin – Users

All endpoints require `admin` role.

| Method | Path | Description |
|---|---|---|
| GET | `/users` | List users (paginated) |
| POST | `/users` | Create a user with role |
| GET | `/users/:id` | Get user by UUID |
| PUT | `/users/:id` | Update user |
| DELETE | `/users/:id` | Delete user |

## Docker

```
docker build -t user-service .
docker run -e MONGO_URI=... -e JWT_SECRET=... -p 6666:6666 user-service
```
