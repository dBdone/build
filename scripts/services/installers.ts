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

export async function productbuild(
  distributionXml: string,
  packagePath: string,
  outPkg: string,
  resourcesDir?: string,
  signIdentity?: string,
  version?: string  // If provided, will patch version in distribution XML
) {
  let xmlToUse = distributionXml;

  // If version is provided, create a temporary patched copy of the distribution XML
  if (version) {
    const xmlContent = await fs.readFile(distributionXml, 'utf-8');

    // Patch version in title (matches legacy: <title>Pentimento Version 1.2.3+4</title>)
    const patchedContent = xmlContent.replace(
      /(<title>.*?Version )[0-9]+\.[0-9]+\.[0-9]+[-+][0-9]+(<\/title>)/,
      `$1${version}$2`
    );

    // Write to temporary file in the same directory
    const tempXml = distributionXml.replace(/\.xml$/, '.tmp.xml');
    await fs.writeFile(tempXml, patchedContent, 'utf-8');
    xmlToUse = tempXml;
  }

  try {
    const args = ['--distribution', xmlToUse, '--package-path', packagePath];
    if (resourcesDir) {
      args.push('--resources', resourcesDir);
    }
    if (signIdentity) {
      args.push('--sign', signIdentity);
    }
    args.push(outPkg);
    await sh('productbuild', args);
  } finally {
    // Clean up temporary XML file if we created one
    if (version && xmlToUse !== distributionXml) {
      await fs.remove(xmlToUse);
    }
  }
}

// Prepare macOS installer resources (terms HTML) from markdown source
export async function prepareMacInstallerResources() {
  const installerRoot = fromBuild('installer');
  const termsMd = path.join(installerRoot, 'terms.md');
  const macResources = fromBuild('macOS', 'installer', 'resources');

  // ensure resources dir exists
  await fs.ensureDir(macResources);

  const outHtml = path.join(macResources, 'terms-of-service.html');

  // Use pandoc to convert markdown to standalone HTML with embedded resources
  await sh('pandoc', ['-s', '-f', 'gfm', '-t', 'html5', '--embed-resources', '--standalone', '-o', outHtml, termsMd]);
}

// Definition for a single macOS package to be built
export interface MacPackageSpec {
  identifier: string;        // e.g., 'com.dbdone.pentimento.vst3'
  filename: string;          // e.g., 'pentimentoVST.pkg'
  stage: (stagingRoot: string) => Promise<void>;  // Function to populate staging directory
}

// Build macOS packages from a list of package specifications
// Uses a single staging directory, building packages sequentially and clearing between each
export async function buildMacPackages(
  specs: MacPackageSpec[],
  version: string,
  outputDir: string
): Promise<string[]> {

  const signIdentity = requireEnv('MACOS_INSTALLER_SIGN_ID');

  const stagingRoot = path.join(outputDir, 'pkg-staging');
  const pkgDir = path.join(outputDir, 'packages');
  await fs.ensureDir(pkgDir);

  const builtPackages: string[] = [];

  for (const spec of specs) {
    // Clear staging directory
    await fs.emptyDir(stagingRoot);

    // Let the spec populate the staging directory with its content
    await spec.stage(stagingRoot);

    // Build the .pkg
    const outPkg = path.join(pkgDir, spec.filename);
    await pkgbuild(stagingRoot, spec.identifier, version, outPkg, signIdentity);
    builtPackages.push(outPkg);
  }

  // Clean up staging directory
  await fs.remove(stagingRoot);

  return builtPackages;
}

// Run pkgbuild to create a .pkg from a package root directory
export async function pkgbuild(rootDir: string, identifier: string, version: string, outPkg: string, signIdentity?: string) {
  const args = [
    '--root', rootDir,
    '--identifier', identifier,
    '--version', version,
    '--install-location', '/',
  ];

  if (signIdentity) {
    args.push('--sign', signIdentity);
  }

  args.push(outPkg);
  await sh('pkgbuild', args);
}
