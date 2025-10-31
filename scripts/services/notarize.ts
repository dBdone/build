import { sh } from './exec.js';

export async function notarizeAndStaple(pkgPath: string, profileEnv = 'NOTARY_PROFILE') {
  const profile = process.env[profileEnv];
  if (!profile) throw new Error(`${profileEnv} not set`);
  await sh('xcrun', ['notarytool', 'submit', pkgPath, '--keychain-profile', profile, '--wait']);
  await sh('xcrun', ['stapler', 'staple', pkgPath]);
}
