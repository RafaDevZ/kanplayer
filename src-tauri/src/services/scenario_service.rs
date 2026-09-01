use crate::{
    database::Database,
    models::{normalize_scenario_operations, LegacyScenarioOperation, Scenario, ScenarioElement, ScenarioElementInput, ScenarioInput},
};
use rusqlite::{params, OptionalExtension, Transaction};
use std::collections::{HashMap, HashSet};

pub fn list(database: &Database) -> Result<Vec<Scenario>, String> {
    let connection = database.connect()?;
    let mut statement = connection
        .prepare("SELECT id, name, width, height, background_color FROM scenarios ORDER BY id DESC")
        .map_err(database_error)?;
    let rows = statement.query_map([], read_scenario).map_err(database_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(database_error)
}

pub fn get(database: &Database, scenario_id: i64) -> Result<Scenario, String> {
    get_by_id(&database.connect()?, scenario_id)
}

pub fn create(database: &Database, input: ScenarioInput) -> Result<Scenario, String> {
    validate(&input)?;
    let mut connection = database.connect()?;
    let transaction = connection.transaction().map_err(database_error)?;
    transaction.execute(
        "INSERT INTO scenarios (name, width, height, background_color) VALUES (?1, ?2, ?3, ?4)",
        params![input.name.trim(), input.width, input.height, input.background_color.trim()],
    ).map_err(database_error)?;
    let scenario_id = transaction.last_insert_rowid();
    replace_elements(&transaction, scenario_id, &input.elements)?;
    transaction.commit().map_err(database_error)?;
    get_by_id(&connection, scenario_id)
}

pub fn update(database: &Database, scenario_id: i64, input: ScenarioInput) -> Result<Scenario, String> {
    validate(&input)?;
    let mut connection = database.connect()?;
    let transaction = connection.transaction().map_err(database_error)?;
    if transaction.execute(
        "UPDATE scenarios SET name = ?1, width = ?2, height = ?3, background_color = ?4, updated_at = CURRENT_TIMESTAMP WHERE id = ?5",
        params![input.name.trim(), input.width, input.height, input.background_color.trim(), scenario_id],
    ).map_err(database_error)? == 0 {
        return Err("Cenário não encontrado.".to_string());
    }
    replace_elements(&transaction, scenario_id, &input.elements)?;
    transaction.commit().map_err(database_error)?;
    get_by_id(&connection, scenario_id)
}

pub fn delete(database: &Database, scenario_id: i64) -> Result<(), String> {
    let connection = database.connect()?;
    if connection.execute("DELETE FROM scenarios WHERE id = ?1", [scenario_id]).map_err(database_error)? == 0 {
        return Err("Cenário não encontrado.".to_string());
    }
    Ok(())
}

fn get_by_id(connection: &rusqlite::Connection, scenario_id: i64) -> Result<Scenario, String> {
    let mut scenario = connection.query_row(
        "SELECT id, name, width, height, background_color FROM scenarios WHERE id = ?1",
        [scenario_id],
        read_scenario,
    ).optional().map_err(database_error)?.ok_or_else(|| "Cenário não encontrado.".to_string())?;
    scenario.elements = list_elements(connection, scenario_id)?;
    Ok(scenario)
}

fn replace_elements(transaction: &Transaction, scenario_id: i64, elements: &[ScenarioElementInput]) -> Result<(), String> {
    transaction.execute("DELETE FROM scenario_elements WHERE scenario_id = ?1", [scenario_id]).map_err(database_error)?;
    for element in elements {
        let raw_operations = serde_json::to_string(&element.operations)
            .map_err(|error| format!("Não foi possível salvar as operações do elemento: {error}"))?;
        let operations = normalize_scenario_operations(&raw_operations, element.id.trim(), LegacyScenarioOperation {
            stem_id: element.linked_stem_id,
            operation: element.stem_response_operation.as_deref(),
            value: element.stem_response_value,
            attack_seconds: element.stem_response_attack_seconds,
            release_seconds: element.stem_response_release_seconds,
        });
        let operations_json = serde_json::to_string(&operations)
            .map_err(|error| format!("Não foi possível salvar as operações do elemento: {error}"))?;
        transaction.execute(
            "INSERT INTO scenario_elements (id, name, scenario_id, element_type, x, y, scale_x, scale_y, rotation, pivot_x, pivot_y, visible, opacity, color, image_data, image_width, image_height, operations_json, frequency_response_json, vocal_response_json, linked_timeline_id, linked_stem_id, stem_response_operation, stem_response_value, stem_response_attack_seconds, stem_response_release_seconds, rig_parent_id, rig_parent_anchor_x, rig_parent_anchor_y, rig_child_anchor_x, rig_child_anchor_y) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31)",
            params![element.id.trim(), element.name.trim(), scenario_id, element.element_type, element.x, element.y, element.scale_x, element.scale_y, element.rotation, element.pivot_x, element.pivot_y, element.visible, element.opacity, element.color.trim(), element.image_data, element.image_width, element.image_height, operations_json, element.frequency_response.as_ref().map(|value| value.to_string()), element.vocal_response.as_ref().map(|value| value.to_string()), element.linked_timeline_id, element.linked_stem_id, element.stem_response_operation, element.stem_response_value, element.stem_response_attack_seconds, element.stem_response_release_seconds, element.rig_parent_id, element.rig_parent_anchor_x, element.rig_parent_anchor_y, element.rig_child_anchor_x, element.rig_child_anchor_y],
        ).map_err(database_error)?;
    }
    Ok(())
}

fn list_elements(connection: &rusqlite::Connection, scenario_id: i64) -> Result<Vec<ScenarioElement>, String> {
    let mut statement = connection.prepare(
        "SELECT id, name, element_type, x, y, scale_x, scale_y, rotation, pivot_x, pivot_y, visible, opacity, color, image_data, image_width, image_height, operations_json, frequency_response_json, vocal_response_json, linked_timeline_id, linked_stem_id, stem_response_operation, stem_response_value, stem_response_attack_seconds, stem_response_release_seconds, rig_parent_id, rig_parent_anchor_x, rig_parent_anchor_y, rig_child_anchor_x, rig_child_anchor_y FROM scenario_elements WHERE scenario_id = ?1 ORDER BY rowid",
    ).map_err(database_error)?;
    let rows = statement.query_map([scenario_id], |row| read_scenario_element(row, 0)).map_err(database_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(database_error)
}

fn read_scenario_element(row: &rusqlite::Row, offset: usize) -> rusqlite::Result<ScenarioElement> {
    let id = row.get::<_, String>(offset)?;
    let operations_json = row.get::<_, String>(offset + 16)?;
    let linked_stem_id = row.get::<_, Option<i64>>(offset + 20)?;
    let stem_response_operation = row.get::<_, Option<String>>(offset + 21)?;
    let stem_response_value = row.get::<_, Option<f64>>(offset + 22)?;
    let stem_response_attack_seconds = row.get::<_, Option<f64>>(offset + 23)?;
    let stem_response_release_seconds = row.get::<_, Option<f64>>(offset + 24)?;
    let operations = normalize_scenario_operations(&operations_json, &id, LegacyScenarioOperation {
        stem_id: linked_stem_id,
        operation: stem_response_operation.as_deref(),
        value: stem_response_value,
        attack_seconds: stem_response_attack_seconds,
        release_seconds: stem_response_release_seconds,
    });
    Ok(ScenarioElement {
        id, name: row.get(offset + 1)?, element_type: row.get(offset + 2)?, x: row.get(offset + 3)?, y: row.get(offset + 4)?, scale_x: row.get(offset + 5)?, scale_y: row.get(offset + 6)?, rotation: row.get(offset + 7)?, pivot_x: row.get(offset + 8)?, pivot_y: row.get(offset + 9)?, visible: row.get(offset + 10)?, opacity: row.get(offset + 11)?, color: row.get(offset + 12)?, image_data: row.get(offset + 13)?, image_width: row.get(offset + 14)?, image_height: row.get(offset + 15)?, operations, frequency_response: row.get::<_, Option<String>>(offset + 17)?.and_then(|value| serde_json::from_str(&value).ok()), vocal_response: row.get::<_, Option<String>>(offset + 18)?.and_then(|value| serde_json::from_str(&value).ok()), linked_timeline_id: row.get(offset + 19)?, linked_stem_id, stem_response_operation, stem_response_value, stem_response_attack_seconds, stem_response_release_seconds, rig_parent_id: row.get(offset + 25)?, rig_parent_anchor_x: row.get(offset + 26)?, rig_parent_anchor_y: row.get(offset + 27)?, rig_child_anchor_x: row.get(offset + 28)?, rig_child_anchor_y: row.get(offset + 29)?,
    })
}

fn read_scenario(row: &rusqlite::Row) -> rusqlite::Result<Scenario> {
    Ok(Scenario { id: row.get(0)?, name: row.get(1)?, width: row.get(2)?, height: row.get(3)?, background_color: row.get(4)?, elements: Vec::new() })
}

fn validate(input: &ScenarioInput) -> Result<(), String> {
    if input.name.trim().is_empty() || input.background_color.trim().is_empty() || input.width <= 0 || input.height <= 0 {
        return Err("O cenário precisa de nome, dimensões válidas e cor de fundo.".to_string());
    }
    for element in &input.elements {
        if element.id.trim().is_empty() || element.name.trim().is_empty() || element.element_type != "circle" || element.color.trim().is_empty() || !element.x.is_finite() || !element.y.is_finite() || !element.rotation.is_finite() || !element.scale_x.is_finite() || !element.scale_y.is_finite() || !element.pivot_x.is_finite() || !element.pivot_y.is_finite() || !element.opacity.is_finite() || element.scale_x <= 0.0 || element.scale_y <= 0.0 || !(0.0..=1.0).contains(&element.pivot_x) || !(0.0..=1.0).contains(&element.pivot_y) || !(0.0..=1.0).contains(&element.opacity) || element.image_width.is_some_and(|value| !value.is_finite() || value <= 0.0) || element.image_height.is_some_and(|value| !value.is_finite() || value <= 0.0) {
            return Err("Um elemento do cenário possui transformação inválida.".to_string());
        }
        if element.stem_response_value.is_some_and(|value| !value.is_finite()) {
            return Err("Os parâmetros de resposta do elemento são inválidos.".to_string());
        }
        for value in [element.stem_response_attack_seconds, element.stem_response_release_seconds] {
            if value.is_some_and(|value| !value.is_finite() || value < 0.0) {
                return Err("Os parâmetros de resposta do elemento são inválidos.".to_string());
            }
        }
        if element.linked_timeline_id.is_some() != element.linked_stem_id.is_some() {
            return Err("O vínculo do stem precisa conter timeline e stem.".to_string());
        }
        if let Some(operation) = &element.stem_response_operation {
            if operation != "scale" && operation != "width" && operation != "height" && operation != "rotation" && operation != "opacity" && operation != "translation" && operation != "wiggle" && operation != "random" && operation != "wander" {
                return Err("A operação de resposta do elemento é inválida.".to_string());
            }
        }
    }
    let by_id = input.elements.iter().map(|element| (element.id.as_str(), element)).collect::<HashMap<_, _>>();
    for element in &input.elements {
        let Some(parent_id) = element.rig_parent_id.as_deref() else { continue; };
        if parent_id == element.id || !by_id.contains_key(parent_id) {
            return Err("Um vínculo de rig aponta para um componente inválido.".to_string());
        }
        let anchors = [
            element.rig_parent_anchor_x,
            element.rig_parent_anchor_y,
            element.rig_child_anchor_x,
            element.rig_child_anchor_y,
        ];
        if anchors.iter().any(|value| value.is_none_or(|value| !value.is_finite() || !(0.0..=1.0).contains(&value))) {
            return Err("Um vínculo de rig possui pontos inválidos.".to_string());
        }
        let mut current = Some(parent_id);
        let mut visited = HashSet::new();
        while let Some(current_id) = current {
            if current_id == element.id || !visited.insert(current_id) {
                return Err("Os vínculos de rig não podem formar ciclos.".to_string());
            }
            current = by_id.get(current_id).and_then(|parent| parent.rig_parent_id.as_deref());
        }
    }
    Ok(())
}

fn database_error(error: rusqlite::Error) -> String {
    format!("Erro no banco de dados: {error}")
}
