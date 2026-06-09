import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import api from "@/lib/api";
import logger from "@/lib/logger";

interface Building {
  id: string;
  name: string;
}

interface Zone {
  id: string;
  name: string;
}

interface AddDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildings: Building[];
  zones: Zone[];
  selectedBuildingId: string;
  onBuildingChange: (buildingId: string) => void;
  onDeviceCreated: () => void;
}

const AddDeviceDialog: React.FC<AddDeviceDialogProps> = ({ open, onOpenChange, buildings, zones, selectedBuildingId, onBuildingChange, onDeviceCreated }) => {
  const [name, setName] = useState("");
  const [type, setType] = useState("LIGHT");
  const [protocol, setProtocol] = useState("MQTT");
  const [zoneId, setZoneId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name || !selectedBuildingId) return;
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        type,
        buildingId: selectedBuildingId,
        protocol,
      };

      // N'inclure zoneId que s'il est défini et non égal au marqueur "aucun"
      if (zoneId && zoneId !== "__none__") {
        payload.zoneId = zoneId;
      }

      await api.post('/api/v1/devices', payload);
      onDeviceCreated();
      onOpenChange(false);
      // reset
      setName("");
      setType("LIGHT");
      setProtocol("MQTT");
      setZoneId("");
    } catch (err) {
      logger.error("Erreur ajout device", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter un appareil</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Nom</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LIGHT">Lumière</SelectItem>
                <SelectItem value="PLUG">Prise</SelectItem>
                <SelectItem value="SENSOR">Capteur</SelectItem>
                <SelectItem value="THERMOSTAT">Thermostat</SelectItem>
                <SelectItem value="ENERGY_METER">Compteur</SelectItem>
                <SelectItem value="DOOR_SENSOR">Capteur porte</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Bâtiment</Label>
            <Select value={selectedBuildingId} onValueChange={(val) => { onBuildingChange(val); setZoneId(''); }}>
              <SelectTrigger><SelectValue placeholder="Sélectionner un bâtiment" /></SelectTrigger>
              <SelectContent>
                {buildings.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Zone</Label>
            <Select value={zoneId} onValueChange={setZoneId} disabled={!zones.length}>
              <SelectTrigger><SelectValue placeholder="Sélectionner une zone" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Aucune</SelectItem>
                {zones.map(z => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Protocole</Label>
            <Select value={protocol} onValueChange={setProtocol}>
              <SelectTrigger><SelectValue placeholder="Protocole" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MQTT">MQTT</SelectItem>
                <SelectItem value="ZIGBEE">Zigbee</SelectItem>
                <SelectItem value="WIFI">WiFi</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={loading || !name || !selectedBuildingId}>
            {loading ? "Création..." : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddDeviceDialog;
