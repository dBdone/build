import { sh } from './exec.js';
import { requireEnv } from '../utils/env.js';
import { fromBuild } from '../utils/root.js';
import path from 'node:path';
import fs from 'fs-extra';

export interface AAXSigningOptions {
  pluginPath: string;       // Path to unsigned AAX plugin (will be replaced with signed version)
  autoinstall?: boolean;    // Auto-install after signing (default: false)
}

export async function signAAXPlugin(options: AAXSigningOptions) {
  const {
    pluginPath,
    autoinstall = false
  } = options;

  // Read all credentials from .env
  const account = requireEnv('AAX_ACCOUNT');
  const password = requireEnv('AAX_PASSWORD');
  const wcguid = requireEnv('AAX_WCGUID');
  const keyfile = requireEnv('AAX_KEYFILE');
  const keypassword = requireEnv('AAX_KEYPASSWORD');
  // Optional mac-specific signing identity and wraptool path
  const signid = process.env['AAX_SIGNID'];
  const wraptoolExe = process.env['AAX_WRAPTOOL'] || 'wraptool';

  // Create temp directory for signed output
  const tmpDir = fromBuild('tmp', 'aax-signing');
  await fs.ensureDir(tmpDir);
  const tmpOutput = path.join(tmpDir, path.basename(pluginPath));

  // Remove existing temp output if present
  if (await fs.pathExists(tmpOutput)) {
    await fs.remove(tmpOutput);
  }

  // Build wraptool arguments
  const args: string[] = [
    'sign',
    '--verbose',
    '--account', account,
    '--password', password,
    '--wcguid', wcguid,
    '--keyfile', path.resolve(keyfile),
    '--keypassword', keypassword,
    '--in', path.resolve(pluginPath),
    '--out', path.resolve(tmpOutput),
  ];

  // If a mac Developer ID signing identity is provided, pass it through.
  if (signid && signid.trim() !== '') {
    args.unshift('--signid', signid);
  }

  if (autoinstall) {
    args.push('--autoinstall', 'on');
  }

  // Run wraptool
  await sh(wraptoolExe, args);

  // Move signed plugin back to replace unsigned version
  await fs.move(tmpOutput, pluginPath, { overwrite: true });
}
