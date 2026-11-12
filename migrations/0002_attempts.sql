-- TopoGok F3 (lean): one summary row per round. The server stores the seed and question order
-- (snapshot) at start and the replayed result at finish; per-question events are never stored.
CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  data_version TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('practice', 'assessment')),
  question_count TEXT NOT NULL,
  is_full INTEGER NOT NULL,
  time_limit_min INTEGER,
  show_elapsed INTEGER NOT NULL DEFAULT 0,
  rules_version INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  question_ids TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'finished', 'expired', 'abandoned', 'invalid')),
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  duration_ms INTEGER,
  visible_ms INTEGER,
  late_finish INTEGER NOT NULL DEFAULT 0,
  percent REAL,
  points INTEGER,
  max_points INTEGER,
  correct INTEGER,
  total INTEGER,
  grade INTEGER,
  result_hash TEXT,
  invalid_reason TEXT,
  deleted_at INTEGER,
  deleted_by TEXT,
  delete_reason TEXT
);
CREATE INDEX attempts_teacher ON attempts (teacher_id, started_at);
CREATE INDEX attempts_student ON attempts (student_id, started_at);

-- Teacher report refresh limit (F3-09): at most one report query per session every 10 s.
ALTER TABLE sessions ADD COLUMN last_report_at INTEGER;
