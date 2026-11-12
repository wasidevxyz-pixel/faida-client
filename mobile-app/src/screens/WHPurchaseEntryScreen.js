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
  KeyboardAvoidingView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { colors } from '../theme/colors';
import { haptic } from '../services/haptics';
import CameraBarcodeScannerModal from '../components/common/CameraBarcodeScannerModal';
import { printWHPurchaseInvoice } from '../services/printService';

const formatPKR = (val) => {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(val || 0);
};

export default function WHPurchaseEntryScreen({ onBack, navigation }) {
  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'history'

  // Header form states
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState('');

  // Supplier states
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [supplierModalVisible, setSupplierModalVisible] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [suppliersLoading, setSuppliersLoading] = useState(false);

  // Line items states
  const [cartItems, setCartItems] = useState([]);
  const [extraDiscount, setExtraDiscount] = useState('0');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Scanner & Item lookup states
  const [scannerVisible, setScannerVisible] = useState(false);
  const [itemPickerVisible, setItemPickerVisible] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [availableItems, setAvailableItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  // Quantity dialog modal
  const [selectedItemToAdd, setSelectedItemToAdd] = useState(null);
  const [modalQty, setModalQty] = useState('1');
  const [modalCost, setModalCost] = useState('0');
  const [qtyModalVisible, setQtyModalVisible] = useState(false);

  // Previous purchases states
  const [previousPurchases, setPreviousPurchases] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    fetchNextBillNo();
    fetchSuppliers();
    fetchPreviousPurchases();
  };

  const fetchNextBillNo = async () => {
    try {
      const res = await api.getNextWHPurchaseNumber();
      const nextNum = res?.data || res?.nextInvoiceNo;
      if (res && res.success && nextNum) {
        setInvoiceNo(nextNum);
      } else {
        setInvoiceNo(`PUR-${Date.now().toString().slice(-6)}`);
      }
    } catch {
      setInvoiceNo(`PUR-${Date.now().toString().slice(-6)}`);
    }
  };

  const fetchSuppliers = async (search = '') => {
    setSuppliersLoading(true);
    try {
      const res = await api.getWHSuppliers(search);
      if (res && res.success) {
        const list = (res.data || []).map(s => {
          const sName = s.supplierName || s.name || 'Unnamed Supplier';
          return {
            ...s,
            supplierName: sName,
            name: sName
          };
        });
        setSuppliers(list);
      }
    } catch (err) {
      console.warn('Error fetching suppliers:', err.message);
    } finally {
      setSuppliersLoading(false);
    }
  };

  const fetchItems = async (search = '') => {
    setItemsLoading(true);
    try {
      const res = await api.getWHItems(search);
      if (res && res.success) {
        setAvailableItems(res.data || []);
      }
    } catch (err) {
      console.warn('Error fetching items:', err.message);
    } finally {
      setItemsLoading(false);
    }
  };

  const fetchPreviousPurchases = async () => {
    setHistoryLoading(true);
    try {
      const res = await api.getWHPurchases({ limit: 50 });
      if (res && res.success) {
        setPreviousPurchases(res.data || []);
      }
    } catch (err) {
      console.warn('Error fetching previous purchases:', err.message);
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
    fetchItems(initialQuery);
    setItemPickerVisible(true);
  };

  const openQtyModalForItem = (item) => {
    setSelectedItemToAdd(item);
    setModalQty('1');
    const defaultCost = item.costPrice || item.purchasePrice || item.tradePrice || 0;
    setModalCost(String(defaultCost));
    setQtyModalVisible(true);
  };

  const handleAddItemToCart = () => {
    if (!selectedItemToAdd) return;
    const qty = parseFloat(modalQty) || 0;
    const cost = parseFloat(modalCost) || 0;

    if (qty <= 0) {
      Alert.alert('Invalid Quantity', 'Please enter a quantity greater than zero.');
      return;
    }

    const totalAmount = qty * cost;

    // Check if item already in cart
    const existingIndex = cartItems.findIndex(i => i.item === selectedItemToAdd._id);
    let updatedCart;
    if (existingIndex >= 0) {
      updatedCart = [...cartItems];
      const prev = updatedCart[existingIndex];
      const newQty = prev.quantity + qty;
      const newTotal = newQty * cost;
      updatedCart[existingIndex] = {
        ...prev,
        quantity: newQty,
        costPrice: cost,
        totalAmount: newTotal
      };
    } else {
      updatedCart = [
        ...cartItems,
        {
          item: selectedItemToAdd._id,
          name: selectedItemToAdd.name,
          barcode: selectedItemToAdd.barcode || '',
          quantity: qty,
          costPrice: cost,
          salePrice: selectedItemToAdd.salePrice || 0,
          totalAmount
        }
      ];
    }

    setCartItems(updatedCart);
    setQtyModalVisible(false);
    setItemPickerVisible(false);
    setSelectedItemToAdd(null);
    haptic.success();
  };

  const handleRemoveCartItem = (index) => {
    haptic.warning();
    const updated = cartItems.filter((_, idx) => idx !== index);
    setCartItems(updated);
  };

  const handleUpdateCartQty = (index, delta) => {
    haptic.light();
    const updated = [...cartItems];
    const cur = updated[index];
    const newQty = Math.max(1, (cur.quantity || 1) + delta);
    updated[index] = {
      ...cur,
      quantity: newQty,
      totalAmount: newQty * cur.costPrice
    };
    setCartItems(updated);
  };

  // Calculations
  const grossSubtotal = cartItems.reduce((acc, item) => acc + (item.totalAmount || 0), 0);
  const discountVal = parseFloat(extraDiscount) || 0;
  const grandTotal = Math.max(0, grossSubtotal - discountVal);

  const handleSavePurchase = async () => {
    if (!selectedSupplier) {
      Alert.alert('Supplier Required', 'Please select a vendor / supplier for this warehouse purchase.');
      return;
    }
    if (cartItems.length === 0) {
      Alert.alert('Empty Cart', 'Please add at least one item using Barcode Scanner or Manual Search.');
      return;
    }

    haptic.selection();
    setIsSubmitting(true);

    try {
      const payload = {
        invoiceNo: invoiceNo || `PUR-${Date.now().toString().slice(-6)}`,
        invoiceDate: new Date(invoiceDate),
        supplier: selectedSupplier._id,
        remarks,
        status: 'Posted',
        items: cartItems.map(i => ({
          item: i.item,
          name: i.name,
          barcode: i.barcode,
          quantity: i.quantity,
          costPrice: i.costPrice,
          salePrice: i.salePrice || 0,
          totalAmount: i.totalAmount
        })),
        totalQuantity: cartItems.reduce((acc, i) => acc + i.quantity, 0),
        subTotal: grossSubtotal,
        totalDiscount: discountVal,
        grandTotal: grandTotal
      };

      const res = await api.createWHPurchase(payload);
      if (res && res.success) {
        haptic.success();
        const savedPurchase = {
          ...(res.data || payload),
          supplier: selectedSupplier,
          supplierName: selectedSupplier?.supplierName || selectedSupplier?.name || ''
        };

        Alert.alert(
          'Purchase Receiving Posted!',
          `Inward Bill #${payload.invoiceNo} successfully recorded and stock added.\nGrand Total: PKR ${formatPKR(grandTotal)}`,
          [
            {
              text: '🖨️ Print / WhatsApp Bill',
              onPress: () => {
                printWHPurchaseInvoice(savedPurchase, true);
                resetForm();
              }
            },
            {
              text: 'Done',
              onPress: resetForm
            }
          ]
        );
      } else {
        throw new Error(res?.message || 'Could not save purchase invoice.');
      }
    } catch (err) {
      console.error('Save WH Purchase error:', err);
      Alert.alert('Purchase Creation Failed', err.message || 'Server error while posting purchase.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setCartItems([]);
    setSelectedSupplier(null);
    setRemarks('');
    setExtraDiscount('0');
    fetchNextBillNo();
  };

  // Filter previous purchases
  const filteredHistory = previousPurchases.filter(p => {
    if (!historySearch.trim()) return true;
    const q = historySearch.toLowerCase().trim();
    const supp = (p.supplier?.supplierName || p.supplier?.name || p.supplierName || '').toLowerCase();
    const bill = (p.invoiceNo || '').toLowerCase();
    const remarks = (p.remarks || '').toLowerCase();
    return supp.includes(q) || bill.includes(q) || remarks.includes(q);
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0B1120" />

      {/* Screen Header with proper Android Notch/Status Bar top padding */}
      <View style={styles.screenHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack || (() => navigation && navigation.goBack())}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color="#F8FAFC" />
        </TouchableOpacity>
        <View style={styles.headerTitleBox}>
          <Text style={styles.headerTitle}>Warehouse Purchase Entry</Text>
          <Text style={styles.headerSub}>Inward Receiving & Stock Influx</Text>
        </View>
      </View>

      {/* Prominent Full-Width Segmented Tab Bar */}
      <View style={styles.segmentedTabBar}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'new' && styles.segmentBtnActive]}
          onPress={() => {
            haptic.light();
            setActiveTab('new');
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="create-outline" size={17} color={activeTab === 'new' ? '#10B981' : '#94A3B8'} style={{ marginRight: 6 }} />
          <Text style={[styles.segmentBtnText, activeTab === 'new' && styles.segmentBtnTextActive]}>
            New Purchase Entry
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'history' && styles.segmentBtnActive]}
          onPress={() => {
            haptic.light();
            setActiveTab('history');
            fetchPreviousPurchases();
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="receipt-outline" size={17} color={activeTab === 'history' ? '#10B981' : '#94A3B8'} style={{ marginRight: 6 }} />
          <Text style={[styles.segmentBtnText, activeTab === 'history' && styles.segmentBtnTextActive]}>
            Previous Purchases {previousPurchases.length > 0 ? `(${previousPurchases.length})` : ''}
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
            {/* Meta Row: Bill #, Date */}
            <View style={styles.card}>
              <View style={styles.formRow}>
                <View style={[styles.formCol, { flex: 1.2 }]}>
                  <Text style={styles.inputLabel}>INWARD / BILL NUMBER</Text>
                  <View style={styles.badgeInput}>
                    <Ionicons name="document-text-outline" size={16} color="#10B981" style={{ marginRight: 6 }} />
                    <TextInput
                      style={styles.badgeInputText}
                      value={invoiceNo}
                      onChangeText={setInvoiceNo}
                      placeholder="PUR-0001"
                      placeholderTextColor="#64748B"
                    />
                  </View>
                </View>

                <View style={[styles.formCol, { flex: 1, marginLeft: 10 }]}>
                  <Text style={styles.inputLabel}>DATE</Text>
                  <View style={styles.badgeInput}>
                    <Ionicons name="calendar-outline" size={16} color="#94A3B8" style={{ marginRight: 6 }} />
                    <Text style={styles.dateText}>{invoiceDate}</Text>
                  </View>
                </View>
              </View>

              {/* Supplier Selector */}
              <View style={{ marginTop: 12 }}>
                <Text style={styles.inputLabel}>SELECT SUPPLIER / VENDOR *</Text>
                <TouchableOpacity
                  style={styles.supplierSelector}
                  onPress={() => {
                    haptic.light();
                    fetchSuppliers('');
                    setSupplierModalVisible(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="business-outline" size={18} color="#10B981" style={{ marginRight: 8 }} />
                  <Text
                    style={[
                      styles.supplierSelectorText,
                      selectedSupplier && { color: '#F8FAFC', fontWeight: '700' }
                    ]}
                    numberOfLines={1}
                  >
                    {selectedSupplier ? (selectedSupplier.supplierName || selectedSupplier.name) : 'Tap to select registered supplier...'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#64748B" />
                </TouchableOpacity>

                {selectedSupplier && (
                  <View style={styles.supplierMetaRow}>
                    <Text style={styles.supplierMetaText}>
                      Code: <Text style={{ color: '#F8FAFC' }}>{selectedSupplier.code || '-'}</Text>
                    </Text>
                    <Text style={styles.supplierMetaText}>
                      Phone: <Text style={{ color: '#F8FAFC' }}>{selectedSupplier.phone || '-'}</Text>
                    </Text>
                    <Text style={styles.supplierMetaText}>
                      Balance: <Text style={{ color: '#EF4444', fontWeight: 'bold' }}>Rs. {formatPKR(selectedSupplier.balance || 0)}</Text>
                    </Text>
                  </View>
                )}
              </View>

              {/* Remarks Note */}
              <View style={{ marginTop: 12 }}>
                <Text style={styles.inputLabel}>SUPPLIER INVOICE REF / REMARKS</Text>
                <TextInput
                  style={styles.remarksInput}
                  value={remarks}
                  onChangeText={setRemarks}
                  placeholder="Enter vendor invoice ref or receiving notes..."
                  placeholderTextColor="#64748B"
                />
              </View>
            </View>

            {/* Action Bar: Barcode Scan & Manual Search */}
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
                <Ionicons name="search" size={18} color="#10B981" style={{ marginRight: 6 }} />
                <Text style={styles.manualBtnText}>MANUAL ITEM</Text>
              </TouchableOpacity>
            </View>

            {/* Cart Line Items Header */}
            <View style={styles.cartHeaderRow}>
              <Text style={styles.sectionTitle}>
                Inward Items ({cartItems.length})
              </Text>
              {cartItems.length > 0 && (
                <TouchableOpacity onPress={() => setCartItems([])}>
                  <Text style={styles.clearCartText}>Clear All</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Cart Items List */}
            {cartItems.length === 0 ? (
              <View style={styles.emptyCartBox}>
                <Ionicons name="cube-outline" size={40} color="#334155" />
                <Text style={styles.emptyCartTitle}>No items in purchase bill</Text>
                <Text style={styles.emptyCartSub}>
                  Scan barcodes of incoming stock or tap Manual Item to pick products.
                </Text>
              </View>
            ) : (
              cartItems.map((item, idx) => (
                <View key={`cart-${idx}`} style={styles.cartItemCard}>
                  <View style={styles.cartItemTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cartItemName} numberOfLines={2}>{item.name}</Text>
                      <Text style={styles.cartItemBarcode}>
                        Barcode: {item.barcode || 'N/A'} • Cost: Rs. {formatPKR(item.costPrice)}
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

                  <View style={styles.cartItemBottom}>
                    <View style={styles.qtyControls}>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => handleUpdateCartQty(idx, -1)}
                      >
                        <Text style={styles.qtyBtnText}>-</Text>
                      </TouchableOpacity>
                      <Text style={styles.qtyVal}>{item.quantity}</Text>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => handleUpdateCartQty(idx, 1)}
                      >
                        <Text style={styles.qtyBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.cartItemTotal}>Rs. {formatPKR(item.totalAmount)}</Text>
                      <Text style={styles.cartItemSubRate}>
                        @{formatPKR(item.costPrice)}/unit
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}

            {/* Totals Summary Card */}
            {cartItems.length > 0 && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryHeader}>PURCHASE TOTALS</Text>

                <View style={styles.summaryLine}>
                  <Text style={styles.summaryLabel}>Gross Subtotal:</Text>
                  <Text style={styles.summaryVal}>Rs. {formatPKR(grossSubtotal)}</Text>
                </View>

                <View style={styles.summaryLine}>
                  <Text style={styles.summaryLabel}>Vendor Discount (Rs):</Text>
                  <TextInput
                    style={styles.discountInput}
                    keyboardType="numeric"
                    value={extraDiscount}
                    onChangeText={setExtraDiscount}
                    placeholder="0"
                    placeholderTextColor="#64748B"
                  />
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.summaryLine}>
                  <Text style={styles.grandTotalLabel}>GRAND TOTAL:</Text>
                  <Text style={styles.grandTotalVal}>PKR {formatPKR(grandTotal)}</Text>
                </View>

                <View style={[styles.summaryLine, { marginTop: 4 }]}>
                  <Text style={styles.summaryLabel}>Total Packs / Qty:</Text>
                  <Text style={[styles.summaryVal, { color: '#10B981' }]}>
                    {cartItems.reduce((acc, i) => acc + i.quantity, 0)} Units
                  </Text>
                </View>
              </View>
            )}

            {/* Bottom Spacer */}
            <View style={{ height: 100 }} />
          </ScrollView>

          {/* Sticky Post Purchase Button */}
          {cartItems.length > 0 && (
            <View style={styles.stickyFooter}>
              <TouchableOpacity
                style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
                onPress={handleSavePurchase}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={styles.submitBtnText}>
                      SAVE & POST PURCHASE (PKR {formatPKR(grandTotal)})
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
      ) : (
        /* History / Previous Purchases Tab */
        <View style={styles.historyContainer}>
          {/* Search Box */}
          <View style={styles.searchBarBox}>
            <Ionicons name="search" size={18} color="#64748B" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchBarInput}
              value={historySearch}
              onChangeText={setHistorySearch}
              placeholder="Search previous purchases by Supplier or Bill#..."
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
              <ActivityIndicator size="large" color="#10B981" />
              <Text style={styles.loadingText}>Loading warehouse purchases...</Text>
            </View>
          ) : filteredHistory.length === 0 ? (
            <View style={styles.centerContainer}>
              <Ionicons name="document-text-outline" size={48} color="#334155" />
              <Text style={styles.emptyTitle}>No Purchases Found</Text>
              <Text style={styles.emptySub}>No previous purchase records match your search.</Text>
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
                      <Text style={styles.historyBillNo}>#{item.invoiceNo || 'PUR'}</Text>
                      <Text style={styles.historySupplier}>
                        {item.supplier?.supplierName || item.supplier?.name || item.supplierName || 'Unknown Supplier'}
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
                    <Text style={styles.historyRemarks}>
                      {item.remarks ? `Ref: ${item.remarks}` : 'No notes'}
                    </Text>
                  </View>

                  <View style={styles.historyTotalsRow}>
                    <Text style={styles.historyItemCount}>
                      {item.items?.length || 0} Products ({item.totalQuantity || 0} Qty)
                    </Text>
                    <Text style={styles.historyAmount}>
                      PKR {formatPKR(item.grandTotal || item.subTotal || 0)}
                    </Text>
                  </View>

                  <View style={styles.historyDivider} />

                  {/* Print & Share Actions */}
                  <View style={styles.historyActionsRow}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => {
                        haptic.selection();
                        printWHPurchaseInvoice(item, false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="print-outline" size={16} color="#10B981" style={{ marginRight: 6 }} />
                      <Text style={styles.actionBtnText}>Print Bill</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnWhatsApp]}
                      onPress={() => {
                        haptic.selection();
                        printWHPurchaseInvoice(item, true);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="logo-whatsapp" size={16} color="#10B981" style={{ marginRight: 6 }} />
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
        title="Scan Inward Product Barcode"
      />

      {/* Supplier Picker Modal */}
      <Modal
        visible={supplierModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSupplierModalVisible(false)}
      >
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Supplier / Vendor</Text>
              <TouchableOpacity onPress={() => setSupplierModalVisible(false)}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchBox}>
              <Ionicons name="search" size={18} color="#64748B" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.modalSearchInput}
                value={supplierSearch}
                onChangeText={(t) => {
                  setSupplierSearch(t);
                  fetchSuppliers(t);
                }}
                placeholder="Search vendor by name, code or contact..."
                placeholderTextColor="#64748B"
              />
            </View>

            {suppliersLoading ? (
              <ActivityIndicator style={{ marginTop: 20 }} color="#10B981" />
            ) : (
              <FlatList
                data={suppliers.filter(s => {
                  if (!supplierSearch.trim()) return true;
                  const q = supplierSearch.toLowerCase().trim();
                  return (s.supplierName || s.name || '').toLowerCase().includes(q) ||
                    (s.code || '').toLowerCase().includes(q) ||
                    (s.phone || '').toLowerCase().includes(q);
                })}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.supplierItemRow}
                    onPress={() => {
                      haptic.selection();
                      setSelectedSupplier(item);
                      setSupplierModalVisible(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.supplierItemName}>{item.supplierName || item.name}</Text>
                      <Text style={styles.supplierItemSub}>
                        Code: {item.code || '-'} • Phone: {item.phone || '-'}
                      </Text>
                    </View>
                    <Text style={styles.supplierItemBalance}>
                      Rs. {formatPKR(item.balance || 0)}
                    </Text>
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
              <Text style={styles.modalTitle}>Select Product for Receiving</Text>
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
                  fetchItems(t);
                }}
                placeholder="Search product by name, barcode or SKU..."
                placeholderTextColor="#64748B"
                autoFocus={true}
              />
            </View>

            {itemsLoading ? (
              <ActivityIndicator style={{ marginTop: 20 }} color="#10B981" />
            ) : (
              <FlatList
                data={availableItems}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => {
                  const availableQty = (item.stock && item.stock.length > 0) ? item.stock[0].quantity : (item.quantity || 0);
                  return (
                    <TouchableOpacity
                      style={styles.itemPickerRow}
                      onPress={() => openQtyModalForItem(item)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemPickerName}>{item.name}</Text>
                        <Text style={styles.itemPickerSub}>
                          Barcode: {item.barcode || 'N/A'} • Current Stock: {availableQty}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.itemPickerCost}>
                          Cost: Rs. {formatPKR(item.costPrice || item.purchasePrice || 0)}
                        </Text>
                        <Text style={styles.itemPickerTap}>+ Add</Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* Quantity & Cost Dialog Modal */}
      <Modal
        visible={qtyModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setQtyModalVisible(false)}
      >
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogBox}>
            <Text style={styles.dialogTitle} numberOfLines={2}>
              {selectedItemToAdd?.name}
            </Text>
            <Text style={styles.dialogBarcode}>
              Barcode: {selectedItemToAdd?.barcode || 'N/A'}
            </Text>

            <View style={styles.dialogInputRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.inputLabel}>RECEIVING QUANTITY</Text>
                <TextInput
                  style={styles.dialogInput}
                  keyboardType="numeric"
                  value={modalQty}
                  onChangeText={setModalQty}
                  autoFocus={true}
                />
              </View>

              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.inputLabel}>PURCHASE COST (PKR)</Text>
                <TextInput
                  style={styles.dialogInput}
                  keyboardType="numeric"
                  value={modalCost}
                  onChangeText={setModalCost}
                />
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
                <Text style={styles.dialogAddText}>Add to Inward Bill</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 10 : 14,
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
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  segmentBtnText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  segmentBtnTextActive: {
    color: '#34D399',
    fontWeight: '800',
  },
  tabPillContainer: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 2,
  },
  tabPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  tabPillActive: {
    backgroundColor: '#10B981',
  },
  tabPillText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  tabPillTextActive: {
    color: '#FFFFFF',
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
  supplierSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  supplierSelectorText: {
    flex: 1,
    color: '#64748B',
    fontSize: 13,
  },
  supplierMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingHorizontal: 4,
  },
  supplierMetaText: {
    color: '#64748B',
    fontSize: 11,
  },
  remarksInput: {
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    color: '#F8FAFC',
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  entryButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  scanBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 13,
    borderRadius: 12,
    shadowColor: '#059669',
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
    borderColor: 'rgba(16, 185, 129, 0.3)',
    paddingVertical: 13,
    borderRadius: 12,
  },
  manualBtnText: {
    color: '#10B981',
    fontWeight: '700',
    fontSize: 12.5,
  },
  cartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 8,
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
  },
  clearCartText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyCartBox: {
    backgroundColor: '#131D33',
    borderRadius: 14,
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
    marginTop: 10,
  },
  emptyCartSub: {
    color: '#475569',
    fontSize: 11.5,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  cartItemCard: {
    backgroundColor: '#131D33',
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
  cartItemName: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  cartItemBarcode: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  trashBtn: {
    padding: 4,
  },
  cartItemBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1120',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  qtyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  qtyBtnText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '800',
  },
  qtyVal: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 8,
  },
  cartItemTotal: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '800',
  },
  cartItemSubRate: {
    color: '#64748B',
    fontSize: 10.5,
  },
  summaryCard: {
    backgroundColor: '#131D33',
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  summaryHeader: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
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
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 8,
  },
  grandTotalLabel: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '800',
  },
  grandTotalVal: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '900',
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
  historyBillNo: {
    color: '#10B981',
    fontSize: 13.5,
    fontWeight: '800',
  },
  historySupplier: {
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
  historyRemarks: {
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
    gap: 8,
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
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  actionBtnWhatsApp: {
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  actionBtnText: {
    color: '#10B981',
    fontSize: 12,
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
  supplierItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  supplierItemName: {
    color: '#F8FAFC',
    fontSize: 13.5,
    fontWeight: '700',
  },
  supplierItemSub: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  supplierItemBalance: {
    color: '#EF4444',
    fontSize: 12.5,
    fontWeight: '700',
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
  itemPickerCost: {
    color: '#10B981',
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
  dialogTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  dialogBarcode: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
    marginBottom: 14,
  },
  dialogInputRow: {
    flexDirection: 'row',
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
  dialogButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
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
    backgroundColor: '#10B981',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  dialogAddText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
