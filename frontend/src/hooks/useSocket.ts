import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { logger } from '@/lib/logger';
import useStore from '@/store';

interface UseSocketOptions {
  buildingId?: string;
  enabled?: boolean;
}

/**
 * Hook for managing Socket.IO connection to the AFRIXORA backend
 * Handles authentication, room joining, and event listening
 * L'authentification utilise le cookie httpOnly, avec repli localStorage en développement.
 */
const useSocket = ({ buildingId, enabled = true }: UseSocketOptions = {}) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Get store methods for updating state
  const { setReading, updateDevice, addAlert } = useStore();

  useEffect(() => {
    // Don't connect if not enabled or no buildingId
    if (!enabled || !buildingId) {
      return;
    }

    // Initialize socket connection (cookie httpOnly envoyé auto via withCredentials)
    const token = process.env.NODE_ENV === 'development' ? localStorage.getItem('afrixora_token') : null;
    const socketInstance = io(process.env.NEXT_PUBLIC_API_URL || '', {
      withCredentials: true,
      ...(token ? { auth: { token } } : {}),
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Connection event handlers
    socketInstance.on('connect', () => {
      setIsConnected(true);
      setError(null);
      
      // Join building room
      socketInstance.emit('join:building', buildingId);
      logger.debug('Connexion Socket.IO établie ; demande de rejoindre le bâtiment envoyée', { buildingId });
    });

    socketInstance.on('connect_error', (err) => {
      setIsConnected(false);
      setError(`Connection error: ${err.message}`);
      logger.error('Erreur de connexion Socket.IO', err);
    });

    socketInstance.on('disconnect', (reason) => {
      setIsConnected(false);
      logger.debug('Socket.IO déconnecté', { reason });
    });

    // Data event handlers
    socketInstance.on('device:reading', (data) => {
      // Update device readings in store
      if (data && data.deviceId && data.metrics) {
        setReading(data.deviceId, data.metrics, data.units);
      }
    });

    socketInstance.on('device:status', (data) => {
      // Update device status in store
      if (data && data.deviceId) {
        updateDevice(data.deviceId, {
          isOnline: data.isOnline,
          lastSeen: data.lastSeen || new Date().toISOString(),
        });
      }
    });

    socketInstance.on('alert:new', (alert) => {
      // Add new alert to store
      if (alert) {
        addAlert(alert);
      }
    });

    socketInstance.on('automation:fired', (data) => {
      // Log automation notification (would show toast in UI)
      if (data && data.ruleName) {
        logger.debug(`Automatisation déclenchée : la règle « ${data.ruleName} » a été exécutée`);
        // In a real implementation, we would show a toast notification here
      }
    });

    // Save socket instance
    setSocket(socketInstance);

    // Cleanup on unmount
    return () => {
      if (socketInstance) {
        socketInstance.off('connect');
        socketInstance.off('connect_error');
        socketInstance.off('disconnect');
        socketInstance.off('device:reading');
        socketInstance.off('device:status');
        socketInstance.off('alert:new');
        socketInstance.off('automation:fired');
        socketInstance.disconnect();
        logger.debug('Socket.IO déconnecté lors du nettoyage');
      }
    };
  }, [buildingId, enabled, setReading, updateDevice, addAlert]);

  return {
    socket,
    isConnected,
    error,
  };
};

export default useSocket;
