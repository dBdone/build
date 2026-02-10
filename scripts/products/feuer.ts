import path from 'node:path';
import { fromBuild, fromNative } from '../utils/root';
import fs from 'fs-extra';
import { pipeline, runTask } from '../utils/tasks.js';
import { Logger } from '../utils/logger.js';
import { computeVersion, checkoutVersion, VersionMode, VersionInfo } from '../utils/versioning.js';
import { patchAndResaveJucerNextToOriginal } from '../services/projucer.js';
import { xcodeBuild } from '../services/xcode.js';
import { msbuild } from '../services/msbuild.js';
import { productbuild, buildInnoSetup, prepareMacInstallerResources, buildMacPackages, MacPackageSpec } from '../services/installers.js';
import { notarizeAndStaple, setupSigningKeychain } from '../services/notarize.js';
import { uploadToSupabase, upsertInstallerRow } from '../services/supabase.js';
import { buildBackendLib } from '../services/backendlib.js';
import { signAAXPlugin, removeInstalledAAXPlugin } from '../services/aax_signing.js';
import { signWindowsExecutable } from '../services/codesign_windows.js';
import { sh } from '../services/exec.js';

export interface FeuerArgs {
    platform: 'mac' | 'win';
    mode: VersionMode;                 // 'working' | 'latest'
    fakeVersion?: string;              // default "9.9.9-9" for working
    deploy?: boolean;                  // upload + DB insert
    skipNotarize?: boolean;            // for local dry builds
}

const FEUER_PRODUCT_TAG = 'dbd-feuer';
const FEUER_ROOT = fromNative('plugins', 'fx_plugins', 'feuer')
const MSVC_BUILD_ROOT = path.join(FEUER_ROOT, 'Builds/VisualStudio2022/');
const XCODE_BUILD_ROOT = path.join(FEUER_ROOT, 'Builds/MacOSX/');
const INSTALLER_ROOT = fromBuild('installer')
const FEUER_INSTALLER_ROOT = path.join(INSTALLER_ROOT, 'feuer');

const paths = {
    jucer: path.join(FEUER_ROOT, 'Feuer.jucer'),
    versionHeader: path.join(FEUER_ROOT, 'Source/version.h'),
    xcode: { project: path.join(XCODE_BUILD_ROOT, 'feuer.xcodeproj'), scheme: 'feuer - All', config: 'Release' },
    msvc: { solution: path.join(MSVC_BUILD_ROOT, 'Feuer.sln'), config: 'Release' },
    contentDir: path.join(FEUER_INSTALLER_ROOT, 'shared'),
    dist: fromBuild('dist', 'feuer'),
    pkg: fromBuild('dist', 'feuer', 'Feuer.pkg'),
    iss: path.join(FEUER_INSTALLER_ROOT, 'windows', 'feuer.iss'),
    symbols: fromBuild('symbols'),
    archive: fromBuild('archive'),
};

export async function buildFeuer(logger: Logger, args: FeuerArgs) {
    // Clear and ensure dist directory for clean build
    await fs.emptyDir(paths.dist);

    const version: VersionInfo = await computeVersion(args.mode, args.fakeVersion ?? '9.9.9-9', 'FEUER_V');
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
            ['Patch & resave .jucer', () => patchAndResaveJucerNextToOriginal(logger, paths.jucer, `${version.major}.${version.minor}.${version.patch}`)],
        ], logger);

        if (args.platform === 'mac') {
            // Remove existing AAX plugin from system (requires sudo)
            await runTask('Remove installed AAX plugin', () => removeInstalledAAXPlugin('feuer'), { logger });

            // Setup signing keychain with certificates and notary credentials
            await runTask('Setup signing keychain', () => setupSigningKeychain(), { logger });

            // Build plugins (symbols will be stripped from binaries but dSYMs will be generated)
            await runTask('Xcode build (AU/VST3/AAX)', () =>
                xcodeBuild(
                    paths.xcode.project,
                    paths.xcode.scheme,
                    paths.xcode.config,
                    ['DEBUG_INFORMATION_FORMAT=dwarf-with-dsym']  // Generate dSYM files
                ), { logger });

            // Extract debug symbols using dsymutil
            await runTask('Extract debug symbols (dSYMs)', async () => {
                await fs.emptyDir(paths.symbols);

                const builtPlugins = [
                    path.join(XCODE_BUILD_ROOT, 'build/Release/Feuer.vst3/Contents/MacOS/Feuer'),
                    path.join(XCODE_BUILD_ROOT, 'build/Release/Feuer.component/Contents/MacOS/Feuer'),
                    path.join(XCODE_BUILD_ROOT, 'build/Release/Feuer.aaxplugin/Contents/MacOS/Feuer'),
                ];

                for (const pluginBinary of builtPlugins) {
                    if (await fs.pathExists(pluginBinary)) {
                        const dsymName = path.basename(pluginBinary) + '.dSYM';
                        const dsymOutput = path.join(paths.symbols, dsymName);
                        await sh('dsymutil', [pluginBinary, '-o', dsymOutput]);
                    }
                }
            }, { logger });

            // Sign AAX plugin produced by Xcode (post-build)
            await runTask('Sign AAX plugin (mac)', async () => {
                const aaxBuilt = path.join(XCODE_BUILD_ROOT, 'build/Release/Feuer.aaxplugin');
                // signAAXPlugin will replace the plugin at the given path with a signed version
                await signAAXPlugin({ pluginPath: aaxBuilt });
            }, { logger });

            // Package .pkg with content
            await pipeline([
                ['Prepare macOS installer resources', () => prepareMacInstallerResources()],
                ['Build macOS packages', async () => {
                    const presetsSourceDir = path.join(paths.contentDir, 'presets');

                    // Define package specifications
                    const packages: MacPackageSpec[] = [
                        {
                            identifier: 'com.dbdone.feuervst.pkg',
                            filename: 'feuerVST.pkg',
                            stage: async (root) => {
                                const target = path.join(root, 'Library', 'Audio', 'Plug-Ins', 'VST3', 'Feuer.vst3');
                                await fs.ensureDir(path.dirname(target));
                                await fs.copy(path.join(XCODE_BUILD_ROOT, 'build/Release/Feuer.vst3'), target);
                            }
                        },
                        {
                            identifier: 'com.dbdone.feuerau.pkg',
                            filename: 'feuerAU.pkg',
                            stage: async (root) => {
                                const target = path.join(root, 'Library', 'Audio', 'Plug-Ins', 'Components', 'Feuer.component');
                                await fs.ensureDir(path.dirname(target));
                                await fs.copy(path.join(XCODE_BUILD_ROOT, 'build/Release/Feuer.component'), target);
                            }
                        },
                        {
                            identifier: 'com.dbdone.feueraax.pkg',
                            filename: 'feuerAAX.pkg',
                            stage: async (root) => {
                                const target = path.join(root, 'Library', 'Application Support', 'Avid', 'Audio', 'Plug-Ins', 'Feuer.aaxplugin');
                                await fs.ensureDir(path.dirname(target));
                                await fs.copy(path.join(XCODE_BUILD_ROOT, 'build/Release/Feuer.aaxplugin'), target);
                            }
                        },
                        {
                            identifier: 'com.dbdone.feuerpresets.pkg',
                            filename: 'feuerPRESETS.pkg',
                            stage: async (root) => {
                                const target = path.join(root, 'Library', 'Application Support', 'com.dbdone.feuer', 'presets');
                                await fs.ensureDir(target);
                                await fs.copy(presetsSourceDir, target);
                            }
                        }
                    ];

                    await buildMacPackages(packages, version.version, paths.dist);
                }],
                ['productbuild', () => {
                    const distXml = path.join(FEUER_INSTALLER_ROOT, 'macOS', 'distribution_feuer.xml');
                    const pkgDir = path.join(paths.dist, 'packages');
                    const resources = fromBuild('macOS', 'installer', 'resources');
                    const signIdentity = process.env.MACOS_INSTALLER_SIGN_ID;
                    return productbuild(distXml, pkgDir, paths.pkg, resources, signIdentity, version.version);
                }],
                ['Archive debug symbols', async () => {
                    const archiveDir = path.join(paths.archive, 'feuer');
                    const archiveName = `dSYMs_${version.version}.zip`;
                    const archivePath = path.join(archiveDir, archiveName);

                    await fs.ensureDir(archiveDir);
                    await sh('ditto', ['-c', '-k', '--keepParent', paths.symbols, archivePath]);
                    await fs.emptyDir(paths.symbols);
                }],
                ['Notarize + staple', async () => {
                    if (args.skipNotarize) return;
                    await notarizeAndStaple(paths.pkg);
                }]
            ], logger);

            if (args.deploy) {
                const storageFid = `Feuer-${version.version}.pkg`;
                await pipeline([
                    ['Upload to Supabase', () => uploadToSupabase(paths.pkg, 'shop/installers', storageFid)],
                    ['Upsert DB row', () => upsertInstallerRow(version.version, FEUER_PRODUCT_TAG, 'mac', storageFid)],
                ], logger);
            }

        } else { // Windows
            await runTask('MSBuild (VST3/AAX)', () =>
                msbuild(paths.msvc.solution, paths.msvc.config), { logger });

            await pipeline([
                ['Sign AAX plugin', async () => {
                    const aaxPath = path.join(MSVC_BUILD_ROOT, 'x64/Release/AAX/Feuer.aaxplugin/Contents/x64/Feuer.aaxplugin');
                    await signAAXPlugin({ pluginPath: aaxPath });
                }],
                ['Sign VST3 plugin', async () => {
                    const vst3Path = path.join(MSVC_BUILD_ROOT, 'x64/Release/VST3/Feuer.vst3/Contents/x86_64-win/Feuer.vst3');
                    await signWindowsExecutable(vst3Path);
                }],
                ['Stage content', async () => {
                    const stage = path.join(paths.dist, 'win-payload');
                    await fs.emptyDir(stage);
                    await fs.copy(path.join(MSVC_BUILD_ROOT, 'x64/Release/VST3/Feuer.vst3'), path.join(stage, 'VST3/Feuer.vst3'));
                    await fs.copy(path.join(MSVC_BUILD_ROOT, 'x64/Release/AAX/Feuer.aaxplugin'), path.join(stage, 'AAX/Feuer.aaxplugin'));
                    await fs.copy(paths.contentDir, path.join(stage, 'Content'));
                }],
                ['Build Inno Setup', async () => {
                    const stage = path.join(paths.dist, 'win-payload');
                    await buildInnoSetup(paths.iss, version.version, stage, true);
                }],
                ['Archive debug symbols', async () => {
                    const archiveDir = path.join(paths.archive, 'feuer');
                    const archiveName = `symbols_${version.version}.zip`;
                    const archivePath = path.join(archiveDir, archiveName);

                    await fs.ensureDir(archiveDir);
                    await fs.emptyDir(paths.symbols);

                    // Collect PDB files from the build output
                    const pdbSources = [
                        path.join(MSVC_BUILD_ROOT, 'x64/Release/VST3/Feuer.vst3/Contents/x86_64-win/Feuer.pdb'),
                        path.join(MSVC_BUILD_ROOT, 'x64/Release/AAX/Feuer.aaxplugin/Contents/x64/Feuer.pdb'),
                    ];

                    for (const pdbPath of pdbSources) {
                        if (await fs.pathExists(pdbPath)) {
                            const pdbName = path.basename(pdbPath);
                            await fs.copy(pdbPath, path.join(paths.symbols, pdbName));
                        }
                    }

                    // Use PowerShell Compress-Archive for Windows
                    await sh('powershell', [
                        '-Command',
                        `Compress-Archive -Path '${paths.symbols}\\*' -DestinationPath '${archivePath}' -Force`
                    ]);

                    await fs.emptyDir(paths.symbols);
                }],
            ], logger);

            if (args.deploy) {
                const exe = path.join(paths.dist, 'Feuer Installer.exe');
                const storageFid = `Feuer-${version.version}.exe`;
                await pipeline([
                    ['Upload to Supabase', () => uploadToSupabase(exe, 'shop/installers', storageFid)],
                    ['Upsert DB row', () => upsertInstallerRow(version.version, FEUER_PRODUCT_TAG, 'win', storageFid)],
                ], logger);
            }
        }

        logger.info('Feuer finished', { platform: args.platform, version: version.version });
    } finally {
        // Restore git state if we checked out a tag
        await restoreGit();
    }
}
