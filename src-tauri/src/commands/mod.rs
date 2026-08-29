use crate::{
    database::Database,
    models::{AudioFile, AudioImportInput, Timeline, TimelineCreateInput, TimelineSaveInput},
    services::{audio_import_service, music_library_service, timeline_service},
};
use tauri::State;

#[tauri::command]
pub fn list_downloads_audio() -> Result<Vec<AudioFile>, String> {
    music_library_service::list_downloads_audio()
}

#[tauri::command]
pub fn import_audio_file(
    database: State<Database>,
    audio: AudioImportInput,
) -> Result<AudioFile, String> {
    audio_import_service::import(&database, audio)
}

#[tauri::command]
pub fn get_timeline_for_track(
    database: State<Database>,
    track_path: String,
) -> Result<Option<Timeline>, String> {
    timeline_service::get_for_track(&database, &track_path)
}

#[tauri::command]
pub fn list_timelines(database: State<Database>) -> Result<Vec<Timeline>, String> {
    timeline_service::list(&database)
}

#[tauri::command]
pub fn create_timeline(
    database: State<Database>,
    timeline: TimelineCreateInput,
) -> Result<Timeline, String> {
    timeline_service::create(&database, timeline)
}

#[tauri::command]
pub fn update_timeline(
    database: State<Database>,
    timeline_id: i64,
    timeline: TimelineSaveInput,
) -> Result<Timeline, String> {
    timeline_service::update(&database, timeline_id, timeline)
}

#[tauri::command]
pub fn delete_timeline(database: State<Database>, timeline_id: i64) -> Result<(), String> {
    timeline_service::delete(&database, timeline_id)
}
