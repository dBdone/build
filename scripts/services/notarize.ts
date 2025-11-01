import { requireEnv } from '../utils/env.js';
import { sh } from './exec.js';

// Setup dedicated build keychain with signing certificates and notary credentials
// This should be run before each build (keychain has 2h timeout and is recreated each time)
export async function setupSigningKeychain() {
  const keychainName = 'build.keychain-db';
  const keychainPw = requireEnv('KEYCHAIN_PASSWORD');
  const p12File = requireEnv('P12_FILE');           // Path to Developer ID .p12 file
  const p12Password = requireEnv('P12_PASSWORD');   // Password for .p12 file
  const notaryProfile = requireEnv('NOTARY_PROFILE');
  const appleId = requireEnv('NOTARY_APPLE_ID');
  const teamId = requireEnv('NOTARY_TEAM_ID');
  const notaryPassword = requireEnv('NOTARY_PASSWORD');  // App-specific password

  // 1) Create + unlock a dedicated keychain (|| true because it might already exist)
  try {
    await sh('security', ['create-keychain', '-p', keychainPw, keychainName]);
  } catch {
    // Keychain might already exist, that's fine
  }

  // Set keychain settings: 2h timeout (7200 seconds), no auto-lock during build
  await sh('security', ['set-keychain-settings', '-lut', '7200', keychainName]);
  await sh('security', ['unlock-keychain', '-p', keychainPw, keychainName]);

  // 2) Make it primary in search list (so codesign/productsign find identities)
  await sh('security', ['list-keychains', '-d', 'user', '-s', keychainName, 'login.keychain-db']);
  await sh('security', ['default-keychain', '-s', keychainName]);

  // 3) Import Developer ID .p12 and allow signing tools to use it non-interactively
  await sh('security', [
    'import', p12File,
    '-k', keychainName,
    '-P', p12Password,
    '-T', '/usr/bin/codesign',
    '-T', '/usr/bin/productsign',
    '-T', '/usr/bin/pkgbuild',
    '-A'  // Allow all apps to access without warning
  ]);

  // 4) Add partition list so Apple tools can use the key without UI prompts
  await sh('security', [
    'set-key-partition-list',
    '-S', 'apple-tool:,apple:,codesign:',
    '-s',
    '-k', keychainPw,
    keychainName
  ]);

  // 5) Sanity check: list Developer ID identities
  await sh('security', ['find-identity', '-p', 'codesigning', keychainName]);

  // 6) Store notarization credentials
  await sh('xcrun', [
    'notarytool',
    'store-credentials',
    notaryProfile,
    '--apple-id', appleId,
    '--team-id', teamId,
    '--password', notaryPassword
  ]);
}

export async function notarizeAndStaple(pkgPath: string, profileEnv = 'NOTARY_PROFILE') {
  const profile = requireEnv(profileEnv);
  await sh('xcrun', ['notarytool', 'submit', pkgPath, '--keychain-profile', profile, '--wait']);
  await sh('xcrun', ['stapler', 'staple', pkgPath]);
}
