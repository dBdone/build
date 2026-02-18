import semver from 'semver';
import { execa } from 'execa';
import { locateRoots } from './root.js';

export type VersionMode = 'working' | 'latest';
export interface VersionInfo {
  mode: VersionMode;
  version: string;    // e.g. "9.9.9-9" or "1.2.3+5"
  major: number; minor: number; patch: number; build: number;
  tag?: string;
}

async function gitInNative(...args: string[]) {
  const { NATIVE_ROOT } = locateRoots();
  return execa('git', args, { cwd: NATIVE_ROOT });
}

export async function computeVersion(mode: VersionMode, fallbackWorking = '9.9.9-9', productPrefix?: string): Promise<VersionInfo> {
  if (mode === 'working') {
    const m = /^(\d+)\.(\d+)\.(\d+)[-+](\d+)$/.exec(fallbackWorking);
    if (!m) throw new Error(`Bad working version format: ${fallbackWorking}`);
    return {
      mode, version: `${m[1]}.${m[2]}.${m[3]}-${m[4]}`,
      major: +m[1], minor: +m[2], patch: +m[3], build: +m[4],
    };
  }

  // latest: derive from git tag + commit count in the native repository
  // Get all tags matching the product prefix pattern
  const tagPattern = productPrefix ? `${productPrefix}*` : '*';
  const allTagsOutput = await gitInNative('tag', '-l', tagPattern, '--sort=-version:refname');
  const tags = allTagsOutput.stdout.trim().split('\n').filter(t => t);

  if (tags.length === 0) {
    throw new Error(`No tags found matching pattern "${tagPattern}" in native repository`);
  }

  const latestTag = tags[0];

  // Extract version string from tag (remove product prefix)
  let versionStr = latestTag;
  if (productPrefix && latestTag.startsWith(productPrefix)) {
    versionStr = latestTag.substring(productPrefix.length);
  }

  // Parse the version (now tags should be in format X.Y.Z without build number)
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(versionStr);
  if (!m) throw new Error(`Bad tag format: ${latestTag} (extracted: ${versionStr}). Expected format: ${productPrefix || ''}X.Y.Z`);

  // Count commits since the tag to determine build number
  const commitCountOutput = await gitInNative('rev-list', `${latestTag}..HEAD`, '--count');
  const buildNumber = Number(commitCountOutput.stdout.trim());

  return {
    mode,
    tag: latestTag,
    version: `${m[1]}.${m[2]}.${m[3]}-${buildNumber}`,
    major: +m[1],
    minor: +m[2],
    patch: +m[3],
    build: buildNumber,
  };
}

export async function checkoutVersion(versionInfo: VersionInfo): Promise<() => Promise<void>> {
  if (versionInfo.mode === 'working' || !versionInfo.tag) {
    // No checkout needed for working mode
    return async () => { }; // noop cleanup
  }

  // Save current ref/branch
  const currentRef = (await gitInNative('rev-parse', '--abbrev-ref', 'HEAD')).stdout.trim();
  const isDetached = currentRef === 'HEAD';
  const restoreRef = isDetached
    ? (await gitInNative('rev-parse', 'HEAD')).stdout.trim()
    : currentRef;

  // Checkout the tag
  await gitInNative('checkout', versionInfo.tag);

  // Return cleanup function to restore original state
  return async () => {
    await gitInNative('checkout', restoreRef);
  };
}
