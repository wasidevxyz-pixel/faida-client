import { io } from 'socket.io-client';
import { getBaseURL } from './api';
import { haptic } from './haptics';

let socket = null;
const listeners = new Map();

/**
 * Initialize Socket.io connection for live sales & attendance syncing
 */
export function initSocket(token) {
  if (socket) return socket;

  try {
    const serverUrl = getBaseURL().replace(/\/api\/v1\/?$/, '');
    socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      auth: { token },
      timeout: 10000,
    });

    socket.on('connect', () => {
      console.log('⚡ Socket connected to BAS Server:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('⚡ Socket disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      // Non-fatal, gracefully falls back
      console.warn('Socket connect error (falling back to REST):', err.message);
    });

    // High-value sale alert (> PKR 100,000)
    socket.on('sale:created', (data) => {
      if (data && data.totalAmount >= 100000) {
        haptic.warning();
      }
      emitLocal('sale:created', data);
    });

    // Attendance punch event
    socket.on('attendance:punch', (data) => {
      emitLocal('attendance:punch', data);
    });

    // General ERP system alert
    socket.on('system:alert', (data) => {
      haptic.warning();
      emitLocal('system:alert', data);
    });

  } catch (err) {
    console.warn('Failed to initialize socket connection:', err);
  }

  return socket;
}

/**
 * Subscribe to real-time events
 */
export function subscribeToEvent(eventName, callback) {
  if (!listeners.has(eventName)) {
    listeners.set(eventName, new Set());
  }
  listeners.get(eventName).add(callback);

  return () => {
    const set = listeners.get(eventName);
    if (set) {
      set.delete(callback);
    }
  };
}

function emitLocal(eventName, data) {
  const set = listeners.get(eventName);
  if (set) {
    set.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error('Error in socket listener:', err);
      }
    });
  }
}

/**
 * Disconnect socket on logout
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  listeners.clear();
}

export default {
  initSocket,
  subscribeToEvent,
  disconnectSocket,
};
