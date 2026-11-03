import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet, Text, View, Pressable, ScrollView, StatusBar, Platform,
  useColorScheme, useWindowDimensions, Modal, Alert, ActivityIndicator, Animated,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

const VISION_API_KEY = 'AIzaSyCdzCuPTWjo1j4HXjr6ZIgKtlZNNM_7YxE';

// ─── Theme (iOS system colors) ────────────────────────────────────────────────
const lightTheme = {
  bg: '#F2F2F7', card: '#FFFFFF', fill: 'rgba(118,118,128,0.12)', separator: '#C6C6C8',
  label: '#000000', secondary: '#8A8A8E', tertiary: '#C7C7CC',
  tint: '#007AFF', tintSoft: 'rgba(0,122,255,0.08)', selected: '#E5E5EA',
  green: '#34C759', greenText: '#248A3D', red: '#FF3B30', teal: '#30B0C7', orange: '#FF9500', indigo: '#5856D6',
  tray: '#D1D3D9', key: '#FFFFFF', keyFn: '#ABB0BA', keyText: '#000000', keyShadow: 'rgba(0,0,0,0.3)',
};
const darkTheme = {
  bg: '#000000', card: '#1C1C1E', fill: 'rgba(118,118,128,0.24)', separator: '#38383A',
  label: '#FFFFFF', secondary: '#8D8D93', tertiary: '#48484A',
  tint: '#0A84FF', tintSoft: 'rgba(10,132,255,0.16)', selected: '#2C2C2E',
  green: '#30D158', greenText: '#30D158', red: '#FF453A', teal: '#40C8E0', orange: '#FF9F0A', indigo: '#5E5CE6',
  tray: '#161618', key: '#3A3A3C', keyFn: '#2C2C2E', keyText: '#FFFFFF', keyShadow: 'rgba(0,0,0,0.6)',
};

// ─── Translations ─────────────────────────────────────────────────────────────
const translations = {
  en: {
    appTitle: 'Shopping Calculator',
    simple: 'Simple', stacked: 'Stacked',
    price: 'Price', discount: 'Discount',
    discountN: (n) => (n === 1 ? 'First Discount' : 'Second Discount'),
    coupon: (n) => `Coupon ${n}`, addCoupon: 'Add Coupon', tax: 'Sales Tax',
    pctOrAmt: 'Tap % or $ to switch',
    finalPrice: 'Final Price', reset: 'Reset', details: 'Details', done: 'Done',
    youSave: (a, p) => `You save ${a} (${p}%)`,
    inclTax: (a) => `incl. ${a} tax`,
    enterPrice: 'Enter a price to begin',
    priceHint: 'Tap the camera to scan a price tag',
    breakdown: 'Breakdown', original: 'Original Price', subtotal: 'Subtotal', total: 'Total',
    effective: 'Effective Discount',
    stackedNote: (parts, eq) => `${parts} stacked = ${eq}% off. Discounts apply one after another, so they don't add up.`,
    next: 'Next', removeCoupon: 'Remove coupon', clearField: 'Clear', backspace: 'Delete',
    switchType: 'Switch between percent and amount',
    takePhoto: 'Take Photo', chooseGallery: 'Choose from Library', cancel: 'Cancel',
    scanning: 'Scanning…', scanFailed: 'Could not detect a price. Please enter it manually.',
    scanTitle: 'Scan Price Tag',
    scanSubtitle: 'Fill in the price and discount automatically from a photo.',
    language: 'Language', appearance: 'Appearance',
  },
  ar: {
    appTitle: 'حاسبة التسوق',
    simple: 'بسيط', stacked: 'خصم مركب',
    price: 'السعر', discount: 'الخصم',
    discountN: (n) => (n === 1 ? 'الخصم الأول' : 'الخصم الثاني'),
    coupon: (n) => `كوبون ${n}`, addCoupon: 'إضافة كوبون', tax: 'الضريبة',
    pctOrAmt: 'اضغط % أو $ للتبديل',
    finalPrice: 'السعر النهائي', reset: 'مسح الكل', details: 'التفاصيل', done: 'تم',
    youSave: (a, p) => `وفّرت ‎${a}‏ (‎${p}%‏)`,
    inclTax: (a) => `شامل ضريبة ‎${a}‏`,
    enterPrice: 'أدخل السعر للبدء',
    priceHint: 'اضغط على الكاميرا لمسح بطاقة السعر',
    breakdown: 'التفاصيل', original: 'السعر الأصلي', subtotal: 'المجموع قبل الضريبة', total: 'الإجمالي',
    effective: 'الخصم الفعلي',
    stackedNote: (parts, eq) => `${parts} متراكم = ${eq}% فعلياً. الخصومات تُطبَّق بالتسلسل ولا تُجمع.`,
    next: 'التالي', removeCoupon: 'حذف الكوبون', clearField: 'مسح', backspace: 'حذف',
    switchType: 'التبديل بين النسبة والمبلغ',
    takePhoto: 'التقاط صورة', chooseGallery: 'اختيار من المعرض', cancel: 'إلغاء',
    scanning: 'جارٍ المسح…', scanFailed: 'لم يتم اكتشاف السعر. يرجى الإدخال يدوياً.',
    scanTitle: 'مسح بطاقة السعر',
    scanSubtitle: 'املأ السعر والخصم تلقائياً من صورة.',
    language: 'اللغة', appearance: 'المظهر',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const parseNum = (val) => { const n = parseFloat(val); return isNaN(n) ? 0 : n; };
const fmt = (n) => n.toFixed(2);
const money = (n) => `$${fmt(n)}`;
const trimNum = (n) => String(Math.round(n * 100) / 100);

const MAX_COUPONS = 5;
const MAX_DIGITS = 8;
const DISCOUNT_PICKS = [10, 20, 25, 30, 40, 50, 70];
const TAX_PICKS = [5, 7, 8, 10, 15];
const HAIRLINE = StyleSheet.hairlineWidth;
const leadPad = (rtl) => (rtl ? { paddingRight: 16 } : { paddingLeft: 16 });
const trailPad = (rtl) => (rtl ? { paddingLeft: 16 } : { paddingRight: 16 });

// Light haptic feedback (no-op on web).
const haptic = {
  tap: () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); },
  select: () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); },
};

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

// ─── Action sheet for scanning ────────────────────────────────────────────────
const ScanSheet = ({ visible, onClose, onResult, theme, t }) => {
  const insets = useSafeAreaInsets();
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
        if (status !== 'granted') { Alert.alert('Permission needed', 'Photo library permission is required.'); return; }
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
  const ActionRow = ({ label, onPress, bold, last }) => (
    <Pressable onPress={onPress}
      style={({ pressed }) => [styles.actionRow, { backgroundColor: pressed ? theme.selected : 'transparent' },
        !last && { borderBottomWidth: HAIRLINE, borderBottomColor: theme.separator }]}>
      <Text style={[styles.actionText, { color: theme.tint, fontWeight: bold ? '600' : '400' }]}>{label}</Text>
    </Pressable>
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={scanning ? undefined : onClose}>
      <Pressable style={[styles.dim, { paddingBottom: insets.bottom + 8 }]} onPress={scanning ? undefined : onClose}>
        <Pressable onPress={() => {}} style={styles.actionWrap}>
          <View style={[styles.actionGroup, { backgroundColor: theme.card }]}>
            {scanning ? (
              <View style={styles.scanningContainer}>
                <ActivityIndicator size="large" color={theme.secondary} />
                <Text style={[styles.actionSubtitle, { color: theme.secondary }]}>{t.scanning}</Text>
              </View>
            ) : (
              <>
                <View style={[styles.actionHeader, { borderBottomColor: theme.separator }]}>
                  <Text style={[styles.actionTitle, { color: theme.secondary }]}>{t.scanTitle}</Text>
                  <Text style={[styles.actionSubtitle, { color: theme.secondary }]}>{t.scanSubtitle}</Text>
                </View>
                <ActionRow label={t.takePhoto} onPress={() => handleScan(true)} />
                <ActionRow label={t.chooseGallery} onPress={() => handleScan(false)} last />
              </>
            )}
          </View>
          {!scanning && (
            <View style={[styles.actionGroup, { backgroundColor: theme.card }]}>
              <ActionRow label={t.cancel} onPress={onClose} bold last />
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

// ─── Breakdown page sheet ─────────────────────────────────────────────────────
const DetailsSheet = ({ visible, onClose, theme, t, rtl, result, stepLabel, stackNote }) => {
  const insets = useSafeAreaInsets();
  const rows = [{ label: t.original, value: money(result.original) }];
  result.steps.filter((s) => s.kind !== 'tax').forEach((s) => rows.push({ label: stepLabel(s), value: `−${money(-s.amount)}`, color: theme.greenText }));
  const taxRows = [];
  if (result.tax > 0) {
    taxRows.push({ label: t.subtotal, value: money(result.subtotal) });
    result.steps.filter((s) => s.kind === 'tax').forEach((s) => taxRows.push({ label: stepLabel(s), value: `+${money(s.amount)}` }));
  }
  const totals = [{ label: t.total, value: money(result.final), bold: true }];
  if (result.savings > 0) totals.push({ label: t.effective, value: `${result.savingsPct.toFixed(1)}%`, color: theme.greenText });

  const Group = ({ items }) => (
    <View style={[styles.group, { backgroundColor: theme.card }]}>
      {items.map((r, i) => (
        <View key={i} style={[styles.detailRow, { flexDirection: rtl ? 'row-reverse' : 'row' },
          i < items.length - 1 && { borderBottomWidth: HAIRLINE, borderBottomColor: theme.separator }]}>
          <Text style={[styles.detailLabel, { color: theme.label, fontWeight: r.bold ? '600' : '400', textAlign: rtl ? 'right' : 'left' }]}>{r.label}</Text>
          <Text style={[styles.detailValue, { color: r.color || (r.bold ? theme.label : theme.secondary), fontWeight: r.bold ? '600' : '400' }]}>{r.value}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.dim}>
        <View style={[styles.pageSheet, { backgroundColor: theme.bg, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.grabber, { backgroundColor: theme.tertiary }]} />
          <View style={[styles.sheetNav, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <View style={styles.sheetNavSide} />
            <Text style={[styles.sheetNavTitle, { color: theme.label }]}>{t.breakdown}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={[styles.sheetNavSide, { alignItems: rtl ? 'flex-start' : 'flex-end' }]}>
              <Text style={[styles.navButton, { color: theme.tint, fontWeight: '600' }]}>{t.done}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 20, paddingHorizontal: 16, paddingTop: 8 }}>
            <Group items={rows} />
            {taxRows.length > 0 && <Group items={taxRows} />}
            <View>
              <Group items={totals} />
              {stackNote && <Text style={[styles.groupFooter, { color: theme.secondary, textAlign: rtl ? 'right' : 'left' }]}>{stackNote}</Text>}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ─── Controls ─────────────────────────────────────────────────────────────────
const Caret = ({ color }) => {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const driver = Platform.OS !== 'web';
    const blink = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: driver }),
      Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: driver }),
    ]));
    blink.start();
    return () => blink.stop();
  }, [opacity]);
  return <Animated.View style={[styles.caret, { backgroundColor: color, opacity }]} />;
};

const SegmentedControl = ({ options, value, onChange, theme, rtl }) => (
  <View style={[styles.seg, { backgroundColor: theme.fill, flexDirection: rtl ? 'row-reverse' : 'row' }]}>
    {options.map((o) => {
      const active = o.value === value;
      return (
        <Pressable key={o.value} onPress={() => { haptic.select(); onChange(o.value); }}
          accessibilityRole="button" accessibilityState={{ selected: active }}
          style={[styles.segItem, active && [styles.segItemActive, { backgroundColor: theme === darkTheme ? '#636366' : '#FFFFFF' }]]}>
          <Text style={[styles.segText, { color: theme.label, fontWeight: active ? '600' : '500' }]}>{o.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

const NavIcon = ({ name, onPress, theme, label }) => (
  <Pressable onPress={onPress} hitSlop={8} accessibilityLabel={label}
    style={({ pressed }) => [styles.navIcon, { backgroundColor: theme.fill, opacity: pressed ? 0.5 : 1 }]}>
    <Ionicons name={name} size={19} color={theme.tint} />
  </Pressable>
);

// One row of the inset grouped list.
const FieldRow = ({ field, active, last, onPress, onToggleType, onRemove, onScan, theme, rtl, t }) => {
  const row = rtl ? 'row-reverse' : 'row';
  const empty = field.value === '';
  const valueColor = active ? theme.tint : empty ? theme.tertiary : theme.label;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.listRow, leadPad(rtl), { flexDirection: row, backgroundColor: active ? theme.tintSoft : pressed ? theme.selected : 'transparent' }]}>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={t.removeCoupon}>
          <Ionicons name="remove-circle" size={22} color={theme.red} />
        </Pressable>
      )}
      <View style={[styles.rowIcon, { backgroundColor: field.color }]}>
        <Ionicons name={field.icon} size={16} color="#FFFFFF" />
      </View>
      <View style={[styles.rowBody, trailPad(rtl), { flexDirection: row }, !last && { borderBottomWidth: HAIRLINE, borderBottomColor: theme.separator }]}>
        <Text numberOfLines={1} style={[styles.rowLabel, { color: theme.label, textAlign: rtl ? 'right' : 'left' }]}>{field.label}</Text>
        {field.adjustable && (
          <Pressable onPress={onToggleType} hitSlop={6} accessibilityLabel={t.switchType}
            style={[styles.typeToggle, { backgroundColor: theme.fill }]}>
            {['pct', 'amt'].map((ty) => (
              <View key={ty} style={[styles.typeOpt, field.type === ty && { backgroundColor: theme === darkTheme ? '#636366' : '#FFFFFF' }]}>
                <Text style={[styles.typeOptText, { color: field.type === ty ? theme.label : theme.secondary }]}>{ty === 'pct' ? '%' : '$'}</Text>
              </View>
            ))}
          </Pressable>
        )}
        {/* Numbers always read left-to-right, even in Arabic. */}
        <View style={styles.rowValueWrap}>
          {field.type === 'amt' && <Text style={[styles.rowValue, { color: valueColor }]}>$</Text>}
          <Text numberOfLines={1} style={[styles.rowValue, { color: valueColor }]}>{empty ? '0' : field.value}</Text>
          {active && <Caret color={theme.tint} />}
          {field.type === 'pct' && <Text style={[styles.rowValue, { color: valueColor }]}>%</Text>}
        </View>
        {onScan && (
          <Pressable onPress={onScan} hitSlop={8} accessibilityLabel={t.scanTitle}>
            <Ionicons name="camera" size={22} color={theme.tint} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
};

const Key = ({ label, icon, onPress, onLongPress, theme, height, variant = 'digit', disabled, flex = 1, a11y }) => {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={() => { haptic.tap(); onPress(); }} onLongPress={onLongPress} disabled={disabled}
      accessibilityRole="button" accessibilityLabel={a11y || label}
      style={({ pressed }) => {
        const base = isPrimary ? theme.tint : variant === 'fn' ? theme.keyFn : theme.key;
        const down = isPrimary ? theme.tint : variant === 'fn' ? theme.key : theme.keyFn;
        return [styles.key, { flex, height, backgroundColor: pressed ? down : base, shadowColor: theme.keyShadow, opacity: disabled ? 0.4 : pressed && isPrimary ? 0.8 : 1 }];
      }}
    >
      {icon ? <Ionicons name={icon} size={22} color={isPrimary ? '#FFFFFF' : theme.keyText} /> : null}
      {label ? <Text style={[variant === 'digit' ? styles.keyDigit : styles.keyFnText, { color: isPrimary ? '#FFFFFF' : theme.keyText }]}>{label}</Text> : null}
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
  const toggleTheme = () => { haptic.select(); setIsDark((d) => { persist('theme', d ? 'light' : 'dark'); return !d; }); };
  const toggleLang = () => { haptic.select(); setLang((l) => { const n = l === 'en' ? 'ar' : 'en'; persist('lang', n); return n; }); };
  const changeMode = (m) => { setMode(m); persist('mode', m); };

  const theme = isDark ? darkTheme : lightTheme;
  const t = translations[lang];
  const rtl = lang === 'ar';
  const stacked = mode === 'stacked';
  const compact = height < 720;

  // Ordered list of editable fields; "Next" walks through it.
  const fields = useMemo(() => {
    const list = [{
      key: 'price', kind: 'price', label: t.price, icon: 'pricetag',
      color: theme.tint, value: form.price, type: 'amt', adjustable: false,
    }];
    form.discounts.slice(0, stacked ? 2 : 1).forEach((d, i) => list.push({
      key: `d${i}`, kind: 'discount', label: stacked ? t.discountN(i + 1) : t.discount, icon: 'pricetags',
      color: theme.green, value: d.value, type: d.type, adjustable: true,
    }));
    form.coupons.forEach((c, i) => list.push({
      key: `c${c.id}`, kind: 'coupon', label: t.coupon(i + 1), icon: 'ticket', id: c.id,
      color: theme.teal, value: c.value, type: c.type, adjustable: true,
    }));
    list.push({
      key: 'tax', kind: 'tax', label: t.tax, icon: 'receipt',
      color: theme.orange, value: form.tax, type: 'pct', adjustable: false,
    });
    return list;
  }, [form, stacked, t, theme]);

  const current = fields.find((f) => f.key === selected) || fields[0];
  const showAddCoupon = form.coupons.length < MAX_COUPONS;

  // If the selected field disappears (coupon removed, mode switched), fall back to price.
  useEffect(() => {
    if (!fields.some((f) => f.key === selected)) setSelected('price');
  }, [fields, selected]);

  // Keep the field being edited visible above the keypad. Positions come from measured
  // heights in render order (onLayout only reports size changes on web, so a stored y
  // can go stale when rows are inserted). Runs after layout settles.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!listRef.current) return;
      const order = [];
      fields.forEach((f) => {
        if (f.kind === 'tax' && showAddCoupon) order.push('add');
        order.push(f.key);
      });
      let y = 0;
      let l = null;
      for (const key of order) {
        const h = heights.current[key];
        if (h == null) return;
        if (key === current.key) { l = { y, height: h }; break; }
        y += h;
      }
      if (!l) return;
      if (l.y < scrollY.current) listRef.current.scrollTo({ y: Math.max(0, l.y), animated: true });
      else if (l.y + l.height > scrollY.current + viewH.current) {
        listRef.current.scrollTo({ y: l.y + l.height - viewH.current + LIST_PAD, animated: true });
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

  const selectField = (key) => { if (key !== selected) haptic.select(); setSelected(key); };

  const pressKey = (key) => {
    if (key === 'next') {
      const i = fields.findIndex((f) => f.key === current.key);
      setSelected(fields[(i + 1) % fields.length].key);
      return;
    }
    if (key === 'type') { if (current.adjustable) toggleType(current.key); return; }
    updateField(current.key, (adj) => ({ value: applyKey(adj.value, key, adj.type === 'pct') }));
  };

  const pickPreset = (n) => { haptic.select(); updateField(current.key, (adj) => ({ value: adj.value === String(n) ? '' : String(n) })); };

  const addCoupon = () => {
    haptic.select();
    const id = nextId.current++;
    setForm((f) => ({ ...f, coupons: [...f.coupons, { id, value: '', type: 'pct' }] }));
    setSelected(`c${id}`);
  };
  const removeCoupon = (id) => { haptic.tap(); setForm((f) => ({ ...f, coupons: f.coupons.filter((c) => c.id !== id) })); };
  const reset = () => { haptic.tap(); setForm(emptyForm()); setSelected('price'); };

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
  const pctDiscounts = result.steps.filter((s) => s.kind === 'discount' && s.type === 'pct');
  const stackNote = stacked && pctDiscounts.length >= 2
    ? t.stackedNote(
      pctDiscounts.map((s) => `${trimNum(s.value)}%`).join(' + '),
      (100 * (1 - pctDiscounts.reduce((acc, s) => acc * (1 - s.value / 100), 1))).toFixed(1),
    )
    : null;

  // Size keys to the screen so the keypad fits small and large phones.
  const keyH = Math.max(42, Math.min(52, Math.round(height * 0.058)));
  const row = rtl ? 'row-reverse' : 'row';
  const align = rtl ? 'right' : 'left';

  if (!loaded) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;

  const presets = current.kind === 'tax' ? TAX_PICKS
    : current.adjustable && current.type === 'pct' ? DISCOUNT_PICKS : null;

  const lastFieldKey = fields[fields.length - 1].key;

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg, paddingTop: insets.top + 6 }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />
      <ScanSheet visible={scanVisible} onClose={() => setScanVisible(false)} theme={theme} t={t}
        onResult={({ price, discount }) => {
          if (price) updateField('price', () => ({ value: price }));
          if (discount) updateField('d0', () => ({ value: discount, type: 'pct' }));
        }} />
      <DetailsSheet visible={detailsVisible} onClose={() => setDetailsVisible(false)} theme={theme} t={t} rtl={rtl}
        result={result} stepLabel={stepLabel} stackNote={stackNote} />

      {/* Large title with trailing buttons */}
      <View style={[styles.titleRow, { flexDirection: row }]}>
        <Text style={[styles.largeTitle, compact && styles.largeTitleCompact, { color: theme.label, textAlign: align }]}
          numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t.appTitle}</Text>
        <NavIcon name="globe-outline" onPress={toggleLang} theme={theme} label={t.language} />
        <NavIcon name={isDark ? 'sunny-outline' : 'moon-outline'} onPress={toggleTheme} theme={theme} label={t.appearance} />
      </View>

      <View style={styles.segWrap}>
        <SegmentedControl
          options={[{ value: 'simple', label: t.simple }, { value: 'stacked', label: t.stacked }]}
          value={mode} onChange={changeMode} theme={theme} rtl={rtl}
        />
      </View>

      {/* Result */}
      <View style={[styles.group, styles.resultCard, { backgroundColor: theme.card }, compact && { paddingVertical: 10 }]}>
        <View style={[styles.resultTop, { flexDirection: row }]}>
          <Text style={[styles.resultLabel, { color: theme.secondary }]}>{t.finalPrice}</Text>
          <Pressable onPress={reset} disabled={!canReset} hitSlop={10}>
            <Text style={[styles.navButton, { color: canReset ? theme.tint : theme.tertiary }]}>{t.reset}</Text>
          </Pressable>
        </View>
        <View style={[styles.resultValueRow, { flexDirection: row }]}>
          <Text style={[styles.resultValue, compact && { fontSize: 38 }, { color: theme.label }]} numberOfLines={1} adjustsFontSizeToFit>
            {money(result.final)}
          </Text>
          {result.savings > 0 && <Text style={[styles.resultStrike, { color: theme.secondary }]}>{money(result.original)}</Text>}
        </View>
        <View style={[styles.resultBottom, { flexDirection: row }]}>
          <View style={{ flex: 1 }}>
            {result.savings > 0 ? (
              <Text style={[styles.resultSave, { color: theme.greenText, textAlign: align }]} numberOfLines={1}>
                {t.youSave(money(result.savings), result.savingsPct.toFixed(1))}
              </Text>
            ) : (
              <Text style={[styles.resultSub, { color: theme.secondary, textAlign: align }]}>{t.enterPrice}</Text>
            )}
            {result.tax > 0 && !compact && (
              <Text style={[styles.resultSub, { color: theme.secondary, textAlign: align }]}>{t.inclTax(money(result.tax))}</Text>
            )}
          </View>
          <Pressable onPress={() => setDetailsVisible(true)} disabled={result.original <= 0} hitSlop={10}
            style={[styles.detailsBtn, { flexDirection: row }]}>
            <Text style={[styles.navButton, { color: result.original > 0 ? theme.tint : theme.tertiary }]}>{t.details}</Text>
            <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={16} color={result.original > 0 ? theme.tint : theme.tertiary} />
          </Pressable>
        </View>
      </View>

      {/* Inset grouped list of fields */}
      <ScrollView
        ref={listRef} style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}
        onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={32}
        onLayout={(e) => { viewH.current = e.nativeEvent.layout.height; }}
      >
        <View style={[styles.group, { backgroundColor: theme.card }]}>
          {fields.map((f) => (
            <React.Fragment key={f.key}>
              {f.kind === 'tax' && showAddCoupon && (
                <Pressable onPress={addCoupon} onLayout={(e) => { heights.current.add = e.nativeEvent.layout.height; }}
                  style={({ pressed }) => [styles.listRow, leadPad(rtl), { flexDirection: row, backgroundColor: pressed ? theme.selected : 'transparent' }]}>
                  <Ionicons name="add-circle" size={22} color={theme.green} />
                  <View style={[styles.rowBody, trailPad(rtl), { flexDirection: row, borderBottomWidth: HAIRLINE, borderBottomColor: theme.separator }]}>
                    <Text style={[styles.rowLabel, { color: theme.tint, textAlign: align }]}>{t.addCoupon}</Text>
                  </View>
                </Pressable>
              )}
              <View onLayout={(e) => { heights.current[f.key] = e.nativeEvent.layout.height; }}>
                <FieldRow
                  field={f} active={f.key === current.key} last={f.key === lastFieldKey} theme={theme} rtl={rtl} t={t}
                  onPress={() => selectField(f.key)}
                  onToggleType={() => { haptic.select(); setSelected(f.key); toggleType(f.key); }}
                  onScan={f.kind === 'price' ? () => setScanVisible(true) : null}
                  onRemove={f.kind === 'coupon' ? () => removeCoupon(f.id) : null}
                />
              </View>
            </React.Fragment>
          ))}
        </View>
      </ScrollView>

      {/* Keyboard tray: suggestion bar + keypad */}
      <View style={[styles.tray, { backgroundColor: theme.tray, paddingBottom: Math.max(insets.bottom, 8) }]}>
        <View style={styles.suggestBar}>
          {presets ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
              contentContainerStyle={[styles.suggestInner, { flexDirection: row }]}>
              {presets.map((n) => {
                const active = current.value === String(n);
                return (
                  <Pressable key={n} onPress={() => pickPreset(n)}
                    style={[styles.chip, { backgroundColor: active ? theme.tint : theme.key }]}>
                    <Text style={[styles.chipText, { color: active ? '#FFFFFF' : theme.keyText }]}>{n}%</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={[styles.suggestHint, { color: theme.secondary }]}>{current.adjustable ? t.pctOrAmt : t.priceHint}</Text>
          )}
        </View>
        <View style={styles.keypad}>
          <View style={styles.keyRow}>
            {['7', '8', '9'].map((k) => <Key key={k} label={k} onPress={() => pressKey(k)} theme={theme} height={keyH} />)}
            <Key icon="backspace-outline" variant="fn" onPress={() => pressKey('back')} onLongPress={() => pressKey('clear')} theme={theme} height={keyH} a11y={t.backspace} />
          </View>
          <View style={styles.keyRow}>
            {['4', '5', '6'].map((k) => <Key key={k} label={k} onPress={() => pressKey(k)} theme={theme} height={keyH} />)}
            <Key label="% / $" variant="fn" onPress={() => pressKey('type')} theme={theme} height={keyH} disabled={!current.adjustable} a11y={t.switchType} />
          </View>
          <View style={styles.keyRow}>
            {['1', '2', '3'].map((k) => <Key key={k} label={k} onPress={() => pressKey(k)} theme={theme} height={keyH} />)}
            <Key label={t.clearField} variant="fn" onPress={() => pressKey('clear')} theme={theme} height={keyH} />
          </View>
          <View style={styles.keyRow}>
            <Key label="." onPress={() => pressKey('.')} theme={theme} height={keyH} />
            <Key label="0" onPress={() => pressKey('0')} theme={theme} height={keyH} />
            <Key label={t.next} variant="primary" flex={2.06} onPress={() => pressKey('next')} theme={theme} height={keyH} />
          </View>
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

const LIST_PAD = 12;

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Navigation
  titleRow: { paddingHorizontal: 16, alignItems: 'center', gap: 10, minHeight: 44 },
  largeTitle: { flex: 1, fontSize: 26, fontWeight: '700', letterSpacing: 0.2 },
  largeTitleCompact: { fontSize: 22 },
  navIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  navButton: { fontSize: 17, fontWeight: '400' },
  segWrap: { paddingHorizontal: 16, marginTop: 8, marginBottom: 12 },
  seg: { borderRadius: 9, padding: 2 },
  segItem: { flex: 1, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  segItemActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 2 },
  segText: { fontSize: 13 },

  // Inset grouped
  group: { borderRadius: 12, overflow: 'hidden' },
  groupFooter: { fontSize: 13, lineHeight: 18, marginTop: 8, paddingHorizontal: 16 },

  // Result card
  resultCard: { marginHorizontal: 16, paddingHorizontal: 16, paddingVertical: 12 },
  resultTop: { justifyContent: 'space-between', alignItems: 'center' },
  resultLabel: { fontSize: 15, fontWeight: '400' },
  resultValueRow: { alignItems: 'baseline', gap: 10 },
  resultValue: { fontSize: 48, fontWeight: '700', letterSpacing: -0.5, flexShrink: 1, fontVariant: ['tabular-nums'] },
  resultStrike: { fontSize: 17, textDecorationLine: 'line-through', fontVariant: ['tabular-nums'] },
  resultBottom: { alignItems: 'center', gap: 8 },
  resultSave: { fontSize: 15, fontWeight: '600' },
  resultSub: { fontSize: 15 },
  detailsBtn: { alignItems: 'center', gap: 2 },

  // Field list
  list: { flex: 1, marginTop: 16 },
  listContent: { paddingHorizontal: 16, paddingBottom: LIST_PAD },
  listRow: { alignItems: 'center', gap: 12, minHeight: 48 },
  rowIcon: { width: 29, height: 29, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, alignSelf: 'stretch', alignItems: 'center', gap: 10, minHeight: 48 },
  rowLabel: { flex: 1, fontSize: 17 },
  rowValueWrap: { flexDirection: 'row', alignItems: 'center', maxWidth: '50%' },
  rowValue: { fontSize: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
  caret: { width: 2, height: 22, borderRadius: 1, marginHorizontal: 1 },
  typeToggle: { flexDirection: 'row', borderRadius: 7, padding: 2 },
  typeOpt: { width: 28, height: 24, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  typeOptText: { fontSize: 13, fontWeight: '600' },

  // Keyboard tray
  tray: { borderTopWidth: HAIRLINE, borderTopColor: 'rgba(0,0,0,0.2)' },
  suggestBar: { height: 44, justifyContent: 'center' },
  suggestInner: { paddingHorizontal: 8, gap: 6, alignItems: 'center' },
  suggestHint: { fontSize: 13, textAlign: 'center' },
  chip: { paddingHorizontal: 14, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 15, fontWeight: '500' },
  keypad: { paddingHorizontal: 6, gap: 8 },
  keyRow: { flexDirection: 'row', gap: 6 },
  key: {
    borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 1, shadowRadius: 0, elevation: 1,
  },
  keyDigit: { fontSize: 25, fontWeight: '400' },
  keyFnText: { fontSize: 16, fontWeight: '500' },

  // Sheets
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  actionWrap: { paddingHorizontal: 8, gap: 8 },
  actionGroup: { borderRadius: 14, overflow: 'hidden' },
  actionHeader: { paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center', gap: 2, borderBottomWidth: HAIRLINE },
  actionTitle: { fontSize: 13, fontWeight: '600' },
  actionSubtitle: { fontSize: 13, textAlign: 'center' },
  actionRow: { height: 57, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 20 },
  scanningContainer: { alignItems: 'center', padding: 28, gap: 12 },
  pageSheet: { borderTopLeftRadius: 12, borderTopRightRadius: 12, maxHeight: '85%' },
  grabber: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 6 },
  sheetNav: { height: 48, alignItems: 'center', paddingHorizontal: 16 },
  sheetNavSide: { width: 70 },
  sheetNavTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  detailRow: { minHeight: 44, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, gap: 12 },
  detailLabel: { fontSize: 17, flexShrink: 1 },
  detailValue: { fontSize: 17, fontVariant: ['tabular-nums'] },
});
