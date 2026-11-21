"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import logger from "@/lib/logger";
import type { Building, PaginatedResponse } from "@/types";

type BuildingsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; buildings: Building[]; savedBuildingId: string | null };

export function useDashboardBuildings() {
  const [state, setState] = useState<BuildingsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadBuildings() {
      try {
        const buildings: Building[] = [];
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
          const { data } = await api.get<PaginatedResponse<Building>>("/api/v1/buildings", {
            params: { page, limit: 100 },
            signal: controller.signal,
          });
          buildings.push(...data.data);
          totalPages = data.totalPages;
          page += 1;
        }

        if (!controller.signal.aborted) {
          setState({
            status: "ready",
            buildings,
            savedBuildingId: localStorage.getItem("afrixora_selected_building"),
          });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        logger.error("Erreur de chargement des bâtiments", error);
        setState({ status: "error" });
      }
    }

    void loadBuildings();
    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setState({ status: "loading" });
    setAttempt(previous => previous + 1);
  }

  return { state, retry };
}
