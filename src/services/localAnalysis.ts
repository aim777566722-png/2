import { validateAndSanitizeInvoiceItemList } from '../utils/helpers';
import { mapTableDataToMedicineItems, parseNumberClean, isDateLike } from '../utils/documentParser';

type LocalFile={name:string;mimeType?:string;base64?:string;pageImages?:string[];extractedText?:string;tableData?:any[]};
const AR='٠١٢٣٤٥٦٧٨٩',FA='۰۱۲۳۴۵۶۷۸۹';
function normalizeDigits(v:any){return String(v??'').replace(/[٠-٩]/g,d=>String(AR.indexOf(d))).replace(/[۰-۹]/g,d=>String(FA.indexOf(d)))}
function normalizeText(v:any){return normalizeDigits(v).replace(/[\u064B-\u065F\u0670]/g,'').replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,'').replace(/\s+/g,' ').trim()}
function isNoise(v:any){const s=normalizeText(v);return !s||/^\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm|ص|م)?$/i.test(s)||/^(?:https?:\/\/|www\.)/i.test(s)||/^(?:www|http|https|ftp|com|net|org|mg|ml)$/i.test(s)}
function dataUrl(v:string,m='image/jpeg'){return !v?'':v.startsWith('data:')?v:`data:${m};base64,${v}`}
async function prepareImage(v:string){if(typeof window==='undefined'||!v)return v;return new Promise<string>(resolve=>{const img=new Image();img.onload=()=>{try{const max=3000,scale=Math.min(2.2,max/Math.max(img.naturalWidth||1,img.naturalHeight||1)),w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale)),h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');if(!x)return resolve(v);x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(img,0,0,w,h);resolve(c.toDataURL('image/png'))}catch{resolve(v)}};img.onerror=()=>resolve(v);img.src=v})}
function filterItems(items:any[]){return validateAndSanitizeInvoiceItemList(Array.isArray(items)?items:[]).filter(i=>{const n=normalizeText(i?.itemName);return n.length>=2&&!isNoise(n)&&/[A-Za-z\u0600-\u06FF]/.test(n)})}

// PDF text extraction can split Arabic table cells into irregular columns. Recover only
// rows that contain the characteristic price/quantity/batch/expiry/total sequence.
// This is deliberately additive: normal Excel/Word parsing and the existing mapper remain unchanged.
function extractStructuredPriceRows(text:string, knownMedicines:string[]){
 const out:any[]=[];
 const lines=text.split(/\r?\n/).map(normalizeText).filter(Boolean);
 const amount='[0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]{1,3})?|[0-9]+(?:\\.[0-9]{1,3})?';
 const re=new RegExp(`^(.+?)\\s+(${amount})\\s+(${amount})\\s+(${amount})\\s+(.+?)\\s+(${amount})\\s+([0-9]{5,})\\s+(20[0-9]{2}[-/.][0-9]{1,2}[-/.][0-9]{1,2})\\s+(${amount})$`,'i');
 for(const line of lines){
   const m=line.match(re); if(!m)continue;
   const name=m[1].trim(); const price=parseNumberClean(m[2]); const qty=parseNumberClean(m[3]); const bonus=parseNumberClean(m[4]); const tail=m[5].trim(); const total=parseNumberClean(m[8]);
   if(name.length<2||price<=0||qty<=0||total<=0||!isDateLike(m[7]))continue;
   const parts=tail.split(/\s+/); let unit=''; let discount=0;
   if(parts.length){const numeric=parts[parts.length-1]; if(/^[0-9]+(?:[.,][0-9]+)?$/.test(numeric)){discount=parseNumberClean(numeric); parts.pop();} unit=parts.join(' ')}
   if(!unit||/^0+(?:\.0+)?$/.test(unit))unit='علبة';
   out.push({id:`structured-${out.length}-${Date.now()}`,itemName:name,quantity:qty,unit,unitPrice:price,totalPrice:total,bonusScheme:bonus?String(bonus):'',discountPercent:discount,expiryDate:m[7],notes:'',isUncertain:Math.abs(price*qty-total)>Math.max(.01,total*.02),uncertaintyReason:Math.abs(price*qty-total)>Math.max(.01,total*.02)?'الإجمالي لا يطابق السعر × الكمية؛ يلزم المراجعة.':undefined});
 }
 return out;
}

export async function analyzeDocumentLocally(params:{files:LocalFile[];targetType:'order'|'invoice'|'price_list';knownMedicines?:string[];knownSuppliers?:string[];onProgress?:(p:number,m:string,s?:number)=>void}){
 const {files,targetType,knownMedicines=[],onProgress}=params;if(!files.length)throw new Error('لا توجد ملفات للتحليل المحلي');let text='',rawRows:any[]=[],images:{value:string;mimeType:string}[]=[];
 for(const f of files){if(f.extractedText)text+=`\n${f.extractedText}`;if(Array.isArray(f.tableData))rawRows.push(...f.tableData);for(const p of f.pageImages||[])images.push({value:p,mimeType:'image/jpeg'});if(f.base64&&!f.pageImages?.length&&/image\//i.test(f.mimeType||''))images.push({value:f.base64,mimeType:f.mimeType||'image/jpeg'})}
 const structured=extractStructuredPriceRows(text,knownMedicines);
 let items=structured.length>=2?filterItems(structured):filterItems(mapTableDataToMedicineItems(rawRows.length?rawRows:undefined,text.trim(),files.map(f=>f.name).join(' + '),knownMedicines));
 let ocrPages=0;
 if(images.length){const {ocrImageDataUrlWithLayout}=await import('./localOcrFixed');for(let i=0;i<images.length;i++){onProgress?.(20+Math.round(i/images.length*65),`استخراج البيانات محلياً من الصفحة ${i+1} من ${images.length}...`,2);try{const ocr=await ocrImageDataUrlWithLayout(await prepareImage(dataUrl(images[i].value,images[i].mimeType)),p=>onProgress?.(20+Math.round(((i+p/100)/images.length)*65),'تشغيل OCR المحلي...',2));if(ocr.text)text+=`\n${ocr.text}`;const source=ocr.layoutText||ocr.text||'';if(source){const structuredOcr=extractStructuredPriceRows(source,knownMedicines);const parsed=structuredOcr.length>=2?structuredOcr:mapTableDataToMedicineItems(undefined,source,files[i]?.name,knownMedicines);items=filterItems([...items,...filterItems(parsed)])}ocrPages++}catch(e){console.warn('Local OCR page failed:',e)}}}
 const unique=new Map<string,any>();for(const item of items){const key=`${normalizeText(item.itemName).toLowerCase()}|${item.quantity}|${item.unitPrice}`;if(!unique.has(key))unique.set(key,item)}items=Array.from(unique.values());const totalAmount=items.reduce((s,i)=>s+(Number(i.totalPrice)||0),0);onProgress?.(94,`اكتمل التحليل المحلي: ${items.length} صنفاً${ocrPages?` من ${ocrPages} صفحة`:''}`,3);
 return {detectedType:targetType,documentTitle:files.map(f=>f.name).join(' + '),partyName:'',documentNumber:'',documentDate:'',currency:'ريال',totalAmount,items,confidence:items.length?90:35,summary:items.length?`تحليل محلي: تم اعتماد ${items.length} صنفاً بعد التنقية والمطابقة المرجعية.`:'تحليل محلي: لم يتم العثور على صفوف دوائية موثوقة؛ لم يتم اختراع بيانات بديلة.',rawText:text.trim()};
}
