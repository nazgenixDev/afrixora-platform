"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import useStore from "@/store";
import type { Device } from "@/types";

interface Building {
  id: string;
  name: string;
}

interface Zone {
  id: string;
  name: string;
}

const STATS_COLORS = {
  total: "bg-emerald-500/10 text-emerald-400",
  online: "bg-green-500/10 text-green-400",
  offline: "bg-red-500/10 text-red-400",
  active: "bg-orange-500/10 text-orange-400",
  power: "bg-blue-500/10 text-blue-400",
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

const DevicesPage = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [filteredDevices, setFilteredDevices] = useState<Device[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerDevice, setDrawerDevice] = useState<Device | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");
  const [zones, setZones] = useState<Zone[]>([]);

  const updateDevice = useStore(state => state.updateDevice);

  useEffect(() => {
    (async () => {
      try {
        const [dRes, bRes] = await Promise.all([
          api.get('/api/v1/devices'),
          api.get('/api/v1/buildings'),
        ]);
        setDevices(dRes.data);
        setFilteredDevices(dRes.data);
        setBuildings(bRes.data);
        if (bRes.data.length > 0) setSelectedBuildingId(bRes.data[0].id);
        setError(null);
      } catch (err) {
        console.error(err);
        setError("Erreur lors du chargement des appareils.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    let result = devices;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q) ||
        d.zone?.name?.toLowerCase().includes(q)
      );
    }
    if (filterType) result = result.filter(d => d.type === filterType);
    if (filterStatus) result = result.filter(d => filterStatus === 'online' ? d.isOnline : !d.isOnline);
    setFilteredDevices(result);
    setSelectedIds(new Set());
  }, [search, filterType, filterStatus, devices]);

  const toggleDevice = async (id: string, newState: boolean) => {
    try {
      await api.post(`/api/v1/devices/${id}/control`, {
        command: 'set_state',
        params: { state: newState ? 'on' : 'off' }
      });
      setDevices(prev => prev.map(d => d.id === id ? { ...d, config: { ...d.config, state: newState ? 'on' : 'off' } } : d));
      updateDevice(id, { config: { state: newState ? 'on' : 'off' } } as any);
    } catch (err) {
      console.error(err);
    }
  };

  const bulkToggle = async (state: boolean) => {
    const cmd = state ? 'on' : 'off';
    await Promise.all(
      Array.from(selectedIds).map(id =>
        api.post(`/api/v1/devices/${id}/control`, { command: 'set_state', params: { state: cmd } })
      )
    );
    setDevices(prev => prev.map(d => selectedIds.has(d.id) ? { ...d, config: { ...d.config, state: cmd } } : d));
    selectedIds.forEach(id => updateDevice(id, { config: { state: cmd } } as any));
  };

  const handleBuildingChange = async (buildingId: string) => {
    setSelectedBuildingId(buildingId);
    try {
      const res = await api.get(`/api/v1/buildings/${buildingId}/zones`);
      setZones(res.data);
    } catch { setZones([]); }
  };

  const stats = {
    total: devices.length,
    online: devices.filter(d => d.isOnline).length,
    offline: devices.filter(d => !d.isOnline).length,
    active: devices.filter(d => d.config?.state === 'on' || d.config?.power === 'on').length,
    power: "—",
  };

  if (isLoading) return <div className="flex items-center justify-center h-64">Chargement...</div>;
  if (error) return <div className="p-6 bg-red-50 border border-red-200 rounded-md"><h2 className="text-lg font-semibold text-red-700">Erreur</h2><p className="text-red-600">{error}</p></div>;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Rechercher un appareil..." className="max-w-xs" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="h-9 rounded-md border bg-background px-3 text-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Tous types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="h-9 rounded-md border bg-background px-3 text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Tous statuts</option>
          <option value="online">En ligne</option>
          <option value="offline">Hors ligne</option>
        </select>
        <div className="flex border rounded-md overflow-hidden">
          <button className={`px-3 py-1 text-sm ${viewMode === 'table' ? 'bg-emerald-600 text-white' : 'bg-card'}`} onClick={() => setViewMode('table')}>Tableau</button>
          <button className={`px-3 py-1 text-sm ${viewMode === 'grid' ? 'bg-emerald-600 text-white' : 'bg-card'}`} onClick={() => setViewMode('grid')}>Grille</button>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => bulkToggle(true)}>Allumer</Button>
            <Button variant="outline" size="sm" onClick={() => bulkToggle(false)}>Éteindre</Button>
          </div>
        )}
        <Button className="ml-auto bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowAddDialog(true)}>+ Ajouter</Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-5 gap-2">
        {Object.entries(stats).map(([key, val]) => (
          <div key={key} className="bg-card border rounded-lg p-3 flex items-center gap-3">
            <div className={`w-8 h-8 rounded flex items-center justify-center font-bold text-xs ${STATS_COLORS[key as keyof typeof STATS_COLORS]}`}>
              {key[0].toUpperCase()}
            </div>
            <div>
              <div className="text-lg font-bold">{val}</div>
              <div className="text-xs text-muted-foreground">
                {key === 'total' ? 'Total' : key === 'online' ? 'En ligne' : key === 'offline' ? 'Hors ligne' : key === 'active' ? 'Actifs' : 'Puissance'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Content */}
      {viewMode === 'table' ? (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-left"><input type="checkbox" onChange={e => setSelectedIds(e.target.checked ? new Set(filteredDevices.map(d => d.id)) : new Set())} /></th>
                <th className="p-3 text-left">Appareil</th>
                <th className="p-3 text-left">Type</th>
                <th className="p-3 text-left">Zone</th>
                <th className="p-3 text-left">Statut</th>
                <th className="p-3 text-left">Contrôle</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDevices.map(d => (
                <tr key={d.id} className="border-t hover:bg-muted/20 cursor-pointer" onClick={() => setDrawerDevice(d)}>
                  <td className="p-3"><input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => { const copy = new Set(selectedIds); copy.has(d.id) ? copy.delete(d.id) : copy.add(d.id); setSelectedIds(copy); }} onClick={e => e.stopPropagation()} /></td>
                  <td className="p-3">
                    <div className="font-medium">{d.name}</div>
                    <div className="text-xs text-muted-foreground">{d.id}</div>
                  </td>
                  <td className="p-3"><Badge className={TYPE_BADGES[d.type] || ""}>{TYPE_LABELS[d.type] || d.type}</Badge></td>
                  <td className="p-3 text-muted-foreground">{d.zone?.name || "—"}</td>
                  <td className="p-3"><Badge variant={d.isOnline ? "default" : "destructive"} className="text-xs">{d.isOnline ? "En ligne" : "Hors ligne"}</Badge></td>
                  <td className="p-3"><Switch checked={d.config?.state === 'on' || d.config?.power === 'on'} onCheckedChange={checked => toggleDevice(d.id, checked)} onClick={e => e.stopPropagation()} /></td>
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
          {filteredDevices.map(d => (
            <Card key={d.id} className={`p-4 cursor-pointer hover:shadow-md transition-shadow ${d.config?.state === "on" ? "border-emerald-500/30 bg-emerald-500/5" : ""}`} onClick={() => setDrawerDevice(d)}>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-bold text-xs">{d.type[0]}</div>
                <Switch checked={d.config?.state === 'on' || d.config?.power === 'on'} onCheckedChange={checked => toggleDevice(d.id, checked)} onClick={e => e.stopPropagation()} />
              </div>
              <div className="font-medium truncate">{d.name}</div>
              <div className="text-xs text-muted-foreground">{d.zone?.name || "—"} · {d.isOnline ? <span className="text-emerald-400">En ligne</span> : <span className="text-red-400">Hors ligne</span>}</div>
            </Card>
          ))}
        </div>
      )}

      {/* Drawer (détail) */}
      {drawerDevice && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerDevice(null)} />
          <div className="absolute right-0 top-0 h-full w-80 bg-card border-l shadow-xl p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">{drawerDevice.name}</h3>
              <Button variant="ghost" size="icon" onClick={() => setDrawerDevice(null)}>✕</Button>
            </div>
            <div className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">Type</span> <span className="float-right">{TYPE_LABELS[drawerDevice.type]}</span></div>
              <div><span className="text-muted-foreground">Zone</span> <span className="float-right">{drawerDevice.zone?.name || "—"}</span></div>
              <div><span className="text-muted-foreground">Statut</span> <span className={`float-right ${drawerDevice.isOnline ? "text-emerald-400" : "text-red-400"}`}>{drawerDevice.isOnline ? "En ligne" : "Hors ligne"}</span></div>
              <div><span className="text-muted-foreground">Protocole</span> <span className="float-right">{drawerDevice.protocol}</span></div>
              <div><span className="text-muted-foreground">État</span> <span className="float-right font-bold">{drawerDevice.config?.state === 'on' ? "Allumé" : "Éteint"}</span></div>
              <div><span className="text-muted-foreground">ID</span> <span className="float-right text-xs font-mono">{drawerDevice.id}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Dialog Ajouter (existant AddDeviceDialog) */}
      {showAddDialog && (
        <AddDeviceDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          buildings={buildings}
          zones={zones}
          selectedBuildingId={selectedBuildingId}
          onBuildingChange={handleBuildingChange}
          onDeviceCreated={async () => {
            const res = await api.get('/api/v1/devices');
            setDevices(res.data);
          }}
        />
      )}
    </div>
  );
};

export default DevicesPage;

// AddDeviceDialog minimal inclus ici (ou importé)
const AddDeviceDialog = ({ open, onOpenChange, buildings, zones, selectedBuildingId, onBuildingChange, onDeviceCreated }: any) => {
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
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

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
            {buildings.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="w-full h-9 rounded-md border bg-background px-3 text-sm" value={zoneId} onChange={e => setZoneId(e.target.value)} disabled={!zones.length}>
            <option value="">Aucune zone</option>
            <option value="__none__">—</option>
            {zones.map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}
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