import { randomUUID } from "node:crypto";
import { database, withTransaction } from "../database.js";
import type { ProviderScenario } from "./payment-attempt.js";

export type ProviderResult = {
  reference: string;
  status: "processing" | "succeeded" | "declined";
  failureCode: string | null;
};

/**
 * Reads a positive integer env setting with fallback and validation.
 *
 * Flow: startup helper for LOCAL_PROVIDER_PROCESSING_MS. Throws if env is set
 * but not a safe positive integer, so misconfig fails fast.
 */
function positiveIntegerSetting(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

const processingDelayMs = positiveIntegerSetting(
  "LOCAL_PROVIDER_PROCESSING_MS",
  3_000,
);

/**
 * Runs work inside the Orders SQLite transaction helper (withTransaction).
 *
 * Flow: submit/lookup wrap their DB reads+writes here so provider state
 * transitions are atomic and survive crashes. Delegates to database.ts.
 */
function transact<T>(work: (db: typeof database) => T): T {
  return withTransaction(() => work(database));
}

/**
 * Creates or replays a local provider payment record (idempotent).
 *
 * Flow: payment-workflow submitOrderPayment() and worker reconcilePayment()
 * call this. Key is local:attemptId, fingerprint is attemptId:amount:currency:
 * scenario. If row exists checks fingerprint (conflict on mismatch) else
 * inserts with status processing (if scenario starts with local.processing-)
 * or immediate succeeded/declined. Processing rows get resolveAt = now+delay.
 * Returns {reference,status,failureCode} for resolveAttempt scheduling.
 */
function submit(
  attemptId: string,
  scenario: ProviderScenario,
  amount: number,
  currency: "USD",
  now: number,
): ProviderResult {
  return transact((db) => {
    const key = `local:${attemptId}`;
    const fingerprint = `${attemptId}:${amount}:${currency}:${scenario}`;
    const old = db
      .prepare(
        "SELECT * FROM local_provider_payments WHERE payment_attempt_id=?",
      )
      .get(attemptId) as Record<string, unknown> | undefined;
    if (old) {
      if (old.request_fingerprint !== fingerprint) {
        throw new Error("provider idempotency conflict");
      }
      return result(old);
    }

    const processing = scenario.startsWith("local.processing-");
    const planned = scenario.endsWith("success") ? "succeeded" : "declined";
    const status = processing ? "processing" : planned;
    const resolveAt = processing ? now + processingDelayMs : now;
    const failure = status === "declined" ? "card_declined" : null;
    const id = randomUUID();
    db.prepare(
      `INSERT INTO local_provider_payments(
         id,payment_attempt_id,provider_idempotency_key,request_fingerprint,
         amount_cents,currency,status,planned_terminal_outcome,resolve_at,
         failure_code,created_at,updated_at
       )
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      attemptId,
      key,
      fingerprint,
      amount,
      currency,
      status,
      planned,
      resolveAt,
      failure,
      now,
      now,
    );
    return {
      reference: id,
      status: status as ProviderResult["status"],
      failureCode: failure,
    };
  });
}

/**
 * Looks up a provider payment and advances processing -> terminal if due.
 *
 * Flow: worker reconcilePayment() calls this before submit fallback. If row
 * is processing and resolve_at <= now, updates status to planned_terminal_
 * outcome (succeeded/declined) and sets failure_code. Throws provider payment
 * missing if no row (so caller falls back to submit). Transactional.
 */
function lookup(attemptId: string, now: number): ProviderResult {
  return transact((db) => {
    const row = db
      .prepare(
        "SELECT * FROM local_provider_payments WHERE payment_attempt_id=?",
      )
      .get(attemptId) as Record<string, unknown> | undefined;
    if (!row) throw new Error("provider payment missing");

    if (row.status === "processing" && Number(row.resolve_at) <= now) {
      const status = row.planned_terminal_outcome as "succeeded" | "declined";
      const failure = status === "declined" ? "card_declined" : null;
      db.prepare(
        `UPDATE local_provider_payments
         SET status=?,failure_code=?,updated_at=?
         WHERE id=? AND status='processing'`,
      ).run(status, failure, now, String(row.id));
      row.status = status;
      row.failure_code = failure;
    }
    return result(row);
  });
}

/**
 * Maps a local_provider_payments row to the ProviderResult contract.
 *
 * Flow: helper for submit/lookup to normalize row.id/status/failure_code
 * (null stays null) into {reference,status,failureCode} used by payment-attempt
 * reconciliation.
 */
function result(row: Record<string, unknown>): ProviderResult {
  return {
    reference: String(row.id),
    status: row.status as ProviderResult["status"],
    failureCode:
      row.failure_code === null ? null : String(row.failure_code),
  };
}

export { lookup, submit };
