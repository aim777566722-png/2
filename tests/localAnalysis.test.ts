import assert from 'node:assert/strict';
import { detectTable, extractItemsFromRows, normalizeOcrText } from '../src/services/localAnalysis';

const rtl = [
  ['هاتف: 777777', 'مرتجع عدوان', '2026/09/01'],
  ['القيمة', 'السعر', 'الكمية', 'الوحدة', 'اسم الصنف', 'رقم الصنف', 'الصلاحية'],
  ['3000', '1500', '2', 'علبة', 'بندول اكسترا 500 مجم', '123456', '06/27'],
  ['1250', '1250', '1', 'علبة', 'أوجمنتين 625 مجم', '555', '2027/08'],
  ['الإجمالي', '4250'],
];
const rtlSparseRows = [
  ['م', 'رقم الصنف', 'اسم الصنف', 'الوحدة', 'الكمية', 'بونص', 'السعر', 'التشغيلة', 'تاريخ الانتهاء', 'القيمة'],
  ['1', '0117406', 'نيدو اكياس 2250غرام شهاب', 'كيس', '1', '0', '11,100.00', '1058212', '01/01/2027', '11,100.00'],
  ['2', '0103569', 'شامبو نونو للاطفال بخاخ 600مل الصديق', 'مضرب', '1', '0', '1,700.00', '1060348', '01/04/2030', '1,700.00'],
  ['3', '100124732', 'شامبو نونو للاطفال 500مل الصديق', 'علبة', '1', '0', '1,380.00', '1071502', '01/10/2029', '1,380.00'],
  ['4', '0109506', 'شامبو نونو للاطفال 400مل الصديق', 'علبة', '1', '0', '1,150.00', '1059202', '1,150.00'],
  ['5', '0107960', 'محلول هيدروجين بروكسيد 60مل / الدولية', 'قارورة', '2', '0', '370.00', '1057650', '01/02/2027', '740.00'],
  ['الإجمالي', '16,910.00'],
];
const ltr = [
  ['Item No', 'Description', 'Unit', 'Qty', 'Unit Price', 'Amount', 'Expiry'],
  ['88', 'Amoxicillin 500 mg', 'box', '3', '12.50', '37.50', '05/27'],
  ['89', 'Vitamin C', 'box', '2', '', '10.00', ''],
];
const decimalArabic = [
  ['رقم', 'اسم الصنف', 'الوحدة', 'الكمية', 'السعر', 'القيمة'],
  ['1', 'باراسيتامول 500 مجم', 'علبة', '2', '12.50', '25.00'],
];

assert.equal(normalizeOcrText('١٢٣ ۴۵'), '123 45');
assert.ok(detectTable(rtl));
const arabic = extractItemsFromRows(rtl);
assert.equal(arabic.length, 2, 'header and footer must never become items');
assert.equal(arabic[0].itemName, 'بندول اكسترا 500 مجم');
assert.equal(arabic[0].unitPrice, 1500);
assert.equal(arabic[0].totalPrice, 3000);
assert.equal(arabic[0].expiryDate, '06/27');

const sparse = extractItemsFromRows(rtlSparseRows);
assert.equal(sparse.length, 5, 'sparse RTL rows must keep every real product and reject the footer');
assert.equal(sparse[0].itemName, 'نيدو اكياس 2250غرام شهاب');
assert.equal(sparse[0].unitPrice, 11100);
assert.equal(sparse[0].totalPrice, 11100);
assert.equal(sparse[1].itemName, 'شامبو نونو للاطفال بخاخ 600مل الصديق');
assert.equal(sparse[1].unitPrice, 1700);
assert.equal(sparse[2].itemName, 'شامبو نونو للاطفال 500مل الصديق');
assert.equal(sparse[4].quantity, 2);
assert.equal(sparse[4].unitPrice, 370);
assert.equal(sparse[4].totalPrice, 740);

const english = extractItemsFromRows(ltr);
assert.equal(english.length, 2);
assert.equal(english[0].itemName, 'Amoxicillin 500 mg');
assert.equal(english[1].unitPrice, 5, 'only mapped total/quantity may derive a missing price');
const decimal = extractItemsFromRows(decimalArabic);
assert.equal(decimal.length, 1, 'decimal prices must not be discarded as dates');
assert.equal(decimal[0].unitPrice, 12.5);
assert.equal(decimal[0].totalPrice, 25);
assert.deepEqual(extractItemsFromRows([['Phone', '123'], ['no table here']]), []);
assert.equal(extractItemsFromRows([...ltr, ltr[1]]).length, 2, 'exact duplicate rows are removed');
assert.equal(extractItemsFromRows([...ltr, ltr[0], ['90', 'Ibuprofen 400 mg', 'box', '1', '7.25', '7.25', '']]).length, 3, 'a repeated page header is skipped while the next page item is retained');

const multiPageWithShortFooters = [
  ...ltr,
  ['الإجمالي', '47.50'],
  ['الملاحظات', 'تم الاستلام'],
  ['صفحة', '1 من 2'],
  ltr[0],
  ['90', 'Ibuprofen 400 mg', 'box', '1', '7.25', '7.25', ''],
];
assert.equal(
  extractItemsFromRows(multiPageWithShortFooters).at(-1)?.itemName,
  'Ibuprofen 400 mg',
  'short footer rows must not abort extraction before the next page header'
);
console.log('localAnalysis tests passed');
