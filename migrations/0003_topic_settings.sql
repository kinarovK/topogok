-- TopoGok F4: per teacher and topic, the features students must not be asked about.
-- Storing the disabled ids means features added in a later data release are enabled by default.
CREATE TABLE topic_settings (
  teacher_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL,
  disabled_ids TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (teacher_id, topic_id)
);

ALTER TABLE attempts ADD COLUMN settings_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attempts ADD COLUMN restricted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attempts ADD COLUMN disabled_ids TEXT; -- the teacher's disabled set at start, for replay
