import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, test } from "node:test";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const temporaryPaths: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(resolve(tmpdir(), "identity-migrations-"));
  temporaryPaths.push(directory);
  return directory;
}

afterEach(() => {
  while (temporaryPaths.length > 0) {
    rmSync(temporaryPaths.pop()!, { recursive: true, force: true });
  }
});

function copyCompiledAssets(): { root: string; databaseModule: string } {
  const root = temporaryDirectory();
  mkdirSync(resolve(root, "src"), { recursive: true });
  cpSync(resolve("dist-test/src/database.js"), resolve(root, "src/database.js"));
  cpSync(resolve("dist-test/migrations"), resolve(root, "migrations"), { recursive: true });
  return { root, databaseModule: resolve(root, "src/database.js") };
}

function runDatabaseModule(databaseModule: string, databasePath: string) {
  return spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", `await import(${JSON.stringify(pathToFileURL(databaseModule).href)});`],
    {
      cwd: process.cwd(),
      env: { ...process.env, IDENTITY_DB_PATH: databasePath },
      encoding: "utf8",
    },
  );
}

function readMigrationLedger(databasePath: string): { version: number; name: string; checksum: string }[] {
  const database = new DatabaseSync(databasePath);
  try {
    return database.prepare(`
      SELECT version, name, checksum
      FROM schema_migrations
      ORDER BY version
    `).all() as { version: number; name: string; checksum: string }[];
  } finally {
    database.close();
  }
}

test("fresh migrations apply to a disposable database with the expected constraints", () => {
  const { databaseModule } = copyCompiledAssets();
  const databasePath = resolve(temporaryDirectory(), "identity.sqlite");
  const result = runDatabaseModule(databaseModule, databasePath);

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const applied = readMigrationLedger(databasePath);
  assert.deepEqual(
    applied.map(({ version }) => version),
    [1, 2, 3],
  );
  assert.ok(applied.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum)));

  const database = new DatabaseSync(databasePath);
  try {
    const challengeForeignKeys = database.prepare("PRAGMA foreign_key_list(email_challenges)").all() as {
      table: string;
      from: string;
      to: string;
      on_delete: string;
    }[];
    const refreshForeignKeys = database.prepare("PRAGMA foreign_key_list(refresh_tokens)").all() as {
      table: string;
      from: string;
      to: string;
      on_delete: string;
    }[];
    assert.ok(
      challengeForeignKeys.some(
        ({ table, from, to, on_delete }) =>
          table === "users" && from === "user_id" && to === "id" && on_delete === "CASCADE",
      ),
    );
    assert.ok(
      refreshForeignKeys.some(
        ({ table, from, to, on_delete }) =>
          table === "users" && from === "user_id" && to === "id" && on_delete === "CASCADE",
      ),
    );
  } finally {
    database.close();
  }
});

test("migration runner reopens an already-current file database without changing the ledger", () => {
  const { databaseModule } = copyCompiledAssets();
  const databasePath = resolve(temporaryDirectory(), "identity.sqlite");
  assert.equal(runDatabaseModule(databaseModule, databasePath).status, 0);
  const before = readMigrationLedger(databasePath);

  const result = runDatabaseModule(databaseModule, databasePath);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(readMigrationLedger(databasePath), before);
});

test("migration runner rejects edited applied migrations", () => {
  const { root, databaseModule } = copyCompiledAssets();
  const databasePath = resolve(temporaryDirectory(), "identity.sqlite");
  assert.equal(runDatabaseModule(databaseModule, databasePath).status, 0);

  appendFileSync(resolve(root, "migrations/001_initial_auth.sql"), "\n-- changed after apply\n");
  const result = runDatabaseModule(databaseModule, databasePath);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Applied Identity migration 1 was modified/);
});

test("migration runner rejects non-contiguous migration files", () => {
  const root = temporaryDirectory();
  mkdirSync(resolve(root, "src"), { recursive: true });
  cpSync(resolve("dist-test/src/database.js"), resolve(root, "src/database.js"));
  mkdirSync(resolve(root, "migrations"));
  cpSync(resolve("dist-test/migrations/001_initial_auth.sql"), resolve(root, "migrations/001_initial_auth.sql"));
  cpSync(resolve("dist-test/migrations/003_add_user_role.sql"), resolve(root, "migrations/003_add_user_role.sql"));

  const result = runDatabaseModule(resolve(root, "src/database.js"), resolve(temporaryDirectory(), "identity.sqlite"));

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Identity migrations must be contiguous; expected version 2/);
});

test("migration runner rejects invalid migration filenames", () => {
  const { root, databaseModule } = copyCompiledAssets();
  writeFileSync(resolve(root, "migrations/not_a_number.sql"), "-- invalid disposable migration asset\n");

  const result = runDatabaseModule(databaseModule, resolve(temporaryDirectory(), "identity.sqlite"));

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid Identity migration filename: not_a_number\.sql/);
});
