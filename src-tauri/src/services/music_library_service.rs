use crate::models::AudioFile;
use std::{
    fs,
    path::{Path, PathBuf},
};

const AUDIO_EXTENSIONS: &[&str] = &["mp3", "wav", "flac", "ogg", "m4a", "aac", "wma", "opus"];

pub fn list_downloads_audio() -> Result<Vec<AudioFile>, String> {
    let directory = downloads_dir()?;
    let entries = fs::read_dir(&directory)
        .map_err(|error| format!("Não foi possível ler a pasta Downloads: {error}"))?;

    let mut audio_files = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .filter(is_supported_audio)
        .map(|path| AudioFile {
            name: path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_string(),
            path: path.to_string_lossy().into_owned(),
        })
        .collect::<Vec<_>>();

    audio_files.sort_by(|first, second| first.name.to_lowercase().cmp(&second.name.to_lowercase()));
    Ok(audio_files)
}

fn downloads_dir() -> Result<PathBuf, String> {
    std::env::var_os("USERPROFILE")
        .map(|user_profile| Path::new(&user_profile).join("Downloads"))
        .ok_or_else(|| "Não foi possível localizar a pasta Downloads.".to_string())
}

fn is_supported_audio(path: &PathBuf) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            AUDIO_EXTENSIONS
                .iter()
                .any(|item| extension.eq_ignore_ascii_case(item))
        })
}
