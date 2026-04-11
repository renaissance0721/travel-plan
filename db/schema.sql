CREATE TABLE trips (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  departure TEXT NOT NULL,
  destination TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  cover TEXT,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE trip_days (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  trip_date TEXT NOT NULL,
  city TEXT,
  note TEXT,
  sort_order INTEGER NOT NULL,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE TABLE trip_items (
  id TEXT PRIMARY KEY,
  day_id TEXT NOT NULL,
  title TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  start_place TEXT,
  end_place TEXT,
  transport_mode TEXT,
  actual_cost REAL DEFAULT 0,
  category TEXT,
  notes TEXT,
  progress TEXT NOT NULL DEFAULT 'todo',
  sort_order INTEGER NOT NULL,
  FOREIGN KEY (day_id) REFERENCES trip_days(id) ON DELETE CASCADE
);
