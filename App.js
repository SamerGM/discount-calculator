import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet, Text, View, Pressable, ScrollView, StatusBar, Platform, TextInput, KeyboardAvoidingView,
  useColorScheme, useWindowDimensions, Dimensions, Modal, Alert, ActivityIndicator, Animated, I18nManager, AccessibilityInfo, Easing,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, LinearGradient, Stop, Rect, Path, Circle, G } from 'react-native-svg';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts, Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { extractTextFromImage, isSupported as ocrSupported } from 'expo-text-extractor';
import { Ionicons } from '@expo/vector-icons';

// The app lays out Arabic itself (row-reverse + right-aligned text). If the phone's
// system language is RTL, Android would mirror everything a second time, flipping
// the keypad. Turn system mirroring off (applies from the next launch) and, until
// then, compensate so rows still read in the intended direction.
// Keep the system splash up until the welcome screen has drawn its first frame.
SplashScreen.preventAutoHideAsync().catch(() => {});

I18nManager.allowRTL(false);
I18nManager.forceRTL(false);
const SYSTEM_RTL = I18nManager.isRTL === true; // undefined on web
const flow = (rtl) => ((rtl !== SYSTEM_RTL) ? 'row-reverse' : 'row');

// ─── Countries: currency and default VAT / sales tax ──────────────────────────
// vat = standard rate added on top by default; the shopper can edit or clear it.
const COUNTRIES = [
  { id: 'AE', en: 'United Arab Emirates', ar: 'الإمارات', cur: 'AED', sym: 'AED', dec: 2, vat: 5 },
  { id: 'SA', en: 'Saudi Arabia', ar: 'السعودية', cur: 'SAR', sym: 'SAR', dec: 2, vat: 15 },
  { id: 'QA', en: 'Qatar', ar: 'قطر', cur: 'QAR', sym: 'QAR', dec: 2, vat: 0 },
  { id: 'KW', en: 'Kuwait', ar: 'الكويت', cur: 'KWD', sym: 'KWD', dec: 3, vat: 0 },
  { id: 'BH', en: 'Bahrain', ar: 'البحرين', cur: 'BHD', sym: 'BHD', dec: 3, vat: 10 },
  { id: 'OM', en: 'Oman', ar: 'عُمان', cur: 'OMR', sym: 'OMR', dec: 3, vat: 5 },
  { id: 'EG', en: 'Egypt', ar: 'مصر', cur: 'EGP', sym: 'EGP', dec: 2, vat: 14 },
  { id: 'JO', en: 'Jordan', ar: 'الأردن', cur: 'JOD', sym: 'JOD', dec: 3, vat: 16 },
  { id: 'LB', en: 'Lebanon', ar: 'لبنان', cur: 'LBP', sym: 'LBP', dec: 0, vat: 11 },
  { id: 'MA', en: 'Morocco', ar: 'المغرب', cur: 'MAD', sym: 'MAD', dec: 2, vat: 20 },
  { id: 'IQ', en: 'Iraq', ar: 'العراق', cur: 'IQD', sym: 'IQD', dec: 0, vat: 0 },
  { id: 'GB', en: 'United Kingdom', ar: 'المملكة المتحدة', cur: 'GBP', sym: '£', dec: 2, vat: 20 },
  { id: 'EU', en: 'Eurozone', ar: 'منطقة اليورو', cur: 'EUR', sym: '€', dec: 2, vat: 20, note: 'varies' },
  { id: 'TR', en: 'Turkey', ar: 'تركيا', cur: 'TRY', sym: '₺', dec: 2, vat: 20 },
  { id: 'US', en: 'United States', ar: 'الولايات المتحدة', cur: 'USD', sym: '$', dec: 2, vat: 0, note: 'state' },
  { id: 'IN', en: 'India', ar: 'الهند', cur: 'INR', sym: '₹', dec: 2, vat: 18, note: 'varies' },
];
// Used until the shopper picks a country (or after Skip): plain numbers, no tax.
const NO_REGION = { id: '', cur: '', sym: '', dec: 2, vat: 0 };

// ─── Theme: frosted panels over an aurora gradient ────────────────────────────
// The background is a static gradient, so translucent fills give the frosted look
// without a live blur (which is slow on many Android phones).
const darkTheme = {
  dark: true,
  base: '#1E1744', blobA: '#FF7A59', blobB: '#7B5CFF', blobC: '#00C2A8',
  text: '#FFFFFF', textSecondary: 'rgba(255,255,255,0.74)', textMuted: 'rgba(255,255,255,0.45)',
  glass: 'rgba(255,255,255,0.13)', glassStrong: 'rgba(255,255,255,0.26)', glassBorder: 'rgba(255,255,255,0.26)',
  separator: 'rgba(255,255,255,0.14)', solid: '#FFFFFF', onSolid: '#241B4D',
  save: '#B9FFE9', danger: '#FF9C9C',
  dotPrice: '#FFFFFF', dotDiscount: '#B9FFE9', dotCoupon: '#FFD36E', dotTax: '#FFA3BE',
  tray: 'rgba(14,9,38,0.45)', key: 'rgba(255,255,255,0.12)', keyFn: 'rgba(255,255,255,0.22)', keyDown: 'rgba(255,255,255,0.32)',
  sheet: '#2A2160', dim: 'rgba(8,5,24,0.55)',
};
const lightTheme = {
  dark: false,
  base: '#EEF0FF', blobA: '#FFB199', blobB: '#B9A8FF', blobC: '#8FF0DF',
  text: '#1B1640', textSecondary: 'rgba(27,22,64,0.68)', textMuted: 'rgba(27,22,64,0.38)',
  glass: 'rgba(255,255,255,0.5)', glassStrong: 'rgba(255,255,255,0.85)', glassBorder: 'rgba(255,255,255,0.85)',
  separator: 'rgba(27,22,64,0.09)', solid: '#1B1640', onSolid: '#FFFFFF',
  save: '#0B7F67', danger: '#D23C3C',
  dotPrice: '#5B4FE0', dotDiscount: '#12A587', dotCoupon: '#E0A100', dotTax: '#E2557E',
  tray: 'rgba(255,255,255,0.42)', key: 'rgba(255,255,255,0.72)', keyFn: 'rgba(255,255,255,0.38)', keyDown: 'rgba(255,255,255,0.95)',
  sheet: '#F7F6FF', dim: 'rgba(27,22,64,0.35)',
};

// ─── Translations ─────────────────────────────────────────────────────────────
const translations = {
  en: {
    appTitle: 'Shopping Calculator',
    welcomeLines: ['Shop smart.', 'Know the real price.', 'Hassle-free.'],
    simple: 'Simple', stacked: 'Stacked',
    price: 'Price', discount: 'Discount',
    discountN: (n) => (n === 1 ? 'First discount' : 'Second discount'),
    coupon: (n) => `Coupon ${n}`, addCoupon: 'Add coupon', tax: 'VAT / tax',
    pctOrAmt: (s) => `Tap % or ${s} to switch`, amt: 'Amt',
    deal: 'Multi-buy deal', dealAdd: 'Add a deal',
    dealTypes: { none: 'No deal', free: 'Get free', pct: 'Get % off' },
    dealFree: (b, g) => `Buy ${b} get ${g} free`,
    dealPct: (b, g, p) => `Buy ${b}, get ${g} at ${p}% off`,
    buy: 'Buy', get: 'Get', dealOff: 'Discount on those', dealHint: 'The price you enter is for one item.',
    forItems: (n, each) => `for ${n} items · ${each} each`, perItem: 'Per item',
    regionTitle: 'Where are you shopping?',
    regionSub: 'Sets the currency and the VAT rate. You can change it any time.',
    skip: 'Skip', other: 'Other (enter manually)',
    vatLabel: (v) => (v > 0 ? `VAT ${v}%` : 'No VAT'),
    noteVaries: 'rate varies', noteState: 'add your state tax',
    confirmTitle: 'Save as your default?',
    confirmSub: "If you save it, we won't ask again. Change it any time with the currency button.",
    saveDefault: 'Save as default', justOnce: 'Just this time', back: 'Back',
    currencyCode: 'Currency code (e.g. AED)', vatRate: 'VAT / tax %', continueBtn: 'Continue',
    currencyBtn: 'Currency and VAT',
    cleared: 'All fields cleared', undo: 'Undo',
    scanUnavailable: 'Scanning works in the app on your phone.',
    finalPrice: 'FINAL PRICE', reset: 'Reset', details: 'Details', done: 'Done',
    youSave: (a, p) => `You save ${a} · ${p}%`,
    inclTax: (a) => `incl. ${a} tax`,
    enterPrice: 'Enter a price to begin',
    priceHint: 'Tap the camera to scan a price tag',
    breakdown: 'Breakdown', original: 'Original price', subtotal: 'Subtotal', total: 'Total',
    effective: 'Effective discount',
    stackedNote: (parts, eq) => `${parts} stacked = ${eq}% off. Discounts apply one after another, so they don't add up.`,
    next: 'Next', removeCoupon: 'Remove coupon', clearField: 'C', backspace: 'Delete',
    switchType: 'Switch between percent and amount',
    takePhoto: 'Take photo', chooseGallery: 'Choose from gallery', cancel: 'Cancel',
    scanning: 'Scanning…', scanFailed: 'Could not detect a price. Please enter it manually.',
    scanTitle: 'Scan price tag',
    scanSubtitle: 'Fill in the price and discount automatically from a photo.',
    language: 'Language', appearance: 'Appearance',
  },
  ar: {
    appTitle: 'حاسبة التسوق',
    welcomeLines: ['تسوّق بذكاء.', 'اعرف السعر الحقيقي.', 'بلا عناء.'],
    simple: 'بسيط', stacked: 'خصم مركب',
    price: 'السعر', discount: 'الخصم',
    discountN: (n) => (n === 1 ? 'الخصم الأول' : 'الخصم الثاني'),
    coupon: (n) => `كوبون ${n}`, addCoupon: 'إضافة كوبون', tax: 'الضريبة',
    pctOrAmt: (s) => `اضغط % أو ${s} للتبديل`, amt: 'مبلغ',
    deal: 'عرض الشراء المتعدد', dealAdd: 'إضافة عرض',
    dealTypes: { none: 'بدون عرض', free: 'مجاناً', pct: 'بخصم %' },
    dealFree: (b, g) => `اشترِ ${b} واحصل على ${g} مجاناً`,
    dealPct: (b, g, p) => `اشترِ ${b} واحصل على ${g} بخصم ${p}%`,
    buy: 'اشترِ', get: 'احصل على', dealOff: 'الخصم عليها', dealHint: 'السعر الذي تدخله لقطعة واحدة.',
    forItems: (n, each) => `لـ ${n} قطع · ‎${each}‏ للقطعة`, perItem: 'سعر القطعة',
    regionTitle: 'أين تتسوق؟',
    regionSub: 'يحدد العملة ونسبة الضريبة. يمكنك تغييره في أي وقت.',
    skip: 'تخطي', other: 'أخرى (إدخال يدوي)',
    vatLabel: (v) => (v > 0 ? `ضريبة ${v}%` : 'بدون ضريبة'),
    noteVaries: 'النسبة تختلف', noteState: 'أضف ضريبة ولايتك',
    confirmTitle: 'حفظ كإعداد افتراضي؟',
    confirmSub: 'عند الحفظ لن نسألك مرة أخرى. يمكنك تغييره في أي وقت من زر العملة.',
    saveDefault: 'حفظ كافتراضي', justOnce: 'هذه المرة فقط', back: 'رجوع',
    currencyCode: 'رمز العملة (مثل AED)', vatRate: 'نسبة الضريبة %', continueBtn: 'متابعة',
    currencyBtn: 'العملة والضريبة',
    cleared: 'تم مسح الحقول', undo: 'تراجع',
    scanUnavailable: 'المسح يعمل داخل التطبيق على هاتفك.',
    finalPrice: 'السعر النهائي', reset: 'مسح الكل', details: 'التفاصيل', done: 'تم',
    youSave: (a, p) => `وفّرت ‎${a} · ${p}%‏`,
    inclTax: (a) => `شامل ضريبة ‎${a}‏`,
    enterPrice: 'أدخل السعر للبدء',
    priceHint: 'اضغط على الكاميرا لمسح بطاقة السعر',
    breakdown: 'التفاصيل', original: 'السعر الأصلي', subtotal: 'المجموع قبل الضريبة', total: 'الإجمالي',
    effective: 'الخصم الفعلي',
    stackedNote: (parts, eq) => `${parts} متراكم = ${eq}% فعلياً. الخصومات تُطبَّق بالتسلسل ولا تُجمع.`,
    next: 'التالي', removeCoupon: 'حذف الكوبون', clearField: 'C', backspace: 'حذف',
    switchType: 'التبديل بين النسبة والمبلغ',
    takePhoto: 'التقاط صورة', chooseGallery: 'اختيار من المعرض', cancel: 'إلغاء',
    scanning: 'جارٍ المسح…', scanFailed: 'لم يتم اكتشاف السعر. يرجى الإدخال يدوياً.',
    scanTitle: 'مسح بطاقة السعر',
    scanSubtitle: 'املأ السعر والخصم تلقائياً من صورة.',
    language: 'اللغة', appearance: 'المظهر',
  },
};

// ─── Typography ───────────────────────────────────────────────────────────────
// Manrope has no Arabic glyphs, so Arabic uses the system font with plain weights.
const FONT_BY_WEIGHT = { 400: 'Manrope_400Regular', 600: 'Manrope_600SemiBold', 700: 'Manrope_700Bold', 800: 'Manrope_800ExtraBold' };
const makeFont = (latin) => (weight) => (latin ? { fontFamily: FONT_BY_WEIGHT[weight] } : { fontWeight: String(weight) });
// Digits and symbols are Latin in both languages, so numbers always use Manrope.
const num = (weight) => ({ fontFamily: FONT_BY_WEIGHT[weight] });

// ─── Helpers ──────────────────────────────────────────────────────────────────
const parseNum = (val) => { const n = parseFloat(val); return isNaN(n) ? 0 : n; };
const groupThousands = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
// Formats an amount in the chosen currency: "AED 87.91", "£87.91", "KWD 1.250".
const fmtMoney = (n, r) => {
  const f = 10 ** r.dec;
  const [int, frac] = (Math.round(n * f) / f).toFixed(r.dec).split('.');
  const s = groupThousands(int) + (frac ? `.${frac}` : '');
  if (!r.sym) return s;
  return r.sym.length === 1 ? `${r.sym}${s}` : `${r.sym} ${s}`;
};
const trimNum = (n) => String(Math.round(n * 100) / 100);

const MAX_COUPONS = 5;
const MAX_DIGITS = 9;
const DISCOUNT_PICKS = [10, 20, 25, 30, 40, 50, 70];
const TAX_PICKS = [5, 10, 14, 15, 16, 20];
const DEAL_MAX = 9;
const DEAL_PCTS = [25, 50, 75];
const HAIRLINE = StyleSheet.hairlineWidth;
const LIST_PAD = 12;

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
const calculate = ({ price, discounts, coupons, tax, deal }) => {
  const unit = parseNum(price);
  // Multi-buy deal: the price is per item; you take buy + get items and the
  // "get" items are free or at a % off. Discounts and coupons then apply to the total.
  const d = deal && deal.type !== 'none' ? deal : null;
  const qty = d ? d.buy + d.get : 1;
  const p = unit * qty;
  let running = p;
  const steps = [];
  if (d && unit > 0) {
    const share = d.type === 'free' ? 1 : Math.min(d.pct, 100) / 100;
    const cut = unit * d.get * share;
    running -= cut;
    steps.push({ kind: 'deal', amount: -cut });
  }
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
  const final = running + taxAmount;
  return {
    unit, qty, original: p, subtotal: running, tax: taxAmount, final, perItem: final / qty,
    savings, savingsPct: p > 0 ? (savings / p) * 100 : 0, steps,
  };
};

// Applies one keypad press to a field's text value.
const applyKey = (value, key, isPct, maxDec = 2) => {
  if (key === 'back') return value.slice(0, -1);
  if (key === 'clear') return '';
  if (key === '.') {
    if (maxDec === 0 || value.includes('.')) return value;
    return value === '' ? '0.' : `${value}.`;
  }
  const next = value === '0' ? key : value + key;
  const [, decimals = ''] = next.split('.');
  if (decimals.length > maxDec) return value;
  if (next.replace('.', '').length > MAX_DIGITS) return value;
  if (isPct && parseFloat(next) > 100) return value;
  return next;
};

// ─── Price-tag scanning ───────────────────────────────────────────────────────
const extractPriceAndDiscount = (text) => {
  const pricePatterns = [
    /[$£€₹₺]\s*(\d+(?:[.,]\d{1,3})?)/,
    /(?:AED|SAR|QAR|KWD|BHD|OMR|EGP|JOD|LBP|MAD|IQD|TRY|INR|USD|EUR|GBP|د\.إ|ر\.س|درهم|ريال)\s*(\d+(?:[.,]\d{1,3})?)/i,
    /(\d+(?:[.,]\d{1,3})?)\s*(?:AED|SAR|QAR|KWD|BHD|OMR|EGP|JOD|LBP|MAD|IQD|TRY|INR|USD|EUR|GBP|د\.إ|ر\.س|درهم|ريال)/i,
    /(?:price|total|amount|سعر|السعر|المبلغ)[:\s]*(\d+(?:[.,]\d{1,3})?)/i,
    /(\d{1,6}(?:[.,]\d{2,3}))/,
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

// Reads the photo's text on the phone with Google ML Kit (no upload, works offline).
// The module wants a plain file path or a content:// URI, so drop a file:// prefix.
const scanImageOnDevice = async (uri) => {
  const path = uri.startsWith('file://') ? decodeURI(uri.slice(7)) : uri;
  const blocks = await extractTextFromImage(path);
  return extractPriceAndDiscount((blocks || []).join('\n'));
};

// ─── Background ───────────────────────────────────────────────────────────────
// Sized in pixels to the whole physical screen: a percentage-sized Svg can render
// narrower than its container on some Android phones, leaving a plain strip.
const Aurora = ({ theme }) => {
  const win = useWindowDimensions();
  const scr = Dimensions.get('screen');
  const w = Math.ceil(Math.max(win.width, scr.width));
  const h = Math.ceil(Math.max(win.height, scr.height));
  return (
  <Svg style={styles.aurora} width={w} height={h} viewBox="0 0 100 100" preserveAspectRatio="none">
    <Defs>
      <RadialGradient id="ga" cx="0" cy="0" rx="85" ry="48" gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor={theme.blobA} stopOpacity="1" />
        <Stop offset="1" stopColor={theme.blobA} stopOpacity="0" />
      </RadialGradient>
      <RadialGradient id="gb" cx="100" cy="34" rx="80" ry="42" gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor={theme.blobB} stopOpacity="1" />
        <Stop offset="1" stopColor={theme.blobB} stopOpacity="0" />
      </RadialGradient>
      <RadialGradient id="gc" cx="25" cy="100" rx="85" ry="48" gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor={theme.blobC} stopOpacity="1" />
        <Stop offset="1" stopColor={theme.blobC} stopOpacity="0" />
      </RadialGradient>
    </Defs>
    <Rect x="0" y="0" width="100" height="100" fill={theme.base} />
    <Rect x="0" y="0" width="100" height="100" fill="url(#ga)" />
    <Rect x="0" y="0" width="100" height="100" fill="url(#gb)" />
    <Rect x="0" y="0" width="100" height="100" fill="url(#gc)" />
  </Svg>
  );
};

// ─── Brand mark (same artwork as the app icon) ─────────────────────────────────
const BagMark = ({ size = 120 }) => (
  <Svg width={size} height={size} viewBox="22 18 56 68">
    <Defs>
      <LinearGradient id="bagFill" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
        <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.18" />
        <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.10" />
      </LinearGradient>
      <LinearGradient id="bagEdge" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
        <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.35" />
      </LinearGradient>
    </Defs>
    <Path d="M38 37 V32 Q38 22 50 22 Q62 22 62 32 V37" fill="none" stroke="#FFFFFF" strokeOpacity={0.9} strokeWidth={3.4} strokeLinecap="round" />
    {/* soft drop shadow (react-native-svg has no drop-shadow filter) */}
    <Path d="M27 38 H73 L69.5 80 Q69 84 65 84 H35 Q31 84 30.5 80 Z" fill="#140C3A" fillOpacity={0.22} />
    <Path d="M27 36 H73 L69.5 78 Q69 82 65 82 H35 Q31 82 30.5 78 Z" fill="url(#bagFill)" stroke="url(#bagEdge)" strokeWidth={1.3} strokeLinejoin="round" />
    <G fill="none" stroke="#FFFFFF" strokeWidth={3.8} strokeLinecap="round">
      <Circle cx="43" cy="52" r="4" />
      <Circle cx="57" cy="66" r="4" />
    </G>
    <Path d="M59 49 L41 69" stroke="#B9FFE9" strokeWidth={4} strokeLinecap="round" />
  </Svg>
);

// ─── Welcome screen: ~1.5 s on every launch, tap to skip ──────────────────────
const WELCOME_MS = 1500;
const WELCOME_LAYOUT = 'three'; // 'two': one sentence + accent line; 'three': one phrase per line
const Welcome = ({ t, font, onDone }) => {
  const logo = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const finished = useRef(false);
  const driver = Platform.OS !== 'web';

  const finish = (fast) => {
    if (finished.current) return;
    finished.current = true;
    Animated.timing(fade, { toValue: 0, duration: fast ? 180 : 380, easing: Easing.out(Easing.quad), useNativeDriver: driver })
      .start(() => onDone());
  };

  useEffect(() => {
    let timer;
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduce) => {
      if (reduce) { logo.setValue(1); text.setValue(1); }
      else {
        Animated.parallel([
          Animated.spring(logo, { toValue: 1, friction: 6, tension: 60, useNativeDriver: driver }),
          Animated.timing(text, { toValue: 1, duration: 420, delay: 220, easing: Easing.out(Easing.cubic), useNativeDriver: driver }),
        ]).start();
      }
      timer = setTimeout(() => finish(false), WELCOME_MS);
    });
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade, zIndex: 10 }]}
      onLayout={() => { SplashScreen.hideAsync().catch(() => {}); }}>
      <Pressable style={styles.welcome} onPress={() => finish(true)} accessibilityRole="button" accessibilityLabel={t.appTitle}>
        <Aurora theme={darkTheme} />
        <Animated.View style={[styles.welcomeMark, {
          opacity: logo,
          transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }],
        }]}>
          <BagMark size={124} />
        </Animated.View>
        <Animated.View style={{ opacity: text, transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }], alignItems: 'center', gap: 6 }}>
          <Text style={[styles.welcomeTitle, font(800)]}>{t.appTitle}</Text>
          {(WELCOME_LAYOUT === 'two'
            ? [`${t.welcomeLines[0]} ${t.welcomeLines[1]}`, t.welcomeLines[2]]
            : t.welcomeLines
          ).map((line, i, all) => (
            <Text key={i} style={[styles.welcomeTag, font(i === all.length - 1 ? 800 : 600), i === all.length - 1 && styles.welcomeTagAccent]}>{line}</Text>
          ))}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
};

// ─── Sheets ───────────────────────────────────────────────────────────────────
const SheetFrame = ({ visible, onClose, theme, dismissable = true, tall, children }) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismissable ? onClose : undefined}>
      <Pressable style={[styles.dim, { backgroundColor: theme.dim }]} onPress={dismissable ? onClose : undefined}>
        <Pressable onPress={() => {}} style={[styles.sheet, tall && styles.sheetTall, { backgroundColor: theme.sheet, borderColor: theme.glassBorder, paddingBottom: insets.bottom + 18 }]}>
          <View style={[styles.grabber, { backgroundColor: theme.textMuted }]} />
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const ScanSheet = ({ visible, onClose, onResult, theme, t, font }) => {
  const [scanning, setScanning] = useState(false);
  const handleScan = async (useCamera) => {
    if (!ocrSupported) { Alert.alert(t.scanUnavailable); return; }
    try {
      let result;
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Camera permission is required.'); return; }
        result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false, exif: false });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Gallery permission is required.'); return; }
        result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsEditing: false, exif: false });
      }
      if (!result.canceled && result.assets?.[0]?.uri) {
        setScanning(true);
        const { price, discount } = await scanImageOnDevice(result.assets[0].uri);
        setScanning(false);
        if (price || discount) { onResult({ price, discount }); onClose(); }
        else { Alert.alert(t.scanFailed); }
      }
    } catch (e) {
      setScanning(false);
      Alert.alert('Error', e.message || 'Something went wrong. Please try again.');
    }
  };
  const Btn = ({ icon, label, onPress, primary }) => (
    <Pressable onPress={onPress}
      style={({ pressed }) => [styles.sheetBtn, { backgroundColor: primary ? theme.solid : theme.glassStrong, opacity: pressed ? 0.8 : 1 }]}>
      {icon && <Ionicons name={icon} size={20} color={primary ? theme.onSolid : theme.text} />}
      <Text style={[styles.sheetBtnText, font(700), { color: primary ? theme.onSolid : theme.text }]}>{label}</Text>
    </Pressable>
  );
  return (
    <SheetFrame visible={visible} onClose={onClose} theme={theme} dismissable={!scanning}>
      {scanning ? (
        <View style={styles.scanningContainer}>
          <ActivityIndicator size="large" color={theme.text} />
          <Text style={[styles.sheetSub, font(600), { color: theme.textSecondary }]}>{t.scanning}</Text>
        </View>
      ) : (
        <>
          <Text style={[styles.sheetTitle, font(800), { color: theme.text }]}>{t.scanTitle}</Text>
          <Text style={[styles.sheetSub, font(400), { color: theme.textSecondary }]}>{t.scanSubtitle}</Text>
          <Btn icon="camera-outline" label={t.takePhoto} onPress={() => handleScan(true)} primary />
          <Btn icon="image-outline" label={t.chooseGallery} onPress={() => handleScan(false)} />
          <Pressable onPress={onClose} style={styles.sheetGhost}>
            <Text style={[styles.sheetBtnText, font(600), { color: theme.textSecondary }]}>{t.cancel}</Text>
          </Pressable>
        </>
      )}
    </SheetFrame>
  );
};

const DetailsSheet = ({ visible, onClose, theme, t, rtl, result, stepLabel, stackNote, font, money }) => {
  const row = flow(rtl);
  const Line = ({ label, value, color, bold, last }) => (
    <View style={[styles.detailRow, { flexDirection: row }, !last && { borderBottomWidth: HAIRLINE, borderBottomColor: theme.separator }]}>
      <Text style={[styles.detailLabel, font(bold ? 800 : 400), { color: bold ? theme.text : theme.textSecondary, textAlign: rtl ? 'right' : 'left' }]}>{label}</Text>
      <Text style={[styles.detailValue, num(bold ? 800 : 700), { color: color || theme.text }]}>{value}</Text>
    </View>
  );
  const cuts = result.steps.filter((s) => s.kind !== 'tax');
  const taxes = result.steps.filter((s) => s.kind === 'tax');
  return (
    <SheetFrame visible={visible} onClose={onClose} theme={theme}>
      <View style={[styles.sheetNav, { flexDirection: row }]}>
        <Text style={[styles.sheetTitle, font(800), { color: theme.text, flex: 1, textAlign: rtl ? 'right' : 'left' }]}>{t.breakdown}</Text>
        <Pressable onPress={onClose} hitSlop={10} style={[styles.pill, { backgroundColor: theme.solid }]}>
          <Text style={[styles.pillText, font(700), { color: theme.onSolid }]}>{t.done}</Text>
        </Pressable>
      </View>
      <View style={[styles.glassCard, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
        <Line label={result.qty > 1 ? `${t.original} (${result.qty} × ${money(result.unit)})` : t.original} value={money(result.original)} />
        {cuts.map((s, i) => <Line key={i} label={stepLabel(s)} value={`−${money(-s.amount)}`} color={theme.save} />)}
        {result.tax > 0 && <Line label={t.subtotal} value={money(result.subtotal)} />}
        {taxes.map((s) => <Line key="tax" label={stepLabel(s)} value={`+${money(s.amount)}`} />)}
        <Line label={t.total} value={money(result.final)} bold last={result.savings <= 0 && result.qty === 1} />
        {result.qty > 1 && <Line label={t.perItem} value={money(result.perItem)} last={result.savings <= 0} />}
        {result.savings > 0 && <Line label={t.effective} value={`${result.savingsPct.toFixed(1)}%`} color={theme.save} last />}
      </View>
      {stackNote && <Text style={[styles.note, font(400), { color: theme.textSecondary, textAlign: rtl ? 'right' : 'left' }]}>{stackNote}</Text>}
    </SheetFrame>
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

const GlassIcon = ({ name, onPress, theme, label }) => (
  <Pressable onPress={onPress} hitSlop={8} accessibilityLabel={label}
    style={({ pressed }) => [styles.glassIcon, { backgroundColor: pressed ? theme.glassStrong : theme.glass, borderColor: theme.glassBorder }]}>
    <Ionicons name={name} size={18} color={theme.text} />
  </Pressable>
);

const Segmented = ({ options, value, onChange, theme, rtl, font }) => (
  <View style={[styles.seg, { backgroundColor: theme.glass, borderColor: theme.glassBorder, flexDirection: flow(rtl) }]}>
    {options.map((o) => {
      const active = o.value === value;
      return (
        <Pressable key={o.value} onPress={() => { haptic.select(); onChange(o.value); }}
          accessibilityRole="button" accessibilityState={{ selected: active }}
          style={[styles.segItem, active && { backgroundColor: theme.solid }]}>
          <Text style={[styles.segText, font(active ? 800 : 600), { color: active ? theme.onSolid : theme.textSecondary }]}>{o.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

const FieldRow = ({ field, active, last, onPress, onToggleType, onRemove, onScan, theme, rtl, t, font, sym, amtShort }) => {
  const row = flow(rtl);
  const empty = field.value === '';
  const valueColor = empty ? theme.textMuted : theme.text;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.fieldRow, { flexDirection: row, backgroundColor: active ? theme.glassStrong : pressed ? theme.glass : 'transparent' },
        !last && { borderBottomWidth: HAIRLINE, borderBottomColor: theme.separator }]}>
      <View style={[styles.dot, { backgroundColor: field.dot }]} />
      <Text numberOfLines={1} style={[styles.fieldLabel, font(active ? 700 : 600), { color: active ? theme.text : theme.textSecondary, textAlign: rtl ? 'right' : 'left' }]}>{field.label}</Text>
      {field.adjustable && (
        <Pressable onPress={onToggleType} hitSlop={6} accessibilityLabel={t.switchType}
          style={[styles.typeToggle, { backgroundColor: theme.glass }]}>
          {['pct', 'amt'].map((ty) => (
            <View key={ty} style={[styles.typeOpt, field.type === ty && { backgroundColor: theme.solid }]}>
              <Text style={[styles.typeOptText, num(800), { color: field.type === ty ? theme.onSolid : theme.textSecondary }]}>{ty === 'pct' ? '%' : amtShort}</Text>
            </View>
          ))}
        </Pressable>
      )}
      {/* Numbers always read left-to-right, even in Arabic. */}
      <View style={styles.valueWrap}>
        {field.type === 'amt' && !!sym && <Text style={[styles.fieldValue, num(800), sym.length > 1 && styles.fieldCur, { color: valueColor }]}>{sym.length > 1 ? `${sym} ` : sym}</Text>}
        <Text numberOfLines={1} style={[styles.fieldValue, num(800), { color: valueColor }]}>{empty ? '0' : field.value}</Text>
        {active && <Caret color={theme.text} />}
        {field.type === 'pct' && <Text style={[styles.fieldValue, num(800), { color: valueColor }]}>%</Text>}
      </View>
      {onScan && (
        <Pressable onPress={onScan} hitSlop={8} accessibilityLabel={t.scanTitle} style={[styles.rowAction, { backgroundColor: theme.glass }]}>
          <Ionicons name="camera-outline" size={17} color={theme.text} />
        </Pressable>
      )}
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={t.removeCoupon} style={[styles.rowAction, { backgroundColor: theme.glass }]}>
          <Ionicons name="close" size={17} color={theme.danger} />
        </Pressable>
      )}
    </Pressable>
  );
};

const Key = ({ label, icon, onPress, onLongPress, theme, height, variant = 'digit', disabled, flex = 1, a11y, font }) => {
  const primary = variant === 'primary';
  const fg = primary ? theme.onSolid : theme.text;
  return (
    <Pressable
      onPress={() => { haptic.tap(); onPress(); }} onLongPress={onLongPress} disabled={disabled}
      accessibilityRole="button" accessibilityLabel={a11y || label}
      style={({ pressed }) => [styles.key, {
        flex, height,
        backgroundColor: primary ? theme.solid : pressed ? theme.keyDown : variant === 'fn' ? theme.keyFn : theme.key,
        opacity: disabled ? 0.35 : primary && pressed ? 0.85 : 1,
      }]}
    >
      {icon ? <Ionicons name={icon} size={21} color={fg} /> : null}
      {label ? <Text style={[variant === 'digit' ? [styles.keyDigit, num(600)] : [styles.keyFnText, font(800)], { color: fg }]}>{label}</Text> : null}
    </Pressable>
  );
};

// ─── Multi-buy deal ───────────────────────────────────────────────────────────
const DEFAULT_DEAL = { type: 'none', buy: 1, get: 1, pct: 50 };
const dealText = (d, t) => (d.type === 'free' ? t.dealFree(d.buy, d.get) : d.type === 'pct' ? t.dealPct(d.buy, d.get, d.pct) : t.dealAdd);

const Stepper = ({ label, value, onChange, theme, font, rtl }) => (
  <View style={[styles.stepper, { flexDirection: flow(rtl) }]}>
    <Text style={[styles.stepperLabel, font(700), { color: theme.textSecondary, textAlign: rtl ? 'right' : 'left' }]}>{label}</Text>
    <View style={[styles.stepperCtl, { backgroundColor: theme.glass, flexDirection: flow(false) }]}>
      <Pressable onPress={() => { haptic.select(); onChange(Math.max(1, value - 1)); }} hitSlop={6} style={styles.stepperBtn} accessibilityLabel={`${label} −`}>
        <Ionicons name="remove" size={20} color={theme.text} />
      </Pressable>
      <Text style={[styles.stepperValue, num(800), { color: theme.text }]}>{value}</Text>
      <Pressable onPress={() => { haptic.select(); onChange(Math.min(DEAL_MAX, value + 1)); }} hitSlop={6} style={styles.stepperBtn} accessibilityLabel={`${label} +`}>
        <Ionicons name="add" size={20} color={theme.text} />
      </Pressable>
    </View>
  </View>
);

const DealSheet = ({ visible, onClose, deal, onChange, theme, t, font, rtl }) => (
  <SheetFrame visible={visible} onClose={onClose} theme={theme}>
    <View style={[styles.sheetNav, { flexDirection: flow(rtl) }]}>
      <Text style={[styles.sheetTitle, font(800), { color: theme.text, flex: 1, textAlign: rtl ? 'right' : 'left' }]}>{t.deal}</Text>
      <Pressable onPress={onClose} hitSlop={10} style={[styles.pill, { backgroundColor: theme.solid }]}>
        <Text style={[styles.pillText, font(700), { color: theme.onSolid }]}>{t.done}</Text>
      </Pressable>
    </View>
    <Segmented options={['none', 'free', 'pct'].map((v) => ({ value: v, label: t.dealTypes[v] }))}
      value={deal.type} onChange={(type) => onChange({ ...deal, type })} theme={theme} rtl={rtl} font={font} />
    {deal.type !== 'none' && (
      <View style={[styles.glassCard, { backgroundColor: theme.glass, borderColor: theme.glassBorder, padding: 14, gap: 12 }]}>
        <Stepper label={t.buy} value={deal.buy} onChange={(buy) => onChange({ ...deal, buy })} theme={theme} font={font} rtl={rtl} />
        <Stepper label={t.get} value={deal.get} onChange={(get) => onChange({ ...deal, get })} theme={theme} font={font} rtl={rtl} />
        {deal.type === 'pct' && (
          <View style={[styles.stepper, { flexDirection: flow(rtl) }]}>
            <Text style={[styles.stepperLabel, font(700), { color: theme.textSecondary, textAlign: rtl ? 'right' : 'left' }]}>{t.dealOff}</Text>
            <View style={[styles.chipInner, { flexDirection: flow(false), paddingHorizontal: 0 }]}>
              {DEAL_PCTS.map((p) => (
                <Pressable key={p} onPress={() => { haptic.select(); onChange({ ...deal, pct: p }); }}
                  style={[styles.chip, { backgroundColor: deal.pct === p ? theme.solid : theme.glass }]}>
                  <Text style={[styles.chipText, num(700), { color: deal.pct === p ? theme.onSolid : theme.text }]}>{p}%</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>
    )}
    <Text style={[styles.note, font(600), { color: deal.type === 'none' ? theme.textSecondary : theme.save, textAlign: 'center' }]}>
      {deal.type === 'none' ? t.dealHint : `${dealText(deal, t)} · ${t.dealHint}`}
    </Text>
  </SheetFrame>
);

// ─── Country / currency picker (first launch, and from the currency button) ────
const RegionSheet = ({ visible, fromButton, onSkip, onApply, theme, t, font, rtl, lang }) => {
  const [step, setStep] = useState('pick');
  const [pending, setPending] = useState(null);
  const [code, setCode] = useState('');
  const [vat, setVat] = useState('');
  useEffect(() => { if (visible) { setStep('pick'); setPending(null); } }, [visible]);
  const align = rtl ? 'right' : 'left';
  const noteText = (c) => (c.note === 'varies' ? t.noteVaries : c.note === 'state' ? t.noteState : '');
  const pick = (c) => { haptic.select(); setPending(c); setStep('confirm'); };
  const manualDone = () => {
    const cur = code.trim().toUpperCase().slice(0, 5);
    const rate = Math.min(parseNum(vat.replace(',', '.')), 100);
    pick({ id: 'XX', en: cur || '—', ar: cur || '—', cur, sym: cur, dec: 2, vat: Math.round(rate * 100) / 100 });
  };
  const Btn = ({ label, onPress, primary }) => (
    <Pressable onPress={onPress}
      style={({ pressed }) => [styles.sheetBtn, { backgroundColor: primary ? theme.solid : theme.glassStrong, opacity: pressed ? 0.8 : 1 }]}>
      <Text style={[styles.sheetBtnText, font(700), { color: primary ? theme.onSolid : theme.text }]}>{label}</Text>
    </Pressable>
  );
  return (
    <SheetFrame visible={visible} onClose={onSkip} theme={theme} tall>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ gap: 12, flexShrink: 1 }}>
        {step === 'pick' && (
          <>
            <Text style={[styles.sheetTitle, font(800), { color: theme.text }]}>{t.regionTitle}</Text>
            <Text style={[styles.sheetSub, font(400), { color: theme.textSecondary }]}>{t.regionSub}</Text>
            <ScrollView style={[styles.glassCard, styles.regionList, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
              {[...COUNTRIES, { id: 'XX' }].map((c, i, all) => (
                <Pressable key={c.id} onPress={() => (c.id === 'XX' ? setStep('manual') : pick(c))}
                  style={({ pressed }) => [styles.regionRow, { flexDirection: flow(rtl), backgroundColor: pressed ? theme.glassStrong : 'transparent' },
                    i < all.length - 1 && { borderBottomWidth: HAIRLINE, borderBottomColor: theme.separator }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.regionName, font(700), { color: theme.text, textAlign: align }]}>{c.id === 'XX' ? t.other : c[lang]}</Text>
                    {c.id !== 'XX' && (
                      <Text style={[styles.regionMeta, font(600), { color: theme.textSecondary, textAlign: align }]}>
                        {`${c.cur} · ${t.vatLabel(c.vat)}${noteText(c) ? ` · ${noteText(c)}` : ''}`}
                      </Text>
                    )}
                  </View>
                  <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={18} color={theme.textMuted} />
                </Pressable>
              ))}
            </ScrollView>
            <Pressable onPress={onSkip} style={styles.sheetGhost}>
              <Text style={[styles.sheetBtnText, font(600), { color: theme.textSecondary }]}>{fromButton ? t.cancel : t.skip}</Text>
            </Pressable>
          </>
        )}
        {step === 'manual' && (
          <>
            <Text style={[styles.sheetTitle, font(800), { color: theme.text }]}>{t.other}</Text>
            <TextInput value={code} onChangeText={setCode} placeholder={t.currencyCode} placeholderTextColor={theme.textMuted}
              autoCapitalize="characters" maxLength={5} autoFocus
              style={[styles.textInput, num(700), { color: theme.text, backgroundColor: theme.glass, borderColor: theme.glassBorder, textAlign: align }]} />
            <TextInput value={vat} onChangeText={(v) => setVat(v.replace(/[^0-9.,]/g, ''))} placeholder={t.vatRate} placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad" maxLength={5}
              style={[styles.textInput, num(700), { color: theme.text, backgroundColor: theme.glass, borderColor: theme.glassBorder, textAlign: align }]} />
            <Btn label={t.continueBtn} onPress={manualDone} primary />
            <Pressable onPress={() => setStep('pick')} style={styles.sheetGhost}>
              <Text style={[styles.sheetBtnText, font(600), { color: theme.textSecondary }]}>{t.back}</Text>
            </Pressable>
          </>
        )}
        {step === 'confirm' && pending && (
          <>
            <Text style={[styles.sheetTitle, font(800), { color: theme.text }]}>{t.confirmTitle}</Text>
            <View style={[styles.glassCard, { backgroundColor: theme.glass, borderColor: theme.glassBorder, padding: 16, alignItems: 'center', gap: 4 }]}>
              <Text style={[styles.regionName, font(800), { color: theme.text }]}>{pending.id === 'XX' ? (pending.cur || t.other) : pending[lang]}</Text>
              <Text style={[styles.regionMeta, font(600), { color: theme.textSecondary }]}>
                {`${pending.cur || '—'} · ${t.vatLabel(pending.vat)}`}
              </Text>
            </View>
            <Text style={[styles.sheetSub, font(400), { color: theme.textSecondary }]}>{t.confirmSub}</Text>
            <Btn label={t.saveDefault} onPress={() => onApply(pending, true)} primary />
            <Btn label={t.justOnce} onPress={() => onApply(pending, false)} />
            <Pressable onPress={() => setStep('pick')} style={styles.sheetGhost}>
              <Text style={[styles.sheetBtnText, font(600), { color: theme.textSecondary }]}>{t.back}</Text>
            </Pressable>
          </>
        )}
      </KeyboardAvoidingView>
    </SheetFrame>
  );
};

// ─── Main screen ──────────────────────────────────────────────────────────────
const emptyForm = (vat = 0) => ({
  price: '',
  discounts: [{ value: '', type: 'pct' }, { value: '', type: 'pct' }],
  coupons: [],
  tax: vat > 0 ? String(vat) : '',
  deal: { ...DEFAULT_DEAL },
});
// Restores a saved form, filling in anything an older version didn't store.
const restoreForm = (raw) => {
  const base = emptyForm();
  if (!raw || typeof raw !== 'object') return null;
  return {
    price: typeof raw.price === 'string' ? raw.price : '',
    discounts: Array.isArray(raw.discounts) && raw.discounts.length === 2 ? raw.discounts : base.discounts,
    coupons: Array.isArray(raw.coupons) ? raw.coupons.filter((c) => c && typeof c.id === 'number') : [],
    tax: typeof raw.tax === 'string' ? raw.tax : '',
    deal: { ...DEFAULT_DEAL, ...(raw.deal || {}) },
  };
};
const UNDO_MS = 5000;

const CalculatorScreen = () => {
  const systemScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [fontsLoaded] = useFonts({ Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  const [isDark, setIsDark] = useState(null);
  const [lang, setLang] = useState('en');
  const [mode, setMode] = useState('simple');
  const [loaded, setLoaded] = useState(false);

  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState('price');
  const [scanVisible, setScanVisible] = useState(false);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [region, setRegion] = useState(null);
  const [regionSaved, setRegionSaved] = useState(false);
  const [regionSheet, setRegionSheet] = useState(null); // null | 'first' | 'button'
  const [dealVisible, setDealVisible] = useState(false);
  const [undoForm, setUndoForm] = useState(null);
  const [trayH, setTrayH] = useState(0);
  const undoTimer = useRef(null);
  const nextId = useRef(1);
  const listRef = useRef(null);
  const heights = useRef({});
  const scrollY = useRef(0);
  const viewH = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const [savedTheme, savedLang, savedMode, savedRegion, savedForm] = await Promise.all(
          ['theme', 'lang', 'mode', 'region', 'form'].map((k) => AsyncStorage.getItem(k))
        );
        setIsDark(savedTheme !== null ? savedTheme === 'dark' : systemScheme !== 'light');
        if (savedLang && translations[savedLang]) setLang(savedLang);
        if (savedMode === 'simple' || savedMode === 'stacked') setMode(savedMode);
        const r = savedRegion ? JSON.parse(savedRegion) : null;
        if (r && typeof r.dec === 'number') { setRegion(r); setRegionSaved(true); }
        const restored = savedForm ? restoreForm(JSON.parse(savedForm)) : null;
        if (restored) {
          setForm(restored);
          nextId.current = restored.coupons.reduce((m, c) => Math.max(m, c.id), 0) + 1;
        } else if (r) {
          setForm(emptyForm(r.vat));
        }
      } catch (e) { setIsDark(systemScheme !== 'light'); }
      setLoaded(true);
    })();
  }, []);

  const persist = (key, value) => { AsyncStorage.setItem(key, value).catch(() => {}); };

  // Keep what the shopper typed, so it survives Android closing the app in the background.
  useEffect(() => {
    if (!loaded) return undefined;
    const timer = setTimeout(() => persist('form', JSON.stringify(form)), 300);
    return () => clearTimeout(timer);
  }, [form, loaded]);

  // Applies a picked country: currency, decimals and its VAT rate in the tax field.
  const applyRegion = (r, save) => {
    haptic.tap();
    setRegion(r);
    setRegionSheet(null);
    setForm((f) => ({ ...f, tax: r.vat > 0 ? String(r.vat) : '' }));
    setRegionSaved(save);
    if (save) persist('region', JSON.stringify(r));
    else AsyncStorage.removeItem('region').catch(() => {});
  };
  const toggleTheme = () => { haptic.select(); setIsDark((d) => { persist('theme', d ? 'light' : 'dark'); return !d; }); };
  const toggleLang = () => { haptic.select(); setLang((l) => { const n = l === 'en' ? 'ar' : 'en'; persist('lang', n); return n; }); };
  const changeMode = (m) => { setMode(m); persist('mode', m); };

  const theme = isDark === false ? lightTheme : darkTheme;
  const t = translations[lang];
  const rtl = lang === 'ar';
  const font = makeFont(!rtl);
  const stacked = mode === 'stacked';
  const compact = height < 720;
  const rg = region || NO_REGION;
  const money = (n) => fmtMoney(n, rg);
  const amtShort = rg.sym || t.amt;

  // Ordered list of editable fields; "Next" walks through it.
  const fields = useMemo(() => {
    const list = [{ key: 'price', kind: 'price', label: t.price, dot: theme.dotPrice, value: form.price, type: 'amt', adjustable: false }];
    form.discounts.slice(0, stacked ? 2 : 1).forEach((d, i) => list.push({
      key: `d${i}`, kind: 'discount', label: stacked ? t.discountN(i + 1) : t.discount,
      dot: theme.dotDiscount, value: d.value, type: d.type, adjustable: true,
    }));
    form.coupons.forEach((c, i) => list.push({
      key: `c${c.id}`, kind: 'coupon', label: t.coupon(i + 1), id: c.id,
      dot: theme.dotCoupon, value: c.value, type: c.type, adjustable: true,
    }));
    list.push({ key: 'tax', kind: 'tax', label: t.tax, dot: theme.dotTax, value: form.tax, type: 'pct', adjustable: false });
    return list;
  }, [form, stacked, t, theme]);

  const current = fields.find((f) => f.key === selected) || fields[0];
  const lastDiscountKey = stacked ? 'd1' : 'd0';
  const lastDiscountKeyRef = useRef(lastDiscountKey);
  lastDiscountKeyRef.current = lastDiscountKey;
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
        if (f.key === lastDiscountKeyRef.current) order.push('deal');
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
    updateField(current.key, (adj) => ({ value: applyKey(adj.value, key, adj.type === 'pct', adj.type === 'pct' ? 2 : rg.dec) }));
  };

  const pickPreset = (n) => { haptic.select(); updateField(current.key, (adj) => ({ value: adj.value === String(n) ? '' : String(n) })); };

  const addCoupon = () => {
    haptic.select();
    const id = nextId.current++;
    setForm((f) => ({ ...f, coupons: [...f.coupons, { id, value: '', type: 'pct' }] }));
    setSelected(`c${id}`);
  };
  const removeCoupon = (id) => { haptic.tap(); setForm((f) => ({ ...f, coupons: f.coupons.filter((c) => c.id !== id) })); };
  // Reset keeps the country's VAT and offers an Undo for a few seconds.
  const reset = () => {
    haptic.tap();
    setUndoForm(form);
    setForm(emptyForm(rg.vat));
    setSelected('price');
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoForm(null), UNDO_MS);
  };
  const undoReset = () => {
    haptic.select();
    clearTimeout(undoTimer.current);
    if (undoForm) setForm(undoForm);
    setUndoForm(null);
  };
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const result = useMemo(() => calculate({
    price: form.price,
    discounts: form.discounts.slice(0, stacked ? 2 : 1),
    coupons: form.coupons,
    tax: form.tax,
    deal: form.deal,
  }), [form, stacked]);

  const canReset = !!(form.price || form.coupons.length || form.discounts.some((d) => d.value)
    || form.deal.type !== 'none' || form.tax !== (rg.vat > 0 ? String(rg.vat) : ''));

  const adjText = (s) => (s.type === 'pct' ? `${trimNum(s.value)}%` : money(s.value));
  const stepLabel = (s) => {
    if (s.kind === 'discount') return `${stacked ? t.discountN(s.index + 1) : t.discount} (${adjText(s)})`;
    if (s.kind === 'coupon') return `${t.coupon(s.index + 1)} (${adjText(s)})`;
    if (s.kind === 'deal') return dealText(form.deal, t);
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
  const keyH = Math.max(42, Math.min(54, Math.round(height * 0.06)));
  const row = flow(rtl);
  const align = rtl ? 'right' : 'left';

  // Same colour as the system splash, which stays visible until the welcome screen draws.
  if (!loaded || !fontsLoaded) return <View style={{ flex: 1, backgroundColor: darkTheme.base }} />;

  const taxPicks = [...new Set([rg.vat, ...TAX_PICKS].filter((v) => v > 0))];
  const presets = current.kind === 'tax' ? taxPicks
    : current.adjustable && current.type === 'pct' ? DISCOUNT_PICKS : null;
  const lastFieldKey = fields[fields.length - 1].key;
  const glassCard = { backgroundColor: theme.glass, borderColor: theme.glassBorder };

  return (
    <View style={[styles.screen, { backgroundColor: theme.base }]}>
      <Aurora theme={theme} />
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
      <ScanSheet visible={scanVisible} onClose={() => setScanVisible(false)} theme={theme} t={t} font={font}
        onResult={({ price, discount }) => {
          if (price) updateField('price', () => ({ value: price }));
          if (discount) updateField('d0', () => ({ value: discount, type: 'pct' }));
        }} />
      <DetailsSheet visible={detailsVisible} onClose={() => setDetailsVisible(false)} theme={theme} t={t} rtl={rtl}
        result={result} stepLabel={stepLabel} stackNote={stackNote} font={font} money={money} />
      <DealSheet visible={dealVisible} onClose={() => setDealVisible(false)} deal={form.deal}
        onChange={(deal) => setForm((f) => ({ ...f, deal }))} theme={theme} t={t} font={font} rtl={rtl} />
      <RegionSheet visible={!!regionSheet} fromButton={regionSheet === 'button'} onSkip={() => setRegionSheet(null)}
        onApply={applyRegion} theme={theme} t={t} font={font} rtl={rtl} lang={lang} />

      <View style={{ paddingTop: insets.top + 8, flex: 1 }}>
        {/* Header */}
        <View style={[styles.header, { flexDirection: row }]}>
          <Text style={[styles.title, compact && { fontSize: 17 }, font(800), { color: theme.text, textAlign: align }]}
            numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t.appTitle}</Text>
          <Pressable onPress={() => { haptic.select(); setRegionSheet('button'); }} hitSlop={6} accessibilityLabel={t.currencyBtn}
            style={({ pressed }) => [styles.curPill, { flexDirection: flow(false), backgroundColor: pressed ? theme.glassStrong : theme.glass, borderColor: theme.glassBorder }]}>
            <Ionicons name="cash-outline" size={16} color={theme.text} />
            <Text style={[styles.curPillText, num(800), { color: theme.text }]}>{rg.cur || '—'}</Text>
          </Pressable>
          <Pressable onPress={toggleLang} hitSlop={6} accessibilityLabel={t.language}
            style={({ pressed }) => [styles.glassIcon, { backgroundColor: pressed ? theme.glassStrong : theme.glass, borderColor: theme.glassBorder }]}>
            <Text style={[styles.langText, font(800), { color: theme.text }]}>{lang === 'en' ? 'ع' : 'EN'}</Text>
          </Pressable>
          <GlassIcon name={theme.dark ? 'sunny-outline' : 'moon-outline'} onPress={toggleTheme} theme={theme} label={t.appearance} />
        </View>

        <View style={styles.segWrap}>
          <Segmented options={[{ value: 'simple', label: t.simple }, { value: 'stacked', label: t.stacked }]}
            value={mode} onChange={changeMode} theme={theme} rtl={rtl} font={font} />
        </View>

        {/* Result */}
        <View style={[styles.glassCard, styles.resultCard, glassCard, compact && { paddingVertical: 10 }]}>
          <View style={[styles.resultTop, { flexDirection: row }]}>
            <Text style={[styles.resultLabel, font(700), { color: theme.textSecondary }]}>{t.finalPrice}</Text>
            <View style={[styles.resultActions, { flexDirection: row }]}>
              <Pressable onPress={() => setDetailsVisible(true)} disabled={result.original <= 0} hitSlop={6}
                style={({ pressed }) => [styles.pill, { backgroundColor: pressed ? theme.glassStrong : theme.glass, opacity: result.original > 0 ? 1 : 0.45 }]}>
                <Text style={[styles.pillText, font(700), { color: theme.text }]}>{t.details}</Text>
              </Pressable>
              <Pressable onPress={reset} disabled={!canReset} hitSlop={6}
                style={({ pressed }) => [styles.pill, { backgroundColor: pressed ? theme.glassStrong : theme.glass, opacity: canReset ? 1 : 0.45 }]}>
                <Ionicons name="refresh" size={13} color={theme.text} />
                <Text style={[styles.pillText, font(700), { color: theme.text }]}>{t.reset}</Text>
              </Pressable>
            </View>
          </View>
          <View style={[styles.resultValueRow, { flexDirection: row }]}>
            <Text style={[styles.resultValue, num(800), compact && { fontSize: 38 }, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit>
              {money(result.final)}
            </Text>
            {result.savings > 0 && <Text style={[styles.resultStrike, num(600), { color: theme.textMuted }]}>{money(result.original)}</Text>}
          </View>
          <View style={[styles.resultBottom, { flexDirection: row }]}>
            {result.savings > 0 ? (
              <Text style={[styles.resultSave, font(700), { color: theme.save, textAlign: align }]} numberOfLines={1}>
                {t.youSave(money(result.savings), result.savingsPct.toFixed(1))}
              </Text>
            ) : result.original <= 0 ? (
              <Text style={[styles.resultSave, font(600), { color: theme.textSecondary, textAlign: align }]}>{t.enterPrice}</Text>
            ) : <View style={{ flex: 1 }} />}
            {result.qty > 1 && result.unit > 0 ? (
              <Text style={[styles.resultTax, font(600), { color: theme.textSecondary }]}>{t.forItems(result.qty, money(result.perItem))}</Text>
            ) : result.tax > 0 && !compact ? (
              <Text style={[styles.resultTax, font(600), { color: theme.textSecondary }]}>{t.inclTax(money(result.tax))}</Text>
            ) : null}
          </View>
        </View>

        {/* Fields */}
        <ScrollView
          ref={listRef} style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}
          onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={32}
          onLayout={(e) => { viewH.current = e.nativeEvent.layout.height; }}
        >
          <View style={[styles.glassCard, glassCard, { paddingVertical: 2 }]}>
            {fields.map((f) => (
              <React.Fragment key={f.key}>
                {f.kind === 'tax' && showAddCoupon && (
                  <Pressable onPress={addCoupon} onLayout={(e) => { heights.current.add = e.nativeEvent.layout.height; }}
                    style={({ pressed }) => [styles.fieldRow, { minHeight: 50, flexDirection: row, backgroundColor: pressed ? theme.glass : 'transparent', borderBottomWidth: HAIRLINE, borderBottomColor: theme.separator }]}>
                    <Ionicons name="add" size={18} color={theme.save} />
                    <Text style={[styles.fieldLabel, font(700), { color: theme.save, textAlign: align }]}>{t.addCoupon}</Text>
                  </Pressable>
                )}
                <View onLayout={(e) => { heights.current[f.key] = e.nativeEvent.layout.height; }}>
                  <FieldRow
                    field={f} active={f.key === current.key} last={f.key === lastFieldKey} theme={theme} rtl={rtl} t={t} font={font}
                    sym={rg.sym} amtShort={amtShort}
                    onPress={() => selectField(f.key)}
                    onToggleType={() => { haptic.select(); setSelected(f.key); toggleType(f.key); }}
                    onScan={f.kind === 'price' ? () => setScanVisible(true) : null}
                    onRemove={f.kind === 'coupon' ? () => removeCoupon(f.id) : null}
                  />
                </View>
                {f.key === lastDiscountKey && (
                  <Pressable onPress={() => { haptic.select(); setDealVisible(true); }}
                    onLayout={(e) => { heights.current.deal = e.nativeEvent.layout.height; }}
                    style={({ pressed }) => [styles.fieldRow, { minHeight: 50, flexDirection: row, backgroundColor: pressed ? theme.glass : 'transparent', borderBottomWidth: HAIRLINE, borderBottomColor: theme.separator }]}>
                    <Ionicons name="pricetags-outline" size={17} color={form.deal.type === 'none' ? theme.textSecondary : theme.save} />
                    <Text numberOfLines={1} style={[styles.fieldLabel, font(700), { color: form.deal.type === 'none' ? theme.textSecondary : theme.save, textAlign: align }]}>
                      {form.deal.type === 'none' ? `${t.deal} · ${t.dealAdd}` : dealText(form.deal, t)}
                    </Text>
                    <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={17} color={theme.textMuted} />
                  </Pressable>
                )}
              </React.Fragment>
            ))}
          </View>
        </ScrollView>

        {/* Keypad tray */}
        {undoForm && (
          <View style={[styles.snackbar, { bottom: trayH + 10, flexDirection: row, backgroundColor: theme.solid }]}>
            <Text style={[styles.snackText, font(600), { color: theme.onSolid, textAlign: align }]}>{t.cleared}</Text>
            <Pressable onPress={undoReset} hitSlop={10}>
              <Text style={[styles.snackAction, font(800), { color: theme.dark ? '#5B4FE0' : '#B9FFE9' }]}>{t.undo}</Text>
            </Pressable>
          </View>
        )}
        <View onLayout={(e) => setTrayH(e.nativeEvent.layout.height)}
          style={[styles.tray, { backgroundColor: theme.tray, borderColor: theme.glassBorder, paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={styles.chipBar}>
            {presets ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
                contentContainerStyle={[styles.chipInner, { flexDirection: row }]}>
                {presets.map((n) => {
                  const active = current.value === String(n);
                  return (
                    <Pressable key={n} onPress={() => pickPreset(n)}
                      style={[styles.chip, { backgroundColor: active ? theme.solid : theme.glass }]}>
                      <Text style={[styles.chipText, num(700), { color: active ? theme.onSolid : theme.text }]}>{n}%</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={[styles.chipHint, font(600), { color: theme.textSecondary }]}>{current.adjustable ? t.pctOrAmt(amtShort) : t.priceHint}</Text>
            )}
          </View>
          <View style={styles.keypad}>
            <View style={styles.keyRow}>
              {['1', '2', '3'].map((k) => <Key key={k} label={k} onPress={() => pressKey(k)} theme={theme} height={keyH} font={font} />)}
              <Key icon="backspace-outline" variant="fn" onPress={() => pressKey('back')} onLongPress={() => pressKey('clear')} theme={theme} height={keyH} a11y={t.backspace} font={font} />
            </View>
            <View style={styles.keyRow}>
              {['4', '5', '6'].map((k) => <Key key={k} label={k} onPress={() => pressKey(k)} theme={theme} height={keyH} font={font} />)}
              <Key label={`% / ${amtShort}`} variant="fn" onPress={() => pressKey('type')} theme={theme} height={keyH} disabled={!current.adjustable} a11y={t.switchType} font={font} />
            </View>
            <View style={styles.keyRow}>
              {['7', '8', '9'].map((k) => <Key key={k} label={k} onPress={() => pressKey(k)} theme={theme} height={keyH} font={font} />)}
              <Key label={t.clearField} variant="fn" onPress={() => pressKey('clear')} theme={theme} height={keyH} a11y="Clear" font={font} />
            </View>
            <View style={styles.keyRow}>
              <Key label="." onPress={() => pressKey('.')} theme={theme} height={keyH} font={font} />
              <Key label="0" onPress={() => pressKey('0')} theme={theme} height={keyH} font={font} />
              <Key label={t.next} icon={rtl ? 'arrow-back' : 'arrow-forward'} variant="primary" flex={2.06} onPress={() => pressKey('next')} theme={theme} height={keyH} font={font} />
            </View>
          </View>
        </View>
      </View>
      {showWelcome && <Welcome t={t} font={font} onDone={() => { setShowWelcome(false); if (!regionSaved) setRegionSheet('first'); }} />}
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
  aurora: { position: 'absolute', top: 0, left: 0 },

  // Header
  header: { paddingHorizontal: 16, alignItems: 'center', gap: 8, minHeight: 44 },
  title: { flex: 1, fontSize: 19, letterSpacing: -0.3 },
  glassIcon: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  segWrap: { paddingHorizontal: 16, marginTop: 8, marginBottom: 12 },
  seg: { borderRadius: 999, borderWidth: 1, padding: 3 },
  segItem: { flex: 1, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  segText: { fontSize: 13.5 },

  // Glass surfaces
  glassCard: { borderRadius: 22, borderWidth: 1, overflow: 'hidden' },

  // Result
  resultCard: { marginHorizontal: 16, paddingHorizontal: 18, paddingVertical: 14, gap: 2 },
  resultTop: { justifyContent: 'space-between', alignItems: 'center' },
  resultLabel: { fontSize: 11, letterSpacing: 1.3 },
  resultActions: { gap: 6 },
  pill: { flexDirection: flow(false), alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999 },
  pillText: { fontSize: 12.5 },
  resultValueRow: { alignItems: 'baseline', gap: 10 },
  resultValue: { fontSize: 46, letterSpacing: -1.2, flexShrink: 1 },
  resultStrike: { fontSize: 16, textDecorationLine: 'line-through' },
  resultBottom: { alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  resultSave: { fontSize: 14, flexShrink: 1 },
  resultTax: { fontSize: 13 },

  // Field list
  list: { flex: 1, marginTop: 12 },
  listContent: { paddingHorizontal: 16, paddingBottom: LIST_PAD },
  fieldRow: { minHeight: 60, paddingHorizontal: 16, alignItems: 'center', gap: 10 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  fieldLabel: { flex: 1, fontSize: 16 },
  typeToggle: { flexDirection: flow(false), borderRadius: 8, padding: 2 },
  typeOpt: { minWidth: 26, height: 22, paddingHorizontal: 5, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  typeOptText: { fontSize: 12 },
  valueWrap: { flexDirection: flow(false), alignItems: 'center', maxWidth: '48%' },
  fieldValue: { fontSize: 25 },
  caret: { width: 2, height: 27, borderRadius: 1, marginHorizontal: 1 },
  rowAction: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  // Keypad tray
  tray: { borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderBottomWidth: 0, paddingTop: 4 },
  chipBar: { height: 46, justifyContent: 'center' },
  chipInner: { paddingHorizontal: 12, gap: 6, alignItems: 'center' },
  chipHint: { fontSize: 13, textAlign: 'center' },
  chip: { paddingHorizontal: 14, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 13.5 },
  keypad: { paddingHorizontal: 10, gap: 7 },
  keyRow: { flexDirection: flow(false), gap: 7 },
  key: { borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: flow(false), gap: 6 },
  keyDigit: { fontSize: 24 },
  keyFnText: { fontSize: 15 },

  // Welcome
  welcome: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22, paddingHorizontal: 32, backgroundColor: darkTheme.base },
  welcomeMark: {
    width: 176, height: 176, borderRadius: 48, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)',
  },
  welcomeTitle: { color: '#FFFFFF', fontSize: 28, letterSpacing: -0.4, textAlign: 'center' },
  welcomeTag: { color: 'rgba(255,255,255,0.78)', fontSize: 16, lineHeight: 22, textAlign: 'center' },
  welcomeTagAccent: { color: '#B9FFE9', marginTop: 2 },

  // Currency button, deal, undo
  curPill: { height: 38, borderRadius: 19, borderWidth: 1, paddingHorizontal: 12, alignItems: 'center', gap: 5 },
  curPillText: { fontSize: 13 },
  langText: { fontSize: 15 },
  fieldCur: { fontSize: 15 },
  stepper: { alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stepperLabel: { fontSize: 15, flex: 1 },
  stepperCtl: { alignItems: 'center', borderRadius: 14, padding: 4, gap: 6 },
  stepperBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { fontSize: 20, minWidth: 26, textAlign: 'center' },
  snackbar: { position: 'absolute', left: 16, right: 16, zIndex: 5, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  snackText: { flex: 1, fontSize: 14 },
  snackAction: { fontSize: 15 },
  regionList: { flexGrow: 0, flexShrink: 1 },
  regionRow: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center', gap: 10 },
  regionName: { fontSize: 16 },
  regionMeta: { fontSize: 13, marginTop: 1 },
  textInput: { height: 52, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, fontSize: 17 },
  sheetTall: { maxHeight: '88%' },

  // Sheets
  dim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderBottomWidth: 0, paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  grabber: { width: 38, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 6 },
  sheetNav: { alignItems: 'center', gap: 10 },
  sheetTitle: { fontSize: 20, textAlign: 'center' },
  sheetSub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 4 },
  sheetBtn: { height: 54, borderRadius: 18, flexDirection: flow(false), alignItems: 'center', justifyContent: 'center', gap: 8 },
  sheetBtnText: { fontSize: 16 },
  sheetGhost: { height: 44, alignItems: 'center', justifyContent: 'center' },
  scanningContainer: { alignItems: 'center', padding: 28, gap: 12 },
  detailRow: { minHeight: 44, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, gap: 12 },
  detailLabel: { fontSize: 15, flexShrink: 1 },
  detailValue: { fontSize: 15 },
  note: { fontSize: 13, lineHeight: 19, paddingHorizontal: 4 },
});
