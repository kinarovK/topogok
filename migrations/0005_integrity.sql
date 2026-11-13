-- TopoGok F6: page-leave signals summarised per round, and the teacher's review decision.
ALTER TABLE attempts ADD COLUMN hidden_count INTEGER;
ALTER TABLE attempts ADD COLUMN hidden_ms INTEGER;
ALTER TABLE attempts ADD COLUMN blur_count INTEGER;
ALTER TABLE attempts ADD COLUMN blur_ms INTEGER;
ALTER TABLE attempts ADD COLUMN offline_count INTEGER;
ALTER TABLE attempts ADD COLUMN offline_ms INTEGER;
ALTER TABLE attempts ADD COLUMN integrity_json TEXT;
ALTER TABLE attempts ADD COLUMN review_by TEXT;
ALTER TABLE attempts ADD COLUMN review_at INTEGER;
ALTER TABLE attempts ADD COLUMN review_reason TEXT;

-- Lets /api/health see column-only migrations.
CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO schema_meta (key, value) VALUES ('version', '5');
