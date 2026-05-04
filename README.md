# NewAPI TestOps

NewAPI TestOps 是一个前后端分离的 NewAPI 测试与状态观测平台 MVP。它把原本偏脚本化的测试能力做成了网页控制台和 HTTP API，支持 synthetic 模拟测试、live 真实请求测试、并发压测语义、请求/响应留存、报告 artifact、relayAPI 风格评分、最小调度/抽测，以及 Docker / 静态托管 / VPS 等多种部署方式。

项目地址：<https://github.com/xingxinag/newapi-testops>

## 你可以用它做什么

- 测试一个 NewAPI 兼容接口是否能正常返回。
- 发起 live 真实 HTTP POST 请求，检查状态码、响应体、模型名、延迟和 token 汇总。
- 按 `concurrency * durationSeconds` 执行多请求测试，例如并发 3、持续 2 秒会发 6 次请求。
- 保存 `request.json`、`response.json`、`report.json`，方便复盘请求体、响应体和评分报告。
- 在网页里创建测试任务、查看历史、打开 artifact。
- 创建最小调度/抽测配置，创建后立即跑一次样本任务，并保留调度历史。
- 使用 Docker Compose 一键自托管，或把前端部署到 Vercel / Cloudflare Pages / GitHub Pages，把 API 单独部署到 VPS / Docker。

## 当前能力状态

| 能力 | 状态 |
| --- | --- |
| 静态前端控制台 | 已完成 |
| Node.js API 服务 | 已完成 |
| synthetic 模拟测试 | 已完成 |
| live 真实请求测试 | 已完成 |
| live 并发多请求汇总 | 已完成 |
| 请求/响应/report artifact 留存 | 已完成 |
| artifact API 读取 | 已完成 |
| 最小调度/抽测 | 已完成 |
| CORS 预检支持 | 已完成 |
| Docker Compose 自托管 | 已完成 |
| Docker Hub 镜像 | 已发布 |
| R2/S3 真正上传适配器 | 后续增强 |
| 后台 cron worker | 后续增强 |
| 权限/登录系统 | 后续增强 |

## 项目结构

```text
newapi-testops/
  apps/
    api/                 # Node.js API，负责测试执行、任务历史、artifact 存储
    web/                 # 静态前端，无框架，直接部署即可
  packages/
    contracts/           # 前后端共享的输入校验、评分、脱敏逻辑
  scripts/
    build.mjs            # 构建静态前端到 dist/web
  docs/
    deployment.md        # 部署矩阵和设计说明
  deploy/
    nginx.conf           # Docker Web 镜像的 Nginx 配置
  Dockerfile.api         # API 镜像
  Dockerfile.web         # 静态 Web 镜像
  compose.yaml           # Docker Compose 一键部署
```

## 本地开发：从零开始运行

### 1. 安装依赖

这个项目目前没有第三方 npm 依赖，使用 Node.js 内置能力即可。建议 Node.js 版本 20+，当前开发验证环境使用 Node 25。

```bash
node --version
npm --version
```

### 2. 克隆项目

```bash
git clone https://github.com/xingxinag/newapi-testops.git
cd newapi-testops
```

### 3. 跑测试

```bash
npm test
```

期望看到类似：

```text
tests 10
pass 10
fail 0
```

### 4. 构建静态前端

```bash
npm run build
```

构建产物会生成到：

```text
dist/web
```

### 5. 启动 API

```bash
npm run start:api
```

默认 API 地址：

```text
http://127.0.0.1:8788
```

### 6. 另开一个终端启动前端

```bash
npm run start:web
```

默认 Web 地址：

```text
http://127.0.0.1:4178
```

打开浏览器访问 `http://127.0.0.1:4178`，就可以创建测试任务、查看历史、创建调度、打开 artifact。

## 环境变量说明

可以参考 `.env.example`：

```env
API_HOST=127.0.0.1
API_PORT=8788
WEB_HOST=127.0.0.1
WEB_PORT=4178
PUBLIC_API_BASE_URL=http://127.0.0.1:8788
DATA_DIR=./data
AUTH_REQUIRED=false
ARTIFACT_STORAGE_DRIVER=local
ARTIFACT_LOCAL_DIR=./data/artifacts
S3_ENDPOINT=
S3_REGION=auto
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
```

当前 MVP 使用本地文件存储：

- 任务历史：`data/jobs.json`
- 调度历史：`data/schedules.json`
- 可选登录/团队数据：`data/users.json`、`data/sessions.json`、`data/teams.json`、`data/memberships.json`
- artifact：`data/artifacts/<runId>/request.json` 等

默认 `AUTH_REQUIRED=false`，本地 API 保持开放。设置 `AUTH_REQUIRED=true` 后，`jobs`、`schedules`、`artifacts`、`exports`、`analytics` 需要先通过 `/api/auth/register` 或 `/api/auth/login` 获取 HttpOnly `SameSite=Lax` 会话 Cookie；可用 `/api/auth/me` 查看当前用户，`/api/auth/logout` 注销。团队共享使用 `POST /api/teams` 创建团队，再用 `POST /api/teams/<teamId>/members` 按邮箱添加已注册用户。

`S3_*` 变量是为后续 R2/S3 适配预留的，当前版本不会真正上传到对象存储。

如果要启用 Cloudflare R2 / S3-compatible artifact 存储，把 `ARTIFACT_STORAGE_DRIVER` 改成 `s3`，并填写：

```env
ARTIFACT_STORAGE_DRIVER=s3
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=your-bucket
S3_ACCESS_KEY_ID=your-access-key-id
S3_SECRET_ACCESS_KEY=your-secret-access-key
```

启用后，任务元数据仍保存在本地 `DATA_DIR`，但 `request.json`、`response.json`、`report.json` 会写入 S3/R2，并继续通过 `GET /api/jobs/:runId/artifacts/:name` 读取。

## API 使用示例

### 健康检查

```bash
curl http://127.0.0.1:8788/api/health
```

返回示例：

```json
{
  "success": true,
  "service": "newapi-testops-api"
}
```

### 创建 synthetic 测试任务

synthetic 模式不会真的请求上游 API，适合本地安全验证。

```bash
curl -X POST http://127.0.0.1:8788/api/jobs \
  -H "content-type: application/json" \
  -d '{"baseUrl":"https://api.example.com","apiKey":"demo-secret","model":"demo-model","mode":"text","concurrency":2,"durationSeconds":2}'
```

### 创建 live 真实测试任务

live 模式会真的向 `baseUrl + endpoint` 发送 HTTP POST。请确认 API Key 和目标地址正确。

```bash
curl -X POST http://127.0.0.1:8788/api/jobs \
  -H "content-type: application/json" \
  -d '{"baseUrl":"https://your-newapi.example.com","apiKey":"your-secret","model":"gpt-4o-mini","mode":"text","executionMode":"live","concurrency":3,"durationSeconds":2,"retainFullBodies":true}'
```

这里会发送 `3 * 2 = 6` 次请求。

### 查看任务列表

```bash
curl http://127.0.0.1:8788/api/jobs
```

### 读取 artifact

把 `<runId>` 换成任务返回的 runId。

```bash
curl http://127.0.0.1:8788/api/jobs/<runId>/artifacts/request.json
curl http://127.0.0.1:8788/api/jobs/<runId>/artifacts/response.json
curl http://127.0.0.1:8788/api/jobs/<runId>/artifacts/report.json
```

### 创建最小调度/抽测

当前调度是 MVP 语义：创建调度时会立即跑一次样本任务，并记录到调度历史。它还不是后台常驻 cron worker。

```bash
curl -X POST http://127.0.0.1:8788/api/schedules \
  -H "content-type: application/json" \
  -d '{"name":"hourly sample","intervalSeconds":3600,"input":{"baseUrl":"https://api.example.com","apiKey":"demo-secret","model":"demo-model","mode":"text","concurrency":1,"durationSeconds":1}}'
```

查看调度：

```bash
curl http://127.0.0.1:8788/api/schedules
```

## Docker Hub 镜像

已经发布到 Docker Hub：

- API 镜像：`xing025/newapi-testops-api:latest`
- Web 镜像：`xing025/newapi-testops-web:latest`

### 单独运行 API 镜像

```bash
docker run --rm -p 8788:8788 \
  -e API_HOST=0.0.0.0 \
  -e API_PORT=8788 \
  -e DATA_DIR=/data \
  -e ARTIFACT_LOCAL_DIR=/data/artifacts \
  -v newapi-testops-data:/data \
  xing025/newapi-testops-api:latest
```

访问：

```text
http://127.0.0.1:8788/api/health
```

### 单独运行 Web 镜像

```bash
docker run --rm -p 4178:80 xing025/newapi-testops-web:latest
```

访问：

```text
http://127.0.0.1:4178
```

注意：已发布的 Web 镜像默认请求 `http://127.0.0.1:8788` 作为 API 地址。如果你要把 Web 和 API 部署在不同域名，建议使用“静态前端 + 远程 API”的方式，或者重新构建 Web 镜像并注入自己的 API 地址。

## 部署方式一：Docker Compose 一键自托管

适合 VPS、家用服务器、NAS、Docker Desktop。

```bash
git clone https://github.com/xingxinag/newapi-testops.git
cd newapi-testops
npm run build
docker compose up --build -d
```

启动后访问：

```text
API: http://127.0.0.1:8788
Web: http://127.0.0.1:4178
```

查看容器：

```bash
docker compose ps
```

停止：

```bash
docker compose down
```

如果想连数据卷也删掉：

```bash
docker compose down -v
```

数据默认保存在 Docker volume：

```text
newapi-testops-data
```

## 部署方式二：Docker Hub 镜像 + 自己写 compose

如果不想从源码构建，可以新建一个 `compose.yaml`：

```yaml
services:
  api:
    image: xing025/newapi-testops-api:latest
    environment:
      API_HOST: 0.0.0.0
      API_PORT: 8788
      DATA_DIR: /data
      ARTIFACT_LOCAL_DIR: /data/artifacts
    ports:
      - "8788:8788"
    volumes:
      - newapi-testops-data:/data

  web:
    image: xing025/newapi-testops-web:latest
    ports:
      - "4178:80"
    depends_on:
      - api

volumes:
  newapi-testops-data:
```

启动：

```bash
docker compose up -d
```

## 部署方式三：VPS Node API + 静态 Web

适合你想直接用 Node 跑，不想用 Docker。

```bash
git clone https://github.com/xingxinag/newapi-testops.git
cd newapi-testops
npm test
npm run build
```

启动 API：

```bash
API_HOST=0.0.0.0 API_PORT=8788 DATA_DIR=./data ARTIFACT_LOCAL_DIR=./data/artifacts npm run start:api
```

启动 Web：

```bash
WEB_HOST=0.0.0.0 WEB_PORT=4178 npm run start:web
```

生产环境建议用 Nginx / Caddy 反代：

- `https://your-domain.com` -> Web 服务 `4178`
- `https://api.your-domain.com` -> API 服务 `8788`

## 部署方式四：Vercel / Cloudflare Pages / GitHub Pages 静态前端 + 远程 API

前端是纯静态文件，可以部署到任意静态托管平台；API 仍需单独部署到 VPS、Docker、Railway、Render、Fly.io 等支持 Node 或 Docker 的平台。

本项目已经提供真实可用的静态托管配置：

- Vercel：`vercel.json`，构建命令 `npm run build`，输出目录 `dist/web`。
- Cloudflare Pages：`wrangler.toml`，`pages_build_output_dir = "dist/web"`。
- GitHub Pages：`.github/workflows/pages.yml`，自动构建并发布 `dist/web`。

本地构建：

```bash
npm run build
```

把这个目录发布出去：

```text
dist/web
```

### 配置远程 API 地址

静态前端默认请求 `http://127.0.0.1:8788`。部署到 Vercel / Cloudflare Pages / GitHub Pages 时，通常需要把 API 地址改成你的公网 API 域名。

构建时设置环境变量：

```bash
NEWAPI_TESTOPS_API=https://api.your-domain.com npm run build
```

构建脚本会生成：

```text
dist/web/config.js
```

内容类似：

```js
window.__NEWAPI_TESTOPS_API__ = "https://api.your-domain.com";
```

各平台配置建议：

- Vercel：Project Settings -> Environment Variables 添加 `NEWAPI_TESTOPS_API`。
- Cloudflare Pages：Settings -> Environment variables 添加 `NEWAPI_TESTOPS_API`，Build command 填 `npm run build`。
- GitHub Pages：Repository Settings -> Secrets and variables -> Actions -> Variables 添加 `NEWAPI_TESTOPS_API`。

## 部署方式五：GitHub Pages 展示模式

GitHub Pages 只能托管静态前端，不能运行 API。

推荐组合：

1. GitHub Pages 通过 `.github/workflows/pages.yml` 自动部署 `dist/web`。
2. API 用 Docker 部署到 VPS。
3. 在仓库 Actions Variables 里设置 `NEWAPI_TESTOPS_API=https://api.your-domain.com`。

这种方式适合低成本展示和查看测试历史，但真正执行测试仍然依赖后端 API。

## live 模式注意事项

live 模式会真实请求你的目标 API：

- `apiKey` 会作为 `Authorization: Bearer <apiKey>` 发送给上游。
- 持久化记录里会脱敏，显示为 `[redacted]` 或掩码。
- `concurrency` 最大 200，`durationSeconds` 最大 3600。
- 当前执行语义是总请求数等于 `concurrency * durationSeconds`，不是严格持续 N 秒的压测循环。

## 常见问题排查

### 1. 前端打不开 API

检查 API 是否启动：

```bash
curl http://127.0.0.1:8788/api/health
```

如果返回不了，先启动 API。

### 2. 浏览器提示 CORS

API 已支持 CORS 预检。确认你访问的是当前 API 服务，而不是旧进程占用了端口。

Windows 可检查端口：

```powershell
netstat -ano | findstr 8788
```

### 3. Docker Web 能打开，但创建任务失败

确认 API 容器也在运行：

```bash
docker compose ps
```

再检查 API：

```bash
curl http://127.0.0.1:8788/api/health
```

### 4. 修改代码后 Docker Web 没变化

需要先重新构建静态前端，再重建镜像：

```bash
npm run build
docker compose build web
docker compose up -d
```

### 5. 不想保留本地测试数据

源码运行时删除：

```bash
rm -rf data
```

Docker Compose 运行时删除 volume：

```bash
docker compose down -v
```

## 开发与验证命令

每次改动后建议至少跑：

```bash
npm test
npm run build
```

Docker 验证：

```bash
docker compose build
docker compose up -d
curl http://127.0.0.1:8788/api/health
curl http://127.0.0.1:4178
docker compose down
```

## 已验证结果

当前版本已验证：

- `npm test`：10/10 pass
- `npm run build`：成功生成 `dist/web`
- `docker compose build`：API/Web 镜像构建成功
- `docker compose up -d`：API/Web 容器启动成功
- Docker 栈内创建 job：`201 Created`
- Docker 栈内读取 artifact：授权头已脱敏为 `[redacted]`
- Docker Hub 已推送：`xing025/newapi-testops-api:latest`、`xing025/newapi-testops-web:latest`

## 后续增强方向

- 接入 Cloudflare R2 / S3，把 artifact 上传到对象存储。
- 增加真正后台 scheduler/cron worker。
- 增加更丰富的趋势图、成功率图、延迟分位图。
- 增加登录、权限、团队共享。
- 增加导出 ZIP/CSV/HTML 报告。

