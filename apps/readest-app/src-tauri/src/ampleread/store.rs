#![allow(dead_code)]

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use ampleread_types::{ChangeOp, Shelf, WorkCard, WorkDetail};
use rusqlite::{params, Connection, OptionalExtension};

pub const SCHEMA_VERSION: i32 = 1;

pub struct Store {
    conn: Connection,
}

#[derive(Debug, Clone)]
pub struct StoredWorkDetail {
    pub detail: WorkDetail,
    pub etag: String,
    pub fetched_at: i64,
    pub stale: bool,
}

#[derive(Debug, Clone)]
pub struct SyncState {
    pub etag: Option<String>,
    pub fetched_at: i64,
    pub ttl_s: i64,
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

impl Store {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        Self::open_with_version(path, SCHEMA_VERSION)
    }

    pub fn open_in_memory() -> rusqlite::Result<Self> {
        let conn = Connection::open_in_memory()?;
        let mut store = Self { conn };
        store.ensure_schema(SCHEMA_VERSION)?;
        Ok(store)
    }

    pub fn open_with_version(path: &Path, version: i32) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        let mut store = Self { conn };
        store.ensure_schema(version)?;
        Ok(store)
    }

    fn ensure_schema(&mut self, version: i32) -> rusqlite::Result<()> {
        if !self.schema_version_matches(version)? {
            self.drop_all_tables()?;
            self.create_tables()?;
            self.set_meta("schema_version", &version.to_string())?;
        }
        Ok(())
    }

    fn schema_version_matches(&self, version: i32) -> rusqlite::Result<bool> {
        let table_exists: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'meta'",
            [],
            |row| row.get(0),
        )?;
        if table_exists == 0 {
            return Ok(false);
        }
        let current: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM meta WHERE key = 'schema_version'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        Ok(current.as_deref() == Some(version.to_string().as_str()))
    }

    fn drop_all_tables(&self) -> rusqlite::Result<()> {
        self.conn.execute_batch(
            "DROP TABLE IF EXISTS meta;
             DROP TABLE IF EXISTS sync_state;
             DROP TABLE IF EXISTS shelves;
             DROP TABLE IF EXISTS shelf_items;
             DROP TABLE IF EXISTS works;
             DROP TABLE IF EXISTS work_details;
             DROP TABLE IF EXISTS covers;
             DROP TABLE IF EXISTS pending_events;
             DROP TABLE IF EXISTS search_fts;",
        )
    }

    fn create_tables(&self) -> rusqlite::Result<()> {
        self.conn.execute_batch(
            "CREATE TABLE meta (
                key TEXT PRIMARY KEY,
                value TEXT
             );
             CREATE TABLE sync_state (
                scope TEXT PRIMARY KEY,
                etag TEXT,
                fetched_at INTEGER,
                ttl_s INTEGER
             );
             CREATE TABLE shelves (
                id TEXT PRIMARY KEY,
                title TEXT,
                layout TEXT,
                position INTEGER
             );
             CREATE TABLE shelf_items (
                shelf_id TEXT,
                work_id TEXT,
                position INTEGER,
                PRIMARY KEY (shelf_id, work_id)
             );
             CREATE TABLE works (
                id TEXT PRIMARY KEY,
                card_json TEXT,
                updated_at INTEGER
             );
             CREATE TABLE work_details (
                id TEXT PRIMARY KEY,
                detail_json TEXT,
                etag TEXT,
                fetched_at INTEGER,
                stale INTEGER
             );
             CREATE TABLE covers (
                work_id TEXT,
                size TEXT,
                file_path TEXT,
                bytes INTEGER,
                last_used_at INTEGER,
                PRIMARY KEY (work_id, size)
             );
             CREATE TABLE pending_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                payload_json TEXT,
                created_at INTEGER
             );
             CREATE VIRTUAL TABLE search_fts USING fts5(
                title,
                authors,
                subjects,
                work_id UNINDEXED
             );",
        )
    }

    pub fn set_meta(&self, key: &str, value: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO meta (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn delete_meta(&self, key: &str) -> rusqlite::Result<()> {
        self.conn
            .execute("DELETE FROM meta WHERE key = ?1", params![key])?;
        Ok(())
    }

    /// Empties every catalog table and the per-scope sync state. Meta,
    /// covers on disk, and queued events are the caller's business.
    pub fn clear_catalog(&mut self) -> rusqlite::Result<()> {
        self.conn.execute_batch(
            "DELETE FROM shelf_items;
             DELETE FROM shelves;
             DELETE FROM works;
             DELETE FROM work_details;
             DELETE FROM covers;
             DELETE FROM search_fts;
             DELETE FROM sync_state;",
        )
    }

    pub fn clear_pending_events(&mut self) -> rusqlite::Result<()> {
        self.conn.execute_batch("DELETE FROM pending_events;")
    }

    pub fn get_meta(&self, key: &str) -> rusqlite::Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT value FROM meta WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()
    }

    pub fn replace_shelves(&mut self, shelves: &[Shelf]) -> rusqlite::Result<()> {
        let tx = self.conn.transaction()?;
        tx.execute("DELETE FROM shelf_items", [])?;
        tx.execute("DELETE FROM shelves", [])?;
        for (shelf_position, shelf) in shelves.iter().enumerate() {
            tx.execute(
                "INSERT INTO shelves (id, title, layout, position) VALUES (?1, ?2, ?3, ?4)",
                params![shelf.id, shelf.title, shelf.layout, shelf_position as i64],
            )?;

            for (item_position, item) in shelf.items.iter().enumerate() {
                let card_json = serde_json::to_string(item)
                    .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

                tx.execute(
                    "INSERT INTO works (id, card_json, updated_at) VALUES (?1, ?2, ?3)
                     ON CONFLICT(id) DO UPDATE SET
                        card_json = excluded.card_json,
                        updated_at = excluded.updated_at",
                    params![item.id, card_json, now_secs()],
                )?;

                tx.execute(
                    "INSERT INTO shelf_items (shelf_id, work_id, position) VALUES (?1, ?2, ?3)",
                    params![shelf.id, item.id, item_position as i64],
                )?;

                let authors = item
                    .authors
                    .iter()
                    .map(|a| a.name.as_str())
                    .collect::<Vec<_>>()
                    .join(", ");

                tx.execute(
                    "DELETE FROM search_fts WHERE work_id = ?1",
                    params![item.id],
                )?;
                tx.execute(
                    "INSERT INTO search_fts (title, authors, subjects, work_id) VALUES (?1, ?2, ?3, ?4)",
                    params![item.title, authors, "", item.id],
                )?;
            }
        }
        tx.commit()
    }

    pub fn get_explore(&self) -> rusqlite::Result<Vec<Shelf>> {
        let mut shelf_stmt = self
            .conn
            .prepare("SELECT id, title, layout FROM shelves ORDER BY position ASC")?;
        let shelf_rows = shelf_stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?;

        let mut item_stmt = self.conn.prepare(
            "SELECT works.card_json FROM shelf_items
             JOIN works ON works.id = shelf_items.work_id
             WHERE shelf_items.shelf_id = ?1
             ORDER BY shelf_items.position ASC",
        )?;

        let mut shelves = Vec::new();
        for shelf_row in shelf_rows {
            let (id, title, layout) = shelf_row?;
            let card_jsons = item_stmt
                .query_map(params![id], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            let items = card_jsons
                .into_iter()
                .map(|json| {
                    serde_json::from_str::<WorkCard>(&json)
                        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))
                })
                .collect::<Result<Vec<_>, _>>()?;

            shelves.push(Shelf {
                id,
                title,
                layout,
                items,
                more: None,
            });
        }
        Ok(shelves)
    }

    pub fn upsert_work_detail(
        &mut self,
        id: &str,
        detail: &WorkDetail,
        etag: &str,
    ) -> rusqlite::Result<()> {
        let detail_json = serde_json::to_string(detail)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        let (fts_title, fts_authors) = self.fts_title_and_authors_for(id, detail)?;
        let fts_subjects = detail.subjects.join(", ");

        let tx = self.conn.transaction()?;
        tx.execute(
            "INSERT INTO work_details (id, detail_json, etag, fetched_at, stale)
             VALUES (?1, ?2, ?3, ?4, 0)
             ON CONFLICT(id) DO UPDATE SET
                detail_json = excluded.detail_json,
                etag = excluded.etag,
                fetched_at = excluded.fetched_at,
                stale = 0",
            params![id, detail_json, etag, now_secs()],
        )?;
        tx.execute("DELETE FROM search_fts WHERE work_id = ?1", params![id])?;
        tx.execute(
            "INSERT INTO search_fts (title, authors, subjects, work_id) VALUES (?1, ?2, ?3, ?4)",
            params![fts_title, fts_authors, fts_subjects, id],
        )?;
        tx.commit()
    }

    fn fts_title_and_authors_for(
        &self,
        id: &str,
        detail: &WorkDetail,
    ) -> rusqlite::Result<(String, String)> {
        let card_json: Option<String> = self
            .conn
            .query_row(
                "SELECT card_json FROM works WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .optional()?;

        let card = card_json.and_then(|json| serde_json::from_str::<WorkCard>(&json).ok());
        match card {
            Some(card) => {
                let authors = card
                    .authors
                    .iter()
                    .map(|a| a.name.as_str())
                    .collect::<Vec<_>>()
                    .join(", ");
                Ok((card.title, authors))
            }
            None => Ok((detail.title.clone(), String::new())),
        }
    }

    pub fn get_work_detail(&self, id: &str) -> rusqlite::Result<Option<StoredWorkDetail>> {
        self.conn
            .query_row(
                "SELECT detail_json, etag, fetched_at, stale FROM work_details WHERE id = ?1",
                params![id],
                |row| {
                    let detail_json: String = row.get(0)?;
                    let etag: String = row.get(1)?;
                    let fetched_at: i64 = row.get(2)?;
                    let stale: i64 = row.get(3)?;
                    Ok((detail_json, etag, fetched_at, stale))
                },
            )
            .optional()?
            .map(|(detail_json, etag, fetched_at, stale)| {
                let detail = serde_json::from_str::<WorkDetail>(&detail_json)
                    .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
                Ok(StoredWorkDetail {
                    detail,
                    etag,
                    fetched_at,
                    stale: stale != 0,
                })
            })
            .transpose()
    }

    pub fn get_sync_state(&self, scope: &str) -> rusqlite::Result<Option<SyncState>> {
        self.conn
            .query_row(
                "SELECT etag, fetched_at, ttl_s FROM sync_state WHERE scope = ?1",
                params![scope],
                |row| {
                    Ok(SyncState {
                        etag: row.get(0)?,
                        fetched_at: row.get(1)?,
                        ttl_s: row.get(2)?,
                    })
                },
            )
            .optional()
    }

    pub fn set_sync_state(
        &self,
        scope: &str,
        etag: Option<&str>,
        fetched_at: i64,
        ttl_s: i64,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO sync_state (scope, etag, fetched_at, ttl_s) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(scope) DO UPDATE SET
                etag = excluded.etag,
                fetched_at = excluded.fetched_at,
                ttl_s = excluded.ttl_s",
            params![scope, etag, fetched_at, ttl_s],
        )?;
        Ok(())
    }

    pub fn enqueue_event(&self, payload_json: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO pending_events (payload_json, created_at) VALUES (?1, ?2)",
            params![payload_json, now_secs()],
        )?;
        Ok(())
    }

    pub fn pending_events(&self, limit: usize) -> rusqlite::Result<Vec<(i64, String)>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, payload_json FROM pending_events ORDER BY id ASC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit as i64], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?;
        rows.collect()
    }

    pub fn pending_event_count(&self) -> rusqlite::Result<i64> {
        self.conn
            .query_row("SELECT COUNT(*) FROM pending_events", [], |row| row.get(0))
    }

    pub fn delete_events(&mut self, ids: &[i64]) -> rusqlite::Result<()> {
        let tx = self.conn.transaction()?;
        for id in ids {
            tx.execute("DELETE FROM pending_events WHERE id = ?1", params![id])?;
        }
        tx.commit()
    }

    pub fn work_detail_ids(&self) -> rusqlite::Result<Vec<String>> {
        let mut stmt = self.conn.prepare("SELECT id FROM work_details")?;
        let ids = stmt.query_map([], |row| row.get::<_, String>(0))?;
        ids.collect()
    }

    /// Applies incremental change ops from `/v1/changes`. The backend's
    /// vocabulary is `entity_type` in `work | edition | asset | collection`
    /// (a `collection` id is prefixed `col_` — it is not the same thing as
    /// this store's internal `"shelf"` rows) and `op` in
    /// `upsert | hide | remove`. This store only has a local row to delete
    /// for `work` and (its own internal grouping) `shelf`; there is nothing
    /// to individually delete here for `edition`/`asset`/`collection`, and
    /// `upsert` never reaches this function at all (an upsert is served by
    /// re-fetching the entity, not by a local delete). `collection` ops in
    /// particular don't need special handling here because the sync layer's
    /// changed-version cascade (see `sync.rs::apply_remote_changes`) always
    /// fully revalidates the explore mirror after applying changes, which is
    /// where collection membership actually lives — so a hidden/removed
    /// collection's effect surfaces there, not through a row deleted by this
    /// function. Anything else is logged rather than silently dropped, so an
    /// entity type or op this store doesn't yet special-case is still
    /// visible in the logs instead of vanishing unnoticed.
    pub fn apply_changes(&mut self, ops: &[ChangeOp]) -> rusqlite::Result<()> {
        let tx = self.conn.transaction()?;
        for op in ops {
            match op.op.as_str() {
                "remove" | "hide" => match op.entity_type.as_str() {
                    "work" => {
                        tx.execute("DELETE FROM works WHERE id = ?1", params![op.entity_id])?;
                        tx.execute(
                            "DELETE FROM shelf_items WHERE work_id = ?1",
                            params![op.entity_id],
                        )?;
                        tx.execute(
                            "DELETE FROM work_details WHERE id = ?1",
                            params![op.entity_id],
                        )?;
                        tx.execute(
                            "DELETE FROM covers WHERE work_id = ?1",
                            params![op.entity_id],
                        )?;
                        tx.execute(
                            "DELETE FROM search_fts WHERE work_id = ?1",
                            params![op.entity_id],
                        )?;
                    }
                    "shelf" => {
                        tx.execute("DELETE FROM shelves WHERE id = ?1", params![op.entity_id])?;
                        tx.execute(
                            "DELETE FROM shelf_items WHERE shelf_id = ?1",
                            params![op.entity_id],
                        )?;
                    }
                    other => {
                        log::debug!(
                            "ampleread: apply_changes: no local row to {} for entity_type {:?} (id {:?}); relying on the sync cascade's explore revalidation",
                            op.op,
                            other,
                            op.entity_id
                        );
                    }
                },
                other => {
                    log::debug!(
                        "ampleread: apply_changes: unrecognized op {:?} for entity_type {:?} (id {:?}); ignoring",
                        other,
                        op.entity_type,
                        op.entity_id
                    );
                }
            }
        }
        tx.commit()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ampleread_types::{AuthorRef, Capabilities, EditionView};
    use std::path::PathBuf;

    #[test]
    fn fts5_is_compiled_in() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE VIRTUAL TABLE t USING fts5(x)")
            .unwrap();
    }

    fn temp_db_path(label: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        path.push(format!("ampleread_store_test_{label}_{nanos}.sqlite"));
        path
    }

    fn sample_card(id: &str, title: &str) -> WorkCard {
        WorkCard {
            id: id.to_string(),
            title: title.to_string(),
            authors: vec![AuthorRef {
                id: format!("{id}-author"),
                name: "Jane Doe".to_string(),
            }],
            cover: Some("https://example.com/cover.jpg".to_string()),
            language: Some("en".to_string()),
            has_audio: false,
            formats: vec!["epub".to_string()],
        }
    }

    fn sample_shelf(id: &str, title: &str, cards: Vec<WorkCard>) -> Shelf {
        Shelf {
            id: id.to_string(),
            title: title.to_string(),
            layout: "grid".to_string(),
            items: cards,
            more: None,
        }
    }

    #[test]
    fn set_and_get_meta_round_trip() {
        let store = Store::open_in_memory().unwrap();
        assert_eq!(store.get_meta("foo").unwrap(), None);
        store.set_meta("foo", "bar").unwrap();
        assert_eq!(store.get_meta("foo").unwrap(), Some("bar".to_string()));
        store.set_meta("foo", "baz").unwrap();
        assert_eq!(store.get_meta("foo").unwrap(), Some("baz".to_string()));
    }

    #[test]
    fn replace_shelves_and_get_explore_preserves_order_and_fields() {
        let mut store = Store::open_in_memory().unwrap();
        let shelf_a = sample_shelf(
            "shelf-a",
            "Shelf A",
            vec![
                sample_card("work-1", "Book One"),
                sample_card("work-2", "Book Two"),
            ],
        );
        let shelf_b = sample_shelf(
            "shelf-b",
            "Shelf B",
            vec![sample_card("work-3", "Book Three")],
        );

        store
            .replace_shelves(&[shelf_a.clone(), shelf_b.clone()])
            .unwrap();

        let explore = store.get_explore().unwrap();
        assert_eq!(explore.len(), 2);
        assert_eq!(explore[0].id, "shelf-a");
        assert_eq!(explore[1].id, "shelf-b");

        assert_eq!(explore[0].items.len(), 2);
        assert_eq!(explore[0].items[0].id, "work-1");
        assert_eq!(explore[0].items[1].id, "work-2");
        assert_eq!(explore[0].items[0], shelf_a.items[0]);

        assert_eq!(explore[1].items.len(), 1);
        assert_eq!(explore[1].items[0].id, "work-3");
    }

    #[test]
    fn upsert_work_detail_and_get_round_trip() {
        let mut store = Store::open_in_memory().unwrap();
        let detail = WorkDetail {
            id: "work-1".to_string(),
            title: "Book One".to_string(),
            description: Some("A great book".to_string()),
            subjects: vec!["fiction".to_string()],
            preferred_edition_id: Some("edition-1".to_string()),
            editions: vec![],
        };

        assert!(store.get_work_detail("work-1").unwrap().is_none());

        store
            .upsert_work_detail("work-1", &detail, "etag-1")
            .unwrap();
        let stored = store.get_work_detail("work-1").unwrap().unwrap();
        assert_eq!(stored.detail.id, "work-1");
        assert_eq!(stored.detail.title, "Book One");
        assert_eq!(stored.etag, "etag-1");
        assert!(!stored.stale);

        store
            .upsert_work_detail("work-1", &detail, "etag-2")
            .unwrap();
        let stored = store.get_work_detail("work-1").unwrap().unwrap();
        assert_eq!(stored.etag, "etag-2");
    }

    #[test]
    fn upsert_work_detail_round_trips_an_edition_with_no_assets() {
        let mut store = Store::open_in_memory().unwrap();
        let detail = WorkDetail {
            id: "work-1".to_string(),
            title: "Book One".to_string(),
            description: None,
            subjects: vec![],
            preferred_edition_id: Some("edition-audio".to_string()),
            editions: vec![EditionView {
                id: "edition-audio".to_string(),
                source_name: "gutenberg".to_string(),
                language: "en".to_string(),
                media_type: "audio".to_string(),
                assets: vec![],
                capabilities: Capabilities {
                    can_read: false,
                    can_download: false,
                    can_transform: false,
                },
                attribution: None,
            }],
        };

        store
            .upsert_work_detail("work-1", &detail, "etag-1")
            .unwrap();

        let stored = store.get_work_detail("work-1").unwrap().unwrap();
        assert_eq!(stored.detail.editions.len(), 1);
        assert!(stored.detail.editions[0].assets.is_empty());
        assert_eq!(stored.detail.editions[0].media_type, "audio");
        assert_eq!(
            stored.detail.preferred_edition_id.as_deref(),
            Some("edition-audio")
        );
    }

    #[test]
    fn apply_changes_removes_work_everywhere() {
        let mut store = Store::open_in_memory().unwrap();
        let shelf = sample_shelf(
            "shelf-a",
            "Shelf A",
            vec![sample_card("work-1", "Book One")],
        );
        store.replace_shelves(&[shelf]).unwrap();

        let detail = WorkDetail {
            id: "work-1".to_string(),
            title: "Book One".to_string(),
            description: None,
            subjects: vec![],
            preferred_edition_id: None,
            editions: vec![],
        };
        store
            .upsert_work_detail("work-1", &detail, "etag-1")
            .unwrap();

        let fts_count_before: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM search_fts WHERE work_id = 'work-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(fts_count_before, 1);

        store
            .apply_changes(&[ChangeOp {
                entity_type: "work".to_string(),
                entity_id: "work-1".to_string(),
                op: "remove".to_string(),
            }])
            .unwrap();

        let explore = store.get_explore().unwrap();
        assert_eq!(explore[0].items.len(), 0);
        assert!(store.get_work_detail("work-1").unwrap().is_none());

        let fts_count_after: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM search_fts WHERE work_id = 'work-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(fts_count_after, 0);

        let works_count: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM works WHERE id = 'work-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(works_count, 0);
    }

    #[test]
    fn upsert_work_detail_indexes_subjects_for_fts_search() {
        let mut store = Store::open_in_memory().unwrap();
        let shelf = sample_shelf(
            "shelf-a",
            "Shelf A",
            vec![sample_card("work-1", "Book One")],
        );
        store.replace_shelves(&[shelf]).unwrap();

        let subject_hits_before: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM search_fts WHERE search_fts MATCH 'astrophysics'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(subject_hits_before, 0);

        let detail = WorkDetail {
            id: "work-1".to_string(),
            title: "Book One".to_string(),
            description: None,
            subjects: vec!["astrophysics".to_string(), "memoir".to_string()],
            preferred_edition_id: None,
            editions: vec![],
        };
        store
            .upsert_work_detail("work-1", &detail, "etag-1")
            .unwrap();

        let matched_work_id: String = store
            .conn
            .query_row(
                "SELECT work_id FROM search_fts WHERE search_fts MATCH 'astrophysics'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(matched_work_id, "work-1");

        let indexed_title_authors: (String, String) = store
            .conn
            .query_row(
                "SELECT title, authors FROM search_fts WHERE work_id = 'work-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(indexed_title_authors.0, "Book One");
        assert_eq!(indexed_title_authors.1, "Jane Doe");
    }

    #[test]
    fn apply_changes_removes_shelf_and_its_items_only() {
        let mut store = Store::open_in_memory().unwrap();
        let shelf_a = sample_shelf(
            "shelf-a",
            "Shelf A",
            vec![sample_card("work-1", "Book One")],
        );
        let shelf_b = sample_shelf(
            "shelf-b",
            "Shelf B",
            vec![sample_card("work-2", "Book Two")],
        );
        store
            .replace_shelves(&[shelf_a.clone(), shelf_b.clone()])
            .unwrap();

        store
            .apply_changes(&[ChangeOp {
                entity_type: "shelf".to_string(),
                entity_id: "shelf-a".to_string(),
                op: "remove".to_string(),
            }])
            .unwrap();

        let explore = store.get_explore().unwrap();
        assert_eq!(explore.len(), 1);
        assert_eq!(explore[0].id, "shelf-b");
        assert_eq!(explore[0].items.len(), 1);
        assert_eq!(explore[0].items[0].id, "work-2");

        let shelf_items_count: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM shelf_items WHERE shelf_id = 'shelf-a'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(shelf_items_count, 0);
    }

    #[test]
    fn apply_changes_logs_and_ignores_entity_types_and_ops_with_no_local_row() {
        let mut store = Store::open_in_memory().unwrap();
        let shelf = sample_shelf(
            "shelf-a",
            "Shelf A",
            vec![sample_card("work-1", "Book One")],
        );
        store.replace_shelves(&[shelf]).unwrap();

        // "collection" (col_-prefixed ids, not a shelf slug), "edition", and
        // "asset" are real backend entity_types this store has no local row
        // to delete for; "upsert" is a real op this function never deletes
        // for. None of these should error or panic — they should just be
        // logged and skipped, leaving existing data untouched.
        store
            .apply_changes(&[
                ChangeOp {
                    entity_type: "collection".to_string(),
                    entity_id: "col_1".to_string(),
                    op: "remove".to_string(),
                },
                ChangeOp {
                    entity_type: "edition".to_string(),
                    entity_id: "ed_1".to_string(),
                    op: "hide".to_string(),
                },
                ChangeOp {
                    entity_type: "asset".to_string(),
                    entity_id: "as_1".to_string(),
                    op: "remove".to_string(),
                },
                ChangeOp {
                    entity_type: "work".to_string(),
                    entity_id: "work-1".to_string(),
                    op: "upsert".to_string(),
                },
            ])
            .expect("unrecognized entity_type/op combinations must not error");

        let explore = store.get_explore().unwrap();
        assert_eq!(explore.len(), 1);
        assert_eq!(explore[0].items.len(), 1);
        assert_eq!(explore[0].items[0].id, "work-1");
    }

    #[test]
    fn sync_state_round_trip_and_upsert() {
        let store = Store::open_in_memory().unwrap();
        assert!(store.get_sync_state("explore").unwrap().is_none());

        store
            .set_sync_state("explore", Some("etag-1"), 100, 300)
            .unwrap();
        let state = store.get_sync_state("explore").unwrap().unwrap();
        assert_eq!(state.etag.as_deref(), Some("etag-1"));
        assert_eq!(state.fetched_at, 100);
        assert_eq!(state.ttl_s, 300);

        store
            .set_sync_state("explore", Some("etag-2"), 200, 300)
            .unwrap();
        let state = store.get_sync_state("explore").unwrap().unwrap();
        assert_eq!(state.etag.as_deref(), Some("etag-2"));
        assert_eq!(state.fetched_at, 200);
    }

    #[test]
    fn work_detail_ids_lists_all_stored_details() {
        let mut store = Store::open_in_memory().unwrap();
        assert!(store.work_detail_ids().unwrap().is_empty());

        let detail = WorkDetail {
            id: "work-1".to_string(),
            title: "Book One".to_string(),
            description: None,
            subjects: vec![],
            preferred_edition_id: None,
            editions: vec![],
        };
        store
            .upsert_work_detail("work-1", &detail, "etag-1")
            .unwrap();

        assert_eq!(store.work_detail_ids().unwrap(), vec!["work-1".to_string()]);
    }

    #[test]
    fn schema_version_mismatch_drops_and_rebuilds() {
        let path = temp_db_path("schema_mismatch");

        {
            let store = Store::open_with_version(&path, 1).unwrap();
            store.set_meta("junk", "should-not-survive").unwrap();
            assert_eq!(
                store.get_meta("junk").unwrap(),
                Some("should-not-survive".to_string())
            );
        }

        {
            let store = Store::open_with_version(&path, 2).unwrap();
            assert_eq!(store.get_meta("junk").unwrap(), None);
            assert_eq!(
                store.get_meta("schema_version").unwrap(),
                Some("2".to_string())
            );
        }

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn reopen_with_same_version_preserves_data() {
        let path = temp_db_path("schema_same_version");

        {
            let store = Store::open_with_version(&path, 1).unwrap();
            store.set_meta("kept", "value").unwrap();
        }

        {
            let store = Store::open_with_version(&path, 1).unwrap();
            assert_eq!(store.get_meta("kept").unwrap(), Some("value".to_string()));
        }

        let _ = std::fs::remove_file(&path);
    }
}
