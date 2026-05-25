import React from "react";
import { Button } from "@/components/ui/button";
import type { Device } from "@/types";

interface DeviceDrawerProps {
  device: Device | null;
  onClose: () => void;
}

const DeviceDrawer: React.FC<DeviceDrawerProps> = ({ device, onClose }) => {
  if (!device) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>
      <div className="absolute right-0 top-0 h-full w-80 bg-card border-l shadow-xl">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">{device.name}</h3>
            <Button variant="ghost" size="icon" onClick={onClose}>✕</Button>
          </div>
          <div className="space-y-4">
            <div>
              <div className="text-xs text-muted-foreground">Type</div>
              <div>{device.type}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Zone</div>
              <div>{device.zone?.name || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Statut</div>
              <div className={device.isOnline ? "text-green-500" : "text-red-500"}>{device.isOnline ? "En ligne" : "Hors ligne"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Protocole</div>
              <div>{device.protocol}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">État</div>
              <div className="font-bold">{device.config?.state === 'on' ? "Allumé" : "Éteint"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeviceDrawer;
