# 更新日志

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.2.0] - 2025-06-23

### 新增

- 上传进度显示；大文件（≥ 5MB）分片上传与断点续传
- 操作 Toast 提示（API 错误、上传成功/失败、保存等）
- 页脚 Cloudflare 免费套餐限额说明（可展开）
- 页脚作者官网与交流群链接

### 改进

- 全局 API 与上传错误处理
- README 功能介绍、技术栈官方文档链接

## [1.1.0] - 2025-06

### 新增

- 条件显示编辑入口（协作者只读/可编辑）
- 预览页完整链接显示与复制
- 新建文件夹/文件 UI 弹窗；新建文件支持任意后缀
- 底部作者官网、GitHub 文档链接与版本号显示

### 改进

- 一键部署 KV 默认名称 `cloud-disk`
- 设置页：开放注册、用户与用户组管理

## [1.0.0] - 2025-06

### 新增

- 多人协作、外链分享、在线预览与编辑
- 文件夹分享、Office 文档预览、协作者搜索补全
- Cloudflare Workers + D1 + R2 + KV 一键部署

[1.2.0]: https://github.com/gsvps/cloud-disk/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/gsvps/cloud-disk/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/gsvps/cloud-disk/releases/tag/v1.0.0
