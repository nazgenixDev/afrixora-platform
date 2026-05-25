import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { Device } from "@/types";

interface DeviceTableProps {
  devices: Device[];
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  toggleDevice: (id: string, state: boolean) => void;
  onDeviceClick: (device: Device) => void;
}

const DeviceTable: React.FC<DeviceTableProps> = ({ devices, selectedIds, setSelectedIds, toggleDevice, onDeviceClick }) => {
  const toggleSelectAll = () => {
    if (selectedIds.size === devices.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(devices.map(d => d.id)));
  };

  const toggleId = (id: string) => {
    const copy = new Set(selectedIds);
    copy.has(id) ? copy.delete(id) : copy.add(id);
    setSelectedIds(copy);
  };

  const statusBadge = (online: boolean) => (
    <Badge variant={online ? "default" : "destructive"} className="text-xs">
      {online ? "En ligne" : "Hors ligne"}
    </Badge>
  );

  const typeBadge = (type: string) => {
    const mapping: Record<string, { label: string; className: string }> = {
      LIGHT: { label: "Lumière", className: "bg-yellow-500/10 text-yellow-500" },
      PLUG: { label: "Prise", className: "bg-blue-500/10 text-blue-500" },
      SENSOR: { label: "Capteur", className: "bg-purple-500/10 text-purple-500" },
      THERMOSTAT: { label: "Thermostat", className: "bg-orange-500/10 text-orange-500" },
      ENERGY_METER: { label: "Compteur", className: "bg-emerald-500/10 text-emerald-500" },
      DOOR_SENSOR: { label: "Porte", className: "bg-gray-500/10 text-gray-500" },
    };
    const info = mapping[type] || { label: type, className: "" };
    return <Badge className={info.className}>{info.label}</Badge>;
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="p-3 text-left w-10"><input type="checkbox" checked={selectedIds.size === devices.length && devices.length > 0} onChange={toggleSelectAll} /></th>
            <th className="p-3 text-left">Appareil</th>
            <th className="p-3 text-left">Type</th>
            <th className="p-3 text-left">Zone</th>
            <th className="p-3 text-left">Statut</th>
            <th className="p-3 text-left">Contrôle</th>
            <th className="p-3 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {devices.map(device => (
            <tr key={device.id} className="border-t hover:bg-muted/20 cursor-pointer" onClick={() => onDeviceClick(device)}>
              <td className="p-3"><input type="checkbox" checked={selectedIds.has(device.id)} onChange={() => toggleId(device.id)} onClick={(e) => e.stopPropagation()} /></td>
              <td className="p-3">
                <div className="font-medium">{device.name}</div>
                <div className="text-xs text-muted-foreground">{device.id}</div>
              </td>
              <td className="p-3">{typeBadge(device.type)}</td>
              <td className="p-3 text-muted-foreground">{device.zone?.name || "—"}</td>
              <td className="p-3">{statusBadge(device.isOnline)}</td>
              <td className="p-3">
                <Switch
                  checked={device.config?.state === 'on' || device.config?.power === 'on'}
                  onCheckedChange={(checked) => toggleDevice(device.id, checked)}
                  onClick={(e) => e.stopPropagation()}
                />
              </td>
              <td className="p-3">
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onDeviceClick(device); }}>···</Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DeviceTable;
