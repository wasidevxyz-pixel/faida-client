import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import { haptic } from './haptics';

const QUEUE_STORAGE_KEY = '@bas_offline_queue_v1';

/**
 * Get all queued offline items
 */
export async function getOfflineQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to get offline queue:', err);
    return [];
  }
}

/**
 * Enqueue an item for later sync
 */
export async function enqueueOfflineAction(action) {
  try {
    const queue = await getOfflineQueue();
    const item = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: Date.now(),
      action: action.type || 'attendance_punch',
      payload: action.payload || {},
      retries: 0,
    };
    queue.push(item);
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    haptic.selection();
    return item;
  } catch (err) {
    console.error('Failed to enqueue offline action:', err);
    throw err;
  }
}

/**
 * Flush and synchronize pending queue with backend
 */
export async function syncOfflineQueue() {
  try {
    const queue = await getOfflineQueue();
    if (queue.length === 0) return { synced: 0, failed: 0 };

    const remaining = [];
    let synced = 0;
    let failed = 0;
    const now = Date.now();

    for (const item of queue) {
      // Auto-purge any items older than 12 hours
      if (item.timestamp && (now - item.timestamp > 12 * 60 * 60 * 1000)) {
        continue;
      }

      try {
        if (item.action === 'attendance_punch') {
          await api.post('/biometric', item.payload);
          synced++;
        } else if (item.payload?.url) {
          await api.post(item.payload.url, item.payload.data || item.payload);
          synced++;
        } else {
          // Unrecognized queue action, safe purge
          synced++;
        }
      } catch (err) {
        item.retries = (item.retries || 0) + 1;
        if (item.retries < 2) {
          remaining.push(item);
        }
        failed++;
      }
    }

    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(remaining));

    if (synced > 0) {
      haptic.success();
    }

    return { synced, failed, remaining: remaining.length };
  } catch (err) {
    console.error('Failed during syncOfflineQueue:', err);
    return { synced: 0, failed: 0, remaining: 0 };
  }
}

/**
 * Clear queue
 */
export async function clearOfflineQueue() {
  await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
}

export default {
  getOfflineQueue,
  enqueueOfflineAction,
  syncOfflineQueue,
  clearOfflineQueue,
};
