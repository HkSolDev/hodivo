// Delivery runs after commit. Both revalidation operations can be retried.
export async function notifyJobsRevalidated(
  env: NodeJS.ProcessEnv = process.env,
  jobId?: string,
): Promise<boolean> {
  const url = env.FRONTEND_REVALIDATE_URL;
  const token = env.INGEST_TOKEN;
  if (!url || !token) return false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const endpoint = new URL(url);
      if (jobId !== undefined) endpoint.searchParams.set('jobId', jobId);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        // Bulk refresh also waits for three list fetches.
        signal: AbortSignal.timeout(jobId === undefined ? 15_000 : 3_000),
      });
      if (response.ok) return true;
      console.error(
        `jobs revalidation notification failed with ${response.status}`,
      );
    } catch {
      console.error('jobs revalidation notification failed');
    }
  }
  return false;
}
