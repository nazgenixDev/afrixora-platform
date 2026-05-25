import React, { useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Device } from '@/store';
import api from '@/lib/api';

interface DeviceCardProps {
  device: Device;
  onToggle?: (deviceId: string, newState: boolean) => void;
  className?: string;
}

const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  onToggle,
  className,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOn, setIsOn] = useState(() => {
    // Initialize from device state if available
    if (typeof device.config === 'object' && device.config !== null) {
      const config = device.config as Record<string, unknown>;
      return config.state === 'on';
    }
    return false;
  });

  const getDeviceTypeIcon = (type: string): React.ReactNode => {
    switch (type) {
      case 'LIGHT':
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41M12 6a6 6 0 0 0-6 6c0 2.22 1.21 4.16 3 5.2V19c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1.8c1.79-1.04 3-2.98 3-5.2a6 6 0 0 0-6-6z" />
          </svg>
        );
      case 'PLUG':
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <path d="M12 22v-5M9 7V2M15 7V2M6 13V8a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4Z" />
          </svg>
        );
      case 'SENSOR':
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <path d="M5 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0M9 11v4M9 18h.01" />
          </svg>
        );
      case 'THERMOSTAT':
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
          </svg>
        );
      case 'ENERGY_METER':
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H7" />
          </svg>
        );
      case 'DOOR_SENSOR':
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14M2 20h20M14 12v.01" />
          </svg>
        );
      default:
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M7 7h.01M12 7h.01M17 7h.01" />
          </svg>
        );
    }
  };

  const getDeviceTypeName = (type: string): string => {
    switch (type) {
      case 'LIGHT':
        return 'Éclairage';
      case 'PLUG':
        return 'Prise';
      case 'SENSOR':
        return 'Capteur';
      case 'THERMOSTAT':
        return 'Thermostat';
      case 'ENERGY_METER':
        return 'Compteur d\'énergie';
      case 'DOOR_SENSOR':
        return 'Capteur de porte';
      default:
        return 'Appareil';
    }
  };

  const handleToggle = async (checked: boolean) => {
    if (!device.isOnline) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Only LIGHT and PLUG devices can be toggled
      if (['LIGHT', 'PLUG'].includes(device.type)) {
        const newState = checked ? 'on' : 'off';
        
        // Call the API to control the device
        await api.post(`/api/v1/devices/${device.id}/control`, {
          command: 'set_state',
          params: { state: newState }
        });
        
        setIsOn(checked);
        
        // Call the onToggle callback if provided
        if (onToggle) {
          onToggle(device.id, checked);
        }
      }
    } catch (err) {
      console.error('Error toggling device:', err);
      setError('Failed to control device');
      // Revert the switch state on error
      setIsOn(!checked);
    } finally {
      setIsLoading(false);
    }
  };

  const isToggleable = ['LIGHT', 'PLUG'].includes(device.type);

  return (
    <Card className={`overflow-hidden ${className}`}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-100 rounded-md text-emerald-700">
              {getDeviceTypeIcon(device.type)}
            </div>
            <CardTitle className="text-base">{device.name}</CardTitle>
          </div>
          <Badge
            variant={device.isOnline ? 'default' : 'secondary'}
            className={device.isOnline ? 'bg-emerald-600' : 'bg-gray-400'}
          >
            {device.isOnline ? 'En ligne' : 'Hors ligne'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="text-sm text-muted-foreground">
          <div className="flex justify-between items-center">
            <span>Type:</span>
            <span className="font-medium">{getDeviceTypeName(device.type)}</span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span>Protocole:</span>
            <span className="font-medium">{device.protocol}</span>
          </div>
          {device.lastSeen && (
            <div className="flex justify-between items-center mt-1">
              <span>Dernière activité:</span>
              <span className="font-medium">
                {new Date(device.lastSeen).toLocaleString()}
              </span>
            </div>
          )}
        </div>
        {error && (
          <div className="mt-2 text-xs text-red-600 bg-red-50 p-1.5 rounded">
            {error}
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-2">
        <div className="flex justify-between items-center w-full">
          <span className="text-sm font-medium">
            {isToggleable ? (isOn ? 'Allumé' : 'Éteint') : 'État'}
          </span>
          {isToggleable ? (
            <Switch
              checked={isOn}
              onCheckedChange={handleToggle}
              disabled={!device.isOnline || isLoading}
              className={isLoading ? 'opacity-50' : ''}
            />
          ) : (
            <Badge variant="outline">
              {device.isOnline ? 'Actif' : 'Inactif'}
            </Badge>
          )}
        </div>
      </CardFooter>
    </Card>
  );
};

export default DeviceCard;