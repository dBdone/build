import fs from 'fs-extra';
import path from 'node:path';
import { sh } from './exec.js';
import { requireEnv } from '../utils/env.js';
import { fromBuild } from '../utils/root.js';
import type { Logger } from '../utils/logger.js';

/**
 * Resolve PROJUCER_EXE value. Accept either a direct binary path or a .app bundle
 * (e.g. /path/Projucer.app). If a .app is given, try to locate
 * Contents/MacOS/Projucer inside it. Best-effort: ensure the resulting
 * file is executable by attempting to chmod it to 0755.
 */
function resolveProjucerExe(raw: string): string {
  if (!raw) throw new Error('PROJUCER_EXE not set');
  let exe = raw;

  try {
    const st = fs.statSync(exe);
    if (st.isDirectory() || exe.endsWith('.app')) {
      const candidate = path.join(exe, 'Contents', 'MacOS', 'Projucer');
      if (fs.existsSync(candidate)) exe = candidate;
      else throw new Error(`Projucer executable not found inside ${exe}`);
    }
  } catch (err) {
    // stat failed — keep raw path and let underlying call fail later
  }

  // Try to set execute permission (best-effort; may fail in CI/permissioned env)
  try {
    fs.accessSync(exe, fs.constants.X_OK);
  } catch {
    try { fs.chmodSync(exe, 0o755); } catch { /* ignore failures */ }
  }

  return exe;
}

/**
 * Run Projucer with the provided CLI args. On macOS, if PROJUCER_EXE points
 * to a .app bundle, prefer launching it via the system 'open' command which is
 * the standard way to launch app bundles and will let the OS handle quarantines
 * and code signing UI. For direct binaries, spawn them directly.
 * 
 * IMPORTANT: When using 'open', we pass -W (wait) to block until Projucer exits.
 * This is critical for operations like --resave where we need to ensure the file
 * is fully written before proceeding.
 */
async function runProjucer(logger: Logger, args: string[]) {
  const raw = requireEnv('PROJUCER_EXE');

  // If the user pointed at an app bundle, use `open -W -a <app> --args ...`
  // The -W flag makes open wait until the application exits
  try {
    const st = fs.statSync(raw);
    if (st.isDirectory() || raw.endsWith('.app')) {
      const openExe = '/usr/bin/open';
      const openArgs = ['-W', '-a', raw, '--args', ...args];
      return await sh(openExe, openArgs);
    }
  } catch (err) {
    // stat failed — fall back to resolving raw as an executable
    logger.warn('Failed to stat PROJUCER_EXE, falling back to direct execution', { raw, error: String(err) });
  }

  const exe = resolveProjucerExe(raw);
  logger.info('Running Projucer', { method: 'direct', exe, args });
  return await sh(exe, args);
}

/**
 * Safely patch the version attribute on the root <JUCERPROJECT ...> tag
 * without round-tripping the whole XML (so entities like &#10; stay unchanged).
 */
export async function patchJucerVersionSafe(jucerPath: string, newVersion: string) {
  const src = await fs.readFile(jucerPath, 'utf8');

  const openTagRe = /<JUCERPROJECT\b[^>]*>/; // first opening tag
  const m = src.match(openTagRe);
  if (!m) throw new Error('JUCERPROJECT tag not found');

  const tag = m[0];
  const start = m.index!;                // non-null because matched
  const end = start + tag.length;

  // version="..." (or '...') attribute inside the tag
  const verAttrRe = /\bversion\s*=\s*(["'])(.*?)\1/;

  let newTag: string;
  if (verAttrRe.test(tag)) {
    newTag = tag.replace(verAttrRe, (_s, q) => `version=${q}${newVersion}${q}`);
  } else {
    // inject before the closing '>'
    newTag = tag.replace(/>$/, ` version="${newVersion}">`);
  }

  if (newTag === tag)
    return; // idempotent

  const out = src.slice(0, start) + newTag + src.slice(end);
  await fs.writeFile(jucerPath, out);
}

/**
 * Create a temporary copy of the .jucer file, patch its version, 
 * and resave it with Projucer. Returns the path to the temp file.
 * The caller is responsible for cleanup if needed.
 */
export async function patchAndResaveJucer(logger: Logger, jucerPath: string, newVersion: string): Promise<string> {
  // Create temp directory in build/tmp
  const tmpDir = fromBuild('tmp', 'projucer');
  await fs.ensureDir(tmpDir);

  // Create temp copy
  const jucerFileName = path.basename(jucerPath);
  const tempJucerPath = path.join(tmpDir, jucerFileName);
  await fs.copy(jucerPath, tempJucerPath);

  // Patch the temp copy
  await patchJucerVersionSafe(tempJucerPath, newVersion);

  // Resave with Projucer (use open for .app bundles on macOS)
  await runProjucer(logger, ['--resave', tempJucerPath]);

  return tempJucerPath;
}

export async function projucerResave(logger: Logger, jucerPath: string) {
  await runProjucer(logger, ['--resave', jucerPath]);
}

/**
 * Patch the version in a temp copy of the .jucer file (next to the original),
 * resave with Projucer, then remove the temp file. Returns the temp file path.
 */
export async function patchAndResaveJucerNextToOriginal(logger: Logger, jucerPath: string, newVersion: string): Promise<string> {
  const dir = path.dirname(jucerPath);
  const base = path.basename(jucerPath, '.jucer');
  const tempJucerPath = path.join(dir, `${base}.tmp.jucer`);
  await fs.copy(jucerPath, tempJucerPath);
  await patchJucerVersionSafe(tempJucerPath, newVersion);
  await runProjucer(logger, ['--resave', tempJucerPath]);

  // it's absolutely essential that we wait until the call has finished before removing!!!
  await fs.remove(tempJucerPath);
  return tempJucerPath;
}
