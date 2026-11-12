import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const APPLICATION_ID = 0x5534434c; // U4CL
const SCHEMA_VERSION = 1;

const schema = `
  CREATE TABLE classroom_metadata (
    database_id TEXT PRIMARY KEY
  ) STRICT;
  CREATE TABLE rooms (
    code TEXT PRIMARY KEY,
    host_hash TEXT NOT NULL UNIQUE,
    lesson TEXT NOT NULL,
    lottery INTEGER NOT NULL CHECK (lottery IN (0, 1)),
    created_at INTEGER NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    next_index INTEGER NOT NULL DEFAULT 0,
    step_index INTEGER,
    active_run TEXT,
    discussion TEXT,
    finished INTEGER NOT NULL DEFAULT 0 CHECK (finished IN (0, 1)),
    frozen_pool TEXT,
    winners TEXT,
    FOREIGN KEY (code, active_run) REFERENCES runs(room, id)
  ) STRICT;
  CREATE TABLE runs (
    room TEXT NOT NULL REFERENCES rooms(code),
    id TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    attempt INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'locked', 'revealed', 'aborted')),
    snapshot TEXT,
    paper_counts TEXT,
    opened_at INTEGER NOT NULL,
    closed_at INTEGER,
    revealed_at INTEGER,
    PRIMARY KEY (room, id),
    UNIQUE (room, step_index, attempt)
  ) STRICT;
  CREATE UNIQUE INDEX one_open_run_per_room ON runs(room) WHERE status = 'open';
  CREATE TABLE participants (
    room TEXT NOT NULL REFERENCES rooms(code),
    number INTEGER NOT NULL,
    token_hash TEXT,
    seat_hash TEXT,
    paper_credited_at INTEGER,
    PRIMARY KEY (room, number),
    UNIQUE (room, token_hash),
    UNIQUE (room, seat_hash)
  ) STRICT;
  CREATE TABLE participant_credentials (
    room TEXT NOT NULL REFERENCES rooms(code),
    kind TEXT NOT NULL CHECK (kind IN ('seat', 'student')),
    digest TEXT NOT NULL,
    PRIMARY KEY (room, kind, digest)
  ) STRICT;
  CREATE TABLE answers (
    room TEXT NOT NULL,
    run TEXT NOT NULL,
    participant INTEGER NOT NULL,
    request_id TEXT NOT NULL,
    value TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    PRIMARY KEY (room, run, participant),
    FOREIGN KEY (room, run) REFERENCES runs(room, id),
    FOREIGN KEY (room, participant) REFERENCES participants(room, number)
  ) STRICT;
  CREATE INDEX answers_by_participant ON answers(room, participant);
  CREATE TABLE command_receipts (
    room TEXT NOT NULL REFERENCES rooms(code),
    request_id TEXT NOT NULL,
    digest TEXT NOT NULL,
    receipt TEXT NOT NULL,
    PRIMARY KEY (room, request_id)
  ) STRICT;
`;

export function openClassroomDatabase(databasePath, readOnly) {
  const db = new DatabaseSync(databasePath, { readOnly, timeout: 5000 });
  try {
    if (!readOnly) db.exec('BEGIN IMMEDIATE');
    const { application_id: applicationId } = db.prepare('PRAGMA application_id').get();
    const { user_version: version } = db.prepare('PRAGMA user_version').get();
    if (!readOnly && applicationId === 0 && version === 0 && !db.prepare(
      'SELECT 1 FROM sqlite_schema WHERE name NOT GLOB ? LIMIT 1'
    ).get('sqlite_%')) {
      db.exec(schema);
      db.prepare('INSERT INTO classroom_metadata (database_id) VALUES (?)').run(randomUUID());
      db.exec(`PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = ${SCHEMA_VERSION};`);
    } else if (applicationId !== APPLICATION_ID || version !== SCHEMA_VERSION) {
      throw new Error('This database belongs to a different application or an unsupported Unit 4 schema.');
    }

    const metadata = db.prepare('SELECT database_id FROM classroom_metadata').get();
    if (!metadata) throw new Error('Unit 4 database metadata is missing.');
    if (!readOnly) {
      db.exec('COMMIT');
      db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    }
    return { db, schemaVersion: SCHEMA_VERSION, databaseId: metadata.database_id };
  } catch (error) {
    db.close();
    throw error;
  }
}
