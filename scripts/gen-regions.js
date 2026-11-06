// Regenerates data/regions.js. Run from a scratch folder that has the three data packages:
//   npm install --no-save i18n-iso-countries@7.14.0 currency-codes@2.2.0 country-to-currency@3.0.1
//   node scripts/gen-regions.js

const fs = require('fs');
const c = require('i18n-iso-countries');
c.registerLocale(require('i18n-iso-countries/langs/en.json'));
c.registerLocale(require('i18n-iso-countries/langs/ar.json'));
const cc = require('currency-codes');
const m = require('country-to-currency'); const c2c = m.default || m;

// Standard VAT / GST / sales-tax rates (%). note: 'varies' = rate depends on state/region/item,
// 'state' = add local sales tax. Countries not listed get vat: null (shopper enters it).
const VAT = {
  AE: 5, SA: 15, BH: 10, OM: 5, QA: 0, KW: 0, EG: 14, JO: 16, LB: 11, MA: 20, TN: 19, DZ: 19, IQ: 0, LY: 0, SD: 17, PS: 16, MR: 16, IL: 18, IR: 10, TR: 20,
  AT: 20, BE: 21, BG: 20, HR: 25, CY: 19, CZ: 21, DK: 25, EE: 24, FI: 25.5, FR: 20, DE: 19, GR: 24, HU: 27, IE: 23, IT: 22, LV: 21, LT: 21, LU: 17, MT: 18, NL: 21, PL: 23, PT: 23, RO: 21, SK: 23, SI: 22, ES: 21, SE: 25,
  GB: 20, NO: 25, CH: 8.1, IS: 24, RS: 20, AL: 20, MK: 18, ME: 21, BA: 17, MD: 20, UA: 20, RU: 22, GE: 18, AM: 20, AZ: 18, KZ: 16, UZ: 12,
  IN: 18, PK: 18, BD: 15, LK: 18, NP: 13, CN: 13, JP: 10, KR: 10, TW: 5, HK: 0, SG: 9, TH: 7, VN: 10, ID: 11, PH: 12, AU: 10, NZ: 15,
  ZA: 15, NG: 7.5, KE: 16, GH: 15, ET: 15, TZ: 18, UG: 18, RW: 18, SN: 18, CI: 18,
  US: 0, CA: 5, MX: 16, AR: 21, CL: 19, CO: 19, PE: 18, UY: 22, EC: 15, BO: 13, PY: 10, VE: 16, CR: 13, DO: 18, PA: 7, GT: 12,
};
const NOTE = { US: 'state', CA: 'varies', IN: 'varies', ID: 'varies', VN: 'varies' };
// Practical decimals where daily prices differ from ISO 4217 minor units.
const DEC_OVERRIDE = { LBP: 0, IQD: 0, IRR: 0, SYP: 0, YER: 0, VND: 0, IDR: 0, KRW: 0, CLP: 0, COP: 0, HUF: 0, UZS: 0, LAK: 0, MMK: 0, KHR: 0, PYG: 0, UGX: 0, RWF: 0, XOF: 0, XAF: 0 };
const SYMBOL = { USD: '$', EUR: '€', GBP: '£', INR: '₹', TRY: '₺' };
const ALIASES = { AE: 'UAE Emirates Dubai Abu Dhabi', SA: 'KSA', US: 'USA America', GB: 'UK Britain England', KR: 'South Korea', RU: 'Russia', IR: 'Iran', SY: 'Syria', TW: 'Taiwan', VN: 'Vietnam', CZ: 'Czechia', NL: 'Holland', PS: 'Palestine' };
const SHORT_EN = { US: 'United States', GB: 'United Kingdom', RU: 'Russia', KR: 'South Korea', KP: 'North Korea', IR: 'Iran', SY: 'Syria', TW: 'Taiwan', VN: 'Vietnam', BO: 'Bolivia', VE: 'Venezuela', TZ: 'Tanzania', MD: 'Moldova', LA: 'Laos', PS: 'Palestine', CD: 'DR Congo', CG: 'Congo', FM: 'Micronesia' };
const SHORT_AR = { AE: 'الإمارات', SA: 'السعودية' };

const countries = []; const curUse = {};
for (const id of Object.keys(c.getAlpha2Codes())) {
  const cur = c2c[id]; const info = cur && cc.code(cur);
  if (!info) continue;
  const dec = cur in DEC_OVERRIDE ? DEC_OVERRIDE[cur] : info.digits;
  const row = { id, en: SHORT_EN[id] || c.getName(id, 'en'), ar: SHORT_AR[id] || c.getName(id, 'ar'), cur, vat: id in VAT ? VAT[id] : null };
  if (NOTE[id]) row.note = NOTE[id];
  if (ALIASES[id]) row.alias = ALIASES[id];
  countries.push(row);
  (curUse[cur] = curUse[cur] || []).push(id);
}
countries.sort((a, b) => a.en.localeCompare(b.en));
const currencies = Object.keys(curUse).sort().map((cur) => {
  const info = cc.code(cur);
  return { cur, name: info.currency, dec: cur in DEC_OVERRIDE ? DEC_OVERRIDE[cur] : info.digits, sym: SYMBOL[cur] || cur, countries: curUse[cur] };
});
const out = `// Generated from i18n-iso-countries 7.14.0, currency-codes 2.2.0 and country-to-currency 3.0.1
// (all MIT), plus hand-maintained standard VAT rates. Regenerate rather than editing by hand.
// vat: standard rate in %, null = unknown (the shopper enters it). note: 'varies' | 'state'.
export const COUNTRY_LIST = ${JSON.stringify(countries)};
export const CURRENCY_LIST = ${JSON.stringify(currencies)};
export const POPULAR_COUNTRIES = ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'EG', 'JO', 'LB', 'MA', 'IQ', 'TR', 'GB', 'US', 'IN'];
export const POPULAR_CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'QAR', 'KWD', 'EGP', 'JOD', 'INR', 'PKR', 'PHP', 'TRY'];
`;
fs.writeFileSync(require('path').join(__dirname, '..', 'data', 'regions.js'), out);
const withVat = countries.filter((x) => x.vat !== null).length;
console.log('countries', countries.length, 'with VAT', withVat, 'currencies', currencies.length, 'bytes', out.length);
console.log(Object.keys(VAT).filter((k) => !countries.find((x) => x.id === k)));
