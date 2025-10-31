import fs from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const exists = (p: string) => { try { fs.accessSync(p); return true; } catch { return false; } };

function detectBuildRoot(): string {
  // 1) explicit override
  const env = process.env.BUILD_ROOT;
  if (env && exists(env)) return path.resolve(env);

  // 2) git (works because this file lives in the build repo)
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', { stdio: ['ignore','pipe','ignore'] })
      .toString().trim();
    if (gitRoot && exists(gitRoot)) return gitRoot;
  } catch {}

  // 3) walk up from this file as last resort
  const here = path.dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    if (exists(path.join(dir, 'scripts')) && exists(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export function locateRoots() {
  // Build repo root
  const BUILD_ROOT = detectBuildRoot();

  // Workspace parent: prefer explicit, else assume siblings of /build
  const WORKSPACE_ROOT = path.resolve(
    process.env.WORKSPACE_ROOT ?? path.join(BUILD_ROOT, '..')
  );

  // Native & Cloud: explicit overrides first, then workspace siblings
  const NATIVE_ROOT = path.resolve(
    process.env.NATIVE_ROOT ?? path.join(WORKSPACE_ROOT, 'native')
  );
  const CLOUD_ROOT = path.resolve(
    process.env.CLOUD_ROOT ?? path.join(WORKSPACE_ROOT, 'cloud')
  );

  return { BUILD_ROOT, WORKSPACE_ROOT, NATIVE_ROOT, CLOUD_ROOT };
}

// Convenience joiners
export const fromBuild     = (...s: string[]) => path.join(locateRoots().BUILD_ROOT, ...s);
export const fromWorkspace = (...s: string[]) => path.join(locateRoots().WORKSPACE_ROOT, ...s);
export const fromNative    = (...s: string[]) => path.join(locateRoots().NATIVE_ROOT, ...s);

// Guard
export function requireDir(p: string, label?: string) {
  if (!exists(p)) throw new Error(`Missing ${label ?? 'path'}: ${p}`);
  return p;
}
