import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";

export type Migration = {
  version: number;
  name: string;
  sql: string;
  checksum: string;
};

export type AppliedMigration = {
  version: number;
  name: string;
  checksum: string;
};

export type MigrationOptions = {
  database: DatabaseSync;
  migrationsPath: string;
  serviceName: string;
  legacyTableName?: string;
};

/**
 * Loads and validates SQL migrations from a directory with SHA-256 checksums and contiguity checks.
 */
export function loadMigrations(migrationsPath: string, serviceName: string): Migration[] {
  const migrations: Migration[] = [];
  for (const name of readdirSync(migrationsPath).filter((file) => file.endsWith(".sql")).sort()) {
    const match = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(name);
    if (!match) throw new Error(`Invalid ${serviceName} migration filename: ${name}`);
    const sql = readFileSync(resolve(migrationsPath, name), "utf8");
    migrations.push({
      version: Number(match[1]),
      name,
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    });
  }

  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(`${serviceName} migrations must be contiguous; expected version ${index + 1}`);
    }
  });
  return migrations;
}

/**
 * Backfills schema_migrations for databases that previously used PRAGMA user_version before a ledger existed.
 */
export function adoptLegacyVersion(
  database: DatabaseSync,
  migrations: Migration[],
  serviceName: string,
  legacyTableName?: string,
): void {
  const { user_version: legacyVersion } = database.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };
  const { count } = database.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get() as {
    count: number;
  };
  if (legacyVersion === 0 || count !== 0) return;
  if (legacyVersion > migrations.length) {
    throw new Error(`${serviceName} database version ${legacyVersion} has no matching migration files`);
  }
  if (
    legacyTableName &&
    !database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(legacyTableName)
  ) {
    throw new Error(`${serviceName} database has a legacy version but no ${legacyTableName} table`);
  }

  const record = database.prepare(`
    INSERT INTO schema_migrations (version, name, checksum, applied_at)
    VALUES (?, ?, ?, ?)
  `);
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const migration of migrations.slice(0, legacyVersion)) {
      record.run(migration.version, migration.name, migration.checksum, Date.now());
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Ensures a SQLite database schema is current; creates ledger and applies pending migrations atomically.
 */
export function runSqliteMigrations(options: MigrationOptions): { applied: number; total: number } {
  const { database, migrationsPath, serviceName, legacyTableName } = options;
  const migrations = loadMigrations(migrationsPath, serviceName);
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    ) STRICT;
  `);
  adoptLegacyVersion(database, migrations, serviceName, legacyTableName);

  const applied = database.prepare(`
    SELECT version, name, checksum
    FROM schema_migrations
    ORDER BY version
  `).all() as AppliedMigration[];
  applied.forEach((recorded, index) => {
    if (recorded.version !== index + 1) {
      throw new Error(`${serviceName} migration ledger has a gap before version ${recorded.version}`);
    }
  });
  for (const recorded of applied) {
    const migration = migrations.find(({ version }) => version === recorded.version);
    if (!migration) throw new Error(`Applied ${serviceName} migration ${recorded.version} is missing`);
    if (migration.name !== recorded.name || migration.checksum !== recorded.checksum) {
      throw new Error(`Applied ${serviceName} migration ${recorded.version} was modified`);
    }
  }

  let appliedNow = 0;
  for (const migration of migrations.slice(applied.length)) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(migration.sql);
      database.prepare(`
        INSERT INTO schema_migrations (version, name, checksum, applied_at)
        VALUES (?, ?, ?, ?)
      `).run(migration.version, migration.name, migration.checksum, Date.now());
      database.exec(`PRAGMA user_version = ${migration.version}`);
      database.exec("COMMIT");
      appliedNow += 1;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  return { applied: appliedNow, total: migrations.length };
}

/**
 * Runs synchronous work in a SQLite BEGIN IMMEDIATE transaction, committing on success and rolling back on error.
 */
export function withSqliteTransaction<T>(database: DatabaseSync, work: () => T): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
