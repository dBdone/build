import { sh } from './exec.js';
import { requireEnv } from '../utils/env.js';
import { fromBuild } from '../utils/root.js';
import path from 'node:path';
import fs from 'fs-extra';

// Remove existing AAX plugin from system directory (requires sudo on macOS)
export async function removeInstalledAAXPlugin(pluginName: string) {
  const aaxSystemPath = `/Library/Application Support/Avid/Audio/Plug-Ins/${pluginName}.aaxplugin`;

  // Check if the plugin exists before attempting removal
  if (await fs.pathExists(aaxSystemPath)) {
    await sh('sudo', ['rm', '-rf', aaxSystemPath]);
  }
}

export interface AAXSigningOptions {
  pluginPath: string;       // Path to unsigned AAX plugin (will be replaced with signed version)
  autoinstall?: boolean;    // Auto-install after signing (default: false)
}


export async function signAAXPlugin(options: AAXSigningOptions) {

  const { pluginPath, autoinstall = false } = options;

  const account = requireEnv('AAX_ACCOUNT');
  const password = requireEnv('AAX_PASSWORD');
  const wcguid = requireEnv('AAX_WCGUID');

  const wraptoolExe = process.env['AAX_WRAPTOOL'] || 'wraptool';
  const isWindows = process.platform === 'win32';

  const tmpDir = fromBuild('tmp', 'aax-signing');
  await fs.ensureDir(tmpDir);
  const tmpOutput = path.join(tmpDir, path.basename(pluginPath));
  if (await fs.pathExists(tmpOutput)) await fs.remove(tmpOutput);

  const args: string[] = [
    'sign',
    '--verbose',
    '--account', account,
    '--password', password,
    '--wcguid', wcguid,
    '--in', path.resolve(pluginPath),
    '--out', path.resolve(tmpOutput),
  ];

  if (isWindows) {
    // Use the same EV thumbprint you already use with signtool /sha1
    const certThumbprint = requireEnv('WINDOWS_CERT_SHA1');
    const signtool = requireEnv('SIGNTOOL_EXE');

    // IMPORTANT: --signid must be after "sign"
    args.splice(1, 0, '--signid', certThumbprint);

    // Tell wraptool exactly which signtool to call (helps a lot on CI boxes)
    args.push('--signtool', signtool);

    // Common wraptool option (seen in the wild)
    args.push('--extrasigningoptions', 'digest_sha256');
  } else {
    // macOS: keep whatever you already had (Developer ID identity etc.)
    const macSignId = process.env['AAX_MAC_SIGNID'];
    const keyfile = requireEnv('AAX_KEYFILE');
    const keypassword = requireEnv('AAX_KEYPASSWORD');

    if (macSignId && macSignId.trim()) {
      args.splice(1, 0, '--signid', macSignId.trim());
    }

    args.push(
      '--keyfile', path.resolve(keyfile),
      '--keypassword', keypassword
    );
  }

  if (autoinstall) args.push('--autoinstall', 'on');

  await sh(wraptoolExe, args);

  await fs.move(tmpOutput, pluginPath, { overwrite: true });

  // Verify right away (Windows)
  if (isWindows) {
    const signtool = requireEnv('SIGNTOOL_EXE');
    await sh(signtool, ['verify', '/pa', '/v', '/tw', path.resolve(pluginPath)]);
  }
}

/*
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
*/