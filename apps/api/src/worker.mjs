import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArtifactStore } from './artifacts.mjs';
import { runDueSchedules } from './scheduler.mjs';

export function startSchedulerWorker({ store = createArtifactStore({ dataDir: process.env.DATA_DIR || './data', artifactDir: process.env.ARTIFACT_LOCAL_DIR || './data/artifacts' }), intervalMs = Number(process.env.SCHEDULER_POLL_INTERVAL_MS || 30000), logger = console } = {}) {
  let ticking = false;
  let stopped = false;
  async function tick() {
    if (ticking || stopped) return;
    ticking = true;
    try {
      await runDueSchedules(store, { now: new Date() });
    } catch (error) {
      logger.error(error);
    } finally {
      ticking = false;
    }
  }
  const timer = setInterval(tick, intervalMs);
  tick();
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startSchedulerWorker();
  console.log(`newapi-testops scheduler worker polling every ${process.env.SCHEDULER_POLL_INTERVAL_MS || 30000}ms`);
}
