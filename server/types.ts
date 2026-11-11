// Minimal subset of the Cloudflare D1 API the server uses. Production: the D1 binding;
// tests and local E2E: tests/api/sqliteD1.ts over node:sqlite.

export type SqlValue = string | number | null;

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  meta: { changes: number };
}

export interface D1PreparedStatement {
  bind(...values: SqlValue[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  /** Runs all statements in one transaction. */
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export interface Env {
  DB?: D1Database;
  /** Server secret mixed into password verifiers and fake salts. */
  PEPPER?: string;
  /** One-time code for creating the first superadmin. */
  SETUP_CODE?: string;
  /** Lowest accepted client KDF iteration count (tests lower it). */
  MIN_KDF_ITERATIONS?: string;
  APP_BUILD?: string;
}

export type Role = 'superadmin' | 'teacher' | 'student';

export type UserRow = {
  id: string; role: Role; login: string; login_norm: string; full_name: string;
  teacher_id: string | null; class_id: string | null; status: 'active' | 'archived' | 'disabled';
  pw_salt: string; pw_iterations: number; pw_verifier: string; pw_changed_at: number;
  created_at: number; created_by: string | null; updated_at: number; archived_at: number | null;
};

export type ClassRow = { id: string; teacher_id: string; name: string; name_norm: string; status: 'active' | 'archived'; created_at: number; archived_at: number | null };
