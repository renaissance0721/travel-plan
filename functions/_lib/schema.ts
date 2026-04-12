import { type Env } from './http'

const SCHEMA_STATEMENTS = [
  `
    CREATE TABLE IF NOT EXISTS shared_trip_state (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS trip_documents (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      departure TEXT NOT NULL,
      destination TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS trip_shares (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      shared_by_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (trip_id, user_id),
      FOREIGN KEY (trip_id) REFERENCES trip_documents(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (shared_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `,
  'CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)',
  'CREATE INDEX IF NOT EXISTS idx_trip_documents_owner_user_id ON trip_documents(owner_user_id)',
  'CREATE INDEX IF NOT EXISTS idx_trip_documents_updated_at ON trip_documents(updated_at)',
  'CREATE INDEX IF NOT EXISTS idx_trip_shares_user_id ON trip_shares(user_id)',
]

let schemaPromise: Promise<void> | null = null

export async function ensureAppSchema(env: Env) {
  if (!schemaPromise) {
    schemaPromise = initializeSchema(env).catch((error) => {
      schemaPromise = null
      throw error
    })
  }

  await schemaPromise
}

export function getDatabaseErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    const message = error.message || ''
    if (message.includes('D1_ERROR') || message.includes('no such table') || message.includes('no such index')) {
      return 'Database setup is incomplete. Please check the D1 binding and redeploy once.'
    }

    return message
  }

  return fallback
}

async function initializeSchema(env: Env) {
  for (const statement of SCHEMA_STATEMENTS) {
    await env.DB.prepare(statement).bind().run()
  }
}
