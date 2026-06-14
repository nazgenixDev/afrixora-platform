"use client";

import { useState, useEffect } from "react";
import api from "@/lib/api";
import useStore from "@/store";

export type PlanLimits = {
  maxDevices: number;
  maxAutomations: number;
  hasApi: boolean;
  hasExport: boolean;
  sla: string;
};

export function useSubscriptionLimits() {
  const user = useStore((state) => state.user);
  const [limits, setLimits] = useState<PlanLimits | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.tenantId) {
      setLoading(false);
      return;
    }

    api
      .get("/api/v1/tenants/current/subscription")
      .then((res) => {
        setLimits(res.data.limits);
      })
      .catch(() => {
        setLimits(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [user?.tenantId]);

  return { limits, loading };
}
