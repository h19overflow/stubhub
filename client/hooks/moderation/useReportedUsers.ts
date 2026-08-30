import { useCallback, useEffect, useState } from "react";
import { listReportedUsers } from "../../lib/api/moderation/queries";
import type { ReportedUsersResponse } from "../../lib/api/moderation/types";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ReportedUsersResponse };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Moderation is temporarily unavailable";
}

export function useReportedUsers() {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", data: await listReportedUsers() });
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { load, state };
}
