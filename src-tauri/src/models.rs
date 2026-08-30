use serde::{Deserialize, Serialize};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioFile {
    pub name: String,
    pub path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioImportInput {
    pub file_name: String,
    pub bytes: Vec<u8>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackInput {
    pub name: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_sha256: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub duration_seconds: Option<f64>,
    pub audio_sha256: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEventInput {
    pub stem: String,
    pub time_seconds: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
    pub origin: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEvent {
    pub id: i64,
    pub stem: String,
    pub time_seconds: f64,
    pub confidence: Option<f64>,
    pub origin: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineStemInput {
    pub name: String,
    pub color: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineStem {
    pub id: i64,
    pub name: String,
    pub color: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineSaveInput {
    pub name: String,
    pub track: TrackInput,
    pub bpm: Option<f64>,
    pub first_beat_seconds: Option<f64>,
    pub beat_interval_seconds: Option<f64>,
    pub snap: String,
    pub follow_playhead: bool,
    pub stems: Vec<TimelineStemInput>,
    pub events: Vec<TimelineEventInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineCreateInput {
    pub name: String,
    pub music: TrackInput,
    pub bpm: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Timeline {
    pub id: i64,
    pub name: String,
    pub track: Track,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bpm: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_beat_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub beat_interval_seconds: Option<f64>,
    pub snap: String,
    pub follow_playhead: bool,
    pub stems: Vec<TimelineStem>,
    pub events: Vec<TimelineEvent>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RitraceRenderInput {
    pub job_id: String,
    pub audio_path: String,
    pub kick_min_confidence: f64,
    pub snare_min_confidence: f64,
    pub hihat_min_confidence: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RitraceEvent {
    pub stem: String,
    pub time_seconds: f64,
    pub confidence: f64,
    pub origin: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RitraceRenderResult {
    pub bpm: f64,
    pub first_beat_seconds: f64,
    pub beat_interval_seconds: f64,
    pub events: Vec<RitraceEvent>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioInput {
    pub name: String,
    pub width: i64,
    pub height: i64,
    pub background_color: String,
    #[serde(default)]
    pub elements: Vec<ScenarioElementInput>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Scenario {
    pub id: i64,
    pub name: String,
    pub width: i64,
    pub height: i64,
    pub background_color: String,
    pub elements: Vec<ScenarioElement>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioElementInput {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(rename = "type")]
    pub element_type: String,
    pub x: f64,
    pub y: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub rotation: f64,
    #[serde(default = "default_pivot")]
    pub pivot_x: f64,
    #[serde(default = "default_pivot")]
    pub pivot_y: f64,
    pub color: String,
    #[serde(default)]
    pub operations: Vec<serde_json::Value>,
    pub linked_timeline_id: Option<i64>,
    pub linked_stem_id: Option<i64>,
    pub stem_response_operation: Option<String>,
    pub stem_response_value: Option<f64>,
    pub stem_response_attack_seconds: Option<f64>,
    pub stem_response_release_seconds: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioElement {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub element_type: String,
    pub x: f64,
    pub y: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub rotation: f64,
    pub pivot_x: f64,
    pub pivot_y: f64,
    pub color: String,
    pub operations: Vec<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linked_timeline_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linked_stem_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stem_response_operation: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stem_response_value: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stem_response_attack_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stem_response_release_seconds: Option<f64>,
}

fn default_pivot() -> f64 { 0.5 }
