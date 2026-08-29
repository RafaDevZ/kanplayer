use crate::models::{RitraceEvent, RitraceRenderInput, RitraceRenderResult};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};

const PROGRESS_PREFIX: &str = "RITRACE_PROGRESS:";

#[derive(Clone, Default)]
pub struct RitraceJobRegistry(Arc<Mutex<HashMap<String, u32>>>);

#[derive(Deserialize)]
struct TimestampsFile {
    events: Vec<TimestampEvent>,
}

#[derive(Deserialize)]
struct TimestampEvent {
    instrument: String,
    time_seconds: f64,
    confidence: f64,
    origin: Option<String>,
}

#[derive(Deserialize)]
struct SyncFile {
    beat_grid: BeatGrid,
}

#[derive(Deserialize)]
struct BeatGrid {
    bpm: f64,
    first_beat_seconds: f64,
    beat_interval_seconds: f64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct RunnerProgress {
    stage: String,
    percent: u8,
    elapsed_seconds: f64,
    remaining_seconds: Option<f64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressEvent {
    job_id: String,
    stage: String,
    percent: u8,
    elapsed_seconds: f64,
    remaining_seconds: Option<f64>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct RuntimeConfig {
    python: Option<String>,
    demucs_python: Option<String>,
    checkpoint: Option<String>,
    device: Option<String>,
}

pub fn render(app: AppHandle, registry: RitraceJobRegistry, input: RitraceRenderInput) -> Result<RitraceRenderResult, String> {
    validate_input(&input)?;
    let runtime = find_runtime(&app)?;
    let runtime_config = read_runtime_config(&runtime)?;
    let audio = PathBuf::from(&input.audio_path);
    if !audio.is_file() {
        return Err("A música da timeline não foi encontrada para o RiTrace.".to_string());
    }

    let checkpoint = std::env::var("KANPLAYER_RITRACE_CHECKPOINT")
        .ok()
        .or(runtime_config.checkpoint)
        .map(PathBuf::from)
        .ok_or_else(|| {
        "Configure KANPLAYER_RITRACE_CHECKPOINT com o caminho do checkpoint MDX23C do RiTrace.".to_string()
    })?;
    if !checkpoint.is_file() {
        return Err("O checkpoint configurado em KANPLAYER_RITRACE_CHECKPOINT não foi encontrado.".to_string());
    }

    let run_id = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|error| error.to_string())?.as_millis();
    let output = std::env::temp_dir().join(format!("kanplayer-ritrace-{run_id}"));
    fs::create_dir_all(&output).map_err(|error| error.to_string())?;

    let python = std::env::var("KANPLAYER_RITRACE_PYTHON")
        .ok()
        .or(runtime_config.python)
        .unwrap_or_else(|| "python".to_string());
    let demucs_python = std::env::var("KANPLAYER_RITRACE_DEMUCS_PYTHON")
        .ok()
        .or(runtime_config.demucs_python)
        .unwrap_or_else(|| python.clone());
    let device = std::env::var("KANPLAYER_RITRACE_DEVICE")
        .ok()
        .or(runtime_config.device)
        .unwrap_or_else(|| "cuda".to_string());
    let mut child = Command::new(python)
        .args(["-u", runtime.join("run_analysis.py").to_string_lossy().as_ref()])
        .args(["--audio", audio.to_string_lossy().as_ref()])
        .args(["--output", output.to_string_lossy().as_ref()])
        .args(["--checkpoint", checkpoint.to_string_lossy().as_ref()])
        .args(["--device", &device])
        .args(["--demucs-python", &demucs_python])
        .args(["--kick-min-confidence", &input.kick_min_confidence.to_string()])
        .args(["--snare-min-confidence", &input.snare_min_confidence.to_string()])
        .args(["--hihat-min-confidence", &input.hihat_min_confidence.to_string()])
        .current_dir(&runtime)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|error| format!("Não foi possível iniciar o RiTrace: {error}"))?;
    registry
        .0
        .lock()
        .map_err(|_| "Não foi possível registrar a renderização do RiTrace.".to_string())?
        .insert(input.job_id.clone(), child.id());

    let stdout = child.stdout.take().ok_or_else(|| "Não foi possível ler o progresso do RiTrace.".to_string())?;
    for line in BufReader::new(stdout).lines() {
        let line = line.map_err(|error| error.to_string())?;
        if let Some(payload) = line.strip_prefix(PROGRESS_PREFIX) {
            if let Ok(progress) = serde_json::from_str::<RunnerProgress>(payload) {
                let _ = app.emit("ritrace-progress", ProgressEvent {
                    job_id: input.job_id.clone(),
                    stage: progress.stage,
                    percent: progress.percent,
                    elapsed_seconds: progress.elapsed_seconds,
                    remaining_seconds: progress.remaining_seconds,
                });
            }
        }
    }

    let status = child.wait().map_err(|error| error.to_string())?;
    let was_cancelled = registry
        .0
        .lock()
        .map_err(|_| "Não foi possível finalizar a renderização do RiTrace.".to_string())?
        .remove(&input.job_id)
        == Some(0);
    if was_cancelled {
        let _ = fs::remove_dir_all(&output);
        return Err("Renderização do RiTrace cancelada.".to_string());
    }
    if !status.success() {
        let _ = fs::remove_dir_all(&output);
        return Err(format!("O RiTrace terminou com erro (código {}).", status.code().unwrap_or(-1)));
    }
    let result = read_result(&output);
    let _ = fs::remove_dir_all(&output);
    result
}

pub fn cancel(registry: &RitraceJobRegistry, job_id: &str) -> Result<(), String> {
    let mut jobs = registry
        .0
        .lock()
        .map_err(|_| "Não foi possível acessar a renderização do RiTrace.".to_string())?;
    let process_id = jobs
        .get(job_id)
        .copied()
        .ok_or_else(|| "A renderização do RiTrace não está mais ativa.".to_string())?;
    if process_id == 0 {
        return Err("O cancelamento do RiTrace já está em andamento.".to_string());
    }
    jobs.insert(job_id.to_string(), 0);
    drop(jobs);
    let status = Command::new("taskkill")
        .args(["/PID", &process_id.to_string(), "/T", "/F"])
        .status()
        .map_err(|error| format!("Não foi possível cancelar o RiTrace: {error}"))?;
    if !status.success() {
        return Err("Não foi possível cancelar o RiTrace.".to_string());
    }
    Ok(())
}

fn find_runtime(app: &AppHandle) -> Result<PathBuf, String> {
    let current_directory = std::env::current_dir().map_err(|error| error.to_string())?;
    for development_runtime in [
        current_directory.join("tools").join("ritrace"),
        current_directory.join("..").join("tools").join("ritrace"),
    ] {
        if development_runtime.join("run_analysis.py").is_file() {
            return Ok(development_runtime);
        }
    }
    let bundled_runtime = app.path().resource_dir().map_err(|error| error.to_string())?.join("tools").join("ritrace");
    if bundled_runtime.join("run_analysis.py").is_file() {
        return Ok(bundled_runtime);
    }
    Err("O runtime do RiTrace não foi encontrado no KanPlayer.".to_string())
}

fn read_runtime_config(runtime: &Path) -> Result<RuntimeConfig, String> {
    let path = runtime.join("runtime.local.json");
    if !path.is_file() {
        return Ok(RuntimeConfig::default());
    }
    serde_json::from_slice(&fs::read(path).map_err(|error| error.to_string())?)
        .map_err(|error| format!("A configuração local do RiTrace é inválida: {error}"))
}

fn read_result(output: &Path) -> Result<RitraceRenderResult, String> {
    let timestamps: TimestampsFile = serde_json::from_slice(&fs::read(output.join("timestamps.json")).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    let sync: SyncFile = serde_json::from_slice(&fs::read(output.join("sync.json")).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    Ok(RitraceRenderResult {
        bpm: sync.beat_grid.bpm,
        first_beat_seconds: sync.beat_grid.first_beat_seconds,
        beat_interval_seconds: sync.beat_grid.beat_interval_seconds,
        events: timestamps.events.into_iter().map(|event| RitraceEvent {
            stem: event.instrument,
            time_seconds: event.time_seconds,
            confidence: event.confidence,
            origin: event.origin.unwrap_or_else(|| "ritrace".to_string()),
        }).collect(),
    })
}

fn validate_input(input: &RitraceRenderInput) -> Result<(), String> {
    if input.job_id.trim().is_empty() || input.audio_path.trim().is_empty() {
        return Err("A renderização do RiTrace precisa de uma música válida.".to_string());
    }
    for value in [input.kick_min_confidence, input.snare_min_confidence, input.hihat_min_confidence] {
        if !value.is_finite() || !(0.0..=1.0).contains(&value) {
            return Err("As fidelidades precisam estar entre 0% e 100%.".to_string());
        }
    }
    Ok(())
}
