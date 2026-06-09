"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";
import logger from "@/lib/logger";

interface Building {
  id: string;
  name: string;
}

const ReportsPage = (): JSX.Element => {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<string>("");
  const [period, setPeriod] = useState<string>("30d");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      try {
        const response = await api.get('/api/v1/buildings');
        const raw = response.data;
        const buildingList = Array.isArray(raw) ? raw : (raw?.data ?? []);
        setBuildings(buildingList);
        if (buildingList.length > 0) setSelectedBuilding(buildingList[0].id);
      } catch (err) {
        logger.error("Erreur chargement bâtiments", err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const download = async (type: 'csv' | 'pdf') => {
    if (!selectedBuilding) return;
    try {
      const from = new Date();
      from.setDate(from.getDate() - (period === '24h' ? 1 : period === '7d' ? 7 : 30));
      const to = new Date();

      const endpoint =
        type === 'csv'
          ? `/api/v1/reports/csv?buildingId=${selectedBuilding}&from=${from.toISOString()}&to=${to.toISOString()}`
          : `/api/v1/reports/pdf?buildingId=${selectedBuilding}&period=${period}`;

      const response = await api.get(endpoint, { responseType: 'blob' });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `afrixora_report.${type}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      logger.error("Erreur téléchargement rapport", err);
    }
  };

  if (isLoading) {
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
          <div>
            <label className="text-sm font-medium">Bâtiment</label>
            <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
              <SelectTrigger className="w-full mt-1">
                <SelectValue placeholder="Sélectionner un bâtiment" />
              </SelectTrigger>
              <SelectContent>
                {buildings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Période</label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-full mt-1">
                <SelectValue placeholder="Période" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">24 heures</SelectItem>
                <SelectItem value="7d">7 jours</SelectItem>
                <SelectItem value="30d">30 jours</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-4 pt-4">
            <Button onClick={() => download('csv')} className="bg-emerald-600 hover:bg-emerald-700">
              📄 Télécharger CSV
            </Button>
            <Button onClick={() => download('pdf')} className="bg-emerald-600 hover:bg-emerald-700">
              📑 Télécharger PDF
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportsPage;