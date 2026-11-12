import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Animated
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { haptic } from '../../services/haptics';
import { colors } from '../../theme/colors';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function CameraBarcodeScannerModal({
  visible,
  onClose,
  onScan,
  title = 'Scan Product Barcode'
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [isCameraMounted, setIsCameraMounted] = useState(false);
  const [cameraSessionKey, setCameraSessionKey] = useState(1);

  // Animated laser beam scan line
  const laserAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    let t;
    if (visible) {
      setScanned(false);
      setTorch(false);
      if (!permission?.granted && requestPermission) {
        requestPermission();
      }
      // Delay mounting CameraView slightly to ensure Android native dialog window has finalized layout
      t = setTimeout(() => {
        setIsCameraMounted(true);
      }, 180);

      // Start laser scan animation loop
      Animated.loop(
        Animated.sequence([
          Animated.timing(laserAnim, {
            toValue: 220,
            duration: 1800,
            useNativeDriver: true,
          }),
          Animated.timing(laserAnim, {
            toValue: 0,
            duration: 1800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      setIsCameraMounted(false);
    }

    return () => {
      if (t) clearTimeout(t);
    };
  }, [visible, permission?.granted, cameraSessionKey, laserAnim]);

  const handleBarcodeScanned = ({ type, data }) => {
    if (scanned) return;
    setScanned(true);
    haptic.success();
    if (onScan) {
      onScan(data);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={false}
      hardwareAccelerated={true}
      statusBarTranslucent={true}
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />

        {/* Top Header Controls */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => {
              haptic.light();
              onClose();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.closeBtnText}>✕ Close</Text>
          </TouchableOpacity>

          <Text style={styles.titleText}>{title}</Text>

          <TouchableOpacity
            style={[styles.torchBtn, torch && styles.torchBtnActive]}
            onPress={() => {
              haptic.light();
              setTorch(prev => !prev);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.torchBtnText}>{torch ? '⚡ ON' : '💡 Torch'}</Text>
          </TouchableOpacity>
        </View>

        {/* Camera or Permission Prompt */}
        {!permission?.granted ? (
          <View style={styles.permissionContainer}>
            <Text style={styles.permissionEmoji}>📷</Text>
            <Text style={styles.permissionTitle}>Camera Permission Required</Text>
            <Text style={styles.permissionSub}>
              Camera access is needed to scan inventory barcodes, carton stickers, and QR codes instantly.
            </Text>
            <TouchableOpacity
              style={styles.grantBtn}
              onPress={requestPermission}
              activeOpacity={0.8}
            >
              <Text style={styles.grantBtnText}>Grant Camera Permission</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraWrapper}>
            {isCameraMounted && (
              <CameraView
                key={`cam_view_${cameraSessionKey}`}
                style={styles.camera}
                facing="back"
                autofocus="on"
                enableTorch={torch}
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                barcodeScannerSettings={{
                  barcodeTypes: [
                    'qr',
                    'ean13',
                    'ean8',
                    'code128',
                    'code39',
                    'upc_a',
                    'upc_e',
                  ],
                }}
              />
            )}

            {/* Target Reticle Overlay */}
            <View style={styles.reticleFrame} pointerEvents="none">
              {/* 4 Corner Markers */}
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />

              {/* Animated Laser Beam */}
              <Animated.View
                style={[
                  styles.laserBeam,
                  {
                    transform: [{ translateY: laserAnim }],
                  },
                ]}
              />
            </View>

            <View style={styles.footerNote}>
              <Text style={styles.footerNoteText}>
                Align barcode inside square frame to auto-detect
              </Text>
              {scanned ? (
                <TouchableOpacity
                  style={styles.rescanBtn}
                  onPress={() => {
                    haptic.selection();
                    setScanned(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.rescanBtnText}>Tap to Scan Again 🔄</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.rescanBtn, { backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 8 }]}
                  onPress={() => {
                    haptic.light();
                    setCameraSessionKey(k => k + 1);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.rescanBtnText, { color: '#94A3B8', fontSize: 12 }]}>Reset Camera View 🔄</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const RETICLE_SIZE = 250;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1120',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 8 : 14,
    paddingBottom: 14,
    backgroundColor: '#131D33',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  closeBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  closeBtnText: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 13,
  },
  titleText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  torchBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  torchBtnActive: {
    backgroundColor: '#F59E0B',
  },
  torchBtnText: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 13,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permissionEmoji: {
    fontSize: 54,
    marginBottom: 16,
  },
  permissionTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  permissionSub: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  grantBtn: {
    backgroundColor: colors?.cyan || '#06B6D4',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  grantBtnText: {
    color: '#0B1120',
    fontWeight: '800',
    fontSize: 14,
  },
  cameraWrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  reticleFrame: {
    width: RETICLE_SIZE,
    height: RETICLE_SIZE,
    borderRadius: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: colors?.cyan || '#06B6D4',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 10,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 10,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 10,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 10,
  },
  laserBeam: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 2.5,
    backgroundColor: '#38BDF8',
    shadowColor: '#38BDF8',
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 6,
  },
  footerNote: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
    backgroundColor: 'rgba(11,17,32,0.85)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  footerNoteText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  rescanBtn: {
    marginTop: 8,
    backgroundColor: colors?.cyan || '#06B6D4',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  rescanBtnText: {
    color: '#0B1120',
    fontWeight: '800',
    fontSize: 12.5,
  },
});
