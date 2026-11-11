-- TopoGok F2: accounts, classes, sessions, login throttling, audit log, recovery codes.
-- Times are Unix milliseconds. Secrets are never stored in clear: password verifiers are
-- HMAC(PEPPER, client-derived key), session ids and recovery codes are SHA-256 hashes.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('superadmin', 'teacher', 'student')),
  login TEXT NOT NULL,
  login_norm TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  teacher_id TEXT REFERENCES users (id),
  class_id TEXT REFERENCES classes (id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'disabled')),
  pw_salt TEXT NOT NULL,
  pw_iterations INTEGER NOT NULL,
  pw_verifier TEXT NOT NULL,
  pw_changed_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  created_by TEXT,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER
);
CREATE INDEX users_teacher ON users (teacher_id, status);

CREATE TABLE classes (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES users (id),
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at INTEGER NOT NULL,
  archived_at INTEGER,
  UNIQUE (teacher_id, name_norm)
);

-- A student always has exactly one teacher and one class of that same teacher; other roles have neither.
CREATE TRIGGER users_scope_insert BEFORE INSERT ON users
WHEN (NEW.role = 'student' AND (NEW.teacher_id IS NULL OR NEW.class_id IS NULL
        OR (SELECT teacher_id FROM classes WHERE id = NEW.class_id) IS NOT NEW.teacher_id
        OR (SELECT role FROM users WHERE id = NEW.teacher_id) IS NOT 'teacher'))
  OR (NEW.role <> 'student' AND (NEW.teacher_id IS NOT NULL OR NEW.class_id IS NOT NULL))
BEGIN SELECT RAISE(ABORT, 'student_scope'); END;

CREATE TRIGGER users_scope_update BEFORE UPDATE OF role, teacher_id, class_id ON users
WHEN (NEW.role = 'student' AND (NEW.teacher_id IS NULL OR NEW.class_id IS NULL
        OR (SELECT teacher_id FROM classes WHERE id = NEW.class_id) IS NOT NEW.teacher_id
        OR (SELECT role FROM users WHERE id = NEW.teacher_id) IS NOT 'teacher'))
  OR (NEW.role <> 'student' AND (NEW.teacher_id IS NOT NULL OR NEW.class_id IS NOT NULL))
BEGIN SELECT RAISE(ABORT, 'student_scope'); END;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  user_agent TEXT
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE login_throttle (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  locked_until INTEGER
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  teacher_scope TEXT,
  details TEXT
);
CREATE INDEX audit_scope ON audit_log (teacher_scope, id);

CREATE TABLE recovery_codes (
  code_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
