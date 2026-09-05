#![allow(async_fn_in_trait)]

use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use ampleread_types::{
    BootstrapResponse, ChangesResponse, EventBatch, EventIn, EventsAccepted, ExploreResponse,
    Shelf, WorkDetail,
};

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
const META_INSTALL_TOKEN: &str = "install_token";
const META_API_BASE: &str = "api_base";
const INSTALL_HEADER: &str = "X-Ampleread-Install";
const SCOPE_EVENTS: &str = "events";
pub const MAX_EVENTS_PER_BATCH: usize = 100;

/// Base URL for the AmpleRead catalog API. Overridable via the
/// `AMPLEREAD_API_BASE` environment variable for staging/dev backends.
pub fn api_base() -> String {
    std::env::var("AMPLEREAD_API_BASE").unwrap_or_else(|_| DEFAULT_API_BASE.to_string())
}

#[derive(Debug, thiserror::Error)]
pub enum SyncError {
    #[error("http error: {0}")]
    Http(String),
    #[error("protocol error: {0}")]
    Protocol(String),
    #[error("store error: {0}")]
    Store(#[from] rusqlite::Error),
    #[error("not found: {0}")]
    NotFound(String),
}

/// What `GET /v1/assets/{id}/download` answered: the offer URL behind
/// its redirect, or a 404 meaning the asset id is gone (re-fetch the
/// edition list and retry with the current id).
#[derive(Debug, Clone, PartialEq)]
pub enum DownloadResolution {
    Redirect(String),
    NotFound,
}

/// How `POST /v1/events` answered. Transport failures and unexpected
/// statuses are `SyncError`s; these three are the contract's own answers.
#[derive(Debug, Clone, PartialEq)]
pub enum EventsOutcome {
    Accepted(u32),
    Unauthorized,
    Rejected,
}

#[derive(Debug, Clone)]
pub enum FetchResult<T> {
    Fresh { body: T, etag: Option<String> },
    NotModified,
    NotFound,
}

pub trait CatalogHttp {
    async fn get_bootstrap(
        &self,
        install_token: Option<&str>,
    ) -> Result<BootstrapResponse, SyncError>;
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
    async fn get_changes(
        &self,
        since: i64,
        cursor: Option<&str>,
    ) -> Result<ChangesResponse, SyncError>;
    async fn post_events(
        &self,
        install_token: &str,
        batch: &EventBatch,
    ) -> Result<EventsOutcome, SyncError>;
    async fn resolve_download(
        &self,
        asset_id: &str,
        install_token: Option<&str>,
    ) -> Result<DownloadResolution, SyncError>;
}

pub struct ReqwestCatalogHttp {
    client: reqwest::Client,
    /// Never follows redirects: the download route answers 302 and the
    /// caller wants that Location, not the file body.
    download_client: reqwest::Client,
    base_url: String,
}

impl ReqwestCatalogHttp {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            client: reqwest::Client::new(),
            download_client: reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .unwrap_or_default(),
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
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(FetchResult::NotFound);
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
    async fn get_bootstrap(
        &self,
        install_token: Option<&str>,
    ) -> Result<BootstrapResponse, SyncError> {
        let url = format!("{}/v1/bootstrap", self.base_url);
        let mut request = self.client.get(url);
        if let Some(token) = install_token {
            request = request.header(INSTALL_HEADER, token);
        }
        let response = request
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

    async fn get_changes(
        &self,
        since: i64,
        cursor: Option<&str>,
    ) -> Result<ChangesResponse, SyncError> {
        let url = format!("{}/v1/changes", self.base_url);
        let mut query = vec![("since", since.to_string())];
        if let Some(cursor) = cursor {
            query.push(("cursor", cursor.to_string()));
        }
        let response = self
            .client
            .get(url)
            .query(&query)
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

    async fn post_events(
        &self,
        install_token: &str,
        batch: &EventBatch,
    ) -> Result<EventsOutcome, SyncError> {
        let url = format!("{}/v1/events", self.base_url);
        let response = self
            .client
            .post(url)
            .header(INSTALL_HEADER, install_token)
            .json(batch)
            .send()
            .await
            .map_err(|e| SyncError::Http(e.to_string()))?;
        match response.status() {
            reqwest::StatusCode::UNAUTHORIZED => Ok(EventsOutcome::Unauthorized),
            reqwest::StatusCode::BAD_REQUEST => Ok(EventsOutcome::Rejected),
            status if status.is_success() => {
                let accepted = response
                    .json::<EventsAccepted>()
                    .await
                    .map_err(|e| SyncError::Http(e.to_string()))?;
                Ok(EventsOutcome::Accepted(accepted.accepted))
            }
            status => Err(SyncError::Http(format!("events: unexpected status {status}"))),
        }
    }

    async fn resolve_download(
        &self,
        asset_id: &str,
        install_token: Option<&str>,
    ) -> Result<DownloadResolution, SyncError> {
        let url = format!("{}/v1/assets/{asset_id}/download", self.base_url);
        let mut request = self.download_client.get(url);
        if let Some(token) = install_token {
            request = request.header(INSTALL_HEADER, token);
        }
        let response = request
            .send()
            .await
            .map_err(|e| SyncError::Http(e.to_string()))?;
        let status = response.status();
        if status == reqwest::StatusCode::NOT_FOUND {
            return Ok(DownloadResolution::NotFound);
        }
        if status.is_redirection() {
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| {
                    SyncError::Protocol(format!("download {asset_id}: {status} without Location"))
                })?;
            return Ok(DownloadResolution::Redirect(location.to_string()));
        }
        Err(SyncError::Http(format!(
            "download {asset_id}: unexpected status {status}"
        )))
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

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
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
    Changed {
        new_version: i64,
    },
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

    /// Opens the engine over a mirror keyed by API base. A mirror built
    /// against another base (or an unkeyed one from an older build) is
    /// wiped, together with the install token and queued events that only
    /// mean something to the server that minted them.
    pub fn for_api_base(http: H, store: Store, base: &str) -> Result<Self, SyncError> {
        let engine = Self::new(http, store);
        let stored = {
            let store = engine.store.lock().unwrap();
            store.get_meta(META_API_BASE)?
        };
        if stored.as_deref() != Some(base) {
            log::info!(
                "ampleread: mirror keyed to {stored:?}, now {base:?}; resetting to a fresh install"
            );
            engine.reset_catalog()?;
            let mut store = engine.store.lock().unwrap();
            store.clear_pending_events()?;
            store.delete_meta(META_INSTALL_TOKEN)?;
            store.delete_meta(META_BOOTSTRAP_LAST_AT)?;
            store.set_meta(META_API_BASE, base)?;
        }
        Ok(engine)
    }

    /// Drops every catalog row and the version/cursor pair so the next
    /// cascade takes the fresh-install path (`since=0`).
    fn reset_catalog(&self) -> Result<(), SyncError> {
        let mut store = self.store.lock().unwrap();
        store.clear_catalog()?;
        store.delete_meta(META_CATALOG_VERSION)?;
        store.delete_meta(META_CHANGE_CURSOR)?;
        Ok(())
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

    fn install_token(&self) -> Result<Option<String>, SyncError> {
        let store = self.store.lock().unwrap();
        Ok(store.get_meta(META_INSTALL_TOKEN)?)
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

        let install_token = self.install_token()?;
        let response = self.http.get_bootstrap(install_token.as_deref()).await?;

        if let Some(token) = &response.install_token {
            let store = self.store.lock().unwrap();
            store.set_meta(META_INSTALL_TOKEN, token)?;
        }
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
                store.replace_shelves(&body.shelves)?;
                store.set_sync_state(SCOPE_EXPLORE, etag.as_deref(), now_secs(), 0)?;
            }
            FetchResult::NotModified => {}
            FetchResult::NotFound => {
                return Err(SyncError::Protocol("explore answered 404".to_string()));
            }
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
            FetchResult::NotFound => {
                log::info!("ampleread: work {id} is gone (404 on revalidation); dropping it");
                let mut store = self.store.lock().unwrap();
                store.remove_work(id)?;
            }
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
    /// walk every page of the `/v1/changes` window, apply the ops (unless
    /// the server reports `compacted`, in which case incremental ops can't
    /// be trusted and held scopes get a full revalidation instead), then
    /// always revalidate held scopes so stale mirror entries pick up the
    /// new state. The stored cursor only moves to the window's `until`
    /// after the last page and the revalidation have both succeeded.
    async fn apply_remote_changes(&self) -> Result<(), SyncError> {
        let Some(guard) = self.try_acquire(SCOPE_CHANGES) else {
            return Ok(());
        };
        let since = self.meta_get_i64(META_CHANGE_CURSOR)?.unwrap_or(0);
        let until = self.apply_change_window(since).await?;
        drop(guard);

        self.revalidate_held_scopes().await?;
        self.meta_set_i64(META_CHANGE_CURSOR, until)?;
        Ok(())
    }

    async fn apply_change_window(&self, since: i64) -> Result<i64, SyncError> {
        let mut cursor: Option<String> = None;
        loop {
            let page = self.http.get_changes(since, cursor.as_deref()).await?;
            if page.compacted {
                return Ok(page.until);
            }
            {
                let mut store = self.store.lock().unwrap();
                store.apply_changes(&page.ops)?;
            }
            match page.next_cursor {
                None => return Ok(page.until),
                Some(next) if cursor.as_deref() == Some(next.as_str()) => {
                    return Err(SyncError::Protocol(format!(
                        "changes cursor {next:?} did not advance"
                    )));
                }
                Some(next) => cursor = Some(next),
            }
        }
    }

    /// Queues one client event (`open`, `save`, `download`, `finish`) for
    /// the next flush. Never touches the network.
    pub fn record_event(
        &self,
        kind: &str,
        work_id: Option<&str>,
        edition_id: Option<&str>,
        props: Option<serde_json::Value>,
    ) -> Result<(), SyncError> {
        let event = EventIn {
            kind: kind.to_string(),
            work_id: work_id.map(str::to_string),
            edition_id: edition_id.map(str::to_string),
            ts: now_rfc3339(),
            props,
        };
        let payload = serde_json::to_string(&event)
            .map_err(|e| SyncError::Protocol(format!("event serialization: {e}")))?;
        let store = self.store.lock().unwrap();
        Ok(store.enqueue_event(&payload)?)
    }

    /// Forces a bootstrap with no token so the server mints a fresh one.
    /// Leaves the bootstrap cadence alone: only the token is persisted.
    async fn remint_install_token(&self) -> Result<String, SyncError> {
        let response = self.http.get_bootstrap(None).await?;
        let Some(token) = response.install_token else {
            return Err(SyncError::Protocol(
                "bootstrap did not mint an install token".to_string(),
            ));
        };
        let store = self.store.lock().unwrap();
        store.set_meta(META_INSTALL_TOKEN, &token)?;
        Ok(token)
    }

    async fn ensure_install_token(&self) -> Result<String, SyncError> {
        match self.install_token()? {
            Some(token) => Ok(token),
            None => self.remint_install_token().await,
        }
    }

    fn take_pending_batch(&self) -> Result<(Vec<i64>, Vec<EventIn>), SyncError> {
        let store = self.store.lock().unwrap();
        let rows = store.pending_events(MAX_EVENTS_PER_BATCH)?;
        let mut ids = Vec::with_capacity(rows.len());
        let mut events = Vec::with_capacity(rows.len());
        for (id, payload) in rows {
            let event: EventIn = serde_json::from_str(&payload)
                .map_err(|e| SyncError::Protocol(format!("pending event {id}: {e}")))?;
            ids.push(id);
            events.push(event);
        }
        Ok((ids, events))
    }

    fn delete_pending(&self, ids: &[i64]) -> Result<(), SyncError> {
        let mut store = self.store.lock().unwrap();
        Ok(store.delete_events(ids)?)
    }

    async fn post_batch(&self, batch: &EventBatch) -> Result<EventsOutcome, SyncError> {
        let token = self.ensure_install_token().await?;
        match self.http.post_events(&token, batch).await? {
            EventsOutcome::Unauthorized => {
                let token = self.remint_install_token().await?;
                self.http.post_events(&token, batch).await
            }
            outcome => Ok(outcome),
        }
    }

    /// Posts queued events in batches of at most `MAX_EVENTS_PER_BATCH`
    /// until the queue is empty. A 401 re-bootstraps for a new token and
    /// retries that batch once; a 400 means the batch can never succeed,
    /// so it is dropped whole and reported. Returns the accepted count.
    pub async fn flush_events(&self) -> Result<u32, SyncError> {
        let Some(_guard) = self.try_acquire(SCOPE_EVENTS) else {
            return Ok(0);
        };
        let mut accepted = 0;
        loop {
            let (ids, events) = self.take_pending_batch()?;
            if ids.is_empty() {
                return Ok(accepted);
            }
            let batch = EventBatch { events };
            match self.post_batch(&batch).await? {
                EventsOutcome::Accepted(count) => {
                    self.delete_pending(&ids)?;
                    accepted += count;
                }
                EventsOutcome::Unauthorized => {
                    return Err(SyncError::Http(
                        "events: re-minted install token was still rejected".to_string(),
                    ));
                }
                EventsOutcome::Rejected => {
                    self.delete_pending(&ids)?;
                    return Err(SyncError::Protocol(format!(
                        "events: batch of {} rejected as malformed and dropped",
                        ids.len()
                    )));
                }
            }
        }
    }

    /// The version-gated sync loop: bootstrap (only when due), and only when
    /// the catalog version actually changed does it fetch changes and
    /// revalidate. An unchanged version issues zero further requests.
    /// Queued events are flushed afterwards; a flush failure is logged and
    /// never fails the catalog sync.
    pub async fn sync(&self) -> Result<(), SyncError> {
        self.sync_catalog().await?;
        if let Err(e) = self.flush_events().await {
            log::warn!("ampleread: event flush failed: {e}");
        }
        Ok(())
    }

    async fn sync_catalog(&self) -> Result<(), SyncError> {
        match self.maybe_bootstrap().await? {
            BootstrapOutcome::NotDue | BootstrapOutcome::Unchanged => Ok(()),
            BootstrapOutcome::Changed { new_version } => {
                // A version below the stored `until` is not an older
                // snapshot of the same catalog but a different catalog
                // (ids differ), so the mirror starts over from since=0.
                let stored_until = self.meta_get_i64(META_CHANGE_CURSOR)?;
                if stored_until.is_some_and(|until| new_version < until) {
                    log::info!(
                        "ampleread: catalogVersion {new_version} is below the stored until {stored_until:?}; resetting the mirror"
                    );
                    self.reset_catalog()?;
                }
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
            FetchResult::NotFound => return Err(SyncError::NotFound(format!("work {id}"))),
        }
        Ok(())
    }

    /// Where a stored asset sits: its edition and file kind, which is what
    /// survives a re-ingest even when the asset id does not.
    fn locate_asset(&self, work_id: &str, asset_id: &str) -> Result<Option<(String, String)>, SyncError> {
        let detail = self.get_work_detail(work_id)?;
        Ok(detail.and_then(|detail| {
            detail.editions.iter().find_map(|edition| {
                edition
                    .assets
                    .iter()
                    .find(|asset| asset.id == asset_id)
                    .map(|asset| (edition.id.clone(), asset.kind.clone()))
            })
        }))
    }

    fn replacement_asset(
        &self,
        work_id: &str,
        edition_id: &str,
        kind: &str,
    ) -> Result<Option<String>, SyncError> {
        let detail = self.get_work_detail(work_id)?;
        Ok(detail.and_then(|detail| {
            detail
                .editions
                .iter()
                .find(|edition| edition.id == edition_id)
                .and_then(|edition| edition.assets.iter().find(|asset| asset.kind == kind))
                .map(|asset| asset.id.clone())
        }))
    }

    /// Resolves the offer URL behind `/v1/assets/{id}/download`, sending
    /// the install token. A 404 means the asset id changed under a
    /// re-ingest: the work's edition list is re-fetched and the download
    /// retried once with the asset now holding the same edition and kind.
    pub async fn download_url(&self, work_id: &str, asset_id: &str) -> Result<String, SyncError> {
        let token = self.ensure_install_token().await?;
        match self.http.resolve_download(asset_id, Some(&token)).await? {
            DownloadResolution::Redirect(url) => return Ok(url),
            DownloadResolution::NotFound => {}
        }
        let located = self.locate_asset(work_id, asset_id)?;
        self.fetch_work_detail_first_time(work_id).await?;
        let Some((edition_id, kind)) = located else {
            return Err(SyncError::NotFound(format!("asset {asset_id}")));
        };
        let Some(replacement) = self.replacement_asset(work_id, &edition_id, &kind)? else {
            return Err(SyncError::NotFound(format!(
                "asset {asset_id}: no {kind} asset remains on edition {edition_id}"
            )));
        };
        match self.http.resolve_download(&replacement, Some(&token)).await? {
            DownloadResolution::Redirect(url) => Ok(url),
            DownloadResolution::NotFound => Err(SyncError::NotFound(format!(
                "asset {replacement} (replacement for {asset_id})"
            ))),
        }
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
    use ampleread_types::{
        AssetView, AuthorRef, Capabilities, ChangeOp, EditionView, RefreshConfig, TtlConfig,
        WorkCard,
    };
    use std::collections::HashMap;
    use std::sync::Mutex as StdMutex;

    #[derive(Default)]
    struct Counts {
        bootstrap: u32,
        explore: u32,
        work_detail: u32,
        changes: u32,
        changes_calls: Vec<(i64, Option<String>)>,
    }

    struct MockHttp {
        bootstrap: BootstrapResponse,
        explore: FetchResult<ExploreResponse>,
        work_detail: HashMap<String, FetchResult<WorkDetail>>,
        changes: Vec<ChangesResponse>,
        counts: StdMutex<Counts>,
        // Territory passed on the most recent `get_work_detail` call, so
        // tests can assert the stored bootstrap territory is actually
        // threaded into work-detail requests.
        last_work_detail_territory: StdMutex<Option<String>>,
        // The X-Ampleread-Install value sent on each bootstrap, in order.
        bootstrap_tokens: StdMutex<Vec<Option<String>>>,
        // Tokens the mock server mints, in order, whenever a bootstrap
        // arrives without a token it has minted before.
        mint_queue: StdMutex<Vec<String>>,
        known_tokens: StdMutex<HashSet<String>>,
        // (token, batch) for every POST /v1/events, in order.
        events_posted: StdMutex<Vec<(String, EventBatch)>>,
        // Scripted outcomes, consumed front to back; an exhausted script
        // accepts the batch. `Unauthorized` also forgets the presented
        // token, the way a pruned install would.
        events_outcomes: StdMutex<Vec<EventsOutcome>>,
        // asset id -> resolution; unknown ids are NotFound.
        downloads: HashMap<String, DownloadResolution>,
        // (asset id, token) per resolve_download call, in order.
        download_calls: StdMutex<Vec<(String, Option<String>)>>,
    }

    impl MockHttp {
        fn mint_for(&self, presented: Option<&str>) -> Option<String> {
            let mut known = self.known_tokens.lock().unwrap();
            if presented.is_some_and(|token| known.contains(token)) {
                return None;
            }
            let mut queue = self.mint_queue.lock().unwrap();
            if queue.is_empty() {
                return None;
            }
            let token = queue.remove(0);
            known.insert(token.clone());
            Some(token)
        }
    }

    impl CatalogHttp for MockHttp {
        async fn get_bootstrap(
            &self,
            install_token: Option<&str>,
        ) -> Result<BootstrapResponse, SyncError> {
            self.counts.lock().unwrap().bootstrap += 1;
            self.bootstrap_tokens
                .lock()
                .unwrap()
                .push(install_token.map(str::to_string));
            let mut response = self.bootstrap.clone();
            response.install_token = self.mint_for(install_token);
            Ok(response)
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

        async fn get_changes(
            &self,
            since: i64,
            cursor: Option<&str>,
        ) -> Result<ChangesResponse, SyncError> {
            let mut counts = self.counts.lock().unwrap();
            let page = self.changes.get(counts.changes as usize).cloned();
            counts.changes += 1;
            counts
                .changes_calls
                .push((since, cursor.map(str::to_string)));
            page.ok_or_else(|| SyncError::Http("no more change pages".to_string()))
        }

        async fn post_events(
            &self,
            install_token: &str,
            batch: &EventBatch,
        ) -> Result<EventsOutcome, SyncError> {
            self.events_posted
                .lock()
                .unwrap()
                .push((install_token.to_string(), batch.clone()));
            let mut outcomes = self.events_outcomes.lock().unwrap();
            if outcomes.is_empty() {
                return Ok(EventsOutcome::Accepted(batch.events.len() as u32));
            }
            let outcome = outcomes.remove(0);
            if matches!(outcome, EventsOutcome::Unauthorized) {
                self.known_tokens.lock().unwrap().remove(install_token);
            }
            Ok(outcome)
        }

        async fn resolve_download(
            &self,
            asset_id: &str,
            install_token: Option<&str>,
        ) -> Result<DownloadResolution, SyncError> {
            self.download_calls
                .lock()
                .unwrap()
                .push((asset_id.to_string(), install_token.map(str::to_string)));
            Ok(self
                .downloads
                .get(asset_id)
                .cloned()
                .unwrap_or(DownloadResolution::NotFound))
        }
    }

    struct FailingHttp {
        bootstrap_calls: StdMutex<u32>,
    }

    impl CatalogHttp for FailingHttp {
        async fn get_bootstrap(
            &self,
            _install_token: Option<&str>,
        ) -> Result<BootstrapResponse, SyncError> {
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

        async fn get_changes(
            &self,
            _since: i64,
            _cursor: Option<&str>,
        ) -> Result<ChangesResponse, SyncError> {
            unreachable!("bootstrap fails before changes are ever fetched")
        }

        async fn post_events(
            &self,
            _install_token: &str,
            _batch: &EventBatch,
        ) -> Result<EventsOutcome, SyncError> {
            unreachable!("bootstrap fails before any event is ever posted")
        }

        async fn resolve_download(
            &self,
            _asset_id: &str,
            _install_token: Option<&str>,
        ) -> Result<DownloadResolution, SyncError> {
            unreachable!("no download is ever resolved here")
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
        async fn get_bootstrap(
            &self,
            _install_token: Option<&str>,
        ) -> Result<BootstrapResponse, SyncError> {
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

        async fn get_changes(
            &self,
            _since: i64,
            _cursor: Option<&str>,
        ) -> Result<ChangesResponse, SyncError> {
            *self.changes_calls.lock().unwrap() += 1;
            Err(SyncError::Http("changes fetch boom".to_string()))
        }

        async fn post_events(
            &self,
            _install_token: &str,
            _batch: &EventBatch,
        ) -> Result<EventsOutcome, SyncError> {
            unreachable!("get_changes fails before any event is ever posted")
        }

        async fn resolve_download(
            &self,
            _asset_id: &str,
            _install_token: Option<&str>,
        ) -> Result<DownloadResolution, SyncError> {
            unreachable!("no download is ever resolved here")
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
            install_token: None,
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

    fn detail_with_assets(id: &str, asset_count: usize) -> WorkDetail {
        let mut detail = sample_work_detail(id);
        detail.editions = vec![EditionView {
            id: format!("{id}-audio"),
            source_name: "gutenberg".to_string(),
            language: "en".to_string(),
            media_type: "audio".to_string(),
            assets: (0..asset_count)
                .map(|n| AssetView {
                    id: format!("{id}-asset-{n}"),
                    kind: "mp3".to_string(),
                    bytes: None,
                })
                .collect(),
            capabilities: Capabilities {
                can_read: false,
                can_download: asset_count > 0,
                can_transform: false,
            },
            attribution: None,
        }];
        detail
    }

    fn no_op_changes() -> ChangesResponse {
        ChangesResponse {
            since: 0,
            until: 2,
            compacted: false,
            ops: vec![],
            next_cursor: None,
        }
    }

    fn changes_page(until: i64, ops: Vec<ChangeOp>, next_cursor: Option<&str>) -> ChangesResponse {
        ChangesResponse {
            since: 0,
            until,
            compacted: false,
            ops,
            next_cursor: next_cursor.map(str::to_string),
        }
    }

    fn change_op(entity_type: &str, entity_id: &str, op: &str) -> ChangeOp {
        ChangeOp {
            entity_type: entity_type.to_string(),
            entity_id: entity_id.to_string(),
            op: op.to_string(),
        }
    }

    fn shelf_with_works(id: &str, work_ids: &[&str]) -> Shelf {
        let mut shelf = sample_shelf(id);
        shelf.items = work_ids
            .iter()
            .map(|work_id| WorkCard {
                id: work_id.to_string(),
                ..shelf.items[0].clone()
            })
            .collect();
        shelf
    }

    fn stored_meta<H: CatalogHttp>(engine: &SyncEngine<H>, key: &str) -> Option<String> {
        engine.store.lock().unwrap().get_meta(key).unwrap()
    }

    fn mock_parts() -> MockHttp {
        MockHttp {
            bootstrap: sample_bootstrap(0),
            explore: FetchResult::NotModified,
            work_detail: HashMap::new(),
            changes: vec![],
            counts: StdMutex::new(Counts::default()),
            last_work_detail_territory: StdMutex::new(None),
            bootstrap_tokens: StdMutex::new(Vec::new()),
            mint_queue: StdMutex::new(vec![
                "tok-1".to_string(),
                "tok-2".to_string(),
                "tok-3".to_string(),
            ]),
            known_tokens: StdMutex::new(HashSet::new()),
            events_posted: StdMutex::new(Vec::new()),
            events_outcomes: StdMutex::new(Vec::new()),
            downloads: HashMap::new(),
            download_calls: StdMutex::new(Vec::new()),
        }
    }

    fn detail_with_epub(work_id: &str, asset_id: &str) -> WorkDetail {
        let mut detail = sample_work_detail(work_id);
        detail.editions = vec![EditionView {
            id: format!("{work_id}-ed"),
            source_name: "gutenberg".to_string(),
            language: "en".to_string(),
            media_type: "text".to_string(),
            assets: vec![AssetView {
                id: asset_id.to_string(),
                kind: "epub".to_string(),
                bytes: None,
            }],
            capabilities: Capabilities {
                can_read: true,
                can_download: true,
                can_transform: false,
            },
            attribution: None,
        }];
        detail
    }

    fn download_calls(engine: &SyncEngine<MockHttp>) -> Vec<(String, Option<String>)> {
        engine.http.download_calls.lock().unwrap().clone()
    }

    fn posted_batches(engine: &SyncEngine<MockHttp>) -> Vec<(String, usize)> {
        engine
            .http
            .events_posted
            .lock()
            .unwrap()
            .iter()
            .map(|(token, batch)| (token.clone(), batch.events.len()))
            .collect()
    }

    fn pending_event_count<H: CatalogHttp>(engine: &SyncEngine<H>) -> i64 {
        engine.store.lock().unwrap().pending_event_count().unwrap()
    }

    fn mock_http(
        catalog_version: i64,
        explore: FetchResult<ExploreResponse>,
        changes: Vec<ChangesResponse>,
    ) -> MockHttp {
        MockHttp {
            bootstrap: sample_bootstrap(catalog_version),
            explore,
            changes,
            ..mock_parts()
        }
    }

    fn changes_calls(engine: &SyncEngine<MockHttp>) -> Vec<(i64, Option<String>)> {
        engine.http.counts.lock().unwrap().changes_calls.clone()
    }

    #[tokio::test]
    async fn first_bootstrap_persists_the_minted_install_token_once() {
        let store = Store::open_in_memory().unwrap();
        let engine = SyncEngine::new(
            mock_http(1, FetchResult::NotModified, vec![no_op_changes()]),
            store,
        );

        engine.sync().await.unwrap();
        assert_eq!(
            stored_meta(&engine, META_INSTALL_TOKEN).as_deref(),
            Some("tok-1")
        );

        {
            let store = engine.store.lock().unwrap();
            store.set_meta(META_BOOTSTRAP_LAST_AT, "0").unwrap();
        }
        engine.sync().await.unwrap();

        let sent = engine.http.bootstrap_tokens.lock().unwrap().clone();
        assert_eq!(sent, vec![None, Some("tok-1".to_string())]);
        assert_eq!(
            stored_meta(&engine, META_INSTALL_TOKEN).as_deref(),
            Some("tok-1"),
            "a bootstrap that mints nothing must not clear the stored token"
        );
    }

    #[tokio::test]
    async fn recorded_events_flush_in_batches_of_100_with_the_install_header() {
        let engine = SyncEngine::new(
            mock_http(1, FetchResult::NotModified, vec![no_op_changes()]),
            Store::open_in_memory().unwrap(),
        );
        engine.sync().await.unwrap();
        for n in 0..150 {
            engine
                .record_event("open", Some(&format!("work_{n}")), None, None)
                .unwrap();
        }

        let accepted = engine.flush_events().await.unwrap();

        assert_eq!(accepted, 150);
        assert_eq!(
            posted_batches(&engine),
            vec![("tok-1".to_string(), 100), ("tok-1".to_string(), 50)]
        );
        let posted = engine.http.events_posted.lock().unwrap();
        let first = &posted[0].1.events[0];
        assert_eq!(first.kind, "open");
        assert_eq!(first.work_id.as_deref(), Some("work_0"));
        assert_eq!(first.edition_id, None);
        assert!(
            first.ts.len() == 20 && first.ts.ends_with('Z') && first.ts.contains('T'),
            "ts must be RFC 3339 UTC seconds, got {:?}",
            first.ts
        );
        assert_eq!(posted[1].1.events[0].work_id.as_deref(), Some("work_100"));
        drop(posted);
        assert_eq!(pending_event_count(&engine), 0);
    }

    #[tokio::test]
    async fn events_401_re_bootstraps_for_a_new_token_and_retries_once() {
        let http = mock_http(1, FetchResult::NotModified, vec![no_op_changes()]);
        *http.events_outcomes.lock().unwrap() = vec![EventsOutcome::Unauthorized];
        let engine = SyncEngine::new(http, Store::open_in_memory().unwrap());
        engine.sync().await.unwrap();
        engine.record_event("finish", Some("work_1"), None, None).unwrap();

        let accepted = engine.flush_events().await.unwrap();

        assert_eq!(accepted, 1);
        assert_eq!(
            posted_batches(&engine),
            vec![("tok-1".to_string(), 1), ("tok-2".to_string(), 1)]
        );
        assert_eq!(
            stored_meta(&engine, META_INSTALL_TOKEN).as_deref(),
            Some("tok-2")
        );
        assert_eq!(engine.http.counts.lock().unwrap().bootstrap, 2);
        assert_eq!(pending_event_count(&engine), 0);
    }

    #[tokio::test]
    async fn events_401_after_the_re_mint_keeps_the_batch_and_stops() {
        let http = mock_http(1, FetchResult::NotModified, vec![no_op_changes()]);
        *http.events_outcomes.lock().unwrap() =
            vec![EventsOutcome::Unauthorized, EventsOutcome::Unauthorized];
        let engine = SyncEngine::new(http, Store::open_in_memory().unwrap());
        engine.sync().await.unwrap();
        engine.record_event("save", Some("work_1"), None, None).unwrap();

        assert!(engine.flush_events().await.is_err());

        assert_eq!(posted_batches(&engine).len(), 2);
        assert_eq!(pending_event_count(&engine), 1);
    }

    #[tokio::test]
    async fn rejected_batch_is_dropped_whole_and_reported() {
        let http = mock_http(1, FetchResult::NotModified, vec![no_op_changes()]);
        *http.events_outcomes.lock().unwrap() = vec![EventsOutcome::Rejected];
        let engine = SyncEngine::new(http, Store::open_in_memory().unwrap());
        engine.sync().await.unwrap();
        engine.record_event("open", Some("work_1"), None, None).unwrap();
        engine
            .record_event("download", Some("work_1"), Some("ed_1"), None)
            .unwrap();

        assert!(matches!(
            engine.flush_events().await,
            Err(SyncError::Protocol(_))
        ));

        assert_eq!(pending_event_count(&engine), 0);
        engine.flush_events().await.unwrap();
        assert_eq!(posted_batches(&engine), vec![("tok-1".to_string(), 2)]);
    }

    #[tokio::test]
    async fn flush_without_a_stored_token_bootstraps_for_one_first() {
        let engine = SyncEngine::new(
            mock_http(1, FetchResult::NotModified, vec![no_op_changes()]),
            Store::open_in_memory().unwrap(),
        );
        engine.record_event("open", Some("work_1"), None, None).unwrap();

        engine.flush_events().await.unwrap();

        assert_eq!(posted_batches(&engine), vec![("tok-1".to_string(), 1)]);
        assert_eq!(engine.http.counts.lock().unwrap().changes, 0);
    }

    #[tokio::test]
    async fn sync_flushes_pending_events_after_the_catalog_work() {
        let engine = SyncEngine::new(
            mock_http(1, FetchResult::NotModified, vec![no_op_changes()]),
            Store::open_in_memory().unwrap(),
        );
        engine.record_event("open", Some("work_1"), None, None).unwrap();

        engine.sync().await.unwrap();

        assert_eq!(posted_batches(&engine), vec![("tok-1".to_string(), 1)]);
        assert_eq!(pending_event_count(&engine), 0);
    }

    fn seed_version_4_mirror(store: &mut Store) {
        store
            .replace_shelves(&[shelf_with_works("old-shelf", &["work_old"])])
            .unwrap();
        store
            .upsert_work_detail("work_old", &sample_work_detail("work_old"), "etag-old")
            .unwrap();
        store.set_meta(META_CATALOG_VERSION, "4").unwrap();
        store.set_meta(META_CHANGE_CURSOR, "4").unwrap();
        store.set_meta(META_INSTALL_TOKEN, "tok-old").unwrap();
    }

    #[tokio::test]
    async fn catalog_version_below_the_stored_until_resets_to_the_fresh_install_path() {
        let mut store = Store::open_in_memory().unwrap();
        seed_version_4_mirror(&mut store);
        let explore = FetchResult::Fresh {
            body: ExploreResponse {
                shelves: vec![shelf_with_works("new-shelf", &["work_new"])],
            },
            etag: Some("etag-new".to_string()),
        };
        let compacted = ChangesResponse {
            since: 0,
            until: 1,
            compacted: true,
            ops: vec![],
            next_cursor: None,
        };
        let engine = SyncEngine::new(mock_http(1, explore, vec![compacted]), store);

        engine.sync().await.unwrap();

        assert_eq!(changes_calls(&engine), vec![(0, None)]);
        assert_eq!(
            engine.http.counts.lock().unwrap().work_detail,
            0,
            "held works from the old catalog must not be revalidated"
        );
        assert!(engine.get_work_detail("work_old").unwrap().is_none());
        let shelves = engine.get_explore().unwrap();
        let ids: Vec<&str> = shelves.iter().map(|shelf| shelf.id.as_str()).collect();
        assert_eq!(ids, vec!["new-shelf"]);
        assert_eq!(
            stored_meta(&engine, META_CHANGE_CURSOR).as_deref(),
            Some("1")
        );
        assert_eq!(
            stored_meta(&engine, META_CATALOG_VERSION).as_deref(),
            Some("1")
        );
    }

    #[tokio::test]
    async fn mirror_keyed_to_another_api_base_is_reset_when_the_engine_opens() {
        let mut store = Store::open_in_memory().unwrap();
        seed_version_4_mirror(&mut store);
        store.set_meta(META_API_BASE, "http://127.0.0.1:8080").unwrap();
        store.enqueue_event("{}").unwrap();

        let engine = SyncEngine::for_api_base(
            mock_http(1, FetchResult::NotModified, vec![no_op_changes()]),
            store,
            "https://api.ampleread.com",
        )
        .unwrap();

        assert!(engine.get_explore().unwrap().is_empty());
        assert!(engine.get_work_detail("work_old").unwrap().is_none());
        assert_eq!(stored_meta(&engine, META_CATALOG_VERSION), None);
        assert_eq!(stored_meta(&engine, META_CHANGE_CURSOR), None);
        assert_eq!(
            stored_meta(&engine, META_INSTALL_TOKEN),
            None,
            "an install token belongs to the server that minted it"
        );
        assert_eq!(pending_event_count(&engine), 0);
        assert_eq!(
            stored_meta(&engine, META_API_BASE).as_deref(),
            Some("https://api.ampleread.com")
        );

        engine.sync().await.unwrap();
        assert_eq!(changes_calls(&engine), vec![(0, None)]);
    }

    #[tokio::test]
    async fn mirror_keyed_to_the_same_api_base_is_kept() {
        let mut store = Store::open_in_memory().unwrap();
        seed_version_4_mirror(&mut store);
        store.set_meta(META_API_BASE, "https://api.ampleread.com").unwrap();

        let engine = SyncEngine::for_api_base(
            mock_http(4, FetchResult::NotModified, vec![no_op_changes()]),
            store,
            "https://api.ampleread.com",
        )
        .unwrap();

        assert_eq!(engine.get_explore().unwrap().len(), 1);
        assert_eq!(
            stored_meta(&engine, META_INSTALL_TOKEN).as_deref(),
            Some("tok-old")
        );
    }

    #[tokio::test]
    async fn revalidation_404_drops_that_work_and_the_cascade_continues() {
        let mut store = Store::open_in_memory().unwrap();
        store
            .upsert_work_detail("work-1", &sample_work_detail("work-1"), "etag-1")
            .unwrap();
        store
            .upsert_work_detail("work-2", &sample_work_detail("work-2"), "etag-1")
            .unwrap();
        store.set_meta(META_CATALOG_VERSION, "1").unwrap();
        let mut http = mock_http(2, FetchResult::NotModified, vec![no_op_changes()]);
        http.work_detail
            .insert("work-1".to_string(), FetchResult::NotFound);
        http.work_detail.insert(
            "work-2".to_string(),
            FetchResult::Fresh {
                body: sample_work_detail("work-2"),
                etag: Some("etag-2".to_string()),
            },
        );
        let engine = SyncEngine::new(http, store);

        engine.sync().await.unwrap();

        assert!(engine.get_work_detail("work-1").unwrap().is_none());
        let kept = {
            let store = engine.store.lock().unwrap();
            store.get_work_detail("work-2").unwrap().unwrap()
        };
        assert_eq!(kept.etag, "etag-2");
        assert_eq!(
            stored_meta(&engine, META_CATALOG_VERSION).as_deref(),
            Some("2"),
            "the version must advance once the cascade finishes"
        );
    }

    #[tokio::test]
    async fn first_time_fetch_of_a_missing_work_reports_not_found() {
        let mut http = mock_http(1, FetchResult::NotModified, vec![no_op_changes()]);
        http.work_detail
            .insert("work-1".to_string(), FetchResult::NotFound);
        let engine = SyncEngine::new(http, Store::open_in_memory().unwrap());

        let result = engine.refresh("work:work-1").await;

        assert!(matches!(result, Err(SyncError::NotFound(_))));
        assert!(engine.get_work_detail("work-1").unwrap().is_none());
    }

    #[tokio::test]
    async fn download_sends_the_install_header() {
        let mut store = Store::open_in_memory().unwrap();
        store
            .upsert_work_detail("work-1", &detail_with_epub("work-1", "as_1"), "etag-1")
            .unwrap();
        let mut http = mock_http(1, FetchResult::NotModified, vec![no_op_changes()]);
        http.downloads.insert(
            "as_1".to_string(),
            DownloadResolution::Redirect("https://files.example/1.epub".to_string()),
        );
        let engine = SyncEngine::new(http, store);
        engine.sync().await.unwrap();

        let url = engine.download_url("work-1", "as_1").await.unwrap();

        assert_eq!(url, "https://files.example/1.epub");
        assert_eq!(
            download_calls(&engine),
            vec![("as_1".to_string(), Some("tok-1".to_string()))]
        );
        assert_eq!(
            engine.http.counts.lock().unwrap().bootstrap,
            1,
            "the token from the sync's bootstrap is reused, not re-minted"
        );
    }

    #[tokio::test]
    async fn download_404_refetches_the_edition_list_and_retries_with_the_replacement() {
        let mut store = Store::open_in_memory().unwrap();
        store
            .upsert_work_detail("work-1", &detail_with_epub("work-1", "as_1"), "etag-1")
            .unwrap();
        let mut http = mock_http(1, FetchResult::NotModified, vec![no_op_changes()]);
        http.downloads.insert(
            "as_2".to_string(),
            DownloadResolution::Redirect("https://files.example/2.epub".to_string()),
        );
        http.work_detail.insert(
            "work-1".to_string(),
            FetchResult::Fresh {
                body: detail_with_epub("work-1", "as_2"),
                etag: Some("etag-2".to_string()),
            },
        );
        let engine = SyncEngine::new(http, store);

        let url = engine.download_url("work-1", "as_1").await.unwrap();

        assert_eq!(url, "https://files.example/2.epub");
        let ids: Vec<String> = download_calls(&engine).into_iter().map(|c| c.0).collect();
        assert_eq!(ids, vec!["as_1", "as_2"]);
        assert_eq!(engine.http.counts.lock().unwrap().work_detail, 1);
        let detail = engine.get_work_detail("work-1").unwrap().unwrap();
        assert_eq!(detail.editions[0].assets[0].id, "as_2");
    }

    #[tokio::test]
    async fn download_404_without_a_replacement_reports_not_found() {
        let mut store = Store::open_in_memory().unwrap();
        store
            .upsert_work_detail("work-1", &detail_with_epub("work-1", "as_1"), "etag-1")
            .unwrap();
        let mut http = mock_http(1, FetchResult::NotModified, vec![no_op_changes()]);
        let mut withdrawn = detail_with_epub("work-1", "as_1");
        withdrawn.editions[0].assets.clear();
        http.work_detail.insert(
            "work-1".to_string(),
            FetchResult::Fresh {
                body: withdrawn,
                etag: Some("etag-2".to_string()),
            },
        );
        let engine = SyncEngine::new(http, store);

        let result = engine.download_url("work-1", "as_1").await;

        assert!(matches!(result, Err(SyncError::NotFound(_))));
        assert_eq!(download_calls(&engine).len(), 1);
        let detail = engine.get_work_detail("work-1").unwrap().unwrap();
        assert!(detail.editions[0].assets.is_empty());
    }

    #[tokio::test]
    async fn unchanged_catalog_version_short_circuits() {
        let store = Store::open_in_memory().unwrap();
        store.set_meta(META_CATALOG_VERSION, "7").unwrap();

        let http = MockHttp {
            bootstrap: sample_bootstrap(7),
            explore: FetchResult::NotModified,
            work_detail: HashMap::new(),
            changes: vec![no_op_changes()],
            ..mock_parts()
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
            changes: vec![no_op_changes()],
            ..mock_parts()
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
        store.replace_shelves(&[sample_shelf("shelf-a")]).unwrap();
        store
            .set_sync_state(SCOPE_EXPLORE, Some("etag-original"), 100, 0)
            .unwrap();
        store.set_meta(META_CATALOG_VERSION, "1").unwrap();

        let http = MockHttp {
            bootstrap: sample_bootstrap(2),
            explore: FetchResult::NotModified,
            work_detail: HashMap::new(),
            changes: vec![no_op_changes()],
            ..mock_parts()
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
            changes: vec![no_op_changes()],
            ..mock_parts()
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
        store.replace_shelves(&[sample_shelf("shelf-a")]).unwrap();
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
            changes: vec![ChangesResponse {
                since: 0,
                until: 2,
                compacted: true,
                ops: vec![ChangeOp {
                    entity_type: "shelf".to_string(),
                    entity_id: "shelf-a".to_string(),
                    op: "remove".to_string(),
                }],
                next_cursor: None,
            }],
            ..mock_parts()
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
            changes: vec![no_op_changes()],
            ..mock_parts()
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
            changes: vec![no_op_changes()],
            ..mock_parts()
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
            changes: vec![no_op_changes()],
            ..mock_parts()
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
            changes: vec![no_op_changes()],
            ..mock_parts()
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

    #[tokio::test]
    async fn fresh_install_compacted_empty_ops_populates_mirror_and_adopts_until() {
        let store = Store::open_in_memory().unwrap();
        let compacted = ChangesResponse {
            since: 0,
            until: 3,
            compacted: true,
            ops: vec![],
            next_cursor: None,
        };
        let explore = FetchResult::Fresh {
            body: ExploreResponse {
                shelves: vec![sample_shelf("essential-classics")],
            },
            etag: Some("etag-explore".to_string()),
        };
        let engine = SyncEngine::new(mock_http(3, explore, vec![compacted]), store);

        engine.sync().await.unwrap();

        assert_eq!(changes_calls(&engine), vec![(0, None)]);
        let shelves = engine.get_explore().unwrap();
        assert_eq!(
            shelves.len(),
            1,
            "compacted + empty ops must still full-fetch"
        );
        assert_eq!(shelves[0].items.len(), 1);
        assert_eq!(
            stored_meta(&engine, META_CHANGE_CURSOR).as_deref(),
            Some("3")
        );
        assert_eq!(
            stored_meta(&engine, META_CATALOG_VERSION).as_deref(),
            Some("3")
        );
    }

    #[tokio::test]
    async fn v3_shaped_delta_refreshes_a_held_work_to_its_zero_asset_edition() {
        let mut store = Store::open_in_memory().unwrap();
        store
            .replace_shelves(&[shelf_with_works("shelf-a", &["work-1"])])
            .unwrap();
        store
            .upsert_work_detail("work-1", &detail_with_assets("work-1", 2), "etag-1")
            .unwrap();
        store.set_meta(META_CATALOG_VERSION, "2").unwrap();
        store.set_meta(META_CHANGE_CURSOR, "2").unwrap();

        let pages = vec![
            changes_page(
                3,
                vec![
                    change_op("edition", "ed_a", "upsert"),
                    change_op("edition", "ed_b", "upsert"),
                ],
                Some("c1"),
            ),
            changes_page(
                3,
                vec![
                    change_op("work", "work-1", "upsert"),
                    change_op("work", "work-9", "upsert"),
                ],
                None,
            ),
        ];
        let mut http = mock_http(3, FetchResult::NotModified, pages);
        http.work_detail.insert(
            "work-1".to_string(),
            FetchResult::Fresh {
                body: detail_with_assets("work-1", 0),
                etag: Some("etag-2".to_string()),
            },
        );
        let engine = SyncEngine::new(http, store);

        engine.sync().await.unwrap();

        assert_eq!(changes_calls(&engine).len(), 2);
        let detail = engine.get_work_detail("work-1").unwrap().unwrap();
        assert_eq!(detail.editions.len(), 1);
        assert!(detail.editions[0].assets.is_empty());
        let explore = engine.get_explore().unwrap();
        assert_eq!(
            explore[0].items.len(),
            1,
            "an upsert must not drop the work"
        );
        assert_eq!(
            stored_meta(&engine, META_CHANGE_CURSOR).as_deref(),
            Some("3")
        );
    }

    #[tokio::test]
    async fn explore_revalidation_drops_shelves_the_server_no_longer_returns() {
        let mut store = Store::open_in_memory().unwrap();
        store
            .replace_shelves(&[
                shelf_with_works("essential-classics", &["work-1"]),
                shelf_with_works("new-arrivals", &["work-2"]),
            ])
            .unwrap();
        store.set_meta(META_CATALOG_VERSION, "1").unwrap();

        let explore = FetchResult::Fresh {
            body: ExploreResponse {
                shelves: vec![shelf_with_works("new-arrivals", &["work-2", "work-3"])],
            },
            etag: Some("etag-2".to_string()),
        };
        let engine = SyncEngine::new(mock_http(2, explore, vec![no_op_changes()]), store);

        engine.sync().await.unwrap();

        let shelves = engine.get_explore().unwrap();
        let ids: Vec<&str> = shelves.iter().map(|shelf| shelf.id.as_str()).collect();
        assert_eq!(ids, vec!["new-arrivals"]);
        assert_eq!(shelves[0].items.len(), 2);
    }

    #[tokio::test]
    async fn stored_since_is_not_advanced_while_next_cursor_is_some() {
        let store = Store::open_in_memory().unwrap();
        store.set_meta(META_CATALOG_VERSION, "2").unwrap();
        store.set_meta(META_CHANGE_CURSOR, "2").unwrap();

        let first_page = changes_page(3, vec![], Some("c1"));
        let engine = SyncEngine::new(
            mock_http(3, FetchResult::NotModified, vec![first_page]),
            store,
        );

        let result = engine.sync().await;

        assert_eq!(
            stored_meta(&engine, META_CHANGE_CURSOR).as_deref(),
            Some("2"),
            "since must not move to until while a page is still pending"
        );
        assert_eq!(
            stored_meta(&engine, META_CATALOG_VERSION).as_deref(),
            Some("2")
        );
        assert!(result.is_err());
        assert_eq!(
            changes_calls(&engine),
            vec![(2, None), (2, Some("c1".to_string()))]
        );
    }

    #[tokio::test]
    async fn paginated_changes_keep_since_fixed_and_apply_every_page() {
        let mut store = Store::open_in_memory().unwrap();
        store
            .replace_shelves(&[shelf_with_works("shelf-a", &["work-1", "work-2", "work-3"])])
            .unwrap();
        store.set_meta(META_CATALOG_VERSION, "2").unwrap();
        store.set_meta(META_CHANGE_CURSOR, "2").unwrap();

        let pages = vec![
            changes_page(3, vec![change_op("work", "work-1", "remove")], Some("c1")),
            changes_page(3, vec![change_op("work", "work-2", "remove")], Some("c2")),
            changes_page(3, vec![change_op("work", "work-3", "remove")], None),
        ];
        let engine = SyncEngine::new(mock_http(3, FetchResult::NotModified, pages), store);

        engine.sync().await.unwrap();

        assert_eq!(
            changes_calls(&engine),
            vec![
                (2, None),
                (2, Some("c1".to_string())),
                (2, Some("c2".to_string())),
            ]
        );
        let explore = engine.get_explore().unwrap();
        assert_eq!(
            explore[0].items.len(),
            0,
            "ops from every page must be applied"
        );
        assert_eq!(
            stored_meta(&engine, META_CHANGE_CURSOR).as_deref(),
            Some("3")
        );
        assert_eq!(
            stored_meta(&engine, META_CATALOG_VERSION).as_deref(),
            Some("3")
        );
    }

    #[tokio::test]
    async fn changes_window_aborts_when_the_cursor_does_not_advance() {
        let store = Store::open_in_memory().unwrap();
        store.set_meta(META_CATALOG_VERSION, "2").unwrap();
        store.set_meta(META_CHANGE_CURSOR, "2").unwrap();

        let pages = vec![
            changes_page(3, vec![], Some("c1")),
            changes_page(3, vec![], Some("c1")),
            changes_page(3, vec![], Some("c1")),
        ];
        let engine = SyncEngine::new(mock_http(3, FetchResult::NotModified, pages), store);

        let result = engine.sync().await;

        assert!(result.is_err());
        assert_eq!(changes_calls(&engine).len(), 2);
        assert_eq!(
            stored_meta(&engine, META_CHANGE_CURSOR).as_deref(),
            Some("2")
        );
        assert!(
            engine.try_acquire(SCOPE_CHANGES).is_some(),
            "the in-flight guard must be released after the abort"
        );
    }

    struct RecordedPage {
        since: i64,
        cursor: Option<String>,
        ops: usize,
        compacted: bool,
        until: i64,
        next_cursor: Option<String>,
    }

    struct RecordingHttp<H: CatalogHttp> {
        inner: H,
        catalog_version: StdMutex<Option<i64>>,
        pages: StdMutex<Vec<RecordedPage>>,
        work_upserts: StdMutex<Vec<String>>,
    }

    impl<H: CatalogHttp> CatalogHttp for RecordingHttp<H> {
        async fn get_bootstrap(
            &self,
            install_token: Option<&str>,
        ) -> Result<BootstrapResponse, SyncError> {
            let response = self.inner.get_bootstrap(install_token).await?;
            *self.catalog_version.lock().unwrap() = Some(response.catalog_version);
            Ok(response)
        }

        async fn get_explore(
            &self,
            etag: Option<&str>,
        ) -> Result<FetchResult<ExploreResponse>, SyncError> {
            self.inner.get_explore(etag).await
        }

        async fn get_work_detail(
            &self,
            id: &str,
            etag: Option<&str>,
            territory: Option<&str>,
        ) -> Result<FetchResult<WorkDetail>, SyncError> {
            self.inner.get_work_detail(id, etag, territory).await
        }

        async fn get_changes(
            &self,
            since: i64,
            cursor: Option<&str>,
        ) -> Result<ChangesResponse, SyncError> {
            let page = self.inner.get_changes(since, cursor).await?;
            self.pages.lock().unwrap().push(RecordedPage {
                since,
                cursor: cursor.map(str::to_string),
                ops: page.ops.len(),
                compacted: page.compacted,
                until: page.until,
                next_cursor: page.next_cursor.clone(),
            });
            self.work_upserts.lock().unwrap().extend(
                page.ops
                    .iter()
                    .filter(|op| op.entity_type == "work" && op.op == "upsert")
                    .map(|op| op.entity_id.clone()),
            );
            Ok(page)
        }

        async fn post_events(
            &self,
            install_token: &str,
            batch: &EventBatch,
        ) -> Result<EventsOutcome, SyncError> {
            self.inner.post_events(install_token, batch).await
        }

        async fn resolve_download(
            &self,
            asset_id: &str,
            install_token: Option<&str>,
        ) -> Result<DownloadResolution, SyncError> {
            self.inner.resolve_download(asset_id, install_token).await
        }
    }

    fn live_engine() -> Option<SyncEngine<RecordingHttp<ReqwestCatalogHttp>>> {
        let base = std::env::var("AMPLEREAD_LIVE_API_BASE")
            .ok()
            .filter(|base| !base.is_empty())?;
        let http = RecordingHttp {
            inner: ReqwestCatalogHttp::new(base),
            catalog_version: StdMutex::new(None),
            pages: StdMutex::new(Vec::new()),
            work_upserts: StdMutex::new(Vec::new()),
        };
        Some(SyncEngine::new(http, Store::open_in_memory().unwrap()))
    }

    fn live_engine_at_version_2() -> Option<SyncEngine<RecordingHttp<ReqwestCatalogHttp>>> {
        let engine = live_engine()?;
        {
            let store = engine.store.lock().unwrap();
            store.set_meta(META_CATALOG_VERSION, "2").unwrap();
            store.set_meta(META_CHANGE_CURSOR, "2").unwrap();
        }
        Some(engine)
    }

    const LIVE_SKIP: &str = "skipped: set AMPLEREAD_LIVE_API_BASE to run against a backend";

    #[tokio::test]
    async fn live_v2_client_pages_through_the_staged_v3_delta() {
        let Some(engine) = live_engine_at_version_2() else {
            eprintln!("{LIVE_SKIP}");
            return;
        };

        engine.sync().await.unwrap();

        let catalog_version = engine.http.catalog_version.lock().unwrap().unwrap();
        assert_eq!(
            catalog_version, 3,
            "the staged v3 delta is the fixture; backend reports {catalog_version}"
        );
        let pages = engine.http.pages.lock().unwrap();
        let shape: Vec<(i64, usize, bool)> = pages
            .iter()
            .map(|page| (page.since, page.ops, page.next_cursor.is_some()))
            .collect();
        assert_eq!(
            shape,
            vec![(2, 1000, true), (2, 1000, true), (2, 228, false)]
        );
        assert_eq!(pages[0].cursor, None);
        assert_eq!(pages[1].cursor, pages[0].next_cursor);
        assert_eq!(pages[2].cursor, pages[1].next_cursor);
        assert!(pages.iter().all(|page| page.until == 3 && !page.compacted));
        drop(pages);
        assert_eq!(
            stored_meta(&engine, META_CHANGE_CURSOR).as_deref(),
            Some("3")
        );
        assert_eq!(
            stored_meta(&engine, META_CATALOG_VERSION).as_deref(),
            Some("3")
        );
    }

    #[tokio::test]
    async fn live_purged_audio_parent_reads_back_with_a_zero_asset_edition() {
        let Some(engine) = live_engine_at_version_2() else {
            eprintln!("{LIVE_SKIP}");
            return;
        };
        engine.sync().await.unwrap();
        let work_id = engine
            .http
            .work_upserts
            .lock()
            .unwrap()
            .first()
            .cloned()
            .expect("the v3 delta carries one work upsert per purged audio edition");

        engine.refresh(&format!("work:{work_id}")).await.unwrap();

        let detail = engine.get_work_detail(&work_id).unwrap().unwrap();
        let audio = detail
            .editions
            .iter()
            .find(|edition| edition.media_type == "audio")
            .expect("the purged audio edition stays published");
        assert!(audio.assets.is_empty());
    }

    #[tokio::test]
    async fn live_fresh_install_full_fetches_after_a_compacted_reply() {
        let Some(engine) = live_engine() else {
            eprintln!("{LIVE_SKIP}");
            return;
        };

        engine.sync().await.unwrap();

        let catalog_version = engine.http.catalog_version.lock().unwrap().unwrap();
        assert!(catalog_version >= 3);
        let pages = engine.http.pages.lock().unwrap();
        assert_eq!(pages.len(), 1);
        assert_eq!(
            (
                pages[0].since,
                pages[0].ops,
                pages[0].compacted,
                pages[0].next_cursor.is_none()
            ),
            (0, 0, true, true)
        );
        drop(pages);
        let shelves = engine.get_explore().unwrap();
        assert!(!shelves.is_empty(), "a fresh install must not end up empty");
        assert!(shelves.iter().all(|shelf| !shelf.items.is_empty()));
        assert_eq!(
            stored_meta(&engine, META_CHANGE_CURSOR),
            Some(catalog_version.to_string())
        );
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
