import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

try {
  if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  }
} catch { /* PDF.js can still use the configured runtime worker. */ }

export interface ParsedDocumentResult {
  fileName: string;
  fileType: 'pdf' | 'excel' | 'word' | 'image' | 'text';
  extractedText: string;
  tableData?: Array<Record<string, any>> | Array<any[]>;
  rawMatrix?: Array<any[]>;
  mimeType: string;
  base64?: string;
  pageImages?: string[];
  totalRowsCount?: number;
}

export interface ExtractedTableMedicineItem {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  bonusScheme: string;
  discountPercent: number;
  expiryDate?: string;
  notes?: string;
  isUncertain?: boolean;
  uncertaintyReason?: string;
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function normalizeDigits(value: string): string {
  return value.replace(/[٠-٩]/g, d => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, d => String(PERSIAN_DIGITS.indexOf(d)));
}

/** Parse common Arabic/English financial numbers without silently changing their value. */
export function parseNumberClean(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  let s = normalizeDigits(String(val)).trim();
  s = s.replace(/[\u00A0\s$£€¥ر\.س\.ي\.﷼]/g, '');
  s = s.replace(/[٬]/g, ',').replace(/[٫]/g, '.');
  s = s.replace(/[^0-9,.-]/g, '');
  if (!s) return 0;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const decimals = s.length - lastComma - 1;
    s = decimals > 0 && decimals <= 3 ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function isDateLike(val: any): boolean {
  if (val === null || val === undefined || val === '') return false;
  const s = normalizeDigits(String(val).trim());
  if (s.length < 3) return false;
  if (/^\d+(?:\.\d+)?\s*[\/*]\s*\d+(?:\.\d+)?\s*(?:mg|g|ml|mcg|iu|مجم|ملجم|جم|مل|%)?$/i.test(s) && !/^(?:0?[1-9]|1[0-2])[-/.](?:20)?\d{2}$/.test(s)) return false;
  if (/^20\d{2}[-/.](?:0?[1-9]|1[0-2])(?:[-/.](?:0?[1-9]|[12]\d|3[01]))?$/.test(s)) return true;
  if (/^(?:0?[1-9]|[12]\d|3[01])[-/.](?:0?[1-9]|1[0-2])[-/.](?:20)?\d{2}$/.test(s)) return true;
  if (/^(?:0?[1-9]|1[0-2])[-/.](?:20)?\d{2}$/.test(s)) return true;
  if (/^20\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\s+\d{1,2}:\d{2}/.test(s)) return true;
  if (/^(?:exp|expiry|mfg|date|تاريخ|صلاحية|انتهاء|إنتاج|انتاج)\b/i.test(s)) return true;
  if (/^\d{5}$/.test(s) && Number(s) >= 35000 && Number(s) <= 65000) return true;
  if (/^\d{1,2}[-/.](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|يناير|فبراير|مارس|ابريل|أبريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر)[-/.]\d{2,4}$/i.test(s)) return true;
  return false;
}

function cleanText(value: any): string {
  return normalizeDigits(String(value ?? '')).replace(/[\u0000-\u001F]/g, ' ').replace(/[\u064B-\u065F\u0670]/g, '').replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
}

function isNoise(value: any): boolean {
  const s = cleanText(value);
  if (!s) return true;
  if (/^\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm|ص|م)?$/i.test(s)) return true;
  if (/^(?:https?:\/\/|www\.)/i.test(s)) return true;
  return /^(?:item|description|product|medicine|name|qty|quantity|price|cost|total|subtotal|date|expiry|supplier|notes|الصنف|اسم الصنف|اسم الدواء|الدواء|البيان|الكمية|السعر|الإجمالي|المجموع|التاريخ|الصلاحية|المورد|ملاحظات)$/i.test(s);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(String(r.result || '')); r.onerror = () => reject(r.error); r.readAsDataURL(file);
  });
}

export async function fileToBase64(file: File): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  if (!/^data:image\//i.test(dataUrl) || typeof document === 'undefined') return dataUrl;
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = dataUrl; });
    const max = 2400; const scale = Math.min(1, max / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale)); canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const ctx = canvas.getContext('2d'); if (!ctx) return dataUrl;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  } catch { return dataUrl; }
}

async function processPDFDocument(file: File) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pageImages: string[] = []; const rows: string[][] = []; const textPages: string[] = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    try {
      const viewport = page.getViewport({ scale: 2 }); const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height); const ctx = canvas.getContext('2d');
      if (ctx) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); await page.render({ canvasContext: ctx, viewport }).promise; pageImages.push(canvas.toDataURL('image/jpeg', 0.9)); }
    } catch { /* text extraction remains usable when canvas rendering fails */ }
    const content = await page.getTextContent();
    const items = (content.items as any[]).filter(x => cleanText(x.str));
    const lines: { y: number; cells: { x: number; text: string }[] }[] = [];
    for (const item of items) {
      const x = Number(item.transform?.[4] || 0); const y = Number(item.transform?.[5] || 0); const text = cleanText(item.str);
      let line = lines.find(l => Math.abs(l.y - y) <= 4); if (!line) { line = { y, cells: [] }; lines.push(line); }
      line.cells.push({ x, text });
    }
    lines.sort((a, b) => b.y - a.y);
    const pageLines = lines.map(line => {
      line.cells.sort((a, b) => a.x - b.x);
      const cells: string[] = []; let previousX = -Infinity;
      for (const c of line.cells) { if (c.x - previousX > 18 && cells.length) cells.push(c.text); else if (cells.length) cells[cells.length - 1] += ` ${c.text}`; else cells.push(c.text); previousX = c.x + c.text.length * 3; }
      return cells.map(cleanText).filter(Boolean);
    }).filter(r => r.length);
    rows.push(...pageLines); textPages.push(pageLines.map(r => r.join('\t')).join('\n'));
  }
  return { pageImages, matrix: rows, extractedText: textPages.map((t, i) => `--- الصفحة ${i + 1} ---\n${t}`).join('\n') };
}

async function parseWord(file: File): Promise<{ text: string; matrix: any[][] }> {
  const buffer = await file.arrayBuffer();
  if (/\.doc$/i.test(file.name) || file.type === 'application/msword') throw new Error('ملفات Word القديمة .doc غير مدعومة مباشرة. احفظ الملف بصيغة .docx ثم أعد رفعه.');
  const [raw, html] = await Promise.all([mammoth.extractRawText({ arrayBuffer: buffer }), mammoth.convertToHtml({ arrayBuffer: buffer })]);
  const matrix: any[][] = [];
  if (typeof document !== 'undefined' && html.value) {
    const holder = document.createElement('div'); holder.innerHTML = html.value;
    holder.querySelectorAll('table').forEach(table => {
      table.querySelectorAll('tr').forEach(tr => { const cells = Array.from(tr.querySelectorAll('th,td')).map(td => cleanText(td.textContent)); if (cells.some(Boolean)) matrix.push(cells); });
    });
  }
  return { text: raw.value || holderText(html.value), matrix };
}
function holderText(html: string): string { return cleanText(html.replace(/<[^>]*>/g, ' ')); }

export async function parseUploadedFile(file: File): Promise<ParsedDocumentResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''; const mime = file.type || '';
  if (mime.startsWith('image/') || ['jpg','jpeg','png','webp','bmp','gif','heic','heif'].includes(ext)) return { fileName:file.name, fileType:'image', extractedText:'', mimeType:mime || 'image/jpeg', base64:await fileToBase64(file) };
  if (ext === 'pdf' || mime === 'application/pdf') {
    const p = await processPDFDocument(file); return { fileName:file.name, fileType:'pdf', extractedText:p.extractedText, tableData:p.matrix, rawMatrix:p.matrix, mimeType:'application/pdf', base64:p.pageImages[0], pageImages:p.pageImages, totalRowsCount:p.matrix.length };
  }
  if (['xlsx','xls','csv','tsv','ods'].includes(ext) || /spreadsheet|excel|csv/i.test(mime)) {
    const wb = XLSX.read(await file.arrayBuffer(), { type:'array', cellDates:true, raw:false }); const matrix:any[][]=[]; const parts:string[]=[];
    for (const name of wb.SheetNames) { const sheet=wb.Sheets[name]; const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false}) as any[][]; matrix.push([`__SHEET__ ${name}`], ...rows); parts.push(`--- ورقة: ${name} ---\n${XLSX.utils.sheet_to_csv(sheet)}`); }
    return { fileName:file.name, fileType:'excel', extractedText:parts.join('\n'), tableData:matrix, rawMatrix:matrix, mimeType:mime || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', totalRowsCount:matrix.length };
  }
  if (['docx','doc'].includes(ext) || /wordprocessingml|msword/i.test(mime)) { const w=await parseWord(file); return { fileName:file.name,fileType:'word',extractedText:w.text,tableData:w.matrix.length?w.matrix:undefined,rawMatrix:w.matrix.length?w.matrix:undefined,mimeType:mime || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',totalRowsCount:w.matrix.length }; }
  return { fileName:file.name,fileType:'text',extractedText:await file.text(),mimeType:mime || 'text/plain' };
}

function parseCSVLine(line:string):string[] { const out:string[]=[]; let cur=''; let quoted=false; for(let i=0;i<line.length;i++){const ch=line[i]; if(ch==='"'){if(quoted&&line[i+1]==='"'){cur+='"';i++;}else quoted=!quoted;}else if((ch===','||ch===';'||ch==='\t')&&!quoted){out.push(cur.trim());cur='';}else cur+=ch;} out.push(cur.trim()); return out; }
function normalizedName(s:string):string { return cleanText(s).toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[\W_]+/g,''); }
function bestKnownMedicine(name:string, known:string[]):string { const n=normalizedName(name); if(!n||!known.length)return name; let best=name,bestScore=0; for(const candidate of known){const c=normalizedName(candidate); if(!c)continue; if(c===n)return candidate; const common=[...new Set(n.split(''))].filter(ch=>c.includes(ch)).length; const score=common/Math.max(n.length,c.length); if(score>bestScore&&score>=0.72){bestScore=score;best=candidate;}} return best; }
function headerIndexes(row:any[]) { const idx={name:-1,qty:-1,price:-1,total:-1,bonus:-1,discount:-1,unit:-1,expiry:-1}; row.forEach((v,i)=>{const s=cleanText(v).toLowerCase(); if(idx.name<0&&/(اسم|صنف|دواء|مادة|بيان|item|name|product|medicine|description)/i.test(s)&&!/(صيدلية|مورد|supplier)/i.test(s))idx.name=i; else if(idx.qty<0&&/(كمية|كميه|عدد|qty|quantity|count)/i.test(s))idx.qty=i; else if(idx.total<0&&/(الإجمالي|الاجمالي|total|grand|مجموع)/i.test(s))idx.total=i; else if(idx.price<0&&/(سعر|تكلفة|شراء|price|cost|rate)/i.test(s)&&!/(total|اجمالي|إجمالي|مجموع)/i.test(s))idx.price=i; else if(idx.bonus<0&&/(بونص|مجاني|bonus|free|هدية)/i.test(s))idx.bonus=i; else if(idx.discount<0&&/(خصم|discount|disc)/i.test(s))idx.discount=i; else if(idx.unit<0&&/(وحدة|وحده|unit|pack|تعبئة)/i.test(s))idx.unit=i; else if(idx.expiry<0&&/(صلاحية|انتهاء|expiry|exp|mfg)/i.test(s))idx.expiry=i;}); return idx; }

export function mapTableDataToMedicineItems(tableData?: Array<Record<string,any>>|Array<any[]>, rawTextFallback?:string, fileName?:string, knownMedicines:string[]=[], _knownSuppliers:string[]=[]):ExtractedTableMedicineItem[]{
  const rows:any[][]=[]; if(Array.isArray(tableData)){ for(const row of tableData){ if(Array.isArray(row))rows.push(row); else if(row&&typeof row==='object')rows.push(Object.entries(row).map(([k,v])=>`${k}: ${v}`)); } }
  if(!rows.length&&rawTextFallback) rawTextFallback.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach(x=>rows.push(parseCSVLine(x)));
  let header=-1; let cols:any=undefined;
  for(let i=0;i<Math.min(rows.length,40);i++){const c=headerIndexes(rows[i]); if(c.name>=0){header=i;cols=c;break;}}
  const result:ExtractedTableMedicineItem[]=[];
  for(let r=header>=0?header+1:0;r<rows.length;r++){
    const row=rows[r].map(cleanText); if(!row.some(Boolean)||row[0].startsWith('__SHEET__'))continue;
    const nameIndex=cols?.name>=0?cols.name:-1; let name=nameIndex>=0?row[nameIndex]:'';
    if(!name){const candidates=row.filter(x=>x&&!isNoise(x)&&!isDateLike(x)&&isNaN(parseNumberClean(x))); name=candidates.sort((a,b)=>b.length-a.length)[0]||'';}
    if(!name||isNoise(name)||isDateLike(name))continue;
    const qty=cols?.qty>=0?parseNumberClean(row[cols.qty]):0; const price=cols?.price>=0?parseNumberClean(row[cols.price]):0; const total=cols?.total>=0?parseNumberClean(row[cols.total]):0;
    const finalQty=qty>0?qty:1; const finalPrice=price>0?price:(total>0&&finalQty>0?total/finalQty:0); const arithmeticTotal=finalPrice*finalQty;
    const uncertain=qty<=0||finalPrice<=0||(total>0&&Math.abs(arithmeticTotal-total)>Math.max(.01,total*.02));
    result.push({id:`item-${Date.now()}-${r}-${Math.random().toString(36).slice(2,7)}`,itemName:bestKnownMedicine(name,knownMedicines),quantity:finalQty,unit:cols?.unit>=0?(row[cols.unit]||'علبة'):'علبة',unitPrice:finalPrice,totalPrice:total>0?total:arithmeticTotal,bonusScheme:cols?.bonus>=0?row[cols.bonus]||'':'',discountPercent:cols?.discount>=0?parseNumberClean(row[cols.discount]):0,expiryDate:cols?.expiry>=0&&row[cols.expiry]&&!isDateLike(row[cols.expiry])?undefined:(cols?.expiry>=0?row[cols.expiry]||undefined:undefined),notes:'',isUncertain:uncertain,uncertaintyReason:uncertain?'بعض الكمية/السعر/الإجمالي غير مقروء أو لا يتطابق حسابياً؛ يلزم المراجعة.':undefined});
  }
  return result;
}
