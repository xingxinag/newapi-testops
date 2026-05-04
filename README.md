# NewAPI TestOps

NewAPI TestOps 是一个面向 NewAPI 兼容接口的测试与状态观测平台。它把脚本化测试做成了网页控制台和 HTTP API，可以发起 synthetic 模拟测试、live 真实请求测试、并发测试、请求和响应留存、报告 artifact、relayAPI 风格评分，以及调度抽测。

项目地址：<https://github.com/xingxinag/newapi-testops>

这份 README 按新手教程写。你可以照着一步一步部署，也可以用它排查“网页显示已连接，但为什么任务还是失败”的问题。

## 先看懂这个项目

NewAPI TestOps 分成两个服务：

| 服务 | 默认地址 | 作用 |
| --- | --- | --- |
| Web 前端控制台 | `http://127.0.0.1:4178` | 浏览器打开的页面，用来填写 NewAPI 地址、API Key、模型名，创建任务，看历史和 artifact。 |
| API 后端服务 | `http://127.0.0.1:8788` | 真正执行测试、保存任务、保存 artifact、提供 `/api/health` 和 `/api/jobs` 等接口。 |

请注意：后端 API 本身没有网页 UI。你直接打开 `http://127.0.0.1:8788` 可能看不到漂亮页面，这是正常的。网页控制台是另一个服务，它默认运行在 `http://127.0.0.1:4178`。

## 页面里的“已连接”到底是真是假

页面顶部可能会看到类似信息：

```text
已连接
http://127.0.0.1:8788
服务：newapi-testops-api
```

这段信息的含义很重要：

1. 它是真的，但只代表浏览器成功访问了 `http://127.0.0.1:8788/api/health`。
2. 它说明 Web 前端和 NewAPI TestOps 后端 API 可以通信。
3. 它不代表你的目标 NewAPI 地址 `baseUrl` 是对的。
4. 它不代表你填的目标 NewAPI API Key 是对的。
5. 它不代表目标模型名一定存在。

后端健康检查接口返回类似：

```json
{
  "success": true,
  "service": "newapi-testops-api"
}
```

所以，页面显示“已连接 / 服务：newapi-testops-api”的完整判断链路是：

1. 浏览器打开 Web 页面。
2. Web 页面读取 API 地址。
3. Web 页面请求 `API 地址 + /api/health`。
4. 浏览器收到 `success: true` 和 `service: newapi-testops-api`。
5. 页面显示“已连接”。

如果你创建 live 测试任务失败，排查时要分清两件事：

| 你看到的现象 | 说明 |
| --- | --- |
| 页面显示“已连接” | 前端能连上 NewAPI TestOps 后端。 |
| live 任务返回 401、403、404、模型不存在、上游超时 | NewAPI TestOps 后端已经在工作，但它访问你的目标 NewAPI 服务失败。 |

简单说，页面“已连接”验证的是 NewAPI TestOps 自己的后端，不是验证你填进去的 NewAPI 上游账号。

## 127.0.0.1 是什么意思

`127.0.0.1` 也叫 localhost，意思是“当前这台机器自己”。关键点是：它从谁的视角看，就代表谁自己。

### 本地电脑运行

如果你在自己的电脑上运行：

```text
Web: http://127.0.0.1:4178
API: http://127.0.0.1:8788
```

这时浏览器也在你的电脑上，API 也在你的电脑上，所以浏览器访问 `127.0.0.1:8788` 能找到本机 API。

### VPS 服务器运行，浏览器在你电脑上

假设 API 跑在 VPS 上：

```text
VPS API: http://127.0.0.1:8788
```

如果你在自己电脑的浏览器里打开一个远程前端页面，而这个前端页面配置的 API 还是 `http://127.0.0.1:8788`，浏览器会去访问你自己电脑的 `8788` 端口，不会访问 VPS。

这时正确配置应该是 VPS 的公网 API 地址，例如：

```text
https://api.your-domain.com
```

或者临时测试：

```text
http://<你的 VPS 公网 IP>:8788
```

### Docker 容器里的 127.0.0.1

容器里的 `127.0.0.1` 是容器自己，不是宿主机，也不是另一个容器。Docker Compose 里给浏览器看的地址仍然要从浏览器视角判断。

默认 compose 把 API 映射到宿主机 `8788`，把 Web 映射到宿主机 `4178`：

```text
宿主机 http://127.0.0.1:8788 访问 API 容器
宿主机 http://127.0.0.1:4178 访问 Web 容器
```

如果浏览器就在这台宿主机上，默认地址可用。如果浏览器在另一台电脑上，你要用宿主机的局域网 IP 或域名。

## 如何独立验证 API 是否真的可用

不要只看页面文字。排查连接问题时，请用下面三种方式确认。

### 方法一：用 curl 验证健康检查

在能访问 API 的机器上运行：

```bash
curl http://127.0.0.1:8788/api/health
```

看到下面结果，才说明这个地址上的 NewAPI TestOps 后端正在工作：

```json
{"success":true,"service":"newapi-testops-api"}
```

如果 API 部署在服务器上，要把地址换成服务器地址：

```bash
curl https://api.your-domain.com/api/health
```

### 方法二：用浏览器直接打开健康检查

在浏览器地址栏打开：

```text
http://127.0.0.1:8788/api/health
```

如果浏览器显示 JSON，说明浏览器能连到 API。如果打不开，Web 页面也一定连不上这个地址。

### 方法三：用浏览器开发者工具看 Network

1. 打开 Web 页面。
2. 按 `F12` 打开开发者工具。
3. 切到 `Network`。
4. 刷新页面。
5. 找 `/api/health` 请求。
6. 看 Request URL 是不是你期望的 API 地址。
7. 看状态码是不是 `200`。
8. 看 Response 里有没有 `success: true` 和 `service: newapi-testops-api`。

如果 `/api/health` 请求发到了 `http://127.0.0.1:8788`，但你的 API 实际在 VPS 上，那就是前端 API 地址配置错了。

## 你可以用它做什么

- 测试一个 NewAPI 兼容接口是否能正常返回。
- 发起 live 真实 HTTP POST 请求，检查状态码、响应体、模型名、延迟和 token 汇总。
- 按 `concurrency * durationSeconds` 执行多请求测试，例如并发 3、持续 2 秒会发 6 次请求。
- 保存 `request.json`、`response.json`、`report.json`，方便复盘请求体、响应体和评分报告。
- 在网页里创建测试任务、查看历史、打开 artifact。
- 创建调度抽测配置，并保留调度历史。
- 用本地 Node、Docker Compose、Docker Hub 镜像、VPS、静态前端加远程 API 等方式部署。

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
| 账号注册/登录 | 已完成 |
| 团队创建/成员共享 | 已完成 |
| R2/S3 artifact 存储配置 | 已支持配置 |

## 项目结构

```text
newapi-testops/
  apps/
    api/                 # Node.js API，负责测试执行、任务历史、artifact 存储
    web/                 # 静态前端，无框架，可以直接部署
  packages/
    contracts/           # 前后端共享的输入校验、评分、脱敏逻辑
  scripts/
    build.mjs            # 构建静态前端到 dist/web，并生成 config.js
  docs/
    deployment.md        # 部署矩阵和设计说明
  deploy/
    nginx.conf           # Docker Web 镜像的 Nginx 配置
  Dockerfile.api         # API 镜像
  Dockerfile.web         # 静态 Web 镜像
  compose.yaml           # Docker Compose 一键部署
```

## 页面展示

![NewAPI TestOps 页面截图](https://a1.ax1x.com/2026/05/04/bvH9.jpg)

## 本地 Node 部署教程

适合第一次学习，也适合开发调试。你需要先安装 Node.js，建议 Node.js 20 或更新版本。

### 1. 克隆项目

```bash
git clone https://github.com/xingxinag/newapi-testops.git
cd newapi-testops
```

### 2. 安装依赖

```bash
npm install
```

### 3. 跑测试

```bash
npm test
```

期望看到类似结果：

```text
tests 37
pass 37
fail 0
```

### 4. 启动 API 后端

打开第一个终端：

```bash
npm run start:api
```

默认 API 地址：

```text
http://127.0.0.1:8788
```

验证 API：

```bash
curl http://127.0.0.1:8788/api/health
```

### 5. 启动 Web 前端

打开第二个终端：

```bash
npm run start:web
```

默认 Web 地址：

```text
http://127.0.0.1:4178
```

浏览器打开 `http://127.0.0.1:4178`。

### 6. 创建一个 synthetic 测试任务

synthetic 模式不会真的请求上游 API，适合先验证平台流程。

在页面里填写：

| 字段 | 示例 |
| --- | --- |
| Base URL | `https://api.example.com` |
| API Key | `demo-secret` |
| Model | `demo-model` |
| Execution Mode | `synthetic` |
| Concurrency | `1` |
| Duration Seconds | `1` |

创建成功后，你应该能看到任务历史和 artifact。

### 7. 创建一个 live 测试任务

live 模式会真的请求你的目标 NewAPI 服务。请确认你填的是自己的合法服务地址、API Key 和模型名。

不要把真实 API Key 写进 README、issue、截图、Git 提交或公开日志。页面输入框里填写即可。

## 环境变量说明

可以先复制 `.env.example`，再按部署方式修改。下面的表包含 `.env.example` 里的全部变量，也包含构建静态前端时使用的 `NEWAPI_TESTOPS_API`。

| 变量 | 默认/示例 | 用在 | 什么时候改 | 说明/注意 |
| --- | --- | --- | --- | --- |
| `API_HOST` | `127.0.0.1` | API 服务 | 需要让 Docker、局域网或公网反代访问 API 时改成 `0.0.0.0`。 | `127.0.0.1` 只代表当前机器自己。从浏览器、宿主机、容器里看，含义都不同。 |
| `API_PORT` | `8788` | API 服务 | 默认端口被占用，或反代、平台要求其他端口时修改。 | 健康检查地址是 `http://<API_HOST>:<API_PORT>/api/health`。 |
| `WEB_HOST` | `127.0.0.1` | Node 开发 Web 服务 | 需要让局域网或服务器外部访问 `npm run start:web` 时改成 `0.0.0.0`。 | 只影响开发 Web 服务监听地址，不影响静态 `dist/web` 里写入的 API 地址。 |
| `WEB_PORT` | `4178` | Node 开发 Web 服务 | 默认端口被占用，或想换 Web 访问端口时修改。 | 默认页面地址是 `http://127.0.0.1:4178`。 |
| `PUBLIC_API_BASE_URL` | `http://127.0.0.1:8788` | 开发 Web 配置 | 开发模式下想让前端请求远程 API 时修改。 | 静态部署优先看 `dist/web/config.js`，构建时请设置 `NEWAPI_TESTOPS_API`。 |
| `DATA_DIR` | `./data` | API 服务、worker | 想把任务、账号、会话、团队等 JSON 数据放到其他目录时修改。 | Docker 里常设为 `/data`，并挂载 volume 持久化。 |
| `AUTH_REQUIRED` | `false` | API 服务 | 需要登录后才能访问 jobs、schedules、artifacts、exports、analytics 等接口时设为 `true`。 | 开启后要先通过 `/api/auth/register` 或 `/api/auth/login` 获取 `sid` Cookie。 |
| `SESSION_COOKIE_SAMESITE` | `Lax` | API 服务 | 前端和 API 是不同站点，且开启登录 Cookie 时设为 `None`。 | 跨站 Cookie 需要 `SameSite=None; Secure`，所以还要设置 `SESSION_COOKIE_SECURE=true`。 |
| `SESSION_COOKIE_SECURE` | `false` | API 服务 | HTTPS 跨站登录，或生产环境只允许 HTTPS Cookie 时设为 `true`。 | 设为 `true` 后，浏览器只会在 HTTPS 请求里发送会话 Cookie。 |
| `SESSION_COOKIE_DOMAIN` | 空 | API 服务 | 前端和 API 使用同一个父域，并且希望 Cookie 在子域间共享时设置。 | 本地开发通常留空。不同站点部署也通常留空。 |
| `ARTIFACT_STORAGE_DRIVER` | `local` | API 服务、worker | 要把 artifact 存到 S3 或 R2 兼容存储时改成对应驱动值。 | 默认本地文件存储最简单。启用对象存储时要同时配置 S3 相关变量。 |
| `ARTIFACT_LOCAL_DIR` | `./data/artifacts` | API 服务、worker | 使用本地 artifact 存储，并想换保存目录时修改。 | Docker 里常设为 `/data/artifacts`，和 `DATA_DIR` 放在同一个 volume。 |
| `S3_ENDPOINT` | 空 | API 服务、worker | 使用 S3、R2 或其他兼容对象存储时设置。 | 不用对象存储时留空。不要把私有 endpoint、密钥写进公开文档或提交。 |
| `S3_REGION` | `auto` | API 服务、worker | 对象存储要求指定 region 时修改。 | Cloudflare R2 常用 `auto`。AWS S3 通常用实际 region。 |
| `S3_BUCKET` | 空 | API 服务、worker | 使用对象存储保存 artifact 时设置。 | bucket 需要提前创建，并确保访问密钥有读写权限。 |
| `S3_ACCESS_KEY_ID` | 空 | API 服务、worker | 使用对象存储保存 artifact 时设置。 | 属于敏感信息。不要提交到 Git，不要贴到 issue、截图或日志。 |
| `S3_SECRET_ACCESS_KEY` | 空 | API 服务、worker | 使用对象存储保存 artifact 时设置。 | 属于敏感信息。不要提交到 Git，不要贴到 issue、截图或日志。 |
| `SCHEDULER_POLL_INTERVAL_MS` | `30000` | worker | 想调整调度任务轮询频率时修改。 | 单位是毫秒。值越小检查越频繁，资源消耗也越高。 |
| `NEWAPI_TESTOPS_API` | `http://127.0.0.1:8788` | `npm run build` | 静态前端要访问远程 API，或 Web 镜像需要打包指定 API 地址时设置。 | 这是构建时变量，不在 `.env.example`。它会生成 `dist/web/config.js`。改完后必须重新构建并重新部署静态文件或 Web 镜像。 |

常见部署组合：

| 场景 | API 地址该写成 | 关键变量 | 说明/注意 |
| --- | --- | --- | --- |
| 本地开发 | `http://127.0.0.1:8788` | `API_HOST=127.0.0.1`，`WEB_HOST=127.0.0.1`，`PUBLIC_API_BASE_URL=http://127.0.0.1:8788` | 浏览器、Web、API 都在本机时默认值可用。 |
| Docker Compose 本机 | `http://127.0.0.1:8788` | `API_HOST=0.0.0.0`，`DATA_DIR=/data`，`ARTIFACT_LOCAL_DIR=/data/artifacts` | 容器监听 `0.0.0.0`，宿主机通过端口映射访问。浏览器在宿主机上时仍用 `127.0.0.1`。 |
| VPS 公网 API | `https://api.your-domain.com` | `API_HOST=0.0.0.0`，`NEWAPI_TESTOPS_API=https://api.your-domain.com` | API 由 Nginx 或 Caddy 反代到 `127.0.0.1:8788`。前端构建前要写公网 API 地址。 |
| 静态前端加远程 API | `https://api.your-domain.com` | `NEWAPI_TESTOPS_API=https://api.your-domain.com`，按需设置 `AUTH_REQUIRED=true` | `npm run build` 会把 API 地址写入 `dist/web/config.js`，上传静态文件后浏览器读取它。 |
| GitHub Pages | `https://api.your-domain.com` | Actions Variables 里设置 `NEWAPI_TESTOPS_API` | GitHub Pages 只能托管静态文件，不能运行 API、保存数据或执行 live 测试。真正执行测试仍依赖远程 API。 |

当前本地文件存储包括：

- 任务历史：`data/jobs.json`
- 调度历史：`data/schedules.json`
- 账号数据：`data/users.json`
- 会话数据：`data/sessions.json`
- 团队数据：`data/teams.json`
- 团队成员关系：`data/memberships.json`
- artifact：`data/artifacts/<runId>/request.json` 等

账号密码保存在本地 JSON 文件中。密码不会明文保存，后端使用 `scrypt` 做哈希。注册、登录和 `/api/auth/me` 返回的都是公开用户信息，不返回密码哈希、盐值或会话密钥。

会话使用名为 `sid` 的 Cookie。这个 Cookie 是 `HttpOnly`，浏览器脚本不能读取。`SESSION_COOKIE_SAMESITE`、`SESSION_COOKIE_SECURE`、`SESSION_COOKIE_DOMAIN` 可以控制 Cookie 的 `SameSite`、`Secure` 和 `Domain` 属性。

默认 `AUTH_REQUIRED=false`，API 处于开放模式。创建任务、查看任务、读取 artifact、导出和分析接口都不要求登录。设置 `AUTH_REQUIRED=true` 后，`jobs`、`schedules`、`artifacts`、`exports`、`analytics` 相关接口需要先通过 `/api/auth/register` 或 `/api/auth/login` 获取 `sid` 会话 Cookie，再带着 Cookie 访问。

如果静态前端和 API 是不同站点，例如 Vercel、Cloudflare Pages、GitHub Pages 前端访问独立 API 域名，浏览器要求跨站 Cookie 使用 `SameSite=None; Secure`。这时 API 环境变量建议设置：

```env
AUTH_REQUIRED=true
SESSION_COOKIE_SAMESITE=None
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_DOMAIN=
```

如果前端和 API 使用同一个站点或同一个父域，可以按部署域名决定是否设置 `SESSION_COOKIE_DOMAIN`。本地开发通常保持空值即可。

## NEWAPI_TESTOPS_API 和 dist/web/config.js

这是最容易配错的地方，请仔细看。

`npm run build` 会运行 `scripts/build.mjs`。构建脚本会删除旧的 `dist/web`，复制 `apps/web/index.html` 和 `apps/web/src`，然后生成 `dist/web/config.js`。

| 场景 | API 地址来自哪里 | 默认/示例 | 说明/注意 |
| --- | --- | --- | --- |
| `npm run start:web` 开发模式 | 开发 Web 配置，通常配合 `PUBLIC_API_BASE_URL` | `http://127.0.0.1:8788` | 适合 Web 和 API 都在本机运行。若浏览器要访问远程 API，按开发环境配置修改。 |
| `npm run build` 静态部署 | `NEWAPI_TESTOPS_API` 生成的 `dist/web/config.js` | `NEWAPI_TESTOPS_API=https://api.your-domain.com npm run build` | 构建后会生成 `window.__NEWAPI_TESTOPS_API__ = "https://api.your-domain.com";`。 |
| Docker Web 镜像 | 镜像里打包的 `dist/web/config.js` | 未设置时为 `http://127.0.0.1:8788` | 如果构建镜像前没设置 `NEWAPI_TESTOPS_API`，镜像里的前端就会请求默认 API 地址。 |

静态前端访问哪个 API，是构建时写进 `dist/web/config.js` 的。你把 `dist/web` 上传到 Vercel、Cloudflare Pages、GitHub Pages、Nginx 或对象存储后，浏览器会读取这个 `config.js`。

如果你已经构建过一次，后来才修改 `NEWAPI_TESTOPS_API`，需要重新运行 `npm run build`，再重新部署静态文件或重建 Web 镜像。

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

### 注册账号

注册成功后，后端会写入 `data/users.json` 和 `data/sessions.json`，并通过 `Set-Cookie` 返回 `sid` 会话 Cookie。下面用 `cookies.txt` 保存 Cookie，方便后续请求复用。

```bash
curl -i -c cookies.txt -X POST http://127.0.0.1:8788/api/auth/register \
  -H "content-type: application/json" \
  -d '{"email":"alice@example.com","password":"alice-password","name":"Alice"}'
```

### 登录账号

```bash
curl -i -c cookies.txt -X POST http://127.0.0.1:8788/api/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"alice@example.com","password":"alice-password"}'
```

### 查看当前登录用户

```bash
curl -b cookies.txt http://127.0.0.1:8788/api/auth/me
```

返回的是公开用户信息，不包含密码哈希或会话密钥。

### 注销登录

```bash
curl -i -b cookies.txt -c cookies.txt -X POST http://127.0.0.1:8788/api/auth/logout
```

### 查看团队列表

```bash
curl -b cookies.txt http://127.0.0.1:8788/api/teams
```

### 创建团队

```bash
curl -X POST http://127.0.0.1:8788/api/teams \
  -b cookies.txt \
  -H "content-type: application/json" \
  -d '{"name":"QA Team"}'
```

### 添加团队成员

把 `<teamId>` 换成创建团队后返回的团队 ID。被添加的人需要先注册账号。

```bash
curl -X POST http://127.0.0.1:8788/api/teams/<teamId>/members \
  -b cookies.txt \
  -H "content-type: application/json" \
  -d '{"email":"bob@example.com"}'
```

### 创建 synthetic 测试任务

synthetic 模式不会真的请求上游 API，适合本地安全验证。

```bash
curl -X POST http://127.0.0.1:8788/api/jobs \
  -H "content-type: application/json" \
  -d '{"baseUrl":"https://api.example.com","apiKey":"demo-secret","model":"demo-model","mode":"text","concurrency":2,"durationSeconds":2}'
```

如果 `AUTH_REQUIRED=true`，需要带上登录 Cookie。团队任务可以额外传 `teamId`：

```bash
curl -X POST http://127.0.0.1:8788/api/jobs \
  -b cookies.txt \
  -H "content-type: application/json" \
  -d '{"teamId":"<teamId>","baseUrl":"https://api.example.com","apiKey":"demo-secret","model":"demo-model","mode":"text","concurrency":2,"durationSeconds":2}'
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

```bash
curl -X POST http://127.0.0.1:8788/api/schedules \
  -H "content-type: application/json" \
  -d '{"name":"hourly sample","intervalSeconds":3600,"input":{"baseUrl":"https://api.example.com","apiKey":"demo-secret","model":"demo-model","mode":"text","concurrency":1,"durationSeconds":1}}'
```

创建团队调度时同样可以传 `teamId`：

```bash
curl -X POST http://127.0.0.1:8788/api/schedules \
  -b cookies.txt \
  -H "content-type: application/json" \
  -d '{"teamId":"<teamId>","name":"team sample","intervalSeconds":3600,"input":{"baseUrl":"https://api.example.com","apiKey":"demo-secret","model":"demo-model","mode":"text","concurrency":1,"durationSeconds":1}}'
```

查看调度：

```bash
curl http://127.0.0.1:8788/api/schedules
```

## Docker Compose 源码构建部署

适合 VPS、家用服务器、NAS、Docker Desktop，也适合你想从当前源码直接构建镜像的场景。

### 1. 克隆源码

```bash
git clone https://github.com/xingxinag/newapi-testops.git
cd newapi-testops
```

### 2. 构建静态前端

如果 API 也跑在同一台机器，并且浏览器也在这台机器上，可以直接构建：

```bash
npm run build
```

如果前端要让远程浏览器访问 VPS API，请写公网 API 地址：

```bash
NEWAPI_TESTOPS_API=https://api.your-domain.com npm run build
```

### 3. 启动 Docker Compose

```bash
npm run compose:up
```

这个命令内部会执行 `docker compose up --build -d`，然后额外打印可访问地址。普通 `docker compose up --build -d` 只会显示容器启动状态，不会自动告诉你应用 URL。

启动成功后会看到类似：

```text
NewAPI TestOps is starting:

Web:    http://127.0.0.1:4178
API:    http://127.0.0.1:8788
Health: http://127.0.0.1:8788/api/health

If this runs on a VPS, replace 127.0.0.1 with your server IP or domain.
```

compose 里还有一个 worker 服务，用来按轮询间隔处理调度任务。API 和 worker 共用同一个 Docker volume。

### 4. 查看服务状态

```bash
docker compose ps
```

### 5. 验证 API

```bash
curl http://127.0.0.1:8788/api/health
```

### 6. 打开网页

浏览器访问：

```text
http://127.0.0.1:4178
```

如果你在另一台电脑访问服务器，把 `127.0.0.1` 换成服务器 IP 或域名。

### 7. 停止服务

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

## Docker Hub 镜像部署

项目提供 Docker Hub 镜像：

- API 镜像：`xing025/newapi-testops-api:latest`
- Web 镜像：`xing025/newapi-testops-web:latest`

本 README 只说明如何使用这些镜像，不表示本次文档更新重新发布了镜像。

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

验证：

```bash
curl http://127.0.0.1:8788/api/health
```

### 单独运行 Web 镜像

```bash
docker run --rm -p 4178:80 xing025/newapi-testops-web:latest
```

访问：

```text
http://127.0.0.1:4178
```

注意：Web 镜像里已经包含构建好的 `dist/web/config.js`。如果镜像构建时的 API 地址是默认值，它就会请求 `http://127.0.0.1:8788`。如果你要把 Web 和 API 部署在不同域名，建议用“静态前端加远程 API”的方式，或者从源码重新构建 Web 镜像并在构建前设置 `NEWAPI_TESTOPS_API`。

### Docker Hub 镜像 compose 示例

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

验证：

```bash
curl http://127.0.0.1:8788/api/health
```

浏览器访问：

```text
http://127.0.0.1:4178
```

## VPS 部署和反向代理教程

适合正式自托管。推荐做法是：

| 域名 | 反代到 |
| --- | --- |
| `https://testops.your-domain.com` | Web 服务 `127.0.0.1:4178` 或 Nginx 静态目录 |
| `https://api.your-domain.com` | API 服务 `127.0.0.1:8788` |

### 方案一：VPS 上用 Docker Compose

1. 在 VPS 安装 Docker 和 Docker Compose。
2. 克隆仓库。
3. 构建前设置 API 公网地址。
4. 启动 compose。

命令示例：

```bash
git clone https://github.com/xingxinag/newapi-testops.git
cd newapi-testops
NEWAPI_TESTOPS_API=https://api.your-domain.com npm run build
docker compose up --build -d
```

然后用 Nginx 或 Caddy 做 HTTPS 反代。

Nginx 思路示例：

```nginx
server {
  server_name api.your-domain.com;

  location / {
    proxy_pass http://127.0.0.1:8788;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

server {
  server_name testops.your-domain.com;

  location / {
    proxy_pass http://127.0.0.1:4178;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

证书可以用 `certbot` 或 Caddy 自动申请。这里的域名只是示例，请换成你自己的域名。

### 方案二：VPS 上直接用 Node

```bash
git clone https://github.com/xingxinag/newapi-testops.git
cd newapi-testops
npm install
npm test
NEWAPI_TESTOPS_API=https://api.your-domain.com npm run build
```

启动 API：

```bash
API_HOST=0.0.0.0 API_PORT=8788 DATA_DIR=./data ARTIFACT_LOCAL_DIR=./data/artifacts npm run start:api
```

启动 Web：

```bash
WEB_HOST=0.0.0.0 WEB_PORT=4178 npm run start:web
```

生产环境建议用 systemd、pm2、Docker 或其他进程管理器守护进程，再用 Nginx 或 Caddy 提供 HTTPS。

## 静态前端加远程 API

前端是纯静态文件，可以部署到 Vercel、Cloudflare Pages、GitHub Pages、Nginx、对象存储或 CDN。API 仍然必须部署到支持 Node 或 Docker 的地方，例如 VPS、Railway、Render、Fly.io 或自己的服务器。

### 1. 先部署 API

API 必须能被公网访问。部署后先验证：

```bash
curl https://api.your-domain.com/api/health
```

必须看到：

```json
{
  "success": true,
  "service": "newapi-testops-api"
}
```

### 2. 构建静态前端

```bash
NEWAPI_TESTOPS_API=https://api.your-domain.com npm run build
```

### 3. 发布 dist/web

把这个目录上传到你的静态托管平台：

```text
dist/web
```

### 4. 打开前端并检查连接

浏览器打开你的前端域名，然后用开发者工具 Network 检查 `/api/health`。

确认 Request URL 是：

```text
https://api.your-domain.com/api/health
```

如果还是 `http://127.0.0.1:8788/api/health`，说明构建时没有正确设置 `NEWAPI_TESTOPS_API`，或者你上传的不是最新 `dist/web`。

## Vercel、Cloudflare Pages、GitHub Pages

本项目已经提供静态托管配置：

| 平台 | 配置 |
| --- | --- |
| Vercel | `vercel.json`，构建命令 `npm run build`，输出目录 `dist/web`。 |
| Cloudflare Pages | `wrangler.toml`，`pages_build_output_dir = "dist/web"`。 |
| GitHub Pages | `.github/workflows/pages.yml`，自动构建并发布 `dist/web`。 |

各平台都需要把远程 API 地址传给构建过程：

| 平台 | 设置位置 |
| --- | --- |
| Vercel | Project Settings，Environment Variables，添加 `NEWAPI_TESTOPS_API`。 |
| Cloudflare Pages | Settings，Environment variables，添加 `NEWAPI_TESTOPS_API`。 |
| GitHub Pages | Repository Settings，Secrets and variables，Actions，Variables，添加 `NEWAPI_TESTOPS_API`。 |

GitHub Pages 的限制：

1. GitHub Pages 只能托管静态文件。
2. GitHub Pages 不能运行 Node API。
3. GitHub Pages 不能保存任务数据。
4. GitHub Pages 不能执行 live 测试。
5. 真正执行测试仍然依赖远程 API。

推荐组合：

1. GitHub Pages 托管 `dist/web`。
2. VPS 或 Docker 托管 API。
3. Actions Variables 里设置 `NEWAPI_TESTOPS_API=https://api.your-domain.com`。
4. 浏览器开发者工具确认 `/api/health` 请求发到远程 API。

## live 模式和密钥安全

live 模式会真实请求你的目标 NewAPI 服务：

- `apiKey` 会作为 `Authorization: Bearer <apiKey>` 发送给上游。
- 请求 artifact、响应 artifact 和报告会脱敏 Authorization，通常显示为 `[redacted]` 或掩码。
- `concurrency` 最大 200。
- `durationSeconds` 最大 3600。
- 当前执行语义是总请求数等于 `concurrency * durationSeconds`，不是严格持续 N 秒的压测循环。

密钥规则：

1. 不要把真实 API URL 和 API Key 写进 README。
2. 不要把真实 API Key 写进 Git 提交。
3. 不要把真实 API Key 放进公开 issue、截图、CI 日志。
4. 推荐在 UI 里临时输入 API Key。
5. 如果用环境变量或运行时配置，也要确认不会被提交到仓库。
6. 分享 artifact 前仍建议自己检查一遍，确认没有敏感信息。

## 判断前端和后端是否真正连接的排查清单

按顺序查，能节省很多时间。

### 1. 后端 API 是否启动

```bash
curl http://127.0.0.1:8788/api/health
```

如果没有返回 `newapi-testops-api`，先解决 API 启动问题。

### 2. 浏览器是否能访问同一个地址

在浏览器打开：

```text
http://127.0.0.1:8788/api/health
```

curl 能访问但浏览器不能访问时，常见原因是浏览器所在机器和 curl 所在机器不是同一台。

### 3. 前端请求的 API 地址是否正确

打开开发者工具 Network，查看 `/api/health` 的 Request URL。

| Request URL | 判断 |
| --- | --- |
| `http://127.0.0.1:8788/api/health` | 适合本机运行。如果你用的是远程 API，这就是错的。 |
| `https://api.your-domain.com/api/health` | 适合静态前端加远程 API。 |

### 4. 页面显示已连接但任务失败

这说明 NewAPI TestOps 前后端大概率已经连通。接下来检查目标 NewAPI：

1. `baseUrl` 是否正确。
2. API Key 是否有效。
3. 模型名是否存在。
4. 上游是否支持当前 endpoint。
5. 上游是否有额度、白名单、限流或网络限制。
6. live 模式是否真的被选中。

### 5. Docker Web 能打开，但创建任务失败

查看容器：

```bash
docker compose ps
```

验证 API：

```bash
curl http://127.0.0.1:8788/api/health
```

再用浏览器开发者工具确认页面请求的 API 地址。

### 6. CORS 报错

API 已支持 CORS 预检。常见原因是：

1. 前端请求了错误的 API 地址。
2. 旧进程占用了 `8788` 端口。
3. 反向代理没有把 `OPTIONS` 请求转发给 API。
4. HTTPS 前端请求 HTTP API，被浏览器拦截为 mixed content。

Windows 检查端口：

```powershell
netstat -ano | findstr 8788
```

Linux 检查端口：

```bash
ss -lntp | grep 8788
```

### 7. 静态部署后仍然请求 127.0.0.1

检查构建产物：

```bash
cat dist/web/config.js
```

你应该看到：

```js
window.__NEWAPI_TESTOPS_API__ = "https://api.your-domain.com";
```

如果不是，重新构建：

```bash
NEWAPI_TESTOPS_API=https://api.your-domain.com npm run build
```

然后重新上传 `dist/web`。

### 8. 修改代码后 Docker Web 没变化

需要先重新构建静态前端，再重建镜像：

```bash
npm run build
docker compose build web
docker compose up -d
```

如果你要换远程 API 地址，要这样构建：

```bash
NEWAPI_TESTOPS_API=https://api.your-domain.com npm run build
docker compose build web
docker compose up -d
```

### 9. 不想保留本地测试数据

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

- `npm test`：37/37 pass
- `npm run build`：成功生成 `dist/web`
- `docker compose build`：API/Web 镜像构建成功
- `docker compose up -d`：API/Web 容器启动成功
- Docker 栈内创建 job：`201 Created`
- Docker 栈内读取 artifact：授权头已脱敏为 `[redacted]`
- Docker Hub 镜像可用：`xing025/newapi-testops-api:latest`、`xing025/newapi-testops-web:latest`

## 后续增强方向

- 增加更丰富的趋势图、成功率图、延迟分位图。
- 增加导出 ZIP、CSV、HTML 报告。
- 增加更多上游 API 兼容性测试模板。
