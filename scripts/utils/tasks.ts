export type Task<T = any> = () => Promise<T>;

export async function runTask<T>(
  name: string,
  task: Task<T>,
  opts: { logger: any; retries?: number } )
: Promise<T> {
  const { logger, retries = 0 } = opts;
  let attempt = 0;
  const start = Date.now();

  while (true) {
    try {
      logger.info(`▶ ${name} (attempt ${attempt + 1})`);
      const res = await task();
      const ms = Date.now() - start;
      logger.info(`✓ ${name} (${ms}ms)`);
      return res;
    } catch (err: any) {
      attempt++;
      const ms = Date.now() - start;
      logger.error(`✗ ${name} failed (${ms}ms)`, { attempt, error: String(err?.message ?? err) });
      if (attempt > retries) throw err;
      logger.warn(`retrying ${name}…`);
    }
  }
}

export async function pipeline(
  steps: Array<[string, Task]>,
  logger: any
) {
  for (const [name, t] of steps) {
    await runTask(name, t, { logger });
  }
}
