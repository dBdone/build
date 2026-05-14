import path from 'node:path';
import fs from 'fs-extra';
import { Logger } from '../utils/logger.js';
import { sh } from './exec.js';

export interface OnexManifestStep {
    name: string;
    cwd: string;
    command: string;
    args?: string[];
}

export interface OnexManifestPathMap {
    from: string;
    to: string;
}

export interface OnexPlatformConfig {
    buildSteps: OnexManifestStep[];
    artifacts: OnexManifestPathMap[];
    thirdPartyRuntime: OnexManifestPathMap[];
}

export interface OnexReleaseManifest {
    nativeRepo: string;
    platforms: {
        mac: SamplerPlatformConfig;
        win: SamplerPlatformConfig;
    };
}

export async function loadOnexManifest(filePath: string): Promise<OnexReleaseManifest> {
    if (!(await fs.pathExists(filePath))) {
        throw new Error(`Manifest file does not exist: ${filePath}`);
    }

    const raw = await fs.readJson(filePath);
    validateManifest(raw, filePath);
    return raw as OnexReleaseManifest;
}

export async function runManifestStep(step: OnexManifestStep, nativeRepoRoot: string, logger: Logger): Promise<void> {
    const absCwd = path.join(nativeRepoRoot, step.cwd);
    const args = step.args ?? [];

    logger.info('Run command', {
        name: step.name,
        cwd: absCwd,
        command: step.command,
        args,
    });

    await sh(step.command, args, { cwd: absCwd });
}

function validateManifest(raw: any, filePath: string) {
    const fail = (msg: string) => {
        throw new Error(`Invalid onex manifest ${filePath}: ${msg}`);
    };

    if (!raw || typeof raw !== 'object') fail('root must be an object');
    if (typeof raw.nativeRepo !== 'string' || !raw.nativeRepo.length) {
        fail('nativeRepo must be a non-empty string');
    }

    if (!raw.platforms || typeof raw.platforms !== 'object') {
        fail('platforms is required');
    }

    for (const platform of ['mac', 'win'] as const) {
        const p = raw.platforms[platform];
        if (!p || typeof p !== 'object') fail(`platforms.${platform} is required`);

        if (!Array.isArray(p.buildSteps)) fail(`platforms.${platform}.buildSteps must be an array`);
        if (!Array.isArray(p.artifacts)) fail(`platforms.${platform}.artifacts must be an array`);
        if (!Array.isArray(p.thirdPartyRuntime)) fail(`platforms.${platform}.thirdPartyRuntime must be an array`);

        for (const step of p.buildSteps) {
            if (!step || typeof step !== 'object') fail(`platforms.${platform}.buildSteps contains invalid item`);
            if (typeof step.name !== 'string' || !step.name.length) fail(`platforms.${platform}.buildSteps.name is required`);
            if (typeof step.cwd !== 'string' || !step.cwd.length) fail(`platforms.${platform}.buildSteps.cwd is required`);
            if (typeof step.command !== 'string' || !step.command.length) fail(`platforms.${platform}.buildSteps.command is required`);
            if (step.args !== undefined && !Array.isArray(step.args)) fail(`platforms.${platform}.buildSteps.args must be an array when provided`);
        }

        for (const mapName of ['artifacts', 'thirdPartyRuntime'] as const) {
            for (const mapping of p[mapName]) {
                if (!mapping || typeof mapping !== 'object') fail(`platforms.${platform}.${mapName} contains invalid item`);
                if (typeof mapping.from !== 'string' || !mapping.from.length) {
                    fail(`platforms.${platform}.${mapName}.from must be a non-empty string`);
                }
                if (typeof mapping.to !== 'string' || !mapping.to.length) {
                    fail(`platforms.${platform}.${mapName}.to must be a non-empty string`);
                }
            }
        }
    }
}
