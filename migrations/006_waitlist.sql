-- Normascope Cloud waitlist (docs/normascopeWeb.md §11). The only conversion
-- mechanism on the public site.
--
-- Deliberately standalone: no org_id, no foreign keys. A signup happens before
-- an org exists, and coupling it to the tenancy tables would mean inventing an
-- org for every curious visitor. When someone is onboarded for real, the org is
-- created then and this row is just provenance.
--
-- email is UNIQUE so a repeat signup is an upsert, never a duplicate — and the
-- API reports success either way, so the endpoint cannot be used to test
-- whether an address is already on the list.
CREATE TABLE waitlist (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  source      TEXT,           -- which surface it came from (home, cloud, footer, nav)
  referrer    TEXT,           -- document.referrer, truncated; never a query string
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX waitlist_created ON waitlist (created_at DESC);
