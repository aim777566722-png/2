import assert from 'node:assert/strict';
import { detectTable, extractItemsFromRows, normalizeOcrText } from '../src/services/localAnalysis';

const rtl = [
  ['هاتف: 777777', 'مرتجع عدوان', '2026/09/01'],
  ['القيمة', 'السعر', 'الكمية', 'الوحدة', 'اسم الصنف', 'رقم الصنف', 'الصلاحية'],
  ['3000', '1500', '2', 'علبة', 'بندول اكسترا 500 مجم', '123456', '06/27'],
  ['1250', '1250', '1', 'علبة', 'أوجمنتين 625 مجم', '555', '2027/08'],
  ['الإجمالي', '4250'],
];
const ltr = [
  ['Item No', 'Description', 'Unit', 'Qty', 'Unit Price', 'Amount', 'Expiry'],
  ['88', 'Amoxicillin 500 mg', 'box', '3', '12.50', '37.50', '05/27'],
  ['89', 'Vitamin C', 'box', '2', '', '10.00', ''],
];

assert.equal(normalizeOcrText('١٢٣ ۴۵'), '123 45');
assert.ok(detectTable(rtl));
const arabic = extractItemsFromRows(rtl);
assert.equal(arabic.length, 2, 'header and footer must never become items');
assert.equal(arabic[0].itemName, 'بندول اكسترا 500 مجم');
assert.equal(arabic[0].unitPrice, 1500);
assert.equal(arabic[0].totalPrice, 3000);
assert.equal(arabic[0].expiryDate, '06/27');
const english = extractItemsFromRows(ltr);
assert.equal(english.length, 2);
assert.equal(english[0].itemName, 'Amoxicillin 500 mg');
assert.equal(english[1].unitPrice, 5, 'only mapped total/quantity may derive a missing price');
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
