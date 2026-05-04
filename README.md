# NewAPI TestOps

Front/back separated MVP for NewAPI testing, scheduled sampling, relay scoring, and artifact-backed request/response evidence. Jobs support `executionMode: "synthetic"` for safe local probes and `executionMode: "live"` for a single real HTTP POST to the configured endpoint.

## Quick start

```bash
npm test
npm run build
npm run start:api
```

In another shell:

```bash
curl -X POST http://127.0.0.1:8788/api/jobs \
  -H "content-type: application/json" \
  -d '{"baseUrl":"https://api.example.com","apiKey":"demo-secret","model":"demo-model","mode":"text","concurrency":2,"durationSeconds":2}'
```

For a live probe, add `"executionMode":"live"`. Live mode sends `concurrency * durationSeconds` POST requests to the configured endpoint, preserves the same `request.json`, `response.json`, and `report.json` artifact contract, and redacts secret headers in persisted records.

Stored artifacts are available through `GET /api/jobs/:runId/artifacts/:name`, for example `request.json`, `response.json`, or `report.json`.

Minimal sampling schedules are available through `POST /api/schedules` with `{ "name", "intervalSeconds", "input" }`. Creating a schedule persists it, immediately runs one sampled job using the existing job runner, and `GET /api/schedules` lists schedule history.

Open `apps/web/index.html` through `npm run start:web` or deploy `dist/web` to any static host. See `docs/deployment.md` for deployment modes.

## Docker images

Published images:

- `xing025/newapi-testops-api:latest`
- `xing025/newapi-testops-web:latest`

Run the API image directly:

```bash
docker run --rm -p 8788:8788 \
  -e API_HOST=0.0.0.0 \
  -e API_PORT=8788 \
  -e DATA_DIR=/data \
  -e ARTIFACT_LOCAL_DIR=/data/artifacts \
  -v newapi-testops-data:/data \
  xing025/newapi-testops-api:latest
```

Run the static web image directly:

```bash
docker run --rm -p 4178:80 xing025/newapi-testops-web:latest
```

The published web image expects the API at `http://127.0.0.1:8788` by default. For a different API host, deploy the static frontend from source and set `window.__NEWAPI_TESTOPS_API__` before `src/app.mjs` loads, or rebuild the frontend image with your own configuration.

## Deployment methods

### Docker Compose from source

```bash
git clone https://github.com/xingxinag/newapi-testops.git
cd newapi-testops
npm run build
docker compose up --build -d
```

API: `http://127.0.0.1:8788`  
Web: `http://127.0.0.1:4178`

### Static frontend + remote API

Use this for Vercel, Cloudflare Pages, GitHub Pages, or any static host:

```bash
npm run build
```

Deploy `dist/web` to the static host. Run the API separately with Docker, Docker Compose, or a VPS Node process. Point the frontend at the API by defining `window.__NEWAPI_TESTOPS_API__` before loading `src/app.mjs`.

### VPS Node API + static web

```bash
API_HOST=0.0.0.0 API_PORT=8788 DATA_DIR=./data ARTIFACT_LOCAL_DIR=./data/artifacts npm run start:api
WEB_HOST=0.0.0.0 WEB_PORT=4178 npm run start:web
```

### Cloudflare Pages / Vercel / GitHub Pages

Build with `npm run build`, publish `dist/web`, and host the API elsewhere. The frontend is static-only; secrets stay in the API service.
