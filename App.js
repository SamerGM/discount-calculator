import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet, Text, View, TextInput, Pressable,
  ScrollView, StatusBar, KeyboardAvoidingView, Platform,
  useColorScheme, Modal, Alert, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

const VISION_API_KEY = 'AIzaSyCdzCuPTWjo1j4HXjr6ZIgKtlZNNM_7YxE';

// ─── Theme ────────────────────────────────────────────────────────────────────
const lightTheme = {
  bg: '#F4F5FB', surface: '#FFFFFF', surfaceAlt: '#F1F3F9', border: '#E4E7F0',
  text: '#111827', textSecondary: '#6B7280', textMuted: '#9CA3AF',
  primary: '#4F46E5', primarySoft: '#EEF2FF', hero: '#4F46E5',
  success: '#059669', successSoft: '#D1FAE5',
  danger: '#DC2626', dangerSoft: '#FEE2E2',
  coupon: '#0891B2', couponSoft: '#CFFAFE',
  tax: '#D97706', taxSoft: '#FEF3C7',
};
const darkTheme = {
  bg: '#0B0F1A', surface: '#151B2B', surfaceAlt: '#1C2438', border: '#273149',
  text: '#F3F4F6', textSecondary: '#9CA3AF', textMuted: '#6B7280',
  primary: '#818CF8', primarySoft: '#1E1B4B', hero: '#3730A3',
  success: '#34D399', successSoft: '#064E3B',
  danger: '#F87171', dangerSoft: '#450A0A',
  coupon: '#22D3EE', couponSoft: '#083344',
  tax: '#FBBF24', taxSoft: '#451A03',
};

// ─── Translations ─────────────────────────────────────────────────────────────
const translations = {
  en: {
    appTitle: 'Shopping Calculator', appSubtitle: 'Discounts, coupons & tax',
    simple: 'Simple', stacked: 'Stacked',
    price: 'Price', scan: 'Scan',
    discount: 'Discount', discounts: 'Discounts',
    discountN: (n) => (n === 1 ? 'First discount' : 'Second discount'),
    stackedHint: 'Applied one after another',
    coupons: 'Coupons', couponHint: 'Percentage or fixed amount',
    coupon: 'Coupon', addCoupon: 'Add coupon', noCoupons: 'No coupons added',
    tax: 'Sales tax', optional: 'Optional',
    breakdown: 'Breakdown', original: 'Original price', subtotal: 'Subtotal', total: 'Total',
    emptyBreakdown: 'Your breakdown will appear here',
    finalPrice: 'FINAL PRICE', reset: 'Reset',
    youSave: (a, p) => `You save ${a} (${p}%)`,
    inclTax: (a) => `incl. ${a} tax`,
    enterPrice: 'Enter a price to get started',
    effective: 'Effective discount',
    stackedNote: (parts, eq) => `${parts} stacked = ${eq}% off — discounts apply one after another, they don't add up.`,
    takePhoto: 'Take photo', chooseGallery: 'Choose from gallery', cancel: 'Cancel',
    scanning: 'Scanning image...', scanFailed: 'Could not detect a price. Please enter it manually.',
    scanTitle: 'Scan price tag',
    scanSubtitle: 'Take a photo or pick one from your gallery to auto-fill the price and discount.',
  },
  ar: {
    appTitle: 'حاسبة التسوق', appSubtitle: 'الخصومات والكوبونات والضريبة',
    simple: 'بسيط', stacked: 'خصم مركب',
    price: 'السعر', scan: 'تصوير',
    discount: 'الخصم', discounts: 'الخصومات',
    discountN: (n) => (n === 1 ? 'الخصم الأول' : 'الخصم الثاني'),
    stackedHint: 'تُطبَّق بالتسلسل',
    coupons: 'الكوبونات', couponHint: 'نسبة مئوية أو مبلغ ثابت',
    coupon: 'كوبون', addCoupon: 'إضافة كوبون', noCoupons: 'لا توجد كوبونات',
    tax: 'الضريبة', optional: 'اختياري',
    breakdown: 'التفاصيل', original: 'السعر الأصلي', subtotal: 'المجموع قبل الضريبة', total: 'الإجمالي',
    emptyBreakdown: 'ستظهر التفاصيل هنا',
    finalPrice: 'السعر النهائي', reset: 'مسح الكل',
    youSave: (a, p) => `وفّرت \u200E${a}\u200F (\u200E${p}%\u200F)`,
    inclTax: (a) => `شامل ضريبة \u200E${a}\u200F`,
    enterPrice: 'أدخل السعر للبدء',
    effective: 'الخصم الفعلي',
    stackedNote: (parts, eq) => `${parts} متراكم = ${eq}% فعلياً — الخصومات تُطبَّق بالتسلسل ولا تُجمع.`,
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
// Accept digits and a single decimal separator (comma is converted to a dot).
const sanitize = (v) => v.replace(/,/g, '.').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');

const QUICK_PCTS = [10, 20, 25, 30, 50, 70];
const MAX_COUPONS = 5;

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

const ScanModal = ({ visible, onClose, onResult, theme, t }) => {
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={scanning ? undefined : onClose}>
        <Pressable style={[styles.modalSheet, { backgroundColor: theme.surface }]} onPress={() => {}}>
          <View style={[styles.modalHandle, { backgroundColor: theme.border }]} />
          {scanning ? (
            <View style={styles.scanningContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.scanningText, { color: theme.text }]}>{t.scanning}</Text>
            </View>
          ) : (
            <>
              <View style={[styles.modalIcon, { backgroundColor: theme.primarySoft }]}>
                <Ionicons name="scan-outline" size={28} color={theme.primary} />
              </View>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{t.scanTitle}</Text>
              <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>{t.scanSubtitle}</Text>
              <Pressable style={({ pressed }) => [styles.modalBtn, { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 }]} onPress={() => handleScan(true)}>
                <Ionicons name="camera-outline" size={20} color="#fff" />
                <Text style={styles.modalBtnText}>{t.takePhoto}</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.modalBtn, { backgroundColor: theme.surfaceAlt, opacity: pressed ? 0.85 : 1 }]} onPress={() => handleScan(false)}>
                <Ionicons name="image-outline" size={20} color={theme.text} />
                <Text style={[styles.modalBtnText, { color: theme.text }]}>{t.chooseGallery}</Text>
              </Pressable>
              <Pressable style={styles.modalCancelBtn} onPress={onClose}>
                <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>{t.cancel}</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

// ─── UI building blocks ───────────────────────────────────────────────────────
const Segmented = ({ options, value, onChange, theme, rtl, small, accent }) => (
  <View style={[styles.seg, small && styles.segSmall, { backgroundColor: theme.surfaceAlt, flexDirection: rtl ? 'row-reverse' : 'row' }]}>
    {options.map((o) => {
      const active = o.value === value;
      return (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
          style={[small ? styles.segItemSmall : styles.segItem, active && [styles.segItemActive, { backgroundColor: small ? (accent || theme.primary) : theme.surface }]]}
        >
          <Text style={[styles.segText, small && styles.segTextSmall, { color: active ? (small ? '#fff' : theme.primary) : theme.textSecondary }]}>{o.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

const NumberInput = ({ value, onChange, placeholder, prefix, suffix, theme, rtl, accent }) => {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.inputBox, { flexDirection: rtl ? 'row-reverse' : 'row', backgroundColor: theme.surfaceAlt, borderColor: focused ? (accent || theme.primary) : 'transparent' }]}>
      {prefix ? <Text style={[styles.affix, { color: theme.textMuted }]}>{prefix}</Text> : null}
      <TextInput
        style={[styles.input, { color: theme.text, textAlign: rtl ? 'right' : 'left' }]}
        value={value}
        onChangeText={(v) => onChange(sanitize(v))}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        keyboardType="decimal-pad"
        maxLength={10}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {suffix ? <Text style={[styles.affix, { color: theme.textMuted }]}>{suffix}</Text> : null}
    </View>
  );
};

const typeOptions = [{ value: 'pct', label: '%' }, { value: 'amt', label: '$' }];

// Value input with a % / $ switch and optional quick-pick chips.
const AdjustmentInput = ({ adj, onChange, theme, rtl, accent, quickPicks }) => (
  <View style={{ gap: 10 }}>
    <View style={[styles.adjRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
      <View style={{ flex: 1 }}>
        <NumberInput
          value={adj.value}
          onChange={(v) => onChange({ ...adj, value: v })}
          placeholder={adj.type === 'pct' ? '0' : '0.00'}
          prefix={adj.type === 'amt' ? '$' : null}
          suffix={adj.type === 'pct' ? '%' : null}
          theme={theme} rtl={rtl} accent={accent}
        />
      </View>
      <Segmented small options={typeOptions} value={adj.type} onChange={(type) => onChange({ ...adj, type })} theme={theme} rtl={rtl} accent={accent} />
    </View>
    {quickPicks && adj.type === 'pct' && (
      <View style={[styles.chips, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        {QUICK_PCTS.map((n) => {
          const active = adj.value === String(n);
          return (
            <Pressable
              key={n}
              onPress={() => onChange({ ...adj, value: active ? '' : String(n) })}
              style={[styles.chip, { backgroundColor: active ? accent || theme.primary : theme.surfaceAlt }]}
            >
              <Text style={[styles.chipText, { color: active ? '#fff' : theme.textSecondary }]}>{n}%</Text>
            </Pressable>
          );
        })}
      </View>
    )}
  </View>
);

const Section = ({ icon, title, hint, color, soft, theme, rtl, right, children }) => (
  <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <View style={[styles.cardHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
      <View style={[styles.iconBadge, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardTitle, { color: theme.text, textAlign: rtl ? 'right' : 'left' }]}>{title}</Text>
        {hint ? <Text style={[styles.cardHint, { color: theme.textMuted, textAlign: rtl ? 'right' : 'left' }]}>{hint}</Text> : null}
      </View>
      {right}
    </View>
    {children}
  </View>
);

const Hero = ({ theme, t, rtl, result, onReset, canReset }) => {
  const row = { flexDirection: rtl ? 'row-reverse' : 'row' };
  return (
    <View style={[styles.hero, { backgroundColor: theme.hero }]}>
      <View style={[row, styles.heroTop]}>
        <Text style={styles.heroLabel}>{t.finalPrice}</Text>
        <Pressable
          onPress={onReset} disabled={!canReset} hitSlop={8}
          style={({ pressed }) => [row, styles.resetBtn, { opacity: !canReset ? 0.4 : pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="refresh" size={14} color="#fff" />
          <Text style={styles.resetText}>{t.reset}</Text>
        </Pressable>
      </View>
      <View style={[row, styles.heroValueRow]}>
        <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>{money(result.final)}</Text>
        {result.savings > 0 && <Text style={styles.heroStrike}>{money(result.original)}</Text>}
      </View>
      <View style={[row, styles.heroPills]}>
        {result.savings > 0 ? (
          <View style={[row, styles.heroPill]}>
            <Ionicons name="trending-down" size={14} color="#065F46" />
            <Text style={styles.heroPillText}>{t.youSave(money(result.savings), result.savingsPct.toFixed(1))}</Text>
          </View>
        ) : (
          <Text style={styles.heroHint}>{t.enterPrice}</Text>
        )}
        {result.tax > 0 && (
          <View style={styles.heroPillMuted}>
            <Text style={styles.heroPillMutedText}>{t.inclTax(money(result.tax))}</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const BreakdownRow = ({ label, value, color, theme, rtl, bold }) => (
  <View style={[styles.bdRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
    <Text style={[bold ? styles.bdLabelBold : styles.bdLabel, { color: bold ? theme.text : theme.textSecondary, textAlign: rtl ? 'right' : 'left' }]}>{label}</Text>
    <Text style={[bold ? styles.bdValueBold : styles.bdValue, { color: color || theme.text }]}>{value}</Text>
  </View>
);

// ─── Calculator (shared by both tabs) ─────────────────────────────────────────
const emptyDiscounts = (mode) => (mode === 'stacked'
  ? [{ value: '', type: 'pct' }, { value: '', type: 'pct' }]
  : [{ value: '', type: 'pct' }]);

const Calculator = ({ mode, theme, t, rtl, visible }) => {
  const [price, setPrice] = useState('');
  const [discounts, setDiscounts] = useState(() => emptyDiscounts(mode));
  const [coupons, setCoupons] = useState([]);
  const [tax, setTax] = useState('');
  const [scanVisible, setScanVisible] = useState(false);
  const nextId = useRef(1);

  const result = useMemo(() => calculate({ price, discounts, coupons, tax }), [price, discounts, coupons, tax]);
  const canReset = !!(price || tax || coupons.length || discounts.some((d) => d.value));
  const stacked = mode === 'stacked';

  const reset = () => { setPrice(''); setDiscounts(emptyDiscounts(mode)); setCoupons([]); setTax(''); };
  const updateDiscount = (i, adj) => setDiscounts((ds) => ds.map((d, j) => (j === i ? adj : d)));
  const addCoupon = () => setCoupons((cs) => [...cs, { id: nextId.current++, value: '', type: 'pct' }]);
  const updateCoupon = (id, adj) => setCoupons((cs) => cs.map((c) => (c.id === id ? adj : c)));
  const removeCoupon = (id) => setCoupons((cs) => cs.filter((c) => c.id !== id));

  const adjText = (s) => (s.type === 'pct' ? `${trimNum(s.value)}%` : money(s.value));
  const stepLabel = (s) => {
    if (s.kind === 'discount') return `${stacked ? t.discountN(s.index + 1) : t.discount} (${adjText(s)})`;
    if (s.kind === 'coupon') return `${t.coupon} ${s.index + 1} (${adjText(s)})`;
    return `${t.tax} (${trimNum(s.value)}%)`;
  };
  const stepColor = (s) => (s.kind === 'tax' ? theme.tax : s.kind === 'coupon' ? theme.coupon : theme.success);

  const pctDiscounts = result.steps.filter((s) => s.kind === 'discount' && s.type === 'pct');
  const showStackNote = stacked && pctDiscounts.length >= 2 && result.original > 0;
  const stackParts = pctDiscounts.map((s) => `${trimNum(s.value)}%`).join(' + ');
  const stackEq = pctDiscounts.length >= 2
    ? (100 * (1 - pctDiscounts.reduce((acc, s) => acc * (1 - s.value / 100), 1))).toFixed(1)
    : '0';
  const row = { flexDirection: rtl ? 'row-reverse' : 'row' };

  return (
    <View style={[styles.calc, { display: visible ? 'flex' : 'none' }]}>
      <ScanModal
        visible={scanVisible} onClose={() => setScanVisible(false)} theme={theme} t={t}
        onResult={({ price: pr, discount: di }) => {
          if (pr) setPrice(pr);
          if (di) updateDiscount(0, { value: di, type: 'pct' });
        }}
      />

      <Hero theme={theme} t={t} rtl={rtl} result={result} onReset={reset} canReset={canReset} />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Price */}
        <Section icon="pricetag-outline" title={t.price} color={theme.primary} soft={theme.primarySoft} theme={theme} rtl={rtl}
          right={(
            <Pressable onPress={() => setScanVisible(true)} style={({ pressed }) => [row, styles.scanBtn, { backgroundColor: theme.primarySoft, opacity: pressed ? 0.7 : 1 }]}>
              <Ionicons name="camera-outline" size={16} color={theme.primary} />
              <Text style={[styles.scanText, { color: theme.primary }]}>{t.scan}</Text>
            </Pressable>
          )}
        >
          <NumberInput value={price} onChange={setPrice} placeholder="0.00" prefix="$" theme={theme} rtl={rtl} />
        </Section>

        {/* Discount(s) */}
        <Section icon="pricetags-outline" title={stacked ? t.discounts : t.discount} hint={stacked ? t.stackedHint : null}
          color={theme.success} soft={theme.successSoft} theme={theme} rtl={rtl}>
          {discounts.map((d, i) => (
            <View key={i} style={{ gap: 8 }}>
              {stacked && <Text style={[styles.subLabel, { color: theme.textSecondary, textAlign: rtl ? 'right' : 'left' }]}>{t.discountN(i + 1)}</Text>}
              <AdjustmentInput adj={d} onChange={(adj) => updateDiscount(i, adj)} theme={theme} rtl={rtl} accent={theme.success} quickPicks />
            </View>
          ))}
        </Section>

        {/* Coupons */}
        <Section icon="ticket-outline" title={t.coupons} hint={t.couponHint} color={theme.coupon} soft={theme.couponSoft} theme={theme} rtl={rtl}>
          {coupons.map((c, i) => (
            <View key={c.id} style={[row, styles.couponRow]}>
              <View style={[styles.couponBadge, { backgroundColor: theme.couponSoft }]}>
                <Text style={[styles.couponBadgeText, { color: theme.coupon }]}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <AdjustmentInput adj={c} onChange={(adj) => updateCoupon(c.id, adj)} theme={theme} rtl={rtl} accent={theme.coupon} />
              </View>
              <Pressable onPress={() => removeCoupon(c.id)} hitSlop={8} accessibilityLabel="Remove coupon"
                style={({ pressed }) => [styles.removeBtn, { backgroundColor: theme.dangerSoft, opacity: pressed ? 0.7 : 1 }]}>
                <Ionicons name="close" size={18} color={theme.danger} />
              </Pressable>
            </View>
          ))}
          {coupons.length < MAX_COUPONS && (
            <Pressable onPress={addCoupon} style={({ pressed }) => [row, styles.addBtn, { borderColor: theme.coupon, opacity: pressed ? 0.7 : 1 }]}>
              <Ionicons name="add" size={18} color={theme.coupon} />
              <Text style={[styles.addBtnText, { color: theme.coupon }]}>{t.addCoupon}</Text>
            </Pressable>
          )}
        </Section>

        {/* Tax */}
        <Section icon="receipt-outline" title={t.tax} hint={t.optional} color={theme.tax} soft={theme.taxSoft} theme={theme} rtl={rtl}>
          <NumberInput value={tax} onChange={setTax} placeholder="0" suffix="%" theme={theme} rtl={rtl} accent={theme.tax} />
        </Section>

        {/* Breakdown */}
        <Section icon="list-outline" title={t.breakdown} color={theme.textSecondary} soft={theme.surfaceAlt} theme={theme} rtl={rtl}>
          {result.original > 0 ? (
            <View style={{ gap: 2 }}>
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
              {showStackNote && (
                <View style={[row, styles.note, { backgroundColor: theme.primarySoft }]}>
                  <Ionicons name="information-circle-outline" size={16} color={theme.primary} />
                  <Text style={[styles.noteText, { color: theme.primary, textAlign: rtl ? 'right' : 'left' }]}>{t.stackedNote(stackParts, stackEq)}</Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={[styles.emptyHint, { color: theme.textMuted }]}>{t.emptyBreakdown}</Text>
          )}
        </Section>
      </ScrollView>
    </View>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────
const TOP_INSET = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 56;

export default function App() {
  const systemScheme = useColorScheme();
  const [isDark, setIsDark] = useState(null);
  const [lang, setLang] = useState('en');
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState('simple');

  useEffect(() => {
    const loadPrefs = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('theme');
        const savedLang = await AsyncStorage.getItem('lang');
        setIsDark(savedTheme !== null ? savedTheme === 'dark' : systemScheme === 'dark');
        if (savedLang !== null && translations[savedLang]) setLang(savedLang);
      } catch (e) { setIsDark(systemScheme === 'dark'); }
      setLoaded(true);
    };
    loadPrefs();
  }, []);

  const handleThemeToggle = async () => {
    const newVal = !isDark;
    setIsDark(newVal);
    try { await AsyncStorage.setItem('theme', newVal ? 'dark' : 'light'); } catch (e) {}
  };

  const handleLangToggle = async () => {
    const newLang = lang === 'en' ? 'ar' : 'en';
    setLang(newLang);
    try { await AsyncStorage.setItem('lang', newLang); } catch (e) {}
  };

  const theme = isDark ? darkTheme : lightTheme;
  const rtl = lang === 'ar';
  const t = translations[lang];

  if (!loaded) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />
      <View style={[styles.header, { paddingTop: TOP_INSET }]}>
        <View style={[styles.headerRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <View style={[styles.logo, { backgroundColor: theme.primary }]}>
            <Ionicons name="pricetags" size={18} color="#fff" />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.headerTitle, { color: theme.text, textAlign: rtl ? 'right' : 'left' }]}>{t.appTitle}</Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary, textAlign: rtl ? 'right' : 'left' }]}>{t.appSubtitle}</Text>
          </View>
          <Pressable onPress={handleLangToggle} accessibilityLabel="Change language"
            style={({ pressed }) => [styles.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[styles.iconBtnText, { color: theme.text }]}>{lang === 'en' ? 'ع' : 'EN'}</Text>
          </Pressable>
          <Pressable onPress={handleThemeToggle} accessibilityLabel="Toggle dark mode"
            style={({ pressed }) => [styles.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.7 : 1 }]}>
            <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={18} color={theme.text} />
          </Pressable>
        </View>
        <Segmented
          options={[{ value: 'simple', label: t.simple }, { value: 'stacked', label: t.stacked }]}
          value={activeTab} onChange={setActiveTab} theme={theme} rtl={rtl}
        />
      </View>
      {/* Both tabs stay mounted so switching tabs keeps what you typed. */}
      <Calculator mode="simple" theme={theme} t={t} rtl={rtl} visible={activeTab === 'simple'} />
      <Calculator mode="stacked" theme={theme} t={t} rtl={rtl} visible={activeTab === 'stacked'} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // Header
  header: { paddingHorizontal: 16, paddingBottom: 12, gap: 14 },
  headerRow: { alignItems: 'center', gap: 10 },
  logo: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  headerSubtitle: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 14, fontWeight: '800' },

  // Segmented control
  seg: { borderRadius: 14, padding: 4, gap: 4 },
  segSmall: { borderRadius: 12, padding: 3, gap: 2 },
  segItem: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  segItemSmall: { width: 40, height: 46, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segItemActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 },
  segText: { fontSize: 14, fontWeight: '700' },
  segTextSmall: { fontSize: 15, fontWeight: '800' },

  // Hero
  calc: { flex: 1 },
  hero: {
    marginHorizontal: 16, marginBottom: 4, borderRadius: 22, padding: 18, gap: 6,
    shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 6,
  },
  heroTop: { justifyContent: 'space-between', alignItems: 'center' },
  heroLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  resetBtn: { alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  resetText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  heroValueRow: { alignItems: 'flex-end', gap: 10 },
  heroValue: { color: '#fff', fontSize: 44, fontWeight: '800', letterSpacing: -1.5, flexShrink: 1 },
  heroStrike: { color: 'rgba(255,255,255,0.6)', fontSize: 16, fontWeight: '600', textDecorationLine: 'line-through', marginBottom: 9 },
  heroPills: { flexWrap: 'wrap', gap: 6, alignItems: 'center', minHeight: 26 },
  heroPill: { alignItems: 'center', gap: 4, backgroundColor: '#A7F3D0', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  heroPillText: { color: '#065F46', fontSize: 13, fontWeight: '700' },
  heroPillMuted: { backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  heroPillMutedText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  heroHint: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '500' },

  // Cards
  scroll: { padding: 16, paddingBottom: 40, gap: 12 },
  card: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 14 },
  cardHeader: { alignItems: 'center', gap: 10 },
  iconBadge: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardHint: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  subLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },

  // Inputs
  inputBox: { height: 52, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, alignItems: 'center', gap: 6 },
  input: { flex: 1, minWidth: 0, height: '100%', fontSize: 20, fontWeight: '700', paddingVertical: 0, ...(Platform.OS === 'web' ? { outlineStyle: 'none', width: 0 } : null) },
  affix: { fontSize: 18, fontWeight: '700' },
  adjRow: { alignItems: 'center', gap: 8 },
  chips: { flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  chipText: { fontSize: 13, fontWeight: '700' },
  scanBtn: { alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  scanText: { fontSize: 13, fontWeight: '700' },

  // Coupons
  couponRow: { alignItems: 'center', gap: 8 },
  couponBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  couponBadgeText: { fontSize: 12, fontWeight: '800' },
  removeBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addBtn: { height: 46, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6 },
  addBtnText: { fontSize: 14, fontWeight: '700' },

  // Breakdown
  bdRow: { justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, gap: 12 },
  bdLabel: { fontSize: 14, fontWeight: '500', flexShrink: 1 },
  bdLabelBold: { fontSize: 16, fontWeight: '800', flexShrink: 1 },
  bdValue: { fontSize: 15, fontWeight: '700' },
  bdValueBold: { fontSize: 18, fontWeight: '800' },
  bdDivider: { height: 1, marginVertical: 6 },
  note: { gap: 8, padding: 12, borderRadius: 12, marginTop: 8, alignItems: 'flex-start' },
  noteText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  emptyHint: { textAlign: 'center', fontSize: 14, paddingVertical: 8 },

  // Scan modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36, gap: 12, alignItems: 'stretch' },
  modalHandle: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 8 },
  modalIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  modalSubtitle: { fontSize: 14, textAlign: 'center', marginBottom: 8, lineHeight: 20 },
  modalBtn: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  modalBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  modalCancelBtn: { height: 46, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '600' },
  scanningContainer: { alignItems: 'center', padding: 32, gap: 16 },
  scanningText: { fontSize: 16, fontWeight: '600' },
});
