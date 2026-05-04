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
