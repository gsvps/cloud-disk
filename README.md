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

#### 3. 创建 Cloudflare 资源

```bash
# 创建 D1 数据库
npx wrangler d1 create clouddisk-db

# 创建 KV 命名空间
npx wrangler kv namespace create KV

# 创建 R2 存储桶
npx wrangler r2 bucket create clouddisk-files
```

将上述命令输出的 `database_id`、`id` 填入 `wrangler.toml` 对应位置。

#### 4. 构建并部署

```bash
npm run deploy:cloudflare
```

该命令会依次：构建 CSS → 执行 D1 远程迁移 → 部署 Worker。

#### 5. 访问应用

部署完成后，终端会输出 Workers 访问地址（形如 `https://clouddisk.<账号>.workers.dev`）。  
首次打开页面会引导创建管理员账号。

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
