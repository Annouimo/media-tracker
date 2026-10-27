/**
 * Generate a Wrangler configuration file from deployment/build environment
 * variables. Wrangler CLI commands such as `d1 migrations apply` cannot read
 * the Vite plugin's programmatic config, so they need a real config file.
 *
 * The generated file lives at the repository root (gitignored) and contains
 * no secrets: only the D1 database name/id and local paths.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function generateWranglerConfig(): string {
  const databaseId = process.env.D1_DATABASE_ID
  const databaseName = process.env.D1_DATABASE_NAME

  if (!databaseId || !databaseName) {
    throw new Error(
      'D1_DATABASE_ID and D1_DATABASE_NAME are required. Set them in .env.local or as Workers Builds build variables.',
    )
  }

  const file = join(process.cwd(), 'wrangler.generated.jsonc')

  writeFileSync(
    file,
    `${JSON.stringify(
      {
        $schema: './node_modules/wrangler/config-schema.json',
        name: 'media-tracker',
        compatibility_date: '2026-10-26',
        main: './worker/index.ts',
        d1_databases: [
          {
            binding: 'DB',
            database_name: databaseName,
            database_id: databaseId,
            migrations_dir: './migrations',
          },
        ],
      },
      null,
      2,
    )}\n`,
  )

  return file
}

if (import.meta.main) {
  console.log(generateWranglerConfig())
}
