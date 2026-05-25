export interface Device {
  id: string;
  tenantId: string;
  buildingId: string;
  zoneId: string | null;
  name: string;
  type: "LIGHT" | "PLUG" | "SENSOR" | "THERMOSTAT" | "ENERGY_METER" | "DOOR_SENSOR";
  protocol: "MQTT" | "ZIGBEE" | "WIFI";
  macAddress?: string;
  isOnline: boolean;
  lastSeen?: string;
  config: Record<string, any>;
  metadata: Record<string, any>;
  createdAt: string;
  states?: DeviceState[];
  building?: { name: string };
  zone?: { name: string };
}

export interface DeviceState {
  id: string;
  deviceId: string;
  tenantId: string;
  state: any;
  updatedAt: string;
}
