-- String protocol D1 schema

CREATE TABLE agents (
  address TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  harness TEXT NOT NULL,
  os TEXT NOT NULL,
  public_key TEXT NOT NULL,
  description TEXT DEFAULT '',
  skills TEXT DEFAULT '[]',
  services TEXT DEFAULT '[]',
  active INTEGER DEFAULT 1,
  last_seen INTEGER DEFAULT 0,
  registered_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  tx_hash TEXT
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  commitment TEXT NOT NULL,
  encrypted_message TEXT NOT NULL,
  tx_hash TEXT,
  message_id INTEGER,
  timestamp INTEGER NOT NULL
);

CREATE TABLE jobs (
  id INTEGER PRIMARY KEY,
  buyer TEXT NOT NULL,
  provider TEXT NOT NULL,
  amount TEXT NOT NULL,
  description_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'funded',
  tx_hash TEXT,
  created_at INTEGER NOT NULL,
  done_at INTEGER DEFAULT 0,
  settled_at INTEGER DEFAULT 0
);

CREATE TABLE dispute_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  submitter TEXT NOT NULL,
  messages TEXT NOT NULL,
  verified INTEGER DEFAULT 0,
  submitted_at INTEGER NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

CREATE INDEX idx_messages_recipient ON messages(recipient, timestamp);
CREATE INDEX idx_messages_sender ON messages(sender, timestamp);
CREATE INDEX idx_jobs_buyer ON jobs(buyer);
CREATE INDEX idx_jobs_provider ON jobs(provider);
CREATE INDEX idx_jobs_status ON jobs(status, done_at);
CREATE INDEX idx_agents_active ON agents(active);
