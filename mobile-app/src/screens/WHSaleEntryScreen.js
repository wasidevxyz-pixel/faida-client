import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  Modal,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { colors } from '../theme/colors';
import { haptic } from '../services/haptics';
import CameraBarcodeScannerModal from '../components/common/CameraBarcodeScannerModal';
import { printWHSaleInvoice } from '../services/printService';
import { DWATSON_LOGO_BASE64 } from '../services/dwatsonLogo';

const formatPKR = (val) => {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(val || 0));
};

export default function WHSaleEntryScreen({ onBack, navigation }) {
  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'history'
  const [editingSaleId, setEditingSaleId] = useState(null); // ID of invoice being edited

  // Header form states
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [payMode, setPayMode] = useState('Credit'); // 'Credit' | 'Cash' | 'Bank'
  const [remarks, setRemarks] = useState('');

  // Customer states
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customersLoading, setCustomersLoading] = useState(false);

  // Line items states
  const [cartItems, setCartItems] = useState([]);
  const [globalDiscount, setGlobalDiscount] = useState('0');
  const [paidAmount, setPaidAmount] = useState('0');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Scanner & Item lookup states
  const [scannerVisible, setScannerVisible] = useState(false);
  const [itemPickerVisible, setItemPickerVisible] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [availableItems, setAvailableItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  // Category filter state for wholesale products
  const [itemCategories, setItemCategories] = useState([]);
  const [selectedItemCategory, setSelectedItemCategory] = useState(null);

  // Quantity dialog modal with dynamic discount-by-quantity calculation
  const [selectedItemToAdd, setSelectedItemToAdd] = useState(null);
  const [modalQty, setModalQty] = useState('1');
  const [modalRate, setModalRate] = useState('0');
  const [modalRetail, setModalRetail] = useState('0');
  const [modalIncentive, setModalIncentive] = useState('0');
  const [modalDiscAmount, setModalDiscAmount] = useState('0');
  const [modalDiscPercent, setModalDiscPercent] = useState('0');
  const [qtyModalVisible, setQtyModalVisible] = useState(false);

  // Previous invoices states
  const [previousSales, setPreviousSales] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  // In-App Web-Parity Invoice Viewer Modal
  const [invoiceViewVisible, setInvoiceViewVisible] = useState(false);
  const [invoiceToView, setInvoiceToView] = useState(null);
  const [invoiceViewLoading, setInvoiceViewLoading] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    fetchNextInvoiceNo();
    fetchCustomers();
    fetchCategories();
    fetchPreviousSales();
  };

  const fetchCategories = async () => {
    try {
      const res = await api.getWHItemCategories();
      if (res && res.success && Array.isArray(res.data)) {
        setItemCategories(res.data);
      }
    } catch (err) {
      console.warn('Error fetching categories:', err.message);
    }
  };

  const fetchNextInvoiceNo = async () => {
    try {
      const res = await api.getNextWHSaleNumber();
      const nextNum = res?.data || res?.nextInvoiceNo;
      if (res && res.success && nextNum) {
        setInvoiceNo(nextNum);
      } else {
        setInvoiceNo(`INV-${Date.now().toString().slice(-6)}`);
      }
    } catch {
      setInvoiceNo(`INV-${Date.now().toString().slice(-6)}`);
    }
  };

  const fetchCustomers = async (search = '') => {
    setCustomersLoading(true);
    try {
      const res = await api.getWHCustomers(search);
      if (res && res.success) {
        const list = (res.data || []).map(c => {
          const cName = c.customerName || c.name || 'Unnamed Customer';
          const bal = (c.currentBalance !== undefined && c.currentBalance !== null)
            ? Number(c.currentBalance)
            : ((c.openingBalance !== undefined && c.openingBalance !== null) ? Number(c.openingBalance) : (Number(c.balance) || 0));
          return {
            ...c,
            customerName: cName,
            name: cName,
            balance: bal,
            currentBalance: bal
          };
        });
        setCustomers(list);
      }
    } catch (err) {
      console.warn('Error fetching customers:', err.message);
    } finally {
      setCustomersLoading(false);
    }
  };

  const fetchItems = async (search = '', categoryId = selectedItemCategory) => {
    setItemsLoading(true);
    try {
      const res = await api.getWHItems(search, categoryId || '');
      if (res && res.success) {
        setAvailableItems(res.data || []);
      }
    } catch (err) {
      console.warn('Error fetching items:', err.message);
    } finally {
      setItemsLoading(false);
    }
  };

  const fetchPreviousSales = async () => {
    setHistoryLoading(true);
    try {
      const res = await api.getWHSales({ limit: 50 });
      if (res && res.success) {
        setPreviousSales(res.data || []);
      }
    } catch (err) {
      console.warn('Error fetching previous sales:', err.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Open barcode scanner
  const handleStartScan = () => {
    haptic.light();
    setScannerVisible(true);
  };

  // Barcode scanned callback
  const handleBarcodeScanned = async (scannedCode) => {
    setScannerVisible(false);
    if (!scannedCode) return;
    haptic.success();

    try {
      const res = await api.getWHItems(scannedCode.trim());
      if (res && res.success && res.data && res.data.length > 0) {
        const found = res.data.find(i => (i.barcode || '').trim() === scannedCode.trim()) || res.data[0];
        openQtyModalForItem(found);
      } else {
        Alert.alert(
          'Item Not Found',
          `No item registered with barcode: ${scannedCode}.\nWould you like to search manually?`,
          [
            { text: 'Search Manually', onPress: () => handleOpenManualItemPicker(scannedCode) },
            { text: 'Cancel', style: 'cancel' }
          ]
        );
      }
    } catch (err) {
      Alert.alert('Scan Lookup Error', err.message);
    }
  };

  const handleOpenManualItemPicker = (initialQuery = '') => {
    haptic.light();
    setItemSearch(initialQuery);
    fetchItems(initialQuery, selectedItemCategory);
    setItemPickerVisible(true);
  };

  // Helper to extract total available stock
  const getItemAvailableStock = (item) => {
    if (!item) return 0;
    if (typeof item.stock === 'number') return item.stock;
    if (Array.isArray(item.stock) && item.stock.length > 0) {
      return item.stock.reduce((acc, s) => acc + (parseFloat(s.quantity) || 0), 0);
    }
    if (item.availableStock !== undefined) return parseFloat(item.availableStock) || 0;
    return 0;
  };

  // Opens quantity modal with automatic discount according to quantity (matching Web wh-sale.js)
  const openQtyModalForItem = (item) => {
    const availableStock = getItemAvailableStock(item);
    if (availableStock <= 0) {
      haptic.warning();
      Alert.alert(
        'Out of Stock',
        `Item "${item.name}" has 0 available stock in warehouse. You cannot create a sale for out-of-stock items.`
      );
      return;
    }

    setSelectedItemToAdd(item);
    const defaultRate = item.costPrice || item.salePrice || item.tradePrice || 0;
    const retailRate = item.retailPrice || item.salePrice || 0;
    const perPackIncentive = parseFloat(item.incentive) || 0;

    const initialQty = 1;
    setModalQty(String(initialQty));
    setModalRate(String(defaultRate));
    setModalRetail(String(retailRate));
    setModalIncentive(String(perPackIncentive));

    // Calculate discount dynamically according to quantity:
    // discRs = qty * incentive
    // disc% = (discRs / subTotal) * 100
    const subTotal = initialQty * defaultRate;
    const discRs = perPackIncentive * initialQty;
    const discPct = subTotal > 0 ? ((discRs / subTotal) * 100).toFixed(2) : '0';

    setModalDiscAmount(String(discRs));
    setModalDiscPercent(discPct);
    setQtyModalVisible(true);
  };

  // Recalculate discount according to quantity change with stock limit enforcement
  const handleModalQtyChange = (newQtyStr) => {
    let q = parseFloat(newQtyStr) || 0;
    const maxStock = getItemAvailableStock(selectedItemToAdd);
    if (maxStock > 0 && q > maxStock) {
      haptic.warning();
      Alert.alert(
        'Stock Limit Exceeded',
        `Only ${maxStock} units available in warehouse for "${selectedItemToAdd?.name}". Quantity capped at available stock.`
      );
      q = maxStock;
      newQtyStr = String(maxStock);
    }

    setModalQty(newQtyStr);
    const rate = parseFloat(modalRate) || 0;
    const inc = parseFloat(modalIncentive) || 0;
    const sub = q * rate;
    const discRs = inc * q; // RS VALUE CALCULATE ACCORDING TO QTY
    const discPct = sub > 0 ? ((discRs / sub) * 100).toFixed(2) : '0';
    setModalDiscAmount(String(discRs));
    setModalDiscPercent(discPct);
  };

  // Quick increment chips (+1, +5, +10, +25, +50, +100)
  const handleModalQtyChip = (increment) => {
    haptic.light();
    const current = parseFloat(modalQty) || 0;
    const maxStock = getItemAvailableStock(selectedItemToAdd);
    let next = Math.max(1, current + increment);
    if (maxStock > 0 && next > maxStock) {
      next = maxStock;
    }
    handleModalQtyChange(String(next));
  };

  // Add Item to Cart
  const handleAddItemToCart = () => {
    if (!selectedItemToAdd) return;
    const qty = parseFloat(modalQty) || 0;
    const rate = parseFloat(modalRate) || 0;
    const retail = parseFloat(modalRetail) || rate;
    const incentive = parseFloat(modalIncentive) || 0;
    const discRs = parseFloat(modalDiscAmount) || (incentive * qty);
    const discPct = parseFloat(parseFloat(modalDiscPercent || 0).toFixed(2)) || (subTotal > 0 ? parseFloat(((discRs / subTotal) * 100).toFixed(2)) : 0);

    if (qty <= 0) {
      Alert.alert('Invalid Quantity', 'Please enter a quantity greater than zero.');
      return;
    }

    // Check available stock
    const availableStock = getItemAvailableStock(selectedItemToAdd);
    const existingIndex = cartItems.findIndex(i => String(i.item) === String(selectedItemToAdd._id));
    const currentCartQty = existingIndex >= 0 ? (cartItems[existingIndex].quantity || 0) : 0;
    const totalRequestedQty = currentCartQty + qty;

    if (availableStock > 0 && totalRequestedQty > availableStock) {
      Alert.alert(
        'Insufficient Stock',
        `Cannot add ${qty} units. Already in cart: ${currentCartQty}, Warehouse stock: ${availableStock}. Maximum you can add is ${Math.max(0, availableStock - currentCartQty)}.`
      );
      return;
    }

    const subTotal = qty * rate;
    const netTotal = Math.max(0, subTotal - discRs);
    const resolvedClassName = selectedItemToAdd.className || selectedItemToAdd.itemClass?.name || (typeof selectedItemToAdd.itemClass === 'string' ? selectedItemToAdd.itemClass : 'General Products');

    let updatedCart;
    if (existingIndex >= 0) {
      updatedCart = [...cartItems];
      const prev = updatedCart[existingIndex];
      const newQty = prev.quantity + qty;
      const newSub = newQty * rate;
      const newDiscAmt = incentive * newQty; // RS VALUE CALCULATE ACCORDING TO QTY
      const newDiscPct = newSub > 0 ? parseFloat(((newDiscAmt / newSub) * 100).toFixed(2)) : 0;
      updatedCart[existingIndex] = {
        ...prev,
        quantity: newQty,
        pcsPrice: rate,
        retailPrice: retail,
        incentive,
        discountPercent: newDiscPct,
        discountAmount: newDiscAmt,
        subTotal: newSub,
        netTotal: newSub - newDiscAmt,
        availableStock: availableStock || prev.availableStock
      };
    } else {
      updatedCart = [
        ...cartItems,
        {
          item: selectedItemToAdd._id,
          name: selectedItemToAdd.name,
          barcode: selectedItemToAdd.barcode || selectedItemToAdd.itemsCode || '',
          pack: selectedItemToAdd.pack || '',
          itemClass: selectedItemToAdd.itemClass,
          className: resolvedClassName,
          availableStock: availableStock,
          quantity: qty,
          pcsPrice: rate,
          retailPrice: retail,
          incentive,
          discountPercent: discPct,
          discountAmount: discRs,
          subTotal,
          netTotal
        }
      ];
    }

    setCartItems(updatedCart);
    setQtyModalVisible(false);
    setItemPickerVisible(false);
    setSelectedItemToAdd(null);
    haptic.success();
  };

  // Remove item from cart
  const handleRemoveCartItem = (index) => {
    haptic.warning();
    const updated = cartItems.filter((_, idx) => idx !== index);
    setCartItems(updated);
  };

  // Update cart item quantity with dynamic discount calculation and stock limits
  const handleUpdateCartQty = (index, delta) => {
    haptic.light();
    const updated = [...cartItems];
    const cur = updated[index];
    const newQty = Math.max(1, (cur.quantity || 1) + delta);

    if (delta > 0 && cur.availableStock && newQty > cur.availableStock) {
      haptic.warning();
      Alert.alert(
        'Stock Limit',
        `Cannot exceed available warehouse stock of ${cur.availableStock} units for "${cur.name}".`
      );
      return;
    }

    const subTotal = newQty * (cur.pcsPrice || 0);
    const inc = cur.incentive || 0;
    const discAmt = inc * newQty; // RS VALUE CALCULATE ACCORDING TO QTY
    const discPct = subTotal > 0 ? parseFloat(((discAmt / subTotal) * 100).toFixed(2)) : 0;

    updated[index] = {
      ...cur,
      quantity: newQty,
      subTotal,
      discountPercent: discPct,
      discountAmount: discAmt,
      netTotal: Math.max(0, subTotal - discAmt)
    };
    setCartItems(updated);
  };

  // Calculations
  const grossSubtotal = cartItems.reduce((acc, item) => acc + (item.subTotal || 0), 0);
  const lineDiscountTotal = cartItems.reduce((acc, item) => acc + (item.discountAmount || 0), 0);
  const globalDiscAmt = parseFloat(globalDiscount) || 0;
  const netPayable = Math.max(0, grossSubtotal - lineDiscountTotal - globalDiscAmt);
  const paidVal = parseFloat(paidAmount) || 0;
  const balanceDue = Math.max(0, netPayable - paidVal);

  // Save or Update Sale Invoice (Saves to MongoDB and syncs directly with Web ERP)
  const handleSaveSale = async () => {
    if (!selectedCustomer) {
      Alert.alert('Customer Required', 'Please select a customer for this warehouse sale invoice.');
      return;
    }
    if (cartItems.length === 0) {
      Alert.alert('Empty Cart', 'Please add at least one product using Camera Scan or Manual Search.');
      return;
    }

    // Pre-flight validation: check stock limits
    for (const line of cartItems) {
      if (line.availableStock && line.quantity > line.availableStock) {
        Alert.alert(
          'Stock Exceeded',
          `Item "${line.name}" quantity (${line.quantity}) exceeds available stock (${line.availableStock}). Please reduce quantity before saving.`
        );
        return;
      }
    }

    haptic.selection();
    setIsSubmitting(true);

    try {
      const payload = {
        invoiceNo: invoiceNo || `INV-${Date.now().toString().slice(-6)}`,
        invoiceDate: new Date(invoiceDate),
        customer: selectedCustomer._id,
        whCategory: selectedItemCategory || null,
        payMode,
        remarks,
        status: 'Posted',
        items: cartItems.map(i => ({
          item: i.item,
          name: i.name,
          barcode: i.barcode,
          pack: i.pack,
          itemClass: i.itemClass,
          className: i.className || i.itemClass?.name || (typeof i.itemClass === 'string' ? i.itemClass : null),
          quantity: i.quantity,
          pcsPrice: i.pcsPrice,
          retailPrice: i.retailPrice,
          incentive: i.incentive || 0,
          subTotal: i.subTotal,
          discountPercent: parseFloat((Number(i.discountPercent) || 0).toFixed(2)),
          discountAmount: i.discountAmount,
          netTotal: i.netTotal
        })),
        totalQuantity: cartItems.reduce((acc, i) => acc + i.quantity, 0),
        totalAmount: grossSubtotal,
        globalDiscountAmount: globalDiscAmt,
        netTotal: netPayable,
        paidAmount: paidVal,
        invoiceBalance: balanceDue
      };

      let res;
      if (editingSaleId) {
        // Update existing invoice
        res = await api.updateWHSale(editingSaleId, payload);
      } else {
        // Create new invoice
        res = await api.createWHSale(payload);
      }

      if (res && res.success) {
        haptic.success();
        const savedInvoice = {
          ...(res.data || payload),
          _id: editingSaleId || res.data?._id,
          customer: selectedCustomer,
          customerName: selectedCustomer?.customerName || selectedCustomer?.name || ''
        };

        // Refresh previous sales list
        fetchPreviousSales();

        const successMsg = editingSaleId
          ? `Invoice #${invoiceNo} updated successfully!`
          : `Invoice #${invoiceNo} posted successfully!`;

        Alert.alert('Success', successMsg);

        // Open Web-Parity In-App Invoice Viewer immediately!
        setInvoiceToView(savedInvoice);
        setInvoiceViewVisible(true);
        resetForm();
      } else {
        throw new Error(res?.error || res?.message || 'Could not save sale invoice.');
      }
    } catch (err) {
      console.error('Save WH Sale error:', err);
      Alert.alert(editingSaleId ? 'Sale Update Failed' : 'Sale Creation Failed', err.message || 'Server error while saving sale.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setCartItems([]);
    setSelectedCustomer(null);
    setSelectedItemCategory(null);
    setRemarks('');
    setPaidAmount('0');
    setGlobalDiscount('0');
    setEditingSaleId(null);
    fetchNextInvoiceNo();
  };

  // Handle Edit Invoice: Loads previous invoice into entry form for modifications
  const handleEditInvoice = async (sale) => {
    haptic.selection();
    try {
      let saleData = sale;
      // Fetch full populated sale if _id is available
      if (sale._id) {
        try {
          const res = await api.getWHSale(sale._id);
          if (res && res.success && res.data) {
            saleData = res.data;
          }
        } catch (e) {
          console.warn('Could not fetch full sale for edit, using item from list:', e.message);
        }
      }

      setEditingSaleId(saleData._id);
      setInvoiceNo(saleData.invoiceNo || '');
      setInvoiceDate(saleData.invoiceDate ? new Date(saleData.invoiceDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
      setPayMode(saleData.payMode || 'Credit');
      setRemarks(saleData.remarks || '');
      setPaidAmount(String(saleData.paidAmount || 0));
      setGlobalDiscount(String(saleData.globalDiscountAmount || 0));

      // Customer
      if (saleData.customer) {
        const cObj = typeof saleData.customer === 'object' ? saleData.customer : { _id: saleData.customer };
        const cName = cObj.customerName || cObj.name || saleData.customerName || 'Selected Customer';
        const cBal = (cObj.currentBalance !== undefined && cObj.currentBalance !== null)
          ? Number(cObj.currentBalance)
          : ((cObj.openingBalance !== undefined && cObj.openingBalance !== null) ? Number(cObj.openingBalance) : (Number(cObj.balance) || 0));
        setSelectedCustomer({
          ...cObj,
          customerName: cName,
          name: cName,
          balance: cBal,
          currentBalance: cBal
        });
      }

      // Category
      if (saleData.whCategory) {
        const catId = typeof saleData.whCategory === 'object' ? saleData.whCategory._id : saleData.whCategory;
        setSelectedItemCategory(catId);
      } else {
        setSelectedItemCategory(null);
      }

      // Map cart items
      const loadedItems = (saleData.items || []).map(line => {
        const itemObj = line.item || {};
        const itemId = (typeof line.item === 'object' && line.item?._id) ? line.item._id : (line.item || line._id);
        const name = line.name || line.itemName || itemObj.name || itemObj.itemName || 'Product';
        const barcode = line.barcode || itemObj.barcode || itemObj.itemsCode || '';
        const pack = line.pack || itemObj.pack || '';
        const itemClass = line.itemClass || itemObj.itemClass;
        const className = line.className || (typeof itemClass === 'string' ? itemClass : itemClass?.name) || 'General Products';
        const qty = parseFloat(line.quantity || 0);
        const rate = parseFloat(line.pcsPrice || line.rate || 0);
        const retail = parseFloat(line.retailPrice || itemObj.retailPrice || 0);
        const incentive = parseFloat(line.incentive || itemObj.incentive || 0);
        const subTotal = qty * rate;
        const discRs = parseFloat(line.discountAmount || line.disRs || (incentive * qty) || 0);
        const discPct = subTotal > 0 ? parseFloat(((discRs / subTotal) * 100).toFixed(2)) : parseFloat((Number(line.discountPercent || line.disP || 0)).toFixed(2));
        const netTotal = parseFloat(line.netTotal || line.total || (subTotal - discRs) || 0);
        const baseStock = getItemAvailableStock(itemObj);

        return {
          item: itemId,
          name,
          barcode,
          pack,
          itemClass,
          className,
          availableStock: baseStock > 0 ? (baseStock + qty) : null,
          quantity: qty,
          pcsPrice: rate,
          retailPrice: retail,
          incentive,
          discountPercent: discPct,
          discountAmount: discRs,
          subTotal,
          netTotal
        };
      });

      setCartItems(loadedItems);
      setActiveTab('new');
      haptic.success();
      Alert.alert(
        'Invoice Loaded for Editing',
        `Invoice #${saleData.invoiceNo || ''} is now loaded in the entry form. You can adjust quantities, discount, add/remove items, and save updates.`
      );
    } catch (err) {
      console.error('Error loading invoice for editing:', err);
      Alert.alert('Edit Error', 'Could not load invoice data for editing.');
    }
  };

  // Open invoice viewer for a previously posted sale
  const handleOpenPreviousInvoice = async (sale) => {
    haptic.selection();
    setInvoiceToView(sale);
    setInvoiceViewVisible(true);

    // Fetch full single sale with populated item classes in background
    if (sale._id) {
      try {
        setInvoiceViewLoading(true);
        const res = await api.getWHSale(sale._id);
        if (res && res.success && res.data) {
          setInvoiceToView(res.data);
        }
      } catch (e) {
        console.warn('Could not load detailed sale:', e.message);
      } finally {
        setInvoiceViewLoading(false);
      }
    }
  };

  // Filter previous sales
  const filteredHistory = previousSales.filter(s => {
    if (!historySearch.trim()) return true;
    const q = historySearch.toLowerCase().trim();
    const cust = (s.customer?.customerName || s.customer?.name || s.customerName || '').toLowerCase();
    const inv = (s.invoiceNo || '').toLowerCase();
    const rem = (s.remarks || '').toLowerCase();
    return cust.includes(q) || inv.includes(q) || rem.includes(q);
  });

  // Group items by Item Class for Web Parity view
  const getSaleClassGroups = (sale) => {
    if (!sale || !sale.items) return {};
    const groups = {};
    (sale.items || []).forEach(line => {
      const it = line.item || {};
      const itId = typeof it === 'object' ? (it._id || '') : it;
      const cached = availableItems.find(ai => 
        (itId && String(ai._id) === String(itId)) ||
        (line.barcode && ai.barcode && ai.barcode === line.barcode) ||
        (line.name && ai.name && ai.name.toLowerCase() === line.name.toLowerCase())
      );
      const classObj = line.itemClass || it.itemClass || cached?.itemClass || {};
      const className = classObj.name || (typeof classObj === 'string' ? classObj : null) || line.className || cached?.className || cached?.itemClass?.name || (typeof it.itemClass === 'string' ? it.itemClass : null) || 'General Products';
      if (!groups[className]) groups[className] = [];
      groups[className].push(line);
    });
    return groups;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0B1120" />

      {/* Screen Header */}
      <View style={styles.screenHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack || (() => navigation && navigation.goBack())}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color="#F8FAFC" />
        </TouchableOpacity>
        <View style={styles.headerTitleBox}>
          <Text style={styles.headerTitle}>Warehouse Sale Entry</Text>
          <Text style={styles.headerSub}>Fast Wholesale Invoicing & Stock Dispatch</Text>
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>LIVE SYNC</Text>
        </View>
      </View>

      {/* Segmented Tab Bar */}
      <View style={styles.segmentedTabBar}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'new' && styles.segmentBtnActive]}
          onPress={() => {
            haptic.light();
            setActiveTab('new');
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name="flash-outline"
            size={17}
            color={activeTab === 'new' ? '#06B6D4' : '#94A3B8'}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.segmentBtnText, activeTab === 'new' && styles.segmentBtnTextActive]}>
            ⚡ Fast Sale Entry
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'history' && styles.segmentBtnActive]}
          onPress={() => {
            haptic.light();
            setActiveTab('history');
            fetchPreviousSales();
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name="receipt-outline"
            size={17}
            color={activeTab === 'history' ? '#06B6D4' : '#94A3B8'}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.segmentBtnText, activeTab === 'history' && styles.segmentBtnTextActive]}>
            Previous Invoices {previousSales.length > 0 ? `(${previousSales.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'new' ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.formScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* EDITING INVOICE BANNER */}
            {editingSaleId && (
              <View style={styles.editingBanner}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="create" size={20} color="#F59E0B" style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.editingBannerTitle}>EDITING INVOICE #{invoiceNo}</Text>
                    <Text style={styles.editingBannerSub}>
                      Update items, quantities or discounts. Stock & ledger will sync on update.
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.cancelEditBtn}
                  onPress={() => {
                    haptic.light();
                    resetForm();
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle-outline" size={15} color="#F8FAFC" style={{ marginRight: 4 }} />
                  <Text style={styles.cancelEditBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* SECTION 1: INVOICE & CUSTOMER */}
            <View style={[styles.card, styles.cardAccentCyan]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleWithIcon}>
                  <Ionicons name="document-text" size={17} color="#06B6D4" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionHeaderTitle}>INVOICE & CUSTOMER</Text>
                </View>
                <TouchableOpacity onPress={fetchNextInvoiceNo} style={styles.refreshBtn}>
                  <Ionicons name="refresh" size={14} color="#06B6D4" />
                  <Text style={styles.refreshBtnText}>New Inv#</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.formRow}>
                <View style={[styles.formCol, { flex: 1.2 }]}>
                  <Text style={styles.inputLabel}>INVOICE NUMBER</Text>
                  <View style={styles.badgeInput}>
                    <Ionicons name="receipt-outline" size={15} color="#06B6D4" style={{ marginRight: 6 }} />
                    <TextInput
                      style={styles.badgeInputText}
                      value={invoiceNo}
                      onChangeText={setInvoiceNo}
                      placeholder="INV-0001"
                      placeholderTextColor="#64748B"
                    />
                  </View>
                </View>

                <View style={[styles.formCol, { flex: 1, marginLeft: 10 }]}>
                  <Text style={styles.inputLabel}>DATE</Text>
                  <View style={styles.badgeInput}>
                    <Ionicons name="calendar-outline" size={15} color="#94A3B8" style={{ marginRight: 6 }} />
                    <Text style={styles.dateText}>{invoiceDate}</Text>
                  </View>
                </View>
              </View>

              {/* Customer Selector */}
              <View style={{ marginTop: 12 }}>
                <Text style={styles.inputLabel}>SELECT BILL-TO CUSTOMER *</Text>
                <TouchableOpacity
                  style={styles.customerSelector}
                  onPress={() => {
                    haptic.light();
                    fetchCustomers('');
                    setCustomerModalVisible(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="person-outline" size={18} color="#06B6D4" style={{ marginRight: 8 }} />
                  <Text
                    style={[
                      styles.customerSelectorText,
                      selectedCustomer && { color: '#F8FAFC', fontWeight: '700' }
                    ]}
                    numberOfLines={1}
                  >
                    {selectedCustomer ? (selectedCustomer.customerName || selectedCustomer.name) : 'Tap to select registered wholesale customer...'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#64748B" />
                </TouchableOpacity>

                {selectedCustomer && (
                  <View style={styles.customerMetaCard}>
                    <View style={styles.customerMetaCol}>
                      <Text style={styles.customerMetaLabel}>CUSTOMER CODE</Text>
                      <Text style={styles.customerMetaVal}>{selectedCustomer.code || '-'}</Text>
                    </View>
                    <View style={styles.customerMetaCol}>
                      <Text style={styles.customerMetaLabel}>PHONE</Text>
                      <Text style={styles.customerMetaVal}>{selectedCustomer.phone || '-'}</Text>
                    </View>
                    <View style={[styles.customerMetaCol, { alignItems: 'flex-end' }]}>
                      <Text style={styles.customerMetaLabel}>CURRENT BALANCE</Text>
                      <Text style={styles.customerBalanceHighlight}>
                        Rs. {formatPKR(selectedCustomer.currentBalance ?? selectedCustomer.balance ?? 0)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Payment Mode Pills */}
              <View style={{ marginTop: 12 }}>
                <Text style={styles.inputLabel}>PAYMENT SETTLEMENT MODE</Text>
                <View style={styles.pillRow}>
                  {['Credit', 'Cash', 'Bank'].map(mode => (
                    <TouchableOpacity
                      key={mode}
                      style={[
                        styles.modePill,
                        payMode === mode && styles.modePillActive
                      ]}
                      onPress={() => {
                        haptic.selection();
                        setPayMode(mode);
                        if (mode === 'Cash') {
                          setPaidAmount(String(netPayable));
                        }
                      }}
                    >
                      <Text style={[styles.modePillText, payMode === mode && styles.modePillTextActive]}>
                        {mode === 'Credit' ? '💳 Credit' : mode === 'Cash' ? '💵 Cash' : '🏦 Bank'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* SECTION 2: FAST PRODUCT ENTRY */}
            <View style={[styles.card, styles.cardAccentBlue, { marginTop: 12 }]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleWithIcon}>
                  <Ionicons name="barcode-outline" size={17} color="#38BDF8" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionHeaderTitle}>ADD INVENTORY PRODUCTS</Text>
                </View>
                <Text style={styles.sectionHeaderHint}>Auto Incentive Discount</Text>
              </View>

              {/* Category Selector (Matching Web wh-sale.html) */}
              <View style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={styles.inputLabel}>SELECT CATEGORY (ITEM FILTER)</Text>
                  {selectedItemCategory && (
                    <TouchableOpacity onPress={() => {
                      haptic.selection();
                      setSelectedItemCategory(null);
                      fetchItems(itemSearch, null);
                    }}>
                      <Text style={{ fontSize: 11, color: '#38BDF8', fontWeight: '700' }}>✕ Reset (All)</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
                >
                  <TouchableOpacity
                    style={[
                      styles.categoryFilterChip,
                      !selectedItemCategory && styles.categoryFilterChipActive
                    ]}
                    onPress={() => {
                      haptic.selection();
                      setSelectedItemCategory(null);
                      fetchItems(itemSearch, null);
                    }}
                  >
                    <Text style={[
                      styles.categoryFilterChipText,
                      !selectedItemCategory && styles.categoryFilterChipTextActive
                    ]}>
                      All Categories
                    </Text>
                  </TouchableOpacity>

                  {itemCategories.map(cat => {
                    const isSelected = selectedItemCategory === cat._id;
                    return (
                      <TouchableOpacity
                        key={cat._id}
                        style={[
                          styles.categoryFilterChip,
                          isSelected && styles.categoryFilterChipActive
                        ]}
                        onPress={() => {
                          haptic.selection();
                          const nextCat = isSelected ? null : cat._id;
                          setSelectedItemCategory(nextCat);
                          fetchItems(itemSearch, nextCat);
                        }}
                      >
                        <Text style={[
                          styles.categoryFilterChipText,
                          isSelected && styles.categoryFilterChipTextActive
                        ]}>
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.entryButtonsRow}>
                <TouchableOpacity
                  style={styles.scanBtn}
                  onPress={handleStartScan}
                  activeOpacity={0.8}
                >
                  <Ionicons name="camera" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.scanBtnText}>CAMERA SCAN</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.manualBtn}
                  onPress={() => handleOpenManualItemPicker('')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="search" size={18} color="#06B6D4" style={{ marginRight: 6 }} />
                  <Text style={styles.manualBtnText}>SEARCH INVENTORY</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* SECTION 3: INVOICE CART ITEMS */}
            <View style={[styles.card, styles.cardAccentViolet, { marginTop: 12 }]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleWithIcon}>
                  <Ionicons name="cart-outline" size={18} color="#A78BFA" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionHeaderTitle}>
                    INVOICE LINE ITEMS ({cartItems.length})
                  </Text>
                </View>
                {cartItems.length > 0 && (
                  <TouchableOpacity onPress={() => setCartItems([])}>
                    <Text style={styles.clearCartText}>Clear All</Text>
                  </TouchableOpacity>
                )}
              </View>

              {cartItems.length === 0 ? (
                <View style={styles.emptyCartBox}>
                  <Ionicons name="cart-outline" size={38} color="#334155" />
                  <Text style={styles.emptyCartTitle}>No products added yet</Text>
                  <Text style={styles.emptyCartSub}>
                    Scan product barcode with camera or tap Search Inventory to add items with dynamic incentive discounts.
                  </Text>
                </View>
              ) : (
                cartItems.map((item, idx) => (
                  <View key={`cart-${idx}`} style={styles.cartItemCard}>
                    <View style={styles.cartItemTop}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <View style={styles.itemIndexBadge}>
                            <Text style={styles.itemIndexText}>{idx + 1}</Text>
                          </View>
                          <Text style={styles.cartItemName} numberOfLines={2}>{item.name}</Text>
                        </View>
                        <Text style={styles.cartItemBarcode}>
                          Barcode: {item.barcode || 'N/A'} • Rate: Rs. {formatPKR(item.pcsPrice)} • Retail: Rs. {formatPKR(item.retailPrice)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleRemoveCartItem(idx)}
                        style={styles.trashBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>

                    {/* Incentive & Discount Breakdown */}
                    {item.incentive > 0 && (
                      <View style={styles.incentivePillRow}>
                        <View style={styles.incentiveBadge}>
                          <Ionicons name="gift-outline" size={12} color="#10B981" style={{ marginRight: 4 }} />
                          <Text style={styles.incentiveBadgeText}>
                            Incentive: Rs. {formatPKR(item.incentive)}/pack
                          </Text>
                        </View>
                        <Text style={styles.dynamicDiscText}>
                          Discount: -Rs. {formatPKR(item.discountAmount)} ({(Number(item.discountPercent) || 0).toFixed(2)}%)
                        </Text>
                      </View>
                    )}

                    <View style={styles.cartItemBottom}>
                      {/* Quantity Stepper with dynamic discount recalculation */}
                      <View style={styles.qtyControls}>
                        <TouchableOpacity
                          style={styles.qtyBtn}
                          onPress={() => handleUpdateCartQty(idx, -1)}
                        >
                          <Text style={styles.qtyBtnText}>-</Text>
                        </TouchableOpacity>
                        <View style={styles.qtyValBox}>
                          <Text style={styles.qtyVal}>{item.quantity}</Text>
                          <Text style={styles.qtyPackSub}>packs</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.qtyBtn}
                          onPress={() => handleUpdateCartQty(idx, 1)}
                        >
                          <Text style={styles.qtyBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.cartItemNetLabel}>NET TOTAL</Text>
                        <Text style={styles.cartItemTotal}>Rs. {formatPKR(item.netTotal)}</Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* SECTION 4: INVOICE LEDGER SETTLEMENT */}
            {cartItems.length > 0 && (
              <View style={[styles.card, styles.cardAccentEmerald, { marginTop: 12 }]}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionTitleWithIcon}>
                    <Ionicons name="calculator-outline" size={18} color="#10B981" style={{ marginRight: 6 }} />
                    <Text style={styles.sectionHeaderTitle}>INVOICE LEDGER SETTLEMENT</Text>
                  </View>
                  <Text style={styles.sectionHeaderHint}>Official Commercial Total</Text>
                </View>

                <View style={styles.summaryLine}>
                  <Text style={styles.summaryLabel}>Gross Subtotal ({cartItems.reduce((s, i) => s + i.quantity, 0)} packs):</Text>
                  <Text style={styles.summaryVal}>Rs. {formatPKR(grossSubtotal)}</Text>
                </View>

                {lineDiscountTotal > 0 && (
                  <View style={styles.summaryLine}>
                    <Text style={styles.summaryLabel}>Total Incentive Discounts:</Text>
                    <Text style={[styles.summaryVal, { color: '#EF4444' }]}>
                      - Rs. {formatPKR(lineDiscountTotal)}
                    </Text>
                  </View>
                )}

                <View style={styles.summaryLine}>
                  <Text style={styles.summaryLabel}>Extra / Special Discount (Rs):</Text>
                  <TextInput
                    style={styles.discountInput}
                    keyboardType="numeric"
                    value={globalDiscount}
                    onChangeText={setGlobalDiscount}
                    placeholder="0"
                    placeholderTextColor="#64748B"
                  />
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.netTotalBox}>
                  <Text style={styles.netTotalLabel}>NET PAYABLE (PKR):</Text>
                  <Text style={styles.netTotalVal}>PKR {formatPKR(netPayable)}</Text>
                </View>

                {payMode !== 'Credit' && (
                  <View style={[styles.summaryLine, { marginTop: 10 }]}>
                    <Text style={styles.summaryLabel}>Received Amount (Rs):</Text>
                    <TextInput
                      style={styles.paidInput}
                      keyboardType="numeric"
                      value={paidAmount}
                      onChangeText={setPaidAmount}
                      placeholder="0"
                      placeholderTextColor="#64748B"
                    />
                  </View>
                )}

                <View style={[styles.summaryLine, { marginTop: 6 }]}>
                  <Text style={styles.balanceLabel}>Remaining Invoice Balance:</Text>
                  <Text style={styles.balanceVal}>PKR {formatPKR(balanceDue)}</Text>
                </View>

                {/* Customer Balance Impact */}
                {selectedCustomer && (
                  <View style={styles.customerBalanceImpactCard}>
                    <Text style={styles.customerBalanceImpactTitle}>CUSTOMER LEDGER PREVIEW:</Text>
                    <Text style={styles.customerBalanceImpactDesc}>
                      Previous Balance: <Text style={{ color: '#F8FAFC' }}>Rs. {formatPKR(selectedCustomer.currentBalance ?? selectedCustomer.balance ?? 0)}</Text>
                      {'\n'}New Projected Balance: <Text style={{ color: '#10B981', fontWeight: '800' }}>Rs. {formatPKR((selectedCustomer.currentBalance ?? selectedCustomer.balance ?? 0) + balanceDue)}</Text>
                    </Text>
                  </View>
                )}

                {/* Remarks Field */}
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.inputLabel}>REMARKS / INVOICE NOTES</Text>
                  <TextInput
                    style={styles.remarksInput}
                    value={remarks}
                    onChangeText={setRemarks}
                    placeholder="Optional delivery details, gate pass or notes..."
                    placeholderTextColor="#64748B"
                  />
                </View>
              </View>
            )}

            {/* Bottom Spacer */}
            <View style={{ height: 110 }} />
          </ScrollView>

          {/* Sticky Post/Update Sale Button */}
          {cartItems.length > 0 && (
            <View style={styles.stickyFooter}>
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  editingSaleId && styles.submitBtnUpdate,
                  isSubmitting && styles.submitBtnDisabled
                ]}
                onPress={handleSaveSale}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons
                      name={editingSaleId ? "checkmark-done-circle" : "checkmark-circle"}
                      size={20}
                      color="#FFFFFF"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.submitBtnText}>
                      {editingSaleId
                        ? `UPDATE INVOICE #${invoiceNo} (PKR ${formatPKR(netPayable)})`
                        : `SAVE & POST SALE (PKR ${formatPKR(netPayable)})`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
      ) : (
        /* History / Previous Invoices Tab */
        <View style={styles.historyContainer}>
          <View style={styles.searchBarBox}>
            <Ionicons name="search" size={18} color="#64748B" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchBarInput}
              value={historySearch}
              onChangeText={setHistorySearch}
              placeholder="Search previous invoices by Customer or Inv#..."
              placeholderTextColor="#64748B"
            />
            {historySearch.length > 0 && (
              <TouchableOpacity onPress={() => setHistorySearch('')}>
                <Ionicons name="close-circle" size={18} color="#64748B" />
              </TouchableOpacity>
            )}
          </View>

          {historyLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#06B6D4" />
              <Text style={styles.loadingText}>Loading warehouse sales...</Text>
            </View>
          ) : filteredHistory.length === 0 ? (
            <View style={styles.centerContainer}>
              <Ionicons name="document-text-outline" size={48} color="#334155" />
              <Text style={styles.emptyTitle}>No Invoices Found</Text>
              <Text style={styles.emptySub}>No previous sale records match your search.</Text>
            </View>
          ) : (
            <FlatList
              data={filteredHistory}
              keyExtractor={(item) => item._id || item.invoiceNo}
              contentContainerStyle={{ padding: 14, paddingBottom: 60 }}
              renderItem={({ item }) => (
                <View style={styles.historyCard}>
                  <View style={styles.historyCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyInvNo}>#{item.invoiceNo || 'INV'}</Text>
                      <Text style={styles.historyCustomer}>
                        {item.customer?.customerName || item.customer?.name || item.customerName || 'Walk-in Customer'}
                      </Text>
                    </View>
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusText}>{item.status || 'Posted'}</Text>
                    </View>
                  </View>

                  <View style={styles.historyMetaRow}>
                    <Text style={styles.historyDate}>
                      📅 {item.invoiceDate ? new Date(item.invoiceDate).toLocaleDateString() : '-'}
                    </Text>
                    <Text style={styles.historyMode}>Mode: {item.payMode || 'Credit'}</Text>
                  </View>

                  <View style={styles.historyTotalsRow}>
                    <Text style={styles.historyItemCount}>
                      {item.items?.length || 0} Products • Packs: {item.totalQuantity || item.items?.reduce((s, i) => s + (i.quantity || 0), 0) || 0}
                    </Text>
                    <Text style={styles.historyAmount}>
                      PKR {formatPKR(item.netTotal || item.totalAmount || 0)}
                    </Text>
                  </View>

                  <View style={styles.historyDivider} />

                  {/* Actions: View Web Slip, Edit Invoice, Print PDF, WhatsApp */}
                  <View style={styles.historyActionsRow}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnView]}
                      onPress={() => handleOpenPreviousInvoice(item)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="eye-outline" size={14} color="#38BDF8" style={{ marginRight: 3 }} />
                      <Text style={[styles.actionBtnText, { color: '#38BDF8' }]}>View</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnEdit]}
                      onPress={() => handleEditInvoice(item)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="create-outline" size={14} color="#F59E0B" style={{ marginRight: 3 }} />
                      <Text style={[styles.actionBtnText, { color: '#F59E0B' }]}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => {
                        haptic.selection();
                        printWHSaleInvoice(item, false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="print-outline" size={14} color="#06B6D4" style={{ marginRight: 3 }} />
                      <Text style={styles.actionBtnText}>Print</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnWhatsApp]}
                      onPress={() => {
                        haptic.selection();
                        printWHSaleInvoice(item, true);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="logo-whatsapp" size={14} color="#10B981" style={{ marginRight: 3 }} />
                      <Text style={[styles.actionBtnText, { color: '#10B981' }]}>WhatsApp</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      )}

      {/* Camera Barcode Scanner Modal */}
      <CameraBarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScan={handleBarcodeScanned}
        title="Scan Warehouse Product Barcode"
      />

      {/* Customer Picker Modal */}
      <Modal
        visible={customerModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCustomerModalVisible(false)}
      >
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Customer</Text>
              <TouchableOpacity onPress={() => setCustomerModalVisible(false)}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchBox}>
              <Ionicons name="search" size={18} color="#64748B" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.modalSearchInput}
                value={customerSearch}
                onChangeText={(t) => {
                  setCustomerSearch(t);
                  fetchCustomers(t);
                }}
                placeholder="Search customer by name, code or phone..."
                placeholderTextColor="#64748B"
              />
            </View>

            {customersLoading ? (
              <ActivityIndicator style={{ marginTop: 20 }} color="#06B6D4" />
            ) : (
              <FlatList
                data={customers.filter(c => {
                  if (!customerSearch.trim()) return true;
                  const q = customerSearch.toLowerCase().trim();
                  return (c.customerName || c.name || '').toLowerCase().includes(q) ||
                    (c.code || '').toLowerCase().includes(q) ||
                    (c.phone || '').toLowerCase().includes(q);
                })}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.customerItemRow}
                    onPress={() => {
                      haptic.selection();
                      const cBal = (item.currentBalance !== undefined && item.currentBalance !== null)
                        ? Number(item.currentBalance)
                        : ((item.openingBalance !== undefined && item.openingBalance !== null) ? Number(item.openingBalance) : (Number(item.balance) || 0));
                      setSelectedCustomer({
                        ...item,
                        balance: cBal,
                        currentBalance: cBal
                      });
                      setCustomerModalVisible(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.customerItemName}>{item.customerName || item.name}</Text>
                      <Text style={styles.customerItemSub}>
                        Code: {item.code || '-'} • Phone: {item.phone || '-'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.customerItemBalance}>
                        Rs. {formatPKR(item.currentBalance ?? item.balance ?? item.openingBalance ?? 0)}
                      </Text>
                      <Text style={styles.customerItemBalanceSub}>Ledger Balance</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* Manual Item Picker Modal */}
      <Modal
        visible={itemPickerVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setItemPickerVisible(false)}
      >
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Search Inventory Products</Text>
              <TouchableOpacity onPress={() => setItemPickerVisible(false)}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchBox}>
              <Ionicons name="search" size={18} color="#64748B" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.modalSearchInput}
                value={itemSearch}
                onChangeText={(t) => {
                  setItemSearch(t);
                  fetchItems(t, selectedItemCategory);
                }}
                placeholder="Search by product name, barcode or SKU..."
                placeholderTextColor="#64748B"
                autoFocus={true}
              />
            </View>

            {/* Category Filter Pills inside Modal */}
            <View style={{ marginBottom: 10 }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
              >
                <TouchableOpacity
                  style={[
                    styles.categoryFilterChip,
                    !selectedItemCategory && styles.categoryFilterChipActive
                  ]}
                  onPress={() => {
                    haptic.selection();
                    setSelectedItemCategory(null);
                    fetchItems(itemSearch, null);
                  }}
                >
                  <Text style={[
                    styles.categoryFilterChipText,
                    !selectedItemCategory && styles.categoryFilterChipTextActive
                  ]}>
                    All Categories
                  </Text>
                </TouchableOpacity>

                {itemCategories.map(cat => {
                  const isSelected = selectedItemCategory === cat._id;
                  return (
                    <TouchableOpacity
                      key={cat._id}
                      style={[
                        styles.categoryFilterChip,
                        isSelected && styles.categoryFilterChipActive
                      ]}
                      onPress={() => {
                        haptic.selection();
                        const nextCat = isSelected ? null : cat._id;
                        setSelectedItemCategory(nextCat);
                        fetchItems(itemSearch, nextCat);
                      }}
                    >
                      <Text style={[
                        styles.categoryFilterChipText,
                        isSelected && styles.categoryFilterChipTextActive
                      ]}>
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {itemsLoading ? (
              <ActivityIndicator style={{ marginTop: 20 }} color="#06B6D4" />
            ) : (
              <FlatList
                data={availableItems}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => {
                  const availableQty = (item.stock && item.stock.length > 0) ? item.stock[0].quantity : (item.quantity || 0);
                  const incentive = item.incentive || 0;
                  return (
                    <TouchableOpacity
                      style={styles.itemPickerRow}
                      onPress={() => openQtyModalForItem(item)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemPickerName}>{item.name}</Text>
                        <Text style={styles.itemPickerSub}>
                          Barcode: {item.barcode || item.itemsCode || 'N/A'} • Stock: {availableQty}
                        </Text>
                        {incentive > 0 && (
                          <Text style={styles.itemPickerIncentiveBadge}>
                            🎁 Incentive: Rs. {formatPKR(incentive)}/pack
                          </Text>
                        )}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.itemPickerPrice}>
                          Rs. {formatPKR(item.costPrice || item.salePrice || item.retailPrice || 0)}
                        </Text>
                        <Text style={styles.itemPickerTap}>+ Add to Cart</Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* Quantity & Rate Dialog Modal with Dynamic Discount-by-Quantity */}
      <Modal
        visible={qtyModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setQtyModalVisible(false)}
      >
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogBox}>
            <View style={styles.dialogHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dialogTitle} numberOfLines={2}>
                  {selectedItemToAdd?.name}
                </Text>
                <Text style={styles.dialogBarcode}>
                  Barcode: {selectedItemToAdd?.barcode || selectedItemToAdd?.itemsCode || 'N/A'}
                </Text>
              </View>
              {selectedItemToAdd && (
                <View style={styles.dialogStockBadge}>
                  <Text style={styles.dialogStockText}>
                    Stock: {(selectedItemToAdd.stock && selectedItemToAdd.stock.length > 0) ? selectedItemToAdd.stock[0].quantity : 0}
                  </Text>
                </View>
              )}
            </View>

            {/* Quick Increment Chips */}
            <View style={styles.quickChipsRow}>
              <Text style={styles.quickChipsLabel}>QUICK QTY:</Text>
              {[1, 5, 10, 25, 50, 100].map(inc => (
                <TouchableOpacity
                  key={`inc-${inc}`}
                  style={styles.quickChipBtn}
                  onPress={() => handleModalQtyChip(inc)}
                >
                  <Text style={styles.quickChipText}>+{inc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Quantity Stepper & Direct Input */}
            <View style={styles.dialogInputRow}>
              <View style={{ flex: 1.2, marginRight: 8 }}>
                <Text style={styles.inputLabel}>PACK QUANTITY</Text>
                <View style={styles.dialogStepperBox}>
                  <TouchableOpacity
                    style={styles.dialogStepperBtn}
                    onPress={() => handleModalQtyChip(-1)}
                  >
                    <Text style={styles.dialogStepperBtnText}>-</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.dialogStepperInput}
                    keyboardType="numeric"
                    value={modalQty}
                    onChangeText={handleModalQtyChange}
                    autoFocus={true}
                  />
                  <TouchableOpacity
                    style={styles.dialogStepperBtn}
                    onPress={() => handleModalQtyChip(1)}
                  >
                    <Text style={styles.dialogStepperBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.inputLabel}>RATE (PKR)</Text>
                <TextInput
                  style={styles.dialogInput}
                  keyboardType="numeric"
                  value={modalRate}
                  onChangeText={(r) => {
                    setModalRate(r);
                    const q = parseFloat(modalQty) || 0;
                    const rate = parseFloat(r) || 0;
                    const inc = parseFloat(modalIncentive) || 0;
                    const sub = q * rate;
                    const discRs = inc * q;
                    const discPct = sub > 0 ? ((discRs / sub) * 100).toFixed(2) : '0';
                    setModalDiscAmount(String(discRs));
                    setModalDiscPercent(discPct);
                  }}
                />
              </View>
            </View>

            {/* Dynamic Discount by Quantity Display */}
            <View style={styles.dialogDiscCalcCard}>
              <View style={styles.dialogDiscCalcRow}>
                <Text style={styles.dialogDiscCalcLabel}>Per-Pack Incentive:</Text>
                <Text style={styles.dialogDiscCalcVal}>Rs. {formatPKR(modalIncentive)}</Text>
              </View>
              <View style={styles.dialogDiscCalcRow}>
                <Text style={styles.dialogDiscCalcLabel}>Dynamic Discount ({modalQty} packs):</Text>
                <Text style={[styles.dialogDiscCalcVal, { color: '#EF4444', fontWeight: '800' }]}>
                  - Rs. {formatPKR(modalDiscAmount)} ({parseFloat(modalDiscPercent).toFixed(1)}%)
                </Text>
              </View>
              <View style={styles.dialogDiscDivider} />
              <View style={styles.dialogDiscCalcRow}>
                <Text style={styles.dialogNetTotalLabel}>LINE NET PAYABLE:</Text>
                <Text style={styles.dialogNetTotalVal}>
                  PKR {formatPKR(Math.max(0, (parseFloat(modalQty) || 0) * (parseFloat(modalRate) || 0) - (parseFloat(modalDiscAmount) || 0)))}
                </Text>
              </View>
            </View>

            <View style={styles.dialogButtonsRow}>
              <TouchableOpacity
                style={styles.dialogCancelBtn}
                onPress={() => setQtyModalVisible(false)}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dialogAddBtn}
                onPress={handleAddItemToCart}
              >
                <Ionicons name="cart" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.dialogAddText}>Add to Invoice</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* WEB-PARITY IN-APP INVOICE VIEW MODAL (1-to-1 match with wh-print.html) */}
      <Modal
        visible={invoiceViewVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setInvoiceViewVisible(false)}
      >
        <SafeAreaView style={styles.webInvoiceSafeArea}>
          <StatusBar barStyle="light-content" backgroundColor="#1E293B" translucent={false} />
          {/* Top Control Bar with Android notch clearance */}
          <View style={styles.webInvoiceControlBar}>
            <TouchableOpacity
              style={styles.webInvoiceCloseBtn}
              onPress={() => setInvoiceViewVisible(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={24} color="#F8FAFC" />
            </TouchableOpacity>

            <View style={{ flex: 1, paddingHorizontal: 10 }}>
              <Text style={styles.webInvoiceBarTitle}>COMMERCIAL SALE INVOICE</Text>
              <Text style={styles.webInvoiceBarSub}>
                #{invoiceToView?.invoiceNo || 'INV'} • Official Web Slip Parity
              </Text>
            </View>

            <TouchableOpacity
              style={styles.webInvoiceActionBtn}
              onPress={() => invoiceToView && printWHSaleInvoice(invoiceToView, false)}
            >
              <Ionicons name="print-outline" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.webInvoiceActionBtnText}>Print</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.webInvoiceActionBtn, styles.webInvoiceWhatsAppBtn]}
              onPress={() => invoiceToView && printWHSaleInvoice(invoiceToView, true)}
            >
              <Ionicons name="logo-whatsapp" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.webInvoiceActionBtnText}>WhatsApp</Text>
            </TouchableOpacity>
          </View>

          {invoiceViewLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#06B6D4" />
              <Text style={styles.loadingText}>Rendering invoice document...</Text>
            </View>
          ) : (
            <ScrollView style={styles.webInvoiceScroll} contentContainerStyle={styles.webInvoiceScrollContent}>
              {/* Paper Canvas replicating wh-print.html */}
              <View style={styles.webInvoicePaper}>
                {/* Header matching web printout */}
                <View style={styles.slipHeader}>
                  <View style={{ width: 110, justifyContent: 'center' }}>
                    <Image
                      source={{ uri: DWATSON_LOGO_BASE64 }}
                      style={styles.companyLogoImg}
                      resizeMode="contain"
                    />
                  </View>

                  <View style={styles.slipDocNoBox}>
                    <Text style={styles.slipDocNoText}>
                      {invoiceToView?.invoiceNo ? (
                        invoiceToView.invoiceNo.startsWith('INV-WS-')
                          ? `INV-${invoiceToView.invoiceNo.split('-').pop()}`
                          : invoiceToView.invoiceNo
                      ) : 'INV-001'}
                    </Text>
                  </View>

                  <View style={styles.slipDocTitleBox}>
                    <Text style={styles.slipDocTitle}>SALE{'\n'}INVOICE</Text>
                    <Text style={styles.slipDocDate}>
                      DATE: {invoiceToView?.invoiceDate ? new Date(invoiceToView.invoiceDate).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB')}
                    </Text>
                  </View>
                </View>

                {/* Details Grid: Two Cards */}
                <View style={styles.slipDetailsGrid}>
                  <View style={styles.slipInfoCard}>
                    <Text style={styles.slipInfoLabel}>FROM: COMPANY DETAILS</Text>
                    <Text style={styles.slipInfoVal}>D.Watson</Text>
                    <Text style={styles.slipInfoDesc}>
                      -{'\n'}
                      Phone: 051-8438111 | Email:{'\n'}
                      dwatsongroupofit@gmail.com{'\n'}
                      STRN: - | NTN: -
                    </Text>
                  </View>

                  <View style={styles.slipInfoCard}>
                    <Text style={styles.slipInfoLabel}>TO: CUSTOMER</Text>
                    <Text style={styles.slipInfoVal}>
                      {invoiceToView?.customer?.customerName || invoiceToView?.customer?.name || invoiceToView?.customerName || 'Walk-in Customer'}
                    </Text>
                    <Text style={styles.slipInfoDesc}>
                      {invoiceToView?.customer?.address || 'Rawalpindi / Islamabad'}{'\n'}
                      Phone: {invoiceToView?.customer?.phone || invoiceToView?.customer?.mobile || '-'}{'\n'}
                      STRN: {invoiceToView?.customer?.strn || '-'} | NTN: {invoiceToView?.customer?.customerNTN || invoiceToView?.customer?.ntn || '-'}
                    </Text>
                  </View>
                </View>

                {/* Main Table replicating wh-print.html with horizontal scroll protection */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={true}
                  style={{ marginVertical: 6 }}
                >
                  <View style={[styles.slipTable, { width: 630 }]}>
                    {/* Table Header Row (Cost column) with vertical borders */}
                    <View style={styles.slipTableHeaderRow}>
                      <View style={[styles.slipThCell, { width: 28, alignItems: 'center' }]}>
                        <Text style={styles.slipTh}>#</Text>
                      </View>
                      <View style={[styles.slipThCell, { width: 80, alignItems: 'center' }]}>
                        <Text style={styles.slipTh}>Code</Text>
                      </View>
                      <View style={[styles.slipThCell, { width: 190, alignItems: 'flex-start', paddingLeft: 4 }]}>
                        <Text style={styles.slipTh}>Item Description</Text>
                      </View>
                      <View style={[styles.slipThCell, { width: 36, alignItems: 'center' }]}>
                        <Text style={styles.slipTh}>Qty</Text>
                      </View>
                      <View style={[styles.slipThCell, { width: 48, alignItems: 'flex-end', paddingRight: 4 }]}>
                        <Text style={styles.slipTh}>Cost</Text>
                      </View>
                      <View style={[styles.slipThCell, { width: 48, alignItems: 'flex-end', paddingRight: 4 }]}>
                        <Text style={styles.slipTh}>Retail</Text>
                      </View>
                      <View style={[styles.slipThCell, { width: 36, alignItems: 'center' }]}>
                        <Text style={styles.slipTh}>Inc</Text>
                      </View>
                      <View style={[styles.slipThCell, { width: 44, alignItems: 'center' }]}>
                        <Text style={styles.slipTh}>Disc%</Text>
                      </View>
                      <View style={[styles.slipThCell, { width: 50, alignItems: 'flex-end', paddingRight: 4 }]}>
                        <Text style={styles.slipTh}>DiscRs</Text>
                      </View>
                      <View style={[styles.slipThCell, { width: 70, alignItems: 'flex-end', paddingRight: 4, borderRightWidth: 0 }]}>
                        <Text style={styles.slipTh}>Total</Text>
                      </View>
                    </View>

                    {/* Class-wise Grouped Items & Subtotals */}
                    {(() => {
                      const groups = getSaleClassGroups(invoiceToView);
                      const classNames = Object.keys(groups);
                      let gIdx = 1;

                      if (classNames.length === 0) {
                        return (
                          <View style={{ padding: 12, alignItems: 'center' }}>
                            <Text style={{ fontSize: 10, color: '#64748B' }}>No items in invoice</Text>
                          </View>
                        );
                      }

                      return classNames.map((cName) => {
                        const classLines = groups[cName] || [];
                        let classSubTotal = 0;

                        return (
                          <View key={`grp-${cName}`}>
                            {/* Class Header Row */}
                            <View style={styles.slipClassHeaderRow}>
                              <Text style={styles.slipClassHeaderText}>Class: {cName}</Text>
                            </View>

                            {/* Items in Class with vertical borders */}
                            {classLines.map((line, idx) => {
                              const it = line.item || {};
                              const itName = line.name || line.itemName || it.name || it.itemName || 'Product';
                              const barcode = line.barcode || it.barcode || it.itemsCode || '-';
                              const qty = parseFloat(line.quantity || 0);
                              const cost = parseFloat(line.pcsPrice || line.rate || 0);
                              const retail = parseFloat(line.retailPrice || it.retailPrice || 0);
                              const inc = parseFloat(line.incentive || it.incentive || 0);
                              const discRs = parseFloat(line.discountAmount || line.disRs || (inc * qty) || 0);
                              let discPct = parseFloat(line.discountPercent || line.disP || 0);
                              if (!discPct && discRs > 0 && (qty * cost) > 0) {
                                discPct = (discRs / (qty * cost)) * 100;
                              }
                              const net = parseFloat(line.netTotal || line.total || (qty * cost - discRs) || 0);
                              classSubTotal += net;

                              return (
                                <View key={`slip-it-${cName}-${idx}`} style={styles.slipTableRow}>
                                  <View style={[styles.slipTdCell, { width: 28, alignItems: 'center' }]}>
                                    <Text style={styles.slipTd}>{gIdx++}</Text>
                                  </View>
                                  <View style={[styles.slipTdCell, { width: 80, alignItems: 'center' }]}>
                                    <Text style={[styles.slipTd, { fontSize: 8 }]}>{barcode}</Text>
                                  </View>
                                  <View style={[styles.slipTdCell, { width: 190, alignItems: 'flex-start', paddingHorizontal: 4 }]}>
                                    <Text style={styles.slipItemName} numberOfLines={2}>{itName}</Text>
                                    {line.pack ? <Text style={styles.slipItemPack}>{line.pack}</Text> : null}
                                  </View>
                                  <View style={[styles.slipTdCell, { width: 36, alignItems: 'center' }]}>
                                    <Text style={[styles.slipTd, { fontWeight: '700' }]}>{qty}</Text>
                                  </View>
                                  <View style={[styles.slipTdCell, { width: 48, alignItems: 'flex-end', paddingRight: 4 }]}>
                                    <Text style={styles.slipTd}>{formatPKR(cost)}</Text>
                                  </View>
                                  <View style={[styles.slipTdCell, { width: 48, alignItems: 'flex-end', paddingRight: 4 }]}>
                                    <Text style={styles.slipTd}>{formatPKR(retail)}</Text>
                                  </View>
                                  <View style={[styles.slipTdCell, { width: 36, alignItems: 'center' }]}>
                                    <Text style={styles.slipTd}>{formatPKR(inc)}</Text>
                                  </View>
                                  <View style={[styles.slipTdCell, { width: 44, alignItems: 'center' }]}>
                                    <Text style={styles.slipTd}>{discPct > 0 ? `${parseFloat(discPct.toFixed(2))}%` : '0%'}</Text>
                                  </View>
                                  <View style={[styles.slipTdCell, { width: 50, alignItems: 'flex-end', paddingRight: 4 }]}>
                                    <Text style={[styles.slipTd, { color: '#B91C1C' }]}>{formatPKR(discRs)}</Text>
                                  </View>
                                  <View style={[styles.slipTdCell, { width: 70, alignItems: 'flex-end', paddingRight: 4, borderRightWidth: 0 }]}>
                                    <Text style={[styles.slipTd, { fontWeight: '800' }]}>{formatPKR(net)}</Text>
                                  </View>
                                </View>
                              );
                            })}

                            {/* Sub Total Row per Class (Silver background #C0C0C0 matching web ERP print) */}
                            <View style={styles.slipClassSubtotalRow}>
                              <View style={[styles.slipSubtotalLabelCell, { width: 560 }]}>
                                <Text style={styles.slipClassSubtotalLabel}>
                                  Sub Total ({cName}):
                                </Text>
                              </View>
                              <View style={[styles.slipSubtotalValCell, { width: 70 }]}>
                                <Text style={styles.slipClassSubtotalVal}>
                                  {formatPKR(classSubTotal)}
                                </Text>
                              </View>
                            </View>
                          </View>
                        );
                      });
                    })()}
                  </View>
                </ScrollView>

                {/* Totals & Remarks Section */}
                <View style={styles.slipTotalsGrid}>
                  <View style={{ flex: 1 }}>
                    {/* Rounded Total Qty Box */}
                    <View style={styles.slipQtyBox}>
                      <Text style={styles.slipQtyText}>
                        TOTAL QTY: <Text style={{ fontWeight: '900', fontSize: 13 }}>{invoiceToView?.totalQuantity || invoiceToView?.items?.reduce((s, i) => s + (i.quantity || 0), 0) || 0}</Text>
                      </Text>
                    </View>

                    {/* Remarks / Terms Box */}
                    <View style={styles.slipRemarksBox}>
                      <Text style={styles.slipRemarksTitle}>REMARKS / TERMS</Text>
                      <Text style={styles.slipRemarksText}>
                        {invoiceToView?.remarks ? invoiceToView.remarks : 'No remarks provided.'}
                      </Text>
                    </View>
                  </View>

                  {/* Right Totals Table */}
                  <View style={styles.slipTotalsTable}>
                    <View style={styles.slipTotalsRow}>
                      <Text style={styles.slipTotalsLabel}>Gross Amount</Text>
                      <Text style={styles.slipTotalsVal}>{formatPKR(invoiceToView?.totalAmount || invoiceToView?.netTotal || 0)}</Text>
                    </View>
                    <View style={styles.slipTotalsRow}>
                      <Text style={styles.slipTotalsLabel}>Discount (-)</Text>
                      <Text style={styles.slipTotalsVal}>
                        {formatPKR((invoiceToView?.items?.reduce((s, i) => s + (i.discountAmount || 0), 0) || 0) + (invoiceToView?.globalDiscountAmount || 0))}
                      </Text>
                    </View>
                    <View style={styles.slipTotalsRow}>
                      <Text style={styles.slipTotalsLabel}>Net Amount</Text>
                      <Text style={styles.slipTotalsVal}>{formatPKR(invoiceToView?.netTotal || 0)}</Text>
                    </View>
                    <View style={styles.slipTotalsRow}>
                      <Text style={styles.slipTotalsLabel}>Tax Total</Text>
                      <Text style={styles.slipTotalsVal}>0</Text>
                    </View>
                    <View style={styles.slipTotalsRow}>
                      <Text style={styles.slipTotalsLabel}>Misc Charges</Text>
                      <Text style={styles.slipTotalsVal}>0</Text>
                    </View>
                    <View style={styles.slipGrandTotalBox}>
                      <Text style={styles.slipGrandTotalLabel}>Grand Total</Text>
                      <Text style={styles.slipGrandTotalVal}>{formatPKR(invoiceToView?.netTotal || 0)}</Text>
                    </View>
                  </View>
                </View>

                {/* Footer Signatures */}
                <View style={styles.slipSignaturesRow}>
                  <View style={styles.slipSigBox}>
                    <Text style={styles.slipSigText}>Receiver Signature</Text>
                  </View>
                  <View style={styles.slipSigBox}>
                    <Text style={styles.slipSigText}>Verified By</Text>
                  </View>
                  <View style={styles.slipSigBox}>
                    <Text style={styles.slipSigText}>Authorized Signature</Text>
                  </View>
                </View>

                <View style={styles.slipFooterTimestamp}>
                  <Text style={styles.slipFooterText}>
                    Printed on: {new Date().toLocaleString('en-GB')} | System Generated Document
                  </Text>
                </View>
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B1120',
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 8 : 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#0E172A',
  },
  backButton: {
    padding: 8,
    marginRight: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
  },
  headerTitleBox: {
    flex: 1,
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
  },
  headerSub: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 1,
  },
  statusPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  statusPillText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  segmentedTabBar: {
    flexDirection: 'row',
    backgroundColor: '#0E172A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#131D33',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  segmentBtnActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: '#06B6D4',
  },
  segmentBtnText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  segmentBtnTextActive: {
    color: '#38BDF8',
    fontWeight: '800',
  },
  formScroll: {
    flex: 1,
  },
  formScrollContent: {
    padding: 14,
  },
  card: {
    backgroundColor: '#131D33',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardAccentCyan: {
    borderTopWidth: 3,
    borderTopColor: '#06B6D4',
  },
  cardAccentBlue: {
    borderTopWidth: 3,
    borderTopColor: '#38BDF8',
  },
  cardAccentViolet: {
    borderTopWidth: 3,
    borderTopColor: '#8B5CF6',
  },
  cardAccentEmerald: {
    borderTopWidth: 3,
    borderTopColor: '#10B981',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionHeaderTitle: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sectionHeaderHint: {
    color: '#64748B',
    fontSize: 10.5,
    fontWeight: '600',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  refreshBtnText: {
    color: '#06B6D4',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  formRow: {
    flexDirection: 'row',
  },
  formCol: {},
  inputLabel: {
    color: '#64748B',
    fontSize: 10.5,
    fontWeight: '700',
    marginBottom: 5,
    letterSpacing: 0.3,
  },
  badgeInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
  },
  badgeInputText: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  dateText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  customerSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  customerSelectorText: {
    flex: 1,
    color: '#64748B',
    fontSize: 13,
  },
  customerMetaCard: {
    flexDirection: 'row',
    backgroundColor: '#0B1120',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  customerMetaCol: {
    flex: 1,
  },
  customerMetaLabel: {
    color: '#64748B',
    fontSize: 9.5,
    fontWeight: '700',
  },
  customerMetaVal: {
    color: '#F8FAFC',
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 1,
  },
  customerBalanceHighlight: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 1,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modePill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  modePillActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: '#06B6D4',
  },
  modePillText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  modePillTextActive: {
    color: '#06B6D4',
    fontWeight: '800',
  },
  entryButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  scanBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284C7',
    paddingVertical: 13,
    borderRadius: 12,
    shadowColor: '#0284C7',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  scanBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.4,
  },
  manualBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#131D33',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    paddingVertical: 13,
    borderRadius: 12,
  },
  manualBtnText: {
    color: '#06B6D4',
    fontWeight: '700',
    fontSize: 12.5,
  },
  clearCartText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyCartBox: {
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderStyle: 'dashed',
    padding: 24,
    alignItems: 'center',
  },
  emptyCartTitle: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  emptyCartSub: {
    color: '#475569',
    fontSize: 11.5,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  cartItemCard: {
    backgroundColor: '#0B1120',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cartItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemIndexBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  itemIndexText: {
    color: '#C4B5FD',
    fontSize: 10,
    fontWeight: '800',
  },
  cartItemName: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  cartItemBarcode: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 3,
  },
  trashBtn: {
    padding: 4,
  },
  incentivePillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
  },
  incentiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  incentiveBadgeText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  dynamicDiscText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '700',
  },
  cartItemBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131D33',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  qtyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  qtyBtnText: {
    color: '#06B6D4',
    fontSize: 16,
    fontWeight: '800',
  },
  qtyValBox: {
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  qtyVal: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '800',
  },
  qtyPackSub: {
    color: '#64748B',
    fontSize: 9,
    marginTop: -2,
  },
  cartItemNetLabel: {
    color: '#64748B',
    fontSize: 9.5,
    fontWeight: '700',
  },
  cartItemTotal: {
    color: '#10B981',
    fontSize: 13.5,
    fontWeight: '800',
  },
  summaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  summaryLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  summaryVal: {
    color: '#F8FAFC',
    fontSize: 12.5,
    fontWeight: '700',
  },
  discountInput: {
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: 90,
    textAlign: 'right',
  },
  paidInput: {
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: 90,
    textAlign: 'right',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 8,
  },
  netTotalBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0B1120',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  netTotalLabel: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '800',
  },
  netTotalVal: {
    color: '#06B6D4',
    fontSize: 17,
    fontWeight: '900',
  },
  balanceLabel: {
    color: '#94A3B8',
    fontSize: 11.5,
  },
  balanceVal: {
    color: '#F59E0B',
    fontSize: 12.5,
    fontWeight: '800',
  },
  customerBalanceImpactCard: {
    backgroundColor: '#0B1120',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  customerBalanceImpactTitle: {
    color: '#64748B',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  customerBalanceImpactDesc: {
    color: '#94A3B8',
    fontSize: 11.5,
    lineHeight: 18,
  },
  remarksInput: {
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    color: '#F8FAFC',
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  editingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  editingBannerTitle: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  editingBannerSub: {
    color: '#CBD5E1',
    fontSize: 10.5,
    marginTop: 2,
    lineHeight: 14,
  },
  cancelEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  cancelEditBtnText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0B1120',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'android' ? 24 : 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 4,
  },
  submitBtnUpdate: {
    backgroundColor: '#F59E0B',
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  historyContainer: {
    flex: 1,
  },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131D33',
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  searchBarInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 12.5,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 8,
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
  },
  emptySub: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  historyCard: {
    backgroundColor: '#131D33',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  historyInvNo: {
    color: '#06B6D4',
    fontSize: 13.5,
    fontWeight: '800',
  },
  historyCustomer: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  statusBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    color: '#10B981',
    fontSize: 10.5,
    fontWeight: '700',
  },
  historyMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  historyDate: {
    color: '#64748B',
    fontSize: 11,
  },
  historyMode: {
    color: '#94A3B8',
    fontSize: 11,
  },
  historyTotalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  historyItemCount: {
    color: '#64748B',
    fontSize: 11.5,
  },
  historyAmount: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
  },
  historyDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginVertical: 10,
  },
  historyActionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B1120',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  actionBtnView: {
    borderColor: 'rgba(56, 189, 248, 0.4)',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  actionBtnEdit: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
  },
  actionBtnWhatsApp: {
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  actionBtnText: {
    color: '#06B6D4',
    fontSize: 11.5,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#0E172A',
    marginTop: 60,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
  },
  modalSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131D33',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 10,
  },
  modalSearchInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 13,
  },
  customerItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  customerItemName: {
    color: '#F8FAFC',
    fontSize: 13.5,
    fontWeight: '700',
  },
  customerItemSub: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  customerItemBalance: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '800',
  },
  customerItemBalanceSub: {
    color: '#64748B',
    fontSize: 9.5,
    marginTop: 1,
  },
  itemPickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  itemPickerName: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  itemPickerSub: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  itemPickerIncentiveBadge: {
    color: '#10B981',
    fontSize: 10.5,
    fontWeight: '700',
    marginTop: 2,
  },
  itemPickerPrice: {
    color: '#06B6D4',
    fontSize: 13,
    fontWeight: '800',
  },
  itemPickerTap: {
    color: '#10B981',
    fontSize: 10.5,
    fontWeight: '700',
    marginTop: 2,
  },
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialogBox: {
    width: '100%',
    backgroundColor: '#131D33',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  dialogHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  dialogTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  dialogBarcode: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  dialogStockBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dialogStockText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  quickChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  quickChipsLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    marginRight: 4,
  },
  quickChipBtn: {
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  quickChipText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  dialogInputRow: {
    flexDirection: 'row',
  },
  dialogStepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  dialogStepperBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  dialogStepperBtnText: {
    color: '#06B6D4',
    fontSize: 18,
    fontWeight: '800',
  },
  dialogStepperInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: 6,
  },
  dialogInput: {
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dialogDiscCalcCard: {
    backgroundColor: '#0B1120',
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  dialogDiscCalcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  dialogDiscCalcLabel: {
    color: '#94A3B8',
    fontSize: 11,
  },
  dialogDiscCalcVal: {
    color: '#F8FAFC',
    fontSize: 11.5,
    fontWeight: '600',
  },
  dialogDiscDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 6,
  },
  dialogNetTotalLabel: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
  },
  dialogNetTotalVal: {
    color: '#06B6D4',
    fontSize: 14,
    fontWeight: '900',
  },
  dialogButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  dialogCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  dialogCancelText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  dialogAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#06B6D4',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  dialogAddText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  /* In-App Web-Parity Invoice Viewer Styles */
  webInvoiceSafeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  webInvoiceControlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 14 : 14,
    paddingBottom: 14,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  webInvoiceCloseBtn: {
    padding: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
  },
  webInvoiceBarTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  webInvoiceBarSub: {
    color: '#38BDF8',
    fontSize: 11,
    marginTop: 1,
  },
  webInvoiceActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284C7',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    marginLeft: 6,
  },
  webInvoiceWhatsAppBtn: {
    backgroundColor: '#10B981',
  },
  webInvoiceActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  webInvoiceScroll: {
    flex: 1,
    backgroundColor: '#334155',
  },
  webInvoiceScrollContent: {
    padding: 12,
    paddingBottom: 40,
  },
  webInvoicePaper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  slipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    paddingBottom: 8,
    marginBottom: 8,
  },
  companyLogoImg: {
    height: 52,
    width: 105,
  },
  slipBrand: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  slipSubBrand: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#475569',
    marginTop: 2,
  },
  slipDocNoBox: {
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    paddingHorizontal: 10,
    paddingVertical: 2,
    alignSelf: 'center',
  },
  slipDocNoText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#000',
    textAlign: 'center',
  },
  slipDocTitleBox: {
    flex: 1,
    alignItems: 'flex-end',
  },
  slipDocTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  slipDocDate: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#000',
    marginTop: 2,
  },
  slipDocMode: {
    fontSize: 9,
    fontWeight: '700',
    color: '#475569',
    marginTop: 1,
  },
  slipDetailsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  slipInfoCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 4,
    padding: 6,
  },
  slipInfoLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#000',
    marginBottom: 2,
  },
  slipInfoVal: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#000',
    marginBottom: 2,
  },
  slipInfoDesc: {
    fontSize: 9,
    lineHeight: 12,
    color: '#1E293B',
  },
  slipTable: {
    borderWidth: 1,
    borderColor: '#000',
    marginBottom: 10,
    width: 630,
    backgroundColor: '#FFFFFF',
  },
  slipTableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#2C2C2C',
    minHeight: 28,
    width: 630,
  },
  slipThCell: {
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.35)',
    paddingVertical: 5,
    paddingHorizontal: 2,
  },
  slipTh: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  slipTableRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: 1,
    borderTopColor: '#000',
    minHeight: 26,
    width: 630,
    backgroundColor: '#FFFFFF',
  },
  slipTdCell: {
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#000',
    paddingVertical: 3,
    paddingHorizontal: 2,
  },
  categoryFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  categoryFilterChipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  categoryFilterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  categoryFilterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  slipClassHeaderRow: {
    paddingVertical: 3,
    paddingHorizontal: 6,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    width: 630,
  },
  slipClassHeaderText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#1A237E',
  },
  slipItemPack: {
    fontSize: 7.5,
    color: '#64748B',
  },
  slipClassSubtotalRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#C0C0C0',
    borderTopWidth: 1,
    borderTopColor: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    width: 630,
  },
  slipSubtotalLabelCell: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 8,
    paddingVertical: 4,
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  slipSubtotalValCell: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 4,
    paddingVertical: 4,
  },
  slipClassSubtotalLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#000000',
  },
  slipClassSubtotalVal: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#000000',
  },
  slipTd: {
    color: '#000',
    fontSize: 9.5,
  },
  slipItemName: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#000',
  },
  slipItemBarcode: {
    fontSize: 8,
    color: '#64748B',
  },
  slipTotalsGrid: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  slipQtyBox: {
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  slipQtyText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#000',
  },
  slipRemarksBox: {
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 4,
    padding: 6,
  },
  slipRemarksTitle: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#000',
    marginBottom: 2,
  },
  slipRemarksText: {
    fontSize: 8.5,
    color: '#1E293B',
    lineHeight: 12,
  },
  slipTotalsTable: {
    width: 175,
    borderWidth: 1,
    borderColor: '#000',
  },
  slipTotalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  slipTotalsLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#000',
  },
  slipTotalsVal: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#000',
  },
  slipGrandTotalBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#000',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  slipGrandTotalLabel: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  slipGrandTotalVal: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  slipSignaturesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    gap: 16,
  },
  slipSigBox: {
    flex: 1,
    borderTopWidth: 1.5,
    borderTopColor: '#000',
    paddingTop: 4,
    alignItems: 'center',
  },
  slipSigText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
  },
  slipFooterTimestamp: {
    marginTop: 18,
    alignItems: 'center',
  },
  slipFooterText: {
    fontSize: 8,
    color: '#64748B',
  },
});
