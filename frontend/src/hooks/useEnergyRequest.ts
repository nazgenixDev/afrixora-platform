"use client";

import { useCallback, useEffect, useState } from "react";
import { isAxiosError } from "axios";
import api from "@/lib/api";

type RequestState<T> =
  | { status: "loading" | "idle" | "error" | "denied" }
  | { status: "ready"; data: T };

export function useEnergyRequest<T>(load: ((signal: AbortSignal) => Promise<T>) | null) {
  const [state, setState] = useState<{ load: typeof load; revision: number; result: RequestState<T> } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!load) return;
    const controller = new AbortController();
    load(controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ load, revision, result: { status: "ready", data } });
    }).catch(error => {
      if (controller.signal.aborted) return;
      const denied = isAxiosError(error) && error.response?.status === 403;
      setState({ load, revision, result: { status: denied ? "denied" : "error" } });
    });
    return () => controller.abort();
  }, [load, revision]);
  const result: RequestState<T> = state && state.load === load && state.revision === revision
    ? state.result : { status: load ? "loading" : "idle" };
  return { result, reload: () => setRevision(value => value + 1) };
}

export function useEnergyQuery<T>(path: string | null, query = "") {
  const load = useCallback(async (signal: AbortSignal) =>
    (await api.get<T>(path!, { params: new URLSearchParams(query), signal })).data, [path, query]);
  return useEnergyRequest(path ? load : null);
}
