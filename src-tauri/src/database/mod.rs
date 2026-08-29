use rusqlite::Connection;
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

const DATABASE_FILE_NAME: &str = "kanplayer.sqlite3";

#[derive(Clone)]
pub struct Database {
    path: PathBuf,
}

impl Database {
    pub fn initialize(app: &AppHandle) -> Result<Self, String> {
        let directory = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("Não foi possível localizar os dados do app: {error}"))?;
        fs::create_dir_all(&directory)
            .map_err(|error| format!("Não foi possível criar os dados do app: {error}"))?;

        let database = Self {
            path: directory.join(DATABASE_FILE_NAME),
        };
        let connection = database.connect()?;
        migrate(&connection)?;
        Ok(database)
    }

    pub fn connect(&self) -> Result<Connection, String> {
        let connection = Connection::open(&self.path)
            .map_err(|error| format!("Não foi possível abrir o banco de dados: {error}"))?;
        connection
            .execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(|error| format!("Não foi possível configurar o banco de dados: {error}"))?;
        Ok(connection)
    }

    pub fn data_directory(&self) -> Result<PathBuf, String> {
        self.path
            .parent()
            .map(PathBuf::from)
            .ok_or_else(|| "Não foi possível localizar os dados do app.".to_string())
    }
}

fn migrate(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                duration_seconds REAL,
                audio_sha256 TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS timelines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id INTEGER NOT NULL UNIQUE,
                name TEXT NOT NULL DEFAULT '',
                bpm REAL CHECK (bpm IS NULL OR bpm > 0),
                first_beat_seconds REAL,
                beat_interval_seconds REAL CHECK (beat_interval_seconds IS NULL OR beat_interval_seconds > 0),
                snap TEXT NOT NULL DEFAULT '1/16',
                follow_playhead INTEGER NOT NULL DEFAULT 0 CHECK (follow_playhead IN (0, 1)),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS timeline_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timeline_id INTEGER NOT NULL,
                stem TEXT NOT NULL,
                time_seconds REAL NOT NULL CHECK (time_seconds >= 0),
                confidence REAL CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
                origin TEXT NOT NULL DEFAULT 'manual',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE,
                UNIQUE (timeline_id, stem, time_seconds)
            );

            CREATE TABLE IF NOT EXISTS timeline_stems (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timeline_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                color TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE,
                UNIQUE (timeline_id, name)
            );

            CREATE INDEX IF NOT EXISTS timeline_events_by_timeline_and_time
                ON timeline_events (timeline_id, time_seconds);
            CREATE INDEX IF NOT EXISTS timeline_events_by_timeline_and_stem
                ON timeline_events (timeline_id, stem);
            CREATE INDEX IF NOT EXISTS timeline_stems_by_timeline
                ON timeline_stems (timeline_id, name);
            ",
        )
        .map_err(|error| format!("Não foi possível aplicar a estrutura do banco: {error}"))?;

    ensure_timeline_columns(connection)?;
    ensure_default_stems(connection)
}

fn ensure_timeline_columns(connection: &Connection) -> Result<(), String> {
    let mut statement = connection
        .prepare("PRAGMA table_info(timelines)")
        .map_err(|error| format!("Não foi possível verificar a estrutura do banco: {error}"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("Não foi possível ler a estrutura do banco: {error}"))?;
    let columns = columns
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Não foi possível ler a estrutura do banco: {error}"))?;

    if !columns.iter().any(|column| column == "name") {
        connection
            .execute(
                "ALTER TABLE timelines ADD COLUMN name TEXT NOT NULL DEFAULT ''",
                [],
            )
            .map_err(|error| format!("Não foi possível atualizar a estrutura do banco: {error}"))?;
    }

    if !columns.iter().any(|column| column == "snap") {
        connection
            .execute(
                "ALTER TABLE timelines ADD COLUMN snap TEXT NOT NULL DEFAULT '1/16'",
                [],
            )
            .map_err(|error| format!("Não foi possível atualizar a estrutura do banco: {error}"))?;
    }

    if !columns.iter().any(|column| column == "follow_playhead") {
        connection
            .execute(
                "ALTER TABLE timelines ADD COLUMN follow_playhead INTEGER NOT NULL DEFAULT 0",
                [],
            )
            .map_err(|error| format!("Não foi possível atualizar a estrutura do banco: {error}"))?;
    }

    Ok(())
}

fn ensure_default_stems(connection: &Connection) -> Result<(), String> {
    for (name, color) in [
        ("kick", "#e94949"),
        ("snare", "#4ba7f0"),
        ("hihat", "#f5c545"),
    ] {
        connection
            .execute(
                "INSERT OR IGNORE INTO timeline_stems (timeline_id, name, color) SELECT id, ?1, ?2 FROM timelines",
                [name, color],
            )
            .map_err(|error| format!("Não foi possível criar os stems padrão: {error}"))?;
    }
    Ok(())
}
