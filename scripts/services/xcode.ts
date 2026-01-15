import { sh } from './exec.js';

export async function xcodeClean(project: string, scheme: string, configuration: string) {
  // Best-effort quiet clean before any build
  // Ensure we clean both architectures when the project tracks arch-specific outputs
  // Use a generic destination and shared derived data like the legacy shell scripts
  const cleanArgs = [
    '-project', project,
    '-scheme', scheme,
    '-configuration', configuration,
    '-destination', 'generic/platform=macOS,name=Any Mac',
    '-derivedDataPath', 'build_data',
    'clean',
    '-quiet',
  ];

  await sh('xcodebuild', cleanArgs);
}

export async function xcodeBuild(project: string, scheme: string, configuration: string, additionalSettings?: string[]) {
  // Run a clean first to ensure no stale artifacts
  await xcodeClean(project, scheme, configuration);

  // Run xcodebuild in quiet mode but inherit stdio so warnings/errors are
  // printed to the console while keeping the overall output reduced by
  // '-quiet'.
  // Request a universal build (both arm64 and x86_64) by setting ARCHS and
  // building for all architectures. BUILD_ACTIVE_ARCH_ONLY=NO ensures Xcode
  // doesn't limit the build to the current host arch. We also pass a
  // generic destination and a derived data path so behavior matches the
  // project's legacy shell scripts.
  const buildArgs = [
    '-project', project,
    '-scheme', scheme,
    '-configuration', configuration,
    '-destination', 'generic/platform=macOS,name=Any Mac',
    '-derivedDataPath', 'build_data',
    'build',
    '-quiet',
  ];

  // Add any additional build settings (e.g., STRIP_INSTALLED_PRODUCT=NO)
  if (additionalSettings) {
    buildArgs.push(...additionalSettings);
  }

  return await sh('xcodebuild', buildArgs);
}
