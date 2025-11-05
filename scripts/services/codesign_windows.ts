import { requireEnv } from '../utils/env.js';
import { sh } from './exec.js';

/**
 * Sign a Windows executable or installer using signtool.
 * Uses certificate SHA1 thumbprint and timestamp server.
 */
export async function signWindowsExecutable(exePath: string) {
  const signtool = requireEnv('SIGNTOOL_EXE');
  const certThumbprint = requireEnv('WINDOWS_CERT_SHA1');
  
  await sh(signtool, [
    'sign',
    '/fd', 'sha256',
    '/tr', 'http://ts.ssl.com',
    '/td', 'sha256',
    '/sha1', certThumbprint,
    exePath
  ]);
}
