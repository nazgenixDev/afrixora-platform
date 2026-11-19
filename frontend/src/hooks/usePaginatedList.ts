"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import type { PaginatedResponse } from "@/types";

export function usePaginatedList<T>(endpoint: string, filters = "") {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PaginatedResponse<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(filters);
    params.set("page", String(page));
    setLoading(true);
    setError(false);

    api.get<PaginatedResponse<T>>(endpoint, { params, signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        const lastPage = Math.max(1, data.totalPages);
        if (data.page > lastPage) {
          setPage(lastPage);
          return;
        }
        setResult(data);
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
        setLoading(false);
      });

    return () => controller.abort();
  }, [endpoint, filters, page, revision]);

  return {
    result,
    loading,
    error,
    setPage,
    reload: () => setRevision(value => value + 1),
    updateItems: (update: (items: T[]) => T[]) =>
      setResult(previous => previous && { ...previous, data: update(previous.data) }),
  };
}
