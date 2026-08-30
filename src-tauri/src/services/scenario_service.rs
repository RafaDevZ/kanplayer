use crate::{
    database::Database,
    models::{Scenario, ScenarioElement, ScenarioElementInput, ScenarioInput},
};
use rusqlite::{params, OptionalExtension, Transaction};

pub fn list(database: &Database) -> Result<Vec<Scenario>, String> {
    let connection = database.connect()?;
    let mut statement = connection
        .prepare("SELECT id, name, width, height, background_color FROM scenarios ORDER BY id DESC")
        .map_err(database_error)?;
    let rows = statement.query_map([], read_scenario).map_err(database_error)?;
    let mut scenarios = rows.collect::<Result<Vec<_>, _>>().map_err(database_error)?;
    for scenario in &mut scenarios {
        scenario.elements = list_elements(&connection, scenario.id)?;
    }
    Ok(scenarios)
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
        let operations_json = serde_json::to_string(&element.operations)
            .map_err(|error| format!("Não foi possível salvar as operações do elemento: {error}"))?;
        transaction.execute(
            "INSERT INTO scenario_elements (id, name, scenario_id, element_type, x, y, scale_x, scale_y, rotation, pivot_x, pivot_y, color, operations_json, linked_timeline_id, linked_stem_id, stem_response_operation, stem_response_value, stem_response_attack_seconds, stem_response_release_seconds) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
            params![element.id.trim(), element.name.trim(), scenario_id, element.element_type, element.x, element.y, element.scale_x, element.scale_y, element.rotation, element.pivot_x, element.pivot_y, element.color.trim(), operations_json, element.linked_timeline_id, element.linked_stem_id, element.stem_response_operation, element.stem_response_value, element.stem_response_attack_seconds, element.stem_response_release_seconds],
        ).map_err(database_error)?;
    }
    Ok(())
}

fn list_elements(connection: &rusqlite::Connection, scenario_id: i64) -> Result<Vec<ScenarioElement>, String> {
    let mut statement = connection.prepare(
        "SELECT id, name, element_type, x, y, scale_x, scale_y, rotation, pivot_x, pivot_y, color, operations_json, linked_timeline_id, linked_stem_id, stem_response_operation, stem_response_value, stem_response_attack_seconds, stem_response_release_seconds FROM scenario_elements WHERE scenario_id = ?1 ORDER BY rowid",
    ).map_err(database_error)?;
    let rows = statement.query_map([scenario_id], |row| Ok(ScenarioElement {
        id: row.get(0)?, name: row.get(1)?, element_type: row.get(2)?, x: row.get(3)?, y: row.get(4)?, scale_x: row.get(5)?, scale_y: row.get(6)?, rotation: row.get(7)?, pivot_x: row.get(8)?, pivot_y: row.get(9)?, color: row.get(10)?, operations: serde_json::from_str(&row.get::<_, String>(11)?).unwrap_or_default(), linked_timeline_id: row.get(12)?, linked_stem_id: row.get(13)?, stem_response_operation: row.get(14)?, stem_response_value: row.get(15)?, stem_response_attack_seconds: row.get(16)?, stem_response_release_seconds: row.get(17)?,
    })).map_err(database_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(database_error)
}

fn read_scenario(row: &rusqlite::Row) -> rusqlite::Result<Scenario> {
    Ok(Scenario { id: row.get(0)?, name: row.get(1)?, width: row.get(2)?, height: row.get(3)?, background_color: row.get(4)?, elements: Vec::new() })
}

fn validate(input: &ScenarioInput) -> Result<(), String> {
    if input.name.trim().is_empty() || input.background_color.trim().is_empty() || input.width <= 0 || input.height <= 0 {
        return Err("O cenário precisa de nome, dimensões válidas e cor de fundo.".to_string());
    }
    for element in &input.elements {
        if element.id.trim().is_empty() || element.name.trim().is_empty() || element.element_type != "circle" || element.color.trim().is_empty() || !element.x.is_finite() || !element.y.is_finite() || !element.rotation.is_finite() || !element.scale_x.is_finite() || !element.scale_y.is_finite() || !element.pivot_x.is_finite() || !element.pivot_y.is_finite() || element.scale_x <= 0.0 || element.scale_y <= 0.0 || !(0.0..=1.0).contains(&element.pivot_x) || !(0.0..=1.0).contains(&element.pivot_y) {
            return Err("Um elemento do cenário possui transformação inválida.".to_string());
        }
        for value in [element.stem_response_value, element.stem_response_attack_seconds, element.stem_response_release_seconds] {
            if value.is_some_and(|value| !value.is_finite() || value < 0.0) {
                return Err("Os parâmetros de resposta do elemento são inválidos.".to_string());
            }
        }
        if element.linked_timeline_id.is_some() != element.linked_stem_id.is_some() {
            return Err("O vínculo do stem precisa conter timeline e stem.".to_string());
        }
        if let Some(operation) = &element.stem_response_operation {
            if operation != "scale" && operation != "rotation" && operation != "translation" && operation != "wiggle" {
                return Err("A operação de resposta do elemento é inválida.".to_string());
            }
        }
    }
    Ok(())
}

fn database_error(error: rusqlite::Error) -> String {
    format!("Erro no banco de dados: {error}")
}
