/**
 * Small D1 helper that reads the database name from the environment.
 *
 * Bun loads `.env.local` automatically; Workers Builds exposes the same
 * values as build variables. The database name is never hardcoded here.
 *
 * Usage:
 *   bun run scripts/d1.ts migrate:local
 *   bun run scripts/d1.ts migrate:remote
 *   bun run scripts/d1.ts seed:local
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { generateWranglerConfig } from './wrangler-config'

const command = process.argv[2]
const databaseName = process.env.D1_DATABASE_NAME

if (!databaseName) {
  throw new Error(
    'D1_DATABASE_NAME is required. Set it in .env.local or as a Workers Builds build variable.',
  )
}

const configFile = generateWranglerConfig()
const wranglerBinary = existsSync('node_modules/.bin/wrangler')
  ? 'node_modules/.bin/wrangler'
  : 'wrangler'

function run(args: string[]): void {
  const result = spawnSync(wranglerBinary, args, {
    stdio: 'inherit',
    env: process.env,
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

switch (command) {
  case 'migrate:local':
    run(['d1', 'migrations', 'apply', databaseName, '--local', '--config', configFile])
    break
  case 'migrate:remote':
    run(['d1', 'migrations', 'apply', databaseName, '--remote', '--config', configFile])
    break
  case 'seed:local':
    run([
      'd1',
      'execute',
      databaseName,
      '--local',
      '--config',
      configFile,
      '--file=archive/import/works.sql',
    ])
    run([
      'd1',
      'execute',
      databaseName,
      '--local',
      '--config',
      configFile,
      '--file=archive/import/logs.sql',
    ])
    break
  case 'verify:local':
    run([
      'd1',
      'execute',
      databaseName,
      '--local',
      '--config',
      configFile,
      '--file=scripts/verify-d1.sql',
    ])
    break
  case 'verify:remote':
    run([
      'd1',
      'execute',
      databaseName,
      '--remote',
      '--config',
      configFile,
      '--file=scripts/verify-d1.sql',
    ])
    break
  default:
    throw new Error(`Unknown command: ${command ?? '(none)'}`)
}
