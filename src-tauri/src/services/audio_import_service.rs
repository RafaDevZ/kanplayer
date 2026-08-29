use crate::{
    database::Database,
    models::{AudioFile, AudioImportInput},
};
use std::{
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

const ACCEPTED_EXTENSIONS: &[&str] = &["mp3", "wav", "flac", "ogg", "m4a", "aac"];

pub fn import(database: &Database, input: AudioImportInput) -> Result<AudioFile, String> {
    if input.bytes.is_empty() {
        return Err("O arquivo de áudio está vazio.".to_string());
    }

    let source = Path::new(&input.file_name);
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| "O arquivo não possui uma extensão de áudio válida.".to_string())?;

    if !ACCEPTED_EXTENSIONS.contains(&extension.as_str()) {
        return Err("Formato de áudio não suportado.".to_string());
    }

    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("audio")
        .chars()
        .map(|character| {
            if character.is_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Não foi possível importar o áudio: {error}"))?
        .as_millis();
    let directory = database.data_directory()?.join("audio");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Não foi possível criar a pasta de áudio: {error}"))?;
    let path = directory.join(format!("{stem}_{timestamp}.{extension}"));

    fs::write(&path, input.bytes)
        .map_err(|error| format!("Não foi possível salvar o áudio: {error}"))?;

    Ok(AudioFile {
        name: input.file_name,
        path: path.to_string_lossy().into_owned(),
    })
}
