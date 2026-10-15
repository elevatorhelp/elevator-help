CREATE TABLE IF NOT EXISTS daily_question_usage (
  subject_key TEXT NOT NULL,
  usage_day TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (subject_key, usage_day)
);

CREATE INDEX IF NOT EXISTS daily_question_usage_updated_at
  ON daily_question_usage(updated_at);

CREATE TABLE IF NOT EXISTS learning_candidates (
  fingerprint TEXT PRIMARY KEY,
  research_query TEXT NOT NULL,
  source_refs_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected')),
  seen_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS learning_candidates_status
  ON learning_candidates(status, last_seen_at);
