# NewAPI TestOps Deployment Matrix

NewAPI TestOps is front/back separated. The frontend only depends on `PUBLIC_API_BASE_URL`; the backend owns secrets, job execution, metadata, and artifact storage.

| Mode | Frontend | API | Worker | Storage | Use case |
| --- | --- | --- | --- | --- | --- |
| Static frontend + remote API | Vercel / Cloudflare Pages / GitHub Pages | Docker/VPS API | Docker/VPS | R2/S3/local | Most universal split deployment |
| Vercel frontend + Docker API | Vercel static | Docker API | Docker Worker | Supabase + R2 | Recommended MVP path |
| Cloudflare native light | Cloudflare Pages | Workers | Workers cron for light probes | R2 | Lightweight scheduled sampling, not heavy load tests |
| GitHub Pages showcase | GitHub Pages | Self-hosted API | Self-hosted Worker | R2/S3/local | Low-cost public dashboard/report display |
| All Docker Compose | Nginx/static container | API container | Worker container | Postgres + R2/MinIO/local | Full private deployment |

Phase 1 implements local API, static frontend build, local artifact storage, synthetic probe jobs, single-request live HTTP probe jobs, request/response artifacts, and relayAPI-style scoring cards. R2/S3 is represented by the storage driver contract and environment variables; concrete S3 upload can be added without changing API or UI contracts.

## Web-configured MVP features

The Web UI stores advanced MVP configuration through the API service and the `DATA_DIR` JSON files:

- `/api/config/storage` saves local/S3/R2-compatible metadata plus `retentionDays`; API responses mask `secretAccessKey`.
- `/api/config/notifications` saves channel, target URL, and message templates. This MVP stores config only; it does not dispatch messages.
- Job creation accepts history access scope plus exact default, custom, and selected-parameter display names.
- `/api/question-banks` persists editable JSON question banks in `question-banks.json`; the Web UI can create, update, delete, import, and select text or image-generation prompts for concurrent test jobs.
- Schedule creation accepts either `intervalSeconds` or a simple every-N-minutes cron expression such as `*/5 * * * *`.

For Docker/VPS deployments, keep the API and worker sharing the same `/data` volume so jobs, schedules, question banks, storage config, and notification config are visible to both processes. Rebuild the Web image after frontend changes because `dist/web/config.js` is generated at build time.

## Timed and sampled tests

The job contract includes `sampling.strategy` with `manual`, `scheduled`, and `random-sample`. Phase 1 stores this metadata and runs jobs synchronously for a verifiable MVP. Production schedulers can be added as:

- backend built-in scheduler for Docker/self-hosted
- Vercel Cron invoking `/api/jobs`
- Cloudflare Cron Trigger invoking the API or Worker probe
- GitHub Actions generating static report artifacts
- external uptime services hitting a protected trigger endpoint

## Artifact policy

Metadata belongs in a database or `jobs.json` during local MVP. Large evidence belongs in object storage: request body, response body, stream chunks, images, CSV/TXT/JSON reports, and ZIP exports. Secrets must be redacted before anything is visible in the frontend.

## Docker Compose MVP

Build the static frontend first, then start the API and web containers:

```bash
npm run build
npm run compose:up
```

`npm run compose:up` wraps `docker compose up --build -d` and then prints the application URLs:

```text
Web:    http://127.0.0.1:4178
API:    http://127.0.0.1:8788
Health: http://127.0.0.1:8788/api/health
```

Plain `docker compose up --build -d` only reports container lifecycle state; it does not know which URLs are meaningful for the application. The compose stack exposes the API on `http://127.0.0.1:8788` and the static frontend on `http://127.0.0.1:4178`. API metadata and local artifacts are persisted in the `newapi-testops-data` Docker volume at `/data`.
