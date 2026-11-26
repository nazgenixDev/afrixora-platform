"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DeviceCommandProgress, DeviceEnergyDetails, type SentCommand } from "@/components/energy/DeviceEnergyDetails";
import { commandLabels } from "@/lib/energyV2";
import { Button } from "@/components/ui/button";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import api from "@/lib/api";
import logger from "@/lib/logger";
import useStore from "@/store";
import { toast } from "sonner";
import { getReportedDeviceState } from "@/lib/utils";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import type { Device, Building, PaginatedResponse, Zone } from "@/types";
import { Zap, Wifi, WifiOff, Power, PowerOff, Search, LayoutGrid, List, Plus, Eye, Cpu, Loader2 } from "lucide-react";

const STATS_COLORS: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  total: { bg: "bg-emerald-100 dark:bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", icon: <Cpu className="w-4 h-4" /> },
  online: { bg: "bg-green-100 dark:bg-green-500/10", text: "text-green-600 dark:text-green-400", icon: <Wifi className="w-4 h-4" /> },
  offline: { bg: "bg-red-100 dark:bg-red-500/10", text: "text-red-600 dark:text-red-400", icon: <WifiOff className="w-4 h-4" /> },
  active: { bg: "bg-orange-100 dark:bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", icon: <Power className="w-4 h-4" /> },
  power: { bg: "bg-blue-100 dark:bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", icon: <Zap className="w-4 h-4" /> },
};

const TYPE_BADGES: Record<string, string> = {
  LIGHT: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  PLUG: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  SENSOR: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  THERMOSTAT: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  ENERGY_METER: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  DOOR_SENSOR: "bg-gray-500/10 text-gray-400 border-gray-500/30",
};

const TYPE_LABELS: Record<string, string> = {
  LIGHT: "Lumière",
  PLUG: "Prise",
  SENSOR: "Capteur",
  THERMOSTAT: "Thermostat",
  ENERGY_METER: "Compteur",
  DOOR_SENSOR: "Capteur porte",
};

// Composant AddDeviceDialog déplacé AVANT DevicesPage pour qu'il soit défini
const AddDeviceDialog = ({ 
  open, 
  onOpenChange, 
  buildings, 
  zones, 
  selectedBuildingId, 
  onBuildingChange, 
  onDeviceCreated 
}: { 
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildings: Building[];
  zones: Zone[];
  selectedBuildingId: string;
  onBuildingChange: (buildingId: string) => void;
  onDeviceCreated: () => void;
}) => {
  const [name, setName] = useState("");
  const [type, setType] = useState("LIGHT");
  const [protocol, setProtocol] = useState("MQTT");
  const [zoneId, setZoneId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name || !selectedBuildingId) return;
    setLoading(true);
    try {
      const payload: any = { name, type, buildingId: selectedBuildingId, protocol };
      if (zoneId && zoneId !== "__none__") payload.zoneId = zoneId;
      await api.post('/api/v1/devices', payload);
      onDeviceCreated();
      onOpenChange(false);
      setName(""); setType("LIGHT"); setProtocol("MQTT"); setZoneId("");
    } catch (err) { logger.error(String(err)); } finally { setLoading(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="relative bg-card border rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">Ajouter un appareil</h2>
        <div className="space-y-3">
          <Input placeholder="Nom" value={name} onChange={e => setName(e.target.value)} />
          <select className="w-full h-9 rounded-md border bg-background px-3 text-sm" value={type} onChange={e => setType(e.target.value)}>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="w-full h-9 rounded-md border bg-background px-3 text-sm" value={selectedBuildingId} onChange={e => { onBuildingChange(e.target.value); setZoneId(''); }}>
            <option value="">Bâtiment</option>
            {buildings?.map((b: Building) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="w-full h-9 rounded-md border bg-background px-3 text-sm" value={zoneId} onChange={e => setZoneId(e.target.value)} disabled={!zones?.length}>
            <option value="">Aucune zone</option>
            <option value="__none__">—</option>
            {zones?.map((z: Zone) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <select className="w-full h-9 rounded-md border bg-background px-3 text-sm" value={protocol} onChange={e => setProtocol(e.target.value)}>
            <option value="MQTT">MQTT</option>
            <option value="ZIGBEE">Zigbee</option>
            <option value="WIFI">WiFi</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={loading || !name || !selectedBuildingId}>{loading ? "..." : "Créer"}</Button>
        </div>
      </div>
    </div>
  );
};

const DevicesPage = ({ deviceId }: { deviceId: string }) => {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [search, setSearch] = useState(deviceId);
  const [filterType, setFilterType] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedDevice, setDrawerDevice] = useState<Device | null>(null);
  const [dismissedDeviceLink, setDismissedDeviceLink] = useState(false);
  const [latestCommands, setLatestCommands] = useState<Record<string, SentCommand>>({});
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");
  const [zones, setZones] = useState<Zone[]>([]);

  const filters = new URLSearchParams();
  if (search.trim()) filters.set("search", search.trim());
  if (filterType) filters.set("type", filterType);
  if (filterStatus) filters.set("isOnline", String(filterStatus === "online"));
  const { result, loading, error, setPage, reload } =
    usePaginatedList<Device>("/api/v1/devices", filters.toString());
  const devices = result?.data ?? [];
  const drawerDevice = selectedDevice ?? (!dismissedDeviceLink && deviceId ? devices.find(device => device.id === deviceId) : null);
  function closeDrawer() {
    setDismissedDeviceLink(true);
    setDrawerDevice(null);
  }

  const user = useStore(state => state.user);
  const canEdit = user && ['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN'].includes(user.role);
  const canControl = user && user.role !== 'VIEWER' && process.env.NEXT_PUBLIC_AFRIXORA_DEVICE_CONTROL_ENABLED === 'true';
  const controllableDevices = canControl ? devices.filter(({ type, isOnline }) => isOnline && (type === 'LIGHT' || type === 'PLUG')) : [];
  const controllableIds = new Set(controllableDevices.map(({ id }) => id));

  useEffect(() => {
    const controller = new AbortController();
    api.get<PaginatedResponse<Building>>("/api/v1/buildings", { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        setBuildings(data.data);
        setSelectedBuildingId(data.data[0]?.id ?? "");
      })
      .catch(error => { if (!controller.signal.aborted) logger.error(String(error)); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedBuildingId) return;
    const controller = new AbortController();
    api.get<Zone[]>(`/api/v1/buildings/${selectedBuildingId}/zones`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setZones(data); })
      .catch(() => { if (!controller.signal.aborted) setZones([]); });
    return () => controller.abort();
  }, [selectedBuildingId]);

  const changePage = (page: number) => {
    setSelectedIds(new Set());
    setPage(page);
  };

  const sendCommand = async (id: string, on: boolean) => {
    const { data } = await api.post<SentCommand>(`/api/v1/devices/${id}/control`, {
      command: 'set_state', params: { state: on ? 'on' : 'off' },
    });
    setLatestCommands(previous => ({ ...previous, [id]: data }));
    if (['FAILED', 'EXPIRED', 'REJECTED'].includes(data.status)) {
      throw new Error('La commande a échoué ou a expiré.');
    }
    return data.status;
  };

  const toggleDevice = async (id: string, on: boolean) => {
    if (!controllableIds.has(id)) return;
    try {
      const status = await sendCommand(id, on);
      if (status === 'CONFIRMED') {
        toast.info('État déclaré par le boîtier.');
        reload();
      } else {
        toast.info(commandLabels[status] ?? 'Statut de commande inconnu.');
      }
    } catch (error) {
      logger.error(String(error));
      toast.error('La commande a échoué ou est indisponible.');
    }
  };

  const bulkToggle = async (on: boolean) => {
    const targets = [...selectedIds].filter(id => controllableIds.has(id));
    if (!targets.length) return;
    const responses = await Promise.allSettled(targets.map(id => sendCommand(id, on)));
    const accepted = responses.filter(response => response.status === 'fulfilled').length;
    toast.info(`${accepted}/${targets.length} commandes transmises.`);
    reload();
  };

  const handleBuildingChange = (buildingId: string) => {
    if (buildingId === selectedBuildingId) return;
    setZones([]);
    setSelectedBuildingId(buildingId);
  };

  const renderDeviceControl = (device: Device) => {
    const state = getReportedDeviceState(device);
    const disabled = !controllableIds.has(device.id);
    if (state === null) {
      return (
        <div className="flex flex-wrap items-center gap-1" onClick={event => event.stopPropagation()}>
          <span className="text-xs text-muted-foreground">État inconnu</span>
          {!disabled && (
            <>
              <Button variant="outline" size="sm" onClick={() => toggleDevice(device.id, true)}>Allumer</Button>
              <Button variant="outline" size="sm" onClick={() => toggleDevice(device.id, false)}>Éteindre</Button>
            </>
          )}
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{state === "on" ? "Allumé (déclaré)" : "Éteint (déclaré)"}</span>
        <Switch
          aria-label={`Commander ${device.name}`}
          checked={state === "on"}
          disabled={disabled}
          onCheckedChange={checked => toggleDevice(device.id, checked)}
          onClick={event => event.stopPropagation()}
        />
      </div>
    );
  };

  const stats = {
    total: result?.total ?? 0,
    online: devices.filter(d => d.isOnline).length,
    offline: devices.filter(d => !d.isOnline).length,
    active: devices.filter(d => getReportedDeviceState(d) === 'on').length,
    power: "—",
  };

  if (loading && !result) return <div className="flex items-center justify-center h-64">Chargement...</div>;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Rechercher un appareil..." className="max-w-xs" maxLength={100} value={search} onChange={e => { setSearch(e.target.value); changePage(1); }} />
        <select className="h-9 rounded-md border bg-background px-3 text-sm" value={filterType} onChange={e => { setFilterType(e.target.value); changePage(1); }}>
          <option value="">Tous types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="h-9 rounded-md border bg-background px-3 text-sm" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); changePage(1); }}>
          <option value="">Tous statuts</option>
          <option value="online">En ligne</option>
          <option value="offline">Hors ligne</option>
        </select>
        <div className="flex border rounded-md overflow-hidden">
          <button className={`px-3 py-1 text-sm ${viewMode === 'table' ? 'bg-emerald-600 text-white' : 'bg-card'}`} onClick={() => setViewMode('table')}>Tableau</button>
          <button className={`px-3 py-1 text-sm ${viewMode === 'grid' ? 'bg-emerald-600 text-white' : 'bg-card'}`} onClick={() => setViewMode('grid')}>Grille</button>
        </div>
        {controllableDevices.some(({ id }) => selectedIds.has(id)) && (
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => bulkToggle(true)}>Allumer</Button>
            <Button variant="outline" size="sm" onClick={() => bulkToggle(false)}>Éteindre</Button>
          </div>
        )}
        {/* CORRECTION : ajout de l'accolade fermante après </Button> */}
        {canEdit && <Button className="ml-auto bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowAddDialog(true)}>+ Ajouter</Button>}
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {Object.entries(stats).map(([key, val]) => (
          <div key={key} className="bg-card border rounded-lg p-3 flex items-center gap-3">
            <div className={`w-8 h-8 rounded flex items-center justify-center ${STATS_COLORS[key].bg} ${STATS_COLORS[key].text}`}>
              {STATS_COLORS[key].icon}
            </div>
            <div>
              <div className="text-lg font-bold">{val}</div>
              <div className="text-xs text-muted-foreground">
                {key === 'total' ? 'Total' : key === 'online' ? 'En ligne (page)' : key === 'offline' ? 'Hors ligne (page)' : key === 'active' ? 'Allumés déclarés (page)' : 'Puissance'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-3">
          <p role="alert">Erreur de chargement des appareils.</p>
          <Button variant="outline" size="sm" onClick={reload}>Réessayer</Button>
        </div>
      )}

      {/* Content */}
      {viewMode === 'table' ? (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-left"><input type="checkbox" aria-label="Sélectionner les appareils pilotables" disabled={controllableIds.size === 0} checked={controllableIds.size > 0 && controllableDevices.every(({ id }) => selectedIds.has(id))} onChange={e => setSelectedIds(e.target.checked ? controllableIds : new Set())} /></th>
                <th className="p-3 text-left">Appareil</th>
                <th className="p-3 text-left">Type</th>
                <th className="p-3 text-left">Zone</th>
                <th className="p-3 text-left">Statut</th>
                <th className="p-3 text-left">Contrôle</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.map(d => (
                <tr key={d.id} className="border-t hover:bg-muted/20 cursor-pointer" onClick={() => setDrawerDevice(d)}>
                  <td className="p-3"><input type="checkbox" aria-label={`Sélectionner ${d.name}`} disabled={!controllableIds.has(d.id)} checked={controllableIds.has(d.id) && selectedIds.has(d.id)} onChange={() => { const copy = new Set(selectedIds); copy.has(d.id) ? copy.delete(d.id) : copy.add(d.id); setSelectedIds(copy); }} onClick={e => e.stopPropagation()} /></td>
                  <td className="p-3">
                    <div className="font-medium">{d.name}</div>
                    <div className="text-xs text-muted-foreground">{d.id}</div>
                   </td>
                  <td className="p-3"><Badge className={TYPE_BADGES[d.type] || ""}>{TYPE_LABELS[d.type] || d.type}</Badge></td>
                  <td className="p-3 text-muted-foreground">{d.zone?.name || "—"}</td>
                  <td className="p-3"><Badge variant={d.isOnline ? "default" : "destructive"} className="text-xs">{d.isOnline ? "En ligne" : "Hors ligne"}</Badge></td>
                  <td className="p-3">{renderDeviceControl(d)}</td>
                  <td className="p-3">
                    <div className="flex gap-1 opacity-0 hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); setDrawerDevice(d); }}>⋯</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {devices.map(d => (
            <Card key={d.id} className={`p-4 cursor-pointer hover:shadow-md transition-shadow ${getReportedDeviceState(d) === "on" ? "border-emerald-500/30 bg-emerald-500/5" : ""}`} onClick={() => setDrawerDevice(d)}>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-bold text-xs">{d.type[0]}</div>
                {renderDeviceControl(d)}
              </div>
              <div className="font-medium truncate">{d.name}</div>
              <div className="text-xs text-muted-foreground">{d.zone?.name || "—"} · {d.isOnline ? <span className="text-emerald-400">En ligne</span> : <span className="text-red-400">Hors ligne</span>}</div>
            </Card>
          ))}
        </div>
      )}

      {result && <PaginationControls page={result.page} totalPages={result.totalPages} loading={loading} onPageChange={changePage} />}

      {/* Drawer (détail) */}
      {drawerDevice && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeDrawer} />
          <div className="absolute right-0 top-0 h-full w-full max-w-sm bg-card border-l shadow-xl p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">{drawerDevice.name}</h3>
              <Button variant="ghost" size="icon" onClick={closeDrawer}>✕</Button>
            </div>
            <div className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">Type</span> <span className="float-right">{TYPE_LABELS[drawerDevice.type]}</span></div>
              <div><span className="text-muted-foreground">Zone</span> <span className="float-right">{drawerDevice.zone?.name || "—"}</span></div>
              <div><span className="text-muted-foreground">Statut</span> <span className={`float-right ${drawerDevice.isOnline ? "text-emerald-400" : "text-red-400"}`}>{drawerDevice.isOnline ? "En ligne" : "Hors ligne"}</span></div>
              <div><span className="text-muted-foreground">Protocole</span> <span className="float-right">{drawerDevice.protocol}</span></div>
              <div><span className="text-muted-foreground">État déclaré par le boîtier</span> <span className="float-right font-bold">{getReportedDeviceState(drawerDevice) === 'on' ? "Allumé" : getReportedDeviceState(drawerDevice) === 'off' ? "Éteint" : "État inconnu"}</span></div>
              <div><span className="text-muted-foreground">ID</span> <span className="float-right text-xs font-mono">{drawerDevice.id}</span></div>
              {latestCommands[drawerDevice.id] && <DeviceCommandProgress key={latestCommands[drawerDevice.id].commandId}
                deviceId={drawerDevice.id} command={latestCommands[drawerDevice.id]} />}
              {drawerDevice.buildingId && <DeviceEnergyDetails key={drawerDevice.id} buildingId={drawerDevice.buildingId} deviceId={drawerDevice.id} />}
            </div>
          </div>
        </div>
      )}

      {/* Dialog Ajouter */}
      <AddDeviceDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        buildings={buildings}
        zones={zones}
        selectedBuildingId={selectedBuildingId}
        onBuildingChange={handleBuildingChange}
        onDeviceCreated={reload}
      />
    </div>
  );
};

function DevicesRoute() {
  const query = useSearchParams();
  const tenant = useStore(state => state.impersonatedTenantId ?? state.user?.tenantId);
  const deviceId = (query.get("deviceId") ?? "").slice(0, 100);
  return <DevicesPage key={`${tenant ?? ""}:${deviceId}`} deviceId={deviceId} />;
}

export default function DevicesPageWithSearch() {
  return <Suspense fallback={<p role="status">Chargement des appareils…</p>}><DevicesRoute /></Suspense>;
}
