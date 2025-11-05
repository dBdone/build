import path from 'node:path';
import { fromBuild, fromNative } from '../utils/root';
import fs from 'fs-extra';
import { pipeline, runTask } from '../utils/tasks.js';
import { Logger } from '../utils/logger.js';
import { computeVersion, checkoutVersion, VersionMode, VersionInfo } from '../utils/versioning.js';
import { patchAndResaveJucerNextToOriginal } from '../services/projucer.js';
import { xcodeBuild } from '../services/xcode.js';
import { productbuild, buildInnoSetup, prepareMacInstallerResources, buildMacPackages, MacPackageSpec } from '../services/installers.js';
import { notarizeAndStaple, setupSigningKeychain } from '../services/notarize.js';
import { uploadToSupabase, upsertInstallerRow } from '../services/supabase.js';
import { buildBackendLib } from '../services/backendlib.js';
import { signAAXPlugin, removeInstalledAAXPlugin } from '../services/aax_signing.js';
import { sh } from '../services/exec.js';

export interface AppArgs {
    platform: 'mac' | 'win';
    mode: VersionMode;                 // 'working' | 'latest'
    fakeVersion?: string;              // default "9.9.9-9" for working
    deploy?: boolean;                  // upload + DB insert
    skipNotarize?: boolean;            // for local dry builds
}

const APP_PRODUCT_TAG = 'app';
const APP_ROOT = fromNative('app');
const PLUGIN_ROOT = fromNative('plugins', 'dbdone');
const XCODE_BUILD_ROOT = path.join(PLUGIN_ROOT, 'Builds/MacOSX/');
const MSVC_BUILD_ROOT = path.join(PLUGIN_ROOT, 'Builds/VisualStudio2022/');
const INSTALLER_ROOT = fromBuild('installer');
const APP_INSTALLER_ROOT = path.join(INSTALLER_ROOT, 'app');

const paths = {
    pluginJucer: path.join(PLUGIN_ROOT, 'dbdone.jucer'),
    versionHeader: path.join(PLUGIN_ROOT, 'Source/version.h'),
    flutterApp: APP_ROOT,
    pubspecYaml: path.join(APP_ROOT, 'pubspec.yaml'),
    pubspecLock: path.join(APP_ROOT, 'pubspec.lock'),
    xcode: {
        plugin: { project: path.join(XCODE_BUILD_ROOT, 'dbdone.xcodeproj'), scheme: 'dbdone - All', config: 'Release' },
        app: { workspace: path.join(APP_ROOT, 'macos/Runner.xcworkspace'), scheme: 'Runner' }
    },
    msvc: { solution: path.join(MSVC_BUILD_ROOT, 'dbdone.sln'), config: 'Release' },
    dist: fromBuild('dist', 'app'),
    pkg: fromBuild('dist', 'app', 'dBdone.pkg'),
    symbols: fromBuild('symbols'),
    archive: fromBuild('archive'),
    iss: path.join(APP_INSTALLER_ROOT, 'windows', 'app.iss'),
};

export async function buildApp(logger: Logger, args: AppArgs) {
    // Clear and ensure dist directory for clean build
    await fs.emptyDir(paths.dist);

    const version: VersionInfo = await computeVersion(args.mode, args.fakeVersion ?? '9.9.9-9', 'APP_V');
    logger.info(`Version resolved`, version);

    // Checkout the version if in 'latest' mode
    const restoreGit = await checkoutVersion(version);

    try {
        // Common preparatory steps
        await pipeline([
            ['Write version header', async () => {
                const versionHeaderContent = `#pragma once

#define SYSTEM_VERSION "${version.version}"
`;
                await fs.writeFile(paths.versionHeader, versionHeaderContent, 'utf-8');
            }],
            ['Patch & resave .jucer', () => patchAndResaveJucerNextToOriginal(logger, paths.pluginJucer, `${version.major}.${version.minor}.${version.patch}`)],
            ['Build backend lib', () => buildBackendLib(args.platform, 'Release')],
        ], logger);

        if (args.platform === 'mac') {
            // Remove existing AAX plugin from system (requires sudo)
            await runTask('Remove installed AAX plugin', () => removeInstalledAAXPlugin('dbdone'), { logger });

            // Setup signing keychain with certificates and notary credentials
            await runTask('Setup signing keychain', () => setupSigningKeychain(), { logger });

            // Build Flutter app
            const pubspecBackup = paths.pubspecYaml + '.backup';
            const pubspecLockBackup = paths.pubspecLock + '.backup';
            const hadPubspecLock = await fs.pathExists(paths.pubspecLock);
            try {
                // Create backups before any mutation so we can reliably restore later
                await fs.copy(paths.pubspecYaml, pubspecBackup);
                if (hadPubspecLock) await fs.copy(paths.pubspecLock, pubspecLockBackup);

                await pipeline([
                    ['Patch Flutter pubspec.yaml version', async () => {
                        // Convert version format: 1.2.3-4 -> 1.2.3+4 (Flutter format)
                        const pubspecVersion = version.version.replace(/^([0-9]+\.[0-9]+\.[0-9]+)-([0-9]+)$/, '$1+$2');

                        const pubspecContent = await fs.readFile(paths.pubspecYaml, 'utf-8');
                        const patchedContent = pubspecContent.replace(/^(version:\s*).*/m, `$1${pubspecVersion}`);
                        await fs.writeFile(paths.pubspecYaml, patchedContent, 'utf-8');
                    }],
                    ['Flutter clean', async () => {
                        await sh('flutter', ['clean'], { cwd: paths.flutterApp });
                    }],
                    ['Flutter build macos', async () => {
                        await sh('flutter', ['build', 'macos'], { cwd: paths.flutterApp });
                    }],
                    ['Xcode archive Flutter app', async () => {
                        await fs.emptyDir(paths.symbols);
                        const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0].replace('T', '-');
                        const symbolsPath = path.join(paths.symbols, timestamp);

                        await sh('xcodebuild', [
                            'archive',
                            '-quiet',
                            '-destination', 'generic/platform=macOS,name=Any Mac',
                            '-workspace', paths.xcode.app.workspace,
                            '-scheme', paths.xcode.app.scheme,
                            '-archivePath', 'dbdone.xcarchive',
                            'DART_OBFUSCATION=true',
                            `SPLIT_DEBUG_INFO=${symbolsPath}`
                        ]);
                    }],
                ], logger);

                // Build dbdone plugin
                await runTask('Xcode build dbdone plugin (AU/VST3/AAX)', () =>
                    xcodeBuild(paths.xcode.plugin.project, paths.xcode.plugin.scheme, paths.xcode.plugin.config), { logger });

                // Sign AAX plugin produced by Xcode (post-build)
                await runTask('Sign AAX plugin (mac)', async () => {
                    const aaxBuilt = path.join(XCODE_BUILD_ROOT, 'build/Release/dbdone.aaxplugin');
                    await signAAXPlugin({ pluginPath: aaxBuilt });
                }, { logger });

                // Package .pkg with content
                await pipeline([
                    ['Prepare macOS installer resources', () => prepareMacInstallerResources()],
                    ['Build macOS packages', async () => {
                        const backendLibPath = fromNative('components/dbDoneBackend/Builds/MacOSX/build/Release/dbdone_backend.dylib');

                        // Define package specifications
                        const packages: MacPackageSpec[] = [
                            {
                                identifier: 'com.dbdone.app.pkg',
                                filename: 'dBdoneAPP.pkg',
                                stage: async (root) => {
                                    const target = path.join(root, 'Applications', 'dBdone.app');
                                    await fs.ensureDir(path.dirname(target));
                                    // Extract from xcarchive
                                    const archiveApp = 'dbdone.xcarchive/Products/Applications/dBdone.app';
                                    await fs.copy(archiveApp, target);
                                }
                            },
                            {
                                identifier: 'com.dbdone.dbdonevst.pkg',
                                filename: 'dBdoneVST.pkg',
                                stage: async (root) => {
                                    const target = path.join(root, 'Library', 'Audio', 'Plug-Ins', 'VST3', 'dbdone.vst3');
                                    await fs.ensureDir(path.dirname(target));
                                    await fs.copy(path.join(XCODE_BUILD_ROOT, 'build/Release/dbdone.vst3'), target);
                                }
                            },
                            {
                                identifier: 'com.dbdone.dbdoneau.pkg',
                                filename: 'dBdoneAU.pkg',
                                stage: async (root) => {
                                    const target = path.join(root, 'Library', 'Audio', 'Plug-Ins', 'Components', 'dbdone.component');
                                    await fs.ensureDir(path.dirname(target));
                                    await fs.copy(path.join(XCODE_BUILD_ROOT, 'build/Release/dbdone.component'), target);
                                }
                            },
                            {
                                identifier: 'com.dbdone.dbdoneaax.pkg',
                                filename: 'dBdoneAAX.pkg',
                                stage: async (root) => {
                                    const target = path.join(root, 'Library', 'Application Support', 'Avid', 'Audio', 'Plug-Ins', 'dbdone.aaxplugin');
                                    await fs.ensureDir(path.dirname(target));
                                    await fs.copy(path.join(XCODE_BUILD_ROOT, 'build/Release/dbdone.aaxplugin'), target);
                                }
                            },
                            {
                                identifier: 'com.dbdone.appbasic.pkg',
                                filename: 'appBASIC.pkg',
                                stage: async (root) => {
                                    const target = path.join(root, 'Library', 'Application Support', 'com.dbdone.dbdone-app', 'dbdone_backend.dylib');
                                    await fs.ensureDir(path.dirname(target));
                                    await fs.copy(backendLibPath, target);
                                }
                            }
                        ];

                        await buildMacPackages(packages, version.version, paths.dist);
                    }],
                    ['productbuild', () => {
                        const distXml = path.join(APP_INSTALLER_ROOT, 'macOS', 'distribution_app.xml');
                        const pkgDir = path.join(paths.dist, 'packages');
                        const resources = fromBuild('macOS', 'installer', 'resources');
                        const signIdentity = process.env.MACOS_INSTALLER_SIGN_ID;
                        return productbuild(distXml, pkgDir, paths.pkg, resources, signIdentity, version.version);
                    }],
                    ['Archive debug symbols', async () => {
                        const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0].replace('T', '-');
                        const archiveDir = path.join(paths.archive, 'app');
                        const archiveName = `dSYMs_${version.version}.zip`;
                        const archivePath = path.join(archiveDir, archiveName);

                        await fs.ensureDir(archiveDir);
                        await sh('ditto', ['-c', '-k', '--keepParent', paths.symbols, archivePath]);
                        await fs.emptyDir(paths.symbols);
                    }],
                    ['Cleanup xcarchive', async () => {
                        await fs.remove('dbdone.xcarchive');
                    }],
                    ['Notarize + staple', async () => {
                        if (args.skipNotarize) return;
                        await notarizeAndStaple(paths.pkg);
                    }]
                ], logger);
            } finally {
                // Restore original pubspec.yaml from backup if present
                if (await fs.pathExists(pubspecBackup)) {
                    await fs.copy(pubspecBackup, paths.pubspecYaml);
                    await fs.remove(pubspecBackup);
                }

                // Restore or clean up pubspec.lock depending on whether it existed originally
                if (hadPubspecLock) {
                    if (await fs.pathExists(pubspecLockBackup)) {
                        await fs.copy(pubspecLockBackup, paths.pubspecLock);
                        await fs.remove(pubspecLockBackup);
                    }
                } else {
                    // If there was no lock originally, remove any lock produced by the build to avoid accidental commits
                    if (await fs.pathExists(paths.pubspecLock)) {
                        await fs.remove(paths.pubspecLock);
                    }
                }
            }

            if (args.deploy) {
                const storageFid = `dBdone-${version.version}.pkg`;
                await pipeline([
                    ['Upload to Supabase', () => uploadToSupabase(paths.pkg, 'shop/installers', storageFid)],
                    ['Upsert DB row', () => upsertInstallerRow(version.version, APP_PRODUCT_TAG, 'mac', storageFid)],
                ], logger);
            }

        } else { // Windows
            // TODO: Implement Windows build for app
            throw new Error('Windows build for app not yet implemented');
        }

        logger.info('App build finished', { platform: args.platform, version: version.version });
    } finally {
        // Restore git state if we checked out a tag
        await restoreGit();
    }
}
