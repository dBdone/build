import { requireEnv } from '../utils/env.js';
import { fromBuild } from '../utils/root.js';
import { sh } from './exec.js';
import path from 'node:path';
import fs from 'fs-extra';

export async function buildInnoSetup(issPath: string, version: string, stagingDir: string) {
  const iscc = requireEnv('ISCC_EXE');
  const installerRoot = fromBuild('installer');
  const termsRtf = path.join(installerRoot, 'terms-of-service.rtf');
  
  // Convert terms.md to RTF using pandoc
  const termsMd = path.join(installerRoot, 'terms.md');
  await sh('pandoc', ['-s', '-f', 'gfm', '-t', 'rtf', '-o', termsRtf, termsMd]);
  
  // Read the .iss template
  let issContent = await fs.readFile(issPath, 'utf-8');
  
  // Patch version
  issContent = issContent.replace(/^AppVersion=.*/m, `AppVersion=${version}`);
  
  // Write to a temporary .iss file in the staging area
  const tempIss = path.join(stagingDir, path.basename(issPath));
  await fs.writeFile(tempIss, issContent, 'utf-8');
  
  // Run Inno Setup compiler
  await sh(iscc, [tempIss]);
}

export async function productbuild(distributionXml: string, packagePath: string, outPkg: string) {
  await sh('productbuild', ['--distribution', distributionXml, '--package-path', packagePath, outPkg]);
}
