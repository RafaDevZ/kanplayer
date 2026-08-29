use crate::{
    database::Database,
    models::{
        Timeline, TimelineCreateInput, TimelineEvent, TimelineEventInput, TimelineSaveInput,
        TimelineStem, TimelineStemInput, Track, TrackInput,
    },
};
use rusqlite::{params, Connection, OptionalExtension, Transaction};

pub fn list(database: &Database) -> Result<Vec<Timeline>, String> {
    let connection = database.connect()?;
    let mut statement = connection.prepare("SELECT timelines.id FROM timelines INNER JOIN tracks ON tracks.id = timelines.track_id ORDER BY tracks.name COLLATE NOCASE").map_err(database_error)?;
    let ids = statement
        .query_map([], |row| row.get::<_, i64>(0))
        .map_err(database_error)?;
    ids.collect::<Result<Vec<_>, _>>()
        .map_err(database_error)?
        .into_iter()
        .map(|id| get_by_id(&connection, id))
        .collect()
}

pub fn get_for_track(database: &Database, track_path: &str) -> Result<Option<Timeline>, String> {
    let connection = database.connect()?;
    let id = connection.query_row("SELECT timelines.id FROM timelines INNER JOIN tracks ON tracks.id = timelines.track_id WHERE tracks.path = ?1", [track_path], |row| row.get(0)).optional().map_err(database_error)?;
    id.map(|timeline_id| get_by_id(&connection, timeline_id))
        .transpose()
}

pub fn create(database: &Database, input: TimelineCreateInput) -> Result<Timeline, String> {
    validate_creation(&input)?;
    let mut connection = database.connect()?;
    let transaction = connection.transaction().map_err(database_error)?;
    let exists = transaction.query_row("SELECT 1 FROM timelines INNER JOIN tracks ON tracks.id = timelines.track_id WHERE tracks.path = ?1", [&input.music.path], |_| Ok(())).optional().map_err(database_error)?.is_some();
    if exists {
        return Err("Esta música já possui uma timeline.".to_string());
    }

    let track = upsert_track(&transaction, &input.music)?;
    transaction
        .execute(
            "INSERT INTO timelines (track_id, name, bpm) VALUES (?1, ?2, ?3)",
            params![track.id, input.name, input.bpm],
        )
        .map_err(database_error)?;
    let timeline_id = transaction.last_insert_rowid();
    replace_stems(
        &transaction,
        timeline_id,
        &[
            TimelineStemInput {
                name: "kick".to_string(),
                color: "#e94949".to_string(),
            },
            TimelineStemInput {
                name: "snare".to_string(),
                color: "#4ba7f0".to_string(),
            },
            TimelineStemInput {
                name: "hihat".to_string(),
                color: "#f5c545".to_string(),
            },
        ],
    )?;
    transaction.commit().map_err(database_error)?;
    get_for_track(database, &track.path)?
        .ok_or_else(|| "A timeline criada não foi encontrada.".to_string())
}

pub fn update(
    database: &Database,
    timeline_id: i64,
    input: TimelineSaveInput,
) -> Result<Timeline, String> {
    validate_update(&input)?;
    let mut connection = database.connect()?;
    let transaction = connection.transaction().map_err(database_error)?;
    let stored_path = transaction.query_row("SELECT tracks.path FROM timelines INNER JOIN tracks ON tracks.id = timelines.track_id WHERE timelines.id = ?1", [timeline_id], |row| row.get::<_, String>(0)).optional().map_err(database_error)?.ok_or_else(|| "Timeline não encontrada.".to_string())?;
    if stored_path != input.track.path {
        return Err("Uma timeline não pode ser vinculada a outra música.".to_string());
    }

    transaction.execute("UPDATE tracks SET name = ?1, duration_seconds = ?2, audio_sha256 = ?3, updated_at = CURRENT_TIMESTAMP WHERE path = ?4", params![input.track.name, input.track.duration_seconds, input.track.audio_sha256, input.track.path]).map_err(database_error)?;
    transaction.execute("UPDATE timelines SET name = ?1, bpm = ?2, first_beat_seconds = ?3, beat_interval_seconds = ?4, snap = ?5, follow_playhead = ?6, updated_at = CURRENT_TIMESTAMP WHERE id = ?7", params![input.name, input.bpm, input.first_beat_seconds, input.beat_interval_seconds, input.snap, input.follow_playhead, timeline_id]).map_err(database_error)?;
    replace_stems(&transaction, timeline_id, &input.stems)?;
    replace_events(&transaction, timeline_id, &input.events)?;
    transaction.commit().map_err(database_error)?;
    get_by_id(&database.connect()?, timeline_id)
}

fn replace_stems(
    transaction: &Transaction,
    timeline_id: i64,
    stems: &[TimelineStemInput],
) -> Result<(), String> {
    transaction
        .execute("DELETE FROM timeline_stems WHERE timeline_id = ?1", [timeline_id])
        .map_err(database_error)?;
    for stem in stems {
        transaction
            .execute(
                "INSERT INTO timeline_stems (timeline_id, name, color) VALUES (?1, ?2, ?3)",
                params![timeline_id, stem.name, stem.color],
            )
            .map_err(database_error)?;
    }
    Ok(())
}

pub fn delete(database: &Database, timeline_id: i64) -> Result<(), String> {
    let connection = database.connect()?;
    if connection
        .execute("DELETE FROM timelines WHERE id = ?1", [timeline_id])
        .map_err(database_error)?
        == 0
    {
        return Err("Timeline não encontrada.".to_string());
    }
    Ok(())
}

fn upsert_track(transaction: &Transaction, input: &TrackInput) -> Result<Track, String> {
    transaction.execute("INSERT INTO tracks (name, path, duration_seconds, audio_sha256) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(path) DO UPDATE SET name = excluded.name, duration_seconds = excluded.duration_seconds, audio_sha256 = excluded.audio_sha256, updated_at = CURRENT_TIMESTAMP", params![input.name, input.path, input.duration_seconds, input.audio_sha256]).map_err(database_error)?;
    transaction
        .query_row(
            "SELECT id, name, path, duration_seconds, audio_sha256 FROM tracks WHERE path = ?1",
            [&input.path],
            |row| {
                Ok(Track {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    path: row.get(2)?,
                    duration_seconds: row.get(3)?,
                    audio_sha256: row.get(4)?,
                })
            },
        )
        .map_err(database_error)
}

fn replace_events(
    transaction: &Transaction,
    timeline_id: i64,
    events: &[TimelineEventInput],
) -> Result<(), String> {
    transaction
        .execute(
            "DELETE FROM timeline_events WHERE timeline_id = ?1",
            [timeline_id],
        )
        .map_err(database_error)?;
    for event in events {
        transaction.execute("INSERT INTO timeline_events (timeline_id, stem, time_seconds, confidence, origin) VALUES (?1, ?2, ?3, ?4, ?5)", params![timeline_id, event.stem, event.time_seconds, event.confidence, event.origin.as_deref().unwrap_or("manual")]).map_err(database_error)?;
    }
    Ok(())
}

fn get_by_id(connection: &Connection, timeline_id: i64) -> Result<Timeline, String> {
    let mut timeline = connection.query_row("SELECT timelines.id, timelines.name, tracks.id, tracks.name, tracks.path, tracks.duration_seconds, tracks.audio_sha256, timelines.bpm, timelines.first_beat_seconds, timelines.beat_interval_seconds, timelines.snap, timelines.follow_playhead FROM timelines INNER JOIN tracks ON tracks.id = timelines.track_id WHERE timelines.id = ?1", [timeline_id], |row| Ok(Timeline { id: row.get(0)?, name: row.get(1)?, track: Track { id: row.get(2)?, name: row.get(3)?, path: row.get(4)?, duration_seconds: row.get(5)?, audio_sha256: row.get(6)? }, bpm: row.get(7)?, first_beat_seconds: row.get(8)?, beat_interval_seconds: row.get(9)?, snap: row.get(10)?, follow_playhead: row.get(11)?, stems: Vec::new(), events: Vec::new() })).map_err(database_error)?;
    timeline.stems = list_stems(connection, timeline_id)?;
    timeline.events = list_events(connection, timeline_id)?;
    Ok(timeline)
}

fn list_stems(connection: &Connection, timeline_id: i64) -> Result<Vec<TimelineStem>, String> {
    let mut statement = connection
        .prepare("SELECT id, name, color FROM timeline_stems WHERE timeline_id = ?1 ORDER BY id")
        .map_err(database_error)?;
    let rows = statement
        .query_map([timeline_id], |row| {
            Ok(TimelineStem {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
            })
        })
        .map_err(database_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(database_error)
}

fn list_events(connection: &Connection, timeline_id: i64) -> Result<Vec<TimelineEvent>, String> {
    let mut statement = connection.prepare("SELECT id, stem, time_seconds, confidence, origin FROM timeline_events WHERE timeline_id = ?1 ORDER BY time_seconds, id").map_err(database_error)?;
    let rows = statement
        .query_map([timeline_id], |row| {
            Ok(TimelineEvent {
                id: row.get(0)?,
                stem: row.get(1)?,
                time_seconds: row.get(2)?,
                confidence: row.get(3)?,
                origin: row.get(4)?,
            })
        })
        .map_err(database_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(database_error)
}

fn validate_creation(input: &TimelineCreateInput) -> Result<(), String> {
    if input.name.trim().is_empty()
        || input.music.name.trim().is_empty()
        || input.music.path.trim().is_empty()
    {
        return Err("A timeline precisa de nome, e a música de nome e caminho.".to_string());
    }
    if input
        .bpm
        .is_some_and(|value| !value.is_finite() || value <= 0.0)
    {
        return Err("O BPM precisa ser maior que zero.".to_string());
    }
    Ok(())
}

fn validate_update(input: &TimelineSaveInput) -> Result<(), String> {
    if input.name.trim().is_empty()
        || input.track.name.trim().is_empty()
        || input.track.path.trim().is_empty()
    {
        return Err("A timeline precisa de nome, e a música de nome e caminho.".to_string());
    }
    for value in [
        input.track.duration_seconds,
        input.bpm,
        input.first_beat_seconds,
        input.beat_interval_seconds,
    ]
    .into_iter()
    .flatten()
    {
        if !value.is_finite() || value < 0.0 {
            return Err("Os valores da timeline precisam ser números válidos.".to_string());
        }
    }
    if input.bpm.is_some_and(|value| value <= 0.0)
        || input
            .beat_interval_seconds
            .is_some_and(|value| value <= 0.0)
    {
        return Err("BPM e intervalo entre beats precisam ser maiores que zero.".to_string());
    }
    if input.snap.trim().is_empty() {
        return Err("O snap precisa ser informado.".to_string());
    }
    for stem in &input.stems {
        if stem.name.trim().is_empty() || stem.color.trim().is_empty() {
            return Err("Os stems precisam de nome e cor.".to_string());
        }
    }
    for event in &input.events {
        if event.stem.trim().is_empty()
            || !event.time_seconds.is_finite()
            || event.time_seconds < 0.0
            || event
                .confidence
                .is_some_and(|value| !value.is_finite() || !(0.0..=1.0).contains(&value))
        {
            return Err("Os eventos precisam de stem, tempo e confiança válidos.".to_string());
        }
    }
    Ok(())
}

fn database_error(error: rusqlite::Error) -> String {
    format!("Erro no banco de dados: {error}")
}
