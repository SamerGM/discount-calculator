import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

const lightTheme = {
  bg: '#F8FAFC', surface: '#FFFFFF', surfaceAlt: '#F1F5F9', border: '#E2E8F0',
  borderFocus: '#3B82F6', text: '#0F172A', textSecondary: '#64748B', textMuted: '#94A3B8',
  accent: '#3B82F6', accentLight: '#EFF6FF', accent2: '#8B5CF6', accent2Light: '#F5F3FF',
  success: '#10B981', successLight: '#ECFDF5', danger: '#EF4444', dangerLight: '#FEF2F2',
  label: '#334155', tabActive: '#3B82F6', tabInactive: '#94A3B8', tabBorder: '#E2E8F0',
};

const darkTheme = {
  bg: '#0F172A', surface: '#1E293B', surfaceAlt: '#0F172A', border: '#334155',
  borderFocus: '#60A5FA', text: '#F1F5F9', textSecondary: '#94A3B8', textMuted: '#475569',
  accent: '#60A5FA', accentLight: '#1E3A5F', accent2: '#A78BFA', accent2Light: '#2E1065',
  success: '#34D399', successLight: '#064E3B', danger: '#F87171', dangerLight: '#450A0A',
  label: '#CBD5E1', tabActive: '#60A5FA', tabInactive: '#475569', tabBorder: '#334155',
};

const translations = {
  en: {
    appTitle: '🏷️ Discount Calculator',
    simple: 'Simple',
    advanced: 'Advanced',
    originalPrice: 'Original Price ($)',
    discount: 'Discount (%)',
    firstDiscount: 'First Discount (%)',
    extraDiscount: 'Extra Discount (% on top)',
    salesTax: 'Sales Tax (%) — optional',
    finalPrice: 'FINAL PRICE',
    totalSavings: 'TOTAL SAVINGS',
    youSave: 'You Save',
    offOriginal: '% off original',
    original: 'ORIGINAL',
    discountLabel: 'DISCOUNT',
    final: 'FINAL',
    clear: 'Clear',
    enterToSeeSavings: 'Enter values above to see savings',
    enterToSeeBreakdown: 'Enter values above to see the breakdown',
    step1: 'Step 1 — First Discount',
    step2: 'Step 2 — Extra Discount',
    step3: 'Step 3 — Tax',
    saved: 'Saved',
    priceBefore: 'Price before extra',
    priceAfterStep1: 'Price after step 1',
    priceAfterStep2: 'Price after step 2',
    taxAmount: 'Tax amount',
    equivalentDiscount: 'Equivalent Single Discount',
    stackedNote: '⚠️ Stacked discounts are applied one after another — not added together.',
    stackedNoteSuffix: (d1, d2, eq, sum) => `  ${d1}% + ${d2}% = ${eq}% effective, not ${sum}%.`,
    stackedNotEqual: (d1, d2, sum) => `${d1}% + ${d2}% stacked ≠ ${sum}% flat`,
    originalPriceRow: 'Original Price',
    discountRow: (d) => `Discount (${d}%)`,
    taxRow: (t) => `Tax (${t}%)`,
    extraSaved: 'Extra saved',
  },
  ar: {
    appTitle: '🏷️ Discount Calculator',
    simple: 'بسيط',
    advanced: 'خصم مركب',
    originalPrice: 'السعر الأصلي ($)',
    discount: 'نسبة الخصم (%)',
    firstDiscount: 'الخصم الأول (%)',
    extraDiscount: 'خصم إضافي (% على السعر المخفض)',
    salesTax: 'الضريبة (%) — اختياري',
    finalPrice: 'السعر النهائي',
    totalSavings: 'إجمالي التوفير',
    youSave: 'وفرت',
    offOriginal: '% من السعر الأصلي',
    original: 'الأصلي',
    discountLabel: 'الخصم',
    final: 'النهائي',
    clear: 'مسح',
    enterToSeeSavings: '',
    enterToSeeBreakdown: 'أدخل القيم أعلاه لرؤية التفاصيل',
    step1: 'الخطوة 1 — الخصم الأول',
    step2: 'الخطوة 2 — الخصم الإضافي',
    step3: 'الخطوة 3 — الضريبة',
    saved: 'التوفير',
    priceBefore: 'السعر قبل الخصم الإضافي',
    priceAfterStep1: 'السعر بعد الخطوة 1',
    priceAfterStep2: 'السعر بعد الخطوة 2',
    taxAmount: 'مبلغ الضريبة',
    equivalentDiscount: 'الخصم الفعلي',
    stackedNote: '⚠️ الخصومات المتراكمة تُطبَّق بالتسلسل — وليس بالجمع.',
    stackedNoteSuffix: (d1, d2, eq, sum) => `  ${d1}% + ${d2}% = ${eq}% فعلياً، وليس ${sum}%.`,
    stackedNotEqual: (d1, d2, sum) => `${d1}% + ${d2}% متراكم ≠ ${sum}% مباشر`,
    originalPriceRow: 'السعر الأصلي',
    discountRow: (d) => `الخصم (${d}%)`,
    taxRow: (t) => `الضريبة (${t}%)`,
    extraSaved: 'التوفير الإضافي',
  },
};

const parseNum = (val) => { const n = parseFloat(val); return isNaN(n) ? 0 : n; };
const fmt = (n) => n.toFixed(2);

const InputField = ({ label, value, onChange, placeholder, theme, rtl }) => (
  <View style={styles.fieldWrap}>
    <Text style={[styles.label, { color: theme.label, textAlign: rtl ? 'right' : 'left' }]}>{label}</Text>
    <TextInput
      style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text, textAlign: rtl ? 'right' : 'left' }]}
      value={value} onChangeText={onChange} placeholder={placeholder}
      placeholderTextColor={theme.textMuted} keyboardType="decimal-pad" maxLength={10}
    />
  </View>
);

const ResultRow = ({ label, value, theme, accent, negative, rtl }) => (
  <View style={[styles.resultRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
    <Text style={[styles.resultLabel, { color: theme.textSecondary }]}>{label}</Text>
    <Text style={[styles.resultValue, { color: accent ? theme.accent : negative ? theme.danger : theme.text }]}>{value}</Text>
  </View>
);

const SavingsBox = ({ theme, p, discountAmount, finalPrice, savingsPct, totalSavings, totalSavingsPct, rtl, t }) => (
  <View style={[styles.savingsBox, { backgroundColor: theme.successLight, borderColor: theme.success }]}>
    <Text style={[styles.savingsBoxTitle, { color: theme.success, textAlign: rtl ? 'right' : 'left' }]}>{t.totalSavings}</Text>
    <View style={[styles.savingsDividerLine, { backgroundColor: theme.success }]} />
    <View style={[styles.savingsRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
      <View>
        <Text style={[styles.savingsLabel, { color: theme.success, textAlign: rtl ? 'right' : 'left' }]}>{t.youSave}</Text>
        <Text style={[styles.savingsPct, { color: theme.success, textAlign: rtl ? 'right' : 'left' }]}>
          {(totalSavingsPct ?? savingsPct).toFixed(1)}{t.offOriginal}
        </Text>
      </View>
      <Text style={[styles.savingsValue, { color: theme.success }]}>${fmt(totalSavings ?? discountAmount)}</Text>
    </View>
    <View style={[styles.savingsBreakdownRow, { borderTopColor: theme.success, flexDirection: rtl ? 'row-reverse' : 'row' }]}>
      <View style={styles.savingsStatItem}>
        <Text style={[styles.savingsStatLabel, { color: theme.success }]}>{t.original}</Text>
        <Text style={[styles.savingsStatValue, { color: theme.success }]}>${fmt(p)}</Text>
      </View>
      <View style={[styles.savingsStatDivider, { backgroundColor: theme.success }]} />
      <View style={styles.savingsStatItem}>
        <Text style={[styles.savingsStatLabel, { color: theme.success }]}>{t.discountLabel}</Text>
        <Text style={[styles.savingsStatValue, { color: theme.success }]}>−${fmt(totalSavings ?? discountAmount)}</Text>
      </View>
      <View style={[styles.savingsStatDivider, { backgroundColor: theme.success }]} />
      <View style={styles.savingsStatItem}>
        <Text style={[styles.savingsStatLabel, { color: theme.success }]}>{t.final}</Text>
        <Text style={[styles.savingsStatValue, { color: theme.success }]}>${fmt(finalPrice)}</Text>
      </View>
    </View>
  </View>
);

const SimpleTab = ({ theme, rtl, t }) => {
  const [price, setPrice] = useState('');
  const [discount, setDiscount] = useState('');
  const [tax, setTax] = useState('');
  const p = parseNum(price);
  const d = Math.min(parseNum(discount), 100);
  const tv = parseNum(tax);
  const discountAmount = p * (d / 100);
  const afterDiscount = p - discountAmount;
  const taxAmount = afterDiscount * (tv / 100);
  const finalPrice = afterDiscount + taxAmount;
  const savingsPct = p > 0 ? (discountAmount / p) * 100 : 0;
  const hasValues = p > 0 || d > 0;
  const handleClear = () => { setPrice(''); setDiscount(''); setTax(''); };

  return (
    <ScrollView contentContainerStyle={styles.tabContent} keyboardShouldPersistTaps="handled">
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <InputField label={t.originalPrice} value={price} onChange={setPrice} placeholder="0.00" theme={theme} rtl={rtl} />
        <InputField label={t.discount} value={discount} onChange={v => setDiscount(v.replace(/[^0-9.]/g, ''))} placeholder="0" theme={theme} rtl={rtl} />
        <InputField label={t.salesTax} value={tax} onChange={setTax} placeholder="0" theme={theme} rtl={rtl} />
      </View>
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <ResultRow label={t.originalPriceRow} value={`$${fmt(p)}`} theme={theme} rtl={rtl} />
        <ResultRow label={t.discountRow(d)} value={hasValues ? `− $${fmt(discountAmount)}` : '—'} theme={theme} negative={hasValues && discountAmount > 0} rtl={rtl} />
        {tv > 0 && <ResultRow label={t.taxRow(tv)} value={hasValues ? `+ $${fmt(taxAmount)}` : '—'} theme={theme} rtl={rtl} />}
        <View style={[styles.resultDivider, { backgroundColor: theme.border }]} />
        <View style={[styles.finalPriceBox, { backgroundColor: theme.accentLight, borderColor: theme.accent }]}>
          <Text style={[styles.finalPriceLabel, { color: theme.accent }]}>{t.finalPrice}</Text>
          <Text style={[styles.finalPriceValue, { color: theme.accent }]}>${fmt(finalPrice)}</Text>
        </View>
        {hasValues && discountAmount > 0
          ? <SavingsBox theme={theme} p={p} discountAmount={discountAmount} finalPrice={finalPrice} savingsPct={savingsPct} rtl={rtl} t={t} />
          : t.enterToSeeSavings ? <Text style={[styles.emptyHint, { color: theme.textMuted }]}>{t.enterToSeeSavings}</Text> : null
        }
        <TouchableOpacity
          style={[styles.clearBtn, { backgroundColor: hasValues ? theme.dangerLight : theme.surfaceAlt, borderColor: hasValues ? theme.danger : theme.border }]}
          onPress={handleClear} activeOpacity={0.75}>
          <Text style={[styles.clearBtnText, { color: hasValues ? theme.danger : theme.textMuted }]}>{t.clear}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const AdvancedTab = ({ theme, rtl, t }) => {
  const [price, setPrice] = useState('');
  const [discount1, setDiscount1] = useState('');
  const [discount2, setDiscount2] = useState('');
  const [tax, setTax] = useState('');
  const p = parseNum(price);
  const d1 = Math.min(parseNum(discount1), 100);
  const d2 = Math.min(parseNum(discount2), 100);
  const tv = parseNum(tax);
  const savedByD1 = p * (d1 / 100);
  const afterDiscount1 = p - savedByD1;
  const savedByD2 = afterDiscount1 * (d2 / 100);
  const afterDiscount2 = afterDiscount1 - savedByD2;
  const taxAmount = afterDiscount2 * (tv / 100);
  const finalPrice = afterDiscount2 + taxAmount;
  const totalSavings = savedByD1 + savedByD2;
  const totalSavingsPct = p > 0 ? (totalSavings / p) * 100 : 0;
  const equivalentDiscount = p > 0 ? (totalSavings / p) * 100 : 0;
  const hasValues = p > 0 || d1 > 0 || d2 > 0;
  const handleClear = () => { setPrice(''); setDiscount1(''); setDiscount2(''); setTax(''); };

  return (
    <ScrollView contentContainerStyle={styles.tabContent} keyboardShouldPersistTaps="handled">
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <InputField label={t.originalPrice} value={price} onChange={setPrice} placeholder="0.00" theme={theme} rtl={rtl} />
        <InputField label={t.firstDiscount} value={discount1} onChange={v => setDiscount1(v.replace(/[^0-9.]/g, ''))} placeholder="0" theme={theme} rtl={rtl} />
        <InputField label={t.extraDiscount} value={discount2} onChange={v => setDiscount2(v.replace(/[^0-9.]/g, ''))} placeholder="0" theme={theme} rtl={rtl} />
        <InputField label={t.salesTax} value={tax} onChange={setTax} placeholder="0" theme={theme} rtl={rtl} />
      </View>
      <View style={[styles.infoBox, { backgroundColor: theme.accent2Light, borderColor: theme.accent2 }]}>
        <Text style={[styles.infoText, { color: theme.accent2, textAlign: rtl ? 'right' : 'left' }]}>
          {t.stackedNote}
          {d1 > 0 && d2 > 0 ? t.stackedNoteSuffix(d1, d2, equivalentDiscount.toFixed(1), d1 + d2) : ''}
        </Text>
      </View>
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <View style={[styles.stepBlock, { borderLeftWidth: rtl ? 0 : 3, borderRightWidth: rtl ? 3 : 0, borderLeftColor: theme.accent, borderRightColor: theme.accent, paddingLeft: rtl ? 0 : 12, paddingRight: rtl ? 12 : 0 }]}>
          <Text style={[styles.stepBlockTitle, { color: theme.accent, textAlign: rtl ? 'right' : 'left' }]}>{t.step1} ({d1}%)</Text>
          <ResultRow label={t.originalPriceRow} value={`$${fmt(p)}`} theme={theme} rtl={rtl} />
          <ResultRow label={t.saved} value={hasValues ? `− $${fmt(savedByD1)}` : '—'} theme={theme} negative={hasValues && savedByD1 > 0} rtl={rtl} />
          <ResultRow label={t.priceAfterStep1} value={`$${fmt(afterDiscount1)}`} theme={theme} accent rtl={rtl} />
        </View>
        <View style={[styles.stepBlock, { borderLeftWidth: rtl ? 0 : 3, borderRightWidth: rtl ? 3 : 0, borderLeftColor: theme.accent2, borderRightColor: theme.accent2, paddingLeft: rtl ? 0 : 12, paddingRight: rtl ? 12 : 0, marginTop: 12 }]}>
          <Text style={[styles.stepBlockTitle, { color: theme.accent2, textAlign: rtl ? 'right' : 'left' }]}>{t.step2} ({d2}%)</Text>
          <ResultRow label={t.priceBefore} value={`$${fmt(afterDiscount1)}`} theme={theme} rtl={rtl} />
          <ResultRow label={t.extraSaved} value={hasValues ? `− $${fmt(savedByD2)}` : '—'} theme={theme} negative={hasValues && savedByD2 > 0} rtl={rtl} />
          <ResultRow label={t.priceAfterStep2} value={`$${fmt(afterDiscount2)}`} theme={theme} accent rtl={rtl} />
        </View>
        {tv > 0 && (
          <View style={[styles.stepBlock, { borderLeftWidth: rtl ? 0 : 3, borderRightWidth: rtl ? 3 : 0, borderLeftColor: theme.success, borderRightColor: theme.success, paddingLeft: rtl ? 0 : 12, paddingRight: rtl ? 12 : 0, marginTop: 12 }]}>
            <Text style={[styles.stepBlockTitle, { color: theme.success, textAlign: rtl ? 'right' : 'left' }]}>{t.step3} ({tv}%)</Text>
            <ResultRow label={t.taxAmount} value={hasValues ? `+ $${fmt(taxAmount)}` : '—'} theme={theme} rtl={rtl} />
          </View>
        )}
        <View style={[styles.resultDivider, { backgroundColor: theme.border }]} />
        {hasValues && (d1 > 0 || d2 > 0) && (
          <View style={[styles.equivalentBox, { backgroundColor: theme.accent2Light, borderColor: theme.accent2 }]}>
            <Text style={[styles.equivalentLabel, { color: theme.accent2 }]}>{t.equivalentDiscount}</Text>
            <Text style={[styles.equivalentValue, { color: theme.accent2 }]}>{equivalentDiscount.toFixed(2)}%</Text>
            <Text style={[styles.equivalentSub, { color: theme.accent2 }]}>{t.stackedNotEqual(d1, d2, d1 + d2)}</Text>
          </View>
        )}
        <View style={[styles.finalPriceBox, { backgroundColor: theme.accentLight, borderColor: theme.accent }]}>
          <Text style={[styles.finalPriceLabel, { color: theme.accent }]}>{t.finalPrice}</Text>
          <Text style={[styles.finalPriceValue, { color: theme.accent }]}>${fmt(finalPrice)}</Text>
        </View>
        {hasValues && totalSavings > 0
          ? <SavingsBox theme={theme} p={p} finalPrice={finalPrice} totalSavings={totalSavings} totalSavingsPct={totalSavingsPct} rtl={rtl} t={t} />
          : <Text style={[styles.emptyHint, { color: theme.textMuted }]}>{t.enterToSeeBreakdown}</Text>
        }
        <TouchableOpacity
          style={[styles.clearBtn, { backgroundColor: hasValues ? theme.dangerLight : theme.surfaceAlt, borderColor: hasValues ? theme.danger : theme.border }]}
          onPress={handleClear} activeOpacity={0.75}>
          <Text style={[styles.clearBtnText, { color: hasValues ? theme.danger : theme.textMuted }]}>{t.clear}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

export default function App() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const [activeTab, setActiveTab] = useState('simple');
  const [lang, setLang] = useState('en');
  const rtl = lang === 'ar';
  const t = translations[lang];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border, flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{t.appTitle}</Text>
          <View style={styles.langToggle}>
            <TouchableOpacity
              style={[styles.langBtn, { backgroundColor: lang === 'en' ? theme.accent : theme.surfaceAlt, borderColor: lang === 'en' ? theme.accent : theme.border }]}
              onPress={() => setLang('en')}>
              <Text style={[styles.langBtnText, { color: lang === 'en' ? '#fff' : theme.textSecondary }]}>EN</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.langBtn, { backgroundColor: lang === 'ar' ? theme.accent : theme.surfaceAlt, borderColor: lang === 'ar' ? theme.accent : theme.border }]}
              onPress={() => setLang('ar')}>
              <Text style={[styles.langBtnText, { color: lang === 'ar' ? '#fff' : theme.textSecondary }]}>العربية</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={[styles.tabBar, { backgroundColor: theme.surface, borderBottomColor: theme.tabBorder, flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'simple' && { borderBottomColor: theme.tabActive, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab('simple')}>
            <Text style={[styles.tabText, { color: activeTab === 'simple' ? theme.tabActive : theme.tabInactive }]}>{t.simple}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'stacked' && { borderBottomColor: theme.tabActive, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab('stacked')}>
            <Text style={[styles.tabText, { color: activeTab === 'stacked' ? theme.tabActive : theme.tabInactive }]}>{t.advanced}</Text>
          </TouchableOpacity>
        </View>
        {activeTab === 'simple'
          ? <SimpleTab theme={theme} rtl={rtl} t={t} />
          : <AdvancedTab theme={theme} rtl={rtl} t={t} />
        }
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 52, paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1, alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, flex: 1 },
  langToggle: { flexDirection: 'row', gap: 6 },
  langBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5 },
  langBtnText: { fontSize: 13, fontWeight: '700' },
  tabBar: { borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabText: { fontSize: 15, fontWeight: '700' },
  tabContent: { padding: 16, gap: 12 },
  card: { borderRadius: 16, padding: 16, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  fieldWrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  input: { height: 52, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, fontSize: 18, fontWeight: '600' },
  resultRow: { justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  resultLabel: { fontSize: 14, fontWeight: '500' },
  resultValue: { fontSize: 15, fontWeight: '700' },
  resultDivider: { height: 1, marginVertical: 6, opacity: 0.4 },
  finalPriceBox: { borderRadius: 14, borderWidth: 1.5, padding: 16, alignItems: 'center' },
  finalPriceLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  finalPriceValue: { fontSize: 42, fontWeight: '800', letterSpacing: -1 },
  savingsBox: { borderRadius: 14, borderWidth: 1.5, padding: 16 },
  savingsBoxTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 8 },
  savingsDividerLine: { height: 1, opacity: 0.25, marginBottom: 10 },
  savingsRow: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  savingsLabel: { fontSize: 16, fontWeight: '700' },
  savingsValue: { fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  savingsPct: { fontSize: 13, fontWeight: '500', opacity: 0.8 },
  savingsBreakdownRow: { justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, opacity: 0.85 },
  savingsStatItem: { flex: 1, alignItems: 'center' },
  savingsStatLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 3 },
  savingsStatValue: { fontSize: 13, fontWeight: '700' },
  savingsStatDivider: { width: 1, opacity: 0.3, marginHorizontal: 4 },
  emptyHint: { textAlign: 'center', fontSize: 14, paddingVertical: 12 },
  clearBtn: { height: 52, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  clearBtnText: { fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  stepBlock: { gap: 4 },
  stepBlockTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3, marginBottom: 4 },
  equivalentBox: { borderRadius: 12, borderWidth: 1.5, padding: 12, alignItems: 'center', marginBottom: 4 },
  equivalentLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  equivalentValue: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  equivalentSub: { fontSize: 12, fontWeight: '500', opacity: 0.8 },
  infoBox: { borderRadius: 12, borderWidth: 1, padding: 12 },
  infoText: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
});