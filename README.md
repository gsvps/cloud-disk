# CloudDisk

**当前版本：v1.2.0** · [更新日志](CHANGELOG.md) · **English:** [README-en.md](README-en.md)

基于 Cloudflare Workers 的轻量级个人网盘，**仅面向 Cloudflare 云端部署**，免费、无需 VPS、无需 MySQL。

> **国内用户说明**  
> 部署或使用 Cloudflare 时，部分功能（如绑定支付方式、升级套餐、开通特定服务等）可能需要账户关联 **Visa 或 Mastercard**。若国内银行卡无法完成验证，可参考作者实测的跨境虚拟卡开通方式：[虚拟信用卡实测与开卡指南](https://www.gsvps.com/articles/tutorials-2)。

## 界面预览

| 登录 / 注册 | 文件列表 |
| :---: | :---: |
| ![登录页](./1.png) | ![文件列表](./2.png) |

| 用户组管理 | 创建分享 |
| :---: | :---: |
| ![用户组管理](./3.png) | ![创建分享](./4.png) |

## 更新说明

### v1.2.0

- 上传进度与大文件分片断点续传
- Toast 操作提示与 API 错误提示
- 页脚 Cloudflare 免费套餐说明、作者官网与交流群链接

### v1.1.0

- 预览/编辑权限优化、预览链接复制、新建文件弹窗
- 管理员设置、用户组、页脚版本号

更多历史版本见 [CHANGELOG.md](CHANGELOG.md)。

## 功能介绍

CloudDisk 适合个人或小团队，在 Cloudflare 免费套餐内搭建私有网盘：数据存于 **R2**，元数据在 **D1**，登录会话在 **KV**，全程 Serverless。

### 文件与目录

- 文件夹层级浏览、新建文件夹 / 新建文件（**任意后缀**，如 `.md`、`.py`、`.json`）
- 上传 / 下载 / 删除 / 重命名，支持拖拽上传与**上传进度显示**
- 大文件（≥ 5MB）**分片上传**，中断后可续传（重新选择相同文件即可）

### 协作与权限

- 多用户注册登录，管理员可开关注册、管理用户与用户组
- 为文件或文件夹添加协作者：**只读**或**可编辑**
- 协作者搜索**用户名自动补全**，「与我共享」独立视图
- 用户组可配置上传、分享、协作、管理权限

### 分享

- 外链分享：可选密码、有效期、下载次数上限
- 支持**文件夹分享**（浏览子目录、预览、下载）
- 可选直链下载、在线预览、访客在线编辑（视文件类型与分享设置）

### 预览与编辑

- 在线预览：图片、PDF、音视频、文本、**Office 文档**（Word / Excel / PPT 等）
- 预览页显示**完整链接**并支持一键复制
- 文本类文件（≤ 2MB）在线编辑；图片等不可编辑类型不显示编辑入口
- 协作者权限与分享权限一致：只读不可编辑，可编辑才显示编辑按钮

### 体验与管理

- 全屏预览 / 编辑，操作结果 **Toast 提示**（成功、失败、API 错误）
- 设置页：修改密码、开放注册、用户 / 用户组管理（管理员）
- 页脚展示 **Cloudflare 免费套餐**相关限额说明（Workers / D1 / R2 / KV）

> **已部署用户升级**：重新部署后需执行 D1 迁移 `npm run db:migrate`（或 Cloudflare Builds 部署命令中已包含）。

## 技术栈

- [Cloudflare Workers](https://developers.cloudflare.com/workers/) + [Hono](https://hono.dev/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)（元数据）+ [R2](https://developers.cloudflare.com/r2/)（文件存储）+ [KV](https://developers.cloudflare.com/kv/)（会话）
- [Drizzle ORM](https://orm.drizzle.team/) + [TypeScript](https://www.typescriptlang.org/) + [Tailwind CSS](https://tailwindcss.com/)

## 一键部署到 Cloudflare

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/gsvps/cloud-disk/tree/main)

> 在「Configure resources」步骤确认：**D1** = `cloud-disk`，**KV** = `cloud-disk`，**R2** = `cloud-disk-files`。**项目名称 / Worker 名称 / `APP_NAME` 默认留空，请按需自行填写**（留空 `APP_NAME` 时界面显示 `CloudDisk`）。

> **若提示「已存在具有该名称的存储库」**
> 一键部署会在你的 GitHub 账号下**新建一个 fork 仓库**。本项目**不再预填项目名称**，请在部署页自行填写 Git 仓库名称（例如 `my-cloud-disk`）。若你已有源码仓库，建议**跳过一键按钮**，改用 Dashboard 连接已有仓库（见下文）。

> **若你已有该源码仓库，想直接部署（不 fork）**  
> 可跳过一键按钮，在 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → 连接 GitHub 仓库 `gsvps/cloud-disk`，按 `wrangler.toml` 配置资源后部署即可。

点击按钮后，Cloudflare 会读取 `wrangler.toml` 并**自动创建** D1、KV、R2。默认命名如下：

| 资源 | 默认名称 | 说明 |
|------|----------|------|
| 项目名称 / Worker 名称 | **留空（需自填）** | 不在仓库中预填；部署页由用户指定 |
| 应用显示名 `APP_NAME` | **留空（可选）** | 留空时界面默认显示 `CloudDisk` |
| D1 | `cloud-disk` | 用户与文件元数据（`wrangler.toml` 指定） |
| KV | `cloud-disk` | 登录会话（与 D1 同名，类型不同不冲突） |
| R2 | `cloud-disk-files` | 上传文件（`wrangler.toml` 指定） |

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
| KV 命名空间 | `cloud-disk` | `package.json` / 部署页默认 |
| R2 存储桶 | `cloud-disk-files` | `wrangler.toml` |

> 说明：D1、KV、R2 默认名称已在仓库中预填；部署页一般保持默认即可。

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

#### 3. 创建 Cloudflare 资源（可选）

D1、KV、R2 可按需预先创建，或使用部署页自动创建：

```bash
npx wrangler d1 create cloud-disk
npx wrangler kv namespace create cloud-disk
npx wrangler r2 bucket create cloud-disk-files
```

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

## 作者与交流

- 作者官网：[https://www.gsvps.com](https://www.gsvps.com)
- Telegram 交流群：[https://t.me/gsvpscom](https://t.me/gsvpscom)

## License

[MIT License](LICENSE)
