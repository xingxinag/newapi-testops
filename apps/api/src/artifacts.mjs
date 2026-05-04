import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function createArtifactStore({ dataDir = './data', artifactDir = './data/artifacts' } = {}) {
  const root = path.resolve(dataDir);
  const artifacts = path.resolve(artifactDir);
  return {
    root,
    artifacts,
    jobsFile: path.join(root, 'jobs.json'),
    schedulesFile: path.join(root, 'schedules.json'),
    async ensure() {
      await mkdir(root, { recursive: true });
      await mkdir(artifacts, { recursive: true });
      try {
        await readFile(this.jobsFile, 'utf8');
      } catch {
        await writeFile(this.jobsFile, '[]\n');
      }
      try {
        await readFile(this.schedulesFile, 'utf8');
      } catch {
        await writeFile(this.schedulesFile, '[]\n');
      }
    },
    async readJobs() {
      await this.ensure();
      return JSON.parse(await readFile(this.jobsFile, 'utf8'));
    },
    async writeJobs(jobs) {
      await this.ensure();
      await writeFile(this.jobsFile, `${JSON.stringify(jobs, null, 2)}\n`);
    },
    async readSchedules() {
      await this.ensure();
      return JSON.parse(await readFile(this.schedulesFile, 'utf8'));
    },
    async writeSchedules(schedules) {
      await this.ensure();
      await writeFile(this.schedulesFile, `${JSON.stringify(schedules, null, 2)}\n`);
    },
    async putArtifact(runId, name, value) {
      await this.ensure();
      const runDir = path.join(artifacts, runId);
      await mkdir(runDir, { recursive: true });
      const filePath = path.join(runDir, name);
      await writeFile(filePath, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
      return { name, path: filePath };
    },
    async readArtifact(runId, name) {
      await this.ensure();
      const filePath = path.join(artifacts, runId, name);
      return JSON.parse(await readFile(filePath, 'utf8'));
    },
  };
}
