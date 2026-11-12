import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  PanResponder,
  Animated,
  Dimensions,
  BackHandler,
  Platform,
  AppState,
  Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';

// Services
import { initToken, clearToken, clearApiCache, setAuthErrorHandler } from './src/services/api';
import { clearSecureAuth, getSecureAuth } from './src/services/biometrics';
import { initSocket, subscribeToEvent, disconnectSocket } from './src/services/socketService';
import { syncOfflineQueue } from './src/services/offlineQueue';

// Common Components
import BottomNavBar from './src/components/common/BottomNavBar';
import HighValueSaleAlert from './src/components/common/HighValueSaleAlert';
import OfflineBanner from './src/components/common/OfflineBanner';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import AttendanceScreen from './src/screens/AttendanceScreen';
import ScheduleScreen from './src/screens/ScheduleScreen';
import HolidaysScreen from './src/screens/HolidaysScreen';
import CreateEmployeeScreen from './src/screens/CreateEmployeeScreen';
import BranchStatusScreen from './src/screens/BranchStatusScreen';
import BranchEmployeesScreen from './src/screens/BranchEmployeesScreen';
import EmployeeReportDetailScreen from './src/screens/EmployeeReportDetailScreen';
import EmployeeDirectoryScreen from './src/screens/EmployeeDirectoryScreen';
import EmployeeProfileDetailScreen from './src/screens/EmployeeProfileDetailScreen';
import MarkLeaveScreen from './src/screens/MarkLeaveScreen';
import EmployeeFinancialsScreen from './src/screens/EmployeeFinancialsScreen';
import WHReportsScreen from './src/screens/WHReportsScreen';
import EmpSalaryReportsScreen from './src/screens/EmpSalaryReportsScreen';
import WHSaleEntryScreen from './src/screens/WHSaleEntryScreen';
import WHPurchaseEntryScreen from './src/screens/WHPurchaseEntryScreen';
import GenerateSalarySlipScreen from './src/screens/GenerateSalarySlipScreen';
import BranchNightClosingScreen from './src/screens/BranchNightClosingScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import EmployeeRegistrationScreen from './src/screens/EmployeeRegistrationScreen';
import EmployeeAdvanceScreen from './src/screens/EmployeeAdvanceScreen';

const SCREEN_WIDTH = Dimensions.get('window').width;

// 15 Minutes Inactivity Timeout (in milliseconds)
const INACTIVITY_TIMEOUT = 15 * 60 * 1000;

export default function App() {
  const [appReady, setAppReady] = useState(false);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [currentScreen, setCurrentScreen] = useState('Login');
  const [screenParams, setScreenParams] = useState({});
  const [history, setHistory] = useState([]);
  const [highValueAlert, setHighValueAlert] = useState(null);

  // Animated translation for fluid swipe-back gesture
  const panX = useRef(new Animated.Value(0)).current;

  // Refs for callbacks in PanResponder & BackHandler
  const currentScreenRef = useRef(currentScreen);
  const historyRef = useRef(history);
  const screenParamsRef = useRef(screenParams);

  // Inactivity tracking refs
  const lastActivityRef = useRef(Date.now());
  const tokenRef = useRef(token);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Root touch listener capture for 15-minute idle tracking
  const inactivityPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => {
        recordActivity();
        return false;
      },
      onMoveShouldSetPanResponderCapture: () => {
        recordActivity();
        return false;
      },
    })
  ).current;

  useEffect(() => {
    currentScreenRef.current = currentScreen;
  }, [currentScreen]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    screenParamsRef.current = screenParams;
  }, [screenParams]);

  const handleLogout = async () => {
    disconnectSocket();
    await clearToken();
    await clearSecureAuth();
    await AsyncStorage.removeItem('userData');
    await AsyncStorage.removeItem('lastActivityTime');
    setToken(null);
    setUser(null);
    setHistory([]);
    setCurrentScreen('Login');
  };

  const handleAutoLogout = async (reason) => {
    await handleLogout();
    Alert.alert('Session Expired', reason || 'You have been logged out due to 15 minutes of inactivity.');
  };

  // Real-time live sync & offline queue synchronizer
  useEffect(() => {
    if (token) {
      initSocket(token);
      syncOfflineQueue().catch(() => {});

      const unsub = subscribeToEvent('sale:created', (data) => {
        if (data && (data.totalAmount >= 100000 || data.amount >= 100000)) {
          setHighValueAlert(data);
        }
      });

      return () => {
        unsub();
      };
    } else {
      disconnectSocket();
    }
  }, [token]);

  // Periodic Foreground Inactivity Checker (every 10 seconds)
  useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      if (!tokenRef.current) return;
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= INACTIVITY_TIMEOUT) {
        handleAutoLogout('You have been logged out due to 15 minutes of inactivity.');
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [token]);

  // AppState change listener (Background / Inactive -> Active resume check)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        if (tokenRef.current) {
          syncOfflineQueue().catch(() => {});
          const elapsed = Date.now() - lastActivityRef.current;
          if (elapsed >= INACTIVITY_TIMEOUT) {
            handleAutoLogout('You have been logged out due to 15 minutes of inactivity.');
          } else {
            recordActivity();
          }
        }
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        if (tokenRef.current) {
          AsyncStorage.setItem('lastActivityTime', String(lastActivityRef.current)).catch(() => {});
        }
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // Register global 401 Unauthorized handler (e.g. after PM2 restart / server boot ID change)
    setAuthErrorHandler(async (msg) => {
      await clearToken();
      await AsyncStorage.removeItem('userData');
      await AsyncStorage.removeItem('lastActivityTime');
      setToken(null);
      setUser(null);
      setCurrentScreen('Login');
      Alert.alert('Session Expired', msg || 'Server updated. Please log in again.');
    });

    const bootstrapApp = async () => {
      try {
        const savedToken = await initToken();
        const savedUserStr = await AsyncStorage.getItem('userData');
        const savedLastActivity = await AsyncStorage.getItem('lastActivityTime');
        
        if (savedToken && savedUserStr) {
          if (savedLastActivity && (Date.now() - parseInt(savedLastActivity, 10) >= INACTIVITY_TIMEOUT)) {
            // Expired while app was closed
            await clearToken();
            await AsyncStorage.removeItem('userData');
            await AsyncStorage.removeItem('lastActivityTime');
          } else {
            setToken(savedToken);
            setUser(JSON.parse(savedUserStr));
            setCurrentScreen('Dashboard');
            lastActivityRef.current = Date.now();
            AsyncStorage.setItem('lastActivityTime', String(Date.now())).catch(() => {});
          }
        }
      } catch (e) {
        console.error('Failed to restore login session', e);
      } finally {
        setAppReady(false);
        setTimeout(() => setAppReady(true), 600);
      }
    };

    bootstrapApp();
  }, []);

  const handleLoginSuccess = async (loginResponse) => {
    const userData = {
      name: loginResponse.name,
      role: loginResponse.role,
      code: loginResponse.code,
      branch: loginResponse.branch
    };

    setToken(loginResponse.token);
    setUser(userData);
    lastActivityRef.current = Date.now();
    
    try {
      await AsyncStorage.setItem('userData', JSON.stringify(userData));
      await AsyncStorage.setItem('lastActivityTime', String(Date.now()));
    } catch (storageErr) {
      console.warn('Storage save warning for userData:', storageErr);
    }

    setHistory([]);
    setCurrentScreen('Dashboard');
  };

  const navigate = useCallback((screenName, params = {}) => {
    const current = currentScreenRef.current;
    if (screenName === current) {
      setScreenParams(params);
      return;
    }

    if (screenName === 'Dashboard') {
      // Navigating back to Dashboard resets navigation stack
      setHistory([]);
    } else if (current !== 'Login') {
      // Push previous screen onto history stack
      setHistory(prev => [...prev, { screen: current, params: screenParamsRef.current }]);
    }

    setScreenParams(params);
    setCurrentScreen(screenName);
  }, []);

  const goBack = useCallback(() => {
    const current = currentScreenRef.current;
    if (current === 'Login' || current === 'Dashboard') {
      return false;
    }

    const currentHistory = historyRef.current;
    if (currentHistory && currentHistory.length > 0) {
      const prev = currentHistory[currentHistory.length - 1];
      setHistory(h => h.slice(0, -1));
      setCurrentScreen(prev.screen);
      setScreenParams(prev.params || {});
      return true;
    } else {
      // Fallback to Dashboard
      setHistory([]);
      setCurrentScreen('Dashboard');
      setScreenParams({});
      return true;
    }
  }, []);

  // System/Hardware Back Button Handler (Android)
  useEffect(() => {
    const onBackPress = () => {
      if (currentScreenRef.current !== 'Dashboard' && currentScreenRef.current !== 'Login') {
        return goBack();
      }
      return false; // Allow system default exit/minimize on Dashboard/Login
    };

    const backSubscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backSubscription.remove();
  }, [goBack]);

  // Swipe Back Gesture Responder ("Back Swap / Swipe Option")
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const cur = currentScreenRef.current;
        if (cur === 'Login' || cur === 'Dashboard') {
          return false;
        }

        // Trigger swipe-back when dragging rightwards starting from near left edge (<= 75px)
        const touchStartX = evt.nativeEvent.pageX - gestureState.dx;
        const isFromLeftEdge = touchStartX <= 75;
        const isHorizontalRightDrag = gestureState.dx > 15 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5;
        return isFromLeftEdge && isHorizontalRightDrag;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dx > 0) {
          panX.setValue(Math.min(gestureState.dx, SCREEN_WIDTH));
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        // If swiped right past 22% of screen or with brisk rightward velocity
        const shouldPop = gestureState.dx > SCREEN_WIDTH * 0.22 || (gestureState.dx > 35 && gestureState.vx > 0.45);
        if (shouldPop) {
          Animated.timing(panX, {
            toValue: SCREEN_WIDTH,
            duration: 150,
            useNativeDriver: true,
          }).start(() => {
            panX.setValue(0);
            goBack();
          });
        } else {
          // Snap back smoothly
          Animated.spring(panX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(panX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }
    })
  ).current;

  if (!appReady) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#06b6d4" />
      </View>
    );
  }

  // State-based router with unified callable navigation object (supports navigation('Screen') and navigation.navigate('Screen'))
  const navProp = Object.assign(
    (screen, params) => navigate(screen, params),
    { navigate, goBack }
  );

  const renderScreen = () => {
    switch (currentScreen) {
      case 'Login':
        return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
      case 'Dashboard':
        return (
          <DashboardScreen
            user={user}
            onLogout={handleLogout}
            navigation={navigate}
          />
        );
      case 'Attendance':
        if (user?.role === 'employee') {
          return <AttendanceScreen user={user} onBack={goBack} />;
        }
        return <BranchEmployeesScreen navigation={navProp} onBack={goBack} route={{ params: screenParams }} />;
      case 'Schedule':
        return <ScheduleScreen onBack={goBack} />;
      case 'Holidays':
        return <HolidaysScreen onBack={goBack} />;
      case 'CreateEmployee':
        return <CreateEmployeeScreen onBack={goBack} />;
      case 'EmployeeRegistration':
        return (
          <EmployeeRegistrationScreen
            route={{ params: screenParams }}
            navigation={navProp}
            onBack={goBack}
          />
        );
      case 'BranchStatus':
        return <BranchStatusScreen onBack={goBack} />;
      case 'BranchEmployees':
        return <BranchEmployeesScreen navigation={navProp} onBack={goBack} route={{ params: screenParams }} />;
      case 'WHSaleEntry':
        return <WHSaleEntryScreen navigation={navProp} onBack={goBack} />;
      case 'WHPurchaseEntry':
        return <WHPurchaseEntryScreen navigation={navProp} onBack={goBack} />;
      case 'EmployeeReportDetail':
        return (
          <EmployeeReportDetailScreen 
            route={{ params: screenParams }} 
            navigation={navProp} 
          />
        );
      case 'EmployeeDirectory':
        return <EmployeeDirectoryScreen route={{ params: screenParams }} navigation={navProp} onBack={goBack} />;
      case 'EmployeeProfileDetail':
        return (
          <EmployeeProfileDetailScreen 
            route={{ params: screenParams }} 
            navigation={navProp} 
          />
        );
      case 'MarkLeave':
        return (
          <MarkLeaveScreen 
            route={{ params: screenParams }} 
            navigation={navProp} 
          />
        );
      case 'EmployeeFinancials':
        return (
          <EmployeeFinancialsScreen 
            route={{ params: screenParams }} 
            navigation={navProp} 
          />
        );
      case 'WHReports':
        return (
          <WHReportsScreen 
            route={{ params: screenParams }} 
            navigation={navProp} 
          />
        );
      case 'EmpSalaryReports':
        return (
          <EmpSalaryReportsScreen 
            route={{ params: screenParams }} 
            navigation={navProp} 
          />
        );
      case 'GenerateSalarySlip':
        return (
          <GenerateSalarySlipScreen
            route={{ params: screenParams }}
            navigation={navProp}
            onBack={goBack}
          />
        );
      case 'BranchNightClosing':
        return (
          <BranchNightClosingScreen
            route={{ params: screenParams }}
            navigation={navProp}
            onBack={goBack}
          />
        );
      case 'EmployeeAdvance':
        return (
          <EmployeeAdvanceScreen
            route={{ params: screenParams }}
            navigation={navProp}
            onBack={goBack}
          />
        );
      case 'Profile':
        return (
          <ProfileScreen
            user={user}
            onLogout={handleLogout}
            navigation={navProp}
          />
        );
      default:
        return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
    }
  };

  const isSwipeBackEnabled = currentScreen !== 'Login' && currentScreen !== 'Dashboard';

  const getActiveTab = () => {
    if (currentScreen === 'Dashboard') return 'Dashboard';
    if (['WHReports', 'WHSaleEntry', 'WHPurchaseEntry'].includes(currentScreen)) return 'WHReports';
    if (['Attendance', 'BranchEmployees'].includes(currentScreen)) return 'Attendance';
    if (currentScreen === 'EmployeeAdvance') return 'EmployeeAdvance';
    if (['EmpSalaryReports', 'EmployeeFinancials', 'GenerateSalarySlip'].includes(currentScreen)) return 'EmpSalaryReports';
    if (['EmployeeDirectory', 'EmployeeProfileDetail', 'EmployeeRegistration'].includes(currentScreen)) return 'EmployeeDirectory';
    if (currentScreen === 'Profile') return 'Profile';
    return currentScreen;
  };

  return (
    <View style={styles.container} {...inactivityPanResponder.panHandlers}>
      <StatusBar style="light" />
      <Animated.View
        style={[
          styles.screenWrapper,
          isSwipeBackEnabled ? { transform: [{ translateX: panX }] } : null
        ]}
        {...(isSwipeBackEnabled ? panResponder.panHandlers : {})}
      >
        <ErrorBoundary onReset={() => setCurrentScreen('Dashboard')}>
          {renderScreen()}
        </ErrorBoundary>
      </Animated.View>

      {currentScreen !== 'Login' && (
        <ErrorBoundary onReset={() => {}}>
          <BottomNavBar
            activeScreen={getActiveTab()}
            onNavigate={(target) => navigate(target)}
            userRole={user?.role}
          />
        </ErrorBoundary>
      )}

      {/* Real-Time High-Value Sale Notification Alert */}
      <HighValueSaleAlert
        visible={Boolean(highValueAlert)}
        sale={highValueAlert}
        onDismiss={() => setHighValueAlert(null)}
      />
    </View>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Mobile App ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.emoji}>⚠️</Text>
          <Text style={errorStyles.title}>UI Component Error</Text>
          <Text style={errorStyles.message}>
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </Text>
          <TouchableOpacity style={errorStyles.button} onPress={this.handleReset} activeOpacity={0.8}>
            <Text style={errorStyles.buttonText}>Reload View</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1120',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emoji: {
    fontSize: 42,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  message: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  button: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  }
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  screenWrapper: {
    flex: 1,
  },
  splash: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
