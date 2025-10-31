import { sh } from './exec.js';
import { execa } from 'execa';
import path from 'node:path';

export async function msbuild(solution: string, configuration = 'Release') {
  const vswhere = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe';
  const { stdout } = await execa(vswhere, [
    '-latest','-products','*','-requires','Microsoft.Component.MSBuild',
    '-find','MSBuild\\**\\Bin\\MSBuild.exe'
  ]);
  const msbuildPath = stdout.trim();
  const resolvedSolution = path.resolve(solution);
  
  // Clean step
  await sh(msbuildPath, [
    resolvedSolution,
    '/t:Clean',
    `/p:Configuration=${configuration}`,
    '/p:Platform=x64',
    '/v:q',
    '/nologo',
  ]);
  
  // Build step
  await sh(msbuildPath, [
    resolvedSolution,
    '/m',                              // multi-core build
    `/p:Configuration=${configuration}`,
    '/p:Platform=x64',
    '/v:q',                            // quiet verbosity
    '/nologo',                         // suppress copyright banner
  ]);
}
