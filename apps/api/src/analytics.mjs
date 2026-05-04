export async function getTrendPoints(store) {
  const jobs = await store.readJobs();
  return jobs
    .filter((job) => job.summary)
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .map((job) => {
      const totalRequests = job.summary.totalRequests || 0;
      return {
        runId: job.runId,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        status: job.status,
        model: job.input?.model,
        mode: job.input?.mode,
        executionMode: job.input?.executionMode || 'synthetic',
        score: job.score,
        totalRequests,
        successCount: job.summary.successCount || 0,
        failureCount: job.summary.failureCount || 0,
        rateLimitedCount: job.summary.rateLimitedCount || 0,
        timeoutCount: job.summary.timeoutCount || 0,
        successRate: totalRequests ? (job.summary.successCount || 0) / totalRequests : 0,
        latencyP50: job.summary.latencyMs?.p50 || 0,
        latencyP90: job.summary.latencyMs?.p90 || 0,
        latencyP95: job.summary.latencyMs?.p95 || 0,
        latencyP99: job.summary.latencyMs?.p99 || 0,
        latencyMax: job.summary.latencyMs?.max || 0,
        successRpm: job.summary.throughput?.successRpm || 0,
        overallRps: job.summary.throughput?.overallRps || 0,
        tokensTotal: job.summary.tokens?.total || 0,
      };
    });
}
