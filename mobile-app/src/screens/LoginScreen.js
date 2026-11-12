import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { api, clearApiCache } from '../services/api';
import { haptic } from '../services/haptics';
import {
  checkBiometricAvailability,
  authenticateBiometric,
  getSecureAuth,
  saveSecureAuth,
  isBiometricLoginEnabled
} from '../services/biometrics';

const SAVED_USER_KEY = 'bas_saved_username';
const SAVED_PASS_KEY = 'bas_saved_password';
const REMEMBER_KEY = 'bas_remember_me';

export default function LoginScreen({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Biometric state - always active and visible
  const [biometricAvailable, setBiometricAvailable] = useState(true);
  const [biometricType, setBiometricType] = useState('Face ID / Fingerprint');
  const [hasStoredBiometric, setHasStoredBiometric] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // Load saved credentials & check biometrics on startup
  useEffect(() => {
    loadSavedCredentials();
    initBiometrics();
  }, []);

  const initBiometrics = async () => {
    try {
      const bioStatus = await checkBiometricAvailability();
      if (bioStatus && bioStatus.typeName) {
        setBiometricType(bioStatus.typeName);
      }
      const secureData = await getSecureAuth();
      if (secureData && secureData.token && secureData.user) {
        setHasStoredBiometric(true);
      }
    } catch (e) {
      console.warn('Biometric setup check error:', e);
    }
  };

  const handleBiometricUnlock = async () => {
    setError('');
    haptic.medium();
    setBiometricLoading(true);

    try {
      const authenticated = await authenticateBiometric(
        `Unlock BAS ERP with ${biometricType}`
      );

      if (!authenticated) {
        haptic.warning();
        setBiometricLoading(false);
        return;
      }

      // Biometrics succeeded: fetch credentials from secure hardware storage
      const secureAuth = await getSecureAuth();
      if (secureAuth && secureAuth.token && secureAuth.user) {
        haptic.success();
        onLoginSuccess({
          token: secureAuth.token,
          ...secureAuth.user
        });
        return;
      }

      // If token expired or not stored, fallback to saved username/password login
      const savedUser = await AsyncStorage.getItem(SAVED_USER_KEY);
      const savedPass = await AsyncStorage.getItem(SAVED_PASS_KEY);
      if (savedUser && savedPass) {
        const response = await api.login(savedUser, savedPass);
        if (response.success) {
          await saveSecureAuth(response.token, {
            name: response.name,
            role: response.role,
            code: response.code,
            branch: response.branch
          });
          haptic.success();
          onLoginSuccess(response);
          return;
        }
      }

      setError('Biometrics verified! Please enter your username and password below once to link this device for instant 1-tap unlock.');
      haptic.warning();
    } catch (err) {
      setError(err.message || 'Biometric authentication failed');
      haptic.error();
    } finally {
      setBiometricLoading(false);
    }
  };

  const loadSavedCredentials = async () => {
    try {
      const savedRemember = await AsyncStorage.getItem(REMEMBER_KEY);
      if (savedRemember === 'true') {
        setRememberMe(true);
        const savedUser = await AsyncStorage.getItem(SAVED_USER_KEY);
        const savedPass = await AsyncStorage.getItem(SAVED_PASS_KEY);
        if (savedUser) setUsername(savedUser);
        if (savedPass) setPassword(savedPass);
      } else if (savedRemember === 'false') {
        setRememberMe(false);
      }
    } catch (e) {
      console.error('Failed to load saved login credentials:', e);
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username/code and password');
      haptic.warning();
      return;
    }

    setError('');
    setLoading(true);
    haptic.light();

    try {
      const response = await api.login(username.trim(), password.trim());
      if (response.success) {
        haptic.success();

        // Safely save or clear credentials based on Remember Me toggle
        try {
          if (rememberMe) {
            await AsyncStorage.setItem(REMEMBER_KEY, 'true');
            await AsyncStorage.setItem(SAVED_USER_KEY, username.trim());
            await AsyncStorage.setItem(SAVED_PASS_KEY, password.trim());
          } else {
            await AsyncStorage.setItem(REMEMBER_KEY, 'false');
            await AsyncStorage.removeItem(SAVED_USER_KEY);
            await AsyncStorage.removeItem(SAVED_PASS_KEY);
          }
        } catch (storageErr) {
          console.warn('Storage save warning during login:', storageErr);
          if (storageErr?.message && (storageErr.message.includes('SQLITE_FULL') || storageErr.message.includes('disk is full'))) {
            clearApiCache().catch(() => {});
          }
        }

        // Store encrypted auth in Hardware Keystore for Biometrics (non-fatal if keystore/storage fails)
        try {
          await saveSecureAuth(response.token, {
            name: response.name,
            role: response.role,
            code: response.code,
            branch: response.branch
          });
        } catch (secureErr) {
          console.warn('Secure auth save warning during login:', secureErr);
        }

        onLoginSuccess(response);
      } else {
        haptic.error();
        setError(response.message || 'Invalid username or password');
      }
    } catch (err) {
      haptic.error();
      if (err?.message && (err.message.includes('SQLITE_FULL') || err.message.includes('code 13') || err.message.includes('disk is full'))) {
        clearApiCache().catch(() => {});
        setError('App cache limit reached. Local cache has been auto-cleaned. Please tap Login again.');
      } else {
        setError(err.message || 'Network connection failed. Please check internet.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Image
            source={require('../../assets/dwatson-logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.logoText}>BAS</Text>
          <Text style={styles.subtitleText}>Bilal Accessories System</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.instruction}>Login to view real-time attendance, branches, pay slips & advances.</Text>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              {(error.includes('cache') || error.includes('storage') || error.includes('limit') || error.includes('full') || error.includes('SQLITE')) && (
                <TouchableOpacity
                  style={{ marginTop: 8, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: 'rgba(239, 68, 68, 0.25)', borderRadius: 6, alignSelf: 'flex-start' }}
                  onPress={async () => {
                    await clearApiCache();
                    setError('Cache cleared! You can now log in.');
                  }}
                >
                  <Text style={{ color: '#FCA5A5', fontSize: 12, fontWeight: '700' }}>🧹 Tap to Clear App Cache</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          {/* Quick Biometric Button (Always visible on mobile) */}
          {biometricAvailable && (
            <TouchableOpacity
              style={styles.biometricQuickBtn}
              onPress={handleBiometricUnlock}
              disabled={biometricLoading || loading}
              activeOpacity={0.8}
            >
              {biometricLoading ? (
                <ActivityIndicator color="#06B6D4" size="small" />
              ) : (
                <View style={styles.biometricContent}>
                  <View style={styles.biometricIconBadge}>
                    <Ionicons
                      name={biometricType === 'Face ID' ? 'scan' : 'finger-print'}
                      size={26}
                      color="#06B6D4"
                    />
                  </View>
                  <View style={styles.biometricTextCol}>
                    <Text style={styles.biometricBtnText}>
                      Unlock with {biometricType}
                    </Text>
                    <Text style={styles.biometricSubText}>
                      {hasStoredBiometric ? 'Fast 1-touch authentication' : 'Tap to scan and activate fast login'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#38BDF8" />
                </View>
              )}
            </TouchableOpacity>
          )}

          {biometricAvailable && (
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or password</Text>
              <View style={styles.dividerLine} />
            </View>
          )}

          {/* Username Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Employee Code or Username</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 101, admin, or EMP-001"
              placeholderTextColor="#64748B"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Password Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password (CNIC / Mobile / PIN)</Text>
            <View style={styles.passwordInputWrapper}>
              <TextInput
                style={[styles.input, { flex: 1, borderWidth: 0, paddingRight: 40 }]}
                placeholder="Enter password"
                placeholderTextColor="#64748B"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity 
                style={styles.showPassBtn} 
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#94A3B8"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Remember Password Checkbox */}
          <TouchableOpacity 
            style={styles.rememberRow} 
            onPress={() => {
              haptic.light();
              setRememberMe(!rememberMe);
            }}
            activeOpacity={0.8}
          >
            <View style={[styles.checkbox, rememberMe && styles.checkboxActive]}>
              {rememberMe && <Ionicons name="checkmark" size={16} color="#0B1120" />}
            </View>
            <Text style={styles.rememberLabel}>Remember username and password</Text>
          </TouchableOpacity>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <View style={styles.buttonInner}>
                <Ionicons name="lock-closed" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.buttonText}>LOGIN SECURELY</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Secure Biometric Enterprise System</Text>
          <Text style={styles.footerSubText}>Bilal Accessories System © 2026</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1120',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoImage: {
    width: 84,
    height: 84,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  logoText: {
    fontSize: 46,
    fontWeight: '900',
    color: '#38BDF8',
    letterSpacing: 2,
  },
  subtitleText: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 4,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#131D33',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1E293B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  instruction: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 20,
    lineHeight: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#CBD5E1',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  inputGroup: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#F8FAFC',
  },
  passwordInputWrapper: {
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  showPassBtn: {
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  showPassIcon: {
    fontSize: 16,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#475569',
    backgroundColor: '#0B1120',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkboxActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  checkmarkText: {
    color: '#0B1120',
    fontSize: 14,
    fontWeight: '900',
  },
  rememberLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#0284C7',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  buttonDisabled: {
    backgroundColor: '#0369A1',
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#F87171',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  footer: {
    marginTop: 28,
    alignItems: 'center',
  },
  footerText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  footerSubText: {
    color: '#475569',
    fontSize: 11,
    marginTop: 2,
  },
  biometricQuickBtn: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderWidth: 1.5,
    borderColor: '#06B6D4',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  biometricContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 4,
  },
  biometricIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  biometricTextCol: {
    flex: 1,
  },
  biometricBtnText: {
    color: '#38BDF8',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  biometricSubText: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#1E293B',
  },
  dividerText: {
    paddingHorizontal: 12,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
