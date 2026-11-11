// D1-compatible adapter over node:sqlite, so the API runs unchanged in tests and the local E2E server.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { D1Database, D1PreparedStatement, D1Result, SqlValue } from '../../server/types.ts';

class Stmt implements D1PreparedStatement {
  readonly db: DatabaseSync;
  readonly sql: string;
  readonly values: SqlValue[];
  constructor(db: DatabaseSync, sql: string, values: SqlValue[] = []) { this.db = db; this.sql = sql; this.values = values; }
  bind(...values: SqlValue[]) { return new Stmt(this.db, this.sql, values); }
  async first<T>() { return (this.db.prepare(this.sql).get(...this.values) as T | undefined) ?? null; }
  async all<T>(): Promise<D1Result<T>> { return { results: this.db.prepare(this.sql).all(...this.values) as T[], meta: { changes: 0 } }; }
  async run(): Promise<D1Result> { const r = this.db.prepare(this.sql).run(...this.values); return { results: [], meta: { changes: Number(r.changes) } }; }
  runSync() { this.db.prepare(this.sql).run(...this.values); }
}

export function sqliteD1(file = ':memory:'): D1Database & { raw: DatabaseSync } {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  return {
    raw: db,
    prepare: (sql: string) => new Stmt(db, sql),
    async batch(stmts: D1PreparedStatement[]) {
      db.exec('BEGIN');
      try { for (const s of stmts) (s as Stmt).runSync(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
      return stmts.map(() => ({ results: [], meta: { changes: 0 } }));
    },
  };
}

export function migrate(db: DatabaseSync, dir = join(import.meta.dirname, '../../migrations')): void {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(join(dir, f), 'utf8'));
}
