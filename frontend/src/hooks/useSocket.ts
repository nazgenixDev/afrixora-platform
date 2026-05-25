import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import useStore from '@/store';
import { getToken } from '@/lib/auth';

interface UseSocketOptions {
  buildingId?: string;
  enabled?: boolean;
}

/**
 * Hook for managing Socket.IO connection to the AFRIXORA backend
 * Handles authentication, room joining, and event listening
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

    // Get auth token
    const token = getToken();
    if (!token) {
      setError('Authentication token not found');
      return;
    }

    // Initialize socket connection with auth token
    const socketInstance = io(process.env.NEXT_PUBLIC_API_URL || '', {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Connection event handlers
    socketInstance.on('connect', () => {
      setIsConnected(true);
      setError(null);
      
      // Join building room
      socketInstance.emit('join', { buildingId });
      console.log(`Socket connected and joined building:${buildingId}`);
    });

    socketInstance.on('connect_error', (err) => {
      setIsConnected(false);
      setError(`Connection error: ${err.message}`);
      console.error('Socket connection error:', err);
    });

    socketInstance.on('disconnect', (reason) => {
      setIsConnected(false);
      console.log(`Socket disconnected: ${reason}`);
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
        console.log(`Automation déclenchée: La règle "${data.ruleName}" a été exécutée`);
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
        console.log('Socket disconnected (cleanup)');
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