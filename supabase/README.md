# Supabase migrations

SQL files in `migrations/` are the source of truth for schema. Filenames follow `NNN_short_description.sql` ordered by NNN.

## Applying a migration

We apply migrations through the Supabase MCP server (not the Supabase CLI) since the MCP plugin is already authenticated.

For each new migration file `NNN_x.sql`:

1. Open the file, copy its SQL.
2. Call `mcp__supabase__apply_migration` with:
   - `name`: `NNN_x` (no `.sql` extension)
   - `query`: the SQL contents
3. Commit the SQL file alongside the code change that depends on it.

## Regenerating TypeScript types

After any schema change, regenerate `src/lib/database.types.ts`:

1. Call `mcp__supabase__generate_typescript_types`.
2. Write the returned `types` string to `src/lib/database.types.ts`.
3. Commit alongside the migration.

## Verifying schema state

`mcp__supabase__list_tables` and `mcp__supabase__list_migrations` show what's actually live.
