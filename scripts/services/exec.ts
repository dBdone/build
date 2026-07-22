import { execa } from 'execa';
export async function sh(cmd: string, args: string[], opts: any = {}) {
  return execa(cmd, args, { stdio: 'inherit', shell: false, ...opts });
}

// Like sh(), but retries on failure. Intended for flaky external tools (e.g. signtool
// hitting a transient timestamp-server/network error) where re-running the same command
// is cheap and safe, unlike re-running the whole build.
export async function shWithRetry(
  cmd: string,
  args: string[],
  opts: any = {},
  retries = 3,
  delayMs = 5000
) {
  let attempt = 0;
  while (true) {
    try {
      return await sh(cmd, args, opts);
    } catch (err: any) {
      attempt++;
      if (attempt > retries) throw err;
      console.warn(`[WARN] "${cmd}" failed (attempt ${attempt}/${retries + 1}); retrying in ${delayMs}ms…`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

