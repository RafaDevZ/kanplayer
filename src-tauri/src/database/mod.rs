use rusqlite::{params, Connection};
use std::collections::HashMap;
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

            CREATE TABLE IF NOT EXISTS stems (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                color TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS timeline_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timeline_id INTEGER NOT NULL,
                stem TEXT NOT NULL,
                stem_id INTEGER,
                time_seconds REAL NOT NULL CHECK (time_seconds >= 0),
                confidence REAL CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
                origin TEXT NOT NULL DEFAULT 'manual',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE,
                FOREIGN KEY (stem_id) REFERENCES stems(id) ON DELETE CASCADE,
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

            CREATE TABLE IF NOT EXISTS scenarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                width INTEGER NOT NULL CHECK (width > 0),
                height INTEGER NOT NULL CHECK (height > 0),
                background_color TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS scenario_elements (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL DEFAULT '',
                scenario_id INTEGER NOT NULL,
                element_type TEXT NOT NULL CHECK (element_type = 'circle'),
                x REAL NOT NULL,
                y REAL NOT NULL,
                scale_x REAL NOT NULL CHECK (scale_x > 0),
                scale_y REAL NOT NULL CHECK (scale_y > 0),
                rotation REAL NOT NULL,
                pivot_x REAL NOT NULL DEFAULT 0.5 CHECK (pivot_x >= 0 AND pivot_x <= 1),
                pivot_y REAL NOT NULL DEFAULT 0.5 CHECK (pivot_y >= 0 AND pivot_y <= 1),
                color TEXT NOT NULL DEFAULT '#00a8ff',
                image_data TEXT,
                image_width REAL,
                image_height REAL,
                operations_json TEXT NOT NULL DEFAULT '[]',
                linked_timeline_id INTEGER,
                linked_stem_id INTEGER,
                stem_response_operation TEXT CHECK (stem_response_operation IS NULL OR stem_response_operation IN ('scale', 'rotation')),
                stem_response_value REAL CHECK (stem_response_value IS NULL OR stem_response_value >= 0),
                stem_response_attack_seconds REAL CHECK (stem_response_attack_seconds IS NULL OR stem_response_attack_seconds >= 0),
                stem_response_release_seconds REAL CHECK (stem_response_release_seconds IS NULL OR stem_response_release_seconds >= 0),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS timeline_events_by_timeline_and_time
                ON timeline_events (timeline_id, time_seconds);
            CREATE INDEX IF NOT EXISTS timeline_events_by_timeline_and_stem
                ON timeline_events (timeline_id, stem);
            CREATE INDEX IF NOT EXISTS timeline_stems_by_timeline
                ON timeline_stems (timeline_id, name);
            CREATE INDEX IF NOT EXISTS scenario_elements_by_scenario
                ON scenario_elements (scenario_id);
            ",
        )
        .map_err(|error| format!("Não foi possível aplicar a estrutura do banco: {error}"))?;

    ensure_timeline_columns(connection)?;
    ensure_scenario_element_columns(connection)?;
    ensure_global_stems(connection)
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

fn ensure_scenario_element_columns(connection: &Connection) -> Result<(), String> {
    let mut statement = connection
        .prepare("PRAGMA table_info(scenario_elements)")
        .map_err(|error| format!("Não foi possível verificar os elementos do cenário: {error}"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("Não foi possível ler os elementos do cenário: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Não foi possível ler os elementos do cenário: {error}"))?;

    // Pivot columns belong to scenario_elements (not timelines). Check the
    // table schema once before each ALTER so startup is safe for both legacy
    // databases and databases that already ran this migration.
    for column in ["pivot_x", "pivot_y"] {
        if !columns.iter().any(|existing| existing == column) {
            connection
                .execute(
                    &format!("ALTER TABLE scenario_elements ADD COLUMN {column} REAL NOT NULL DEFAULT 0.5"),
                    [],
                )
                .map_err(|error| format!("Não foi possível atualizar o pivô dos elementos do cenário: {error}"))?;
        }
    }

    for (column, definition) in [("image_data", "TEXT"), ("image_width", "REAL"), ("image_height", "REAL")] {
        if !columns.iter().any(|existing| existing == column) {
            connection
                .execute(&format!("ALTER TABLE scenario_elements ADD COLUMN {column} {definition}"), [])
                .map_err(|error| format!("Não foi possível atualizar os dados das imagens do cenário: {error}"))?;
        }
    }

    if !columns.iter().any(|column| column == "name") {
        connection
            .execute(
                "ALTER TABLE scenario_elements ADD COLUMN name TEXT NOT NULL DEFAULT ''",
                [],
            )
            .map_err(|error| format!("Não foi possível atualizar o nome dos elementos do cenário: {error}"))?;
    }

    if !columns.iter().any(|column| column == "stem_response_attack_seconds") {
        connection
            .execute(
                "ALTER TABLE scenario_elements ADD COLUMN stem_response_attack_seconds REAL",
                [],
            )
            .map_err(|error| format!("Não foi possível atualizar os elementos do cenário: {error}"))?;
        connection
            .execute(
                "UPDATE scenario_elements SET stem_response_attack_seconds = stem_response_attack_milliseconds WHERE stem_response_attack_seconds IS NULL",
                [],
            )
            .map_err(|error| format!("Não foi possível migrar o ataque dos elementos do cenário: {error}"))?;
    }

    if !columns.iter().any(|column| column == "color") {
        connection
            .execute(
                "ALTER TABLE scenario_elements ADD COLUMN color TEXT NOT NULL DEFAULT '#00a8ff'",
                [],
            )
            .map_err(|error| format!("Não foi possível atualizar a cor dos elementos do cenário: {error}"))?;
    }

    if !columns.iter().any(|column| column == "operations_json") {
        connection.execute("ALTER TABLE scenario_elements ADD COLUMN operations_json TEXT NOT NULL DEFAULT '[]'", [])
            .map_err(|error| format!("Não foi possível atualizar as operações dos elementos do cenário: {error}"))?;
        connection.execute(
            "UPDATE scenario_elements SET operations_json = json_array(json_object('id', id || '-legacy-operation', 'stemId', linked_stem_id, 'operation', stem_response_operation, 'value', stem_response_value, 'attackSeconds', stem_response_attack_seconds, 'releaseSeconds', stem_response_release_seconds)) WHERE stem_response_operation IS NOT NULL",
            [],
        ).map_err(|error| format!("Não foi possível migrar as operações dos elementos do cenário: {error}"))?;
    }

    if !columns.iter().any(|column| column == "stem_response_release_seconds") {
        connection
            .execute(
                "ALTER TABLE scenario_elements ADD COLUMN stem_response_release_seconds REAL",
                [],
            )
            .map_err(|error| format!("Não foi possível atualizar os elementos do cenário: {error}"))?;
        connection
            .execute(
                "UPDATE scenario_elements SET stem_response_release_seconds = stem_response_release_milliseconds WHERE stem_response_release_seconds IS NULL",
                [],
            )
            .map_err(|error| format!("Não foi possível migrar a liberação dos elementos do cenário: {error}"))?;
    }

    Ok(())
}

fn ensure_global_stems(connection: &Connection) -> Result<(), String> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS stems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            color TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );",
    ).map_err(|error| format!("Não foi possível criar os stems globais: {error}"))?;

    let timeline_stem_columns = table_columns(connection, "timeline_stems")?;
    let uses_legacy_stems = timeline_stem_columns.iter().any(|column| column == "name");

    if uses_legacy_stems {
        connection.execute(
            "INSERT OR IGNORE INTO stems (name, color)
             SELECT MIN(name), MIN(color) FROM timeline_stems
             WHERE trim(name) <> '' GROUP BY lower(trim(name)) ORDER BY MIN(id)",
            [],
        ).map_err(|error| format!("Não foi possível consolidar os stems existentes: {error}"))?;
    }

    connection.execute(
        "INSERT OR IGNORE INTO stems (name, color)
         SELECT MIN(stem), '#8a8a8a' FROM timeline_events
         WHERE trim(stem) <> '' GROUP BY lower(trim(stem)) ORDER BY MIN(id)",
        [],
    ).map_err(|error| format!("Não foi possível preservar stems encontrados nos eventos: {error}"))?;

    // Hurt is the reference project: these are its useful lanes and therefore
    // the defaults for clean installations as well.
    for (name, color) in [
        ("Kick", "#e94949"),
        ("Snare", "#4fabee"),
        ("Rides", "#45f583"),
        ("Hat", "#e6d24c"),
    ] {
        connection
            .execute(
                "INSERT OR IGNORE INTO stems (name, color) VALUES (?1, ?2)",
                [name, color],
            )
            .map_err(|error| format!("Não foi possível criar os stems padrão: {error}"))?;
    }

    if uses_legacy_stems {
        migrate_scenario_stem_references(connection)?;
        connection.execute_batch(
            "ALTER TABLE timeline_stems RENAME TO timeline_stems_legacy;
             CREATE TABLE timeline_stems (
                timeline_id INTEGER NOT NULL,
                stem_id INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (timeline_id, stem_id),
                FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE,
                FOREIGN KEY (stem_id) REFERENCES stems(id) ON DELETE CASCADE
             );
             INSERT OR IGNORE INTO timeline_stems (timeline_id, stem_id)
             SELECT legacy.timeline_id, stems.id
             FROM timeline_stems_legacy legacy
             JOIN stems ON lower(trim(stems.name)) = lower(trim(legacy.name));
             DROP TABLE timeline_stems_legacy;",
        ).map_err(|error| format!("Não foi possível migrar as relações de stems: {error}"))?;
    }

    let event_columns = table_columns(connection, "timeline_events")?;
    if !event_columns.iter().any(|column| column == "stem_id") {
        connection.execute("ALTER TABLE timeline_events ADD COLUMN stem_id INTEGER", [])
            .map_err(|error| format!("Não foi possível vincular os eventos aos stems globais: {error}"))?;
    }
    connection.execute(
        "UPDATE timeline_events SET stem_id = (
            SELECT stems.id FROM stems WHERE lower(trim(stems.name)) = lower(trim(timeline_events.stem))
         ) WHERE stem_id IS NULL",
        [],
    ).map_err(|error| format!("Não foi possível migrar os eventos para stems globais: {error}"))?;

    connection.execute_batch(
        "CREATE INDEX IF NOT EXISTS timeline_stems_by_timeline ON timeline_stems (timeline_id, stem_id);
         CREATE INDEX IF NOT EXISTS timeline_events_by_global_stem ON timeline_events (timeline_id, stem_id, time_seconds);",
    ).map_err(|error| format!("Não foi possível indexar os stems globais: {error}"))?;
    Ok(())
}

fn table_columns(connection: &Connection, table: &str) -> Result<Vec<String>, String> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|error| format!("Não foi possível verificar a tabela {table}: {error}"))?;
    let columns = statement.query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("Não foi possível ler a tabela {table}: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Não foi possível ler a tabela {table}: {error}"))?;
    Ok(columns)
}

fn migrate_scenario_stem_references(connection: &Connection) -> Result<(), String> {
    let mappings = {
        let mut statement = connection.prepare(
            "SELECT timeline_stems.id, stems.id FROM timeline_stems
             JOIN stems ON lower(trim(stems.name)) = lower(trim(timeline_stems.name))",
        ).map_err(|error| format!("Não foi possível mapear os stems antigos: {error}"))?;
        let mappings = statement.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))
            .map_err(|error| format!("Não foi possível ler o mapa de stems: {error}"))?
            .collect::<Result<HashMap<_, _>, _>>()
            .map_err(|error| format!("Não foi possível ler o mapa de stems: {error}"))?;
        mappings
    };

    let stored_operations = {
        let mut statement = connection.prepare("SELECT id, operations_json FROM scenario_elements")
            .map_err(|error| format!("Não foi possível ler as operações dos cenários: {error}"))?;
        let stored_operations = statement.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(|error| format!("Não foi possível ler as operações dos cenários: {error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("Não foi possível ler as operações dos cenários: {error}"))?;
        stored_operations
    };

    for (element_id, operations_json) in stored_operations {
        let mut operations = serde_json::from_str::<Vec<serde_json::Value>>(&operations_json)
            .unwrap_or_default();
        let mut changed = false;
        for operation in &mut operations {
            let old_id = operation.get("stemId").and_then(serde_json::Value::as_i64);
            if let Some(global_id) = old_id.and_then(|id| mappings.get(&id)) {
                operation["stemId"] = serde_json::Value::from(*global_id);
                changed = true;
            }
        }
        if changed {
            connection.execute(
                "UPDATE scenario_elements SET operations_json = ?1 WHERE id = ?2",
                params![serde_json::to_string(&operations).unwrap_or_else(|_| "[]".to_string()), element_id],
            ).map_err(|error| format!("Não foi possível migrar uma operação de cenário: {error}"))?;
        }
    }

    for (legacy_id, global_id) in mappings {
        connection.execute(
            "UPDATE scenario_elements SET linked_stem_id = ?1 WHERE linked_stem_id = ?2",
            params![global_id, legacy_id],
        ).map_err(|error| format!("Não foi possível migrar os vínculos dos cenários: {error}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        models::{StemInput, TimelineCreateInput, TimelineSaveInput, TimelineStemInput, TrackInput},
        services::{stem_service, timeline_service},
    };

    #[test]
    fn migrates_hurt_without_losing_timestamps() {
        let source = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("backups")
            .join("kanplayer-before-global-stems-2026-08-30.sqlite3");
        if !source.exists() {
            return;
        }
        let target = std::env::temp_dir().join(format!(
            "kanplayer-global-stems-migration-{}.sqlite3",
            std::process::id(),
        ));
        fs::copy(&source, &target).expect("copy Hurt backup");
        let connection = Connection::open(&target).expect("open copied backup");
        migrate(&connection).expect("migrate copied backup");
        migrate(&connection).expect("rerun migration safely");

        let hurt_event_count: i64 = connection.query_row(
            "SELECT COUNT(*) FROM timeline_events WHERE timeline_id = 4",
            [],
            |row| row.get(0),
        ).expect("count Hurt events");
        assert_eq!(hurt_event_count, 1_376);
        let unresolved_events: i64 = connection.query_row(
            "SELECT COUNT(*) FROM timeline_events WHERE stem_id IS NULL",
            [],
            |row| row.get(0),
        ).expect("count unresolved events");
        assert_eq!(unresolved_events, 0);
        for stem_name in ["Kick", "Snare", "Rides", "Hat"] {
            let exists: i64 = connection.query_row(
                "SELECT COUNT(*) FROM stems WHERE name = ?1 COLLATE NOCASE",
                [stem_name],
                |row| row.get(0),
            ).expect("find default stem");
            assert_eq!(exists, 1, "missing global stem {stem_name}");
        }
        drop(connection);
        let database = Database { path: target.clone() };
        let created_stem = stem_service::create(&database, StemInput {
            name: "Teste global".to_string(),
            color: "#123456".to_string(),
        }).expect("create global stem");
        let connection = database.connect().expect("reopen copied backup");
        let linked_count: i64 = connection.query_row(
            "SELECT COUNT(*) FROM timeline_stems WHERE stem_id = ?1",
            [created_stem.id],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(linked_count, 0);
        drop(connection);

        let updated_stem = stem_service::update(&database, created_stem.id, StemInput {
            name: "Teste global renomeado".to_string(),
            color: "#654321".to_string(),
        }).expect("rename global stem");
        assert_eq!(updated_stem.id, created_stem.id);

        let created_timeline = timeline_service::create(&database, TimelineCreateInput {
            name: "Teste de stems globais".to_string(),
            music: TrackInput {
                name: "Teste de stems globais".to_string(),
                path: "test://global-stems".to_string(),
                duration_seconds: Some(10.0),
                audio_sha256: None,
            },
            bpm: Some(120.0),
        }).expect("create timeline without linked stems");
        assert!(created_timeline.stems.is_empty());

        let linked_timeline = timeline_service::update(&database, created_timeline.id, TimelineSaveInput {
            name: created_timeline.name,
            track: TrackInput {
                name: created_timeline.track.name,
                path: created_timeline.track.path,
                duration_seconds: created_timeline.track.duration_seconds,
                audio_sha256: created_timeline.track.audio_sha256,
            },
            bpm: created_timeline.bpm,
            first_beat_seconds: created_timeline.first_beat_seconds,
            beat_interval_seconds: created_timeline.beat_interval_seconds,
            snap: created_timeline.snap,
            follow_playhead: created_timeline.follow_playhead,
            stems: vec![TimelineStemInput {
                id: Some(created_stem.id),
                name: updated_stem.name,
                color: updated_stem.color,
            }],
            events: vec![],
        }).expect("link global stem to timeline");
        assert_eq!(linked_timeline.stems.len(), 1);
        assert_eq!(linked_timeline.stems[0].id, created_stem.id);

        stem_service::delete(&database, created_stem.id).expect("delete global stem");
        let connection = database.connect().expect("verify global stem deletion");
        let remaining: i64 = connection.query_row(
            "SELECT COUNT(*) FROM stems WHERE id = ?1",
            [created_stem.id],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(remaining, 0);
        drop(connection);
        let _ = fs::remove_file(target);
    }
}
