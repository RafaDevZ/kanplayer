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
pub struct TimelineSaveInput {
    pub name: String,
    pub track: TrackInput,
    pub bpm: Option<f64>,
    pub first_beat_seconds: Option<f64>,
    pub beat_interval_seconds: Option<f64>,
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
    pub events: Vec<TimelineEvent>,
}
