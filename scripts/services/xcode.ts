import { sh } from './exec.js';
export async function xcodeBuild(project: string, scheme: string, configuration: string) {
  await sh('xcodebuild', ['-project', project, '-scheme', scheme, '-configuration', configuration, 'build']);
}
