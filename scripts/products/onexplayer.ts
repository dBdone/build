import path from 'node:path';
import fs from 'fs-extra';
import { Logger } from '../utils/logger.js';
import { fromBuild, fromNative } from '../utils/root.js';
import { pipeline } from '../utils/tasks.js';
import { computeVersion, checkoutVersion, VersionInfo, VersionMode } from '../utils/versioning.js';
import { runManifestStep, OnexReleaseManifest, loadOnexManifest } from '../services/onex_manifest.js';
import { buildInnoSetup, pkgbuild, validateMacPackageRootNoBundleCollisions } from '../services/installers.js';
import { signWindowsExecutable } from '../services/codesign_windows.js';
import { notarizeAndStaple, setupSigningKeychain } from '../services/notarize.js';
import { uploadToSupabase, upsertInstallerRow } from '../services/supabase.js';
import { sh } from '../services/exec.js';
import { requireEnv } from '../utils/env.js';

export interface OnexPlayerArgs {
    platform: 'mac' | 'win';
    mode: VersionMode;
    fakeVersion?: string;
    deploy?: boolean;
    manifestPath: string;
    tagPrefix: string;
    cleanPlayer?: boolean;
    skipNotarize?: boolean;
}

const PRODUCT_NAME = 'onexplayer';
const PRODUCT_TAG = 'dbd-oxpl';
const INSTALLER_DISPLAY_NAME = 'ONE-X Player';

export async function buildOnexPlayer(logger: Logger, args: OnexPlayerArgs) {
    await runBuildDependenciesStep(logger, args.platform);

    const distDir = fromBuild('dist', PRODUCT_NAME);
    const windowsIssPath = fromBuild('installer', 'onexplayer', 'windows', 'onexplayer.iss');

    await fs.emptyDir(distDir);

    const version: VersionInfo = await computeVersion(
        args.mode,
        args.fakeVersion ?? '9.9.9-9',
        args.tagPrefix
    );

    logger.info('Version resolved', version);

    const restoreGit = await checkoutVersion(version);

    try {
        const manifestFile = path.isAbsolute(args.manifestPath)
            ? args.manifestPath
            : fromBuild(args.manifestPath);

        const manifest = await loadOnexManifest(manifestFile);
        const nativeRepoRoot = fromNative(manifest.nativeRepo);

        if (args.cleanPlayer) {
            await cleanPlayerBuild(nativeRepoRoot, logger);
        }

        const platformConfig = manifest.platforms[args.platform];
        if (!platformConfig) {
            throw new Error(`Manifest does not define platform "${args.platform}"`);
        }

        const stageRoot = path.join(distDir, `${args.platform}-payload`);
        const macPkgRoot = path.join(distDir, 'mac-pkg-root');
        const macPkgOut = path.join(distDir, `ONE-X-Player-${version.version}.pkg`);

        const platformSteps: Array<[string, () => Promise<void>]> =
            args.platform === 'win'
                ? [
                    ['Sign staged Windows binaries', async () => {
                        await signWindowsPayload(stageRoot, logger);
                    }],
                    ['Build Windows installer (Inno Setup)', async () => {
                        await buildInnoSetup(windowsIssPath, version.version, stageRoot, true);
                    }],
                ]
                : [
                    ['Setup signing keychain', async () => {
                        await setupSigningKeychain();
                    }],
                    ['Sign staged macOS binaries and bundles', async () => {
                        await signMacPayload(stageRoot, logger);
                    }],
                    ['Assemble macOS pkg root', async () => {
                        await assembleMacPkgRoot(stageRoot, macPkgRoot);
                    }],
                    ['Validate pkg root bundle independence', async () => {
                        await validateMacPackageRootNoBundleCollisions(macPkgRoot, [
                            path.join('Library', 'Audio', 'Plug-Ins', 'VST3', 'ONE-X.vst3'),
                            path.join('Library', 'Audio', 'Plug-Ins', 'Components', 'ONE-X.component'),
                            path.join('Library', 'Application Support', 'Avid', 'Audio', 'Plug-Ins', 'ONE-X.aaxplugin'),
                        ]);
                    }],
                    ['Build signed macOS pkg', async () => {
                        await pkgbuild(
                            macPkgRoot,
                            'com.dbdone.onexplayer.pkg',
                            version.version,
                            macPkgOut,
                            requireEnv('MACOS_INSTALLER_SIGN_ID')
                        );
                    }],
                    ['Notarize + staple pkg', async () => {
                        if (args.skipNotarize) return;
                        await notarizeAndStaple(macPkgOut);
                    }],
                ];

        const semver = `${version.major}.${version.minor}.${version.patch}`;
        const appleBuildVersion = `${semver}.${version.build}`;
        const versionHeaderPath = path.join(nativeRepoRoot, 'player', 'Source', 'version.h');
        const pubspecPaths = [
            path.join(nativeRepoRoot, 'plugin_ui', 'pubspec.yaml'),
        ];
        const flutterVersion = `${semver}+${version.build}`;

        const resolveTemplate = (value: string) =>
            value
                .replaceAll('${version}', version.version)
                .replaceAll('${semver}', semver)
                .replaceAll('${build}', String(version.build))
                .replaceAll('${appleBuildVersion}', appleBuildVersion);

        await pipeline([
            ['Create staging directory', async () => {
                await fs.emptyDir(stageRoot);
            }],
            ['Write version header', async () => {
                await fs.writeFile(
                    versionHeaderPath,
                    `#pragma once\n\n#define SYSTEM_VERSION "${version.version}"\n`,
                    'utf-8'
                );
            }],
            ['Patch pubspec versions', async () => {
                for (const pubspecPath of pubspecPaths) {
                    const content = await fs.readFile(pubspecPath, 'utf-8');
                    const patched = content.replace(/^version: .+$/m, `version: ${flutterVersion}`);
                    await fs.writeFile(pubspecPath, patched, 'utf-8');
                }
            }],
            ...platformConfig.buildSteps.map((step: typeof platformConfig.buildSteps[number]) => {
                const resolvedStep = {
                    ...step,
                    cwd: resolveTemplate(step.cwd),
                    command: resolveTemplate(step.command),
                    args: (step.args ?? []).map(resolveTemplate),
                };

                return [
                    `Build step: ${step.name}`,
                    () => runManifestStep(resolvedStep, nativeRepoRoot, logger),
                ] as [string, () => Promise<void>];
            }),
            ['Stage build artifacts', async () => {
                await stageArtifacts(manifest, platformConfig, nativeRepoRoot, stageRoot, version.version, semver);
            }],
            ['Write build metadata', async () => {
                await fs.writeJson(path.join(distDir, 'build.info.json'), {
                    product: PRODUCT_NAME,
                    productTag: PRODUCT_TAG,
                    version: version.version,
                    mode: version.mode,
                    platform: args.platform,
                    tag: version.tag ?? null,
                    manifest: manifestFile,
                    skipNotarize: !!args.skipNotarize,
                    builtAtUtc: new Date().toISOString(),
                }, { spaces: 2 });
            }],
            ...platformSteps,
        ], logger);

        if (args.deploy) {
            const installerPath = args.platform === 'mac'
                ? macPkgOut
                : path.join(distDir, `${INSTALLER_DISPLAY_NAME} Installer.exe`);
            const storageFid = args.platform === 'mac'
                ? `ONE-X-Player-${version.version}.pkg`
                : `ONE-X-Player-${version.version}.exe`;

            await pipeline([
                ['Upload to Supabase', () => uploadToSupabase(installerPath, 'shop/installers', storageFid)],
                ['Upsert DB row', () => upsertInstallerRow(version.version, PRODUCT_TAG, args.platform, storageFid)],
            ], logger);
        }

        logger.info('onexplayer build staging completed', {
            platform: args.platform,
            version: version.version,
            distDir,
            stageRoot,
        });
    } finally {
        await restoreGit();
    }
}

async function runBuildDependenciesStep(logger: Logger, platform: 'mac' | 'win') {
    const scriptsDir = fromNative('sampler_platform', 'build_dependencies');
    const scriptFile = platform === 'win' ? 'build_deps.ps1' : 'build_deps.sh';
    const scriptPath = path.join(scriptsDir, scriptFile);

    if (!(await fs.pathExists(scriptPath))) {
        throw new Error(`Missing ONE-X dependency script: ${scriptPath}`);
    }

    logger.info('Run ONE-X dependency build step', { platform, scriptPath });

    if (platform === 'win') {
        await runWindowsPowerShellScript(scriptPath, scriptsDir, logger);
        return;
    }

    await sh('zsh', [scriptPath], { cwd: scriptsDir });
}

async function runWindowsPowerShellScript(scriptPath: string, cwd: string, logger: Logger) {
    try {
        // Prefer PowerShell 7+, which reliably reads UTF-8 scripts without BOM.
        await sh('pwsh', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { cwd });
        return;
    } catch (error) {
        const maybeError = error as NodeJS.ErrnoException;
        if (maybeError?.code !== 'ENOENT') {
            throw error;
        }

        logger.info('pwsh not found, falling back to Windows PowerShell', { scriptPath });
        await sh('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { cwd });
    }
}

async function signWindowsPayload(stageRoot: string, logger: Logger) {
    const signableExtensions = new Set(['.exe', '.dll', '.vst3', '.aaxplugin']);
    const files = await collectFilesRecursively(stageRoot);

    const signTargets = files.filter((filePath) => {
        const extension = path.extname(filePath).toLowerCase();
        return signableExtensions.has(extension);
    });

    for (const target of signTargets.sort()) {
        logger.info('Sign Windows binary', { target });
        await signWindowsExecutable(target);
    }
}

async function signMacPayload(stageRoot: string, logger: Logger) {
    const identity = requireEnv('MACOS_APP_SIGN_ID');

    await normalizeFrameworkLayouts(stageRoot, logger);

    const bundleExtensions = new Set(['.framework', '.app', '.vst3', '.component', '.aaxplugin', '.bundle']);
    const binaryExtensions = new Set(['.dylib', '.so']);

    const dirs = await collectDirsRecursively(stageRoot);
    const files = await collectFilesRecursively(stageRoot);

    const binaryTargets = files
        .filter((filePath) => binaryExtensions.has(path.extname(filePath).toLowerCase()))
        .sort();

    for (const target of binaryTargets) {
        logger.info('Sign macOS binary', { target });
        await sh('codesign', ['--force', '--timestamp', '--options', 'runtime', '--sign', identity, target]);
    }

    const bundleTargets = dirs
        .filter((dirPath) => bundleExtensions.has(path.extname(dirPath).toLowerCase()))
        .sort((a, b) => depth(b) - depth(a));

    for (const target of bundleTargets) {
        logger.info('Sign macOS bundle', { target });
        await sh('codesign', ['--force', '--timestamp', '--options', 'runtime', '--sign', identity, target]);
    }
}

async function normalizeFrameworkLayouts(stageRoot: string, logger: Logger) {
    const dirs = await collectDirsRecursively(stageRoot);
    const frameworks = dirs.filter((dirPath) => path.extname(dirPath).toLowerCase() === '.framework');

    for (const frameworkPath of frameworks) {
        const versionsDir = path.join(frameworkPath, 'Versions');
        const versionAPath = path.join(versionsDir, 'A');

        if (!(await fs.pathExists(versionAPath))) {
            continue;
        }

        // Ensure canonical framework links so codesign can classify/sign correctly.
        const frameworkBinaryName = path.basename(frameworkPath, '.framework');

        await ensureSymlinkPath(path.join(versionsDir, 'Current'), 'A');

        const versionABinary = path.join(versionAPath, frameworkBinaryName);
        if (await fs.pathExists(versionABinary)) {
            await ensureSymlinkPath(
                path.join(frameworkPath, frameworkBinaryName),
                path.join('Versions', 'Current', frameworkBinaryName)
            );
        }

        const versionAResources = path.join(versionAPath, 'Resources');
        if (await fs.pathExists(versionAResources)) {
            await ensureSymlinkPath(path.join(frameworkPath, 'Resources'), path.join('Versions', 'Current', 'Resources'));
        }

        logger.info('Normalized framework layout', { frameworkPath });
    }
}

async function ensureSymlinkPath(linkPath: string, target: string) {
    if (await fs.pathExists(linkPath)) {
        const stat = await fs.lstat(linkPath);
        if (stat.isSymbolicLink()) {
            const currentTarget = await fs.readlink(linkPath);
            if (currentTarget === target) return;
        }

        await fs.remove(linkPath);
    }

    await fs.symlink(target, linkPath);
}

async function assembleMacPkgRoot(stageRoot: string, macPkgRoot: string) {
    const vst3Target = path.join(macPkgRoot, 'Library', 'Audio', 'Plug-Ins', 'VST3', 'ONE-X.vst3');
    const auTarget = path.join(macPkgRoot, 'Library', 'Audio', 'Plug-Ins', 'Components', 'ONE-X.component');
    const aaxTarget = path.join(macPkgRoot, 'Library', 'Application Support', 'Avid', 'Audio', 'Plug-Ins', 'ONE-X.aaxplugin');

    await fs.emptyDir(macPkgRoot);

    const stagedVst3 = path.join(stageRoot, 'plugins', 'vst3', 'ONE-X.vst3');
    if (await fs.pathExists(stagedVst3)) {
        await fs.ensureDir(path.dirname(vst3Target));
        await fs.copy(stagedVst3, vst3Target);
    }

    const stagedAu = path.join(stageRoot, 'plugins', 'au', 'ONE-X.component');
    if (await fs.pathExists(stagedAu)) {
        await fs.ensureDir(path.dirname(auTarget));
        await fs.copy(stagedAu, auTarget);
    }

    const stagedAax = path.join(stageRoot, 'plugins', 'aax', 'ONE-X.aaxplugin');
    if (await fs.pathExists(stagedAax)) {
        await fs.ensureDir(path.dirname(aaxTarget));
        await fs.copy(stagedAax, aaxTarget);
    }
}

async function collectFilesRecursively(root: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(root, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(root, entry.name);
        if (entry.isDirectory()) {
            files.push(...await collectFilesRecursively(fullPath));
            continue;
        }

        if (entry.isFile()) {
            files.push(fullPath);
        }
    }

    return files;
}

async function collectDirsRecursively(root: string): Promise<string[]> {
    const dirs: string[] = [];
    const entries = await fs.readdir(root, { withFileTypes: true });

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const fullPath = path.join(root, entry.name);
        dirs.push(fullPath);
        dirs.push(...await collectDirsRecursively(fullPath));
    }

    return dirs;
}

function depth(filePath: string): number {
    return filePath.split(path.sep).length;
}

async function stageArtifacts(
    manifest: OnexReleaseManifest,
    platformConfig: OnexReleaseManifest['platforms']['mac'] | OnexReleaseManifest['platforms']['win'],
    nativeRepoRoot: string,
    stageRoot: string,
    version: string,
    semver: string
) {
    const resolveTemplate = (value: string) =>
        value.replaceAll('${version}', version).replaceAll('${semver}', semver);

    for (const artifact of platformConfig.artifacts) {
        const fromPath = path.join(nativeRepoRoot, artifact.from);
        const toPath = path.join(stageRoot, resolveTemplate(artifact.to));

        if (!(await fs.pathExists(fromPath))) {
            throw new Error(`Required artifact is missing: ${fromPath}`);
        }

        await fs.ensureDir(path.dirname(toPath));
        await fs.copy(fromPath, toPath, { overwrite: true, errorOnExist: false });
    }

    for (const runtime of platformConfig.thirdPartyRuntime) {
        const fromPath = path.join(nativeRepoRoot, runtime.from);
        const toPath = path.join(stageRoot, resolveTemplate(runtime.to));

        if (!(await fs.pathExists(fromPath))) {
            throw new Error(`Required runtime dependency is missing: ${fromPath}`);
        }

        await fs.ensureDir(path.dirname(toPath));
        await fs.copy(fromPath, toPath, { overwrite: true, errorOnExist: false });
    }
}

async function cleanPlayerBuild(nativeRepoRoot: string, logger: Logger) {
    const playerBuildDir = path.join(nativeRepoRoot, 'player', 'build-cmake');

    if (!(await fs.pathExists(playerBuildDir))) {
        logger.info('Player build directory does not exist, skipping clean', { playerBuildDir });
        return;
    }

    logger.info('Cleaning player build directory', { playerBuildDir });
    await fs.remove(playerBuildDir);
}
