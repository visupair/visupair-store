-- Per-user monthly caps for email change initiations and password changes (reduces transactional email volume).
CREATE TABLE IF NOT EXISTS user_security_change_quota (
  userId TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  emailChangeMonth TEXT NOT NULL DEFAULT '',
  emailChangeCount INTEGER NOT NULL DEFAULT 0,
  passwordChangeMonth TEXT NOT NULL DEFAULT '',
  passwordChangeCount INTEGER NOT NULL DEFAULT 0
);
