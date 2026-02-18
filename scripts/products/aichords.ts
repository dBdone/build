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

export interface AichordsArgs {
  platform: 'mac' | 'win';
  mode: VersionMode;
  fakeVersion?: string;
  deploy?: boolean;
  skipNotarize?: boolean;
}

const AICHORDS_PRODUCT_TAG = 'dbd-aich';
const AICHORDS_ROOT = fromNative('plugins', 'aichords')
const MSVC_BUILD_ROOT = path.join(AICHORDS_ROOT, 'Builds/VisualStudio2022/');
const XCODE_BUILD_ROOT = path.join(AICHORDS_ROOT, 'Builds/MacOSX/');
const INSTALLER_ROOT = fromBuild('installer')
const AICHORDS_INSTALLER_ROOT = path.join(INSTALLER_ROOT, 'aichords');

const paths = {
  jucer: path.join(AICHORDS_ROOT, 'Aichords.jucer'),
  versionHeader: path.join(AICHORDS_ROOT, 'Source/version.h'),
  xcode: { project: path.join(XCODE_BUILD_ROOT, 'aichords.xcodeproj'), scheme: 'aichords - All', config: 'Release' },
  msvc: { solution: path.join(MSVC_BUILD_ROOT, 'Aichords.sln'), config: 'Release' },
  contentDir: path.join(AICHORDS_INSTALLER_ROOT, 'shared'),
  dist: fromBuild('dist', 'aichords'),
  pkg: fromBuild('dist', 'aichords', 'Aichords.pkg'),
  iss: path.join(AICHORDS_INSTALLER_ROOT, 'windows', 'aichords.iss'),
  symbols: fromBuild('symbols'),
  archive: fromBuild('archive'),
};

export async function buildAichords(logger: Logger, args: AichordsArgs) {
  await fs.emptyDir(paths.dist);

  const version: VersionInfo = await computeVersion(args.mode, args.fakeVersion ?? '9.9.9-9', 'AICHORDS_V');
  logger.info(`Version resolved`, version);

  const restoreGit = await checkoutVersion(version);

  try {
    await pipeline([
      ['Write version header', async () => {
        const versionHeaderContent = `#pragma once

#define SYSTEM_VERSION "${version.version}"
`;
        await fs.writeFile(paths.versionHeader, versionHeaderContent, 'utf-8');
      }],
      ['Patch & resave .jucer', () => patchAndResaveJucerNextToOriginal(logger, paths.jucer, `${version.major}.${version.minor}.${version.patch}`)],
      ['Build backend lib', () => buildBackendLib(args.platform, 'Release')],
    ], logger);

    if (args.platform === 'mac') {
      await runTask('Remove installed AAX plugin', () => removeInstalledAAXPlugin('aichords'), { logger });
      await runTask('Setup signing keychain', () => setupSigningKeychain(), { logger });

      await runTask('Xcode build (AU/VST3/AAX)', () =>
        xcodeBuild(
          paths.xcode.project,
          paths.xcode.scheme,
          paths.xcode.config,
          ['DEBUG_INFORMATION_FORMAT=dwarf-with-dsym']
        ), { logger });

      await runTask('Extract debug symbols (dSYMs)', async () => {
        await fs.emptyDir(paths.symbols);

        const builtPlugins = [
          path.join(XCODE_BUILD_ROOT, 'build/Release/Aichords.vst3/Contents/MacOS/Aichords'),
          path.join(XCODE_BUILD_ROOT, 'build/Release/Aichords.component/Contents/MacOS/Aichords'),
          path.join(XCODE_BUILD_ROOT, 'build/Release/Aichords.aaxplugin/Contents/MacOS/Aichords'),
        ];

        for (const pluginBinary of builtPlugins) {
          if (await fs.pathExists(pluginBinary)) {
            const dsymName = path.basename(pluginBinary) + '.dSYM';
            const dsymOutput = path.join(paths.symbols, dsymName);
            await sh('dsymutil', [pluginBinary, '-o', dsymOutput]);
          }
        }
      }, { logger });

      await runTask('Sign AAX plugin (mac)', async () => {
        const aaxBuilt = path.join(XCODE_BUILD_ROOT, 'build/Release/Aichords.aaxplugin');
        await signAAXPlugin({ pluginPath: aaxBuilt });
      }, { logger });

      await pipeline([
        ['Prepare macOS installer resources', () => prepareMacInstallerResources()],
        ['Build macOS packages', async () => {
          const backendLibPath = fromNative('components/dbDoneBackend/Builds/MacOSX/build/Release/dbdone_backend.dylib');
          const soundFilePath = path.join(paths.contentDir, 'sound', 'player.sf2');

          const packages: MacPackageSpec[] = [
            {
              identifier: 'com.dbdone.aichordsvst.pkg',
              filename: 'aichordsVST.pkg',
              stage: async (root) => {
                const target = path.join(root, 'Library', 'Audio', 'Plug-Ins', 'VST3', 'aichords.vst3');
                await fs.ensureDir(path.dirname(target));
                await fs.copy(path.join(XCODE_BUILD_ROOT, 'build/Release/Aichords.vst3'), target);
              }
            },
            {
              identifier: 'com.dbdone.aichordsau.pkg',
              filename: 'aichordsAU.pkg',
              stage: async (root) => {
                const target = path.join(root, 'Library', 'Audio', 'Plug-Ins', 'Components', 'aichords.component');
                await fs.ensureDir(path.dirname(target));
                await fs.copy(path.join(XCODE_BUILD_ROOT, 'build/Release/Aichords.component'), target);
              }
            },
            {
              identifier: 'com.dbdone.aichordsaax.pkg',
              filename: 'aichordsAAX.pkg',
              stage: async (root) => {
                const target = path.join(root, 'Library', 'Application Support', 'Avid', 'Audio', 'Plug-Ins', 'aichords.aaxplugin');
                await fs.ensureDir(path.dirname(target));
                await fs.copy(path.join(XCODE_BUILD_ROOT, 'build/Release/Aichords.aaxplugin'), target);
              }
            },
            {
              identifier: 'com.dbdone.aichordsbasic.pkg',
              filename: 'aichordsBASIC.pkg',
              stage: async (root) => {
                const target = path.join(root, 'Library', 'Application Support', 'com.dbdone.aichords', 'dbdone_backend.dylib');
                await fs.ensureDir(path.dirname(target));
                await fs.copy(backendLibPath, target);
              }
            },
            {
              identifier: 'com.dbdone.aichordssound.pkg',
              filename: 'aichordsSOUND.pkg',
              stage: async (root) => {
                const target = path.join(root, 'Library', 'Application Support', 'com.dbdone.aichords', 'sound', 'player.sf2');
                await fs.ensureDir(path.dirname(target));
                await fs.copy(soundFilePath, target);
              }
            }
          ];

          await buildMacPackages(packages, version.version, paths.dist);
        }],
        ['productbuild', () => {
          const distXml = path.join(AICHORDS_INSTALLER_ROOT, 'macOS', 'distribution_aichords.xml');
          const pkgDir = path.join(paths.dist, 'packages');
          const resources = fromBuild('macOS', 'installer', 'resources');
          const signIdentity = process.env.MACOS_INSTALLER_SIGN_ID;
          return productbuild(distXml, pkgDir, paths.pkg, resources, signIdentity, version.version);
        }],
        ['Archive debug symbols', async () => {
          const archiveDir = path.join(paths.archive, 'aichords');
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
        const storageFid = `Aichords-${version.version}.pkg`;
        await pipeline([
          ['Upload to Supabase', () => uploadToSupabase(paths.pkg, 'shop/installers', storageFid)],
          ['Upsert DB row', () => upsertInstallerRow(version.version, AICHORDS_PRODUCT_TAG, 'mac', storageFid)],
        ], logger);
      }

    } else {
      await runTask('MSBuild (VST3/AAX)', () =>
        msbuild(paths.msvc.solution, paths.msvc.config), { logger });

      await pipeline([
        ['Sign AAX plugin', async () => {
          const aaxPath = path.join(MSVC_BUILD_ROOT, 'x64/Release/AAX/Aichords.aaxplugin/Contents/x64/Aichords.aaxplugin');
          await signAAXPlugin({ pluginPath: aaxPath });
        }],
        ['Sign VST3 plugin', async () => {
          const vst3Path = path.join(MSVC_BUILD_ROOT, 'x64/Release/VST3/Aichords.vst3/Contents/x86_64-win/Aichords.vst3');
          await signWindowsExecutable(vst3Path);
        }],
        ['Sign backend DLL', async () => {
          const backendDll = fromNative('components/dbDoneBackend/Builds/VisualStudio2022/x64/Release/Dynamic Library/dbdone_backend.dll');
          await signWindowsExecutable(backendDll);
        }],
        ['Stage content', async () => {
          const stage = path.join(paths.dist, 'win-payload');
          await fs.emptyDir(stage);
          await fs.copy(path.join(MSVC_BUILD_ROOT, 'x64/Release/VST3/Aichords.vst3'), path.join(stage, 'VST3/aichords.vst3'));
          await fs.copy(path.join(MSVC_BUILD_ROOT, 'x64/Release/AAX/Aichords.aaxplugin'), path.join(stage, 'AAX/aichords.aaxplugin'));
          await fs.copy(paths.contentDir, path.join(stage, 'Content'));

          const backendDll = fromNative('components/dbDoneBackend/Builds/VisualStudio2022/x64/Release/Dynamic Library/dbdone_backend.dll');
          await fs.copy(backendDll, path.join(stage, 'Backend/dbdone_backend.dll'));
        }],
        ['Build Inno Setup', async () => {
          const stage = path.join(paths.dist, 'win-payload');
          await buildInnoSetup(paths.iss, version.version, stage, true);
        }],
        ['Archive debug symbols', async () => {
          const archiveDir = path.join(paths.archive, 'aichords');
          const archiveName = `symbols_${version.version}.zip`;
          const archivePath = path.join(archiveDir, archiveName);

          await fs.ensureDir(archiveDir);
          await fs.emptyDir(paths.symbols);

          const pdbSources = [
            path.join(MSVC_BUILD_ROOT, 'x64/Release/VST3/Aichords.vst3/Contents/x86_64-win/Aichords.pdb'),
            path.join(MSVC_BUILD_ROOT, 'x64/Release/AAX/Aichords.aaxplugin/Contents/x64/Aichords.pdb'),
          ];

          for (const pdbPath of pdbSources) {
            if (await fs.pathExists(pdbPath)) {
              const pdbName = path.basename(pdbPath);
              await fs.copy(pdbPath, path.join(paths.symbols, pdbName));
            }
          }

          await sh('powershell', [
            '-Command',
            `Compress-Archive -Path '${paths.symbols}\\*' -DestinationPath '${archivePath}' -Force`
          ]);

          await fs.emptyDir(paths.symbols);
        }],
      ], logger);

      if (args.deploy) {
        const exe = path.join(paths.dist, 'Aichords Installer.exe');
        const storageFid = `Aichords-${version.version}.exe`;
        await pipeline([
          ['Upload to Supabase', () => uploadToSupabase(exe, 'shop/installers', storageFid)],
          ['Upsert DB row', () => upsertInstallerRow(version.version, AICHORDS_PRODUCT_TAG, 'win', storageFid)],
        ], logger);
      }
    }

    logger.info('Aichords finished', { platform: args.platform, version: version.version });
  } finally {
    await restoreGit();
  }
}