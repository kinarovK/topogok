-- TopoGok F5: leaderboard periods, leaderboard exclusion, F6 review placeholders, per-account refresh limit.
CREATE TABLE lb_periods (
  teacher_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  started_by TEXT,
  PRIMARY KEY (teacher_id, topic_id, started_at)
);

ALTER TABLE attempts ADD COLUMN lb_excluded_at INTEGER;
ALTER TABLE attempts ADD COLUMN lb_excluded_by TEXT;
ALTER TABLE attempts ADD COLUMN lb_exclude_reason TEXT;
-- F6: NULL = no review needed, 'pending' | 'approved' | 'rejected'. integrity_version 0 = round from before F6.
ALTER TABLE attempts ADD COLUMN review_status TEXT CHECK (review_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE attempts ADD COLUMN integrity_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_leaderboard_at INTEGER;

CREATE INDEX attempts_board ON attempts (teacher_id, topic_id, mode, status);
