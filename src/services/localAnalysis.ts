import { validateAndSanitizeInvoiceItemList } from '../utils/helpers';
import { mapTableDataToMedicineItems, parseNumberClean } from '../utils/documentParser';

type LocalFile={name:string;mimeType?:string;base64?:string;pageImages?:string[];extractedText?:string;tableData?:any[]};
const AR='٠١٢٣٤٥٦٧٨٩',FA='۰۱۲۳۴۵۶۷۸۹';
function normalizeDigits(v:any){return String(v??'').replace(/[٠-٩]/g,d=>String(AR.indexOf(d))).replace(/[۰-۹]/g,d=>String(FA.indexOf(d)))}
function normalizeText(v:any){return normalizeDigits(v).replace(/[\u064B-\u065F\u0670]/g,'').replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,'').replace(/\s+/g,' ').trim()}
function isNoise(v:any){const s=normalizeText(v);return !s||/^(?:https?:\/\/|www\.)/i.test(s)||/^(?:www|http|https|ftp|com|net|org)$/i.test(s)||/^(?:اسم|السعر|الكمية|البونص|الوحدة|التخفيض|رقم التشغيلة|تاريخ الانتهاء|القيمة)$/i.test(s)||/(?:الإجمالي|استلمت البضاعة|أمين المستودع|التوقيع|ملاحظات\s*:)/i.test(s)}
function dataUrl(v:string,m='image/jpeg'){return !v?'':v.startsWith('data:')?v:`data:${m};base64,${v}`}
async function prepareImage(v:string){if(typeof window==='undefined'||!v)return v;return new Promise<string>(resolve=>{const img=new Image();img.onload=()=>{try{const max=3200,scale=Math.min(2.4,max/Math.max(img.naturalWidth||1,img.naturalHeight||1)),w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale)),h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');if(!x)return resolve(v);x.fillStyle='#fff';x.fillRect(0,0,w,h);x.imageSmoothingEnabled=true;x.drawImage(img,0,0,w,h);resolve(c.toDataURL('image/png'))}catch{resolve(v)}};img.onerror=()=>resolve(v);img.src=v})}
function filterItems(items:any[]){return validateAndSanitizeInvoiceItemList(Array.isArray(items)?items:[]).filter(i=>{const n=normalizeText(i?.itemName);return n.length>=2&&!isNoise(n)&&/[A-Za-z\u0600-\u06FF]/.test(n)&&Number(i?.quantity)>0&&Number(i?.unitPrice)>0})}

function amountLike(s:any){return /^[+-]?(?:\d{1,3}(?:[,.]\d{3})*|\d+)(?:[.,]\d+)?$/.test(normalizeText(s))}
function batchLike(s:any){return /^\d{5,10}$/.test(normalizeDigits(s))}
function dateLike(s:any){return /^(?:(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.](?:19|20)?\d{2})$/.test(normalizeDigits(s))}
function looksName(s:any){const n=normalizeText(s);return n.length>=3&&/[A-Za-z\u0600-\u06FF]/.test(n)&&!isNoise(n)&&!amountLike(n)&&!batchLike(n)&&!dateLike(n)}

// The local engine deliberately anchors a row on its numeric structure instead of
// asking the generic table mapper to guess. This prevents headers, signatures and
// footer text from becoming medicines and works even when OCR damages the date.
function parseRow(cells0:any[], id:string){
 const cells=cells0.map(normalizeText).filter(Boolean); if(cells.length<4)return null;
 const batchIndex=cells.findIndex(batchLike);
 const nameCandidates=(batchIndex>=0?cells.slice(0,batchIndex):cells).filter(looksName);
 if(!nameCandidates.length)return null;
 const name=nameCandidates.sort((a,b)=>b.length-a.length)[0];
 const before=batchIndex>=0?cells.slice(0,batchIndex):cells;
 const nums=before.filter(amountLike).map(parseNumberClean);
 if(nums.length<2)return null;
 // Typical source layout: name | price | quantity | bonus | unit | discount | batch | expiry | total.
 const price=nums[0], quantity=nums[1], bonus=nums.length>=3?nums[2]:0;
 if(!(price>0&&quantity>0))return null;
 const after=batchIndex>=0?cells.slice(batchIndex+1):[];
 const afterAmounts=after.filter(amountLike).map(parseNumberClean);
 const total=afterAmounts.length?afterAmounts[afterAmounts.length-1]:0;
 // If OCR placed the total before the batch, use the final numeric cell only when it
 // is mathematically consistent; otherwise leave it zero and let validation flag it.
 const candidateTotal=total>0?total:(nums.length>=3&&Math.abs(nums[nums.length-1]-price*quantity)<=Math.max(.01,price*quantity*.03)?nums[nums.length-1]:0);
 if(!(candidateTotal>0))return null;
 const between=batchIndex>=0?cells.slice(2,batchIndex):[];
 const unit=between.find(c=>!amountLike(c)&&!isNoise(c)&&!dateLike(c))||'علبة';
 const expiry=after.find(dateLike);
 const discountNums=between.filter(amountLike).map(parseNumberClean);
 const discount=discountNums.length>=2?discountNums[discountNums.length-1]:0;
 const mismatch=Math.abs(price*quantity-candidateTotal)>Math.max(.01,candidateTotal*.02);
 return {id,itemName:name,quantity,unit,unitPrice:price,totalPrice:candidateTotal,bonusScheme:bonus?String(bonus):'',discountPercent:discount,expiryDate:expiry||'',notes:'',isUncertain:mismatch,uncertaintyReason:mismatch?'الإجمالي لا يطابق السعر × الكمية؛ يلزم المراجعة.':undefined};
}

function extractStructuredPriceRows(source:any){
 const out:any[]=[];
 const rows=Array.isArray(source)?source:(String(source||'').split(/\r?\n/).map(line=>line.includes('|')?line.split('|'):line.split(/\t+/)));
 for(let r=0;r<rows.length;r++){const item=parseRow(rows[r],`structured-${r}-${Date.now()}`);if(item)out.push(item)}
 return out;
}

function collectTableRows(files:LocalFile[]){const rows:any[]=[];for(const f of files){if(Array.isArray(f.tableData))for(const row of f.tableData){if(Array.isArray(row))rows.push(row);else if(row&&typeof row==='object')rows.push(Object.values(row))}}return rows}

export async function analyzeDocumentLocally(params:{files:LocalFile[];targetType:'order'|'invoice'|'price_list';knownMedicines?:string[];knownSuppliers?:string[];onProgress?:(p:number,m:string,s?:number)=>void}){
 const {files,targetType,knownMedicines=[],onProgress}=params;if(!files.length)throw new Error('لا توجد ملفات للتحليل المحلي');
 let text='',rawRows:any[]=collectTableRows(files),images:{value:string;mimeType:string}[]=[];
 for(const f of files){if(f.extractedText)text+=`\n${f.extractedText}`;for(const p of f.pageImages||[])images.push({value:p,mimeType:'image/jpeg'});if(f.base64&&!f.pageImages?.length&&/image\//i.test(f.mimeType||''))images.push({value:f.base64,mimeType:f.mimeType||'image/jpeg'})}
 let items:any[]=targetType==='price_list'?filterItems(extractStructuredPriceRows(rawRows)):filterItems(rawRows.length?mapTableDataToMedicineItems(rawRows,text.trim(),files.map(f=>f.name).join(' + '),knownMedicines):[]);
 let ocrPages=0;
 if(images.length){const {ocrImageDataUrlWithLayout}=await import('./localOcrFixed');for(let i=0;i<images.length;i++){
   onProgress?.(20+Math.round(i/images.length*65),`استخراج البيانات محلياً من الصفحة ${i+1} من ${images.length}...`,2);
   try{const ocr=await ocrImageDataUrlWithLayout(await prepareImage(dataUrl(images[i].value,images[i].mimeType)),p=>onProgress?.(20+Math.round(((i+p/100)/images.length)*65),'تشغيل OCR المحلي...',2));
     if(ocr.text)text+=`\n${ocr.text}`;
     const source=ocr.layoutText||ocr.text||'';
     if(source){
       const structured=extractStructuredPriceRows(source);
       if(targetType==='price_list')items=filterItems([...items,...structured]);
       else {const parsed=mapTableDataToMedicineItems(undefined,source,files[i]?.name,knownMedicines);items=filterItems([...items,...parsed])}
     }
     ocrPages++;
   }catch(e){console.warn('Local OCR page failed:',e)}
 }}
 const unique=new Map<string,any>();for(const item of items){const key=`${normalizeText(item.itemName).toLowerCase()}|${item.quantity}|${item.unitPrice}|${item.totalPrice}`;if(!unique.has(key))unique.set(key,item)}
 items=Array.from(unique.values());const totalAmount=items.reduce((s,i)=>s+(Number(i.totalPrice)||0),0);onProgress?.(94,`اكتمل التحليل المحلي: ${items.length} صنفاً${ocrPages?` من ${ocrPages} صفحة`:''}`,3);
 return {detectedType:targetType,documentTitle:files.map(f=>f.name).join(' + '),partyName:'',documentNumber:'',documentDate:'',currency:'ريال',totalAmount,items,confidence:items.length?90:35,summary:items.length?`تحليل محلي: تم اعتماد ${items.length} صنفاً بعد التنقية والمطابقة المرجعية.`:'تحليل محلي: لم يتم العثور على صفوف دوائية موثوقة؛ لم يتم اختراع بيانات بديلة.',rawText:text.trim()};
}
