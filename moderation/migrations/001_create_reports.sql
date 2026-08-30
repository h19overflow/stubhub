CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  reporter_user_id TEXT NOT NULL,
  reported_user_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'upheld', 'cleared')),
  reported_user_email_at_report TEXT NOT NULL
    CHECK (length(trim(reported_user_email_at_report)) > 0),
  order_status_at_report TEXT NOT NULL
    CHECK (order_status_at_report = 'complete'),
  ticket_id_at_report TEXT NOT NULL,
  ticket_event_name_at_report TEXT NOT NULL
    CHECK (length(trim(ticket_event_name_at_report)) > 0),
  ticket_description_at_report TEXT NOT NULL
    CHECK (length(trim(ticket_description_at_report)) > 0),
  ticket_event_starts_at_report TEXT NOT NULL,
  ticket_event_ends_at_report TEXT,
  ticket_place_at_report TEXT NOT NULL
    CHECK (length(trim(ticket_place_at_report)) > 0),
  ticket_info_at_report TEXT NOT NULL
    CHECK (length(trim(ticket_info_at_report)) > 0),
  decision_reason TEXT,
  resolved_by_user_id TEXT,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (reporter_user_id, idempotency_key),
  CHECK (
    (status = 'submitted'
      AND decision_reason IS NULL
      AND resolved_by_user_id IS NULL
      AND resolved_at IS NULL)
    OR
    (status IN ('upheld', 'cleared')
      AND decision_reason IS NOT NULL
      AND length(trim(decision_reason)) BETWEEN 1 AND 2000
      AND resolved_by_user_id IS NOT NULL
      AND resolved_at IS NOT NULL)
  )
) STRICT;

CREATE INDEX reports_reported_user_newest
  ON reports(reported_user_id, created_at DESC, id DESC);

CREATE INDEX reports_newest
  ON reports(created_at DESC, id DESC);
