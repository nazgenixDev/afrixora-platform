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
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  states?: DeviceState[];
  building?: { name: string };
  zone?: { name: string };
}

export interface DeviceState {
  id: string;
  deviceId: string;
  tenantId: string;
  state: unknown;
  updatedAt: string;
}

export interface Building {
  id: string;
  tenantId?: string;
  name: string;
  address?: string;
  city?: string;
  unitsCount?: number;
  isActive?: boolean;
  createdAt?: string;
  _count?: {
    zones: number;
    devices: number;
  };
}

export interface Zone {
  id: string;
  name: string;
  buildingId: string;
  floor?: number;
  type?: string;
}

export interface EnergySummary {
  totalKwh: number;
  estimatedCostUSD: number;
  peakPowerW: number;
  avgPowerW: number;
  deviceCount: number;
}

export interface ConsumptionBucket {
  bucket: string;
  total_kwh: number;
  avg_power_w?: number;
}

export interface ZoneBucket {
  zoneId: string;
  name: string;
  zone_name?: string;
  total_kwh: number;
}

export interface Alert {
  id: string;
  tenantId: string;
  buildingId: string;
  deviceId?: string;
  type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  message: string;
  metadata: Record<string, unknown>;
  isRead: boolean;
  resolvedAt?: string;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}
