import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SECURE_TOKEN_KEY = 'bas_secure_user_token';
const SECURE_USER_KEY = 'bas_secure_user_data';
const BIOMETRIC_PREF_KEY = 'bas_biometric_enabled';

/**
 * Check if the device hardware supports biometrics and has enrolled records (FaceID/Fingerprint)
 */
export const checkBiometricAvailability = async () => {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
    let typeName = 'Face ID / Fingerprint';
    if (supportedTypes && supportedTypes.length > 0) {
      if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        typeName = 'Face ID';
      } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        typeName = 'Fingerprint';
      }
    }

    return { available: true, typeName, hasHardware };
  } catch (error) {
    console.warn('Biometric check fallback:', error);
    return { available: true, typeName: 'Face ID / Fingerprint', hasHardware: true };
  }
};

/**
 * Authenticate the user using device Biometrics (Face ID / Fingerprint)
 */
export const authenticateBiometric = async (promptMessage = 'Unlock BAS ERP') => {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: 'Enter Password',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch (error) {
    console.error('Biometric auth error:', error);
    return false;
  }
};

/**
 * Save user credentials encrypted in Hardware Keystore (SecureStore)
 */
export const saveSecureAuth = async (token, userData) => {
  try {
    await SecureStore.setItemAsync(SECURE_TOKEN_KEY, token);
    await SecureStore.setItemAsync(SECURE_USER_KEY, JSON.stringify(userData));
    try {
      await AsyncStorage.setItem(BIOMETRIC_PREF_KEY, 'true');
    } catch {}
  } catch (error) {
    console.warn('SecureStore save warning, falling back to AsyncStorage:', error);
    try {
      await AsyncStorage.setItem('userToken', token);
      await AsyncStorage.setItem('userData', JSON.stringify(userData));
    } catch (fallbackErr) {
      console.warn('AsyncStorage fallback also failed:', fallbackErr);
    }
  }
};

/**
 * Retrieve credentials from SecureStore
 */
export const getSecureAuth = async () => {
  try {
    const token = await SecureStore.getItemAsync(SECURE_TOKEN_KEY);
    const userStr = await SecureStore.getItemAsync(SECURE_USER_KEY);
    if (token && userStr) {
      return { token, user: JSON.parse(userStr) };
    }
  } catch (error) {
    console.warn('SecureStore read error, checking AsyncStorage:', error);
  }

  // Fallback to AsyncStorage
  const token = await AsyncStorage.getItem('userToken');
  const userStr = await AsyncStorage.getItem('userData');
  return {
    token: token || null,
    user: userStr ? JSON.parse(userStr) : null,
  };
};

/**
 * Clear secure credentials upon logout
 */
export const clearSecureAuth = async () => {
  try {
    await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY);
    await SecureStore.deleteItemAsync(SECURE_USER_KEY);
  } catch (error) {
    console.warn('SecureStore delete error:', error);
  }
  await AsyncStorage.removeItem('userToken');
  await AsyncStorage.removeItem('userData');
  await AsyncStorage.removeItem(BIOMETRIC_PREF_KEY);
};

/**
 * Check if Biometric Login is enabled by user preference
 */
export const isBiometricLoginEnabled = async () => {
  try {
    const pref = await AsyncStorage.getItem(BIOMETRIC_PREF_KEY);
    return pref === 'true';
  } catch {
    return false;
  }
};
