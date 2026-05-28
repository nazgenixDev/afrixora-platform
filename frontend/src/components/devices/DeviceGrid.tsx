import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Lock } from "lucide-react";
import type { Device } from "@/types";

interface DeviceGridProps {
  devices: Device[];
  toggleDevice: (id: string, state: boolean) => void;
  onDeviceClick: (device: Device) => void;
  canControl?: boolean;
  canEdit?: boolean;
  onDelete?: (device: Device) => void;
}

const DeviceGrid: React.FC<DeviceGridProps> = ({ devices, toggleDevice, onDeviceClick, canControl, canEdit, onDelete }) => {
  const statusBadge = (online: boolean) => (
    <Badge variant={online ? "default" : "destructive"} className="text-xs">{online ? "En ligne" : "Hors ligne"}</Badge>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {devices.map(device => (
        <div key={device.id} className="bg-card border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer relative" onClick={() => onDeviceClick(device)}>
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500"><span className="text-xs font-bold">{device.type[0]}</span></div>
            <div className="flex items-center gap-1">
              {canControl ? <Switch checked={device.config?.state === 'on' || device.config?.power === 'on'} onCheckedChange={(checked) => toggleDevice(device.id, checked)} onClick={(e) => e.stopPropagation()} /> : <Lock className="h-4 w-4 text-muted-foreground" />}
              {canEdit && onDelete && <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onDelete(device); }}>🗑️</Button>}
            </div>
          </div>
          <div className="font-medium truncate">{device.name}</div>
          <div className="text-xs text-muted-foreground">{device.zone?.name || "—"} · {statusBadge(device.isOnline)}</div>
        </div>
      ))}
    </div>
  );
};

export default DeviceGrid;
