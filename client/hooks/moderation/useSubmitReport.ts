import { useCallback, useRef, useState } from "react";
import { submitReport } from "../../lib/api/moderation/commands";
import type { Report, SubmitReportInput } from "../../lib/api/moderation/types";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; report: Report }
  | { status: "error"; message: string };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The report could not be submitted";
}

// One logical report attempt keeps one key, including a user-triggered retry.
export function useSubmitReport() {
  const [state, setState] = useState<State>({ status: "idle" });
  const key = useRef<string | null>(null);
  const request = useRef(0);

  async function submit(input: SubmitReportInput) {
    const idempotencyKey = key.current ?? (key.current = crypto.randomUUID());
    const requestId = request.current + 1;
    request.current = requestId;
    setState({ status: "pending" });

    try {
      const report = await submitReport(input, idempotencyKey);
      if (request.current !== requestId) return;
      setState({ status: "success", report });
    } catch (error) {
      if (request.current !== requestId) return;
      setState({ status: "error", message: errorMessage(error) });
    }
  }

  const reset = useCallback(() => {
    request.current += 1;
    key.current = null;
    setState({ status: "idle" });
  }, []);

  return { reset, state, submit };
}
