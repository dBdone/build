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

export interface PentimentoArgs {
  platform: 'mac' | 'win';
  mode: VersionMode;                 // 'working' | 'latest'
  fakeVersion?: string;              // default "9.9.9-9" for working
  deploy?: boolean;                  // upload + DB insert
  skipNotarize?: boolean;            // for local dry builds
}

const PENTIMENTO_PRODUCT_TAG = 'tae-pen';
const PENTIMENTO_ROOT = fromNative('plugins', 'pentimento')
const MSVC_BUILD_ROOT = path.join(PENTIMENTO_ROOT, 'Builds/VisualStudio2022/');
const XCODE_BUILD_ROOT = path.join(PENTIMENTO_ROOT, 'Builds/MacOSX/');
const INSTALLER_ROOT = fromBuild('installer')
const PENTI_INSTALLER_ROOT = path.join(INSTALLER_ROOT, 'pentimento');

const paths = {
  jucer: path.join(PENTIMENTO_ROOT, 'Pentimento.jucer'),
  versionHeader: path.join(PENTIMENTO_ROOT, 'Source/version.h'),
  xcode: { project: path.join(XCODE_BUILD_ROOT, 'pentimento.xcodeproj'), scheme: 'pentimento - All', config: 'Release' },
  msvc: { solution: path.join(MSVC_BUILD_ROOT, 'Pentimento.sln'), config: 'Release' },
  contentDir: path.join(PENTI_INSTALLER_ROOT, 'shared'),
  dist: fromBuild('dist', 'pentimento'),
  pkg: fromBuild('dist', 'pentimento', 'Pentimento.pkg'),
  iss: path.join(PENTI_INSTALLER_ROOT, 'windows', 'pentimento.iss'),
};

export async function buildPentimento(logger: Logger, args: PentimentoArgs) {
  // Clear and ensure dist directory for clean build
  await fs.emptyDir(paths.dist);

  const version: VersionInfo = await computeVersion(args.mode, args.fakeVersion ?? '9.9.9-9', 'PENTIMENTO_V');
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
      ['Build backend lib', () => buildBackendLib(args.platform, 'Release')],
    ], logger);

    if (args.platform === 'mac') {
      // Remove existing AAX plugin from system (requires sudo)
      await runTask('Remove installed AAX plugin', () => removeInstalledAAXPlugin('pentimento'), { logger });

      // Setup signing keychain with certificates and notary credentials
      await runTask('Setup signing keychain', () => setupSigningKeychain(), { logger });

      await runTask('Xcode build (AU/VST3/AAX)', () =>
        xcodeBuild(paths.xcode.project, paths.xcode.scheme, paths.xcode.config), { logger });

      // Sign AAX plugin produced by Xcode (post-build)
      await runTask('Sign AAX plugin (mac)', async () => {
        const aaxBuilt = path.join(XCODE_BUILD_ROOT, 'build/Release/Pentimento.aaxplugin');
        // signAAXPlugin will replace the plugin at the given path with a signed version
        await signAAXPlugin({ pluginPath: aaxBuilt });
      }, { logger });

      // Package .pkg with content
      await pipeline([
        ['Prepare macOS installer resources', () => prepareMacInstallerResources()],
        ['Build macOS packages', async () => {
          const backendLibPath = fromNative('components/dbDoneBackend/Builds/MacOSX/build/Release/dbdone_backend.dylib');
          const packsSourceDir = path.join(paths.contentDir, 'packs');

          // Define package specifications
          const packages: MacPackageSpec[] = [
            {
              identifier: 'com.dbdone.pentimentovst.pkg',
              filename: 'pentimentoVST.pkg',
              stage: async (root) => {
                const target = path.join(root, 'Library', 'Audio', 'Plug-Ins', 'VST3', 'Pentimento.vst3');
                await fs.ensureDir(path.dirname(target));
                await fs.copy(path.join(XCODE_BUILD_ROOT, 'build/Release/Pentimento.vst3'), target);
              }
            },
            {
              identifier: 'com.dbdone.pentimentoau.pkg',
              filename: 'pentimentoAU.pkg',
              stage: async (root) => {
                const target = path.join(root, 'Library', 'Audio', 'Plug-Ins', 'Components', 'Pentimento.component');
                await fs.ensureDir(path.dirname(target));
                await fs.copy(path.join(XCODE_BUILD_ROOT, 'build/Release/Pentimento.component'), target);
              }
            },
            {
              identifier: 'com.dbdone.pentimentoaax.pkg',
              filename: 'pentimentoAAX.pkg',
              stage: async (root) => {
                const target = path.join(root, 'Library', 'Application Support', 'Avid', 'Audio', 'Plug-Ins', 'Pentimento.aaxplugin');
                await fs.ensureDir(path.dirname(target));
                await fs.copy(path.join(XCODE_BUILD_ROOT, 'build/Release/Pentimento.aaxplugin'), target);
              }
            },
            {
              identifier: 'com.dbdone.pentimentobasic.pkg',
              filename: 'pentimentoBASIC.pkg',
              stage: async (root) => {
                const target = path.join(root, 'Library', 'Application Support', 'com.dbdone.pentimento', 'dbdone_backend.dylib');
                await fs.ensureDir(path.dirname(target));
                await fs.copy(backendLibPath, target);
              }
            },
            {
              identifier: 'com.dbdone.pentimentopacks.pkg',
              filename: 'pentimentoPACKS.pkg',
              stage: async (root) => {
                const target = path.join(root, 'Library', 'Application Support', 'com.dbdone.pentimento', 'packs');
                await fs.ensureDir(target);
                await fs.copy(packsSourceDir, target);
              }
            }
          ];

          await buildMacPackages(packages, version.version, paths.dist);
        }],
        ['productbuild', () => {
          const distXml = path.join(PENTI_INSTALLER_ROOT, 'macOS', 'distribution_pentimento.xml');
          const pkgDir = path.join(paths.dist, 'packages');
          const resources = fromBuild('macOS', 'installer', 'resources');
          const signIdentity = process.env.MACOS_INSTALLER_SIGN_ID;
          return productbuild(distXml, pkgDir, paths.pkg, resources, signIdentity, version.version);
        }],
        ['Notarize + staple', async () => {
          if (args.skipNotarize) return;
          await notarizeAndStaple(paths.pkg);
        }]
      ], logger);

      if (args.deploy) {
        const storageFid = `Pentimento-${version.version}.pkg`;
        await pipeline([
          ['Upload to Supabase', () => uploadToSupabase(paths.pkg, 'shop/installers', storageFid)],
          ['Upsert DB row', () => upsertInstallerRow(version.version, PENTIMENTO_PRODUCT_TAG, 'mac', storageFid)],
        ], logger);
      }

    } else { // Windows
      await runTask('MSBuild (VST3/AAX)', () =>
        msbuild(paths.msvc.solution, paths.msvc.config), { logger });

      await pipeline([
        ['Sign AAX plugin', async () => {
          const aaxPath = path.join(MSVC_BUILD_ROOT, 'x64/Release/AAX/Pentimento.aaxplugin/Contents/x64/Pentimento.aaxplugin');
          await signAAXPlugin({ pluginPath: aaxPath });
        }],
        ['Stage content', async () => {
          const stage = path.join(paths.dist, 'win-payload');
          await fs.emptyDir(stage);
          await fs.copy(path.join(MSVC_BUILD_ROOT, 'x64/Release/VST3/Pentimento.vst3'), path.join(stage, 'VST3/Pentimento.vst3'));
          await fs.copy(path.join(MSVC_BUILD_ROOT, 'x64/Release/AAX/Pentimento.aaxplugin'), path.join(stage, 'AAX/Pentimento.aaxplugin'));
          await fs.copy(paths.contentDir, path.join(stage, 'Content'));

          // Copy backend DLL
          const backendDll = fromNative('components/dbDoneBackend/Builds/VisualStudio2022/x64/Release/Dynamic Library/dbdone_backend.dll');
          await fs.copy(backendDll, path.join(stage, 'Backend/dbdone_backend.dll'));
        }],
        ['Build Inno Setup', async () => {
          const stage = path.join(paths.dist, 'win-payload');
          await buildInnoSetup(paths.iss, version.version, stage, true);
        }],
      ], logger);

      if (args.deploy) {
        const exe = path.join(paths.dist, 'Pentimento Installer.exe');
        const storageFid = `Pentimento-${version.version}.exe`;
        await pipeline([
          ['Upload to Supabase', () => uploadToSupabase(exe, 'shop/installers', storageFid)],
          ['Upsert DB row', () => upsertInstallerRow(version.version, PENTIMENTO_PRODUCT_TAG, 'win', storageFid)],
        ], logger);
      }
    }

    logger.info('Pentimento finished', { platform: args.platform, version: version.version });
  } finally {
    // Restore git state if we checked out a tag
    await restoreGit();
  }
}
