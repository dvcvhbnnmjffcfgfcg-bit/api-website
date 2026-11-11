# API-Website

商业级 RESTful API 服务平台。官网 + API 网关 + 业务服务 + 管理后台。

## 仓库结构

```
api-website/
├── apps/
│   ├── web/            # 官网前端（React + Vite + Tailwind）
│   ├── api-gateway/    # 统一网关（Fastify）：JWT + API Key + 限速 + 日志
│   └── api-service/    # 纯业务逻辑（echo / weather / translate）
├── packages/
│   ├── shared/         # 共享类型与常量
│   ├── auth/           # JWT / API Key / 签名
│   └── db/             # Prisma client + schema
└── docker/             # PostgreSQL + Redis 本地一键启动
```

## 一键启动（本地）

```bash
# 1. 启动数据库与缓存
cd docker
docker compose up -d
cd ..

# 2. 安装依赖
pnpm install

# 3. 准备环境变量
cp .env.example .env
# 编辑 .env：填写 JWT_SECRET（>= 32 字符）

# 4. 生成 Prisma 客户端并建表
pnpm db:setup

# 5. 启动全部服务（api-service + api-gateway + web）
pnpm dev
```

默认端口：
- PostgreSQL: `5432`
- Redis: `6379`
- api-service: `8081`
- api-gateway: `8080`
- web: `5173`

## 常用端点

- 官网登录/注册：`http://localhost:5173`
- 网关健康检查：`http://localhost:8080/health`
- 网关指标：`http://localhost:8080/metrics`
- 业务接口（带 API Key）：
  - `GET /api/v1/echo?message=hi`
  - `GET /api/v1/weather?city=beijing`
  - `POST /api/v1/translate` body `{ "text": "hi", "target": "en" }`

## .env 字段

| 变量 | 说明 | 默认值 |
|---|---|---|
| `PORT` | 网关监听端口 | `8080` |
| `API_SERVICE_PORT` | 业务服务端口 | `8081` |
| `WEB_PORT` | 官网前端端口 | `5173` |
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://apigateway:apigateway123@localhost:5432/apigateway?schema=public` |
| `REDIS_URL` | Redis 连接串（可选） | `redis://localhost:6379` |
| `JWT_SECRET` | JWT 签名密钥（必须 ≥ 32 字符） | — |
| `JWT_ACCESS_TTL` | 访问令牌有效期 | `15m` |
| `JWT_REFRESH_TTL` | 刷新令牌有效期 | `7d` |
| `API_SERVICE_URL` | 网关转发到业务服务的地址 | `http://localhost:8081` |
| `GITHUB_CLIENT_ID` | GitHub OAuth（可选） | — |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth（可选） | — |
| `GITHUB_CALLBACK_URL` | GitHub 回调 URL（可选） | — |
| `ALLOWED_ORIGINS` | CORS 白名单，逗号分隔 | `*` |
| `LIMIT_FREE` / `LIMIT_PRO` / `LIMIT_ENTERPRISE` | 各套餐每日调用上限，`0` 表示不限 | `100` / `10000` / `0` |