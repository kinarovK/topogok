-- TopoGok 0005: global settings the superadmin can change (tap buffer for lines and points).
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
UPDATE schema_meta SET value = '6' WHERE key = 'version';
