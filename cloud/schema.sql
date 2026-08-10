CREATE TABLE IF NOT EXISTS price_samples (
  season TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  item_name TEXT,
  contributor_hash TEXT NOT NULL,
  price_fe REAL NOT NULL CHECK(price_fe > 0),
  observed_at TEXT NOT NULL,
  PRIMARY KEY (season, item_id, contributor_hash)
);
CREATE INDEX IF NOT EXISTS idx_price_samples_recent ON price_samples(season, observed_at);
