import { sh } from './exec.js';
import { msbuild } from './msbuild.js';
import { fromNative } from '../utils/root';
import path from 'node:path';

export async function buildBackendLib(platform: 'mac'|'win', config = 'Release') {
  const dbdoneBackendRoot = fromNative('components/dbDoneBackend');

  if (platform === 'mac') {
    const projectPath = path.join(dbdoneBackendRoot, 'Builds/MacOSX/dbDoneBackend.xcodeproj');
    const derivedDataPath = path.resolve('build_data');
    const libSource = path.join(dbdoneBackendRoot, 'Builds/MacOSX/build/Release/dbdone_backend.dylib');
    const libDest = path.join(dbdoneBackendRoot, 'Lib');

    await sh('xcodebuild', [
      '-quiet',
      '-project', projectPath,
      '-scheme', 'dBdoneBackend - Dynamic Library',
      '-configuration', config,
      '-destination', 'generic/platform=macOS',
      '-derivedDataPath', derivedDataPath,
      'clean', 'build'
    ]);
    
    // Copy the built library to the Lib folder
    await sh('cp', [libSource, libDest]);
  } else {
    const solutionPath = path.join(dbdoneBackendRoot, 'Builds/VisualStudio2022/dbDoneBackend.sln');
    await msbuild(solutionPath, config);
  }
}
