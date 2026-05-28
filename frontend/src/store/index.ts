import { create } from 'zustand';
import { getToken, setToken, clearToken } from '@/lib/auth';

export type User = {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'BUILDING_ADMIN' | 'OPERATOR' | 'VIEWER';
  tenantId: string;
};

export type DeviceType = 'LIGHT' | 'PLUG' | 'SENSOR' | 'THERMOSTAT' | 'ENERGY_METER' | 'DOOR_SENSOR';
export type Protocol = 'MQTT' | 'ZIGBEE' | 'WIFI';

export type Device = {
  id: string;
  tenantId: string;
  buildingId: string;
  zoneId?: string;
  name: string;
  type: DeviceType;
  protocol: Protocol;
  macAddress?: string;
  isOnline: boolean;
  lastSeen?: string;
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type Reading = {
  time: string;
  deviceId: string;
  metric: string;
  value: number;
  unit?: string;
};

export type AlertType = 'ENERGY_THRESHOLD' | 'DEVICE_OFFLINE' | 'AUTOMATION_FIRED' | 'ANOMALY';
export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';

export type Alert = {
  id: string;
  tenantId: string;
  buildingId: string;
  deviceId?: string;
  type: AlertType;
  severity: Severity;
  message: string;
  metadata: Record<string, unknown>;
  isRead: boolean;
  resolvedAt?: string;
  createdAt: string;
};

// ─── AUTH SLICE ────────────────────────────────────────────────

interface AuthState {
  user: User | null;
  token: string | null;
  impersonatedTenantId: string | null;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
  setImpersonatedTenantId: (tenantId: string | null) => void;
}

// Récupérer l'ID sauvegardé dans localStorage
const getSavedImpersonatedTenantId = (): string | null => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('afrixora_impersonated_tenant_id');
  }
  return null;
};

const createAuthSlice = (set: any) => ({
  user: null,
  token: getToken(),
  impersonatedTenantId: getSavedImpersonatedTenantId(),
  setAuth: (user: User, token: string) => {
    setToken(token);
    set({ user, token });
  },
  clearAuth: () => {
    clearToken();
    localStorage.removeItem('afrixora_impersonated_tenant_id');
    set({ user: null, token: null, impersonatedTenantId: null });
  },
  setImpersonatedTenantId: (tenantId: string | null) => {
    if (tenantId) {
      localStorage.setItem('afrixora_impersonated_tenant_id', tenantId);
    } else {
      localStorage.removeItem('afrixora_impersonated_tenant_id');
    }
    set({ impersonatedTenantId: tenantId });
  },
});

// ─── DEVICES SLICE ─────────────────────────────────────────────

interface DevicesState {
  devices: Record<string, Device>;
  updateDevice: (id: string, data: Partial<Device>) => void;
}

const createDevicesSlice = (set: any) => ({
  devices: {} as Record<string, Device>,
  updateDevice: (id: string, data: Partial<Device>) => {
    set((state: DevicesState) => ({
      devices: { ...state.devices, [id]: { ...state.devices[id], ...data } },
    }));
  },
});

// ─── READINGS SLICE ─────────────────────────────────────────────

interface ReadingsState {
  readings: Record<string, Reading[]>;
  setReading: (deviceId: string, metrics: Record<string, number>, units?: Record<string, string>) => void;
}

const createReadingsSlice = (set: any) => ({
  readings: {} as Record<string, Reading[]>,
  setReading: (deviceId: string, metrics: Record<string, number>, units?: Record<string, string>) => {
    const time = new Date().toISOString();
    set((state: ReadingsState) => {
      const deviceReadings = state.readings[deviceId] || [];
      const newReadings = Object.entries(metrics).map(([metric, value]) => ({
        time, deviceId, metric, value, unit: units?.[metric],
      }));
      const updatedReadings = [...newReadings, ...deviceReadings].slice(0, 100);
      return { readings: { ...state.readings, [deviceId]: updatedReadings } };
    });
  },
});

// ─── ALERTS SLICE ───────────────────────────────────────────────

interface AlertsState {
  alerts: Alert[];
  addAlert: (alert: Alert) => void;
}

const createAlertsSlice = (set: any) => ({
  alerts: [] as Alert[],
  addAlert: (alert: Alert) => {
    set((state: AlertsState) => ({
      alerts: [alert, ...state.alerts].slice(0, 50),
    }));
  },
});

// ─── COMBINED STORE ─────────────────────────────────────────────

export interface StoreState extends AuthState, DevicesState, ReadingsState, AlertsState {}

const useStore = create<StoreState>((set) => ({
  ...createAuthSlice(set),
  ...createDevicesSlice(set),
  ...createReadingsSlice(set),
  ...createAlertsSlice(set),
}));

export default useStore;
