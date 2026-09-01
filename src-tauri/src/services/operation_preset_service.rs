use crate::models::OperationPreset;
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

fn preset_category(category: &str) -> Result<&'static str, String> {
    match category {
        "operation" => Ok("operation"),
        "frequency" => Ok("frequency"),
        "vocal" => Ok("vocal"),
        _ => Err("A categoria do preset é inválida.".to_string()),
    }
}

fn presets_directory(app: &AppHandle, category: &str) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Não foi possível localizar os dados do KanPlayer: {error}"))?
        .join("operation-presets");
    // Presets antigos de operações continuam no diretório raiz. As novas
    // categorias ficam isoladas para que nunca apareçam no dropdown errado.
    let directory = if category == "operation" { root } else { root.join(category) };
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Não foi possível criar o diretório de presets: {error}"))?;
    Ok(directory)
}

fn safe_file_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Digite um nome para o preset.".to_string());
    }
    let safe = trimmed
        .chars()
        .map(|character| if character.is_alphanumeric() || matches!(character, '-' | '_') { character } else { '_' })
        .collect::<String>();
    Ok(format!("{safe}.json"))
}

pub fn list(app: &AppHandle, category: String) -> Result<Vec<OperationPreset>, String> {
    let category = preset_category(&category)?;
    let mut presets = fs::read_dir(presets_directory(app, category)?)
        .map_err(|error| format!("Não foi possível listar os presets: {error}"))?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().extension().and_then(|extension| extension.to_str()) == Some("json"))
        .filter_map(|entry| fs::read_to_string(entry.path()).ok())
        .filter_map(|content| serde_json::from_str::<OperationPreset>(&content).ok())
        .filter(|preset| preset.category == category)
        .collect::<Vec<_>>();
    presets.sort_by_key(|preset| preset.name.to_lowercase());
    Ok(presets)
}

pub fn save(app: &AppHandle, name: String, category: String, operation: serde_json::Value) -> Result<OperationPreset, String> {
    let category = preset_category(&category)?;
    if !operation.is_object() {
        return Err("A configuração da operação é inválida.".to_string());
    }
    let preset = OperationPreset { name: name.trim().to_string(), category: category.to_string(), operation };
    let path = presets_directory(app, category)?.join(safe_file_name(&preset.name)?);
    let json = serde_json::to_string_pretty(&preset)
        .map_err(|error| format!("Não foi possível gerar o preset: {error}"))?;
    fs::write(path, json).map_err(|error| format!("Não foi possível salvar o preset: {error}"))?;
    Ok(preset)
}
