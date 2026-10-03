-- Migration 024: Extend the replicas.kind allowlist with 'mindmap'.
-- Deploy this migration before the server code that accepts the mindmap kind.
-- The list must stay the union of every kind upstream allows (023 added
-- 'abs_server' and 'bookshelf'); a later migration that redefines the CHECK
-- must keep 'mindmap' or mind map pushes are rejected.
ALTER TABLE public.replicas
  DROP CONSTRAINT IF EXISTS replicas_kind_allowlist,
  ADD CONSTRAINT replicas_kind_allowlist
    CHECK (kind IN ('dictionary', 'font', 'texture', 'opds_catalog', 'abs_server', 'settings', 'bookshelf', 'mindmap')) NOT VALID;

-- The migration runner commits the metadata change above before this scan,
-- allowing normal reads and writes while existing rows are validated.
ALTER TABLE public.replicas VALIDATE CONSTRAINT replicas_kind_allowlist;
