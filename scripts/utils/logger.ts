export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export class Logger {
  constructor(private asJson = false) {}

  private out(level: LogLevel, msg: string, extra?: Record<string, any>) {
    if (this.asJson) {
      const payload = { ts: new Date().toISOString(), level, msg, ...(extra ?? {}) };
      // Ensure single-line JSON for CI
      console.log(JSON.stringify(payload));
    } else {
      const tag = level.toUpperCase().padEnd(5);
      console.log(`[${tag}] ${msg}${extra ? ' ' + JSON.stringify(extra) : ''}`);
    }
  }
  info(m: string, e?: any)  { this.out('info',  m, e); }
  warn(m: string, e?: any)  { this.out('warn',  m, e); }
  error(m: string, e?: any) { this.out('error', m, e); }
  debug(m: string, e?: any) { this.out('debug', m, e); }
}
