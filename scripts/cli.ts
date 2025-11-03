#!/usr/bin/env -S tsx
import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Logger } from './utils/logger.js';
import { buildPentimento } from './products/pentimento.js';
import { buildApp } from './products/app.js';

const argv = yargs(hideBin(process.argv))
  .scriptName('build')
  .strict()
  .command('pentimento <action>', 'Build/package/deploy Pentimento', (y) =>
    y.positional('action', { choices: ['build'] as const })
      .option('platform', { choices: ['mac', 'win'] as const, demandOption: true })
      .option('mode', { choices: ['working', 'latest'] as const, default: 'working' as const })
      .option('fake-version', { type: 'string', default: '9.9.9-9' })
      .option('deploy', { type: 'boolean', default: false })
      .option('skip-notarize', { type: 'boolean', default: false })
      .option('json', { type: 'boolean', default: false })
    , async (args) => {
      const logger = new Logger(!!args.json);
      await buildPentimento(logger, {
        platform: args.platform, mode: args.mode as 'working' | 'latest', fakeVersion: args.fakeVersion,
        deploy: args.deploy, skipNotarize: args.skipNotarize
      });
    })
  .command('app <action>', 'Build/package/deploy dBdone App', (y) =>
    y.positional('action', { choices: ['build'] as const })
      .option('platform', { choices: ['mac', 'win'] as const, demandOption: true })
      .option('mode', { choices: ['working', 'latest'] as const, default: 'working' as const })
      .option('fake-version', { type: 'string', default: '9.9.9-9' })
      .option('deploy', { type: 'boolean', default: false })
      .option('skip-notarize', { type: 'boolean', default: false })
      .option('json', { type: 'boolean', default: false })
    , async (args) => {
      const logger = new Logger(!!args.json);
      await buildApp(logger, {
        platform: args.platform, mode: args.mode as 'working' | 'latest', fakeVersion: args.fakeVersion,
        deploy: args.deploy, skipNotarize: args.skipNotarize
      });
    })
  .demandCommand(1)
  .help()
  .parse();

// Top-level unhandled rejections → non-zero exit (unattended safety)
process.on('unhandledRejection', (e) => { console.error(String(e)); process.exit(2); });
