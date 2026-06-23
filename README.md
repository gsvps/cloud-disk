# CloudDisk

基于 Cloudflare Workers 的轻量级个人网盘，**仅面向 Cloudflare 云端部署**，免费、无需 VPS、无需 MySQL。

仓库地址：[https://github.com/gsvps/cloud-disk](https://github.com/gsvps/cloud-disk)

## 功能

- 多人协作：用户注册、文件夹/文件协作者（只读 / 可编辑）、**用户名搜索自动补全**、「与我共享」
- 外链分享：分享密码、有效期、下载次数限制、直链、**文件夹分享**
- 在线预览：图片、PDF、音视频、文本、**Office 文档（Word/Excel/PPT 等）**
- 在线编辑：文本类文件（≤ 2MB）
- 文件上传 / 下载 / 删除 / 重命名、文件夹层级浏览、拖拽上传
- Session 登录（KV 存储）

> **已部署用户升级**：重新部署后需执行 D1 迁移 `npm run db:migrate`（或 Cloudflare Builds 部署命令中已包含）。

## 技术栈

- Cloudflare Workers + Hono
- Cloudflare D1（元数据）+ R2（文件存储）+ KV（会话）
- Drizzle ORM + TypeScript + Tailwind CSS

## 一键部署到 Cloudflare

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/gsvps/cloud-disk/tree/main)

> **若部署页仍显示旧名称（如 `cloud-disk-db`）**  
> 部署页会缓存配置。请**关闭旧标签页**，用无痕窗口重新打开上方按钮，或访问：  
> https://deploy.workers.cloudflare.com/?url=https://github.com/gsvps/cloud-disk/tree/main  
> 在「Configure resources」步骤确认：D1 = `cloud-disk`，KV = `cloud-disk`（通常与 Worker 名相同），R2 = `cloud-disk-files`。**项目名称 / Worker 名称 / `APP_NAME` 默认留空，请按需自行填写**（留空 `APP_NAME` 时界面显示 `CloudDisk`）。

> **若提示「已存在具有该名称的存储库」**  
> 一键部署会在你的 GitHub 账号下**新建一个 fork 仓库**。本项目**不再预填项目名称**，请在部署页自行填写 Git 仓库名称（例如 `my-cloud-disk`）。若你已有源码仓库，建议**跳过一键按钮**，改用 Dashboard 连接已有仓库（见下文）。

> **若你已有该源码仓库，想直接部署（不 fork）**  
> 可跳过一键按钮，在 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → 连接 GitHub 仓库 `gsvps/cloud-disk`，按 `wrangler.toml` 配置资源后部署即可。

点击按钮后，Cloudflare 会读取 `wrangler.toml` 并**自动创建** D1、KV、R2 资源。默认命名如下（KV 与 R2 不可同名，已做区分）：

| 资源 | 默认名称 | 说明 |
|------|----------|------|
| 项目名称 / Worker 名称 | **留空（需自填）** | 不在仓库中预填；部署页由用户指定 |
| 应用显示名 `APP_NAME` | **留空（可选）** | 留空时界面默认显示 `CloudDisk` |
| D1 | `cloud-disk` | 用户与文件元数据 |
| KV | `cloud-disk` | 登录会话（与 D1 同名，资源类型不同） |
| R2 | `cloud-disk-files` | 上传的文件内容（须与 KV 区分） |

部署完成后访问 Workers 域名，首次打开会引导创建管理员账号。

### 高级设置默认值

点击一键部署后，展开「高级设置」时，以下参数会**自动预填**，一般无需修改：

| 参数 | 默认值 | 来源 |
|------|--------|------|
| 项目名称 / Worker 名称 | **留空** | 由用户在部署页填写 |
| 应用显示名 `APP_NAME` | **留空** | 可选；未设置时应用内为 `CloudDisk` |
| 构建命令 | `npm run build` | `package.json` → `scripts.build` |
| 部署命令 | `npm run deploy` | `package.json` → `scripts.deploy` |
| 预览部署命令 | `npx wrangler versions upload` | Cloudflare 平台默认 |
| Node.js 版本 | `22` | `.nvmrc` / `engines.node` |
| 生产分支 | `main` | 仓库默认分支 |
| D1 数据库 | `cloud-disk` | `wrangler.toml` |
| KV 命名空间 | `cloud-disk` | 部署页默认与 Worker 名相同 |
| R2 存储桶 | `cloud-disk-files` | `wrangler.toml` |

> 说明：D1 与 KV 均使用 `cloud-disk`（不同类型资源可同名）；R2 使用 `cloud-disk-files`，避免与 KV 冲突。

#### 高级设置里其他字段要不要管？

| 字段 | 是否需要理会 | 说明 |
|------|-------------|------|
| **非生产分支部署命令** | 一般不用 | 默认 `npx wrangler versions upload`，仅在你用非 `main` 分支做预览部署时才需要 |
| **路径（根目录）** | 留空即可 | 本项目不是 monorepo，根目录就是仓库根 |
| **API 令牌** | 一键部署不用填 | 点按钮时 Cloudflare 会引导授权；仅本地 `wrangler` CLI 需要登录 |
| **变量名称 / 变量值** | `APP_NAME` 可留空 | 无密钥类变量；`APP_NAME` 留空即可 |

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
npx wrangler d1 create cloud-disk
npx wrangler kv namespace create cloud-disk
npx wrangler r2 bucket create cloud-disk-files
```

> 注意：D1 与 KV 可同为 `cloud-disk`；R2 须使用 `cloud-disk-files`，避免与 KV 同名。

#### 4. 构建并部署

```bash
npm run build
npm run db:migrate
npx wrangler deploy --name cloud-disk
```

> 仓库未预填 Worker 名称时，本地部署需通过 `--name` 指定（名称需与 Cloudflare Dashboard 中 Worker 一致）。

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
| POST | `/api/auth/register` | 注册新用户 |
| POST | `/api/auth/logout` | 退出 |
| GET | `/api/user/me` | 当前用户 |
| GET | `/api/user/search?q=` | 搜索用户（协作） |
| GET | `/api/files?scope=mine\|shared` | 文件列表 |
| GET | `/api/files/:id/preview` | 在线预览 |
| GET | `/api/files/:id/content` | 读取文本内容 |
| PUT | `/api/files/:id/content` | 保存文本内容 |
| POST | `/api/files/:id/collaborators` | 添加协作者 |
| GET | `/api/shares` | 我的分享列表 |
| POST | `/api/shares` | 创建分享链接 |
| GET | `/api/share/:token` | 分享页信息（公开） |
| GET | `/api/share/:token/download` | 分享下载（公开） |
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
