ALTER TABLE public.replicas
  DROP CONSTRAINT IF EXISTS replicas_kind_allowlist,
  ADD CONSTRAINT replicas_kind_allowlist
    CHECK (kind IN ('dictionary', 'font', 'texture', 'opds_catalog', 'abs_server', 'settings', 'bookshelf', 'custom_translator', 'translation_prompt', 'custom_tts', 'mindmap')) NOT VALID;

ALTER TABLE public.replicas VALIDATE CONSTRAINT replicas_kind_allowlist;
