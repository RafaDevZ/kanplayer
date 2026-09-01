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
    #[serde(default)]
    pub stem_id: Option<i64>,
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
    pub stem_id: i64,
    pub time_seconds: f64,
    pub confidence: Option<f64>,
    pub origin: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineStemInput {
    #[serde(default)]
    pub id: Option<i64>,
    pub name: String,
    pub color: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StemInput {
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
    pub vocal_path: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vocal_path: Option<String>,
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
    #[serde(default)]
    pub vocal_only: bool,
    pub timeline_id: Option<i64>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vocal_path: Option<String>,
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
    #[serde(default = "default_visible")]
    pub visible: bool,
    #[serde(default = "default_opacity")]
    pub opacity: f64,
    pub color: String,
    #[serde(default)]
    pub image_data: Option<String>,
    #[serde(default)]
    pub image_width: Option<f64>,
    #[serde(default)]
    pub image_height: Option<f64>,
    #[serde(default)]
    pub operations: Vec<serde_json::Value>,
    pub linked_timeline_id: Option<i64>,
    pub linked_stem_id: Option<i64>,
    pub stem_response_operation: Option<String>,
    pub stem_response_value: Option<f64>,
    pub stem_response_attack_seconds: Option<f64>,
    pub stem_response_release_seconds: Option<f64>,
    #[serde(default)]
    pub frequency_response: Option<serde_json::Value>,
    #[serde(default)]
    pub vocal_response: Option<serde_json::Value>,
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
    pub visible: bool,
    pub opacity: f64,
    pub color: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_width: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_height: Option<f64>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frequency_response: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vocal_response: Option<serde_json::Value>,
}

#[derive(Clone, Copy, Default)]
pub(crate) struct LegacyScenarioOperation<'a> {
    pub stem_id: Option<i64>,
    pub operation: Option<&'a str>,
    pub value: Option<f64>,
    pub attack_seconds: Option<f64>,
    pub release_seconds: Option<f64>,
}

fn take_alias(object: &mut serde_json::Map<String, serde_json::Value>, aliases: &[&str]) -> Option<serde_json::Value> {
    aliases.iter().find_map(|alias| object.remove(*alias))
}

fn normalized_operation_name(value: &str) -> Option<&'static str> {
    match value.trim().to_lowercase().as_str() {
        "scale" | "escala" => Some("scale"),
        "rotation" | "rotate" | "rotacao" | "rotação" => Some("rotation"),
        "translation" | "translate" | "translacao" | "translação" => Some("translation"),
        "wiggle" => Some("wiggle"),
        _ => None,
    }
}

fn normalized_transition_name(value: &str) -> Option<&'static str> {
    match value.trim().to_lowercase().as_str() {
        "linear" => Some("linear"),
        "ease" => Some("ease"),
        "ease-in" | "easein" | "easin" => Some("ease-in"),
        "ease-out" | "easeout" => Some("ease-out"),
        "ease-in-out" | "easeinout" | "easinout" => Some("ease-in-out"),
        _ => None,
    }
}

fn normalize_operation_object(
    mut object: serde_json::Map<String, serde_json::Value>,
    element_id: &str,
    index: usize,
) -> serde_json::Value {
    for (canonical, aliases) in [
        ("id", &["operationId", "operation_id"] as &[&str]),
        ("stemId", &["stem_id", "linkedStemId", "linked_stem_id"] as &[&str]),
        ("operation", &["type", "action", "operationType", "operation_type"] as &[&str]),
        ("transition", &["easing", "transitionMode", "transition_mode"] as &[&str]),
        ("value", &["amount"] as &[&str]),
        ("translationX", &["translation_x", "x"] as &[&str]),
        ("translationY", &["translation_y", "y"] as &[&str]),
        ("translationZ", &["translation_z", "z"] as &[&str]),
        ("repetitions", &["repeats", "repeat", "repeticoes", "repetições"] as &[&str]),
        ("attackSeconds", &["attack_seconds"] as &[&str]),
        ("releaseSeconds", &["release_seconds"] as &[&str]),
    ] {
        if !object.contains_key(canonical) {
            if let Some(value) = take_alias(&mut object, aliases) {
                object.insert(canonical.to_string(), value);
            }
        }
    }

    for (seconds_key, milliseconds_aliases) in [
        ("attackSeconds", &["attackMilliseconds", "attack_milliseconds"] as &[&str]),
        ("releaseSeconds", &["releaseMilliseconds", "release_milliseconds"] as &[&str]),
    ] {
        if !object.contains_key(seconds_key) {
            if let Some(milliseconds) = take_alias(&mut object, milliseconds_aliases)
                .and_then(|value| value.as_f64())
            {
                object.insert(seconds_key.to_string(), serde_json::Value::from(milliseconds / 1_000.0));
            }
        }
    }

    if object.get("id").and_then(serde_json::Value::as_str).is_none_or(|id| id.trim().is_empty()) {
        object.insert("id".to_string(), serde_json::Value::from(format!("{element_id}-operation-{index}")));
    }
    if let Some(operation) = object.get("operation").and_then(serde_json::Value::as_str) {
        if let Some(normalized) = normalized_operation_name(operation) {
            object.insert("operation".to_string(), serde_json::Value::from(normalized));
        }
    }
    if let Some(transition) = object.get("transition").and_then(serde_json::Value::as_str) {
        if let Some(normalized) = normalized_transition_name(transition) {
            object.insert("transition".to_string(), serde_json::Value::from(normalized));
        }
    }
    for key in ["stemId", "repetitions"] {
        if let Some(number) = object.get(key).and_then(serde_json::Value::as_str)
            .and_then(|value| value.parse::<i64>().ok())
        {
            object.insert(key.to_string(), serde_json::Value::from(number));
        }
    }
    for key in [
        "value", "translationX", "translationY", "translationZ", "attackSeconds", "releaseSeconds",
    ] {
        if let Some(number) = object.get(key).and_then(serde_json::Value::as_str)
            .and_then(|value| value.parse::<f64>().ok())
        {
            object.insert(key.to_string(), serde_json::Value::from(number));
        }
    }
    serde_json::Value::Object(object)
}

/// Accepts every operation representation previously persisted by KanPlayer and
/// returns the single current representation used by the editor.
pub(crate) fn normalize_scenario_operations(
    raw: &str,
    element_id: &str,
    legacy: LegacyScenarioOperation<'_>,
) -> Vec<serde_json::Value> {
    fn parse(value: serde_json::Value) -> Vec<serde_json::Value> {
        match value {
            serde_json::Value::Array(values) => values,
            serde_json::Value::Object(_) => vec![value],
            serde_json::Value::String(inner) => serde_json::from_str(&inner).map(parse).unwrap_or_default(),
            _ => Vec::new(),
        }
    }

    let mut operations = serde_json::from_str(raw).map(parse).unwrap_or_default()
        .into_iter()
        .filter_map(|value| value.as_object().cloned())
        .enumerate()
        .map(|(index, object)| normalize_operation_object(object, element_id, index))
        .collect::<Vec<_>>();

    if let Some(operation) = legacy.operation.and_then(normalized_operation_name) {
        let already_present = operations.iter().any(|current| {
            current.get("operation").and_then(serde_json::Value::as_str) == Some(operation)
                && current.get("stemId").and_then(serde_json::Value::as_i64) == legacy.stem_id
        });
        if !already_present {
            let mut object = serde_json::Map::new();
            object.insert("id".to_string(), serde_json::Value::from(format!("{element_id}-legacy-operation")));
            object.insert("operation".to_string(), serde_json::Value::from(operation));
            if let Some(value) = legacy.stem_id { object.insert("stemId".to_string(), value.into()); }
            if let Some(value) = legacy.value { object.insert("value".to_string(), value.into()); }
            if let Some(value) = legacy.attack_seconds { object.insert("attackSeconds".to_string(), value.into()); }
            if let Some(value) = legacy.release_seconds { object.insert("releaseSeconds".to_string(), value.into()); }
            operations.push(serde_json::Value::Object(object));
        }
    }
    operations
}

#[cfg(test)]
mod scenario_operation_tests {
    use super::*;

    #[test]
    fn normalizes_object_and_old_operation_keys() {
        let operations = normalize_scenario_operations(
            r#"{"operation_id":"old-id","stem_id":2,"type":"Wiggle","translation_x":12,"repeats":4,"attack_milliseconds":250}"#,
            "element",
            LegacyScenarioOperation::default(),
        );
        assert_eq!(operations.len(), 1);
        assert_eq!(operations[0]["id"], "old-id");
        assert_eq!(operations[0]["stemId"], 2);
        assert_eq!(operations[0]["operation"], "wiggle");
        assert_eq!(operations[0]["translationX"], 12);
        assert_eq!(operations[0]["repetitions"], 4);
        assert_eq!(operations[0]["attackSeconds"], 0.25);
    }

    #[test]
    fn merges_legacy_operation_without_discarding_current_operations() {
        let operations = normalize_scenario_operations(
            r#"[{"id":"scale","stemId":1,"operation":"scale","value":1.2}]"#,
            "element",
            LegacyScenarioOperation {
                stem_id: Some(2),
                operation: Some("wiggle"),
                value: None,
                attack_seconds: Some(0.1),
                release_seconds: Some(0.2),
            },
        );
        assert_eq!(operations.len(), 2);
        assert_eq!(operations[0]["operation"], "scale");
        assert_eq!(operations[1]["operation"], "wiggle");
        assert_eq!(operations[1]["stemId"], 2);
    }

    #[test]
    fn legacy_migration_is_idempotent() {
        let legacy = LegacyScenarioOperation {
            stem_id: Some(2),
            operation: Some("wiggle"),
            ..LegacyScenarioOperation::default()
        };
        let first = normalize_scenario_operations("[]", "element", legacy);
        let second = normalize_scenario_operations(
            &serde_json::to_string(&first).unwrap(),
            "element",
            legacy,
        );
        assert_eq!(first, second);
    }
}

fn default_pivot() -> f64 { 0.5 }
fn default_visible() -> bool { true }
fn default_opacity() -> f64 { 1.0 }
