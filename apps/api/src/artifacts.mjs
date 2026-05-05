import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function createArtifactStore({ dataDir = './data', artifactDir = './data/artifacts', storageDriver = process.env.ARTIFACT_STORAGE_DRIVER || 'local', s3 } = {}) {
  const root = path.resolve(dataDir);
  const artifacts = path.resolve(artifactDir);
  const artifactDriver = storageDriver === 's3' ? createS3ArtifactDriver(s3 || s3ConfigFromEnv()) : createLocalArtifactDriver(artifacts);
  return {
    root,
    artifacts,
    jobsFile: path.join(root, 'jobs.json'),
    schedulesFile: path.join(root, 'schedules.json'),
    questionBanksFile: path.join(root, 'question-banks.json'),
    storageConfigFile: path.join(root, 'storage-config.json'),
    notificationConfigFile: path.join(root, 'notification-config.json'),
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
      try {
        await readFile(this.questionBanksFile, 'utf8');
      } catch {
        await writeFile(this.questionBanksFile, '[]\n');
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
    async readQuestionBanks() {
      await this.ensure();
      return JSON.parse(await readFile(this.questionBanksFile, 'utf8'));
    },
    async writeQuestionBanks(questionBanks) {
      await this.ensure();
      await writeFile(this.questionBanksFile, `${JSON.stringify(questionBanks, null, 2)}\n`);
    },
    async readStorageConfig() {
      await this.ensure();
      return readJsonFile(this.storageConfigFile, {});
    },
    async writeStorageConfig(config) {
      await this.ensure();
      await writeFile(this.storageConfigFile, `${JSON.stringify(config, null, 2)}\n`);
    },
    async readNotificationConfig() {
      await this.ensure();
      return readJsonFile(this.notificationConfigFile, {});
    },
    async writeNotificationConfig(config) {
      await this.ensure();
      await writeFile(this.notificationConfigFile, `${JSON.stringify(config, null, 2)}\n`);
    },
    async putArtifact(runId, name, value) {
      await this.ensure();
      return artifactDriver.putArtifact(runId, name, value);
    },
    async readArtifact(runId, name) {
      await this.ensure();
      return artifactDriver.readArtifact(runId, name);
    },
  };
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function createLocalArtifactDriver(artifacts) {
  return {
    async putArtifact(runId, name, value) {
      const runDir = path.join(artifacts, runId);
      await mkdir(runDir, { recursive: true });
      const filePath = path.join(runDir, name);
      await writeFile(filePath, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
      return { name, path: filePath };
    },
    async readArtifact(runId, name) {
      const filePath = path.join(artifacts, runId, name);
      return JSON.parse(await readFile(filePath, 'utf8'));
    },
  };
}

function createS3ArtifactDriver(config) {
  const required = [
    ['S3_BUCKET', config.bucket],
    ['S3_ENDPOINT', config.endpoint],
    ['S3_ACCESS_KEY_ID', config.accessKeyId],
    ['S3_SECRET_ACCESS_KEY', config.secretAccessKey],
  ];
  const missing = required.find(([, value]) => !value);
  if (missing) throw new Error(`${missing[0]} is required for s3 artifact storage`);
  const client = config.client || createAwsS3Client(config);
  return {
    async putArtifact(runId, name, value) {
      const key = artifactKey(runId, name);
      const body = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      await client.send({ type: 'PutObject', input: { Bucket: config.bucket, Key: key, Body: body, ContentType: 'application/json; charset=utf-8' } });
      return { name, bucket: config.bucket, key };
    },
    async readArtifact(runId, name) {
      const key = artifactKey(runId, name);
      const response = await client.send({ type: 'GetObject', input: { Bucket: config.bucket, Key: key } });
      const text = await bodyToString(response.Body);
      return JSON.parse(text);
    },
  };
}

function s3ConfigFromEnv() {
  return {
    bucket: process.env.S3_BUCKET,
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'auto',
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  };
}

function createAwsS3Client(config) {
  return {
    async send(command) {
      const { S3Client, PutObjectCommand, GetObjectCommand } = await import('@aws-sdk/client-s3');
      const client = new S3Client({ region: config.region || 'auto', endpoint: config.endpoint, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
      if (command.type === 'PutObject') return client.send(new PutObjectCommand(command.input));
      if (command.type === 'GetObject') return client.send(new GetObjectCommand(command.input));
      throw new Error(`Unsupported S3 command: ${command.type}`);
    },
  };
}

function artifactKey(runId, name) {
  return `${encodeURIComponent(runId)}/${encodeURIComponent(name)}`;
}

async function bodyToString(body) {
  if (!body) return '';
  if (typeof body === 'string') return body;
  if (typeof body.transformToString === 'function') return body.transformToString();
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}
