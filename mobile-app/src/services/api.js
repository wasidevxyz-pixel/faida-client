import AsyncStorage from '@react-native-async-storage/async-storage';

// BASE_URL matches your central backend address
const BASE_URL = 'https://bas.dwatson.co/api/v1';

let authToken = null;

// Load token from storage on app startup
export const initToken = async () => {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (token) {
      authToken = token;
      return token;
    }
  } catch (e) {
    console.error('Failed to load token', e);
    return null;
  }
};

// Retrieve token from memory or storage
export const getAuthToken = async () => {
  if (authToken) return authToken;
  try {
    return await AsyncStorage.getItem('userToken');
  } catch (e) {
    return null;
  }
};

// Set token in state & local storage
export const saveToken = async (token) => {
  authToken = token; // Always preserve in memory so API calls succeed immediately
  try {
    await AsyncStorage.setItem('userToken', token);
  } catch (e) {
    console.warn('Failed to save token to storage:', e);
    // If SQLite or disk is full, auto-purge cache to recover space and retry once
    if (e?.message && (e.message.includes('SQLITE_FULL') || e.message.includes('disk is full'))) {
      try {
        await clearApiCache();
        await AsyncStorage.setItem('userToken', token);
      } catch (retryErr) {
        console.warn('Token save retry failed after cache clear:', retryErr);
      }
    }
  }
};

// Clear token on logout
export const clearToken = async () => {
  authToken = null;
  try {
    await AsyncStorage.removeItem('userToken');
  } catch (e) {
    console.error('Failed to clear token', e);
  }
};

let authErrorHandler = null;
export const setAuthErrorHandler = (fn) => {
  authErrorHandler = fn;
};

// Stale-While-Revalidate Cache Helpers
const CACHE_PREFIX = 'bas_cache_';
const MAX_CACHE_ENTRIES = 20;

export const getCachedData = async (key) => {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
};

export const setCachedData = async (key, data) => {
  try {
    const jsonStr = JSON.stringify({
      data,
      timestamp: Date.now(),
    });

    // Allow caching dashboard payloads up to 500KB
    if (jsonStr.length > 500000) {
      return;
    }

    await AsyncStorage.setItem(`${CACHE_PREFIX}${key}`, jsonStr);
  } catch (e) {
    // If SQLite or disk is full, purge old API cache to liberate space immediately
    if (e?.message && (e.message.includes('SQLITE_FULL') || e.message.includes('disk is full') || e.message.includes('code 13'))) {
      console.warn('[Cache] SQLite database full, purging API cache...');
      clearApiCache().catch(() => {});
    }
  }
};

export const clearApiCache = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
      console.log(`[Cache] Cleared ${cacheKeys.length} cached API responses.`);
    }
  } catch (e) {
    console.warn('Failed to clear API cache:', e);
  }
};

// Server Addresses (Official Cloudflare Production Domain)
const PRIMARY_URL = 'https://bas.dwatson.co/api/v1';
const LOCAL_FALLBACK_URL = 'http://192.168.1.4:5000/api/v1';
let activeBaseUrl = PRIMARY_URL;

// Auto-clean any stale local LAN URL from storage so mobile app always uses production domain
(async () => {
  try {
    const saved = await AsyncStorage.getItem('active_base_url');
    if (saved && (saved.includes('192.168.') || saved.includes('10.') || saved.includes('localhost'))) {
      await AsyncStorage.removeItem('active_base_url');
      activeBaseUrl = PRIMARY_URL;
    }
  } catch {}
})();

// Helper to make a single HTTP request with timeout
const makeSingleRequest = async (baseUrl, endpoint, options) => {
  const url = `${baseUrl}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  // Short timeout for LAN fallback (1200ms) vs 15000ms for production URL to allow DB aggregations over cellular
  const timeoutMs = options.timeout || (baseUrl === LOCAL_FALLBACK_URL ? 1200 : 15000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    // Failover on Cloudflare 530/502/503 origin errors
    if (response.status === 530 || response.status === 502 || response.status === 503) {
      throw new Error(`Cloudflare gateway error (${response.status})`);
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      if (!response.ok) throw new Error(text || `Server error (${response.status})`);
      throw new Error('Unexpected response format from server');
    }

    if (!response.ok) {
      if (response.status === 401 && !endpoint.includes('/auth/login')) {
        if (authErrorHandler) {
          authErrorHandler(data?.message || 'Session expired. Please sign in again.');
        }
      }
      throw new Error(data?.message || data?.error || `API request failed (${response.status})`);
    }

    // Strip any stale offline flags on successful live response
    if (data && typeof data === 'object') {
      delete data._isOffline;
      delete data._cachedAt;
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
};

// Generic fetch wrapper with Authorization header, timeout, failover, and offline cache fallback
const fetchAPI = async (endpoint, options = {}) => {
  const isGet = !options.method || options.method === 'GET';
  const cacheKey = endpoint;

  // 1. Try PRIMARY_URL first
  try {
    const data = await makeSingleRequest(PRIMARY_URL, endpoint, options);
    activeBaseUrl = PRIMARY_URL;
    if (isGet && data) {
      setCachedData(cacheKey, data);
    }
    return data;
  } catch (firstErr) {
    // 2. Only attempt local LAN fallback if Cloudflare returns gateway error (502/503/530)
    const isCloudflareError = firstErr?.message && (
      firstErr.message.includes('530') ||
      firstErr.message.includes('502') ||
      firstErr.message.includes('503')
    );

    if (isCloudflareError && firstErr.name !== 'AbortError') {
      try {
        const data = await makeSingleRequest(LOCAL_FALLBACK_URL, endpoint, { ...options, timeout: 1200 });
        console.log(`[API Failover] Connected via LAN: ${LOCAL_FALLBACK_URL}`);
        activeBaseUrl = LOCAL_FALLBACK_URL;
        if (isGet && data) {
          setCachedData(cacheKey, data);
        }
        return data;
      } catch {}
    }

    // 3. Fall back to offline cache for GET requests
    if (isGet) {
      const cached = await getCachedData(cacheKey);
      if (cached && cached.data) {
        console.warn(`[Offline Cache] Serving ${endpoint} from cache (${new Date(cached.timestamp).toLocaleTimeString()})`);
        const result = cached.data;
        if (typeof result === 'object' && result !== null) {
          result._isOffline = true;
          result._cachedAt = cached.timestamp;
        }
        return result;
      }
    }

    if (firstErr.name === 'AbortError') {
      throw new Error('Connection timed out. Please check your internet connection or Wi-Fi.');
    }
    console.error(`API Error on ${endpoint}:`, firstErr.message);
    throw firstErr;
  }
};

// API Endpoints
export const api = {
  // Generic HTTP methods
  get: (endpoint, options = {}) => {
    return fetchAPI(endpoint, { method: 'GET', ...options });
  },
  post: (endpoint, body, options = {}) => {
    return fetchAPI(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
      ...options
    });
  },
  put: (endpoint, body, options = {}) => {
    return fetchAPI(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
      ...options
    });
  },
  delete: (endpoint, options = {}) => {
    return fetchAPI(endpoint, { method: 'DELETE', ...options });
  },

  // Authentication
  login: async (username, password) => {
    const res = await fetchAPI('/mobile/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (res.success && res.token) {
      await saveToken(res.token);
    }
    return res;
  },

  // Verify credentials without overriding the current user session token
  verifyAdminCredentials: async (username, password) => {
    return fetchAPI('/mobile/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  // Delete Payroll / Salary Slip (Permanently removes from DB and Web ERP)
  deletePayroll: async (id, adminToken = null) => {
    const options = { method: 'DELETE' };
    if (adminToken) {
      options.headers = { Authorization: `Bearer ${adminToken}` };
    }
    return fetchAPI(`/payrolls/${id}`, options);
  },

  // Employee Advance Management API (Full parity with Web ERP)
  getEmployeeAdvances: async (queryStr = '') => {
    const q = queryStr.startsWith('?') || !queryStr ? queryStr : `?${queryStr}`;
    return fetchAPI(`/employee-advances${q}`);
  },

  getEmployeeAdvance: async (id) => {
    return fetchAPI(`/employee-advances/${id}`);
  },

  createEmployeeAdvance: async (data, adminToken = null) => {
    const options = {
      method: 'POST',
      body: JSON.stringify(data)
    };
    if (adminToken) {
      options.headers = { Authorization: `Bearer ${adminToken}` };
    }
    return fetchAPI('/employee-advances', options);
  },

  updateEmployeeAdvance: async (id, data, adminToken = null) => {
    const options = {
      method: 'PUT',
      body: JSON.stringify(data)
    };
    if (adminToken) {
      options.headers = { Authorization: `Bearer ${adminToken}` };
    }
    return fetchAPI(`/employee-advances/${id}`, options);
  },

  deleteEmployeeAdvance: async (id, adminToken = null) => {
    const options = { method: 'DELETE' };
    if (adminToken) {
      options.headers = { Authorization: `Bearer ${adminToken}` };
    }
    return fetchAPI(`/employee-advances/${id}`, options);
  },

  getInstallmentPlan: async (employeeId, date = '') => {
    let url = `/employee-advances/installment-plan?employee=${employeeId}`;
    if (date) url += `&date=${encodeURIComponent(date)}`;
    return fetchAPI(url);
  },

  saveInstallmentPlan: async (planData, adminToken = null) => {
    const options = {
      method: 'POST',
      body: JSON.stringify(planData)
    };
    if (adminToken) {
      options.headers = { Authorization: `Bearer ${adminToken}` };
    }
    return fetchAPI('/employee-advances/installment-plan', options);
  },

  // Attendance
  getMyLogs: (month, year, employeeId = null) => {
    let query = `?month=${month}&year=${year}`;
    if (employeeId) query += `&employeeId=${employeeId}`;
    return fetchAPI(`/mobile/attendance/my-logs${query}`);
  },

  getAdminSummary: () => {
    return fetchAPI('/mobile/attendance/admin-summary');
  },

  // Shift & Schedule
  getSchedule: (employeeId = null) => {
    const query = employeeId ? `?employeeId=${employeeId}` : '';
    return fetchAPI(`/mobile/schedule${query}`);
  },

  // Holidays
  getHolidays: () => {
    return fetchAPI('/mobile/holidays');
  },

  // Branch statuses
  getBranches: () => {
    return fetchAPI('/mobile/branches');
  },

  // Employee Management (Calls main BAS employee routes)
  getNextEmployeeCode: () => {
    return fetchAPI('/employees/next-code');
  },

  getDepartments: () => {
    return fetchAPI(`/employee-departments?t=${Date.now()}`);
  },

  getDesignations: () => {
    return fetchAPI(`/designations?t=${Date.now()}`);
  },

  getEmployeeById: (id) => {
    return fetchAPI(`/employees/${id}?t=${Date.now()}`);
  },

  getAllEmployees: (params = {}) => {
    const qp = new URLSearchParams({ limit: '5000', t: String(Date.now()), ...params });
    return fetchAPI(`/employees?${qp.toString()}`);
  },

  createEmployee: (employeeData) => {
    return fetchAPI('/employees', {
      method: 'POST',
      body: JSON.stringify(employeeData),
    });
  },

  updateEmployee: (id, employeeData) => {
    return fetchAPI(`/employees/${id}`, {
      method: 'PUT',
      body: JSON.stringify(employeeData),
    });
  },

  // Warehouse Reports & Analytics
  getWHCustomerLedger: (customerId, from, to) => {
    let query = `?customer=${customerId}`;
    if (from) query += `&from=${from}`;
    if (to) query += `&to=${to}`;
    return fetchAPI(`/wh-ledger/report${query}`);
  },

  getWHCustomerBalances: (category = '', balanceOnly = false) => {
    let query = '?';
    if (category) query += `category=${encodeURIComponent(category)}&`;
    if (balanceOnly) query += `balanceOnly=true&`;
    return fetchAPI(`/wh-ledger/balances${query}`);
  },

  getWHStockPosition: (params = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.criteria) query.append('criteria', params.criteria);
    if (params.company) query.append('company', params.company);
    if (params.category) query.append('category', params.category);
    if (params.itemClass) query.append('itemClass', params.itemClass);
    if (params.class && !params.itemClass) query.append('itemClass', params.class);
    if (params.subClass) query.append('subClass', params.subClass);
    return fetchAPI(`/wh-ledger/stock-position?${query.toString()}`);
  },

  getWHItemLedger: (itemId, from, to) => {
    let query = `?item=${itemId}`;
    if (from) query += `&from=${from}`;
    if (to) query += `&to=${to}`;
    return fetchAPI(`/wh-ledger/item-ledger${query}`);
  },

  getWHStockActivity: (from, to, criteria = '', search = '', category = '', subClass = '', itemClass = '') => {
    const query = new URLSearchParams();
    if (from) query.append('from', from);
    if (to) query.append('to', to);
    if (criteria) query.append('criteria', criteria);
    if (search) query.append('search', search);
    if (category) query.append('category', category);
    if (itemClass) query.append('itemClass', itemClass);
    if (subClass) query.append('subClass', subClass);
    return fetchAPI(`/wh-ledger/stock-activity?${query.toString()}`);
  },

  getWHStockAudits: (params = {}) => {
    const query = new URLSearchParams();
    if (params.status) query.append('status', params.status);
    if (params.startDate) query.append('startDate', params.startDate);
    if (params.endDate) query.append('endDate', params.endDate);
    if (params.limit) query.append('limit', params.limit);
    if (params.page) query.append('page', params.page);
    return fetchAPI(`/wh-stock-audits?${query.toString()}`);
  },

  getWHStockAudit: (id) => {
    return fetchAPI(`/wh-stock-audits/${id}`);
  },

  // Warehouse Lookup Helpers
  getWHCustomers: (search = '', category = '') => {
    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (category) query.append('category', category);
    const qs = query.toString();
    return fetchAPI(`/wh-customers${qs ? `?${qs}` : ''}`);
  },

  getWHItems: (search = '', category = '', subClass = '', itemClass = '') => {
    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (category) query.append('category', category);
    if (itemClass) query.append('itemClass', itemClass);
    if (subClass) query.append('subClass', subClass);
    const qs = query.toString();
    return fetchAPI(`/wh-items${qs ? `?${qs}` : ''}`);
  },

  getWHCustomerCategories: () => {
    return fetchAPI('/wh-customer-categories');
  },

  getWHItemCategories: () => {
    return fetchAPI('/wh-item-categories');
  },

  getWHItemCompanies: () => {
    return fetchAPI('/wh-item-companies');
  },

  getWHItemClasses: () => {
    return fetchAPI('/wh-item-classes');
  },

  getWHItemSubClasses: () => {
    return fetchAPI('/wh-item-subclasses');
  },

  // Warehouse Suppliers
  getWHSuppliers: (search = '') => {
    const query = new URLSearchParams();
    if (search) query.append('search', search);
    const qs = query.toString();
    return fetchAPI(`/wh-suppliers${qs ? `?${qs}` : ''}`);
  },

  // Warehouse Sales
  getWHSales: (params = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.customer) query.append('customer', params.customer);
    if (params.startDate) query.append('startDate', params.startDate);
    if (params.endDate) query.append('endDate', params.endDate);
    if (params.status) query.append('status', params.status);
    if (params.limit) query.append('limit', params.limit);
    if (params.page) query.append('page', params.page);
    const qs = query.toString();
    return fetchAPI(`/wh-sales${qs ? `?${qs}` : ''}`);
  },

  getWHSale: (id) => {
    return fetchAPI(`/wh-sales/${id}`);
  },

  getNextWHSaleNumber: () => {
    return fetchAPI('/wh-sales/next-number');
  },

  createWHSale: (saleData) => {
    return fetchAPI('/wh-sales', {
      method: 'POST',
      body: JSON.stringify(saleData),
    });
  },

  updateWHSale: (id, saleData) => {
    return fetchAPI(`/wh-sales/${id}`, {
      method: 'PUT',
      body: JSON.stringify(saleData),
    });
  },

  // Warehouse Purchases
  getWHPurchases: (params = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.supplier) query.append('supplier', params.supplier);
    if (params.startDate) query.append('startDate', params.startDate);
    if (params.endDate) query.append('endDate', params.endDate);
    if (params.status) query.append('status', params.status);
    if (params.limit) query.append('limit', params.limit);
    if (params.page) query.append('page', params.page);
    const qs = query.toString();
    return fetchAPI(`/wh-purchases${qs ? `?${qs}` : ''}`);
  },

  getWHPurchase: (id) => {
    return fetchAPI(`/wh-purchases/${id}`);
  },

  getNextWHPurchaseNumber: () => {
    return fetchAPI('/wh-purchases/next-number');
  },

  createWHPurchase: (purchaseData) => {
    return fetchAPI('/wh-purchases', {
      method: 'POST',
      body: JSON.stringify(purchaseData),
    });
  }
};

export default api;
