use crate::{
    database::Database,
    models::{StemInput, TimelineStem},
};
use rusqlite::{params, OptionalExtension, Transaction};

pub fn list(database: &Database) -> Result<Vec<TimelineStem>, String> {
    let connection = database.connect()?;
    let mut statement = connection
        .prepare("SELECT id, name, color FROM stems ORDER BY id")
        .map_err(database_error)?;
    let stems = statement
        .query_map([], |row| Ok(TimelineStem { id: row.get(0)?, name: row.get(1)?, color: row.get(2)? }))
        .map_err(database_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(database_error)?;
    Ok(stems)
}

pub fn create(database: &Database, input: StemInput) -> Result<TimelineStem, String> {
    validate(&input)?;
    let mut connection = database.connect()?;
    let transaction = connection.transaction().map_err(database_error)?;
    transaction.execute(
        "INSERT INTO stems (name, color) VALUES (?1, ?2)",
        params![input.name.trim(), input.color.trim()],
    ).map_err(database_error)?;
    let stem_id = transaction.last_insert_rowid();
    transaction.commit().map_err(database_error)?;
    get_by_id(&connection, stem_id)
}

pub fn update(database: &Database, stem_id: i64, input: StemInput) -> Result<TimelineStem, String> {
    validate(&input)?;
    let connection = database.connect()?;
    if connection.execute(
        "UPDATE stems SET name = ?1, color = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
        params![input.name.trim(), input.color.trim(), stem_id],
    ).map_err(database_error)? == 0 {
        return Err("Stem não encontrado.".to_string());
    }
    connection.execute("UPDATE timeline_events SET stem = ?1 WHERE stem_id = ?2", params![input.name.trim(), stem_id])
        .map_err(database_error)?;
    get_by_id(&connection, stem_id)
}

pub fn delete(database: &Database, stem_id: i64) -> Result<(), String> {
    let mut connection = database.connect()?;
    let transaction = connection.transaction().map_err(database_error)?;
    delete_in_transaction(&transaction, stem_id)?;
    transaction.commit().map_err(database_error)
}

pub fn delete_in_transaction(transaction: &Transaction, stem_id: i64) -> Result<(), String> {
    transaction.execute("DELETE FROM timeline_events WHERE stem_id = ?1", [stem_id]).map_err(database_error)?;
    clear_scenario_references(transaction, stem_id)?;
    if transaction.execute("DELETE FROM stems WHERE id = ?1", [stem_id]).map_err(database_error)? == 0 {
        return Err("Stem não encontrado.".to_string());
    }
    Ok(())
}

fn clear_scenario_references(transaction: &Transaction, stem_id: i64) -> Result<(), String> {
    let stored_operations = {
        let mut statement = transaction.prepare("SELECT id, operations_json FROM scenario_elements")
            .map_err(database_error)?;
        let stored_operations = statement.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(database_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(database_error)?;
        stored_operations
    };
    for (element_id, operations_json) in stored_operations {
        let mut operations = serde_json::from_str::<Vec<serde_json::Value>>(&operations_json).unwrap_or_default();
        let mut changed = false;
        for operation in &mut operations {
            if operation.get("stemId").and_then(serde_json::Value::as_i64) == Some(stem_id) {
                if let Some(object) = operation.as_object_mut() {
                    object.remove("stemId");
                    changed = true;
                }
            }
        }
        if changed {
            transaction.execute(
                "UPDATE scenario_elements SET operations_json = ?1 WHERE id = ?2",
                params![serde_json::to_string(&operations).unwrap_or_else(|_| "[]".to_string()), element_id],
            ).map_err(database_error)?;
        }
    }
    transaction.execute(
        "UPDATE scenario_elements SET linked_stem_id = NULL, linked_timeline_id = NULL WHERE linked_stem_id = ?1",
        [stem_id],
    ).map_err(database_error)?;
    Ok(())
}

fn get_by_id(connection: &rusqlite::Connection, stem_id: i64) -> Result<TimelineStem, String> {
    connection.query_row(
        "SELECT id, name, color FROM stems WHERE id = ?1",
        [stem_id],
        |row| Ok(TimelineStem { id: row.get(0)?, name: row.get(1)?, color: row.get(2)? }),
    ).optional().map_err(database_error)?.ok_or_else(|| "Stem não encontrado.".to_string())
}

fn validate(input: &StemInput) -> Result<(), String> {
    if input.name.trim().is_empty() || input.color.trim().is_empty() {
        return Err("O stem precisa de nome e cor.".to_string());
    }
    Ok(())
}

fn database_error(error: rusqlite::Error) -> String {
    format!("Erro no banco de dados: {error}")
}
