mod commands;
mod database;
mod models;
mod services;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let database =
                database::Database::initialize(&app.handle()).map_err(std::io::Error::other)?;
            app.manage(database);
            app.manage(services::ritrace_service::RitraceJobRegistry::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_downloads_audio,
            commands::import_audio_file,
            commands::get_timeline_for_track,
            commands::list_timelines,
            commands::create_timeline,
            commands::update_timeline,
            commands::delete_timeline,
            commands::list_stems,
            commands::create_stem,
            commands::update_stem,
            commands::delete_stem,
            commands::list_scenarios,
            commands::create_scenario,
            commands::update_scenario,
            commands::delete_scenario,
            commands::render_ritrace,
            commands::cancel_ritrace_render,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
