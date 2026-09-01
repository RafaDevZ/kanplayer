use crate::{
    database::Database,
    models::{AudioFile, AudioImportInput, OperationPreset, RitraceRenderInput, RitraceRenderResult, Scenario, ScenarioInput, StemInput, Timeline, TimelineCreateInput, TimelineSaveInput, TimelineStem},
    services::{audio_import_service, music_library_service, operation_preset_service, ritrace_service, scenario_service, stem_service, timeline_service},
};
use tauri::{AppHandle, State};

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

#[tauri::command]
pub fn list_stems(database: State<Database>) -> Result<Vec<TimelineStem>, String> {
    stem_service::list(&database)
}

#[tauri::command]
pub fn create_stem(database: State<Database>, stem: StemInput) -> Result<TimelineStem, String> {
    stem_service::create(&database, stem)
}

#[tauri::command]
pub fn update_stem(database: State<Database>, stem_id: i64, stem: StemInput) -> Result<TimelineStem, String> {
    stem_service::update(&database, stem_id, stem)
}

#[tauri::command]
pub fn delete_stem(database: State<Database>, stem_id: i64) -> Result<(), String> {
    stem_service::delete(&database, stem_id)
}

#[tauri::command]
pub fn list_scenarios(database: State<Database>) -> Result<Vec<Scenario>, String> {
    scenario_service::list(&database)
}

#[tauri::command]
pub fn get_scenario(database: State<Database>, scenario_id: i64) -> Result<Scenario, String> {
    scenario_service::get(&database, scenario_id)
}

#[tauri::command]
pub fn create_scenario(database: State<Database>, scenario: ScenarioInput) -> Result<Scenario, String> {
    scenario_service::create(&database, scenario)
}

#[tauri::command]
pub fn update_scenario(
    database: State<Database>,
    scenario_id: i64,
    scenario: ScenarioInput,
) -> Result<Scenario, String> {
    scenario_service::update(&database, scenario_id, scenario)
}

#[tauri::command]
pub fn delete_scenario(database: State<Database>, scenario_id: i64) -> Result<(), String> {
    scenario_service::delete(&database, scenario_id)
}

#[tauri::command]
pub fn list_operation_presets(app: AppHandle, category: String) -> Result<Vec<OperationPreset>, String> {
    operation_preset_service::list(&app, category)
}

#[tauri::command]
pub fn save_operation_preset(
    app: AppHandle,
    name: String,
    category: String,
    operation: serde_json::Value,
) -> Result<OperationPreset, String> {
    operation_preset_service::save(&app, name, category, operation)
}

#[tauri::command]
pub async fn render_ritrace(
    app: AppHandle,
    registry: State<'_, ritrace_service::RitraceJobRegistry>,
    input: RitraceRenderInput,
) -> Result<RitraceRenderResult, String> {
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || ritrace_service::render(app, registry, input))
        .await
        .map_err(|error| format!("A execução do RiTrace foi interrompida: {error}"))?
}

#[tauri::command]
pub fn cancel_ritrace_render(
    registry: State<ritrace_service::RitraceJobRegistry>,
    job_id: String,
) -> Result<(), String> {
    ritrace_service::cancel(&registry, &job_id)
}
