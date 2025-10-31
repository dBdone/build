import fs from 'fs-extra';
import path from 'node:path';
import { sh } from './exec.js';
import { requireEnv } from '../utils/env.js';
import { fromBuild } from '../utils/root.js';

/**
 * Safely patch the version attribute on the root <JUCERPROJECT ...> tag
 * without round-tripping the whole XML (so entities like &#10; stay unchanged).
 */
export async function patchJucerVersionSafe(jucerPath: string, newVersion: string) {
  const src = await fs.readFile(jucerPath, 'utf8');

  const openTagRe = /<JUCERPROJECT\b[^>]*>/; // first opening tag
  const m = src.match(openTagRe);
  if (!m) throw new Error('JUCERPROJECT tag not found');

  const tag      = m[0];
  const start    = m.index!;                // non-null because matched
  const end      = start + tag.length;

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
export async function patchAndResaveJucer(jucerPath: string, newVersion: string): Promise<string> {
  // Create temp directory in build/tmp
  const tmpDir = fromBuild('tmp', 'projucer');
  await fs.ensureDir(tmpDir);
  
  // Create temp copy
  const jucerFileName = path.basename(jucerPath);
  const tempJucerPath = path.join(tmpDir, jucerFileName);
  await fs.copy(jucerPath, tempJucerPath);
  
  // Patch the temp copy
  await patchJucerVersionSafe(tempJucerPath, newVersion);
  
  // Resave with Projucer
  const exe = requireEnv('PROJUCER_EXE');
  await sh(exe, ['--resave', tempJucerPath]);
  
  return tempJucerPath;
}

export async function projucerResave(jucerPath: string) {
  const exe = requireEnv('PROJUCER_EXE');
  await sh(exe, ['--resave', jucerPath]);
}

/**
 * Patch the version in a temp copy of the .jucer file (next to the original),
 * resave with Projucer, then remove the temp file. Returns the temp file path.
 */
export async function patchAndResaveJucerNextToOriginal(jucerPath: string, newVersion: string): Promise<string> {
  const dir = path.dirname(jucerPath);
  const base = path.basename(jucerPath, '.jucer');
  const tempJucerPath = path.join(dir, `${base}.tmp.jucer`);
  await fs.copy(jucerPath, tempJucerPath);
  await patchJucerVersionSafe(tempJucerPath, newVersion);
  const exe = requireEnv('PROJUCER_EXE');
  await sh(exe, ['--resave', tempJucerPath]);
  await fs.remove(tempJucerPath);
  return tempJucerPath;
}
