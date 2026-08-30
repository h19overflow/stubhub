import { useCallback, useRef, useState } from "react";
import { resolveReport } from "../../lib/api/moderation/commands";
import type { ResolveReportInput, ResolveReportResult } from "../../lib/api/moderation/types";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; result: ResolveReportResult }
  | { status: "error"; message: string };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The moderation decision could not be recorded";
}

export function useResolveReport() {
  const [state, setState] = useState<State>({ status: "idle" });
  const request = useRef(0);

  async function resolve(
    reportId: string,
    input: ResolveReportInput,
  ): Promise<ResolveReportResult | undefined> {
    const requestId = request.current + 1;
    request.current = requestId;
    setState({ status: "pending" });

    try {
      const result = await resolveReport(reportId, input);
      if (request.current !== requestId) return undefined;
      setState({ status: "success", result });
      return result;
    } catch (error) {
      if (request.current !== requestId) return undefined;
      setState({ status: "error", message: errorMessage(error) });
      return undefined;
    }
  }

  const reset = useCallback(() => {
    request.current += 1;
    setState({ status: "idle" });
  }, []);

  return { reset, resolve, state };
}
