import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { haptic } from '../../services/haptics';
import { getOfflineQueue, syncOfflineQueue } from '../../services/offlineQueue';

export default function OfflineBanner({
  isOffline = false,
  isCached = false,
  lastUpdated,
  onRefresh
}) {
  const [queueCount, setQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState(null);

  // Check queue periodically
  useEffect(() => {
    let isMounted = true;
    const checkQueue = async () => {
      try {
        const queue = await getOfflineQueue();
        if (isMounted) {
          setQueueCount(queue.length);
        }
      } catch {}
    };

    checkQueue();
    const interval = setInterval(checkQueue, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const [dismissed, setDismissed] = useState(false);

  const handleManualSync = async () => {
    try {
      haptic.light();
      setIsSyncing(true);
      const res = await syncOfflineQueue();
      const queue = await getOfflineQueue();
      setQueueCount(queue.length);
      if (res && res.synced > 0) {
        setSyncStatusMsg(`Synced ${res.synced} items to MongoDB Atlas!`);
        setTimeout(() => setSyncStatusMsg(null), 4000);
      } else if (res && res.failed > 0) {
        setSyncStatusMsg(`Sync attempted: ${res.failed} pending retry`);
        setTimeout(() => setSyncStatusMsg(null), 3000);
      } else {
        setSyncStatusMsg('All records up-to-date with server');
        setTimeout(() => setSyncStatusMsg(null), 2500);
      }
    } catch (e) {
      console.error('Manual sync error:', e);
    } finally {
      setIsSyncing(false);
      if (onRefresh) onRefresh();
    }
  };

  const handleDismiss = async () => {
    try {
      haptic.light();
      await clearOfflineQueue();
      setQueueCount(0);
      setDismissed(true);
      if (onRefresh) onRefresh();
    } catch {}
  };

  const showBanner = !dismissed && (isOffline || isCached || queueCount > 0 || Boolean(syncStatusMsg));
  if (!showBanner) return null;

  return (
    <View style={[
      styles.container,
      syncStatusMsg ? styles.successBg : (isOffline || queueCount > 0) ? styles.offlineBg : styles.cachedBg
    ]}>
      <View style={styles.content}>
        {isSyncing ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Ionicons
            name={
              syncStatusMsg 
                ? 'checkmark-circle' 
                : (isOffline || queueCount > 0) 
                  ? 'cloud-offline-outline' 
                  : 'time-outline'
            }
            size={16}
            color="#FFFFFF"
          />
        )}

        <Text style={styles.text} numberOfLines={1}>
          {syncStatusMsg
            ? `🟢 ${syncStatusMsg}`
            : queueCount > 0
              ? `Offline Queue: ${queueCount} item${queueCount > 1 ? 's' : ''}`
              : isOffline
                ? 'Offline Mode - Pull down to refresh'
                : `Showing cached data (${lastUpdated || 'recently'})`}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={handleManualSync}
          disabled={isSyncing}
          activeOpacity={0.7}
        >
          <Ionicons name="sync" size={13} color="#FFFFFF" />
          <Text style={styles.refreshText}>{isSyncing ? 'Syncing...' : 'Sync'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.refreshBtn, { backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 7 }]}
          onPress={handleDismiss}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={14} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
  offlineBg: {
    backgroundColor: '#991B1B',
  },
  cachedBg: {
    backgroundColor: '#854D0E',
  },
  successBg: {
    backgroundColor: '#047857',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.2,
    flex: 1,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  refreshText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  }
});
