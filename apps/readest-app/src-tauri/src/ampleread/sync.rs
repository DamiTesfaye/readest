#![allow(async_fn_in_trait)]

use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use ampleread_types::{BootstrapResponse, ChangesResponse, ExploreResponse, Shelf, WorkDetail};

use super::store::Store;

const DEFAULT_API_BASE: &str = "https://api.ampleread.com";
const SCOPE_BOOTSTRAP: &str = "bootstrap";
const SCOPE_EXPLORE: &str = "explore";
const SCOPE_CHANGES: &str = "changes";
const META_BOOTSTRAP_LAST_AT: &str = "bootstrap_last_at";
const META_BOOTSTRAP_TTL_S: &str = "bootstrap_ttl_s";
const META_BOOTSTRAP_JITTER_S: &str = "bootstrap_jitter_s";
const META_CATALOG_VERSION: &str = "catalog_version";
const META_CHANGE_CURSOR: &str = "change_cursor";
const META_TERRITORY: &str = "territory";

/// Base URL for the AmpleRead catalog API. Overridable via the
/// `AMPLEREAD_API_BASE` environment variable for staging/dev backends.
pub fn api_base() -> String {
    std::env::var("AMPLEREAD_API_BASE").unwrap_or_else(|_| DEFAULT_API_BASE.to_string())
}

#[derive(Debug, thiserror::Error)]
pub enum SyncError {
    #[error("http error: {0}")]
    Http(String),
    #[error("store error: {0}")]
    Store(#[from] rusqlite::Error),
}

#[derive(Debug, Clone)]
pub enum FetchResult<T> {
    Fresh { body: T, etag: Option<String> },
    NotModified,
}

pub trait CatalogHttp {
    async fn get_bootstrap(&self) -> Result<BootstrapResponse, SyncError>;
    async fn get_explore(
        &self,
        etag: Option<&str>,
    ) -> Result<FetchResult<ExploreResponse>, SyncError>;
    async fn get_work_detail(
        &self,
        id: &str,
        etag: Option<&str>,
        territory: Option<&str>,
    ) -> Result<FetchResult<WorkDetail>, SyncError>;
    async fn get_changes(&self, since: i64) -> Result<ChangesResponse, SyncError>;
}

pub struct ReqwestCatalogHttp {
    client: reqwest::Client,
    base_url: String,
}

impl ReqwestCatalogHttp {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            client: reqwest::Client::new(),
            base_url: base_url.into(),
        }
    }

    async fn get_conditional<T: serde::de::DeserializeOwned>(
        &self,
        path: &str,
        etag: Option<&str>,
    ) -> Result<FetchResult<T>, SyncError> {
        let url = format!("{}{}", self.base_url, path);
        let mut request = self.client.get(url);
        if let Some(etag) = etag {
            request = request.header(reqwest::header::IF_NONE_MATCH, etag);
        }

        let response = request
            .send()
            .await
            .map_err(|e| SyncError::Http(e.to_string()))?;

        if response.status() == reqwest::StatusCode::NOT_MODIFIED {
            return Ok(FetchResult::NotModified);
        }

        let response = response
            .error_for_status()
            .map_err(|e| SyncError::Http(e.to_string()))?;
        let etag = response
            .headers()
            .get(reqwest::header::ETAG)
            .and_then(|value| value.to_str().ok())
            .map(|value| value.to_string());
        let body = response
            .json::<T>()
            .await
            .map_err(|e| SyncError::Http(e.to_string()))?;

        Ok(FetchResult::Fresh { body, etag })
    }
}

impl CatalogHttp for ReqwestCatalogHttp {
    async fn get_bootstrap(&self) -> Result<BootstrapResponse, SyncError> {
        let url = format!("{}/v1/bootstrap", self.base_url);
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| SyncError::Http(e.to_string()))?
            .error_for_status()
            .map_err(|e| SyncError::Http(e.to_string()))?;
        response
            .json::<BootstrapResponse>()
            .await
            .map_err(|e| SyncError::Http(e.to_string()))
    }

    async fn get_explore(
        &self,
        etag: Option<&str>,
    ) -> Result<FetchResult<ExploreResponse>, SyncError> {
        self.get_conditional("/v1/explore", etag).await
    }

    async fn get_work_detail(
        &self,
        id: &str,
        etag: Option<&str>,
        territory: Option<&str>,
    ) -> Result<FetchResult<WorkDetail>, SyncError> {
        // Only works/editions vary by territory (`?t=`); explore does not,
        // so this is the only request that needs it threaded through.
        let path = match territory {
            Some(t) => format!("/v1/works/{id}?t={t}"),
            None => format!("/v1/works/{id}"),
        };
        self.get_conditional(&path, etag).await
    }

    async fn get_changes(&self, since: i64) -> Result<ChangesResponse, SyncError> {
        let url = format!("{}/v1/changes?since={since}", self.base_url);
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| SyncError::Http(e.to_string()))?
            .error_for_status()
            .map_err(|e| SyncError::Http(e.to_string()))?;
        response
            .json::<ChangesResponse>()
            .await
            .map_err(|e| SyncError::Http(e.to_string()))
    }
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Deterministic pseudo-jitter derived from the last bootstrap timestamp, so
/// that many devices sharing the same TTL don't all re-bootstrap in the same
/// instant. Not cryptographic; just spreads retries across the jitter window.
fn jitter_for(seed: i64, jitter_s: i64) -> i64 {
    if jitter_s <= 0 {
        return 0;
    }
    (seed.unsigned_abs() % jitter_s as u64) as i64
}

fn work_scope(id: &str) -> String {
    format!("work:{id}")
}

enum BootstrapOutcome {
    NotDue,
    Unchanged,
    /// Carries the new `catalogVersion` rather than persisting it
    /// immediately — the caller (`sync`) only writes it to `META_CATALOG_VERSION`
    /// after `apply_remote_changes` (and its revalidations) has actually
    /// succeeded, so a mid-cascade failure leaves the old version in place
    /// for the next sync to retry against, instead of stranding stale
    /// scopes under a version that claims they're already current.
    Changed { new_version: i64 },
}

struct InFlightGuard<'a> {
    set: &'a Mutex<HashSet<String>>,
    key: String,
}

impl Drop for InFlightGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut set) = self.set.lock() {
            set.remove(&self.key);
        }
    }
}

/// Version-gated sync engine. See spec §14.2: renders from the local mirror
/// first, only calls the network when a screen explicitly asks to `refresh`,
/// and gates all further requests behind whether `catalogVersion` changed.
pub struct SyncEngine<H: CatalogHttp> {
    http: H,
    store: Mutex<Store>,
    in_flight: Mutex<HashSet<String>>,
}

impl<H: CatalogHttp> SyncEngine<H> {
    pub fn new(http: H, store: Store) -> Self {
        Self {
            http,
            store: Mutex::new(store),
            in_flight: Mutex::new(HashSet::new()),
        }
    }

    /// Single-flight guard for a resource key. Returns `None` when a fetch
    /// for that key is already in progress, in which case the caller should
    /// no-op rather than issue a duplicate request.
    fn try_acquire(&self, key: &str) -> Option<InFlightGuard<'_>> {
        let mut set = self.in_flight.lock().unwrap();
        if set.contains(key) {
            None
        } else {
            set.insert(key.to_string());
            Some(InFlightGuard {
                set: &self.in_flight,
                key: key.to_string(),
            })
        }
    }

    fn meta_get_i64(&self, key: &str) -> Result<Option<i64>, SyncError> {
        let store = self.store.lock().unwrap();
        Ok(store.get_meta(key)?.and_then(|value| value.parse().ok()))
    }

    fn meta_set_i64(&self, key: &str, value: i64) -> Result<(), SyncError> {
        let store = self.store.lock().unwrap();
        Ok(store.set_meta(key, &value.to_string())?)
    }

    /// The territory tag from the most recent bootstrap response, if any has
    /// run yet. Threaded into work-detail requests as `?t=` so per-edition
    /// capabilities reflect the caller's actual territory.
    fn territory(&self) -> Result<Option<String>, SyncError> {
        let store = self.store.lock().unwrap();
        Ok(store.get_meta(META_TERRITORY)?)
    }

    /// Render-from-mirror: commands read this without ever touching the
    /// network. Opening a screen never triggers a request by itself.
    pub fn get_explore(&self) -> Result<Vec<Shelf>, SyncError> {
        Ok(self.store.lock().unwrap().get_explore()?)
    }

    /// Render-from-mirror for a single work.
    pub fn get_work_detail(&self, id: &str) -> Result<Option<WorkDetail>, SyncError> {
        let store = self.store.lock().unwrap();
        Ok(store.get_work_detail(id)?.map(|stored| stored.detail))
    }

    /// Bootstrap is only due once the TTL from the previous bootstrap
    /// response (plus a deterministic jitter) has elapsed. A never-bootstrapped
    /// store is always due.
    fn bootstrap_due(&self) -> Result<bool, SyncError> {
        let Some(last_at) = self.meta_get_i64(META_BOOTSTRAP_LAST_AT)? else {
            return Ok(true);
        };
        let ttl_s = self.meta_get_i64(META_BOOTSTRAP_TTL_S)?.unwrap_or(0);
        let jitter_s = self.meta_get_i64(META_BOOTSTRAP_JITTER_S)?.unwrap_or(0);
        let jitter = jitter_for(last_at, jitter_s);
        Ok(now_secs() >= last_at + ttl_s + jitter)
    }

    async fn maybe_bootstrap(&self) -> Result<BootstrapOutcome, SyncError> {
        if !self.bootstrap_due()? {
            return Ok(BootstrapOutcome::NotDue);
        }
        let Some(_guard) = self.try_acquire(SCOPE_BOOTSTRAP) else {
            return Ok(BootstrapOutcome::NotDue);
        };

        let response = self.http.get_bootstrap().await?;

        self.meta_set_i64(META_BOOTSTRAP_LAST_AT, now_secs())?;
        self.meta_set_i64(META_BOOTSTRAP_TTL_S, response.ttl.bootstrap_s as i64)?;
        self.meta_set_i64(META_BOOTSTRAP_JITTER_S, response.refresh.jitter_s as i64)?;
        // Threaded into every subsequent work-detail request's `?t=` query
        // parameter (see `territory`), so rights capabilities reflect the
        // caller's actual territory instead of the server's "row" default.
        {
            let store = self.store.lock().unwrap();
            store.set_meta(META_TERRITORY, &response.territory)?;
        }

        // NOTE: META_CATALOG_VERSION is deliberately NOT written here. It's
        // only persisted by `sync()` once `apply_remote_changes` (and its
        // revalidations) has actually succeeded for `response.catalog_version` —
        // see `BootstrapOutcome::Changed`.
        let previous_version = self.meta_get_i64(META_CATALOG_VERSION)?;

        Ok(match previous_version {
            Some(version) if version == response.catalog_version => BootstrapOutcome::Unchanged,
            _ => BootstrapOutcome::Changed {
                new_version: response.catalog_version,
            },
        })
    }

    /// Revalidates the explore mirror with `If-None-Match`. A 304 leaves the
    /// stored shelves and etag completely untouched.
    async fn revalidate_explore(&self) -> Result<(), SyncError> {
        let Some(_guard) = self.try_acquire(SCOPE_EXPLORE) else {
            return Ok(());
        };
        let etag = {
            let store = self.store.lock().unwrap();
            store.get_sync_state(SCOPE_EXPLORE)?.and_then(|s| s.etag)
        };

        match self.http.get_explore(etag.as_deref()).await? {
            FetchResult::Fresh { body, etag } => {
                let mut store = self.store.lock().unwrap();
                store.upsert_shelves(&body.shelves)?;
                store.set_sync_state(SCOPE_EXPLORE, etag.as_deref(), now_secs(), 0)?;
            }
            FetchResult::NotModified => {}
        }
        Ok(())
    }

    /// Revalidates a single held work-detail scope with `If-None-Match`. A
    /// 304 leaves the stored detail and etag completely untouched.
    async fn revalidate_work_detail(&self, id: &str) -> Result<(), SyncError> {
        let scope = work_scope(id);
        let Some(_guard) = self.try_acquire(&scope) else {
            return Ok(());
        };
        let etag = {
            let store = self.store.lock().unwrap();
            store.get_sync_state(&scope)?.and_then(|s| s.etag)
        };
        let territory = self.territory()?;

        match self
            .http
            .get_work_detail(id, etag.as_deref(), territory.as_deref())
            .await?
        {
            FetchResult::Fresh { body, etag } => {
                let mut store = self.store.lock().unwrap();
                store.upsert_work_detail(id, &body, etag.as_deref().unwrap_or_default())?;
                store.set_sync_state(&scope, etag.as_deref(), now_secs(), 0)?;
            }
            FetchResult::NotModified => {}
        }
        Ok(())
    }

    /// Full revalidation of every scope currently held in the mirror
    /// (explore + every cached work detail), each independently 304-aware.
    async fn revalidate_held_scopes(&self) -> Result<(), SyncError> {
        self.revalidate_explore().await?;
        let ids = {
            let store = self.store.lock().unwrap();
            store.work_detail_ids()?
        };
        for id in ids {
            self.revalidate_work_detail(&id).await?;
        }
        Ok(())
    }

    /// Runs when the bootstrap check reports a changed `catalogVersion`:
    /// fetch `/v1/changes?since=`, apply the ops (unless the server reports
    /// `compacted`, in which case incremental ops can't be trusted and held
    /// scopes get a full revalidation instead), then always revalidate held
    /// scopes so stale mirror entries pick up the new state.
    async fn apply_remote_changes(&self) -> Result<(), SyncError> {
        let Some(guard) = self.try_acquire(SCOPE_CHANGES) else {
            return Ok(());
        };
        let since = self.meta_get_i64(META_CHANGE_CURSOR)?.unwrap_or(0);
        let changes = self.http.get_changes(since).await?;
        drop(guard);

        if !changes.compacted {
            let mut store = self.store.lock().unwrap();
            store.apply_changes(&changes.ops)?;
        }

        self.revalidate_held_scopes().await?;
        self.meta_set_i64(META_CHANGE_CURSOR, changes.until)?;
        Ok(())
    }

    /// The version-gated sync loop: bootstrap (only when due), and only when
    /// the catalog version actually changed does it fetch changes and
    /// revalidate. An unchanged version issues zero further requests.
    pub async fn sync(&self) -> Result<(), SyncError> {
        match self.maybe_bootstrap().await? {
            BootstrapOutcome::NotDue | BootstrapOutcome::Unchanged => Ok(()),
            BootstrapOutcome::Changed { new_version } => {
                // Only commit the new catalog version once the cascade it
                // gates has actually finished successfully — a failure here
                // (the `?`) leaves META_CATALOG_VERSION at its old value, so
                // the next sync sees the version as still "changed" and
                // retries the whole cascade instead of stranding stale
                // scopes under a version that falsely claims they're current.
                self.apply_remote_changes().await?;
                self.meta_set_i64(META_CATALOG_VERSION, new_version)?;
                Ok(())
            }
        }
    }

    /// Performs a first-time GET for a work detail that isn't held in the
    /// mirror yet (no stored etag, since none exists) and upserts the
    /// result. Single-flight per work scope, same as revalidation.
    async fn fetch_work_detail_first_time(&self, id: &str) -> Result<(), SyncError> {
        let scope = work_scope(id);
        let Some(_guard) = self.try_acquire(&scope) else {
            return Ok(());
        };
        let territory = self.territory()?;

        match self
            .http
            .get_work_detail(id, None, territory.as_deref())
            .await?
        {
            FetchResult::Fresh { body, etag } => {
                let mut store = self.store.lock().unwrap();
                store.upsert_work_detail(id, &body, etag.as_deref().unwrap_or_default())?;
                store.set_sync_state(&scope, etag.as_deref(), now_secs(), 0)?;
            }
            FetchResult::NotModified => {}
        }
        Ok(())
    }

    fn is_work_detail_held(&self, id: &str) -> Result<bool, SyncError> {
        let store = self.store.lock().unwrap();
        Ok(store.get_work_detail(id)?.is_some())
    }

    /// Explicit, screen-triggered refresh. `scope` identifies the caller for
    /// future per-resource triggering; the version-gated sync loop itself
    /// stays version-gated regardless of which scope asked.
    ///
    /// Exception: a `work:{id}` scope for a work detail that has never been
    /// fetched is not a "revalidation" of something already held — it's the
    /// only way that detail can ever enter the mirror (revalidation only
    /// ever walks already-held scopes). "catalogVersion unchanged -> zero
    /// further requests" governs the version-gated cascade, not an explicit
    /// first fetch of a resource the mirror has never seen, so this path
    /// fetches unconditionally rather than delegating to `sync()`.
    pub async fn refresh(&self, scope: &str) -> Result<(), SyncError> {
        if let Some(id) = scope.strip_prefix("work:") {
            if !self.is_work_detail_held(id)? {
                return self.fetch_work_detail_first_time(id).await;
            }
        }
        self.sync().await
    }
}

pub type AmpleReadEngine = SyncEngine<ReqwestCatalogHttp>;

/// Tauri-managed handle around an `AmpleReadEngine` that may have failed to
/// initialize (e.g. the local store couldn't be opened). Commands surface a
/// clean ampleread-specific error instead of Tauri's unmanaged-state
/// error/panic when the engine isn't available.
pub struct EngineHandle(Mutex<Option<Arc<AmpleReadEngine>>>);

impl EngineHandle {
    pub fn new(engine: Option<AmpleReadEngine>) -> Self {
        Self(Mutex::new(engine.map(Arc::new)))
    }

    fn engine(&self) -> Result<Arc<AmpleReadEngine>, String> {
        self.0
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| "ampleread store is unavailable".to_string())
    }
}

#[tauri::command]
pub(crate) async fn ampleread_explore(
    state: tauri::State<'_, EngineHandle>,
) -> Result<ExploreResponse, String> {
    let engine = state.engine()?;
    let shelves = engine.get_explore().map_err(|e| e.to_string())?;
    Ok(ExploreResponse { shelves })
}

#[tauri::command]
pub(crate) async fn ampleread_work_detail(
    state: tauri::State<'_, EngineHandle>,
    id: String,
) -> Result<WorkDetail, String> {
    let engine = state.engine()?;
    engine
        .get_work_detail(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("work detail not found for id {id}"))
}

#[tauri::command]
pub(crate) async fn ampleread_refresh(
    state: tauri::State<'_, EngineHandle>,
    scope: String,
) -> Result<(), String> {
    let engine = state.engine()?;
    engine.refresh(&scope).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ampleread_types::{AuthorRef, ChangeOp, RefreshConfig, TtlConfig, WorkCard};
    use std::collections::HashMap;
    use std::sync::Mutex as StdMutex;

    #[derive(Default)]
    struct Counts {
        bootstrap: u32,
        explore: u32,
        work_detail: u32,
        changes: u32,
    }

    struct MockHttp {
        bootstrap: BootstrapResponse,
        explore: FetchResult<ExploreResponse>,
        work_detail: HashMap<String, FetchResult<WorkDetail>>,
        changes: ChangesResponse,
        counts: StdMutex<Counts>,
        // Territory passed on the most recent `get_work_detail` call, so
        // tests can assert the stored bootstrap territory is actually
        // threaded into work-detail requests.
        last_work_detail_territory: StdMutex<Option<String>>,
    }

    impl CatalogHttp for MockHttp {
        async fn get_bootstrap(&self) -> Result<BootstrapResponse, SyncError> {
            self.counts.lock().unwrap().bootstrap += 1;
            Ok(self.bootstrap.clone())
        }

        async fn get_explore(
            &self,
            _etag: Option<&str>,
        ) -> Result<FetchResult<ExploreResponse>, SyncError> {
            self.counts.lock().unwrap().explore += 1;
            Ok(self.explore.clone())
        }

        async fn get_work_detail(
            &self,
            id: &str,
            _etag: Option<&str>,
            territory: Option<&str>,
        ) -> Result<FetchResult<WorkDetail>, SyncError> {
            self.counts.lock().unwrap().work_detail += 1;
            *self.last_work_detail_territory.lock().unwrap() = territory.map(str::to_string);
            Ok(self
                .work_detail
                .get(id)
                .cloned()
                .unwrap_or(FetchResult::NotModified))
        }

        async fn get_changes(&self, _since: i64) -> Result<ChangesResponse, SyncError> {
            self.counts.lock().unwrap().changes += 1;
            Ok(self.changes.clone())
        }
    }

    struct FailingHttp {
        bootstrap_calls: StdMutex<u32>,
    }

    impl CatalogHttp for FailingHttp {
        async fn get_bootstrap(&self) -> Result<BootstrapResponse, SyncError> {
            *self.bootstrap_calls.lock().unwrap() += 1;
            Err(SyncError::Http("boom".to_string()))
        }

        async fn get_explore(
            &self,
            _etag: Option<&str>,
        ) -> Result<FetchResult<ExploreResponse>, SyncError> {
            unreachable!("bootstrap fails before explore is ever revalidated")
        }

        async fn get_work_detail(
            &self,
            _id: &str,
            _etag: Option<&str>,
            _territory: Option<&str>,
        ) -> Result<FetchResult<WorkDetail>, SyncError> {
            unreachable!("bootstrap fails before any work detail is ever revalidated")
        }

        async fn get_changes(&self, _since: i64) -> Result<ChangesResponse, SyncError> {
            unreachable!("bootstrap fails before changes are ever fetched")
        }
    }

    /// Bootstrap always succeeds; the `/v1/changes` fetch always fails.
    /// Models a cascade that fails partway through, after `maybe_bootstrap`
    /// has already observed a changed `catalogVersion`.
    struct ChangesFailingHttp {
        bootstrap: BootstrapResponse,
        bootstrap_calls: StdMutex<u32>,
        changes_calls: StdMutex<u32>,
    }

    impl CatalogHttp for ChangesFailingHttp {
        async fn get_bootstrap(&self) -> Result<BootstrapResponse, SyncError> {
            *self.bootstrap_calls.lock().unwrap() += 1;
            Ok(self.bootstrap.clone())
        }

        async fn get_explore(
            &self,
            _etag: Option<&str>,
        ) -> Result<FetchResult<ExploreResponse>, SyncError> {
            unreachable!("get_changes fails before explore is ever revalidated")
        }

        async fn get_work_detail(
            &self,
            _id: &str,
            _etag: Option<&str>,
            _territory: Option<&str>,
        ) -> Result<FetchResult<WorkDetail>, SyncError> {
            unreachable!("get_changes fails before any work detail is ever revalidated")
        }

        async fn get_changes(&self, _since: i64) -> Result<ChangesResponse, SyncError> {
            *self.changes_calls.lock().unwrap() += 1;
            Err(SyncError::Http("changes fetch boom".to_string()))
        }
    }

    fn sample_bootstrap(catalog_version: i64) -> BootstrapResponse {
        BootstrapResponse {
            config_version: 1,
            catalog_version,
            min_app_version: "1.0.0".to_string(),
            min_catalog_version: 1,
            territory: "US".to_string(),
            layout_schema: 1,
            ttl: TtlConfig {
                bootstrap_s: 3600,
                explore_s: 300,
                work_s: 300,
            },
            refresh: RefreshConfig {
                on_foreground_after_s: 60,
                jitter_s: 0,
            },
            features: serde_json::json!({}),
            endpoints: serde_json::json!({}),
        }
    }

    fn sample_shelf(id: &str) -> Shelf {
        Shelf {
            id: id.to_string(),
            title: "Shelf".to_string(),
            layout: "grid".to_string(),
            items: vec![WorkCard {
                id: format!("{id}-work"),
                title: "A Book".to_string(),
                authors: vec![AuthorRef {
                    id: "author-1".to_string(),
                    name: "Jane Doe".to_string(),
                }],
                cover: None,
                language: Some("en".to_string()),
                has_audio: false,
                formats: vec!["epub".to_string()],
            }],
            more: None,
        }
    }

    fn sample_work_detail(id: &str) -> WorkDetail {
        WorkDetail {
            id: id.to_string(),
            title: "A Book".to_string(),
            description: None,
            subjects: vec![],
            preferred_edition_id: None,
            editions: vec![],
        }
    }

    fn no_op_changes() -> ChangesResponse {
        ChangesResponse {
            since: 0,
            until: 2,
            compacted: false,
            ops: vec![],
        }
    }

    #[tokio::test]
    async fn unchanged_catalog_version_short_circuits() {
        let store = Store::open_in_memory().unwrap();
        store.set_meta(META_CATALOG_VERSION, "7").unwrap();

        let http = MockHttp {
            bootstrap: sample_bootstrap(7),
            explore: FetchResult::NotModified,
            work_detail: HashMap::new(),
            changes: no_op_changes(),
            counts: StdMutex::new(Counts::default()),
            last_work_detail_territory: StdMutex::new(None),
        };
        let engine = SyncEngine::new(http, store);

        engine.sync().await.unwrap();

        let counts = engine.http.counts.lock().unwrap();
        assert_eq!(counts.bootstrap, 1);
        assert_eq!(counts.explore, 0);
        assert_eq!(counts.changes, 0);
        assert_eq!(counts.work_detail, 0);
    }

    #[tokio::test]
    async fn changed_catalog_version_fetches_and_applies_changes() {
        let store = Store::open_in_memory().unwrap();
        store.set_meta(META_CATALOG_VERSION, "1").unwrap();

        let http = MockHttp {
            bootstrap: sample_bootstrap(2),
            explore: FetchResult::Fresh {
                body: ExploreResponse {
                    shelves: vec![sample_shelf("shelf-a")],
                },
                etag: Some("etag-1".to_string()),
            },
            work_detail: HashMap::new(),
            changes: no_op_changes(),
            counts: StdMutex::new(Counts::default()),
            last_work_detail_territory: StdMutex::new(None),
        };
        let engine = SyncEngine::new(http, store);

        engine.sync().await.unwrap();

        let counts = engine.http.counts.lock().unwrap();
        assert_eq!(counts.bootstrap, 1);
        assert_eq!(counts.changes, 1);
        assert_eq!(counts.explore, 1);
        drop(counts);

        let explore = engine.get_explore().unwrap();
        assert_eq!(explore.len(), 1);
        assert_eq!(explore[0].id, "shelf-a");

        let state = {
            let store = engine.store.lock().unwrap();
            store.get_sync_state(SCOPE_EXPLORE).unwrap().unwrap()
        };
        assert_eq!(state.etag.as_deref(), Some("etag-1"));
    }

    #[tokio::test]
    async fn not_modified_leaves_store_untouched() {
        let mut store = Store::open_in_memory().unwrap();
        store.upsert_shelves(&[sample_shelf("shelf-a")]).unwrap();
        store
            .set_sync_state(SCOPE_EXPLORE, Some("etag-original"), 100, 0)
            .unwrap();
        store.set_meta(META_CATALOG_VERSION, "1").unwrap();

        let http = MockHttp {
            bootstrap: sample_bootstrap(2),
            explore: FetchResult::NotModified,
            work_detail: HashMap::new(),
            changes: no_op_changes(),
            counts: StdMutex::new(Counts::default()),
            last_work_detail_territory: StdMutex::new(None),
        };
        let engine = SyncEngine::new(http, store);

        engine.sync().await.unwrap();

        // Prove the 304 path actually executed (bootstrap + changes +
        // explore all ran) rather than the revalidation being skipped
        // entirely, which would make the assertions below pass vacuously.
        let counts = engine.http.counts.lock().unwrap();
        assert_eq!(counts.bootstrap, 1);
        assert_eq!(counts.changes, 1);
        assert_eq!(counts.explore, 1);
        drop(counts);

        let explore = engine.get_explore().unwrap();
        assert_eq!(explore.len(), 1);
        assert_eq!(explore[0].id, "shelf-a");

        let state = {
            let store = engine.store.lock().unwrap();
            store.get_sync_state(SCOPE_EXPLORE).unwrap().unwrap()
        };
        assert_eq!(state.etag.as_deref(), Some("etag-original"));
        assert_eq!(state.fetched_at, 100);
    }

    #[tokio::test]
    async fn bootstrap_within_ttl_makes_zero_requests() {
        let store = Store::open_in_memory().unwrap();
        store.set_meta(META_CATALOG_VERSION, "1").unwrap();
        store
            .set_meta(META_BOOTSTRAP_LAST_AT, &now_secs().to_string())
            .unwrap();
        store.set_meta(META_BOOTSTRAP_TTL_S, "3600").unwrap();
        store.set_meta(META_BOOTSTRAP_JITTER_S, "0").unwrap();

        let http = MockHttp {
            bootstrap: sample_bootstrap(1),
            explore: FetchResult::NotModified,
            work_detail: HashMap::new(),
            changes: no_op_changes(),
            counts: StdMutex::new(Counts::default()),
            last_work_detail_territory: StdMutex::new(None),
        };
        let engine = SyncEngine::new(http, store);

        engine.sync().await.unwrap();

        let counts = engine.http.counts.lock().unwrap();
        assert_eq!(counts.bootstrap, 0);
        assert_eq!(counts.explore, 0);
        assert_eq!(counts.changes, 0);
        assert_eq!(counts.work_detail, 0);
    }

    #[tokio::test]
    async fn compacted_changes_skip_apply_but_fully_revalidate() {
        let mut store = Store::open_in_memory().unwrap();
        store.upsert_shelves(&[sample_shelf("shelf-a")]).unwrap();
        store.set_meta(META_CATALOG_VERSION, "1").unwrap();

        let http = MockHttp {
            bootstrap: sample_bootstrap(2),
            explore: FetchResult::Fresh {
                body: ExploreResponse {
                    shelves: vec![sample_shelf("shelf-a")],
                },
                etag: Some("etag-2".to_string()),
            },
            work_detail: HashMap::new(),
            changes: ChangesResponse {
                since: 0,
                until: 2,
                compacted: true,
                ops: vec![ChangeOp {
                    entity_type: "shelf".to_string(),
                    entity_id: "shelf-a".to_string(),
                    op: "remove".to_string(),
                }],
            },
            counts: StdMutex::new(Counts::default()),
            last_work_detail_territory: StdMutex::new(None),
        };
        let engine = SyncEngine::new(http, store);

        engine.sync().await.unwrap();

        // If the removal op had been applied, shelf-a would be gone. It
        // survives because compacted skips apply_changes...
        let explore = engine.get_explore().unwrap();
        assert_eq!(explore.len(), 1);
        assert_eq!(explore[0].id, "shelf-a");

        // ...and the fresh etag proves a real full revalidation ran.
        let counts = engine.http.counts.lock().unwrap();
        assert_eq!(counts.changes, 1);
        assert_eq!(counts.explore, 1);
        drop(counts);

        let state = {
            let store = engine.store.lock().unwrap();
            store.get_sync_state(SCOPE_EXPLORE).unwrap().unwrap()
        };
        assert_eq!(state.etag.as_deref(), Some("etag-2"));
    }

    #[tokio::test]
    async fn single_flight_guard_releases_after_bootstrap_error() {
        let store = Store::open_in_memory().unwrap();
        let http = FailingHttp {
            bootstrap_calls: StdMutex::new(0),
        };
        let engine = SyncEngine::new(http, store);

        assert!(engine.sync().await.is_err());
        // If the in-flight guard weren't released on the error path, this
        // second call would see the key still marked in-flight and silently
        // no-op (returning Ok) instead of retrying and failing again.
        assert!(engine.sync().await.is_err());

        assert_eq!(*engine.http.bootstrap_calls.lock().unwrap(), 2);
    }

    #[tokio::test]
    async fn failed_cascade_leaves_stored_catalog_version_unchanged_and_retries() {
        let store = Store::open_in_memory().unwrap();
        store.set_meta(META_CATALOG_VERSION, "1").unwrap();

        let http = ChangesFailingHttp {
            bootstrap: sample_bootstrap(2), // reports a new version, 1 -> 2
            bootstrap_calls: StdMutex::new(0),
            changes_calls: StdMutex::new(0),
        };
        let engine = SyncEngine::new(http, store);

        // Bootstrap observes the new version (2), but the changes fetch
        // that the cascade depends on fails.
        assert!(engine.sync().await.is_err());

        // The stored version must NOT have advanced to 2 — consuming it
        // before the cascade succeeded would strand every held scope under
        // a version that falsely claims to already be current.
        let stored_version: i64 = {
            let store = engine.store.lock().unwrap();
            store
                .get_meta(META_CATALOG_VERSION)
                .unwrap()
                .unwrap()
                .parse()
                .unwrap()
        };
        assert_eq!(
            stored_version, 1,
            "version must stay at the old value when the cascade fails"
        );
        assert_eq!(*engine.http.bootstrap_calls.lock().unwrap(), 1);
        assert_eq!(*engine.http.changes_calls.lock().unwrap(), 1);

        // Simulate the bootstrap TTL having elapsed since (independent of
        // this fix) so the next sync is due to bootstrap again.
        {
            let store = engine.store.lock().unwrap();
            store.set_meta(META_BOOTSTRAP_LAST_AT, "0").unwrap();
        }

        // The retry still sees the version as "changed" (1 != 2, since the
        // old value was never overwritten) and tries the whole cascade
        // again, rather than treating it as already-applied.
        assert!(engine.sync().await.is_err());
        assert_eq!(*engine.http.bootstrap_calls.lock().unwrap(), 2);
        assert_eq!(*engine.http.changes_calls.lock().unwrap(), 2);
    }

    #[tokio::test]
    async fn no_bootstrap_yet_is_always_due() {
        let store = Store::open_in_memory().unwrap();
        let http = MockHttp {
            bootstrap: sample_bootstrap(1),
            explore: FetchResult::NotModified,
            work_detail: HashMap::new(),
            changes: no_op_changes(),
            counts: StdMutex::new(Counts::default()),
            last_work_detail_territory: StdMutex::new(None),
        };
        let engine = SyncEngine::new(http, store);

        engine.sync().await.unwrap();

        let counts = engine.http.counts.lock().unwrap();
        assert_eq!(counts.bootstrap, 1);
        // First-ever bootstrap has no prior catalog_version, so it counts
        // as changed and cascades into a changes fetch.
        assert_eq!(counts.changes, 1);
    }

    #[tokio::test]
    async fn refresh_unheld_work_detail_performs_first_time_fetch() {
        let store = Store::open_in_memory().unwrap();
        let mut work_detail = HashMap::new();
        work_detail.insert(
            "work-1".to_string(),
            FetchResult::Fresh {
                body: sample_work_detail("work-1"),
                etag: Some("etag-1".to_string()),
            },
        );
        let http = MockHttp {
            bootstrap: sample_bootstrap(1),
            explore: FetchResult::NotModified,
            work_detail,
            changes: no_op_changes(),
            counts: StdMutex::new(Counts::default()),
            last_work_detail_territory: StdMutex::new(None),
        };
        let engine = SyncEngine::new(http, store);

        engine.refresh("work:work-1").await.unwrap();

        let counts = engine.http.counts.lock().unwrap();
        assert_eq!(counts.work_detail, 1);
        assert_eq!(counts.bootstrap, 0);
        assert_eq!(counts.changes, 0);
        drop(counts);

        let detail = engine.get_work_detail("work-1").unwrap().unwrap();
        assert_eq!(detail.id, "work-1");
    }

    #[tokio::test]
    async fn refresh_already_held_work_detail_follows_normal_cascade() {
        let mut store = Store::open_in_memory().unwrap();
        let existing = sample_work_detail("work-1");
        store
            .upsert_work_detail("work-1", &existing, "etag-existing")
            .unwrap();
        store.set_meta(META_CATALOG_VERSION, "5").unwrap();

        let http = MockHttp {
            bootstrap: sample_bootstrap(5), // unchanged
            explore: FetchResult::NotModified,
            work_detail: HashMap::new(),
            changes: no_op_changes(),
            counts: StdMutex::new(Counts::default()),
            last_work_detail_territory: StdMutex::new(None),
        };
        let engine = SyncEngine::new(http, store);

        engine.refresh("work:work-1").await.unwrap();

        let counts = engine.http.counts.lock().unwrap();
        assert_eq!(counts.bootstrap, 1);
        // Unchanged version -> zero further requests, even for the
        // requested scope, since it's already held (not a first fetch).
        assert_eq!(counts.work_detail, 0);
        assert_eq!(counts.changes, 0);
    }

    #[tokio::test]
    async fn territory_from_bootstrap_is_sent_on_work_detail_requests() {
        let store = Store::open_in_memory().unwrap();
        let mut work_detail = HashMap::new();
        work_detail.insert(
            "work-1".to_string(),
            FetchResult::Fresh {
                body: sample_work_detail("work-1"),
                etag: Some("etag-1".to_string()),
            },
        );
        // sample_bootstrap's territory is "US".
        let http = MockHttp {
            bootstrap: sample_bootstrap(1),
            explore: FetchResult::NotModified,
            work_detail,
            changes: no_op_changes(),
            counts: StdMutex::new(Counts::default()),
            last_work_detail_territory: StdMutex::new(None),
        };
        let engine = SyncEngine::new(http, store);

        // Bootstrap persists the territory into the store's meta table.
        engine.sync().await.unwrap();

        // A first-time work-detail fetch should thread that stored
        // territory through as the `?t=` request parameter.
        engine.refresh("work:work-1").await.unwrap();

        let territory = engine
            .http
            .last_work_detail_territory
            .lock()
            .unwrap()
            .clone();
        assert_eq!(territory.as_deref(), Some("US"));
    }

    #[test]
    fn engine_handle_surfaces_error_when_store_unavailable() {
        let handle = EngineHandle::new(None);
        assert!(handle.engine().is_err());
    }

    #[test]
    fn engine_handle_returns_engine_when_available() {
        let store = Store::open_in_memory().unwrap();
        let engine = SyncEngine::new(ReqwestCatalogHttp::new(api_base()), store);
        let handle = EngineHandle::new(Some(engine));
        assert!(handle.engine().is_ok());
    }
}
