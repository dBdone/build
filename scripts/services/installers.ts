import { requireEnv } from '../utils/env.js';
import { fromBuild } from '../utils/root.js';
import { sh } from './exec.js';
import path from 'node:path';
import fs from 'fs-extra';
import { signWindowsExecutable } from './codesign_windows.js';

export async function buildInnoSetup(
  issPath: string,
  version: string,
  stagingDir: string,
  sign: boolean = false,
  termsMdPath?: string
) {
  const iscc = requireEnv('ISCC_EXE');
  const installerRoot = fromBuild('installer');
  const termsRtf = path.join(installerRoot, 'terms-of-service.rtf');

  // Convert terms.md to RTF using pandoc
  const termsMd = termsMdPath ?? path.join(installerRoot, 'terms.md');
  await sh('pandoc', ['-s', '-f', 'gfm', '-t', 'rtf', '-o', termsRtf, termsMd]);

  // Read the .iss template
  let issContent = await fs.readFile(issPath, 'utf-8');

  // Patch version
  issContent = issContent.replace(/^AppVersion=.*/m, `AppVersion=${version}`);

  // Determine where to write the temp .iss file
  // If stagingDir is empty/not provided, create temp file next to original
  const tempIss = stagingDir
    ? path.join(stagingDir, path.basename(issPath))
    : issPath + '.tmp';

  await fs.writeFile(tempIss, issContent, 'utf-8');

  // Extract OutputDir and OutputBaseFilename from .iss to determine the installer path
  const outputDirMatch = issContent.match(/^OutputDir=(.*)$/m);
  const outputBaseFilenameMatch = issContent.match(/^OutputBaseFilename="?([^"\r\n]+)"?$/m);

  if (!outputDirMatch || !outputBaseFilenameMatch) {
    throw new Error('Could not find OutputDir or OutputBaseFilename in .iss file');
  }

  // Resolve OutputDir relative to where the temp .iss file will be (not the original)
  const tempIssDir = path.dirname(tempIss);
  const outputDir = path.resolve(tempIssDir, outputDirMatch[1].trim());
  const installerName = outputBaseFilenameMatch[1].trim();
  const installerPath = path.join(outputDir, `${installerName}.exe`);

  try {
    // Run Inno Setup compiler
    await sh(iscc, [tempIss]);

    // Sign the installer if requested
    if (sign) {
      await signWindowsExecutable(installerPath);
    }
  } finally {
    // Clean up temp file if we created it next to the original
    if (!stagingDir && tempIss !== issPath) {
      await fs.remove(tempIss);
    }
  }
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

export interface PackageCollisionIssue {
  code: string;
  message: string;
  paths: string[];
}

// Validate that package bundle roots are physically independent before pkgbuild.
// This catches cross-bundle hardlinks/symlinks that can trigger installer extraction collisions.
export async function validateMacPackageRootNoBundleCollisions(
  rootDir: string,
  relativeBundleRoots: string[]
): Promise<void> {
  const normalized = [...new Set(relativeBundleRoots.map((p) => path.normalize(p)))]
    .map((p) => p.replace(/^\/+/, ''));

  const absoluteBundleRoots = normalized.map((relPath) => path.join(rootDir, relPath));
  const issues: PackageCollisionIssue[] = [];

  for (const bundlePath of absoluteBundleRoots) {
    if (!(await fs.pathExists(bundlePath))) {
      issues.push({
        code: 'MISSING_BUNDLE_ROOT',
        message: 'Expected bundle root is missing in package root.',
        paths: [bundlePath],
      });
      continue;
    }

    const stat = await fs.lstat(bundlePath);
    if (!stat.isDirectory()) {
      issues.push({
        code: 'INVALID_BUNDLE_ROOT',
        message: 'Expected bundle root is not a directory.',
        paths: [bundlePath],
      });
    }
  }

  if (issues.length) {
    throw new Error(formatPackageCollisionIssues(rootDir, issues));
  }

  const realRootMap = new Map<string, string[]>();
  for (const bundlePath of absoluteBundleRoots) {
    const resolved = await fs.realpath(bundlePath);
    const existing = realRootMap.get(resolved);
    if (existing) {
      existing.push(bundlePath);
    } else {
      realRootMap.set(resolved, [bundlePath]);
    }
  }

  for (const collidingRoots of realRootMap.values()) {
    if (collidingRoots.length > 1) {
      issues.push({
        code: 'BUNDLE_ROOT_ALIAS',
        message: 'Multiple bundle roots resolve to the same physical path.',
        paths: collidingRoots,
      });
    }
  }

  type Ownership = { bundleRoot: string; path: string };
  const inodeOwners = new Map<string, Ownership[]>();

  for (const bundlePath of absoluteBundleRoots) {
    const bundleRealRoot = await fs.realpath(bundlePath);
    const entries = await collectDirsAndFiles(bundlePath);

    for (const entryPath of entries) {
      const stat = await fs.lstat(entryPath);

      if (stat.isSymbolicLink()) {
        let resolvedEntry: string;
        try {
          resolvedEntry = await fs.realpath(entryPath);
        } catch (error: any) {
          if (error?.code === 'ENOENT') {
            issues.push({
              code: 'BROKEN_SYMLINK',
              message: 'Symlink target does not exist.',
              paths: [entryPath, bundlePath],
            });
            continue;
          }
          throw error;
        }

        if (!isWithin(resolvedEntry, bundleRealRoot)) {
          issues.push({
            code: 'EXTERNAL_SYMLINK_TARGET',
            message: 'Symlink target resolves outside its bundle root.',
            paths: [entryPath, resolvedEntry, bundlePath],
          });
        }
        continue;
      }

      if (!stat.isFile()) {
        continue;
      }

      if (stat.nlink <= 1) {
        continue;
      }

      const inodeKey = `${stat.dev}:${stat.ino}`;
      const owners = inodeOwners.get(inodeKey) ?? [];
      owners.push({ bundleRoot: bundlePath, path: entryPath });
      inodeOwners.set(inodeKey, owners);
    }
  }

  for (const owners of inodeOwners.values()) {
    const uniqueBundleRoots = [...new Set(owners.map((owner) => owner.bundleRoot))];
    if (uniqueBundleRoots.length <= 1) {
      continue;
    }

    issues.push({
      code: 'CROSS_BUNDLE_HARDLINK',
      message: 'A hardlinked file is shared across different bundle roots.',
      paths: owners.map((owner) => owner.path),
    });
  }

  if (issues.length) {
    throw new Error(formatPackageCollisionIssues(rootDir, issues));
  }
}

async function collectDirsAndFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const queue: string[] = [root];

  while (queue.length) {
    const dirPath = queue.pop()!;
    const entries = await fs.readdir(dirPath);
    for (const name of entries) {
      const fullPath = path.join(dirPath, name);
      out.push(fullPath);

      const stat = await fs.lstat(fullPath);
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        queue.push(fullPath);
      }
    }
  }

  return out;
}

function isWithin(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function formatPackageCollisionIssues(rootDir: string, issues: PackageCollisionIssue[]): string {
  const lines = [
    `Packaging preflight failed for ${rootDir}.`,
    'Detected bundle collision risks:',
  ];

  for (const issue of issues) {
    lines.push(`- [${issue.code}] ${issue.message}`);
    for (const issuePath of issue.paths) {
      lines.push(`  - ${issuePath}`);
    }
  }

  lines.push('Refusing to run pkgbuild with an unsafe package root.');
  return lines.join('\n');
}
