#!/usr/bin/env -S tsx
import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { buildPentimento } from './products/pentimento.js';
// import { buildApp } from './products/app.js';

const argv = yargs(hideBin(process.argv))
  .scriptName('build')
  .strict()
  .command('pentimento <action>', 'Build/package/deploy Pentimento', (y) =>
    y.positional('action', { choices: ['build'] as const })
     .option('platform', { choices: ['mac','win'] as const, demandOption: true })
     .option('mode', { choices: ['working','latest'] as const, default: 'working' as const })
     .option('fake-version', { type: 'string', default: '9.9.9-9' })
     .option('deploy', { type: 'boolean', default: false })
     .option('skip-notarize', { type: 'boolean', default: false })
     .option('json', { type: 'boolean', default: false })
  , async (args) => {
    await buildPentimento({
      platform: args.platform, mode: args.mode as 'working' | 'latest', fakeVersion: args.fakeVersion,
      deploy: args.deploy, skipNotarize: args.skipNotarize, json: args.json
    });
  })
  /*
  .command('app <action>', 'Build/package/deploy App', (y) =>
    y.positional('action', { choices: ['build'] as const })
     .option('platform', { choices: ['mac','win'] as const, demandOption: true })
     .option('mode', { choices: ['working','latest'] as const, default: 'working' })
     .option('deploy', { type: 'boolean', default: false })
     .option('json', { type: 'boolean', default: false })
  , async (args) => {
    await buildApp({ platform: args.platform, mode: args.mode, deploy: args.deploy, json: args.json });
  })
    */
  .demandCommand(1)
  .help()
  .parse();

// Top-level unhandled rejections → non-zero exit (unattended safety)
process.on('unhandledRejection', (e) => { console.error(String(e)); process.exit(2); });
