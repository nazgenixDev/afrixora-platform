"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import useStore from "@/store";

interface SubscriptionInfo {
  plan: string;
  status: string;
  endsAt: string | null;
  limits: {
    maxDevices: number;
    maxAutomations: number;
    hasApi: boolean;
    hasExport: boolean;
    sla: string;
  };
  usage: {
    devices: number;
    automations: number;
  };
}

export default function SubscriptionPage() {
  const user = useStore((state) => state.user);
  const [data, setData] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.tenantId) return;
    api.get(`/api/v1/tenants/${user.tenantId}/subscription`)
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || "Erreur de chargement"))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <div>Chargement...</div>;
  if (error) return <div className="text-red-500">Erreur: {error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Abonnement</h1>
      <div className="bg-card rounded-lg p-6 shadow">
        <div className="grid gap-4">
          <div><span className="font-semibold">Plan :</span> {data.plan}</div>
          <div><span className="font-semibold">Statut :</span> {data.status}</div>
          {data.endsAt && <div><span className="font-semibold">Expire le :</span> {new Date(data.endsAt).toLocaleDateString()}</div>}
          <div><span className="font-semibold">Limites :</span></div>
          <ul className="list-disc list-inside ml-4">
            <li>Appareils : {data.usage.devices} / {data.limits.maxDevices === Infinity ? "∞" : data.limits.maxDevices}</li>
            <li>Automatisations : {data.usage.automations} / {data.limits.maxAutomations === Infinity ? "∞" : data.limits.maxAutomations}</li>
            <li>API : {data.limits.hasApi ? "Oui" : "Non"}</li>
            <li>Export : {data.limits.hasExport ? "Oui" : "Non"}</li>
            <li>SLA : {data.limits.sla}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
