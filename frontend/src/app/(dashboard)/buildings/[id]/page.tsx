"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";
import useStore from "@/store";
import { ArrowLeft, Plus } from "lucide-react";

interface Building {
  id: string;
  name: string;
  address: string;
  city: string;
  unitsCount: number;
  isActive: boolean;
  _count?: { zones: number; devices: number };
}

interface Zone {
  id: string;
  name: string;
  floor: number;
  type: string;
  _count?: { devices: number };
}

interface Device {
  id: string;
  name: string;
  type: string;
  isOnline: boolean;
  zone?: { name: string };
  config?: Record<string, any>;
}

const BuildingDetailPage = (): JSX.Element => {
  const params = useParams();
  const router = useRouter();
  const buildingId = params.id as string;
  const user = useStore(state => state.user);

  const [building, setBuilding] = useState<Building | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [energySummary, setEnergySummary] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog ajout de zone
  const [showAddZone, setShowAddZone] = useState(false);
  const [zoneName, setZoneName] = useState("");
  const [zoneFloor, setZoneFloor] = useState(0);
  const [zoneType, setZoneType] = useState("ROOM");

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [bRes, dRes, eRes] = await Promise.all([
        api.get(`/api/v1/buildings/${buildingId}`),
        api.get(`/api/v1/devices?buildingId=${buildingId}`),
        api.get(`/api/v1/energy/summary?buildingId=${buildingId}&period=7d`),
      ]);
      
      const buildingData = bRes.data;
      setBuilding(buildingData);
      setZones(buildingData.zones || []);
      setDevices(dRes.data || []);
      setEnergySummary(eRes.data ?? eRes);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Impossible de charger les détails du bâtiment.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (buildingId) fetchData();
  }, [buildingId]);

  const handleAddZone = async () => {
    if (!zoneName.trim()) return;
    try {
      await api.post(`/api/v1/buildings/${buildingId}/zones`, {
        name: zoneName,
        floor: zoneFloor,
        type: zoneType,
      });
      setShowAddZone(false);
      setZoneName("");
      setZoneFloor(0);
      setZoneType("ROOM");
      fetchData(); // rafraîchir la liste des zones
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">Chargement...</div>;
  }

  if (error || !building) {
    return (
      <div className="p-6 border rounded-md text-center">
        <p className="text-muted-foreground">{error || "Bâtiment introuvable."}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/buildings")}>
          Retour à la liste
        </Button>
      </div>
    );
  }

  const onlineDevices = devices.filter(d => d.isOnline).length;
  const totalDevices = devices.length;

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/buildings")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{building.name}</h1>
            <p className="text-muted-foreground">{building.address}, {building.city}</p>
          </div>
        </div>
        <Badge variant={building.isActive ? "default" : "secondary"}>
          {building.isActive ? "Actif" : "Inactif"}
        </Badge>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-t-2 border-t-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Zones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{zones.length}</div>
          </CardContent>
        </Card>
        <Card className="border-t-2 border-t-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Appareils</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{onlineDevices}<span className="text-sm text-muted-foreground"> / {totalDevices}</span></div>
          </CardContent>
        </Card>
        <Card className="border-t-2 border-t-orange-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Conso. 7 jours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{energySummary?.totalKwh?.toFixed(1) || "0"}<span className="text-sm text-muted-foreground"> kWh</span></div>
          </CardContent>
        </Card>
        <Card className="border-t-2 border-t-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Unités</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{building.unitsCount || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Zones */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Zones</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowAddZone(true)}>
            <Plus className="h-4 w-4 mr-1" /> Ajouter une zone
          </Button>
        </CardHeader>
        <CardContent>
          {zones.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucune zone enregistrée.</p>
          ) : (
            <div className="grid gap-2">
              {zones.map((zone) => (
                <div key={zone.id} className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/20">
                  <div>
                    <div className="font-medium">{zone.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Étage {zone.floor} · {zone.type === "ROOM" ? "Pièce" : zone.type === "CORRIDOR" ? "Couloir" : zone.type === "COMMON_AREA" ? "Zone commune" : zone.type === "PARKING" ? "Parking" : zone.type}
                    </div>
                  </div>
                  <Badge variant="outline">{zone._count?.devices || 0} appareil(s)</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Appareils */}
      <Card>
        <CardHeader>
          <CardTitle>Appareils ({totalDevices})</CardTitle>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun appareil associé à ce bâtiment.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {devices.map(device => (
                <div key={device.id} className={`p-3 border rounded-md ${device.isOnline ? "border-emerald-500/30" : "border-red-500/30"}`}>
                  <div className="text-sm font-medium truncate">{device.name}</div>
                  <div className="text-xs text-muted-foreground">{device.type} · {device.zone?.name || "—"}</div>
                  <div className={`text-xs mt-1 font-medium ${device.isOnline ? "text-emerald-400" : "text-red-400"}`}>
                    {device.isOnline ? "En ligne" : "Hors ligne"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog ajouter une zone */}
      <Dialog open={showAddZone} onOpenChange={setShowAddZone}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter une zone</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nom de la zone</Label>
              <Input value={zoneName} onChange={e => setZoneName(e.target.value)} placeholder="Ex: Bureau 201" />
            </div>
            <div>
              <Label>Étage</Label>
              <Input type="number" value={zoneFloor} onChange={e => setZoneFloor(Number(e.target.value))} />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={zoneType} onValueChange={setZoneType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ROOM">Pièce</SelectItem>
                  <SelectItem value="CORRIDOR">Couloir</SelectItem>
                  <SelectItem value="COMMON_AREA">Zone commune</SelectItem>
                  <SelectItem value="PARKING">Parking</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowAddZone(false)}>Annuler</Button>
            <Button onClick={handleAddZone}>Créer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BuildingDetailPage;
