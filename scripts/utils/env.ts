// scripts/utils/env.ts
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') throw new Error(`Missing env: ${name}`);
  return v;
}
