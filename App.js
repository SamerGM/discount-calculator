import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet, Text, View, Pressable, ScrollView, StatusBar, Platform,
  useColorScheme, useWindowDimensions, Modal, Alert, ActivityIndicator, Animated,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

const VISION_API_KEY = 'AIzaSyCdzCuPTWjo1j4HXjr6ZIgKtlZNNM_7YxE';

// ─── Theme ────────────────────────────────────────────────────────────────────
const lightTheme = {
  bg: '#F2F3F7', surface: '#FFFFFF', surfaceAlt: '#E6E8EF', border: '#E4E7EE',
  text: '#0F172A', textSecondary: '#64748B', textMuted: '#A0A8B8',
  primary: '#4F46E5', primarySoft: '#EEF2FF', hero: '#111827', heroText: '#FFFFFF',
  key: '#FFFFFF', keyFn: '#E6E8EF', keyText: '#0F172A',
  success: '#059669', successSoft: '#D1FAE5',
  danger: '#DC2626', dangerSoft: '#FEE2E2',
  coupon: '#0891B2', couponSoft: '#CFFAFE',
  tax: '#D97706', taxSoft: '#FEF3C7',
};
const darkTheme = {
  bg: '#05070D', surface: '#121826', surfaceAlt: '#1B2234', border: '#222B3F',
  text: '#F3F4F6', textSecondary: '#9CA3AF', textMuted: '#5B6475',
  primary: '#818CF8', primarySoft: '#1E1B4B', hero: '#1E1B4B', heroText: '#FFFFFF',
  key: '#1B2234', keyFn: '#2A3349', keyText: '#F3F4F6',
  success: '#34D399', successSoft: '#064E3B',
  danger: '#F87171', dangerSoft: '#450A0A',
  coupon: '#22D3EE', couponSoft: '#083344',
  tax: '#FBBF24', taxSoft: '#451A03',
};

// ─── Translations ─────────────────────────────────────────────────────────────
const translations = {
  en: {
    appTitle: 'Shopping Calculator',
    simple: 'Simple', stacked: 'Stacked',
    price: 'Price', discount: 'Discount',
    discountN: (n) => (n === 1 ? 'First discount' : 'Second discount'),
    coupon: (n) => `Coupon ${n}`, addCoupon: 'Add coupon', tax: 'Sales tax',
    pctOrAmt: 'Tap % / $ to switch',
    finalPrice: 'FINAL PRICE', reset: 'Reset', details: 'Details',
    youSave: (a, p) => `You save ${a} (${p}%)`,
    inclTax: (a) => `incl. ${a} tax`,
    enterPrice: 'Type a price with the keypad',
    priceHint: 'Tap the camera to scan a price tag',
    breakdown: 'Breakdown', original: 'Original price', subtotal: 'Subtotal', total: 'Total',
    effective: 'Effective discount', close: 'Close',
    stackedNote: (parts, eq) => `${parts} stacked = ${eq}% off. Discounts apply one after another, they don't add up.`,
    next: 'Next', removeCoupon: 'Remove coupon', clearField: 'Clear field', backspace: 'Delete',
    switchType: 'Switch between percent and amount',
    takePhoto: 'Take photo', chooseGallery: 'Choose from gallery', cancel: 'Cancel',
    scanning: 'Scanning image...', scanFailed: 'Could not detect a price. Please enter it manually.',
    scanTitle: 'Scan price tag',
    scanSubtitle: 'Take a photo or pick one from your gallery to auto-fill the price and discount.',
  },
  ar: {
    appTitle: 'حاسبة التسوق',
    simple: 'بسيط', stacked: 'خصم مركب',
    price: 'السعر', discount: 'الخصم',
    discountN: (n) => (n === 1 ? 'الخصم الأول' : 'الخصم الثاني'),
    coupon: (n) => `كوبون ${n}`, addCoupon: 'إضافة كوبون', tax: 'الضريبة',
    pctOrAmt: 'اضغط % / $ للتبديل',
    finalPrice: 'السعر النهائي', reset: 'مسح الكل', details: 'التفاصيل',
    youSave: (a, p) => `وفّرت ‎${a}‏ (‎${p}%‏)`,
    inclTax: (a) => `شامل ضريبة ‎${a}‏`,
    enterPrice: 'أدخل السعر من لوحة الأرقام',
    priceHint: 'اضغط على الكاميرا لمسح بطاقة السعر',
    breakdown: 'التفاصيل', original: 'السعر الأصلي', subtotal: 'المجموع قبل الضريبة', total: 'الإجمالي',
    effective: 'الخصم الفعلي', close: 'إغلاق',
    stackedNote: (parts, eq) => `${parts} متراكم = ${eq}% فعلياً. الخصومات تُطبَّق بالتسلسل ولا تُجمع.`,
    next: 'التالي', removeCoupon: 'حذف الكوبون', clearField: 'مسح الحقل', backspace: 'حذف',
    switchType: 'التبديل بين النسبة والمبلغ',
    takePhoto: 'التقاط صورة', chooseGallery: 'اختيار من المعرض', cancel: 'إلغاء',
    scanning: 'جارٍ مسح الصورة...', scanFailed: 'لم يتم اكتشاف السعر. يرجى الإدخال يدوياً.',
    scanTitle: 'مسح بطاقة السعر',
    scanSubtitle: 'التقط صورة أو اختر من المعرض لملء السعر والخصم تلقائياً.',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const parseNum = (val) => { const n = parseFloat(val); return isNaN(n) ? 0 : n; };
const fmt = (n) => n.toFixed(2);
const money = (n) => `$${fmt(n)}`;
const trimNum = (n) => String(Math.round(n * 100) / 100);

const MAX_COUPONS = 5;
const MAX_DIGITS = 8;
const FIELDS_PAD_TOP = 2;
const FIELDS_GAP = 8;
const DISCOUNT_PICKS = [10, 20, 25, 30, 40, 50, 70];
const TAX_PICKS = [5, 7, 8, 10, 15];

/**
 * Applies discounts, then coupons, in order on the running price, then tax.
 * Each adjustment is { value, type: 'pct' | 'amt' }. A fixed amount can never
 * push the price below zero.
 */
const calculate = ({ price, discounts, coupons, tax }) => {
  const p = parseNum(price);
  let running = p;
  const steps = [];
  const apply = (adj, kind, index) => {
    const v = parseNum(adj.value);
    if (v <= 0) return;
    const value = adj.type === 'pct' ? Math.min(v, 100) : v;
    const cut = adj.type === 'pct' ? running * value / 100 : Math.min(value, running);
    running -= cut;
    steps.push({ kind, index, type: adj.type, value, amount: -cut });
  };
  discounts.forEach((d, i) => apply(d, 'discount', i));
  coupons.forEach((c, i) => apply(c, 'coupon', i));
  const tv = parseNum(tax);
  const taxAmount = running * tv / 100;
  if (tv > 0) steps.push({ kind: 'tax', type: 'pct', value: tv, amount: taxAmount });
  const savings = p - running;
  return {
    original: p, subtotal: running, tax: taxAmount, final: running + taxAmount,
    savings, savingsPct: p > 0 ? (savings / p) * 100 : 0, steps,
  };
};

// Applies one keypad press to a field's text value.
const applyKey = (value, key, isPct) => {
  if (key === 'back') return value.slice(0, -1);
  if (key === 'clear') return '';
  if (key === '.') {
    if (value.includes('.')) return value;
    return value === '' ? '0.' : `${value}.`;
  }
  const next = value === '0' ? key : value + key;
  const [, decimals = ''] = next.split('.');
  if (decimals.length > 2) return value;
  if (next.replace('.', '').length > MAX_DIGITS) return value;
  if (isPct && parseFloat(next) > 100) return value;
  return next;
};

// ─── Price-tag scanning ───────────────────────────────────────────────────────
const extractPriceAndDiscount = (text) => {
  const pricePatterns = [
    /\$\s*(\d+(?:[.,]\d{1,2})?)/,
    /(\d+(?:[.,]\d{2}))\s*(?:USD|AED|EUR|GBP)/i,
    /(?:price|total|amount|سعر|المبلغ)[:\s]*(\d+(?:[.,]\d{1,2})?)/i,
    /(\d{1,6}(?:[.,]\d{2}))/,
  ];
  const discountPatterns = [
    /(\d{1,2})\s*%\s*(?:off|discount|sale|خصم|تخفيض)/i,
    /(?:off|discount|save|خصم|تخفيض)\s*(\d{1,2})\s*%/i,
    /(\d{1,2})\s*%/,
  ];
  let price = '', discount = '';
  for (const pattern of pricePatterns) {
    const match = text.match(pattern);
    if (match) { price = match[1].replace(',', '.'); break; }
  }
  for (const pattern of discountPatterns) {
    const match = text.match(pattern);
    if (match) {
      const val = parseInt(match[1], 10);
      if (val > 0 && val <= 100) { discount = val.toString(); break; }
    }
  }
  return { price, discount };
};

const scanImageWithVisionAPI = async (base64Image) => {
  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ image: { content: base64Image }, features: [{ type: 'TEXT_DETECTION', maxResults: 1 }] }],
      }),
    }
  );
  const data = await response.json();
  const text = data.responses?.[0]?.fullTextAnnotation?.text || '';
  return extractPriceAndDiscount(text);
};

// ─── Bottom sheet (shared by scan + details) ──────────────────────────────────
const Sheet = ({ visible, onClose, theme, children, dismissable = true }) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismissable ? onClose : undefined}>
      <Pressable style={styles.sheetOverlay} onPress={dismissable ? onClose : undefined}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: 24 + insets.bottom }]} onPress={() => {}}>
          <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const ScanSheet = ({ visible, onClose, onResult, theme, t }) => {
  const [scanning, setScanning] = useState(false);
  const handleScan = async (useCamera) => {
    try {
      let result;
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Camera permission is required.'); return; }
        result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5, allowsEditing: false, exif: false });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Gallery permission is required.'); return; }
        result = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.5, allowsEditing: false, exif: false });
      }
      if (!result.canceled && result.assets?.[0]?.base64) {
        setScanning(true);
        const { price, discount } = await scanImageWithVisionAPI(result.assets[0].base64);
        setScanning(false);
        if (price || discount) { onResult({ price, discount }); onClose(); }
        else { Alert.alert(t.scanFailed); }
      }
    } catch (e) {
      setScanning(false);
      Alert.alert('Error', e.message || 'Something went wrong. Please try again.');
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} theme={theme} dismissable={!scanning}>
      {scanning ? (
        <View style={styles.scanningContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.scanningText, { color: theme.text }]}>{t.scanning}</Text>
        </View>
      ) : (
        <>
          <View style={[styles.sheetIcon, { backgroundColor: theme.primarySoft }]}>
            <Ionicons name="scan-outline" size={28} color={theme.primary} />
          </View>
          <Text style={[styles.sheetTitle, { color: theme.text }]}>{t.scanTitle}</Text>
          <Text style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>{t.scanSubtitle}</Text>
          <Pressable style={({ pressed }) => [styles.sheetBtn, { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 }]} onPress={() => handleScan(true)}>
            <Ionicons name="camera-outline" size={20} color="#fff" />
            <Text style={styles.sheetBtnText}>{t.takePhoto}</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.sheetBtn, { backgroundColor: theme.surfaceAlt, opacity: pressed ? 0.85 : 1 }]} onPress={() => handleScan(false)}>
            <Ionicons name="image-outline" size={20} color={theme.text} />
            <Text style={[styles.sheetBtnText, { color: theme.text }]}>{t.chooseGallery}</Text>
          </Pressable>
          <Pressable style={styles.sheetGhostBtn} onPress={onClose}>
            <Text style={[styles.sheetGhostText, { color: theme.textSecondary }]}>{t.cancel}</Text>
          </Pressable>
        </>
      )}
    </Sheet>
  );
};

const BreakdownRow = ({ label, value, color, theme, rtl, bold }) => (
  <View style={[styles.bdRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
    <Text style={[bold ? styles.bdLabelBold : styles.bdLabel, { color: bold ? theme.text : theme.textSecondary, textAlign: rtl ? 'right' : 'left' }]}>{label}</Text>
    <Text style={[bold ? styles.bdValueBold : styles.bdValue, { color: color || theme.text }]}>{value}</Text>
  </View>
);

const DetailsSheet = ({ visible, onClose, theme, t, rtl, result, stepLabel, stepColor, stackNote }) => (
  <Sheet visible={visible} onClose={onClose} theme={theme}>
    <Text style={[styles.sheetTitle, { color: theme.text, textAlign: rtl ? 'right' : 'left' }]}>{t.breakdown}</Text>
    <View style={{ gap: 2, marginTop: 4 }}>
      <BreakdownRow label={t.original} value={money(result.original)} theme={theme} rtl={rtl} />
      {result.steps.filter((s) => s.kind !== 'tax').map((s, i) => (
        <BreakdownRow key={`${s.kind}-${i}`} label={stepLabel(s)} value={`− ${money(-s.amount)}`} color={stepColor(s)} theme={theme} rtl={rtl} />
      ))}
      {result.tax > 0 && (
        <>
          <View style={[styles.bdDivider, { backgroundColor: theme.border }]} />
          <BreakdownRow label={t.subtotal} value={money(result.subtotal)} theme={theme} rtl={rtl} />
          {result.steps.filter((s) => s.kind === 'tax').map((s) => (
            <BreakdownRow key="tax" label={stepLabel(s)} value={`+ ${money(s.amount)}`} color={theme.tax} theme={theme} rtl={rtl} />
          ))}
        </>
      )}
      <View style={[styles.bdDivider, { backgroundColor: theme.border }]} />
      <BreakdownRow label={t.total} value={money(result.final)} color={theme.primary} theme={theme} rtl={rtl} bold />
      {result.savings > 0 && (
        <BreakdownRow label={t.effective} value={`${result.savingsPct.toFixed(1)}%`} color={theme.success} theme={theme} rtl={rtl} />
      )}
      {stackNote && (
        <View style={[styles.note, { backgroundColor: theme.primarySoft, flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <Ionicons name="information-circle-outline" size={16} color={theme.primary} />
          <Text style={[styles.noteText, { color: theme.primary, textAlign: rtl ? 'right' : 'left' }]}>{stackNote}</Text>
        </View>
      )}
    </View>
    <Pressable style={({ pressed }) => [styles.sheetBtn, { backgroundColor: theme.surfaceAlt, marginTop: 12, opacity: pressed ? 0.85 : 1 }]} onPress={onClose}>
      <Text style={[styles.sheetBtnText, { color: theme.text }]}>{t.close}</Text>
    </Pressable>
  </Sheet>
);

// ─── Display pieces ───────────────────────────────────────────────────────────
const Caret = ({ color }) => {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const driver = Platform.OS !== 'web';
    const blink = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0, duration: 450, useNativeDriver: driver }),
      Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: driver }),
    ]));
    blink.start();
    return () => blink.stop();
  }, [opacity]);
  return <Animated.View style={[styles.caret, { backgroundColor: color, opacity }]} />;
};

const Segmented = ({ options, value, onChange, theme, rtl }) => (
  <View style={[styles.seg, { backgroundColor: theme.surfaceAlt, flexDirection: rtl ? 'row-reverse' : 'row' }]}>
    {options.map((o) => {
      const active = o.value === value;
      return (
        <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: active }}
          style={[styles.segItem, active && [styles.segItemActive, { backgroundColor: theme.surface }]]}>
          <Text style={[styles.segText, { color: active ? theme.primary : theme.textSecondary }]}>{o.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

const FieldRow = ({ field, active, onPress, onToggleType, onRemove, onScan, theme, rtl, t }) => {
  const row = rtl ? 'row-reverse' : 'row';
  const empty = field.value === '';
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}
      style={[styles.field, { flexDirection: row, backgroundColor: theme.surface, borderColor: active ? field.color : theme.border }]}>
      <View style={[styles.fieldIcon, { backgroundColor: field.soft }]}>
        <Ionicons name={field.icon} size={16} color={field.color} />
      </View>
      <Text numberOfLines={1} style={[styles.fieldLabel, { color: active ? theme.text : theme.textSecondary, textAlign: rtl ? 'right' : 'left' }]}>{field.label}</Text>

      {field.adjustable && (
        <Pressable onPress={onToggleType} hitSlop={6} accessibilityLabel={t.switchType}
          style={[styles.typePill, { backgroundColor: field.soft }]}>
          <Text style={[styles.typePillText, { color: field.color }]}>{field.type === 'pct' ? '%' : '$'}</Text>
          <Ionicons name="swap-horizontal" size={12} color={field.color} />
        </Pressable>
      )}

      {/* Numbers always read left-to-right, even in Arabic. */}
      <View style={styles.fieldValueWrap}>
        {field.type === 'amt' && <Text style={[styles.fieldAffix, { color: empty ? theme.textMuted : theme.textSecondary }]}>$</Text>}
        <Text numberOfLines={1} style={[styles.fieldValue, { color: empty ? theme.textMuted : theme.text }]}>{empty ? '0' : field.value}</Text>
        {active && <Caret color={field.color} />}
        {field.type === 'pct' && <Text style={[styles.fieldAffix, { color: empty ? theme.textMuted : theme.textSecondary }]}>%</Text>}
      </View>

      {onScan && (
        <Pressable onPress={onScan} hitSlop={6} accessibilityLabel={t.scanTitle} style={[styles.fieldAction, { backgroundColor: theme.primarySoft }]}>
          <Ionicons name="camera-outline" size={18} color={theme.primary} />
        </Pressable>
      )}
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={6} accessibilityLabel={t.removeCoupon} style={[styles.fieldAction, { backgroundColor: theme.dangerSoft }]}>
          <Ionicons name="close" size={18} color={theme.danger} />
        </Pressable>
      )}
    </Pressable>
  );
};

const Key = ({ label, icon, onPress, onLongPress, theme, height, variant = 'digit', disabled, flex = 1, a11y }) => {
  const bg = variant === 'primary' ? theme.primary : variant === 'fn' ? theme.keyFn : theme.key;
  const fg = variant === 'primary' ? '#FFFFFF' : theme.keyText;
  return (
    <Pressable
      onPress={onPress} onLongPress={onLongPress} disabled={disabled}
      accessibilityRole="button" accessibilityLabel={a11y || label}
      style={({ pressed }) => [styles.key, { flex, height, backgroundColor: bg, opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }]}
    >
      {icon ? <Ionicons name={icon} size={variant === 'primary' ? 20 : 22} color={fg} /> : null}
      {label ? <Text style={[variant === 'digit' ? styles.keyDigit : styles.keyFnText, { color: fg }]}>{label}</Text> : null}
    </Pressable>
  );
};

// ─── Main screen ──────────────────────────────────────────────────────────────
const emptyForm = () => ({
  price: '',
  discounts: [{ value: '', type: 'pct' }, { value: '', type: 'pct' }],
  coupons: [],
  tax: '',
});

const CalculatorScreen = () => {
  const systemScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [isDark, setIsDark] = useState(null);
  const [lang, setLang] = useState('en');
  const [mode, setMode] = useState('simple');
  const [loaded, setLoaded] = useState(false);

  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState('price');
  const [scanVisible, setScanVisible] = useState(false);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const nextId = useRef(1);
  const listRef = useRef(null);
  const heights = useRef({});
  const scrollY = useRef(0);
  const viewH = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const [savedTheme, savedLang, savedMode] = await Promise.all(
          ['theme', 'lang', 'mode'].map((k) => AsyncStorage.getItem(k))
        );
        setIsDark(savedTheme !== null ? savedTheme === 'dark' : systemScheme === 'dark');
        if (savedLang && translations[savedLang]) setLang(savedLang);
        if (savedMode === 'simple' || savedMode === 'stacked') setMode(savedMode);
      } catch (e) { setIsDark(systemScheme === 'dark'); }
      setLoaded(true);
    })();
  }, []);

  const persist = (key, value) => { AsyncStorage.setItem(key, value).catch(() => {}); };
  const toggleTheme = () => { setIsDark((d) => { persist('theme', d ? 'light' : 'dark'); return !d; }); };
  const toggleLang = () => { setLang((l) => { const n = l === 'en' ? 'ar' : 'en'; persist('lang', n); return n; }); };
  const changeMode = (m) => { setMode(m); persist('mode', m); };

  const theme = isDark ? darkTheme : lightTheme;
  const t = translations[lang];
  const rtl = lang === 'ar';
  const stacked = mode === 'stacked';

  // Ordered list of editable fields; "Next" walks through it.
  const fields = useMemo(() => {
    const list = [{
      key: 'price', kind: 'price', label: t.price, icon: 'pricetag-outline',
      color: theme.primary, soft: theme.primarySoft, value: form.price, type: 'amt', adjustable: false,
    }];
    form.discounts.slice(0, stacked ? 2 : 1).forEach((d, i) => list.push({
      key: `d${i}`, kind: 'discount', label: stacked ? t.discountN(i + 1) : t.discount, icon: 'pricetags-outline',
      color: theme.success, soft: theme.successSoft, value: d.value, type: d.type, adjustable: true,
    }));
    form.coupons.forEach((c, i) => list.push({
      key: `c${c.id}`, kind: 'coupon', label: t.coupon(i + 1), icon: 'ticket-outline', id: c.id,
      color: theme.coupon, soft: theme.couponSoft, value: c.value, type: c.type, adjustable: true,
    }));
    list.push({
      key: 'tax', kind: 'tax', label: t.tax, icon: 'receipt-outline',
      color: theme.tax, soft: theme.taxSoft, value: form.tax, type: 'pct', adjustable: false,
    });
    return list;
  }, [form, stacked, t, theme]);

  const current = fields.find((f) => f.key === selected) || fields[0];
  const showAddCoupon = form.coupons.length < MAX_COUPONS;

  // If the selected field disappears (coupon removed, mode switched), fall back to price.
  useEffect(() => {
    if (!fields.some((f) => f.key === selected)) setSelected('price');
  }, [fields, selected]);

  // Keep the field being edited visible above the keypad.
  // Runs after layout settles, also when fields are inserted above (e.g. switching to Stacked).
  useEffect(() => {
    const timer = setTimeout(() => {
      // Positions come from measured heights in render order (onLayout only reports
      // size changes on web, so a stored y can go stale when rows are inserted).
      if (!listRef.current) return;
      const order = [];
      fields.forEach((f) => {
        if (f.kind === 'tax' && showAddCoupon) order.push('add');
        order.push(f.key);
      });
      let y = FIELDS_PAD_TOP;
      let l = null;
      for (const key of order) {
        const h = heights.current[key];
        if (h == null) return;
        if (key === current.key) { l = { y, height: h }; break; }
        y += h + FIELDS_GAP;
      }
      if (!l) return;
      if (l.y < scrollY.current) listRef.current.scrollTo({ y: Math.max(0, l.y - 4), animated: true });
      else if (l.y + l.height > scrollY.current + viewH.current) {
        listRef.current.scrollTo({ y: l.y + l.height - viewH.current + 4, animated: true });
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [current.key, fields.length, showAddCoupon]);

  const updateField = (key, fn) => setForm((f) => {
    if (key === 'price') return { ...f, price: fn({ value: f.price, type: 'amt' }).value };
    if (key === 'tax') return { ...f, tax: fn({ value: f.tax, type: 'pct' }).value };
    if (key[0] === 'd') {
      const i = Number(key.slice(1));
      return { ...f, discounts: f.discounts.map((d, j) => (j === i ? { ...d, ...fn(d) } : d)) };
    }
    const id = Number(key.slice(1));
    return { ...f, coupons: f.coupons.map((c) => (c.id === id ? { ...c, ...fn(c) } : c)) };
  });

  const toggleType = (key) => updateField(key, (adj) => {
    const type = adj.type === 'pct' ? 'amt' : 'pct';
    const value = type === 'pct' && parseNum(adj.value) > 100 ? '100' : adj.value;
    return { type, value };
  });

  const pressKey = (key) => {
    if (key === 'next') {
      const i = fields.findIndex((f) => f.key === current.key);
      setSelected(fields[(i + 1) % fields.length].key);
      return;
    }
    if (key === 'type') { if (current.adjustable) toggleType(current.key); return; }
    updateField(current.key, (adj) => ({ value: applyKey(adj.value, key, adj.type === 'pct') }));
  };

  const pickPreset = (n) => updateField(current.key, (adj) => ({ value: adj.value === String(n) ? '' : String(n) }));

  const addCoupon = () => {
    const id = nextId.current++;
    setForm((f) => ({ ...f, coupons: [...f.coupons, { id, value: '', type: 'pct' }] }));
    setSelected(`c${id}`);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  };
  const removeCoupon = (id) => setForm((f) => ({ ...f, coupons: f.coupons.filter((c) => c.id !== id) }));
  const reset = () => { setForm(emptyForm()); setSelected('price'); };

  const result = useMemo(() => calculate({
    price: form.price,
    discounts: form.discounts.slice(0, stacked ? 2 : 1),
    coupons: form.coupons,
    tax: form.tax,
  }), [form, stacked]);

  const canReset = !!(form.price || form.tax || form.coupons.length || form.discounts.some((d) => d.value));

  const adjText = (s) => (s.type === 'pct' ? `${trimNum(s.value)}%` : money(s.value));
  const stepLabel = (s) => {
    if (s.kind === 'discount') return `${stacked ? t.discountN(s.index + 1) : t.discount} (${adjText(s)})`;
    if (s.kind === 'coupon') return `${t.coupon(s.index + 1)} (${adjText(s)})`;
    return `${t.tax} (${trimNum(s.value)}%)`;
  };
  const stepColor = (s) => (s.kind === 'tax' ? theme.tax : s.kind === 'coupon' ? theme.coupon : theme.success);
  const pctDiscounts = result.steps.filter((s) => s.kind === 'discount' && s.type === 'pct');
  const stackNote = stacked && pctDiscounts.length >= 2
    ? t.stackedNote(
      pctDiscounts.map((s) => `${trimNum(s.value)}%`).join(' + '),
      (100 * (1 - pctDiscounts.reduce((acc, s) => acc * (1 - s.value / 100), 1))).toFixed(1),
    )
    : null;

  // Size keys to the screen so the keypad fits small and large phones.
  const keyH = Math.max(46, Math.min(62, Math.round(height * 0.068)));
  const compact = height < 720;
  const row = rtl ? 'row-reverse' : 'row';

  if (!loaded) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;

  const presets = current.kind === 'tax' ? TAX_PICKS
    : current.adjustable && current.type === 'pct' ? DISCOUNT_PICKS : null;

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg, paddingTop: insets.top + 8 }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />
      <ScanSheet visible={scanVisible} onClose={() => setScanVisible(false)} theme={theme} t={t}
        onResult={({ price, discount }) => {
          if (price) updateField('price', () => ({ value: price }));
          if (discount) updateField('d0', () => ({ value: discount, type: 'pct' }));
        }} />
      <DetailsSheet visible={detailsVisible} onClose={() => setDetailsVisible(false)} theme={theme} t={t} rtl={rtl}
        result={result} stepLabel={stepLabel} stepColor={stepColor} stackNote={stackNote} />

      {/* Header */}
      <View style={[styles.header, { flexDirection: row }]}>
        <View style={{ flex: 1 }}>
          <Segmented
            options={[{ value: 'simple', label: t.simple }, { value: 'stacked', label: t.stacked }]}
            value={mode} onChange={changeMode} theme={theme} rtl={rtl}
          />
        </View>
        <Pressable onPress={toggleLang} accessibilityLabel="Change language"
          style={({ pressed }) => [styles.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.7 : 1 }]}>
          <Text style={[styles.iconBtnText, { color: theme.text }]}>{lang === 'en' ? 'ع' : 'EN'}</Text>
        </Pressable>
        <Pressable onPress={toggleTheme} accessibilityLabel="Toggle dark mode"
          style={({ pressed }) => [styles.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.7 : 1 }]}>
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={18} color={theme.text} />
        </Pressable>
      </View>

      {/* Result display */}
      <View style={[styles.display, { backgroundColor: theme.hero }, compact && { paddingVertical: 10 }]}>
        <View style={[styles.displayTop, { flexDirection: row }]}>
          <Text style={styles.displayLabel}>{t.finalPrice}</Text>
          <View style={[styles.displayActions, { flexDirection: row }]}>
            <Pressable onPress={() => setDetailsVisible(true)} disabled={result.original <= 0} hitSlop={6}
              style={({ pressed }) => [styles.displayBtn, { flexDirection: row, opacity: result.original <= 0 ? 0.4 : pressed ? 0.7 : 1 }]}>
              <Ionicons name="list-outline" size={14} color="#fff" />
              <Text style={styles.displayBtnText}>{t.details}</Text>
            </Pressable>
            <Pressable onPress={reset} disabled={!canReset} hitSlop={6}
              style={({ pressed }) => [styles.displayBtn, { flexDirection: row, opacity: !canReset ? 0.4 : pressed ? 0.7 : 1 }]}>
              <Ionicons name="refresh" size={14} color="#fff" />
              <Text style={styles.displayBtnText}>{t.reset}</Text>
            </Pressable>
          </View>
        </View>
        <View style={[styles.displayValueRow, { flexDirection: row }]}>
          <Text style={[styles.displayValue, compact && { fontSize: 34 }]} numberOfLines={1} adjustsFontSizeToFit>{money(result.final)}</Text>
          {result.savings > 0 && <Text style={styles.displayStrike}>{money(result.original)}</Text>}
        </View>
        <View style={[styles.displayPills, { flexDirection: row }]}>
          {result.savings > 0 ? (
            <View style={[styles.savePill, { flexDirection: row }]}>
              <Ionicons name="trending-down" size={14} color="#065F46" />
              <Text style={styles.savePillText}>{t.youSave(money(result.savings), result.savingsPct.toFixed(1))}</Text>
            </View>
          ) : (
            <Text style={styles.displayHint}>{t.enterPrice}</Text>
          )}
          {result.tax > 0 && !compact && (
            <View style={styles.mutedPill}><Text style={styles.mutedPillText}>{t.inclTax(money(result.tax))}</Text></View>
          )}
        </View>
      </View>

      {/* Fields */}
      <ScrollView
        ref={listRef} style={styles.fieldList} contentContainerStyle={styles.fields} showsVerticalScrollIndicator={false}
        onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={32}
        onLayout={(e) => { viewH.current = e.nativeEvent.layout.height; }}
      >
        {fields.map((f) => (
          <React.Fragment key={f.key}>
            {f.kind === 'tax' && showAddCoupon && (
              <Pressable onPress={addCoupon} onLayout={(e) => { heights.current.add = e.nativeEvent.layout.height; }} style={({ pressed }) => [styles.addBtn, { flexDirection: row, borderColor: theme.coupon, opacity: pressed ? 0.7 : 1 }]}>
                <Ionicons name="add" size={18} color={theme.coupon} />
                <Text style={[styles.addBtnText, { color: theme.coupon }]}>{t.addCoupon}</Text>
              </Pressable>
            )}
            <View onLayout={(e) => { heights.current[f.key] = e.nativeEvent.layout.height; }}>
              <FieldRow
                field={f} active={f.key === current.key} theme={theme} rtl={rtl} t={t}
                onPress={() => setSelected(f.key)}
                onToggleType={() => { setSelected(f.key); toggleType(f.key); }}
                onScan={f.kind === 'price' ? () => setScanVisible(true) : null}
                onRemove={f.kind === 'coupon' ? () => removeCoupon(f.id) : null}
              />
            </View>
          </React.Fragment>
        ))}
      </ScrollView>

      {/* Presets / hint strip */}
      <View style={styles.strip}>
        {presets ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.stripInner, { flexDirection: row }]}>
            {presets.map((n) => {
              const active = current.value === String(n);
              return (
                <Pressable key={n} onPress={() => pickPreset(n)}
                  style={[styles.chip, { backgroundColor: active ? current.color : theme.surface, borderColor: active ? current.color : theme.border }]}>
                  <Text style={[styles.chipText, { color: active ? '#fff' : theme.textSecondary }]}>{n}%</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <View style={[styles.stripInner, { flexDirection: row, alignItems: 'center' }]}>
            <Ionicons name={current.adjustable ? 'swap-horizontal' : 'camera-outline'} size={14} color={theme.textMuted} />
            <Text style={[styles.stripHint, { color: theme.textMuted }]}>{current.adjustable ? t.pctOrAmt : t.priceHint}</Text>
          </View>
        )}
      </View>

      {/* Keypad (digits stay left-to-right in every language) */}
      <View style={[styles.keypad, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={styles.keyRow}>
          {['7', '8', '9'].map((k) => <Key key={k} label={k} onPress={() => pressKey(k)} theme={theme} height={keyH} />)}
          <Key icon="backspace-outline" variant="fn" onPress={() => pressKey('back')} onLongPress={() => pressKey('clear')} theme={theme} height={keyH} a11y={t.backspace} />
        </View>
        <View style={styles.keyRow}>
          {['4', '5', '6'].map((k) => <Key key={k} label={k} onPress={() => pressKey(k)} theme={theme} height={keyH} />)}
          <Key label="% ⇄ $" variant="fn" onPress={() => pressKey('type')} theme={theme} height={keyH} disabled={!current.adjustable} a11y={t.switchType} />
        </View>
        <View style={styles.keyRow}>
          {['1', '2', '3'].map((k) => <Key key={k} label={k} onPress={() => pressKey(k)} theme={theme} height={keyH} />)}
          <Key label="C" variant="fn" onPress={() => pressKey('clear')} theme={theme} height={keyH} a11y={t.clearField} />
        </View>
        <View style={styles.keyRow}>
          <Key label="." onPress={() => pressKey('.')} theme={theme} height={keyH} />
          <Key label="0" onPress={() => pressKey('0')} theme={theme} height={keyH} />
          <Key label={t.next} icon={rtl ? 'arrow-back' : 'arrow-forward'} variant="primary" flex={2.08} onPress={() => pressKey('next')} theme={theme} height={keyH} />
        </View>
      </View>
    </View>
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <CalculatorScreen />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Header
  header: { paddingHorizontal: 16, alignItems: 'center', gap: 8, marginBottom: 10 },
  iconBtn: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 14, fontWeight: '800' },
  seg: { borderRadius: 12, padding: 3, gap: 3 },
  segItem: { flex: 1, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segItemActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 },
  segText: { fontSize: 14, fontWeight: '700' },

  // Result display
  display: { marginHorizontal: 16, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 14, gap: 4 },
  displayTop: { justifyContent: 'space-between', alignItems: 'center' },
  displayLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  displayActions: { gap: 6 },
  displayBtn: { alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  displayBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  displayValueRow: { alignItems: 'flex-end', gap: 10 },
  displayValue: { color: '#fff', fontSize: 42, fontWeight: '800', letterSpacing: -1.5, flexShrink: 1, fontVariant: ['tabular-nums'] },
  displayStrike: { color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '600', textDecorationLine: 'line-through', marginBottom: 8 },
  displayPills: { flexWrap: 'wrap', gap: 6, alignItems: 'center', minHeight: 26 },
  savePill: { alignItems: 'center', gap: 4, backgroundColor: '#A7F3D0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  savePillText: { color: '#065F46', fontSize: 13, fontWeight: '700' },
  mutedPill: { backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  mutedPillText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  displayHint: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '500' },

  // Fields
  fieldList: { flex: 1, marginTop: 10 },
  fields: { paddingHorizontal: 16, paddingTop: FIELDS_PAD_TOP, paddingBottom: 8, gap: FIELDS_GAP },
  field: { minHeight: 54, borderRadius: 16, borderWidth: 2, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', gap: 10 },
  fieldIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  typePill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  typePillText: { fontSize: 13, fontWeight: '800' },
  fieldValueWrap: { flexDirection: 'row', alignItems: 'center', maxWidth: '45%' },
  fieldAffix: { fontSize: 18, fontWeight: '700', marginHorizontal: 2 },
  fieldValue: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'], flexShrink: 1 },
  caret: { width: 2, height: 24, borderRadius: 1, marginLeft: 2 },
  fieldAction: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addBtn: { height: 44, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6 },
  addBtnText: { fontSize: 14, fontWeight: '700' },

  // Presets strip
  strip: { height: 44, justifyContent: 'center' },
  stripInner: { paddingHorizontal: 16, gap: 6, alignItems: 'center' },
  stripHint: { fontSize: 13, fontWeight: '500', marginHorizontal: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '700' },

  // Keypad
  keypad: { paddingHorizontal: 12, paddingTop: 4, gap: 8 },
  keyRow: { flexDirection: 'row', gap: 8 },
  key: { borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  keyDigit: { fontSize: 26, fontWeight: '600' },
  keyFnText: { fontSize: 15, fontWeight: '700' },

  // Breakdown
  bdRow: { justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, gap: 12 },
  bdLabel: { fontSize: 14, fontWeight: '500', flexShrink: 1 },
  bdLabelBold: { fontSize: 16, fontWeight: '800', flexShrink: 1 },
  bdValue: { fontSize: 15, fontWeight: '700' },
  bdValueBold: { fontSize: 18, fontWeight: '800' },
  bdDivider: { height: 1, marginVertical: 6 },
  note: { gap: 8, padding: 12, borderRadius: 12, marginTop: 8, alignItems: 'flex-start' },
  noteText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },

  // Sheets
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 12 },
  sheetHandle: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 4 },
  sheetIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  sheetSubtitle: { fontSize: 14, textAlign: 'center', marginBottom: 8, lineHeight: 20 },
  sheetBtn: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  sheetBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  sheetGhostBtn: { height: 46, alignItems: 'center', justifyContent: 'center' },
  sheetGhostText: { fontSize: 15, fontWeight: '600' },
  scanningContainer: { alignItems: 'center', padding: 32, gap: 16 },
  scanningText: { fontSize: 16, fontWeight: '600' },
});
