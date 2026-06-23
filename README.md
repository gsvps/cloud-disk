# CloudDisk

基于 Cloudflare Workers 的轻量级个人网盘，**仅面向 Cloudflare 云端部署**，免费、无需 VPS、无需 MySQL。

仓库地址：[https://github.com/gsvps/cloud-disk](https://github.com/gsvps/cloud-disk)

## 功能

- 首次访问自动引导创建管理员账号
- 文件上传 / 下载 / 删除 / 重命名
- 文件夹创建与层级浏览
- 拖拽上传
- Session 登录（KV 存储）

## 技术栈

- Cloudflare Workers + Hono
- Cloudflare D1（元数据）+ R2（文件存储）+ KV（会话）
- Drizzle ORM + TypeScript + Tailwind CSS

## 一键部署到 Cloudflare

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/gsvps/cloud-disk)

点击按钮后，Cloudflare 会读取 `wrangler.toml` 并**自动创建** D1、KV、R2 资源。默认命名如下（KV 与 R2 不可同名，已做区分）：

| 资源 | 默认名称 | 说明 |
|------|----------|------|
| Worker | `cloud-disk` | 应用本身 |
| D1 | `cloud-disk-db` | 用户与文件元数据 |
| KV | `cloud-disk-KV` | 登录会话（由 Worker 名 + binding 生成） |
| R2 | `cloud-disk-files` | 上传的文件内容 |

部署完成后访问 Workers 域名，首次打开会引导创建管理员账号。

### 高级设置默认值

点击一键部署后，展开「高级设置」时，以下参数会**自动预填**，一般无需修改：

| 参数 | 默认值 | 来源 |
|------|--------|------|
| Worker 名称 | `cloud-disk` | `wrangler.toml` |
| 构建命令 | `npm run build` | `package.json` → `scripts.build` |
| 部署命令 | `npm run deploy` | `package.json` → `scripts.deploy` |
| 预览部署命令 | `npx wrangler versions upload` | Cloudflare 平台默认 |
| Node.js 版本 | `22` | `.nvmrc` / `engines.node` |
| 生产分支 | `main` | 仓库默认分支 |
| D1 数据库 | `cloud-disk-db` | `wrangler.toml` |
| KV 命名空间 | `cloud-disk-KV` | Worker 名 + binding |
| R2 存储桶 | `cloud-disk-files` | `wrangler.toml` |
| 环境变量 `APP_NAME` | `CloudDisk` | `wrangler.toml` → `[vars]` |

> 说明：KV 与 R2 不能使用相同名称，因此 R2 默认为 `cloud-disk-files`，KV 默认为 `cloud-disk-KV`。

#### 高级设置里其他字段要不要管？

| 字段 | 是否需要理会 | 说明 |
|------|-------------|------|
| **非生产分支部署命令** | 一般不用 | 默认 `npx wrangler versions upload`，仅在你用非 `main` 分支做预览部署时才需要 |
| **路径（根目录）** | 留空即可 | 本项目不是 monorepo，根目录就是仓库根 |
| **API 令牌** | 一键部署不用填 | 点按钮时 Cloudflare 会引导授权；仅本地 `wrangler` CLI 需要登录 |
| **变量名称 / 变量值** | 保持默认 | 已有 `APP_NAME = CloudDisk`，无需修改；没有密钥类变量需要填写 |

### 手动部署步骤

#### 1. Fork 并克隆仓库

```bash
git clone https://github.com/gsvps/cloud-disk.git
cd cloud-disk
npm install
```

#### 2. 登录 Cloudflare

```bash
npx wrangler login
```

#### 3. 创建 Cloudflare 资源（可选，也可由 wrangler deploy 自动创建）

```bash
npx wrangler d1 create cloud-disk-db
npx wrangler kv namespace create cloud-disk-KV
npx wrangler r2 bucket create cloud-disk-files
```

> 注意：KV 命名空间与 R2 存储桶**不能使用相同名称**，因此分别命名为 `cloud-disk-KV` 与 `cloud-disk-files`。

#### 4. 构建并部署

```bash
npm run deploy:cloudflare
```

该命令会依次：构建 CSS → 执行 D1 远程迁移 → 部署 Worker。

## API 规范

所有接口返回统一 JSON 格式：

```json
{ "success": true, "data": {} }
```

```json
{ "success": false, "error": { "code": "BAD_REQUEST", "message": "..." } }
```

### 主要接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/auth/setup-status` | 是否需要初始化 |
| POST | `/api/auth/setup` | 首次创建管理员 |
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/logout` | 退出 |
| GET | `/api/user/me` | 当前用户 |
| GET | `/api/files` | 文件列表 |
| POST | `/api/files/folders` | 创建文件夹 |
| POST | `/api/files/upload` | 上传文件 |
| GET | `/api/files/:id/download` | 下载文件 |
| PATCH | `/api/files/:id` | 重命名/移动 |
| DELETE | `/api/files/:id` | 删除 |

## 目录结构

```
cloud-disk/
├── src/
│   ├── index.ts          # 入口
│   ├── db/               # Drizzle schema
│   ├── routes/           # API 路由
│   ├── middleware/       # 认证中间件
│   └── lib/              # 工具函数
├── public/               # 前端静态资源
├── migrations/           # D1 迁移
└── wrangler.toml
```

## License

MIT
