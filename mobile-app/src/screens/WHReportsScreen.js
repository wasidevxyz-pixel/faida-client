import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  ScrollView,
  TextInput,
  Modal,
  FlatList,
  Alert,
  Platform
} from 'react-native';
import api from '../services/api';
import {
  printWHCustomerLedger,
  printWHCustomerBalances,
  printWHStockPosition,
  printWHItemLedger,
  printWHStockActivity,
  printWHStockAudit
} from '../services/printService';
import CameraBarcodeScannerModal from '../components/common/CameraBarcodeScannerModal';
import { haptic } from '../services/haptics';

const REPORT_TABS = [
  { key: 'customer_ledger', label: 'Customer Ledger', icon: '📑' },
  { key: 'customer_balances', label: 'Customer Balances', icon: '💳' },
  { key: 'stock_position', label: 'Stock Position', icon: '📦' },
  { key: 'item_ledger', label: 'Item Ledger', icon: '🔄' },
  { key: 'stock_activity', label: 'Stock Activity', icon: '📊' },
  { key: 'stock_audit', label: 'Stock Audit', icon: '📋' },
];

const STOCK_CRITERIA = [
  { key: '', label: 'All Stock' },
  { key: 'greater', label: 'In Stock (>0)' },
  { key: 'zero', label: 'Zero Stock (0)' },
  { key: 'less', label: 'Negative (<0)' },
  { key: 'incentive', label: 'Incentive Items' },
];

const formatCurrency = (amount) => {
  return Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const formatQty = (amount) => {
  return Number(amount || 0).toLocaleString('en-US');
};

const formatDate = (dateString) => {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-GB');
  } catch (e) {
    return dateString;
  }
};

const getPresetDates = (type) => {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  
  if (type === 'today') {
    return { from: todayStr, to: todayStr };
  } else if (type === 'week') {
    const past = new Date();
    past.setDate(now.getDate() - 7);
    return { from: past.toISOString().split('T')[0], to: todayStr };
  } else if (type === 'month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: firstDay.toISOString().split('T')[0], to: todayStr };
  } else if (type === 'year') {
    const firstJan = new Date(now.getFullYear(), 0, 1);
    return { from: firstJan.toISOString().split('T')[0], to: todayStr };
  }
  return { from: '', to: '' };
};

export default function WHReportsScreen({ route, navigation }) {
  const initialTab = route?.params?.initialTab || 'customer_ledger';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Common Filter States
  const defaultDates = getPresetDates('month');
  const [fromDate, setFromDate] = useState(defaultDates.from);
  const [toDate, setToDate] = useState(defaultDates.to);
  const [searchQuery, setSearchQuery] = useState('');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleBarcodeScan = (scannedCode) => {
    setScannerVisible(false);
    haptic.success();
    if (activeTab === 'item_ledger' && itemsList && itemsList.length > 0) {
      const match = itemsList.find(it =>
        (it.barcode && String(it.barcode).trim().toLowerCase() === scannedCode.trim().toLowerCase()) ||
        (it.itemsCode && String(it.itemsCode).trim().toLowerCase() === scannedCode.trim().toLowerCase()) ||
        (it.name && it.name.toLowerCase().includes(scannedCode.toLowerCase()))
      );
      if (match) {
        setSelectedItem(match);
        return;
      }
    }
    setSearchQuery(scannedCode);
    setTimeout(() => {
      fetchReportData();
    }, 150);
  };

  // 1. WH Customer Ledger States
  const [customersList, setCustomersList] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerLedgerData, setCustomerLedgerData] = useState(null);

  // 2. WH Customer Balances States
  const [customerCategories, setCustomerCategories] = useState([]);
  const [selectedCustomerCategory, setSelectedCustomerCategory] = useState('');
  const [balanceOnly, setBalanceOnly] = useState(false);
  const [balancesData, setBalancesData] = useState([]);

  // 3. WH Stock Position States
  const [stockPositionData, setStockPositionData] = useState([]);
  const [selectedCriteria, setSelectedCriteria] = useState('');
  const [itemCategories, setItemCategories] = useState([]);
  const [selectedItemCategory, setSelectedItemCategory] = useState('');
  const [itemClasses, setItemClasses] = useState([]);
  const [selectedItemClass, setSelectedItemClass] = useState('');
  const [itemSubClasses, setItemSubClasses] = useState([]);
  const [selectedSubClass, setSelectedSubClass] = useState('');

  // 4. WH Item Ledger States
  const [itemsList, setItemsList] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [itemLedgerData, setItemLedgerData] = useState(null);

  // 5. WH Stock Activity States
  const [stockActivityData, setStockActivityData] = useState([]);

  // 6. WH Stock Audit States
  const [stockAuditsList, setStockAuditsList] = useState([]);
  const [selectedAuditStatus, setSelectedAuditStatus] = useState('');
  const [selectedAuditDetail, setSelectedAuditDetail] = useState(null);
  const [auditModalVisible, setAuditModalVisible] = useState(false);

  // Initial Data Lookups
  useEffect(() => {
    loadLookups();
  }, []);

  // Fetch report data on tab/filter change
  useEffect(() => {
    fetchReportData();
  }, [
    activeTab,
    selectedCustomer,
    selectedItem,
    selectedCustomerCategory,
    selectedItemCategory,
    selectedItemClass,
    selectedSubClass,
    selectedCriteria,
    selectedAuditStatus,
    balanceOnly,
    fromDate,
    toDate
  ]);

  const loadLookups = async () => {
    try {
      // Load customers
      const cRes = await api.getWHCustomers();
      if (cRes && cRes.success) {
        setCustomersList(cRes.data || []);
        if (!selectedCustomer && cRes.data && cRes.data.length > 0) {
          setSelectedCustomer(cRes.data[0]);
        }
      }

      // Load items
      const iRes = await api.getWHItems();
      if (iRes && iRes.success) {
        setItemsList(iRes.data || []);
        if (!selectedItem && iRes.data && iRes.data.length > 0) {
          setSelectedItem(iRes.data[0]);
        }
      }

      // Load customer categories
      const ccRes = await api.getWHCustomerCategories();
      if (ccRes && ccRes.success) {
        setCustomerCategories(ccRes.data || []);
      }

      // Load item categories
      const icRes = await api.getWHItemCategories();
      if (icRes && icRes.success) {
        setItemCategories(icRes.data || []);
      }

      // Load item classes (Class wise)
      const iclRes = await api.getWHItemClasses();
      if (iclRes && iclRes.success) {
        setItemClasses(iclRes.data || []);
      }

      // Load item subclasses (Trading, etc.)
      const scRes = await api.getWHItemSubClasses();
      if (scRes && scRes.success) {
        setItemSubClasses(scRes.data || []);
      }
    } catch (e) {
      console.error('Error loading lookups for WH reports:', e);
    }
  };

  const fetchReportData = async () => {
    setLoading(true);
    setErrorMsg('');

    try {
      if (activeTab === 'customer_ledger') {
        if (selectedCustomer?._id) {
          const res = await api.getWHCustomerLedger(selectedCustomer._id, fromDate, toDate);
          if (res && res.success) {
            setCustomerLedgerData(res.data);
          }
        }
      } else if (activeTab === 'customer_balances') {
        const res = await api.getWHCustomerBalances(selectedCustomerCategory, balanceOnly);
        if (res && res.success) {
          setBalancesData(res.data || []);
        }
      } else if (activeTab === 'stock_position') {
        const res = await api.getWHStockPosition({
          category: selectedItemCategory,
          itemClass: selectedItemClass,
          subClass: selectedSubClass,
          criteria: selectedCriteria,
          search: searchQuery
        });
        if (res && res.success) {
          setStockPositionData(res.data || []);
        }
      } else if (activeTab === 'item_ledger') {
        if (selectedItem?._id) {
          const res = await api.getWHItemLedger(selectedItem._id, fromDate, toDate);
          if (res && res.success) {
            setItemLedgerData(res.data);
          }
        }
      } else if (activeTab === 'stock_activity') {
        const res = await api.getWHStockActivity(fromDate, toDate, selectedCriteria, searchQuery, selectedItemCategory, selectedSubClass, selectedItemClass);
        if (res && res.success) {
          setStockActivityData(res.data || []);
        }
      } else if (activeTab === 'stock_audit') {
        const res = await api.getWHStockAudits({
          startDate: fromDate,
          endDate: toDate,
          status: selectedAuditStatus,
          limit: 50
        });
        if (res && res.success) {
          setStockAuditsList(res.data || []);
        }
      }
    } catch (e) {
      console.error('Error loading WH report data:', e);
      setErrorMsg(e.message || 'Failed to fetch report data');
    } finally {
      setLoading(false);
    }
  };

  // Printing & Preview Handler
  const handlePrintOrPreview = async (isPreview = false) => {
    try {
      if (activeTab === 'customer_ledger') {
        if (!customerLedgerData) {
          return Alert.alert('Notice', 'No customer ledger data available to print');
        }
        const selectedCat = customerCategories.find(c => c._id === selectedCustomerCategory);
        await printWHCustomerLedger(
          customerLedgerData,
          {
            customerName: selectedCustomer?.customerName || selectedCustomer?.name,
            customerCode: selectedCustomer?.code,
            customerPhone: selectedCustomer?.phone,
            categoryName: selectedCat ? selectedCat.name : 'All Categories',
            from: fromDate,
            to: toDate
          },
          isPreview
        );
      } else if (activeTab === 'customer_balances') {
        if (!balancesData || balancesData.length === 0) {
          return Alert.alert('Notice', 'No customer balances data available to print');
        }
        const selectedCat = customerCategories.find(c => c._id === selectedCustomerCategory);
        await printWHCustomerBalances(
          balancesData,
          {
            categoryName: selectedCat ? selectedCat.name : 'All Categories',
            balanceOnly
          },
          isPreview
        );
      } else if (activeTab === 'stock_position') {
        if (!stockPositionData || stockPositionData.length === 0) {
          return Alert.alert('Notice', 'No stock position data available to print');
        }
        const selectedCat = itemCategories.find(c => c._id === selectedItemCategory);
        const selectedClass = itemClasses.find(cl => cl._id === selectedItemClass);
        const selectedSub = itemSubClasses.find(s => s._id === selectedSubClass);
        const critObj = STOCK_CRITERIA.find(c => c.key === selectedCriteria);

        const trimmedQuery = (searchQuery || '').trim().toLowerCase();
        const searchWords = trimmedQuery ? trimmedQuery.split(/\s+/).filter(Boolean) : [];
        const itemsToPrint = searchWords.length > 0
          ? stockPositionData.filter(item => {
              const name = (item.name || '').toLowerCase();
              const code = (item.code || '').toLowerCase();
              const itemsCode = (item.itemsCode || '').toLowerCase();
              const barcode = (item.barcode || '').toLowerCase();
              return searchWords.every(word =>
                name.includes(word) || code.includes(word) || itemsCode.includes(word) || barcode.includes(word)
              );
            })
          : stockPositionData;

        await printWHStockPosition(
          itemsToPrint,
          {
            categoryName: selectedCat ? selectedCat.name : 'All Categories',
            className: selectedClass ? selectedClass.name : 'All Classes',
            subClassName: selectedSub ? selectedSub.name : 'All Sub-Classes',
            criteria: critObj ? critObj.label : 'All Stock'
          },
          isPreview
        );
      } else if (activeTab === 'item_ledger') {
        if (!itemLedgerData) {
          return Alert.alert('Notice', 'No item ledger data available to print');
        }
        const selectedCat = itemCategories.find(c => c._id === selectedItemCategory);
        const selectedSub = itemSubClasses.find(s => s._id === selectedSubClass);
        await printWHItemLedger(
          itemLedgerData,
          {
            itemName: selectedItem?.name,
            itemCode: selectedItem?.barcode || selectedItem?.itemsCode,
            categoryName: selectedCat ? selectedCat.name : 'All Categories',
            subClassName: selectedSub ? selectedSub.name : 'All Sub-Classes',
            from: fromDate,
            to: toDate
          },
          isPreview
        );
      } else if (activeTab === 'stock_activity') {
        if (!stockActivityData || stockActivityData.length === 0) {
          return Alert.alert('Notice', 'No stock activity records found to print');
        }
        const selectedCat = itemCategories.find(c => c._id === selectedItemCategory);
        const selectedSub = itemSubClasses.find(s => s._id === selectedSubClass);
        await printWHStockActivity(
          stockActivityData,
          {
            categoryName: selectedCat ? selectedCat.name : 'All Categories',
            subClassName: selectedSub ? selectedSub.name : 'All Sub-Classes',
            from: fromDate,
            to: toDate
          },
          isPreview
        );
      } else if (activeTab === 'stock_audit') {
        if (selectedAuditDetail) {
          await printWHStockAudit(selectedAuditDetail, { status: selectedAuditStatus || 'All Statuses' }, isPreview);
        } else if (stockAuditsList.length > 0) {
          // Print latest audit
          const latestId = stockAuditsList[0]._id;
          const fullAuditRes = await api.getWHStockAudit(latestId);
          if (fullAuditRes && fullAuditRes.success) {
            await printWHStockAudit(fullAuditRes.data, { status: selectedAuditStatus || 'All Statuses' }, isPreview);
          }
        } else {
          Alert.alert('Notice', 'No stock audit selected to print');
        }
      }
    } catch (e) {
      console.error('Error triggering print/preview:', e);
      Alert.alert('Error', 'Print processing failed: ' + e.message);
    }
  };

  // Open Audit Detail Modal
  const handleOpenAuditDetail = async (audit) => {
    try {
      setLoading(true);
      const res = await api.getWHStockAudit(audit._id);
      if (res && res.success) {
        setSelectedAuditDetail(res.data);
        setAuditModalVisible(true);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to load audit details: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ---------------- Render Sub-Components ----------------

  // 1. Customer Ledger View
  const renderCustomerLedger = () => {
    const entries = customerLedgerData?.entries || [];
    let runningBalance = customerLedgerData?.openingBalance || 0;
    let totalDebit = 0;
    let totalCredit = 0;

    entries.forEach(e => {
      totalDebit += (e.debit || 0);
      totalCredit += (e.credit || 0);
    });

    const closingBalance = runningBalance + totalDebit - totalCredit;

    return (
      <View style={styles.tabContent}>
        {/* Customer Category Filter Chips */}
        <Text style={styles.filterSectionTitle}>CUSTOMER CATEGORY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          <TouchableOpacity
            style={[styles.chipBtn, selectedCustomerCategory === '' && styles.chipBtnActive]}
            onPress={() => setSelectedCustomerCategory('')}
          >
            <Text style={[styles.chipBtnText, selectedCustomerCategory === '' && styles.chipBtnTextActive]}>
              All Categories
            </Text>
          </TouchableOpacity>
          {customerCategories.map(cat => (
            <TouchableOpacity
              key={cat._id}
              style={[styles.chipBtn, selectedCustomerCategory === cat._id && styles.chipBtnActive]}
              onPress={() => {
                setSelectedCustomerCategory(cat._id);
                const inCat = customersList.find(c => (c.customerCategory?._id || c.customerCategory) === cat._id);
                if (inCat) setSelectedCustomer(inCat);
              }}
            >
              <Text style={[styles.chipBtnText, selectedCustomerCategory === cat._id && styles.chipBtnTextActive]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Customer Selector Card */}
        <TouchableOpacity
          style={styles.pickerSelectorCard}
          onPress={() => setCustomerModalVisible(true)}
          activeOpacity={0.8}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.pickerSelectorLabel}>SELECTED CUSTOMER</Text>
            <Text style={styles.pickerSelectorValue}>
              {selectedCustomer?.customerName || selectedCustomer?.name || 'Select Customer...'}
            </Text>
            {selectedCustomer?.code ? (
              <Text style={styles.pickerSelectorSub}>Code: {selectedCustomer.code} • Phone: {selectedCustomer.phone || '--'}</Text>
            ) : null}
          </View>
          <View style={styles.pickerSelectorBtn}>
            <Text style={styles.pickerSelectorBtnText}>Change ▾</Text>
          </View>
        </TouchableOpacity>

        {/* Date Range Selector */}
        <View style={styles.dateRow}>
          <View style={styles.dateCol}>
            <Text style={styles.dateLabel}>FROM DATE</Text>
            <TextInput
              style={styles.dateInput}
              value={fromDate}
              onChangeText={setFromDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={styles.dateCol}>
            <Text style={styles.dateLabel}>TO DATE</Text>
            <TextInput
              style={styles.dateInput}
              value={toDate}
              onChangeText={setToDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
            />
          </View>
        </View>

        {/* Quick Date Presets */}
        <View style={styles.presetsRow}>
          {['today', 'week', 'month', 'year'].map(p => (
            <TouchableOpacity
              key={p}
              style={styles.presetBtn}
              onPress={() => {
                const dates = getPresetDates(p);
                setFromDate(dates.from);
                setToDate(dates.to);
              }}
            >
              <Text style={styles.presetBtnText}>{p.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 4 Quadrant Summary Cards */}
        <View style={styles.summaryGrid}>
          <View style={[styles.sumCard, styles.sumCardBlue]}>
            <Text style={styles.sumCardLabel}>OPENING BAL</Text>
            <Text style={styles.sumCardVal}>{formatCurrency(customerLedgerData?.openingBalance)}</Text>
          </View>
          <View style={[styles.sumCard, styles.sumCardRed]}>
            <Text style={styles.sumCardLabel}>TOTAL DEBIT (+)</Text>
            <Text style={styles.sumCardVal}>{formatCurrency(totalDebit)}</Text>
          </View>
          <View style={[styles.sumCard, styles.sumCardGreen]}>
            <Text style={styles.sumCardLabel}>TOTAL CREDIT (-)</Text>
            <Text style={styles.sumCardVal}>{formatCurrency(totalCredit)}</Text>
          </View>
          <View style={[styles.sumCard, closingBalance >= 0 ? styles.sumCardCyan : styles.sumCardRed]}>
            <Text style={styles.sumCardLabel}>CLOSING BAL</Text>
            <Text style={styles.sumCardVal}>{formatCurrency(closingBalance)}</Text>
          </View>
        </View>

        {/* Table Content */}
        <View style={styles.tableCard}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.thText, { flex: 2 }]}>DATE / REF</Text>
            <Text style={[styles.thText, { flex: 3 }]}>DESCRIPTION</Text>
            <Text style={[styles.thText, { flex: 2, textAlign: 'right' }]}>DR / CR</Text>
            <Text style={[styles.thText, { flex: 2, textAlign: 'right' }]}>BALANCE</Text>
          </View>

          {/* Opening Balance Row */}
          <View style={styles.tableOpeningRow}>
            <Text style={[styles.tableOpeningText, { flex: 5 }]}>⚡ Opening Balance</Text>
            <Text style={[styles.tableOpeningText, { flex: 4, textAlign: 'right' }]}>
              Rs. {formatCurrency(customerLedgerData?.openingBalance)}
            </Text>
          </View>

          {entries.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No transaction entries in this date range</Text>
            </View>
          ) : (
            entries.map((entry, idx) => {
              runningBalance += (entry.debit || 0) - (entry.credit || 0);
              return (
                <View key={entry._id || idx} style={[styles.tableDataRow, idx % 2 === 1 && styles.tableDataRowAlt]}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.tdPrimaryText}>{formatDate(entry.date)}</Text>
                    <Text style={styles.tdSecondaryText}>
                      {entry.refId ? entry.refId.substring(entry.refId.length - 6) : '--'}
                    </Text>
                  </View>
                  <View style={{ flex: 3 }}>
                    <Text style={styles.tdPrimaryText} numberOfLines={2}>{entry.description || '-'}</Text>
                  </View>
                  <View style={{ flex: 2, alignItems: 'flex-end' }}>
                    {entry.debit > 0 ? (
                      <Text style={styles.debitAmountText}>+{formatCurrency(entry.debit)}</Text>
                    ) : null}
                    {entry.credit > 0 ? (
                      <Text style={styles.creditAmountText}>-{formatCurrency(entry.credit)}</Text>
                    ) : null}
                  </View>
                  <View style={{ flex: 2, alignItems: 'flex-end' }}>
                    <Text style={[styles.balanceAmountText, runningBalance < 0 && { color: '#ef4444' }]}>
                      {formatCurrency(runningBalance)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>
    );
  };

  // 2. Customer Balances View
  const renderCustomerBalances = () => {
    let totalBal = 0;
    let nonZeroCount = 0;
    const filteredBalances = balancesData.filter(c => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = (c.customerName || '').toLowerCase().includes(q);
        const matchCode = (c.code || '').toLowerCase().includes(q);
        if (!matchName && !matchCode) return false;
      }
      return true;
    });

    filteredBalances.forEach(c => {
      const b = c.balance || 0;
      totalBal += b;
      if (b !== 0) nonZeroCount++;
    });

    return (
      <View style={styles.tabContent}>
        {/* Search & Category Filter */}
        <View style={styles.searchBarContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search customer name or code..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={{ color: '#94a3b8', fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Category Horizontal Chips */}
        <Text style={styles.filterSectionTitle}>CUSTOMER CATEGORY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          <TouchableOpacity
            style={[styles.chipBtn, selectedCustomerCategory === '' && styles.chipBtnActive]}
            onPress={() => setSelectedCustomerCategory('')}
          >
            <Text style={[styles.chipBtnText, selectedCustomerCategory === '' && styles.chipBtnTextActive]}>
              All Categories
            </Text>
          </TouchableOpacity>
          {customerCategories.map(cat => (
            <TouchableOpacity
              key={cat._id}
              style={[styles.chipBtn, selectedCustomerCategory === cat._id && styles.chipBtnActive]}
              onPress={() => setSelectedCustomerCategory(cat._id)}
            >
              <Text style={[styles.chipBtnText, selectedCustomerCategory === cat._id && styles.chipBtnTextActive]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Balance Only Toggle */}
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Show Balance Only</Text>
          <TouchableOpacity
            style={[styles.toggleSwitch, balanceOnly && styles.toggleSwitchActive]}
            onPress={() => setBalanceOnly(!balanceOnly)}
          >
            <View style={[styles.toggleThumb, balanceOnly && styles.toggleThumbActive]} />
          </TouchableOpacity>
        </View>

        {/* Summary Metric Cards */}
        <View style={styles.summaryGrid}>
          <View style={[styles.sumCard, styles.sumCardBlue]}>
            <Text style={styles.sumCardLabel}>CUSTOMERS</Text>
            <Text style={styles.sumCardVal}>{filteredBalances.length}</Text>
          </View>
          <View style={[styles.sumCard, styles.sumCardGreen]}>
            <Text style={styles.sumCardLabel}>ACTIVE BALANCES</Text>
            <Text style={styles.sumCardVal}>{nonZeroCount}</Text>
          </View>
          <View style={[styles.sumCard, styles.sumCardCyan, { flex: 2 }]}>
            <Text style={styles.sumCardLabel}>TOTAL RECEIVABLE (RS.)</Text>
            <Text style={styles.sumCardVal}>{formatCurrency(totalBal)}</Text>
          </View>
        </View>

        {/* List of Customers */}
        <View style={styles.tableCard}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.thText, { flex: 3 }]}>CUSTOMER / CODE</Text>
            <Text style={[styles.thText, { flex: 2 }]}>CATEGORY</Text>
            <Text style={[styles.thText, { flex: 2, textAlign: 'right' }]}>BALANCE (RS.)</Text>
          </View>

          {filteredBalances.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No customers found matching filter</Text>
            </View>
          ) : (
            filteredBalances.map((c, idx) => (
              <TouchableOpacity
                key={c._id || idx}
                style={[styles.tableDataRow, idx % 2 === 1 && styles.tableDataRowAlt]}
                onPress={() => {
                  // Quick shortcut: switch to customer ledger for this customer!
                  const found = customersList.find(cust => cust._id === c._id);
                  if (found) {
                    setSelectedCustomer(found);
                    setActiveTab('customer_ledger');
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={{ flex: 3 }}>
                  <Text style={styles.tdPrimaryText} numberOfLines={1}>{c.customerName}</Text>
                  <Text style={styles.tdSecondaryText}>Code: {c.code || '--'} • {c.phone || 'No phone'}</Text>
                </View>
                <View style={{ flex: 2 }}>
                  <Text style={styles.tdSecondaryText} numberOfLines={1}>{c.categoryName || 'General'}</Text>
                </View>
                <View style={{ flex: 2, alignItems: 'flex-end' }}>
                  <Text style={[styles.balanceAmountText, (c.balance || 0) < 0 && { color: '#ef4444' }]}>
                    {formatCurrency(c.balance)}
                  </Text>
                  <Text style={{ fontSize: 10, color: '#0284c7', marginTop: 2 }}>View Ledger →</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </View>
    );
  };

  // 3. Stock Position View
  const renderStockPosition = () => {
    let totalUnits = 0;
    let totalCostValue = 0;
    let inStockItems = 0;

    // Real-time search filtering across name, SKU, itemsCode, and barcode
    const trimmedQuery = (searchQuery || '').trim().toLowerCase();
    const searchWords = trimmedQuery ? trimmedQuery.split(/\s+/).filter(Boolean) : [];

    const filteredStockItems = (stockPositionData || []).filter(item => {
      if (searchWords.length > 0) {
        const name = (item.name || '').toLowerCase();
        const code = (item.code || '').toLowerCase();
        const itemsCode = (item.itemsCode || '').toLowerCase();
        const barcode = (item.barcode || '').toLowerCase();
        const matchSearch = searchWords.every(w =>
          name.includes(w) || code.includes(w) || itemsCode.includes(w) || barcode.includes(w)
        );
        if (!matchSearch) return false;
      }
      return true;
    });

    filteredStockItems.forEach(item => {
      const qty = item.currentStock || 0;
      totalUnits += qty;
      totalCostValue += (qty * (item.costPrice || 0));
      if (qty > 0) inStockItems++;
    });

    return (
      <View style={styles.tabContent}>
        {/* Search Bar with Barcode Scanner */}
        <View style={styles.searchBarContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search SKU, barcode, or item name..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={fetchReportData}
            returnKeyType="search"
          />
          {searchQuery ? (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setTimeout(() => fetchReportData(), 50);
              }}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
              activeOpacity={0.7}
            >
              <Text style={{ color: '#94a3b8', fontSize: 16, fontWeight: 'bold' }}>✕</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.barcodeScanBtn}
            onPress={() => {
              haptic.light();
              setScannerVisible(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.barcodeScanBtnText}>📷 SCAN</Text>
          </TouchableOpacity>
        </View>

        {/* Item Category Chips */}
        <Text style={styles.filterSectionTitle}>ITEM CATEGORY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          <TouchableOpacity
            style={[styles.chipBtn, selectedItemCategory === '' && styles.chipBtnActive]}
            onPress={() => setSelectedItemCategory('')}
          >
            <Text style={[styles.chipBtnText, selectedItemCategory === '' && styles.chipBtnTextActive]}>
              All Categories
            </Text>
          </TouchableOpacity>
          {itemCategories.map(cat => (
            <TouchableOpacity
              key={cat._id}
              style={[styles.chipBtn, selectedItemCategory === cat._id && styles.chipBtnActive]}
              onPress={() => setSelectedItemCategory(cat._id)}
            >
              <Text style={[styles.chipBtnText, selectedItemCategory === cat._id && styles.chipBtnTextActive]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Item Class Chips (Class-wise Search) */}
        <Text style={styles.filterSectionTitle}>ITEM CLASS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          <TouchableOpacity
            style={[styles.chipBtn, selectedItemClass === '' && styles.chipBtnActive]}
            onPress={() => setSelectedItemClass('')}
          >
            <Text style={[styles.chipBtnText, selectedItemClass === '' && styles.chipBtnTextActive]}>
              All Classes
            </Text>
          </TouchableOpacity>
          {itemClasses.map(cls => (
            <TouchableOpacity
              key={cls._id}
              style={[styles.chipBtn, selectedItemClass === cls._id && styles.chipBtnActive]}
              onPress={() => setSelectedItemClass(cls._id)}
            >
              <Text style={[styles.chipBtnText, selectedItemClass === cls._id && styles.chipBtnTextActive]}>
                {cls.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Item Sub-Class Chips */}
        <Text style={styles.filterSectionTitle}>SUB-CLASS / TRADING</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          <TouchableOpacity
            style={[styles.chipBtn, selectedSubClass === '' && styles.chipBtnActive]}
            onPress={() => setSelectedSubClass('')}
          >
            <Text style={[styles.chipBtnText, selectedSubClass === '' && styles.chipBtnTextActive]}>
              All Sub-Classes
            </Text>
          </TouchableOpacity>
          {itemSubClasses.map(sub => (
            <TouchableOpacity
              key={sub._id}
              style={[styles.chipBtn, selectedSubClass === sub._id && styles.chipBtnActive]}
              onPress={() => setSelectedSubClass(sub._id)}
            >
              <Text style={[styles.chipBtnText, selectedSubClass === sub._id && styles.chipBtnTextActive]}>
                {sub.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Stock Criteria Chips */}
        <Text style={styles.filterSectionTitle}>STOCK CRITERIA</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          {STOCK_CRITERIA.map(crit => (
            <TouchableOpacity
              key={crit.key}
              style={[styles.chipBtn, selectedCriteria === crit.key && styles.chipBtnActive]}
              onPress={() => setSelectedCriteria(crit.key)}
            >
              <Text style={[styles.chipBtnText, selectedCriteria === crit.key && styles.chipBtnTextActive]}>
                {crit.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Summary Metric Cards */}
        <View style={styles.summaryGrid}>
          <View style={[styles.sumCard, styles.sumCardBlue]}>
            <Text style={styles.sumCardLabel}>TOTAL SKUS</Text>
            <Text style={styles.sumCardVal}>{filteredStockItems.length}</Text>
          </View>
          <View style={[styles.sumCard, styles.sumCardGreen]}>
            <Text style={styles.sumCardLabel}>IN STOCK SKUS</Text>
            <Text style={styles.sumCardVal}>{inStockItems}</Text>
          </View>
          <View style={[styles.sumCard, styles.sumCardCyan]}>
            <Text style={styles.sumCardLabel}>TOTAL UNITS</Text>
            <Text style={styles.sumCardVal}>{formatQty(totalUnits)}</Text>
          </View>
          <View style={[styles.sumCard, styles.sumCardBlue]}>
            <Text style={styles.sumCardLabel}>COST VALUATION</Text>
            <Text style={styles.sumCardVal}>{formatCurrency(totalCostValue)}</Text>
          </View>
        </View>

        {/* Stock Position Table */}
        <View style={styles.tableCard}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.thText, { flex: 4 }]}>ITEM / SKU</Text>
            <Text style={[styles.thText, { flex: 2, textAlign: 'right' }]}>SALE RATE</Text>
            <Text style={[styles.thText, { flex: 2, textAlign: 'right' }]}>STOCK</Text>
          </View>

          {filteredStockItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No items found matching filter criteria</Text>
            </View>
          ) : (
            filteredStockItems.map((item, idx) => (
              <TouchableOpacity
                key={item._id || idx}
                style={[styles.tableDataRow, idx % 2 === 1 && styles.tableDataRowAlt]}
                onPress={() => {
                  // Switch to item ledger
                  const found = itemsList.find(i => i._id === item._id);
                  if (found) {
                    setSelectedItem(found);
                    setActiveTab('item_ledger');
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={{ flex: 4 }}>
                  <Text style={styles.tdPrimaryText} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.tdSecondaryText}>
                    Code: {item.code || item.itemsCode || item.barcode || '--'} • {item.category?.name || 'General'}{item.itemClass?.name ? ` • ${item.itemClass.name}` : ''}{item.subClass?.name ? ` • ${item.subClass.name}` : ''}
                  </Text>
                </View>
                <View style={{ flex: 2, alignItems: 'flex-end' }}>
                  <Text style={styles.tdPrimaryText}>Rs. {formatCurrency(item.salePrice)}</Text>
                  <Text style={styles.tdSecondaryText}>Cost: {formatCurrency(item.costPrice)}</Text>
                </View>
                <View style={{ flex: 2, alignItems: 'flex-end' }}>
                  <View style={[
                    styles.stockBadge,
                    (item.currentStock || 0) > 0 ? styles.stockBadgeIn : (
                      (item.currentStock || 0) < 0 ? styles.stockBadgeNeg : styles.stockBadgeZero
                    )
                  ]}>
                    <Text style={styles.stockBadgeText}>{formatQty(item.currentStock)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </View>
    );
  };

  // 4. Item Ledger View
  const renderItemLedger = () => {
    const entries = itemLedgerData?.entries || [];
    let runningStock = itemLedgerData?.openingBalance || 0;
    let totalIn = 0;
    let totalOut = 0;

    entries.forEach(e => {
      const inQty = e.type === 'in' ? (e.quantity || 0) : 0;
      const outQty = e.type === 'out' ? (e.quantity || 0) : 0;
      totalIn += inQty;
      totalOut += outQty;
    });

    const closingStock = runningStock + totalIn - totalOut;

    return (
      <View style={styles.tabContent}>
        {/* Item Category Filter Chips */}
        <Text style={styles.filterSectionTitle}>ITEM CATEGORY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          <TouchableOpacity
            style={[styles.chipBtn, selectedItemCategory === '' && styles.chipBtnActive]}
            onPress={() => setSelectedItemCategory('')}
          >
            <Text style={[styles.chipBtnText, selectedItemCategory === '' && styles.chipBtnTextActive]}>
              All Categories
            </Text>
          </TouchableOpacity>
          {itemCategories.map(cat => (
            <TouchableOpacity
              key={cat._id}
              style={[styles.chipBtn, selectedItemCategory === cat._id && styles.chipBtnActive]}
              onPress={() => {
                setSelectedItemCategory(cat._id);
                const inCat = itemsList.find(i => (i.category?._id || i.category) === cat._id);
                if (inCat) setSelectedItem(inCat);
              }}
            >
              <Text style={[styles.chipBtnText, selectedItemCategory === cat._id && styles.chipBtnTextActive]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Item Sub-Class Filter Chips */}
        <Text style={styles.filterSectionTitle}>SUB-CLASS / TRADING</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          <TouchableOpacity
            style={[styles.chipBtn, selectedSubClass === '' && styles.chipBtnActive]}
            onPress={() => setSelectedSubClass('')}
          >
            <Text style={[styles.chipBtnText, selectedSubClass === '' && styles.chipBtnTextActive]}>
              All Sub-Classes
            </Text>
          </TouchableOpacity>
          {itemSubClasses.map(sub => (
            <TouchableOpacity
              key={sub._id}
              style={[styles.chipBtn, selectedSubClass === sub._id && styles.chipBtnActive]}
              onPress={() => {
                setSelectedSubClass(sub._id);
                const inSub = itemsList.find(i => (i.subClass?._id || i.subClass) === sub._id);
                if (inSub) setSelectedItem(inSub);
              }}
            >
              <Text style={[styles.chipBtnText, selectedSubClass === sub._id && styles.chipBtnTextActive]}>
                {sub.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Item Selector Card */}
        <TouchableOpacity
          style={styles.pickerSelectorCard}
          onPress={() => setItemModalVisible(true)}
          activeOpacity={0.8}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.pickerSelectorLabel}>SELECTED ITEM / SKU</Text>
            <Text style={styles.pickerSelectorValue}>
              {selectedItem?.name || 'Select Warehouse Item...'}
            </Text>
            {selectedItem?.itemsCode || selectedItem?.barcode ? (
              <Text style={styles.pickerSelectorSub}>
                Barcode: {selectedItem.barcode || selectedItem.itemsCode} • Rate: Rs. {formatCurrency(selectedItem.salePrice)}{selectedItem.subClass?.name ? ` • ${selectedItem.subClass.name}` : ''}
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity
              style={styles.barcodeScanBtn}
              onPress={() => {
                haptic.light();
                setScannerVisible(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.barcodeScanBtnText}>📷 SCAN</Text>
            </TouchableOpacity>
            <View style={[styles.pickerSelectorBtn, { marginLeft: 8 }]}>
              <Text style={styles.pickerSelectorBtnText}>Change ▾</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Date Range Selector */}
        <View style={styles.dateRow}>
          <View style={styles.dateCol}>
            <Text style={styles.dateLabel}>FROM DATE</Text>
            <TextInput
              style={styles.dateInput}
              value={fromDate}
              onChangeText={setFromDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={styles.dateCol}>
            <Text style={styles.dateLabel}>TO DATE</Text>
            <TextInput
              style={styles.dateInput}
              value={toDate}
              onChangeText={setToDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
            />
          </View>
        </View>

        {/* Summary Metric Cards */}
        <View style={styles.summaryGrid}>
          <View style={[styles.sumCard, styles.sumCardBlue]}>
            <Text style={styles.sumCardLabel}>OPENING STOCK</Text>
            <Text style={styles.sumCardVal}>{formatQty(itemLedgerData?.openingBalance)}</Text>
          </View>
          <View style={[styles.sumCard, styles.sumCardGreen]}>
            <Text style={styles.sumCardLabel}>TOTAL INWARDS (+)</Text>
            <Text style={styles.sumCardVal}>+{formatQty(totalIn)}</Text>
          </View>
          <View style={[styles.sumCard, styles.sumCardRed]}>
            <Text style={styles.sumCardLabel}>TOTAL OUTWARDS (-)</Text>
            <Text style={styles.sumCardVal}>-{formatQty(totalOut)}</Text>
          </View>
          <View style={[styles.sumCard, closingStock > 0 ? styles.sumCardCyan : styles.sumCardRed]}>
            <Text style={styles.sumCardLabel}>CLOSING STOCK</Text>
            <Text style={styles.sumCardVal}>{formatQty(closingStock)}</Text>
          </View>
        </View>

        {/* Table View */}
        <View style={styles.tableCard}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.thText, { flex: 2 }]}>DATE / TYPE</Text>
            <Text style={[styles.thText, { flex: 3 }]}>TRANSACTION DETAILS</Text>
            <Text style={[styles.thText, { flex: 2, textAlign: 'right' }]}>IN / OUT</Text>
            <Text style={[styles.thText, { flex: 2, textAlign: 'right' }]}>BALANCE</Text>
          </View>

          {/* Opening Stock Row */}
          <View style={styles.tableOpeningRow}>
            <Text style={[styles.tableOpeningText, { flex: 5 }]}>⚡ Opening Stock Position</Text>
            <Text style={[styles.tableOpeningText, { flex: 4, textAlign: 'right' }]}>
              {formatQty(itemLedgerData?.openingBalance)} Units
            </Text>
          </View>

          {entries.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No stock logs found in this date range</Text>
            </View>
          ) : (
            entries.map((entry, idx) => {
              const inQty = entry.type === 'in' ? (entry.quantity || 0) : 0;
              const outQty = entry.type === 'out' ? (entry.quantity || 0) : 0;
              runningStock += (inQty - outQty);

              return (
                <View key={entry._id || idx} style={[styles.tableDataRow, idx % 2 === 1 && styles.tableDataRowAlt]}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.tdPrimaryText}>{formatDate(entry.date)}</Text>
                    <Text style={[styles.tdSecondaryText, { textTransform: 'uppercase', color: '#0284c7', fontWeight: '700' }]}>
                      {entry.refType || 'LOG'}
                    </Text>
                  </View>
                  <View style={{ flex: 3 }}>
                    <Text style={styles.tdPrimaryText} numberOfLines={2}>{entry.description || '-'}</Text>
                  </View>
                  <View style={{ flex: 2, alignItems: 'flex-end' }}>
                    {inQty > 0 ? <Text style={styles.creditAmountText}>+{formatQty(inQty)}</Text> : null}
                    {outQty > 0 ? <Text style={styles.debitAmountText}>-{formatQty(outQty)}</Text> : null}
                  </View>
                  <View style={{ flex: 2, alignItems: 'flex-end' }}>
                    <Text style={[styles.balanceAmountText, runningStock < 0 && { color: '#ef4444' }]}>
                      {formatQty(runningStock)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>
    );
  };

  // 5. Stock Activity View
  const renderStockActivity = () => {
    let totalPurchases = 0;
    let totalSales = 0;

    stockActivityData.forEach(item => {
      totalPurchases += (item.purchases || 0);
      totalSales += (item.sales || 0);
    });

    return (
      <View style={styles.tabContent}>
        {/* Date Range Selector */}
        <View style={styles.dateRow}>
          <View style={styles.dateCol}>
            <Text style={styles.dateLabel}>FROM DATE</Text>
            <TextInput
              style={styles.dateInput}
              value={fromDate}
              onChangeText={setFromDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={styles.dateCol}>
            <Text style={styles.dateLabel}>TO DATE</Text>
            <TextInput
              style={styles.dateInput}
              value={toDate}
              onChangeText={setToDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
            />
          </View>
        </View>

        {/* Search Bar with Barcode Scanner */}
        <View style={styles.searchBarContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search SKU or item name..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <TouchableOpacity
            style={styles.barcodeScanBtn}
            onPress={() => {
              haptic.light();
              setScannerVisible(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.barcodeScanBtnText}>📷 SCAN</Text>
          </TouchableOpacity>
        </View>

        {/* Item Category Chips */}
        <Text style={styles.filterSectionTitle}>ITEM CATEGORY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          <TouchableOpacity
            style={[styles.chipBtn, selectedItemCategory === '' && styles.chipBtnActive]}
            onPress={() => setSelectedItemCategory('')}
          >
            <Text style={[styles.chipBtnText, selectedItemCategory === '' && styles.chipBtnTextActive]}>
              All Categories
            </Text>
          </TouchableOpacity>
          {itemCategories.map(cat => (
            <TouchableOpacity
              key={cat._id}
              style={[styles.chipBtn, selectedItemCategory === cat._id && styles.chipBtnActive]}
              onPress={() => setSelectedItemCategory(cat._id)}
            >
              <Text style={[styles.chipBtnText, selectedItemCategory === cat._id && styles.chipBtnTextActive]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Item Class Chips */}
        <Text style={styles.filterSectionTitle}>ITEM CLASS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          <TouchableOpacity
            style={[styles.chipBtn, selectedItemClass === '' && styles.chipBtnActive]}
            onPress={() => setSelectedItemClass('')}
          >
            <Text style={[styles.chipBtnText, selectedItemClass === '' && styles.chipBtnTextActive]}>
              All Classes
            </Text>
          </TouchableOpacity>
          {itemClasses.map(cls => (
            <TouchableOpacity
              key={cls._id}
              style={[styles.chipBtn, selectedItemClass === cls._id && styles.chipBtnActive]}
              onPress={() => setSelectedItemClass(cls._id)}
            >
              <Text style={[styles.chipBtnText, selectedItemClass === cls._id && styles.chipBtnTextActive]}>
                {cls.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Item Sub-Class Chips */}
        <Text style={styles.filterSectionTitle}>SUB-CLASS / TRADING</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          <TouchableOpacity
            style={[styles.chipBtn, selectedSubClass === '' && styles.chipBtnActive]}
            onPress={() => setSelectedSubClass('')}
          >
            <Text style={[styles.chipBtnText, selectedSubClass === '' && styles.chipBtnTextActive]}>
              All Sub-Classes
            </Text>
          </TouchableOpacity>
          {itemSubClasses.map(sub => (
            <TouchableOpacity
              key={sub._id}
              style={[styles.chipBtn, selectedSubClass === sub._id && styles.chipBtnActive]}
              onPress={() => setSelectedSubClass(sub._id)}
            >
              <Text style={[styles.chipBtnText, selectedSubClass === sub._id && styles.chipBtnTextActive]}>
                {sub.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Summary Metric Cards */}
        <View style={styles.summaryGrid}>
          <View style={[styles.sumCard, styles.sumCardBlue]}>
            <Text style={styles.sumCardLabel}>TRACKED SKUS</Text>
            <Text style={styles.sumCardVal}>{stockActivityData.length}</Text>
          </View>
          <View style={[styles.sumCard, styles.sumCardGreen]}>
            <Text style={styles.sumCardLabel}>PURCHASES (IN)</Text>
            <Text style={styles.sumCardVal}>+{formatQty(totalPurchases)}</Text>
          </View>
          <View style={[styles.sumCard, styles.sumCardRed]}>
            <Text style={styles.sumCardLabel}>SALES (OUT)</Text>
            <Text style={styles.sumCardVal}>-{formatQty(totalSales)}</Text>
          </View>
        </View>

        {/* Movement Matrix Table */}
        <View style={styles.tableCard}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.thText, { flex: 3 }]}>ITEM / CODE</Text>
            <Text style={[styles.thText, { flex: 2, textAlign: 'right' }]}>OPEN / IN</Text>
            <Text style={[styles.thText, { flex: 2, textAlign: 'right' }]}>OUT / CLOS</Text>
          </View>

          {stockActivityData.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No stock activities recorded in this timeframe</Text>
            </View>
          ) : (
            stockActivityData.map((item, idx) => (
              <View key={item._id || idx} style={[styles.tableDataRow, idx % 2 === 1 && styles.tableDataRowAlt]}>
                <View style={{ flex: 3 }}>
                  <Text style={styles.tdPrimaryText} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.tdSecondaryText}>Code: {item.code || '--'}{item.subClass?.name ? ` • ${item.subClass.name}` : ''}</Text>
                </View>
                <View style={{ flex: 2, alignItems: 'flex-end' }}>
                  <Text style={styles.tdSecondaryText}>Op: {formatQty(item.opening)}</Text>
                  <Text style={[styles.creditAmountText, { fontSize: 11 }]}>In: +{formatQty(item.purchases)}</Text>
                </View>
                <View style={{ flex: 2, alignItems: 'flex-end' }}>
                  <Text style={[styles.debitAmountText, { fontSize: 11 }]}>Out: -{formatQty(item.sales)}</Text>
                  <Text style={[styles.balanceAmountText, { fontSize: 12 }]}>Cl: {formatQty(item.closing)}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </View>
    );
  };

  // 6. Stock Audit View
  const renderStockAudit = () => {
    return (
      <View style={styles.tabContent}>
        {/* Date Range Filter */}
        <View style={styles.dateRow}>
          <View style={styles.dateCol}>
            <Text style={styles.dateLabel}>FROM DATE</Text>
            <TextInput
              style={styles.dateInput}
              value={fromDate}
              onChangeText={setFromDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={styles.dateCol}>
            <Text style={styles.dateLabel}>TO DATE</Text>
            <TextInput
              style={styles.dateInput}
              value={toDate}
              onChangeText={setToDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
            />
          </View>
        </View>

        {/* Audit Status / Category Filter Chips */}
        <Text style={styles.filterSectionTitle}>AUDIT STATUS / CATEGORY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          {[
            { key: '', label: 'All Audits' },
            { key: 'draft', label: 'Draft Audits' },
            { key: 'posted', label: 'Posted Audits' },
            { key: 'completed', label: 'Completed' }
          ].map(s => (
            <TouchableOpacity
              key={s.key}
              style={[styles.chipBtn, selectedAuditStatus === s.key && styles.chipBtnActive]}
              onPress={() => setSelectedAuditStatus(s.key)}
            >
              <Text style={[styles.chipBtnText, selectedAuditStatus === s.key && styles.chipBtnTextActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Audits Summary Header */}
        <View style={styles.summaryGrid}>
          <View style={[styles.sumCard, styles.sumCardBlue, { flex: 1 }]}>
            <Text style={styles.sumCardLabel}>TOTAL AUDITS</Text>
            <Text style={styles.sumCardVal}>{stockAuditsList.length}</Text>
          </View>
          <View style={[styles.sumCard, styles.sumCardCyan, { flex: 2 }]}>
            <Text style={styles.sumCardLabel}>LATEST AUDIT DATE</Text>
            <Text style={styles.sumCardVal}>
              {stockAuditsList.length > 0 ? formatDate(stockAuditsList[0].date) : 'No Audits'}
            </Text>
          </View>
        </View>

        {/* Audits List */}
        <View style={styles.tableCard}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.thText, { flex: 3 }]}>AUDIT # / DATE</Text>
            <Text style={[styles.thText, { flex: 2 }]}>STATUS</Text>
            <Text style={[styles.thText, { flex: 2, textAlign: 'right' }]}>ACTION</Text>
          </View>

          {stockAuditsList.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No warehouse stock audits found</Text>
            </View>
          ) : (
            stockAuditsList.map((audit, idx) => (
              <TouchableOpacity
                key={audit._id || idx}
                style={[styles.tableDataRow, idx % 2 === 1 && styles.tableDataRowAlt]}
                onPress={() => handleOpenAuditDetail(audit)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 3 }}>
                  <Text style={styles.tdPrimaryText}>
                    Audit #{audit.auditNumber || audit._id?.substring(audit._id.length - 6)}
                  </Text>
                  <Text style={styles.tdSecondaryText}>Date: {formatDate(audit.date)} • {audit.items?.length || 0} Items</Text>
                </View>
                <View style={{ flex: 2 }}>
                  <View style={[
                    styles.statusBadge,
                    audit.status === 'posted' ? styles.statusBadgePosted : styles.statusBadgeDraft
                  ]}>
                    <Text style={styles.statusBadgeText}>{(audit.status || 'Draft').toUpperCase()}</Text>
                  </View>
                </View>
                <View style={{ flex: 2, alignItems: 'flex-end' }}>
                  <Text style={{ color: '#0284c7', fontWeight: '700', fontSize: 12 }}>View & Print →</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.mainWrapper}>
      <StatusBar barStyle="light-content" />

      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation?.goBack ? navigation.goBack() : navigation?.navigate('Dashboard')}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>

        <View style={{ flex: 1, marginHorizontal: 8 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>Warehouse Reports</Text>
          <Text style={styles.headerSubtitle}>Central Logistics & Inventories</Text>
        </View>

        {/* Print & Preview Action Buttons */}
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.previewBtn}
            onPress={() => handlePrintOrPreview(false)}
            activeOpacity={0.8}
          >
            <Text style={styles.previewBtnText}>👁️ View PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.printBtn}
            onPress={() => handlePrintOrPreview(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.printBtnText}>📥 Download PDF</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Quick Action Shortcuts for WH Sale & WH Purchase */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4, gap: 8, backgroundColor: '#0f172a' }}>
        <TouchableOpacity
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(6, 182, 212, 0.15)', borderWidth: 1, borderColor: '#06B6D4', borderRadius: 10, paddingVertical: 7 }}
          onPress={() => {
            haptic.light();
            navigation?.navigate ? navigation.navigate('WHSaleEntry') : null;
          }}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 13, marginRight: 4 }}>🛒</Text>
          <Text style={{ color: '#06B6D4', fontWeight: '800', fontSize: 11.5 }}>+ WH SALE ENTRY</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16, 185, 129, 0.15)', borderWidth: 1, borderColor: '#10B981', borderRadius: 10, paddingVertical: 7 }}
          onPress={() => {
            haptic.light();
            navigation?.navigate ? navigation.navigate('WHPurchaseEntry') : null;
          }}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 13, marginRight: 4 }}>📥</Text>
          <Text style={{ color: '#10B981', fontWeight: '800', fontSize: 11.5 }}>+ WH PURCHASE ENTRY</Text>
        </TouchableOpacity>
      </View>

      {/* Segmented Top Tab Bar for 6 WH Reports */}
      <View style={styles.tabBarContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
          {REPORT_TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.8}
            >
              <Text style={styles.tabIcon}>{tab.icon}</Text>
              <Text style={[styles.tabButtonText, activeTab === tab.key && styles.tabButtonTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Main Content Area */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#06b6d4" />
            <Text style={styles.loadingText}>Fetching warehouse analytics...</Text>
          </View>
        )}

        {errorMsg ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{errorMsg}</Text>
          </View>
        ) : null}

        {activeTab === 'customer_ledger' && renderCustomerLedger()}
        {activeTab === 'customer_balances' && renderCustomerBalances()}
        {activeTab === 'stock_position' && renderStockPosition()}
        {activeTab === 'item_ledger' && renderItemLedger()}
        {activeTab === 'stock_activity' && renderStockActivity()}
        {activeTab === 'stock_audit' && renderStockAudit()}
      </ScrollView>

      {/* Modal: Customer Search & Selection */}
      <Modal visible={customerModalVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Customer</Text>
              <TouchableOpacity onPress={() => setCustomerModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalSearchInput}
              placeholder="Search customer name or code..."
              placeholderTextColor="#94a3b8"
              value={customerSearch}
              onChangeText={setCustomerSearch}
            />

            {/* Modal Category Filter Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.chipsScroll, { maxHeight: 38, marginBottom: 8 }]}>
              <TouchableOpacity
                style={[styles.chipBtn, selectedCustomerCategory === '' && styles.chipBtnActive]}
                onPress={() => setSelectedCustomerCategory('')}
              >
                <Text style={[styles.chipBtnText, selectedCustomerCategory === '' && styles.chipBtnTextActive]}>
                  All
                </Text>
              </TouchableOpacity>
              {customerCategories.map(cat => (
                <TouchableOpacity
                  key={cat._id}
                  style={[styles.chipBtn, selectedCustomerCategory === cat._id && styles.chipBtnActive]}
                  onPress={() => setSelectedCustomerCategory(cat._id)}
                >
                  <Text style={[styles.chipBtnText, selectedCustomerCategory === cat._id && styles.chipBtnTextActive]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <FlatList
              data={customersList.filter(c => {
                if (selectedCustomerCategory) {
                  const catId = c.customerCategory?._id || c.customerCategory;
                  if (catId !== selectedCustomerCategory) return false;
                }
                if (!customerSearch) return true;
                const q = customerSearch.toLowerCase();
                return (c.customerName || '').toLowerCase().includes(q) || (c.code || '').toLowerCase().includes(q);
              })}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalListItem}
                  onPress={() => {
                    setSelectedCustomer(item);
                    setCustomerModalVisible(false);
                  }}
                >
                  <Text style={styles.modalItemTitle}>{item.customerName}</Text>
                  <Text style={styles.modalItemSub}>Code: {item.code || '--'} • Phone: {item.phone || '--'}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Modal: Item Search & Selection */}
      <Modal visible={itemModalVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Warehouse Item</Text>
              <TouchableOpacity onPress={() => setItemModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalSearchInput}
              placeholder="Search item name, barcode, or code..."
              placeholderTextColor="#94a3b8"
              value={itemSearch}
              onChangeText={setItemSearch}
            />

            {/* Modal Item Category Filter Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.chipsScroll, { maxHeight: 38, marginBottom: 4 }]}>
              <TouchableOpacity
                style={[styles.chipBtn, selectedItemCategory === '' && styles.chipBtnActive]}
                onPress={() => setSelectedItemCategory('')}
              >
                <Text style={[styles.chipBtnText, selectedItemCategory === '' && styles.chipBtnTextActive]}>
                  All Categories
                </Text>
              </TouchableOpacity>
              {itemCategories.map(cat => (
                <TouchableOpacity
                  key={cat._id}
                  style={[styles.chipBtn, selectedItemCategory === cat._id && styles.chipBtnActive]}
                  onPress={() => setSelectedItemCategory(cat._id)}
                >
                  <Text style={[styles.chipBtnText, selectedItemCategory === cat._id && styles.chipBtnTextActive]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Modal Item Class Filter Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.chipsScroll, { maxHeight: 38, marginBottom: 4 }]}>
              <TouchableOpacity
                style={[styles.chipBtn, selectedItemClass === '' && styles.chipBtnActive]}
                onPress={() => setSelectedItemClass('')}
              >
                <Text style={[styles.chipBtnText, selectedItemClass === '' && styles.chipBtnTextActive]}>
                  All Classes
                </Text>
              </TouchableOpacity>
              {itemClasses.map(cls => (
                <TouchableOpacity
                  key={cls._id}
                  style={[styles.chipBtn, selectedItemClass === cls._id && styles.chipBtnActive]}
                  onPress={() => setSelectedItemClass(cls._id)}
                >
                  <Text style={[styles.chipBtnText, selectedItemClass === cls._id && styles.chipBtnTextActive]}>
                    {cls.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Modal Item Sub-Class Filter Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.chipsScroll, { maxHeight: 38, marginBottom: 8 }]}>
              <TouchableOpacity
                style={[styles.chipBtn, selectedSubClass === '' && styles.chipBtnActive]}
                onPress={() => setSelectedSubClass('')}
              >
                <Text style={[styles.chipBtnText, selectedSubClass === '' && styles.chipBtnTextActive]}>
                  All Sub-Classes
                </Text>
              </TouchableOpacity>
              {itemSubClasses.map(sub => (
                <TouchableOpacity
                  key={sub._id}
                  style={[styles.chipBtn, selectedSubClass === sub._id && styles.chipBtnActive]}
                  onPress={() => setSelectedSubClass(sub._id)}
                >
                  <Text style={[styles.chipBtnText, selectedSubClass === sub._id && styles.chipBtnTextActive]}>
                    {sub.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <FlatList
              data={itemsList.filter(i => {
                if (selectedItemCategory) {
                  const catId = i.category?._id || i.category;
                  if (catId !== selectedItemCategory) return false;
                }
                if (selectedItemClass) {
                  const classId = i.itemClass?._id || i.itemClass;
                  if (classId !== selectedItemClass) return false;
                }
                if (selectedSubClass) {
                  const subId = i.subClass?._id || i.subClass;
                  if (subId !== selectedSubClass) return false;
                }
                if (!itemSearch || !itemSearch.trim()) return true;
                const searchWords = itemSearch.toLowerCase().split(/\s+/).filter(Boolean);
                const name = (i.name || '').toLowerCase();
                const barcode = (i.barcode || '').toLowerCase();
                const code = (i.itemsCode || '').toLowerCase();
                return searchWords.every(w => name.includes(w) || barcode.includes(w) || code.includes(w));
              })}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalListItem}
                  onPress={() => {
                    setSelectedItem(item);
                    setItemModalVisible(false);
                  }}
                >
                  <Text style={styles.modalItemTitle}>{item.name}</Text>
                  <Text style={styles.modalItemSub}>
                    Barcode: {item.barcode || item.itemsCode || '--'} • Rate: Rs. {formatCurrency(item.salePrice)}{item.subClass?.name ? ` • ${item.subClass.name}` : ''}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Modal: Audit Detail & Print Viewer */}
      <Modal visible={auditModalVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  Audit #{selectedAuditDetail?.auditNumber || selectedAuditDetail?._id?.substring(selectedAuditDetail._id.length - 6)}
                </Text>
                <Text style={styles.modalSubtitle}>
                  Date: {formatDate(selectedAuditDetail?.date)} • {(selectedAuditDetail?.status || 'Draft').toUpperCase()}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setAuditModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.auditActionRow}>
              <TouchableOpacity
                style={styles.auditPrintBtn}
                onPress={() => printWHStockAudit(selectedAuditDetail, {}, false)}
              >
                <Text style={styles.auditPrintBtnText}>🖨️ Print Report</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.auditPreviewBtn}
                onPress={() => printWHStockAudit(selectedAuditDetail, {}, true)}
              >
                <Text style={styles.auditPreviewBtnText}>👁️ Share PDF</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ marginTop: 10 }}>
              {(selectedAuditDetail?.items || []).map((entry, idx) => {
                const itm = entry.item || {};
                const diff = (entry.physicalStock ?? entry.physicalQty ?? 0) - (entry.systemStock ?? entry.systemQty ?? 0);

                return (
                  <View key={idx} style={styles.auditDetailRow}>
                    <View style={{ flex: 3 }}>
                      <Text style={styles.tdPrimaryText}>{itm.name || 'Item'}</Text>
                      <Text style={styles.tdSecondaryText}>{itm.barcode || itm.itemsCode || '--'}</Text>
                    </View>
                    <View style={{ flex: 2, alignItems: 'flex-end' }}>
                      <Text style={styles.tdSecondaryText}>Sys: {entry.systemStock ?? entry.systemQty ?? 0}</Text>
                      <Text style={styles.tdPrimaryText}>Phys: {entry.physicalStock ?? entry.physicalQty ?? 0}</Text>
                    </View>
                    <View style={{ flex: 2, alignItems: 'flex-end' }}>
                      <Text style={[
                        styles.balanceAmountText,
                        diff > 0 ? { color: '#10b981' } : (diff < 0 ? { color: '#ef4444' } : { color: '#94a3b8' })
                      ]}>
                        Diff: {diff > 0 ? ('+' + diff) : diff}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Sticky Elevated Bottom Footer Back Button */}
      <View style={styles.footerBar}>
        <TouchableOpacity
          style={styles.footerBackBtn}
          onPress={() => navigation?.goBack ? navigation.goBack() : navigation?.navigate('Dashboard')}
          activeOpacity={0.8}
        >
          <Text style={styles.footerBackBtnText}>← Back to Dashboard</Text>
        </TouchableOpacity>
      </View>

      {/* Camera Barcode Scanner Modal */}
      <CameraBarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScan={handleBarcodeScan}
        title="Scan Item / Carton Barcode"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mainWrapper: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  footerBar: {
    backgroundColor: '#131D33',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'android' ? 56 : 28,
    borderTopWidth: 1,
    borderColor: '#1E293B',
  },
  footerBackBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  footerBackBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ? StatusBar.currentHeight + 14 : 44) : 14,
    paddingBottom: 14,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#334155',
    borderRadius: 8,
  },
  backBtnText: {
    color: '#e2e8f0',
    fontWeight: '800',
    fontSize: 13,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  previewBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#0284c7',
    borderRadius: 8,
  },
  previewBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
  },
  printBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#f59e0b',
    borderRadius: 8,
  },
  printBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
  },
  tabBarContainer: {
    backgroundColor: '#1e293b',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  tabScroll: {
    paddingHorizontal: 12,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#334155',
    marginRight: 8,
  },
  tabButtonActive: {
    backgroundColor: '#0284c7',
  },
  tabIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  tabButtonText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  tabButtonTextActive: {
    color: '#ffffff',
  },
  scrollArea: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
  },
  pickerSelectorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#38bdf8',
    marginBottom: 12,
  },
  pickerSelectorLabel: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  pickerSelectorValue: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  pickerSelectorSub: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  pickerSelectorBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#0284c7',
    borderRadius: 6,
  },
  pickerSelectorBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  dateCol: {
    flex: 1,
  },
  dateLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
  },
  dateInput: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 6,
    backgroundColor: '#334155',
    borderRadius: 6,
    alignItems: 'center',
  },
  presetBtnText: {
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: '800',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  sumCard: {
    flex: 1,
    minWidth: '47%',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  sumCardBlue: {
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    borderColor: '#0284c7',
  },
  sumCardGreen: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10b981',
  },
  sumCardRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#ef4444',
  },
  sumCardCyan: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: '#06b6d4',
  },
  sumCardLabel: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  sumCardVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff',
    marginTop: 4,
  },
  tableCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  thText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  tableOpeningRow: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  tableOpeningText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  tableDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  tableDataRowAlt: {
    backgroundColor: 'rgba(51, 65, 85, 0.4)',
  },
  tdPrimaryText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
  },
  tdSecondaryText: {
    color: '#94a3b8',
    fontSize: 10,
    marginTop: 2,
  },
  debitAmountText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '800',
  },
  creditAmountText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '800',
  },
  balanceAmountText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '800',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 13,
  },
  barcodeScanBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 7,
    marginLeft: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  barcodeScanBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  filterSectionTitle: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  chipsScroll: {
    marginBottom: 12,
  },
  chipBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#334155',
    marginRight: 6,
  },
  chipBtnActive: {
    backgroundColor: '#0284c7',
  },
  chipBtnText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
  chipBtnTextActive: {
    color: '#ffffff',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  toggleLabel: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#475569',
    padding: 2,
  },
  toggleSwitchActive: {
    backgroundColor: '#10b981',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  toggleThumbActive: {
    transform: [{ translateX: 20 }],
  },
  stockBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  stockBadgeIn: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  stockBadgeNeg: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  stockBadgeZero: {
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
  },
  stockBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  statusBadgePosted: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  statusBadgeDraft: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  statusBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  loadingOverlay: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  loadingText: {
    color: '#38bdf8',
    fontSize: 12,
    marginTop: 8,
    fontWeight: '600',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorBannerText: {
    color: '#fca5a5',
    fontSize: 12,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    height: '82%',
    maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  modalCloseText: {
    color: '#94a3b8',
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalSearchInput: {
    backgroundColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 13,
    marginBottom: 12,
  },
  modalListItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  modalItemTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  modalItemSub: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  auditActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 8,
  },
  auditPrintBtn: {
    flex: 1,
    backgroundColor: '#f59e0b',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  auditPrintBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  auditPreviewBtn: {
    flex: 1,
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  auditPreviewBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  auditDetailRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
});
