import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet, Text, View, Pressable, ScrollView, StatusBar, Platform, TextInput, KeyboardAvoidingView,
  BackHandler, LayoutAnimation, UIManager,
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
import { COUNTRY_LIST, CURRENCY_LIST, POPULAR_COUNTRIES, POPULAR_CURRENCIES } from './data/regions';

// The app lays out Arabic itself (row-reverse + right-aligned text). If the phone's
// system language is RTL, Android would mirror everything a second time, flipping
// the keypad. Turn system mirroring off (applies from the next launch) and, until
// then, compensate so rows still read in the intended direction.
// Keep the system splash up until the welcome screen has drawn its first frame.
SplashScreen.preventAutoHideAsync().catch(() => {});

I18nManager.allowRTL(false);
I18nManager.forceRTL(false);
const SYSTEM_RTL = I18nManager.isRTL === true; // undefined on web
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) UIManager.setLayoutAnimationEnabledExperimental(true);
// Keypad slides up and down instead of jumping.
const animateKeypad = () => LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
const flow = (rtl) => ((rtl !== SYSTEM_RTL) ? 'row-reverse' : 'row');

// ─── Countries and currencies (data/regions.js) ───────────────────────────────
const CURRENCY_BY_CODE = Object.fromEntries(CURRENCY_LIST.map((c) => [c.cur, c]));
const COUNTRY_BY_ID = Object.fromEntries(COUNTRY_LIST.map((c) => [c.id, c]));
// What the app stores for a picked country: names, currency format and VAT.
const regionFromCountry = (c) => {
  const k = CURRENCY_BY_CODE[c.cur] || { sym: c.cur, dec: 2 };
  return { id: c.id, en: c.en, ar: c.ar, cur: c.cur, sym: k.sym, dec: k.dec, vat: c.vat, note: c.note };
};
// Search that ignores case, Arabic diacritics and alef/yaa/taa-marbuta variants.
const norm = (s) => (s || '').toLowerCase()
  .replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim();
const matches = (q, ...fields) => !q || fields.some((x) => norm(x).includes(q));
const searchCountries = (query) => {
  const q = norm(query);
  if (!q) {
    const top = POPULAR_COUNTRIES.map((id) => COUNTRY_BY_ID[id]).filter(Boolean);
    return { popular: top, rest: COUNTRY_LIST.filter((c) => !POPULAR_COUNTRIES.includes(c.id)) };
  }
  const hits = COUNTRY_LIST.filter((c) => {
    const k = CURRENCY_BY_CODE[c.cur];
    return matches(q, c.en, c.ar, c.cur, c.id, c.alias, k && k.name);
  });
  return { popular: [], rest: hits };
};
const searchCurrencies = (query) => {
  const q = norm(query);
  const named = (c) => matches(q, c.cur, c.name, ...c.countries.flatMap((id) => {
    const x = COUNTRY_BY_ID[id]; return x ? [x.en, x.ar, x.alias] : [];
  }));
  if (!q) {
    const top = POPULAR_CURRENCIES.map((c) => CURRENCY_BY_CODE[c]).filter(Boolean);
    return { popular: top, rest: CURRENCY_LIST.filter((c) => !POPULAR_CURRENCIES.includes(c.cur)) };
  }
  return { popular: [], rest: CURRENCY_LIST.filter(named) };
};
const currencyCountries = (c, lang) => c.countries.map((id) => COUNTRY_BY_ID[id] && COUNTRY_BY_ID[id][lang]).filter(Boolean);

// Live exchange rates: free, no API key (https://www.exchangerate-api.com, open access,
// updated daily). Only the currency code is sent. Cached for offline use.
const FX_URL = (base) => `https://open.er-api.com/v6/latest/${base}`;
const FX_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const fetchRates = async (base) => {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl && ctrl.abort(), 8000);
  try {
    const res = await fetch(FX_URL(base), ctrl ? { signal: ctrl.signal } : undefined);
    const data = await res.json();
    if (data.result !== 'success' || !data.rates) throw new Error('bad response');
    return { base, rates: data.rates, time: (data.time_last_update_unix || 0) * 1000 || Date.now(), fetched: Date.now() };
  } finally { clearTimeout(timer); }
};
const fmtRate = (r) => (r >= 100 ? r.toFixed(2) : r >= 1 ? r.toFixed(4) : r.toPrecision(4));
const fmtDate = (ms, lang) => {
  try { return new Date(ms).toLocaleDateString(lang === 'ar' ? 'ar' : 'en-GB', { day: 'numeric', month: 'short' }); }
  catch (e) { return new Date(ms).toISOString().slice(0, 10); }
};

// Used until the shopper picks a country (or after Skip): plain numbers, no tax.
const NO_REGION = { id: '', cur: '', sym: '', dec: 2, vat: null };

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
  dotPrice: '#FFFFFF', dotDiscount: '#B9FFE9', dotTax: '#FFA3BE',
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
  dotPrice: '#5B4FE0', dotDiscount: '#12A587', dotTax: '#E2557E',
  tray: 'rgba(255,255,255,0.42)', key: 'rgba(255,255,255,0.72)', keyFn: 'rgba(255,255,255,0.38)', keyDown: 'rgba(255,255,255,0.95)',
  sheet: '#F7F6FF', dim: 'rgba(27,22,64,0.35)',
};

// ─── Translations ─────────────────────────────────────────────────────────────
const translations = {
  en: {
    appTitle: 'Shopping Calculator',
    welcomeLines: ['Shop smart.', 'Know the real price.', 'Hassle-free.'],
    price: 'Price', discount: 'Discount',
    tax: 'VAT / tax',
    pctOrAmt: (s) => `Tap % or ${s} to switch`, amt: 'Amt',
    deal: 'Store offer', dealAdd: 'Add an offer', dealAddShort: 'e.g. buy 1 get 1',
    dealTypes: { none: 'No offer', free: 'Free items', pct: 'Discount on extra items', bundle: 'Bundle price', bulk: 'Quantity discount', spend: 'Spend & save' },
    dealExample: { none: 'Pay the normal price for one item.', free: 'Example: buy 2, get 1 free', pct: 'Example: buy 1, get the 2nd at 50% off', bundle: 'Example: 3 for AED 100', bulk: 'Example: buy 3 or more, 20% off all', spend: 'Example: spend AED 200, save AED 50' },
    dealQuick: 'QUICK PICKS', dealKind: 'SET THE DEAL CRITERIA', getFree: 'You get free', getDisc: 'Discounted items',
    dealTpl: { b1g1: 'Buy 1 get 1 free', second50: '2nd at 50% off', b2g1: 'Buy 2 get 1 free', b1g1_25: '2nd at 25% off', bundle3: '3 for a price', bulk3: 'Buy 3, save 20%', spend: 'Spend & save' },
    dealSecond: (p) => `Buy 1, get the 2nd ${p}% off`,
    dealBundle: (n, a) => `${n} for ${a}`, dealBundleSet: (n) => `${n} for … (enter the price)`,
    dealBulk: (n, p) => `Buy ${n}+, save ${p}%`,
    dealSpend: (min, off) => `Spend ${min}, save ${off}`, dealSpendSet: 'Spend & save (enter the amounts)',
    dealItems: 'Number of items', dealFor: 'Bundle price', dealAtLeast: 'Minimum items', dealOffAll: 'Discount on all items',
    dealSpendMin: 'Minimum spend', dealSpendOff: 'You save',
    spendShort: (a) => `Add ${a} more to unlock the deal`,
    searchCountry: 'Search country or currency (e.g. AED)', searchCurrency: 'Search currency or country (e.g. USD)',
    popular: 'POPULAR', allCountries: 'ALL COUNTRIES', allCurrencies: 'ALL CURRENCIES', noResults: 'No matches',
    vatUnknown: 'We don’t have this country’s VAT rate. Enter it in the VAT row.',
    fxToday: "TODAY'S RATE", fxConfirm: 'Use this rate', fxInUse: 'In use', fxChange: 'Change',
    fxOwnTitle: 'OR ENTER YOUR OWN RATE (E.G. FROM YOUR BANK)', fxUseOwn: 'Use my rate', fxUpdateOwn: 'Update my rate',
    fxTurnOff: 'Turn off conversion', fxConfirmPrompt: (c) => `Confirm the ${c} rate`,
    fxInHome: (c) => `IN YOUR CURRENCY (${c})`, fxInHomeEmpty: 'SHOPPING ABROAD?', fxPromptCard: 'See this price in your own currency', fxSetUp: 'Set up', fxConfirmShort: 'Confirm',
    hideKeypad: 'Hide keypad', tapToEdit: 'Tap a row to enter a value',
    vatSaveDefault: (v) => `Save ${v}% as default VAT`, vatSaved: 'Default VAT saved',
    vatEdit: 'VAT rate (%) — edit if it’s not right',
    dealFree: (b, g) => `Buy ${b} get ${g} free`,
    dealPct: (b, g, p) => `Buy ${b}, get ${g} at ${p}% off`,
    buy: 'You buy', get: 'You get', dealOff: 'Discount on them', dealHint: 'The price you enter is for one item.',
    forItems: (n, each) => `for ${n} items · ${each} each`, perItem: 'Per item',
    regionTitle: 'Where are you shopping?',
    regionSub: 'Sets the currency and the VAT rate. You can change it any time.',
    skip: 'Skip', other: 'Other (enter manually)',
    vatLabel: (v) => (v === null || v === undefined ? 'VAT not set' : v > 0 ? `VAT ${v}%` : 'No VAT'),
    noteVaries: 'rate varies', noteState: 'add your state tax',
    confirmTitle: 'Save as your default?',
    confirmSub: "If you save it, we won't ask again. Change it any time with the currency button.",
    saveDefault: 'Save as default', justOnce: 'Just this time', back: 'Back',
    currencyCode: 'Currency code (e.g. AED)', vatRate: 'VAT / tax %', continueBtn: 'Continue',
    currencyBtn: 'Currency and VAT',
    cleared: 'All fields cleared', undo: 'Undo',
    fxPrompt: 'Show price in your home currency', fxTitle: 'Your home currency',
    fxSub: 'See what you pay in your own currency while you shop abroad.',
    fxOff: 'Off', fxApprox: (a) => `≈ ${a}`, fxIn: 'In your currency',
    fxRate: (from, rate, to) => `1 ${from} = ${rate} ${to}`,
    fxUpdated: (d) => `Live rate · updated ${d}`, fxManualOn: 'Your own rate',
    fxOffline: (d) => `Offline · last rate from ${d}`, fxLoading: 'Getting today’s rate…',
    fxFailed: 'Couldn’t get the rate. Check your connection or enter your own rate.',
    fxRefresh: 'Refresh', fxOwn: 'Use my own rate', fxOwnHint: (from, to) => `1 ${from} = ? ${to}`,
    fxUseLive: 'Use live rate', fxSave: 'Save rate', fxSame: 'Same as the shopping currency',
    fxNeedRegion: 'Choose where you are shopping first (currency button).', fxSource: 'Rates by Exchange Rate API',
    scanUnavailable: 'Scanning works in the app on your phone.',
    finalPrice: 'FINAL PRICE', reset: 'Reset', details: 'Details', done: 'Done',
    youSave: (a, p) => `You save ${a} · ${p}%`,
    inclTax: (a) => `incl. ${a} tax`,
    enterPrice: 'Enter a price to begin',
    priceHint: 'Tap the camera to scan a price tag',
    breakdown: 'Breakdown', original: 'Original price', subtotal: 'Subtotal', total: 'Total',
    effective: 'Effective discount',
    next: 'Next', clearField: 'C', backspace: 'Delete',
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
    price: 'السعر', discount: 'الخصم',
    tax: 'الضريبة',
    pctOrAmt: (s) => `اضغط % أو ${s} للتبديل`, amt: 'مبلغ',
    deal: 'عرض المتجر', dealAdd: 'إضافة عرض', dealAddShort: 'مثل: اشترِ 1 واحصل على 1',
    dealTypes: { none: 'بدون عرض', free: 'قطع مجانية', pct: 'خصم على قطع إضافية', bundle: 'سعر الحزمة', bulk: 'خصم الكمية', spend: 'أنفق ووفّر' },
    dealExample: { none: 'ادفع السعر العادي لقطعة واحدة.', free: 'مثال: اشترِ 2 واحصل على 1 مجاناً', pct: 'مثال: اشترِ 1 والثانية بخصم 50%', bundle: 'مثال: 3 قطع بـ 100 درهم', bulk: 'مثال: اشترِ 3 أو أكثر بخصم 20% على الكل', spend: 'مثال: أنفق 200 درهم ووفّر 50' },
    dealQuick: 'اختيارات سريعة', dealKind: 'حدد شروط العرض', getFree: 'تحصل مجاناً على', getDisc: 'القطع المخفّضة',
    dealTpl: { b1g1: 'اشترِ 1 واحصل على 1 مجاناً', second50: 'الثانية بخصم 50%', b2g1: 'اشترِ 2 واحصل على 1 مجاناً', b1g1_25: 'الثانية بخصم 25%', bundle3: '3 بسعر', bulk3: 'اشترِ 3 ووفّر 20%', spend: 'أنفق ووفّر' },
    dealSecond: (p) => `اشترِ 1 والثانية بخصم ${p}%`,
    dealBundle: (n, a) => `${n} بسعر ‎${a}‏`, dealBundleSet: (n) => `${n} بسعر … (أدخل السعر)`,
    dealBulk: (n, p) => `اشترِ ${n} أو أكثر ووفّر ${p}%`,
    dealSpend: (min, off) => `أنفق ‎${min}‏ ووفّر ‎${off}‏`, dealSpendSet: 'أنفق ووفّر (أدخل المبالغ)',
    dealItems: 'عدد القطع', dealFor: 'سعر الحزمة', dealAtLeast: 'الحد الأدنى للقطع', dealOffAll: 'الخصم على كل القطع',
    dealSpendMin: 'الحد الأدنى للإنفاق', dealSpendOff: 'توفّر',
    spendShort: (a) => `أضف ‎${a}‏ للحصول على العرض`,
    searchCountry: 'ابحث عن دولة أو عملة (مثل AED)', searchCurrency: 'ابحث عن عملة أو دولة (مثل USD)',
    popular: 'الأكثر استخداماً', allCountries: 'كل الدول', allCurrencies: 'كل العملات', noResults: 'لا توجد نتائج',
    vatUnknown: 'لا نعرف نسبة الضريبة لهذه الدولة. أدخلها في خانة الضريبة.',
    fxToday: 'سعر اليوم', fxConfirm: 'استخدام هذا السعر', fxInUse: 'مستخدم', fxChange: 'تغيير',
    fxOwnTitle: 'أو أدخل سعرك الخاص (مثلاً من بنكك)', fxUseOwn: 'استخدام سعري', fxUpdateOwn: 'تحديث سعري',
    fxTurnOff: 'إيقاف التحويل', fxConfirmPrompt: (c) => `أكّد سعر ${c}`,
    fxInHome: (c) => `بعملتك (${c})`, fxInHomeEmpty: 'تتسوق في الخارج؟', fxPromptCard: 'اعرف هذا السعر بعملتك', fxSetUp: 'إعداد', fxConfirmShort: 'تأكيد',
    hideKeypad: 'إخفاء لوحة الأرقام', tapToEdit: 'اضغط على خانة لإدخال قيمة',
    vatSaveDefault: (v) => `حفظ \u200E${v}%\u200F كضريبة افتراضية`, vatSaved: 'تم حفظ الضريبة الافتراضية',
    vatEdit: 'نسبة الضريبة (%) — عدّلها إن لم تكن صحيحة',
    dealFree: (b, g) => `اشترِ ${b} واحصل على ${g} مجاناً`,
    dealPct: (b, g, p) => `اشترِ ${b} واحصل على ${g} بخصم ${p}%`,
    buy: 'تشتري', get: 'تحصل على', dealOff: 'الخصم عليها', dealHint: 'السعر الذي تدخله لقطعة واحدة.',
    forItems: (n, each) => `لـ ${n} قطع · ‎${each}‏ للقطعة`, perItem: 'سعر القطعة',
    regionTitle: 'أين تتسوق؟',
    regionSub: 'يحدد العملة ونسبة الضريبة. يمكنك تغييره في أي وقت.',
    skip: 'تخطي', other: 'أخرى (إدخال يدوي)',
    vatLabel: (v) => (v === null || v === undefined ? 'الضريبة غير محددة' : v > 0 ? `ضريبة \u200E${v}%\u200F` : 'بدون ضريبة'),
    noteVaries: 'النسبة تختلف', noteState: 'أضف ضريبة ولايتك',
    confirmTitle: 'حفظ كإعداد افتراضي؟',
    confirmSub: 'عند الحفظ لن نسألك مرة أخرى. يمكنك تغييره في أي وقت من زر العملة.',
    saveDefault: 'حفظ كافتراضي', justOnce: 'هذه المرة فقط', back: 'رجوع',
    currencyCode: 'رمز العملة (مثل AED)', vatRate: 'نسبة الضريبة %', continueBtn: 'متابعة',
    currencyBtn: 'العملة والضريبة',
    cleared: 'تم مسح الحقول', undo: 'تراجع',
    fxPrompt: 'اعرض السعر بعملة بلدك', fxTitle: 'عملة بلدك',
    fxSub: 'اعرف كم تدفع بعملتك أثناء التسوق في الخارج.',
    fxOff: 'إيقاف', fxApprox: (a) => `≈ ‎${a}‏`, fxIn: 'بعملتك',
    fxRate: (from, rate, to) => `‎1 ${from} = ${rate} ${to}‏`,
    fxUpdated: (d) => `سعر مباشر · تحديث ${d}`, fxManualOn: 'سعرك الخاص',
    fxOffline: (d) => `بدون إنترنت · آخر سعر ${d}`, fxLoading: 'جارٍ جلب سعر اليوم…',
    fxFailed: 'تعذر جلب السعر. تحقق من الاتصال أو أدخل سعرك الخاص.',
    fxRefresh: 'تحديث', fxOwn: 'استخدام سعري الخاص', fxOwnHint: (from, to) => `‎1 ${from} = ? ${to}‏`,
    fxUseLive: 'استخدام السعر المباشر', fxSave: 'حفظ السعر', fxSame: 'نفس عملة التسوق',
    fxNeedRegion: 'اختر مكان التسوق أولاً (زر العملة).', fxSource: 'الأسعار من Exchange Rate API',
    scanUnavailable: 'المسح يعمل داخل التطبيق على هاتفك.',
    finalPrice: 'السعر النهائي', reset: 'مسح الكل', details: 'التفاصيل', done: 'تم',
    youSave: (a, p) => `وفّرت ‎${a} · ${p}%‏`,
    inclTax: (a) => `شامل ضريبة ‎${a}‏`,
    enterPrice: 'أدخل السعر للبدء',
    priceHint: 'اضغط على الكاميرا لمسح بطاقة السعر',
    breakdown: 'التفاصيل', original: 'السعر الأصلي', subtotal: 'المجموع قبل الضريبة', total: 'الإجمالي',
    effective: 'الخصم الفعلي',
    next: 'التالي', clearField: 'C', backspace: 'حذف',
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
 * Applies discounts in order on the running price, then tax.
 * Each adjustment is { value, type: 'pct' | 'amt' }. A fixed amount can never
 * push the price below zero.
 */
// Items a deal covers: buy + get, the bundle size, the bulk minimum, or the chosen count.
const dealQty = (d) => {
  if (!d) return 1;
  if (d.type === 'free' || d.type === 'pct') return d.buy + d.get;
  if (d.type === 'bundle' || d.type === 'spend') return d.n;
  if (d.type === 'bulk') return d.min;
  return 1;
};
const calculate = ({ price, discounts, tax, deal }) => {
  const unit = parseNum(price);
  // Multi-buy deals. The price entered is per item. Item deals (free / % off / bundle /
  // bulk) apply first, then discounts, then "spend & save", then tax.
  const d = deal && deal.type !== 'none' ? deal : null;
  const qty = dealQty(d);
  const p = unit * qty;
  let running = p;
  const steps = [];
  let spendShort = 0;
  if (d && unit > 0) {
    let cut = 0;
    if (d.type === 'free') cut = unit * d.get;
    else if (d.type === 'pct') cut = unit * d.get * Math.min(d.pct, 100) / 100;
    else if (d.type === 'bundle') { const bp = parseNum(d.bundle); cut = bp > 0 ? Math.max(0, p - bp) : 0; }
    else if (d.type === 'bulk') cut = p * Math.min(d.offPct, 100) / 100;
    if (cut > 0) { running -= cut; steps.push({ kind: 'deal', amount: -cut }); }
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
  if (d && d.type === 'spend' && unit > 0) {
    const min = parseNum(d.spend); const off = parseNum(d.spendOff);
    if (off > 0 && running >= min) {
      const cut = d.spendType === 'pct' ? running * Math.min(off, 100) / 100 : Math.min(off, running);
      running -= cut; steps.push({ kind: 'deal', amount: -cut });
    } else if (off > 0) spendShort = min - running;
  }
  const tv = parseNum(tax);
  const taxAmount = running * tv / 100;
  if (tv > 0) steps.push({ kind: 'tax', type: 'pct', value: tv, amount: taxAmount });
  const savings = p - running;
  const final = running + taxAmount;
  return {
    unit, qty, original: p, subtotal: running, tax: taxAmount, final, perItem: final / qty, spendShort,
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

const DetailsSheet = ({ visible, onClose, theme, t, rtl, result, stepLabel, font, money, converted }) => {
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
        {result.savings > 0 && <Line label={t.effective} value={`${result.savingsPct.toFixed(1)}%`} color={theme.save} last={!converted} />}
        {!!converted && <Line label={t.fxIn} value={t.fxApprox(converted)} last />}
      </View>
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

const FieldRow = ({ field, active, last, onPress, onToggleType, onScan, theme, rtl, t, font, sym, amtShort }) => {
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
const DEFAULT_DEAL = { type: 'none', buy: 1, get: 1, pct: 50, n: 3, bundle: '', min: 3, offPct: 20, spend: '', spendOff: '', spendType: 'amt' };
const DEAL_TYPES = ['none', 'free', 'pct', 'bundle', 'bulk', 'spend'];
// One-tap versions of the most common shop offers.
const DEAL_TEMPLATES = [
  { key: 'b1g1', deal: { type: 'free', buy: 1, get: 1 } },
  { key: 'second50', deal: { type: 'pct', buy: 1, get: 1, pct: 50 } },
  { key: 'b2g1', deal: { type: 'free', buy: 2, get: 1 } },
  { key: 'b1g1_25', deal: { type: 'pct', buy: 1, get: 1, pct: 25 } },
  { key: 'bundle3', deal: { type: 'bundle', n: 3 } },
  { key: 'bulk3', deal: { type: 'bulk', min: 3, offPct: 20 } },
];
const DEAL_OFF_PCTS = [10, 15, 20, 25, 30, 50];
const dealText = (d, t, money) => {
  const short = (n) => (Number.isInteger(n) ? money(n).replace(/[.,]0+$/, '') : money(n));
  if (d.type === 'free') return t.dealFree(d.buy, d.get);
  if (d.type === 'pct') return d.buy === 1 && d.get === 1 ? t.dealSecond(d.pct) : t.dealPct(d.buy, d.get, d.pct);
  if (d.type === 'bundle') return parseNum(d.bundle) > 0 ? t.dealBundle(d.n, short(parseNum(d.bundle))) : t.dealBundleSet(d.n);
  if (d.type === 'bulk') return t.dealBulk(d.min, d.offPct);
  if (d.type === 'spend') {
    const off = parseNum(d.spendOff);
    if (!(off > 0) || !(parseNum(d.spend) >= 0)) return t.dealSpendSet;
    return t.dealSpend(short(parseNum(d.spend)), d.spendType === 'pct' ? `${trimNum(off)}%` : short(off));
  }
  return t.dealAdd;
};
const cleanAmount = (v, dec) => {
  const s = v.replace(',', '.').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
  const [i, f] = s.split('.');
  if (f === undefined) return i.slice(0, 9);
  return dec === 0 ? i.slice(0, 9) : `${i.slice(0, 9)}.${f.slice(0, dec)}`;
};

const Stepper = ({ label, value, onChange, theme, font, rtl, min = 1 }) => (
  <View style={[styles.stepper, { flexDirection: flow(rtl) }]}>
    <Text style={[styles.stepperLabel, font(700), { color: theme.textSecondary, textAlign: rtl ? 'right' : 'left' }]}>{label}</Text>
    <View style={[styles.stepperCtl, { backgroundColor: theme.glass, flexDirection: flow(false) }]}>
      <Pressable onPress={() => { haptic.select(); onChange(Math.max(min, value - 1)); }} hitSlop={6} style={styles.stepperBtn} accessibilityLabel={`${label} −`}>
        <Ionicons name="remove" size={20} color={theme.text} />
      </Pressable>
      <Text style={[styles.stepperValue, num(800), { color: theme.text }]}>{value}</Text>
      <Pressable onPress={() => { haptic.select(); onChange(Math.min(DEAL_MAX, value + 1)); }} hitSlop={6} style={styles.stepperBtn} accessibilityLabel={`${label} +`}>
        <Ionicons name="add" size={20} color={theme.text} />
      </Pressable>
    </View>
  </View>
);

const ChipRow = ({ items, value, onPick, theme, rtl, wrap }) => (
  <View style={[styles.chipInner, { flexDirection: flow(rtl), paddingHorizontal: 0, flexWrap: wrap ? 'wrap' : 'nowrap' }]}>
    {items.map((it) => {
      const on = it.value === value;
      return (
        <Pressable key={String(it.value)} onPress={() => { haptic.select(); onPick(it.value); }}
          style={[styles.chip, { backgroundColor: on ? theme.solid : theme.glass }]}>
          <Text style={[styles.chipText, num(700), { color: on ? theme.onSolid : theme.text }]}>{it.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

const AmountField = ({ label, value, onChange, theme, font, rtl, rg, placeholder }) => (
  <View style={[styles.stepper, { flexDirection: flow(rtl) }]}>
    <Text style={[styles.stepperLabel, font(700), { color: theme.textSecondary, textAlign: rtl ? 'right' : 'left' }]}>{label}</Text>
    <View style={[styles.amountBox, { flexDirection: flow(false), backgroundColor: theme.glass }]}>
      {!!rg.sym && <Text style={[styles.amountSym, num(700), { color: theme.textSecondary }]}>{rg.sym}</Text>}
      <TextInput value={value} onChangeText={(v) => onChange(cleanAmount(v, rg.dec))} keyboardType="decimal-pad"
        placeholder={placeholder || '0'} placeholderTextColor={theme.textMuted}
        style={[styles.amountInput, num(800), { color: theme.text }]} />
    </View>
  </View>
);

const DealSheet = ({ visible, onClose, deal, onChange, theme, t, font, rtl, money, rg }) => {
  const set = (patch) => onChange({ ...deal, ...patch });
  const preview = deal.type === 'none' ? t.dealHint : `${dealText(deal, t, money)} · ${t.dealHint}`;
  return (
    <SheetFrame visible={visible} onClose={onClose} theme={theme} tall>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flexShrink: 1 }}>
        <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.sheetNav, { flexDirection: flow(rtl) }]}>
            <Text style={[styles.sheetTitle, font(800), { color: theme.text, flex: 1, textAlign: rtl ? 'right' : 'left' }]}>{t.deal}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={[styles.pill, { backgroundColor: theme.solid }]}>
              <Text style={[styles.pillText, font(700), { color: theme.onSolid }]}>{t.done}</Text>
            </Pressable>
          </View>

          <Text style={[styles.sectionLabel, font(700), { color: theme.textSecondary, textAlign: rtl ? 'right' : 'left' }]}>{t.dealQuick}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chipInner, { flexDirection: flow(rtl), paddingHorizontal: 0 }]}>
            {DEAL_TEMPLATES.map((tp) => (
              <Pressable key={tp.key} onPress={() => { haptic.select(); onChange({ ...DEFAULT_DEAL, ...deal, ...tp.deal }); }}
                style={[styles.chip, styles.templateChip, { backgroundColor: theme.glassStrong }]}>
                <Text style={[styles.chipText, font(700), { color: theme.text }]}>{t.dealTpl[tp.key]}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={[styles.sectionLabel, font(700), { color: theme.textSecondary, textAlign: rtl ? 'right' : 'left' }]}>{t.dealKind}</Text>
          <View style={[styles.chipInner, { flexDirection: flow(rtl), paddingHorizontal: 0, flexWrap: 'wrap' }]}>
            {DEAL_TYPES.map((v) => {
              const on = deal.type === v;
              return (
                <Pressable key={v} onPress={() => { haptic.select(); set({ type: v, ...(v !== deal.type && v === 'spend' ? { n: 1 } : v !== deal.type && v === 'bundle' ? { n: Math.max(2, deal.n) } : {}) }); }}
                  style={[styles.chip, { backgroundColor: on ? theme.solid : theme.glass }]}>
                  <Text style={[styles.chipText, font(700), { color: on ? theme.onSolid : theme.text }]}>{t.dealTypes[v]}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.dealExample, font(600), { color: theme.save, textAlign: rtl ? 'right' : 'left' }]}>{t.dealExample[deal.type]}</Text>
          {deal.type !== 'none' && (
            <View style={[styles.glassCard, { backgroundColor: theme.glass, borderColor: theme.glassBorder, padding: 14, gap: 12 }]}>
              {(deal.type === 'free' || deal.type === 'pct') && (
                <>
                  <Stepper label={t.buy} value={deal.buy} onChange={(buy) => set({ buy })} theme={theme} font={font} rtl={rtl} />
                  <Stepper label={deal.type === 'free' ? t.getFree : t.getDisc} value={deal.get} onChange={(get) => set({ get })} theme={theme} font={font} rtl={rtl} />
                </>
              )}
              {deal.type === 'pct' && (
                <View style={{ gap: 8 }}>
                  <Text style={[styles.stepperLabel, font(700), { color: theme.textSecondary, textAlign: rtl ? 'right' : 'left' }]}>{t.dealOff}</Text>
                  <ChipRow items={[25, 30, 40, 50, 75].map((p) => ({ value: p, label: `${p}%` }))} value={deal.pct} onPick={(pct) => set({ pct })} theme={theme} rtl={rtl} wrap />
                </View>
              )}
              {deal.type === 'bundle' && (
                <>
                  <Stepper label={t.dealItems} value={deal.n} min={2} onChange={(n) => set({ n })} theme={theme} font={font} rtl={rtl} />
                  <AmountField label={t.dealFor} value={deal.bundle} onChange={(bundle) => set({ bundle })} theme={theme} font={font} rtl={rtl} rg={rg} />
                </>
              )}
              {deal.type === 'bulk' && (
                <>
                  <Stepper label={t.dealAtLeast} value={deal.min} min={2} onChange={(min) => set({ min })} theme={theme} font={font} rtl={rtl} />
                  <View style={{ gap: 8 }}>
                    <Text style={[styles.stepperLabel, font(700), { color: theme.textSecondary, textAlign: rtl ? 'right' : 'left' }]}>{t.dealOffAll}</Text>
                    <ChipRow items={DEAL_OFF_PCTS.map((p) => ({ value: p, label: `${p}%` }))} value={deal.offPct} onPick={(offPct) => set({ offPct })} theme={theme} rtl={rtl} wrap />
                  </View>
                </>
              )}
              {deal.type === 'spend' && (
                <>
                  <Stepper label={t.dealItems} value={deal.n} onChange={(n) => set({ n })} theme={theme} font={font} rtl={rtl} />
                  <AmountField label={t.dealSpendMin} value={deal.spend} onChange={(spend) => set({ spend })} theme={theme} font={font} rtl={rtl} rg={rg} />
                  <View style={[styles.stepper, { flexDirection: flow(rtl) }]}>
                    <Text style={[styles.stepperLabel, font(700), { color: theme.textSecondary, textAlign: rtl ? 'right' : 'left' }]}>{t.dealSpendOff}</Text>
                    <View style={[{ flexDirection: flow(false), gap: 6, alignItems: 'center' }]}>
                      <View style={[styles.amountBox, { flexDirection: flow(false), backgroundColor: theme.glass, minWidth: 96 }]}>
                        <TextInput value={deal.spendOff} onChangeText={(v) => set({ spendOff: cleanAmount(v, deal.spendType === 'pct' ? 2 : rg.dec) })}
                          keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.textMuted}
                          style={[styles.amountInput, num(800), { color: theme.text }]} />
                      </View>
                      <View style={[styles.typeToggle, { backgroundColor: theme.glass }]}>
                        {['amt', 'pct'].map((ty) => (
                          <Pressable key={ty} onPress={() => { haptic.select(); set({ spendType: ty }); }}
                            style={[styles.typeOpt, { height: 32 }, deal.spendType === ty && { backgroundColor: theme.solid }]}>
                            <Text style={[styles.typeOptText, num(800), { color: deal.spendType === ty ? theme.onSolid : theme.textSecondary }]}>{ty === 'pct' ? '%' : (rg.sym || t.amt)}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  </View>
                </>
              )}
            </View>
          )}
          <Text style={[styles.note, font(600), { color: deal.type === 'none' ? theme.textSecondary : theme.save, textAlign: 'center' }]}>{preview}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SheetFrame>
  );
};

// ─── Country picker (first launch, and from the currency button) ─────────────
const SearchBox = ({ value, onChange, placeholder, theme, font, rtl }) => (
  <View style={[styles.searchBox, { flexDirection: flow(rtl), backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
    <Ionicons name="search" size={18} color={theme.textMuted} />
    <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={theme.textMuted}
      autoCorrect={false} autoCapitalize="none" returnKeyType="search"
      style={[styles.searchInput, font(600), { color: theme.text, textAlign: rtl ? 'right' : 'left' }]} />
    {!!value && (
      <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityLabel="Clear search">
        <Ionicons name="close-circle" size={18} color={theme.textMuted} />
      </Pressable>
    )}
  </View>
);

const ListHeader = ({ label, theme, font, rtl }) => (
  <Text style={[styles.listHeader, font(800), { color: theme.textMuted, textAlign: rtl ? 'right' : 'left' }]}>{label}</Text>
);

const RegionSheet = ({ visible, fromButton, onSkip, onApply, theme, t, font, rtl, lang }) => {
  const [step, setStep] = useState('pick');
  const [pending, setPending] = useState(null);
  const [query, setQuery] = useState('');
  const [code, setCode] = useState('');
  const [vat, setVat] = useState('');
  const [vatEdit, setVatEdit] = useState('');
  useEffect(() => { if (visible) { setStep('pick'); setPending(null); setQuery(''); } }, [visible]);
  useEffect(() => { if (pending) setVatEdit(pending.vat === null || pending.vat === undefined ? '' : String(pending.vat)); }, [pending]);
  // The shopper can correct the VAT before saving the country.
  const withVat = (r) => {
    const txt = vatEdit.replace(',', '.').trim();
    if (txt === '') return { ...r, vat: r.vat === null ? null : 0 };
    return { ...r, vat: Math.round(Math.min(parseNum(txt), 100) * 100) / 100 };
  };
  const align = rtl ? 'right' : 'left';
  const noteText = (c) => (c.note === 'varies' ? t.noteVaries : c.note === 'state' ? t.noteState : '');
  const pick = (r) => { haptic.select(); setPending(r); setStep('confirm'); };
  const manualDone = () => {
    const cur = code.trim().toUpperCase().slice(0, 5);
    const known = CURRENCY_BY_CODE[cur];
    const rate = Math.min(parseNum(vat.replace(',', '.')), 100);
    pick({ id: 'XX', en: cur || '—', ar: cur || '—', cur, sym: known ? known.sym : cur, dec: known ? known.dec : 2, vat: Math.round(rate * 100) / 100 });
  };
  const { popular, rest } = useMemo(() => searchCountries(query), [query]);
  const Btn = ({ label, onPress, primary }) => (
    <Pressable onPress={onPress}
      style={({ pressed }) => [styles.sheetBtn, { backgroundColor: primary ? theme.solid : theme.glassStrong, opacity: pressed ? 0.8 : 1 }]}>
      <Text style={[styles.sheetBtnText, font(700), { color: primary ? theme.onSolid : theme.text }]}>{label}</Text>
    </Pressable>
  );
  const Row = ({ c }) => (
    <Pressable onPress={() => pick(regionFromCountry(c))}
      style={({ pressed }) => [styles.regionRow, { flexDirection: flow(rtl), backgroundColor: pressed ? theme.glassStrong : 'transparent', borderBottomWidth: HAIRLINE, borderBottomColor: theme.separator }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.regionName, font(700), { color: theme.text, textAlign: align }]}>{c[lang]}</Text>
        <Text style={[styles.regionMeta, font(600), { color: theme.textSecondary, textAlign: align }]}>
          {`${c.cur} · ${t.vatLabel(c.vat)}${noteText(c) ? ` · ${noteText(c)}` : ''}`}
        </Text>
      </View>
      <Text style={[styles.regionCode, num(800), { color: theme.textMuted }]}>{c.cur}</Text>
    </Pressable>
  );
  return (
    <SheetFrame visible={visible} onClose={onSkip} theme={theme} tall>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ gap: 12, flexShrink: 1 }}>
        {step === 'pick' && (
          <>
            <Text style={[styles.sheetTitle, font(800), { color: theme.text }]}>{t.regionTitle}</Text>
            <Text style={[styles.sheetSub, font(400), { color: theme.textSecondary }]}>{t.regionSub}</Text>
            <SearchBox value={query} onChange={setQuery} placeholder={t.searchCountry} theme={theme} font={font} rtl={rtl} />
            <ScrollView style={[styles.glassCard, styles.regionList, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}
              keyboardShouldPersistTaps="handled">
              {popular.length > 0 && <ListHeader label={t.popular} theme={theme} font={font} rtl={rtl} />}
              {popular.map((c) => <Row key={`p-${c.id}`} c={c} />)}
              {popular.length > 0 && <ListHeader label={t.allCountries} theme={theme} font={font} rtl={rtl} />}
              {rest.map((c) => <Row key={c.id} c={c} />)}
              {rest.length === 0 && popular.length === 0 && (
                <Text style={[styles.emptyText, font(600), { color: theme.textSecondary }]}>{t.noResults}</Text>
              )}
              <Pressable onPress={() => setStep('manual')}
                style={({ pressed }) => [styles.regionRow, { flexDirection: flow(rtl), backgroundColor: pressed ? theme.glassStrong : 'transparent' }]}>
                <Ionicons name="create-outline" size={18} color={theme.save} />
                <Text style={[styles.regionName, font(700), { color: theme.save, flex: 1, textAlign: align }]}>{t.other}</Text>
              </Pressable>
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
            <Text style={[styles.sectionLabel, font(700), { color: theme.textSecondary, textAlign: align }]}>{t.vatEdit}</Text>
            <View style={[styles.amountBox, { flexDirection: flow(false), backgroundColor: theme.glass, height: 52 }]}>
              <TextInput value={vatEdit} onChangeText={(v) => setVatEdit(v.replace(/[^0-9.,]/g, '').slice(0, 5))} keyboardType="decimal-pad"
                placeholder={pending.vat === null ? '—' : '0'} placeholderTextColor={theme.textMuted}
                style={[styles.amountInput, num(800), { color: theme.text, textAlign: 'center' }]} />
              <Text style={[styles.amountSym, num(800), { color: theme.textSecondary }]}>%</Text>
            </View>
            {pending.vat === null && vatEdit === '' && <Text style={[styles.regionMeta, font(600), { color: theme.save, textAlign: 'center' }]}>{t.vatUnknown}</Text>}
            <Text style={[styles.sheetSub, font(400), { color: theme.textSecondary }]}>{t.confirmSub}</Text>
            <Btn label={t.saveDefault} onPress={() => onApply(withVat(pending), true)} primary />
            <Btn label={t.justOnce} onPress={() => onApply(withVat(pending), false)} />
            <Pressable onPress={() => setStep('pick')} style={styles.sheetGhost}>
              <Text style={[styles.sheetBtnText, font(600), { color: theme.textSecondary }]}>{t.back}</Text>
            </Pressable>
          </>
        )}
      </KeyboardAvoidingView>
    </SheetFrame>
  );
};

// ─── Home-currency conversion ─────────────────────────────────────────────────
// Step 1: pick the home currency (search). Step 2: confirm today's rate or enter your own.
const FxSheet = ({ visible, onClose, rg, home, onHome, fx, onRefresh, manual, onManual, confirmed, onConfirm, theme, t, font, rtl, lang }) => {
  const [step, setStep] = useState('rate');
  const [query, setQuery] = useState('');
  const [own, setOwn] = useState('');
  useEffect(() => {
    if (!visible) return;
    setQuery(''); setOwn(manual ? String(manual) : '');
    setStep(home && rg.cur ? 'rate' : 'pick');
  }, [visible]);
  const align = rtl ? 'right' : 'left';
  const live = home && fx.rates ? fx.rates[home.cur] : null;
  const { popular, rest } = useMemo(() => searchCurrencies(query), [query]);
  const saveOwn = () => {
    const v = parseNum(own.replace(',', '.'));
    if (v > 0) { haptic.tap(); onManual(v); onClose(); }
  };
  const Row = ({ c }) => {
    const selected = home && home.cur === c.cur;
    const same = c.cur === rg.cur;
    const where = currencyCountries(c, lang);
    return (
      <Pressable disabled={same} onPress={() => { haptic.select(); onHome(c); setStep('rate'); }}
        style={({ pressed }) => [styles.regionRow, { flexDirection: flow(rtl), opacity: same ? 0.45 : 1, backgroundColor: pressed ? theme.glassStrong : 'transparent', borderBottomWidth: HAIRLINE, borderBottomColor: theme.separator }]}>
        <Text style={[styles.curCode, num(800), { color: theme.text }]}>{c.cur}</Text>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[styles.regionName, font(700), { color: theme.text, textAlign: align }]}>{lang === 'ar' && where[0] ? where[0] : c.name}</Text>
          <Text numberOfLines={1} style={[styles.regionMeta, font(600), { color: theme.textSecondary, textAlign: align }]}>
            {same ? t.fxSame : (lang === 'ar' ? where.slice(1, 4) : where.slice(0, 3)).join('، ') + (where.length > 3 ? ' …' : '')}
          </Text>
        </View>
        {selected && <Ionicons name="checkmark-circle" size={22} color={theme.save} />}
      </Pressable>
    );
  };
  const Btn = ({ label, onPress, primary, disabled }) => (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ pressed }) => [styles.sheetBtn, { backgroundColor: primary ? theme.solid : theme.glassStrong, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }]}>
      <Text style={[styles.sheetBtnText, font(700), { color: primary ? theme.onSolid : theme.text }]}>{label}</Text>
    </Pressable>
  );
  return (
    <SheetFrame visible={visible} onClose={onClose} theme={theme} tall>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ gap: 12, flexShrink: 1 }}>
        <View style={[styles.sheetNav, { flexDirection: flow(rtl) }]}>
          <Text style={[styles.sheetTitle, font(800), { color: theme.text, flex: 1, textAlign: align }]}>{t.fxTitle}</Text>
          <Pressable onPress={onClose} hitSlop={10} style={[styles.pill, { backgroundColor: theme.solid }]}>
            <Text style={[styles.pillText, font(700), { color: theme.onSolid }]}>{t.done}</Text>
          </Pressable>
        </View>
        {!rg.cur && <Text style={[styles.sheetSub, font(400), { color: theme.textSecondary, textAlign: align }]}>{t.fxNeedRegion}</Text>}

        {step === 'pick' && !!rg.cur && (
          <>
            <Text style={[styles.sheetSub, font(400), { color: theme.textSecondary, textAlign: align }]}>{t.fxSub}</Text>
            <SearchBox value={query} onChange={setQuery} placeholder={t.searchCurrency} theme={theme} font={font} rtl={rtl} />
            <ScrollView style={[styles.glassCard, styles.regionList, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]} keyboardShouldPersistTaps="handled">
              {popular.length > 0 && <ListHeader label={t.popular} theme={theme} font={font} rtl={rtl} />}
              {popular.map((c) => <Row key={`p-${c.cur}`} c={c} />)}
              {popular.length > 0 && <ListHeader label={t.allCurrencies} theme={theme} font={font} rtl={rtl} />}
              {rest.map((c) => <Row key={c.cur} c={c} />)}
              {rest.length === 0 && popular.length === 0 && <Text style={[styles.emptyText, font(600), { color: theme.textSecondary }]}>{t.noResults}</Text>}
            </ScrollView>
            {home && (
              <Pressable onPress={() => { haptic.select(); onHome(null); onClose(); }} style={styles.sheetGhost}>
                <Text style={[styles.sheetBtnText, font(600), { color: theme.danger }]}>{t.fxTurnOff}</Text>
              </Pressable>
            )}
          </>
        )}

        {step === 'rate' && home && !!rg.cur && (
          <>
            <Pressable onPress={() => setStep('pick')}
              style={({ pressed }) => [styles.glassCard, styles.regionRow, { flexDirection: flow(rtl), backgroundColor: pressed ? theme.glassStrong : theme.glass, borderColor: theme.glassBorder }]}>
              <Text style={[styles.curCode, num(800), { color: theme.text }]}>{rg.cur}</Text>
              <Ionicons name={rtl ? 'arrow-back' : 'arrow-forward'} size={18} color={theme.textMuted} />
              <Text style={[styles.curCode, num(800), { color: theme.save }]}>{home.cur}</Text>
              <Text style={[styles.regionMeta, font(700), { color: theme.textSecondary, flex: 1, textAlign: rtl ? 'left' : 'right' }]}>{t.fxChange}</Text>
            </Pressable>

            <View style={[styles.glassCard, { backgroundColor: theme.glass, borderColor: theme.glassBorder, padding: 16, gap: 6 }]}>
              <Text style={[styles.sectionLabel, font(700), { color: theme.textSecondary, textAlign: align }]}>{t.fxToday}</Text>
              <Text style={[styles.fxRateText, num(800), { color: live ? theme.text : theme.textMuted, textAlign: align }]}>
                {live ? t.fxRate(rg.cur, fmtRate(live), home.cur) : fx.loading ? t.fxLoading : '—'}
              </Text>
              <Text style={[styles.regionMeta, font(600), { color: live ? theme.textSecondary : theme.danger, textAlign: align }]}>
                {live ? (fx.error ? t.fxOffline(fmtDate(fx.time, lang)) : t.fxUpdated(fmtDate(fx.time, lang))) : fx.loading ? '' : t.fxFailed}
              </Text>
              <View style={[{ flexDirection: flow(rtl), gap: 8, marginTop: 4 }]}>
                <Pressable onPress={onRefresh} disabled={fx.loading} style={[styles.pill, { backgroundColor: theme.glassStrong, opacity: fx.loading ? 0.5 : 1 }]}>
                  <Ionicons name="refresh" size={13} color={theme.text} />
                  <Text style={[styles.pillText, font(700), { color: theme.text }]}>{t.fxRefresh}</Text>
                </Pressable>
                {!manual && confirmed && live && (
                  <View style={[styles.pill, { backgroundColor: 'transparent' }]}>
                    <Ionicons name="checkmark-circle" size={14} color={theme.save} />
                    <Text style={[styles.pillText, font(700), { color: theme.save }]}>{t.fxInUse}</Text>
                  </View>
                )}
              </View>
            </View>
            <Btn label={t.fxConfirm} primary disabled={!live} onPress={() => { haptic.tap(); onConfirm(); onClose(); }} />

            <View style={[styles.glassCard, { backgroundColor: theme.glass, borderColor: theme.glassBorder, padding: 16, gap: 10 }]}>
              <Text style={[styles.sectionLabel, font(700), { color: theme.textSecondary, textAlign: align }]}>{t.fxOwnTitle}</Text>
              <View style={[{ flexDirection: flow(rtl), gap: 8, alignItems: 'center' }]}>
                <Text style={[styles.regionMeta, num(700), { color: theme.textSecondary }]}>{`1 ${rg.cur} =`}</Text>
                <TextInput value={own} onChangeText={(v) => setOwn(v.replace(/[^0-9.,]/g, ''))}
                  placeholder="0.00" placeholderTextColor={theme.textMuted} keyboardType="decimal-pad" maxLength={12}
                  style={[styles.textInput, num(800), { flex: 1, color: theme.text, backgroundColor: theme.glass, borderColor: theme.glassBorder, textAlign: 'center' }]} />
                <Text style={[styles.regionMeta, num(700), { color: theme.textSecondary }]}>{home.cur}</Text>
              </View>
              <Btn label={manual ? t.fxUpdateOwn : t.fxUseOwn} onPress={saveOwn} disabled={!(parseNum(own.replace(',', '.')) > 0)} />
              {!!manual && (
                <Pressable onPress={() => { haptic.select(); onManual(null); }} style={styles.sheetGhost}>
                  <Text style={[styles.sheetBtnText, font(600), { color: theme.textSecondary }]}>{t.fxUseLive}</Text>
                </Pressable>
              )}
            </View>
            <Text style={[styles.fxSource, font(600), { color: theme.textMuted }]}>{t.fxSource}</Text>
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
    tax: typeof raw.tax === 'string' ? raw.tax : '',
    deal: { ...DEFAULT_DEAL, ...(raw.deal || {}) },
  };
};
const UNDO_MS = 5000;
// Home-currency layout: 'card' (own card under the price), 'inline' (inside the price
// card), 'bar' (slim bar). The web preview can pick one with ?fx=… to compare.
const FX_STYLE = (Platform.OS === 'web' && typeof location !== 'undefined' && new URLSearchParams(location.search).get('fx')) || 'card';
// Big total: smaller type for long amounts so it and the old price fit one line.
const heroSize = (len, compact) => Math.round((len > 12 ? 32 : len > 9 ? 38 : 46) * (compact ? 0.85 : 1));

const CalculatorScreen = () => {
  const systemScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [fontsLoaded] = useFonts({ Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  const [isDark, setIsDark] = useState(null);
  const [lang, setLang] = useState('en');
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
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [home, setHome] = useState(null);           // { cur, sym, dec } or null
  const [fxManual, setFxManual] = useState({});      // { 'AED>EUR': 0.25 }
  const [fxConfirmed, setFxConfirmed] = useState({}); // { 'AED>EUR': true } once the shopper accepts the live rate
  const [fx, setFx] = useState({ rates: null, time: 0, loading: false, error: false, base: '' });
  const [fxVisible, setFxVisible] = useState(false);
  const undoTimer = useRef(null);
  const listRef = useRef(null);
  const heights = useRef({});
  const scrollY = useRef(0);
  const viewH = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const [savedTheme, savedLang, savedRegion, savedForm, savedHome, savedFxManual, savedFxConfirmed] = await Promise.all(
          ['theme', 'lang', 'region', 'form', 'home', 'fxManual', 'fxConfirmed'].map((k) => AsyncStorage.getItem(k))
        );
        setIsDark(savedTheme !== null ? savedTheme === 'dark' : systemScheme !== 'light');
        if (savedLang && translations[savedLang]) setLang(savedLang);
        const h = savedHome ? JSON.parse(savedHome) : null;
        if (h && h.cur) setHome(h);
        if (savedFxManual) setFxManual(JSON.parse(savedFxManual) || {});
        if (savedFxConfirmed) setFxConfirmed(JSON.parse(savedFxConfirmed) || {});
        const r = savedRegion ? JSON.parse(savedRegion) : null;
        if (r && typeof r.dec === 'number') { setRegion(r); setRegionSaved(true); }
        const restored = savedForm ? restoreForm(JSON.parse(savedForm)) : null;
        if (restored) {
          setForm(restored);
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

  const theme = isDark === false ? lightTheme : darkTheme;
  const t = translations[lang];
  const rtl = lang === 'ar';
  const font = makeFont(!rtl);
  const compact = height < 720;
  const rg = region || NO_REGION;
  const money = (n) => fmtMoney(n, rg);
  const amtShort = rg.sym || t.amt;

  // Exchange rates for the shopping currency: cached copy first, refresh once a day.
  const loadRates = async (force) => {
    const base = rg.cur;
    if (!base) return;
    let cached = null;
    try { const raw = await AsyncStorage.getItem(`fx:${base}`); cached = raw ? JSON.parse(raw) : null; } catch (e) { cached = null; }
    if (cached) setFx({ ...cached, loading: false, error: false });
    if (!force && cached && Date.now() - cached.fetched < FX_MAX_AGE_MS) return;
    // Never carry another currency's rates over: start from this base's cache or nothing.
    setFx(cached ? { ...cached, loading: true, error: false } : { rates: null, time: 0, fetched: 0, base, loading: true, error: false });
    try {
      const fresh = await fetchRates(base);
      persist(`fx:${base}`, JSON.stringify(fresh));
      setFx({ ...fresh, loading: false, error: false });
    } catch (e) {
      setFx((f) => ({ ...f, base, loading: false, error: true }));
    }
  };
  useEffect(() => {
    if (loaded && home && rg.cur && home.cur !== rg.cur) loadRates(false);
  }, [loaded, home && home.cur, rg.cur]);

  const fxKey = home ? `${rg.cur}>${home.cur}` : '';
  const manualRate = fxManual[fxKey] || null;
  const liveRate = home && fx.base === rg.cur && fx.rates ? fx.rates[home.cur] : null;
  const pairReady = home && rg.cur && home.cur !== rg.cur;
  const fxRate = pairReady ? (manualRate || (fxConfirmed[fxKey] ? liveRate : null)) : null;
  const needsConfirm = pairReady && !manualRate && !fxConfirmed[fxKey];
  const homeRegion = home ? { sym: home.sym, dec: home.dec } : null;
  const chooseHome = (c) => {
    const h = c ? { cur: c.cur, sym: c.sym, dec: c.dec } : null;
    setHome(h);
    if (h) persist('home', JSON.stringify(h)); else AsyncStorage.removeItem('home').catch(() => {});
  };
  const confirmRate = () => {
    setFxConfirmed((m) => { const next = { ...m, [fxKey]: true }; persist('fxConfirmed', JSON.stringify(next)); return next; });
  };
  const setManual = (v) => {
    setFxManual((m) => {
      const next = { ...m };
      if (v) next[fxKey] = v; else delete next[fxKey];
      persist('fxManual', JSON.stringify(next));
      return next;
    });
  };

  // Ordered list of editable fields; "Next" walks through it.
  const fields = useMemo(() => {
    const list = [{ key: 'price', kind: 'price', label: t.price, dot: theme.dotPrice, value: form.price, type: 'amt', adjustable: false }];
    form.discounts.slice(0, 1).forEach((d, i) => list.push({
      key: `d${i}`, kind: 'discount', label: t.discount,
      dot: theme.dotDiscount, value: d.value, type: d.type, adjustable: true,
    }));
    list.push({ key: 'tax', kind: 'tax', label: t.tax, dot: theme.dotTax, value: form.tax, type: 'pct', adjustable: false });
    return list;
  }, [form, t, theme]);

  const current = fields.find((f) => f.key === selected) || fields[0];
  const lastDiscountKey = 'd0';
  const lastDiscountKeyRef = useRef(lastDiscountKey);
  lastDiscountKeyRef.current = lastDiscountKey;

  // If the selected field disappears, fall back to price.
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
  }, [current.key, fields.length]);

  const updateField = (key, fn) => setForm((f) => {
    if (key === 'price') return { ...f, price: fn({ value: f.price, type: 'amt' }).value };
    if (key === 'tax') return { ...f, tax: fn({ value: f.tax, type: 'pct' }).value };
    const i = Number(key.slice(1));
    return { ...f, discounts: f.discounts.map((d, j) => (j === i ? { ...d, ...fn(d) } : d)) };
  });

  const toggleType = (key) => updateField(key, (adj) => {
    const type = adj.type === 'pct' ? 'amt' : 'pct';
    const value = type === 'pct' && parseNum(adj.value) > 100 ? '100' : adj.value;
    return { type, value };
  });

  const openKeypad = () => { if (!keypadOpen) { animateKeypad(); setKeypadOpen(true); } };
  const closeKeypad = () => { if (keypadOpen) { haptic.select(); animateKeypad(); setKeypadOpen(false); } };
  const selectField = (key) => { if (key !== selected || !keypadOpen) haptic.select(); setSelected(key); openKeypad(); };
  // Android Back closes the keypad first.
  useEffect(() => {
    if (!keypadOpen) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { closeKeypad(); return true; });
    return () => sub.remove();
  }, [keypadOpen]);

  // Correcting the VAT row can update the country's default rate.
  const taxDiffers = rg.cur && parseNum(form.tax) !== (rg.vat || 0) && form.tax !== '';
  const saveVatDefault = () => {
    const v = Math.round(Math.min(parseNum(form.tax), 100) * 100) / 100;
    haptic.tap();
    const next = { ...rg, vat: v };
    setRegion(next);
    if (regionSaved) persist('region', JSON.stringify(next));
  };

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
    discounts: form.discounts.slice(0, 1),
    tax: form.tax,
    deal: form.deal,
  }), [form]);

  const canReset = !!(form.price || form.discounts.some((d) => d.value)
    || form.deal.type !== 'none' || form.tax !== (rg.vat > 0 ? String(rg.vat) : ''));

  const adjText = (s) => (s.type === 'pct' ? `${trimNum(s.value)}%` : money(s.value));
  const stepLabel = (s) => {
    if (s.kind === 'discount') return `${t.discount} (${adjText(s)})`;
    if (s.kind === 'deal') return dealText(form.deal, t, money);
    return `${t.tax} (${trimNum(s.value)}%)`;
  };
  const converted = fxRate && result.original > 0 ? fmtMoney(result.final * fxRate, homeRegion) : '';

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
  const openFx = () => { haptic.select(); setFxVisible(true); };
  const fxStatus = needsConfirm ? t.fxConfirmPrompt(home.cur) : pairReady && fxRate == null ? (fx.loading ? t.fxLoading : t.fxFailed) : null;
  const fxRateLine = converted ? t.fxRate(rg.cur, fmtRate(fxRate), home.cur) : '';
  // Option 1: its own card. Home currency code badge, the converted price large, the rate below.
  const fxCard = (
    <Pressable onPress={openFx} style={({ pressed }) => [styles.glassCard, styles.fxCard, { flexDirection: row, backgroundColor: pressed ? theme.glassStrong : theme.glass, borderColor: theme.glassBorder }]}>
      <View style={[styles.fxBadge, { backgroundColor: converted ? theme.solid : theme.glassStrong }]}>
        {home ? <Text style={[styles.fxBadgeText, num(800), { color: converted ? theme.onSolid : theme.text }]}>{home.cur}</Text>
          : <Ionicons name="globe-outline" size={20} color={theme.text} />}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[styles.fxCardLabel, font(700), { color: theme.textSecondary, textAlign: align }]}>{home ? t.fxInHome(home.cur) : t.fxInHomeEmpty}</Text>
        {converted ? (
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.fxCardValue, num(800), { color: theme.text, textAlign: align }]}>{t.fxApprox(converted)}</Text>
        ) : (
          <Text numberOfLines={2} style={[styles.fxCardHint, font(700), { color: fxStatus ? theme.save : theme.text, textAlign: align }]}>{fxStatus || t.fxPromptCard}</Text>
        )}
        {!!converted && <Text numberOfLines={1} style={[styles.fxCardRate, num(600), { color: theme.textSecondary, textAlign: align }]}>{fxRateLine}</Text>}
      </View>
      <View style={[styles.pill, { backgroundColor: theme.glassStrong }]}>
        <Text style={[styles.pillText, font(700), { color: theme.text }]}>{!home ? t.fxSetUp : needsConfirm ? t.fxConfirmShort : t.fxChange}</Text>
      </View>
    </Pressable>
  );
  // Option 2: a line at the bottom of the price card.
  const fxInline = (
    <Pressable onPress={openFx} style={({ pressed }) => [styles.fxInline, { flexDirection: row, borderTopColor: theme.separator, opacity: pressed ? 0.7 : 1 }]}>
      <Ionicons name="swap-horizontal" size={16} color={converted ? theme.save : theme.textSecondary} />
      {converted ? (
        <>
          <Text numberOfLines={1} style={[styles.fxInlineValue, num(800), { color: theme.save }]}>{t.fxApprox(converted)}</Text>
          <Text numberOfLines={1} style={[styles.fxBarRate, num(600), { color: theme.textSecondary, flex: 1, textAlign: rtl ? 'left' : 'right' }]}>{fxRateLine}</Text>
        </>
      ) : (
        <Text numberOfLines={1} style={[styles.fxBarText, font(700), { color: fxStatus ? theme.save : theme.textSecondary, textAlign: align }]}>{fxStatus || t.fxPrompt}</Text>
      )}
      <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={16} color={theme.textMuted} />
    </Pressable>
  );
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
        result={result} stepLabel={stepLabel} font={font} money={money} converted={converted} />
      <FxSheet visible={fxVisible} onClose={() => setFxVisible(false)} rg={rg} home={home} onHome={chooseHome}
        fx={fx.base === rg.cur ? fx : { rates: null, time: 0, loading: fx.loading, error: fx.error }}
        onRefresh={() => loadRates(true)} manual={manualRate} onManual={setManual}
        confirmed={!!fxConfirmed[fxKey]} onConfirm={confirmRate}
        theme={theme} t={t} font={font} rtl={rtl} lang={lang} />
      <DealSheet visible={dealVisible} onClose={() => setDealVisible(false)} deal={form.deal}
        onChange={(deal) => setForm((f) => ({ ...f, deal }))} theme={theme} t={t} font={font} rtl={rtl} money={money} rg={rg} />
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
            <Text style={[styles.resultValue, num(800), { fontSize: heroSize(money(result.final).length, compact) }, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit>
              {money(result.final)}
            </Text>
            {result.savings > 0 && <Text numberOfLines={1} style={[styles.resultStrike, num(600), { color: theme.textMuted }]}>{money(result.original)}</Text>}
          </View>
          <View style={[styles.resultBottom, { flexDirection: row }]}>
            {result.savings > 0 ? (
              <Text style={[styles.resultSave, font(700), { color: theme.save, textAlign: align }]} numberOfLines={1}>
                {t.youSave(money(result.savings), result.savingsPct.toFixed(1))}
              </Text>
            ) : result.original <= 0 ? (
              <Text style={[styles.resultSave, font(600), { color: theme.textSecondary, textAlign: align }]}>{t.enterPrice}</Text>
            ) : <View style={{ flex: 1 }} />}
            {result.spendShort > 0 && result.unit > 0 ? (
              <Text style={[styles.resultTax, font(700), { color: theme.save }]}>{t.spendShort(money(result.spendShort))}</Text>
            ) : result.qty > 1 && result.unit > 0 ? (
              <Text style={[styles.resultTax, font(600), { color: theme.textSecondary }]}>{t.forItems(result.qty, money(result.perItem))}</Text>
            ) : result.tax > 0 && !compact ? (
              <Text style={[styles.resultTax, font(600), { color: theme.textSecondary }]}>{t.inclTax(money(result.tax))}</Text>
            ) : null}
          </View>
          {FX_STYLE === 'inline' && fxInline}
        </View>

        {FX_STYLE === 'card' && fxCard}
        {FX_STYLE === 'bar' && (
        <Pressable onPress={() => { haptic.select(); setFxVisible(true); }}
          style={({ pressed }) => [styles.fxBar, { flexDirection: row, backgroundColor: pressed ? theme.glassStrong : theme.glass, borderColor: theme.glassBorder }]}>
          <Ionicons name="swap-horizontal" size={16} color={converted ? theme.save : theme.textSecondary} />
          <Text numberOfLines={1} style={[styles.fxBarText, converted ? num(800) : font(700), { color: converted ? theme.text : theme.textSecondary, textAlign: align }]}>
            {converted ? t.fxApprox(converted) : needsConfirm ? t.fxConfirmPrompt(home.cur) : pairReady && fxRate == null ? (fx.loading ? t.fxLoading : t.fxFailed) : t.fxPrompt}
          </Text>
          {converted ? <Text numberOfLines={1} style={[styles.fxBarRate, num(600), { color: theme.textSecondary }]}>{t.fxRate(rg.cur, fmtRate(fxRate), home.cur)}</Text> : null}
          <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={16} color={theme.textMuted} />
        </Pressable>

        )}

        {/* Fields */}
        <ScrollView
          ref={listRef} style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}
          onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={32}
          onLayout={(e) => { viewH.current = e.nativeEvent.layout.height; }}
        >
          <View style={[styles.glassCard, glassCard, { paddingVertical: 2 }]}>
            {fields.map((f) => (
              <React.Fragment key={f.key}>
                <View onLayout={(e) => { heights.current[f.key] = e.nativeEvent.layout.height; }}>
                  <FieldRow
                    field={f} active={keypadOpen && f.key === current.key} last={f.key === lastFieldKey} theme={theme} rtl={rtl} t={t} font={font}
                    sym={rg.sym} amtShort={amtShort}
                    onPress={() => selectField(f.key)}
                    onToggleType={() => { haptic.select(); setSelected(f.key); openKeypad(); toggleType(f.key); }}
                    onScan={f.kind === 'price' ? () => setScanVisible(true) : null}
                  />
                </View>
                {f.key === lastDiscountKey && (
                  <Pressable onPress={() => { haptic.select(); setDealVisible(true); }}
                    onLayout={(e) => { heights.current.deal = e.nativeEvent.layout.height; }}
                    style={({ pressed }) => [styles.fieldRow, { minHeight: 50, flexDirection: row, backgroundColor: pressed ? theme.glass : 'transparent', borderBottomWidth: HAIRLINE, borderBottomColor: theme.separator }]}>
                    <Ionicons name="pricetags-outline" size={17} color={form.deal.type === 'none' ? theme.textSecondary : theme.save} />
                    <Text numberOfLines={1} style={[styles.fieldLabel, font(700), { color: form.deal.type === 'none' ? theme.textSecondary : theme.save, textAlign: align }]}>
                      {form.deal.type === 'none' ? t.deal : dealText(form.deal, t, money)}
                    </Text>
                    {form.deal.type === 'none' && <Text style={[styles.rowHint, font(600), { color: theme.textMuted }]}>{t.dealAddShort}</Text>}
                    <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={17} color={theme.textMuted} />
                  </Pressable>
                )}
              </React.Fragment>
            ))}
          </View>
        </ScrollView>

        {/* Keypad tray */}
        {undoForm && (
          <View style={[styles.snackbar, { bottom: (keypadOpen ? trayH : insets.bottom) + 10, flexDirection: row, backgroundColor: theme.solid }]}>
            <Text style={[styles.snackText, font(600), { color: theme.onSolid, textAlign: align }]}>{t.cleared}</Text>
            <Pressable onPress={undoReset} hitSlop={10}>
              <Text style={[styles.snackAction, font(800), { color: theme.dark ? '#5B4FE0' : '#B9FFE9' }]}>{t.undo}</Text>
            </Pressable>
          </View>
        )}
        {keypadOpen && (
        <View onLayout={(e) => setTrayH(e.nativeEvent.layout.height)}
          style={[styles.tray, { backgroundColor: theme.tray, borderColor: theme.glassBorder, paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={[styles.chipBar, { flexDirection: row }]}>
            <View style={{ flex: 1, justifyContent: 'center' }}>
            {current.kind === 'tax' && taxDiffers ? (
              <Pressable onPress={saveVatDefault} style={[styles.chip, { alignSelf: rtl ? 'flex-end' : 'flex-start', marginHorizontal: 12, flexDirection: flow(false), gap: 6, backgroundColor: theme.solid }]}>
                <Ionicons name="bookmark-outline" size={14} color={theme.onSolid} />
                <Text style={[styles.chipText, font(700), { color: theme.onSolid }]}>{t.vatSaveDefault(trimNum(Math.min(parseNum(form.tax), 100)))}</Text>
              </Pressable>
            ) : presets ? (
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
            <Pressable onPress={closeKeypad} hitSlop={8} accessibilityLabel={t.hideKeypad}
              style={({ pressed }) => [styles.hideBtn, { backgroundColor: pressed ? theme.glassStrong : theme.glass }]}>
              <Ionicons name="chevron-down" size={20} color={theme.text} />
            </Pressable>
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
        )}
        {!keypadOpen && (
          <View style={[styles.tapHintWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <Text style={[styles.chipHint, font(600), { color: theme.textMuted }]}>{t.tapToEdit}</Text>
          </View>
        )}
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
  resultStrike: { fontSize: 15, textDecorationLine: 'line-through', flexShrink: 1 },
  resultBottom: { alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  resultSave: { fontSize: 14, flexShrink: 1 },
  resultTax: { fontSize: 13 },

  // Field list
  list: { flex: 1, marginTop: 8 },
  listContent: { paddingHorizontal: 16, paddingBottom: LIST_PAD },
  tapHintWrap: { paddingTop: 6, alignItems: 'center' },
  hideBtn: { width: 40, height: 34, borderRadius: 12, marginHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
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
  textInput: { height: 52, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, fontSize: 17, ...(Platform.OS === 'web' ? { outlineStyle: 'none', minWidth: 0 } : null) },
  fxCard: { marginHorizontal: 16, marginTop: 10, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', gap: 12 },
  fxBadge: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  fxBadgeText: { fontSize: 13 },
  fxCardLabel: { fontSize: 11, letterSpacing: 1 },
  fxCardValue: { fontSize: 26, letterSpacing: -0.5 },
  fxCardHint: { fontSize: 15 },
  fxCardRate: { fontSize: 12 },
  fxInline: { marginTop: 10, paddingTop: 10, borderTopWidth: HAIRLINE, alignItems: 'center', gap: 8 },
  fxInlineValue: { fontSize: 18 },
  dealExample: { fontSize: 13 },
  rowHint: { fontSize: 13 },
  fxBar: { marginHorizontal: 16, marginTop: 8, minHeight: 38, borderRadius: 19, borderWidth: 1, paddingHorizontal: 14, alignItems: 'center', gap: 8 },
  fxBarText: { flex: 1, fontSize: 14 },
  fxBarRate: { fontSize: 12, flexShrink: 1, maxWidth: '50%' },
  fxRateText: { fontSize: 20 },
  fxSource: { fontSize: 11, textAlign: 'center' },
  searchBox: { height: 48, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, height: '100%', fontSize: 15, paddingVertical: 0, ...(Platform.OS === 'web' ? { outlineStyle: 'none', width: 0 } : null) },
  listHeader: { fontSize: 11, letterSpacing: 1.2, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  regionCode: { fontSize: 12 },
  curCode: { fontSize: 15, minWidth: 44 },
  emptyText: { fontSize: 14, textAlign: 'center', padding: 20 },
  sectionLabel: { fontSize: 11, letterSpacing: 1.2 },
  templateChip: { paddingHorizontal: 14 },
  amountBox: { height: 48, minWidth: 130, borderRadius: 14, paddingHorizontal: 12, alignItems: 'center', gap: 6 },
  amountSym: { fontSize: 14 },
  amountInput: { flex: 1, height: '100%', fontSize: 18, paddingVertical: 0, textAlign: 'right', ...(Platform.OS === 'web' ? { outlineStyle: 'none', width: 0 } : null) },
  sheetTall: { maxHeight: '92%' },

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
