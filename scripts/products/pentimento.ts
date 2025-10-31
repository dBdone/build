import path from 'node:path';
import { fromBuild, fromNative } from '../utils/root';
import fs from 'fs-extra';
import { pipeline, runTask } from '../utils/tasks.js';
import { Logger } from '../utils/logger.js';
import { computeVersion, checkoutVersion, VersionMode, VersionInfo } from '../utils/versioning.js';
import { patchAndResaveJucerNextToOriginal } from '../services/projucer.js';
import { xcodeBuild } from '../services/xcode.js';
import { msbuild } from '../services/msbuild.js';
import { productbuild, buildInnoSetup } from '../services/installers.js';
import { notarizeAndStaple } from '../services/notarize.js';
import { uploadToSupabase, upsertInstallerRow } from '../services/supabase.js';
import { buildBackendLib } from '../services/backendlib.js';
import { signAAXPlugin } from '../services/aax_signing.js';

export interface PentimentoArgs {
  platform: 'mac' | 'win';
  mode: VersionMode;                 // 'working' | 'latest'
  fakeVersion?: string;              // default "9.9.9-9" for working
  deploy?: boolean;                  // upload + DB insert
  skipNotarize?: boolean;            // for local dry builds
  json?: boolean;                    // JSON logs
}

const PENTIMENTO_PRODUCT_TAG = 'tae-pen';
const PENTIMENTO_ROOT = fromNative('plugins', 'pentimento')
const MSVC_BUILD_ROOT = path.join(PENTIMENTO_ROOT, 'Builds/VisualStudio2022/'); 
const INSTALLER_ROOT = fromBuild('installer')
const PENTI_INSTALLER_ROOT = path.join(INSTALLER_ROOT, 'pentimento');

const paths = {
  jucer: path.join(PENTIMENTO_ROOT, 'Pentimento.jucer'),
  versionHeader: path.join(PENTIMENTO_ROOT, 'Source/version.h'),
  xcode: { project: path.join(PENTIMENTO_ROOT, 'Builds/MacOS/Pentimento.xcodeproj'), scheme: 'Pentimento - All', config: 'Release' },
  msvc:  { solution: path.join(MSVC_BUILD_ROOT, 'Pentimento.sln'), config: 'Release' },
  contentDir: path.join(PENTI_INSTALLER_ROOT, 'shared'),
  dist: fromBuild('dist', 'pentimento'),
  pkg:  fromBuild('dist', 'pentimento', 'Pentimento.pkg'),
  iss:  path.join(PENTI_INSTALLER_ROOT, 'windows', 'pentimento.iss'),
};

export async function buildPentimento(args: PentimentoArgs) {
  const logger = new Logger(!!args.json);
  
  // Clear and ensure dist directory for clean build
  await fs.emptyDir(paths.dist);

  const version: VersionInfo = await computeVersion(args.mode, args.fakeVersion ?? '9.9.9-9', 'PENTIMENTO_V');
  logger.info(`Version resolved`, version);

  // Checkout the version if in 'latest' mode
  const restoreGit = await checkoutVersion(version);
  
  try {
    // Common preparatory steps
    await pipeline([
      ['Patch & resave .jucer', () => patchAndResaveJucerNextToOriginal(paths.jucer, `${version.major}.${version.minor}.${version.patch}`)],
      ['Build backend lib',    () => buildBackendLib(args.platform, 'Release')],
    ], logger);

  if (args.platform === 'mac') {
    await runTask('Xcode build (AU/VST3/AAX)', () =>
      xcodeBuild(paths.xcode.project, paths.xcode.scheme, paths.xcode.config), { logger });

    // Package .pkg with content
    await pipeline([
      ['Stage content', async () => {
        const stage = path.join(paths.dist, 'payload');
        await fs.emptyDir(stage);
        // copy plugins from build outputs (adjust paths) and content
        await fs.copy('Builds/MacOS/build/Release/Pentimento.vst3', path.join(stage, 'VST3/Pentimento.vst3'));
        await fs.copy('Builds/MacOS/build/Release/Pentimento.component', path.join(stage, 'Components/Pentimento.component'));
        await fs.copy('Builds/MacOS/build/Release/Pentimento.aaxplugin', path.join(stage, 'AAX/Pentimento.aaxplugin'));
        await fs.copy(paths.contentDir, path.join(stage, 'Content'));
      }],
      ['productbuild', () => productbuild('dist/distribution.xml', path.join(paths.dist, 'payload'), paths.pkg)],
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
        await buildInnoSetup(paths.iss, version.version, stage);
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
