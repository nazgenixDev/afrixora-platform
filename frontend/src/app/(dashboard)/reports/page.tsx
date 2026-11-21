"use client";

import { isAxiosError } from "axios";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import api from "@/lib/api";
import logger from "@/lib/logger";
import useStore from "@/store";
import type { Building, PaginatedResponse } from "@/types";

const reportPeriods = [
  { value: "day", label: "24 heures", days: 1 },
  { value: "week", label: "7 jours", days: 7 },
  { value: "month", label: "30 jours", days: 30 },
] as const;

type ReportFormat = "csv" | "pdf";

const TenantReports = () => {
  const { limits, loading: limitsLoading } = useSubscriptionLimits();

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [period, setPeriod] = useState<(typeof reportPeriods)[number]>(reportPeriods[2]);
  const [isLoading, setIsLoading] = useState(true);
  const [buildingsError, setBuildingsError] = useState(false);
  const [downloading, setDownloading] = useState<ReportFormat | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const [downloadStatus, setDownloadStatus] = useState("");
  const pendingDownload = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api.get<Building[] | PaginatedResponse<Building>>("/api/v1/buildings", {
      signal: controller.signal,
    }).then(({ data }) => {
      if (controller.signal.aborted) return;
      const buildingList = Array.isArray(data) ? data : data.data;
      setBuildings(buildingList);
      setSelectedBuilding(buildingList[0]?.id ?? "");
    }).catch((error) => {
      if (controller.signal.aborted) return;
      logger.error("Erreur chargement bâtiments", error);
      setBuildingsError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setIsLoading(false);
    });
    return () => {
      controller.abort();
      pendingDownload.current?.abort();
    };
  }, []);

  const download = async (type: ReportFormat) => {
    if (!selectedBuilding || pendingDownload.current || !limits?.hasExport) return;
    const controller = new AbortController();
    pendingDownload.current = controller;
    setDownloading(type);
    setDownloadError("");
    setDownloadStatus("");
    try {
      const to = new Date();
      const from = new Date(to.getTime() - period.days * 24 * 60 * 60 * 1000);
      const params = type === "csv"
        ? { buildingId: selectedBuilding, from: from.toISOString(), to: to.toISOString() }
        : { buildingId: selectedBuilding, period: period.value };

      const { data } = await api.get<Blob>(`/api/v1/reports/${type}`, {
        params, responseType: "blob", signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `afrixora_report.${type}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadStatus(`Téléchargement du rapport ${type.toUpperCase()} lancé.`);
    } catch (error) {
      if (controller.signal.aborted) return;
      logger.error("Erreur téléchargement rapport", error);
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (status === 403) {
        setDownloadError("Votre plan ne permet pas cet export.");
      } else if (status === 413) {
        setDownloadError("Le rapport est trop volumineux. Sélectionnez une période plus courte.");
      } else {
        setDownloadError("Le téléchargement a échoué. Veuillez réessayer.");
      }
    } finally {
      pendingDownload.current = null;
      if (!controller.signal.aborted) setDownloading(null);
    }
  };

  if (isLoading || limitsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Rapports</h1>
        <p className="text-muted-foreground">Générez vos rapports énergétiques</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nouveau rapport</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!limits && <p role="alert" className="text-sm text-destructive">Impossible de vérifier les droits d’export.</p>}
          {limits && !limits.hasExport && <p className="text-sm text-muted-foreground">Votre plan ne permet pas l’export de rapports.</p>}
          {limits?.hasExport && buildingsError && (
            <p role="alert" className="text-sm text-destructive">Impossible de charger les bâtiments.</p>
          )}
          {limits?.hasExport && !buildingsError && buildings.length === 0 && (
            <p className="text-sm text-muted-foreground">Ajoutez un bâtiment pour générer un rapport.</p>
          )}
          {limits?.hasExport && buildings.length > 0 && (
            <>
              <div>
                <label htmlFor="report-building" className="text-sm font-medium">Bâtiment</label>
                <Select value={selectedBuilding} onValueChange={setSelectedBuilding} disabled={!!downloading}>
                  <SelectTrigger id="report-building" className="w-full mt-1">
                    <SelectValue placeholder="Sélectionner un bâtiment" />
                  </SelectTrigger>
                  <SelectContent>
                    {buildings.map((building) => (
                      <SelectItem key={building.id} value={building.id}>{building.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label htmlFor="report-period" className="text-sm font-medium">Période</label>
                <Select value={period.value} disabled={!!downloading} onValueChange={(value) => {
                  const selection = reportPeriods.find((item) => item.value === value);
                  if (selection) setPeriod(selection);
                }}>
                  <SelectTrigger id="report-period" className="w-full mt-1">
                    <SelectValue placeholder="Période" />
                  </SelectTrigger>
                  <SelectContent>
                    {reportPeriods.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap gap-4 pt-4" aria-busy={!!downloading}>
                <Button onClick={() => download("csv")} disabled={!!downloading} className="bg-emerald-600 hover:bg-emerald-700">
                  {downloading === "csv" ? "Génération du CSV…" : "Télécharger le CSV"}
                </Button>
                <Button onClick={() => download("pdf")} disabled={!!downloading} className="bg-emerald-600 hover:bg-emerald-700">
                  {downloading === "pdf" ? "Génération du PDF…" : "Télécharger le PDF"}
                </Button>
              </div>
              {downloadError && <p role="alert" className="text-sm text-destructive">{downloadError}</p>}
              {downloadStatus && <p role="status" className="text-sm text-muted-foreground">{downloadStatus}</p>}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const ReportsPage = () => {
  const user = useStore(state => state.user);
  const selectedTenantId = useStore(state => state.impersonatedTenantId);
  if (!user) return <p role="status" className="text-muted-foreground">Chargement…</p>;
  const tenantId = user.role === "SUPER_ADMIN" && selectedTenantId ? selectedTenantId : user.tenantId;
  return <TenantReports key={`${user.id}:${tenantId}`} />;
};

export default ReportsPage;
