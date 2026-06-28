'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

type ReceiptType = 'fuel' | 'maintenance' | 'delivery'

interface BaseReceipt {
  id: string
  receipt_number: string
  fund_code: string | null
  receipt_date: string
  amount: number
  created_at: string
  attachment_url?: string | null
}

interface FuelReceipt extends BaseReceipt {
  driver_name: string
  receiver_name: string
  vehicle_number: string
  product_type: string
  quantity: number
}

interface MaintenanceReceipt extends BaseReceipt {
  vehicle_type: string
  vehicle_number: string
  odometer_reading: number
  owner_name: string
  maintenance_type: string
  workshop_name: string
}

interface DeliveryReceipt extends BaseReceipt {
  receiver_name: string
  id_number: string
  amount_text: string
  details: string
}

interface Fund {
  fund_code: string
  source: string
}

const receiptTypes = [
  { key: 'fuel', label: 'وصل كاز المولدات', prefix: 'P', color: '#b45309', bg: '#fef9c3' },
  { key: 'maintenance', label: 'وصل صيانة السيارات', prefix: 'C', color: '#1d4ed8', bg: '#dbeafe' },
  { key: 'delivery', label: 'وصل تسليم مبلغ', prefix: 'M', color: '#15803d', bg: '#dcfce7' },
]

// تحويل الأرقام إلى كلمات بالعربي
function numberToArabicWords(num: number): string {
  if (num === 0) return 'صفر'
  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة']
  const tens = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون']
  const teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر']
  const hundreds = ['', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة']

  function threeDigits(n: number): string {
    let result = ''
    const h = Math.floor(n / 100)
    const rem = n % 100
    if (h > 0) result += hundreds[h]
    if (rem > 0) {
      if (result) result += ' و'
      if (rem < 10) result += ones[rem]
      else if (rem < 20) result += teens[rem - 10]
      else {
        const t = Math.floor(rem / 10)
        const o = rem % 10
        if (o > 0) result += ones[o] + ' و' + tens[t]
        else result += tens[t]
      }
    }
    return result
  }

  function groupName(count: number, singular: string, dual: string, plural: string): string {
    if (count === 1) return singular
    if (count === 2) return dual
    return plural
  }

  const million = Math.floor(num / 1000000)
  const thousand = Math.floor((num % 1000000) / 1000)
  const rest = num % 1000

  let parts: string[] = []
  if (million > 0) {
    if (million === 1) parts.push('مليون')
    else if (million === 2) parts.push('مليونان')
    else parts.push(threeDigits(million) + ' ' + groupName(million, 'مليون', 'مليونان', 'مليون'))
  }
  if (thousand > 0) {
    if (thousand === 1) parts.push('ألف')
    else if (thousand === 2) parts.push('ألفان')
    else parts.push(threeDigits(thousand) + ' ' + groupName(thousand, 'ألف', 'ألفان', 'ألف'))
  }
  if (rest > 0) {
    parts.push(threeDigits(rest))
  }
  return parts.join(' و') + ' دينار عراقي فقط لا غير'
}

export default function Receipts({ readOnly = false }: { readOnly?: boolean }) {
  const [activeType, setActiveType] = useState<ReceiptType>('fuel')
  const [funds, setFunds] = useState<Fund[]>([])
  const [fuelReceipts, setFuelReceipts] = useState<FuelReceipt[]>([])
  const [maintenanceReceipts, setMaintenanceReceipts] = useState<MaintenanceReceipt[]>([])
  const [deliveryReceipts, setDeliveryReceipts] = useState<DeliveryReceipt[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const printRef = useRef<HTMLDivElement>(null)
  const [lastPrintedReceipt, setLastPrintedReceipt] = useState<any>(null)
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false)
  const typeDropdownRef = useRef<HTMLDivElement>(null)

  const [fuelForm, setFuelForm] = useState({ fund_code: '', driver_name: '', receiver_name: '', vehicle_number: '', receipt_date: '', product_type: '', quantity: '', amount: '' })
  const [maintForm, setMaintForm] = useState({ fund_code: '', receipt_date: '', vehicle_type: '', vehicle_number: '', odometer_reading: '', owner_name: '', maintenance_type: '', workshop_name: '', amount: '' })
  const [deliveryForm, setDeliveryForm] = useState({ fund_code: '', receipt_date: '', receiver_name: '', id_number: '', amount: '', details: '' })
  const [fuelAttachment, setFuelAttachment] = useState<File | null>(null)
  const [maintAttachment, setMaintAttachment] = useState<File | null>(null)
  const [deliveryAttachment, setDeliveryAttachment] = useState<File | null>(null)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setTypeDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const now = new Date()
    const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0,16)
    setFuelForm(f => ({ ...f, receipt_date: localDateTime }))
    setMaintForm(f => ({ ...f, receipt_date: localDateTime }))
    setDeliveryForm(f => ({ ...f, receipt_date: localDateTime }))
    loadFunds()
    loadAllReceipts()
  }, [])

  async function loadFunds() {
    const { data } = await supabase.from('funds').select('fund_code, source').not('fund_code', 'is', null)
    setFunds((data as Fund[]) || [])
  }

  async function loadAllReceipts() {
    setLoading(true)
    const [fuelRes, maintRes, deliveryRes] = await Promise.all([
      supabase.from('fuel_receipts').select('*').order('created_at', { ascending: false }),
      supabase.from('maintenance_receipts').select('*').order('created_at', { ascending: false }),
      supabase.from('delivery_receipts').select('*').order('created_at', { ascending: false }),
    ])
    setFuelReceipts((fuelRes.data as FuelReceipt[]) || [])
    setMaintenanceReceipts((maintRes.data as MaintenanceReceipt[]) || [])
    setDeliveryReceipts((deliveryRes.data as DeliveryReceipt[]) || [])
    setLoading(false)
  }

  async function getNextReceiptNumber(prefix: string): Promise<string> {
    const { data, error } = await supabase.rpc('get_next_receipt_number', { p_type: prefix })
    if (error || !data) {
      // fallback manual
      const tableMap: Record<string,string> = { P: 'fuel_receipts', C: 'maintenance_receipts', M: 'delivery_receipts' }
      const { count } = await supabase.from(tableMap[prefix]).select('*', { count: 'exact', head: true })
      const next = (count || 0) + 1
      return prefix + '-' + String(next).padStart(4, '0')
    }
    return data as string
  }

  async function uploadAttachment(file: File, prefix: string): Promise<string | null> {
    const fileExt = file.name.split('.').pop()
    const fileName = `${prefix}_${Date.now()}.${fileExt}`
    const { data, error } = await supabase.storage.from('receipt-attachments').upload(fileName, file)
    if (error) { alert('خطأ في رفع المرفق: ' + error.message); return null }
    const { data: urlData } = supabase.storage.from('receipt-attachments').getPublicUrl(data.path)
    return urlData.publicUrl
  }

  async function saveFuelReceipt(shouldPrint: boolean) {
    if (!fuelForm.driver_name || !fuelForm.receiver_name || !fuelForm.vehicle_number || !fuelForm.product_type || !fuelForm.quantity || !fuelForm.amount) {
      alert('يرجى تعبئة جميع الحقول المطلوبة'); return
    }
    setLoading(true)
    let attachmentUrl: string | null = null
    if (fuelAttachment) {
      setUploadingAttachment(true)
      attachmentUrl = await uploadAttachment(fuelAttachment, 'fuel')
      setUploadingAttachment(false)
    }
    const receiptNumber = await getNextReceiptNumber('P')
    const { data, error } = await supabase.from('fuel_receipts').insert([{
      receipt_number: receiptNumber,
      fund_code: fuelForm.fund_code || null,
      driver_name: fuelForm.driver_name,
      receiver_name: fuelForm.receiver_name,
      vehicle_number: fuelForm.vehicle_number,
      receipt_date: fuelForm.receipt_date,
      product_type: fuelForm.product_type,
      quantity: parseFloat(fuelForm.quantity),
      amount: parseFloat(fuelForm.amount),
      attachment_url: attachmentUrl
    }]).select().single()
    if (error) alert('خطأ: ' + error.message)
    else {
      setLastPrintedReceipt({ type: 'fuel', ...data })
      setFuelForm({ ...fuelForm, driver_name:'', receiver_name:'', vehicle_number:'', product_type:'', quantity:'', amount:'' })
      setFuelAttachment(null)
      setShowForm(false)
      loadAllReceipts()
      if (shouldPrint) setTimeout(()=>printReceipt({ type: 'fuel', ...data }), 300)
    }
    setLoading(false)
  }

  async function saveMaintenanceReceipt(shouldPrint: boolean) {
    if (!maintForm.vehicle_type || !maintForm.vehicle_number || !maintForm.odometer_reading || !maintForm.owner_name || !maintForm.maintenance_type || !maintForm.workshop_name || !maintForm.amount) {
      alert('يرجى تعبئة جميع الحقول المطلوبة'); return
    }
    setLoading(true)
    let attachmentUrl: string | null = null
    if (maintAttachment) {
      setUploadingAttachment(true)
      attachmentUrl = await uploadAttachment(maintAttachment, 'maintenance')
      setUploadingAttachment(false)
    }
    const receiptNumber = await getNextReceiptNumber('C')
    const { data, error } = await supabase.from('maintenance_receipts').insert([{
      receipt_number: receiptNumber,
      fund_code: maintForm.fund_code || null,
      receipt_date: maintForm.receipt_date,
      vehicle_type: maintForm.vehicle_type,
      vehicle_number: maintForm.vehicle_number,
      odometer_reading: parseFloat(maintForm.odometer_reading),
      owner_name: maintForm.owner_name,
      maintenance_type: maintForm.maintenance_type,
      workshop_name: maintForm.workshop_name,
      amount: parseFloat(maintForm.amount),
      attachment_url: attachmentUrl
    }]).select().single()
    if (error) alert('خطأ: ' + error.message)
    else {
      setLastPrintedReceipt({ type: 'maintenance', ...data })
      setMaintForm({ ...maintForm, vehicle_type:'', vehicle_number:'', odometer_reading:'', owner_name:'', maintenance_type:'', workshop_name:'', amount:'' })
      setMaintAttachment(null)
      setShowForm(false)
      loadAllReceipts()
      if (shouldPrint) setTimeout(()=>printReceipt({ type: 'maintenance', ...data }), 300)
    }
    setLoading(false)
  }

  async function saveDeliveryReceipt(shouldPrint: boolean) {
    if (!deliveryForm.receiver_name || !deliveryForm.id_number || !deliveryForm.amount) {
      alert('يرجى تعبئة جميع الحقول المطلوبة'); return
    }
    setLoading(true)
    let attachmentUrl: string | null = null
    if (deliveryAttachment) {
      setUploadingAttachment(true)
      attachmentUrl = await uploadAttachment(deliveryAttachment, 'delivery')
      setUploadingAttachment(false)
    }
    const receiptNumber = await getNextReceiptNumber('M')
    const amountNum = parseFloat(deliveryForm.amount)
    const amountText = numberToArabicWords(amountNum)
    const { data, error } = await supabase.from('delivery_receipts').insert([{
      receipt_number: receiptNumber,
      fund_code: deliveryForm.fund_code || null,
      receipt_date: deliveryForm.receipt_date,
      receiver_name: deliveryForm.receiver_name,
      id_number: deliveryForm.id_number,
      amount: amountNum,
      amount_text: amountText,
      details: deliveryForm.details,
      attachment_url: attachmentUrl
    }]).select().single()
    if (error) alert('خطأ: ' + error.message)
    else {
      setLastPrintedReceipt({ type: 'delivery', ...data })
      setDeliveryForm({ ...deliveryForm, receiver_name:'', id_number:'', amount:'', details:'' })
      setDeliveryAttachment(null)
      setShowForm(false)
      loadAllReceipts()
      if (shouldPrint) setTimeout(()=>printReceipt({ type: 'delivery', ...data }), 300)
    }
    setLoading(false)
  }

  async function deleteReceipt(type: ReceiptType, id: string) {
    if (!confirm('هل أنت متأكد من حذف هذا الوصل؟')) return
    const tableMap: Record<ReceiptType,string> = { fuel: 'fuel_receipts', maintenance: 'maintenance_receipts', delivery: 'delivery_receipts' }
    await supabase.from(tableMap[type]).delete().eq('id', id)
    loadAllReceipts()
  }

  function formatAmount(n: number) { return Number(n).toLocaleString('ar-IQ') + ' د.ع' }
  function formatDateTime(d: string) {
    const dt = new Date(d)
    return dt.toLocaleDateString('ar-IQ') + ' - ' + dt.toLocaleTimeString('ar-IQ', {hour:'2-digit',minute:'2-digit'})
  }

  function printReceipt(receipt: any) {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    let bodyHtml = ''
    const dateStr = formatDateTime(receipt.receipt_date)

    if (receipt.type === 'fuel') {
      bodyHtml = `
        <div class="receipt-title">وصل تسليم كاز المولدات</div>
        <div class="receipt-number">رقم الوصل: ${receipt.receipt_number}</div>
        <table class="info-table">
          <tr><td class="label">التاريخ والوقت</td><td>${dateStr}</td></tr>
          <tr><td class="label">كود السلفة</td><td>${receipt.fund_code || '—'}</td></tr>
          <tr><td class="label">اسم السائق</td><td>${receipt.driver_name}</td></tr>
          <tr><td class="label">اسم المستلم</td><td>${receipt.receiver_name}</td></tr>
          <tr><td class="label">رقم السيارة</td><td>${receipt.vehicle_number}</td></tr>
          <tr><td class="label">نوع المنتج</td><td>${receipt.product_type}</td></tr>
          <tr><td class="label">الكمية</td><td>${receipt.quantity}</td></tr>
          <tr><td class="label">المبلغ</td><td>${formatAmount(receipt.amount)}</td></tr>
        </table>
        <div class="signatures-3">
          <div class="sig-box"><div class="sig-line">مدير الموارد البشرية</div></div>
          <div class="sig-box"><div class="sig-line">قسم الحسابات</div></div>
          <div class="sig-box"><div class="sig-line">مدير الموقع</div></div>
        </div>
      `
    } else if (receipt.type === 'maintenance') {
      bodyHtml = `
        <div class="receipt-title">وصل صيانة السيارات</div>
        <div class="receipt-number">رقم الوصل: ${receipt.receipt_number}</div>
        <table class="info-table">
          <tr><td class="label">التاريخ والوقت</td><td>${dateStr}</td></tr>
          <tr><td class="label">كود السلفة</td><td>${receipt.fund_code || '—'}</td></tr>
          <tr><td class="label">نوع المركبة</td><td>${receipt.vehicle_type}</td></tr>
          <tr><td class="label">رقم المركبة</td><td>${receipt.vehicle_number}</td></tr>
          <tr><td class="label">عداد المشي</td><td>${receipt.odometer_reading}</td></tr>
          <tr><td class="label">اسم صاحب المركبة</td><td>${receipt.owner_name}</td></tr>
          <tr><td class="label">نوع الصيانة</td><td>${receipt.maintenance_type}</td></tr>
          <tr><td class="label">اسم محل الصيانة</td><td>${receipt.workshop_name}</td></tr>
          <tr><td class="label">المبلغ</td><td>${formatAmount(receipt.amount)}</td></tr>
        </table>
        <div class="signatures-3">
          <div class="sig-box"><div class="sig-line">مدير الموارد البشرية</div></div>
          <div class="sig-box"><div class="sig-line">قسم الحسابات</div></div>
          <div class="sig-box"><div class="sig-line">مدير الموقع</div></div>
        </div>
      `
    } else {
      bodyHtml = `
        <div class="receipt-title">وصل تسليم مبلغ</div>
        <div class="receipt-number">رقم الوصل: ${receipt.receipt_number}</div>
        <table class="info-table">
          <tr><td class="label">التاريخ والوقت</td><td>${dateStr}</td></tr>
          <tr><td class="label">كود السلفة</td><td>${receipt.fund_code || '—'}</td></tr>
          <tr><td class="label">اسم المستلم</td><td>${receipt.receiver_name}</td></tr>
          <tr><td class="label">رقم الهوية</td><td>${receipt.id_number}</td></tr>
          <tr><td class="label">المبلغ رقماً</td><td>${formatAmount(receipt.amount)}</td></tr>
          <tr><td class="label">المبلغ كتابةً</td><td>${receipt.amount_text}</td></tr>
          <tr><td class="label">تفاصيل المبلغ</td><td>${receipt.details || '—'}</td></tr>
        </table>
        <div class="signatures-2">
          <div class="sig-box"><div class="sig-line">قسم الحسابات</div></div>
          <div class="sig-box"><div class="sig-line">مستلم المبلغ</div></div>
        </div>
      `
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>وصل ${receipt.receipt_number}</title>
        <style>
          @page { margin: 15mm; size: A4; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; direction: rtl; color: #111; }
          .company-header { text-align: center; border-bottom: 3px solid #1e40af; padding-bottom: 14px; margin-bottom: 20px; }
          .company-name { font-size: 20px; font-weight: bold; color: #1e40af; }
          .receipt-title { font-size: 18px; font-weight: bold; text-align: center; margin-bottom: 6px; color: #111827; }
          .receipt-number { font-size: 14px; text-align: center; margin-bottom: 24px; color: #6b7280; font-weight: 600; }
          .info-table { width: 100%; border-collapse: collapse; margin-bottom: 50px; }
          .info-table td { padding: 10px 14px; border: 1px solid #d1d5db; font-size: 14px; }
          .info-table .label { background: #f3f4f6; font-weight: 600; width: 35%; color: #374151; }
          .signatures-3 { display: flex; justify-content: space-between; margin-top: 60px; padding: 0 10px; }
          .signatures-2 { display: flex; justify-content: space-around; margin-top: 60px; padding: 0 40px; }
          .sig-box { text-align: center; min-width: 150px; }
          .sig-line { border-top: 1px solid #111; margin-top: 50px; padding-top: 8px; font-size: 13px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="company-header"><div class="company-name">Sanya International Company</div></div>
        ${bodyHtml}
      </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => { printWindow.print() }, 400)
  }

  const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, border:'2px solid #d1d5db', fontSize:13, boxSizing:'border-box' as const, color:'#111827', background:'#fff', marginBottom:10 }

  // قائمة موحدة للوصولات لغرض البحث والعرض
  const allReceiptsForSearch = useMemo(() => {
    const fuel = fuelReceipts.map(r => ({ ...r, type: 'fuel' as ReceiptType, displayName: r.driver_name, typeLabel: 'كاز المولدات' }))
    const maint = maintenanceReceipts.map(r => ({ ...r, type: 'maintenance' as ReceiptType, displayName: r.owner_name, typeLabel: 'صيانة السيارات' }))
    const delivery = deliveryReceipts.map(r => ({ ...r, type: 'delivery' as ReceiptType, displayName: r.receiver_name, typeLabel: 'تسليم مبلغ' }))
    return [...fuel, ...maint, ...delivery].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [fuelReceipts, maintenanceReceipts, deliveryReceipts])

  const filteredSearch = useMemo(() => {
    let results = allReceiptsForSearch
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      results = results.filter(r =>
        r.receipt_number.toLowerCase().includes(term) ||
        (r.fund_code || '').toLowerCase().includes(term) ||
        r.displayName.toLowerCase().includes(term) ||
        r.typeLabel.includes(term)
      )
    }
    if (dateFrom) {
      results = results.filter(r => new Date(r.receipt_date) >= new Date(dateFrom))
    }
    if (dateTo) {
      const toDate = new Date(dateTo); toDate.setHours(23,59,59,999)
      results = results.filter(r => new Date(r.receipt_date) <= toDate)
    }
    return results
  }, [allReceiptsForSearch, searchTerm, dateFrom, dateTo])

  const currentTypeInfo = receiptTypes.find(t => t.key === activeType)!

  return (
    <div style={{margin:'24px',fontFamily:'system-ui',direction:'rtl'}}>

      <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden',marginBottom:16}}>
        <div style={{padding:'16px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
          <h2 style={{margin:0,fontSize:17,fontWeight:700,color:'#111827'}}>الوصولات</h2>
          {!readOnly && (
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              {/* قائمة منسدلة لاختيار نوع الوصل */}
              <div ref={typeDropdownRef} style={{position:'relative',minWidth:220}}>
                <button onClick={()=>setTypeDropdownOpen(!typeDropdownOpen)}
                  style={{width:'100%',padding:'9px 14px',borderRadius:8,border:'2px solid #d1d5db',background:'#fff',cursor:'pointer',
                    fontSize:13,color:'#111827',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span style={{fontWeight:600}}>{currentTypeInfo.label}</span>
                  <span style={{fontSize:11,color:'#9ca3af'}}>{typeDropdownOpen ? '▲' : '▼'}</span>
                </button>
                {typeDropdownOpen && (
                  <div style={{position:'absolute',top:'100%',right:0,left:0,marginTop:4,background:'#fff',border:'2px solid #d1d5db',borderRadius:8,
                    boxShadow:'0 8px 24px rgba(0,0,0,0.12)',zIndex:20}}>
                    {receiptTypes.map(t => (
                      <button key={t.key} onClick={()=>{ setActiveType(t.key as ReceiptType); setTypeDropdownOpen(false); setShowForm(false) }}
                        style={{width:'100%',textAlign:'right',padding:'10px 14px',background:activeType===t.key?t.bg:'#fff',border:'none',
                          borderBottom:'1px solid #f3f4f6',cursor:'pointer',fontSize:13,fontWeight:600,color:activeType===t.key?t.color:'#374151'}}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={()=>setShowForm(!showForm)}
                style={{background:currentTypeInfo.color,color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:14,fontWeight:600}}>
                {showForm ? 'إلغاء' : '+ إضافة وصل جديد'}
              </button>
            </div>
          )}
        </div>

        {/* نموذج وصل الكاز */}
        {!readOnly && showForm && activeType === 'fuel' && (
          <div style={{padding:'20px',borderBottom:'2px solid #e5e7eb',background:'#fef9c3'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,maxWidth:700}}>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>كود السلفة</label>
                <select value={fuelForm.fund_code} onChange={e=>setFuelForm({...fuelForm,fund_code:e.target.value})} style={inputStyle}>
                  <option value="">بدون سلفة</option>
                  {funds.map(f => <option key={f.fund_code} value={f.fund_code}>{f.fund_code} — {f.source}</option>)}
                </select>
              </div>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>التاريخ والوقت</label>
                <input type="datetime-local" value={fuelForm.receipt_date} onChange={e=>setFuelForm({...fuelForm,receipt_date:e.target.value})} style={inputStyle}/></div>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>اسم السائق *</label>
                <input value={fuelForm.driver_name} onChange={e=>setFuelForm({...fuelForm,driver_name:e.target.value})} style={inputStyle}/></div>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>اسم المستلم *</label>
                <input value={fuelForm.receiver_name} onChange={e=>setFuelForm({...fuelForm,receiver_name:e.target.value})} style={inputStyle}/></div>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>رقم السيارة *</label>
                <input value={fuelForm.vehicle_number} onChange={e=>setFuelForm({...fuelForm,vehicle_number:e.target.value})} style={inputStyle}/></div>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>نوع المنتج *</label>
                <input value={fuelForm.product_type} onChange={e=>setFuelForm({...fuelForm,product_type:e.target.value})} placeholder="مثال: كاز" style={inputStyle}/></div>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>الكمية *</label>
                <input type="number" value={fuelForm.quantity} onChange={e=>setFuelForm({...fuelForm,quantity:e.target.value})} style={inputStyle}/></div>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>المبلغ (د.ع) *</label>
                <input type="number" value={fuelForm.amount} onChange={e=>setFuelForm({...fuelForm,amount:e.target.value})} style={inputStyle}/></div>
              <div style={{gridColumn:'span 2'}}>
                <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>مرفق الفاتورة (اختياري)</label>
                <input type="file" accept="image/*,.pdf" onChange={e=>setFuelAttachment(e.target.files?.[0] || null)}
                  style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:12,color:'#111827',background:'#fff',marginBottom:10}}/>
                {fuelAttachment && <span style={{fontSize:11,color:'#15803d'}}>تم اختيار: {fuelAttachment.name}</span>}
              </div>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>saveFuelReceipt(false)} disabled={loading}
                style={{background:'#fff',color:'#16a34a',border:'2px solid #16a34a',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontSize:14,fontWeight:600}}>
                {loading ? 'جارٍ الحفظ...' : 'حفظ'}
              </button>
              <button onClick={()=>saveFuelReceipt(true)} disabled={loading}
                style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontSize:14,fontWeight:600}}>
                {loading ? 'جارٍ الحفظ...' : 'حفظ وطباعة الوصل'}
              </button>
            </div>
          </div>
        )}

        {/* نموذج وصل الصيانة */}
        {!readOnly && showForm && activeType === 'maintenance' && (
          <div style={{padding:'20px',borderBottom:'2px solid #e5e7eb',background:'#dbeafe'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,maxWidth:700}}>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>كود السلفة</label>
                <select value={maintForm.fund_code} onChange={e=>setMaintForm({...maintForm,fund_code:e.target.value})} style={inputStyle}>
                  <option value="">بدون سلفة</option>
                  {funds.map(f => <option key={f.fund_code} value={f.fund_code}>{f.fund_code} — {f.source}</option>)}
                </select>
              </div>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>التاريخ والوقت</label>
                <input type="datetime-local" value={maintForm.receipt_date} onChange={e=>setMaintForm({...maintForm,receipt_date:e.target.value})} style={inputStyle}/></div>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>نوع المركبة *</label>
                <input value={maintForm.vehicle_type} onChange={e=>setMaintForm({...maintForm,vehicle_type:e.target.value})} style={inputStyle}/></div>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>رقم المركبة *</label>
                <input value={maintForm.vehicle_number} onChange={e=>setMaintForm({...maintForm,vehicle_number:e.target.value})} style={inputStyle}/></div>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>عداد المشي *</label>
                <input type="number" value={maintForm.odometer_reading} onChange={e=>setMaintForm({...maintForm,odometer_reading:e.target.value})} style={inputStyle}/></div>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>اسم صاحب المركبة *</label>
                <input value={maintForm.owner_name} onChange={e=>setMaintForm({...maintForm,owner_name:e.target.value})} style={inputStyle}/></div>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>نوع الصيانة *</label>
                <input value={maintForm.maintenance_type} onChange={e=>setMaintForm({...maintForm,maintenance_type:e.target.value})} style={inputStyle}/></div>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>اسم محل الصيانة *</label>
                <input value={maintForm.workshop_name} onChange={e=>setMaintForm({...maintForm,workshop_name:e.target.value})} style={inputStyle}/></div>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>المبلغ (د.ع) *</label>
                <input type="number" value={maintForm.amount} onChange={e=>setMaintForm({...maintForm,amount:e.target.value})} style={inputStyle}/></div>
              <div style={{gridColumn:'span 2'}}>
                <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>مرفق الفاتورة (اختياري)</label>
                <input type="file" accept="image/*,.pdf" onChange={e=>setMaintAttachment(e.target.files?.[0] || null)}
                  style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:12,color:'#111827',background:'#fff',marginBottom:10}}/>
                {maintAttachment && <span style={{fontSize:11,color:'#15803d'}}>تم اختيار: {maintAttachment.name}</span>}
              </div>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>saveMaintenanceReceipt(false)} disabled={loading}
                style={{background:'#fff',color:'#16a34a',border:'2px solid #16a34a',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontSize:14,fontWeight:600}}>
                {loading ? 'جارٍ الحفظ...' : 'حفظ'}
              </button>
              <button onClick={()=>saveMaintenanceReceipt(true)} disabled={loading}
                style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontSize:14,fontWeight:600}}>
                {loading ? 'جارٍ الحفظ...' : 'حفظ وطباعة الوصل'}
              </button>
            </div>
          </div>
        )}

        {/* نموذج وصل تسليم المبلغ */}
        {!readOnly && showForm && activeType === 'delivery' && (
          <div style={{padding:'20px',borderBottom:'2px solid #e5e7eb',background:'#dcfce7'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,maxWidth:700}}>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>كود السلفة</label>
                <select value={deliveryForm.fund_code} onChange={e=>setDeliveryForm({...deliveryForm,fund_code:e.target.value})} style={inputStyle}>
                  <option value="">بدون سلفة</option>
                  {funds.map(f => <option key={f.fund_code} value={f.fund_code}>{f.fund_code} — {f.source}</option>)}
                </select>
              </div>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>التاريخ والوقت</label>
                <input type="datetime-local" value={deliveryForm.receipt_date} onChange={e=>setDeliveryForm({...deliveryForm,receipt_date:e.target.value})} style={inputStyle}/></div>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>اسم المستلم *</label>
                <input value={deliveryForm.receiver_name} onChange={e=>setDeliveryForm({...deliveryForm,receiver_name:e.target.value})} style={inputStyle}/></div>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>رقم الهوية *</label>
                <input value={deliveryForm.id_number} onChange={e=>setDeliveryForm({...deliveryForm,id_number:e.target.value})} style={inputStyle}/></div>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>المبلغ رقماً (د.ع) *</label>
                <input type="number" value={deliveryForm.amount} onChange={e=>setDeliveryForm({...deliveryForm,amount:e.target.value})} style={inputStyle}/></div>
              <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>المبلغ كتابةً (تلقائي)</label>
                <input value={deliveryForm.amount ? numberToArabicWords(parseFloat(deliveryForm.amount)||0) : ''} disabled
                  style={{...inputStyle,background:'#f3f4f6',color:'#6b7280'}}/></div>
              <div style={{gridColumn:'span 2'}}><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>تفاصيل المبلغ</label>
                <input value={deliveryForm.details} onChange={e=>setDeliveryForm({...deliveryForm,details:e.target.value})} placeholder="سبب التسليم..." style={inputStyle}/></div>
              <div style={{gridColumn:'span 2'}}>
                <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>مرفق (اختياري)</label>
                <input type="file" accept="image/*,.pdf" onChange={e=>setDeliveryAttachment(e.target.files?.[0] || null)}
                  style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:12,color:'#111827',background:'#fff',marginBottom:10}}/>
                {deliveryAttachment && <span style={{fontSize:11,color:'#15803d'}}>تم اختيار: {deliveryAttachment.name}</span>}
              </div>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>saveDeliveryReceipt(false)} disabled={loading}
                style={{background:'#fff',color:'#16a34a',border:'2px solid #16a34a',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontSize:14,fontWeight:600}}>
                {loading ? 'جارٍ الحفظ...' : 'حفظ'}
              </button>
              <button onClick={()=>saveDeliveryReceipt(true)} disabled={loading}
                style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontSize:14,fontWeight:600}}>
                {loading ? 'جارٍ الحفظ...' : 'حفظ وطباعة الوصل'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* قائمة الوصولات مع البحث */}
      <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
        <div style={{padding:'14px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <input
            placeholder="بحث برقم الوصل، كود السلفة، الاسم، أو نوع الوصل..."
            value={searchTerm}
            onChange={e=>setSearchTerm(e.target.value)}
            style={{flex:1,minWidth:200,padding:'9px 14px',borderRadius:8,border:'2px solid #d1d5db',fontSize:13,color:'#111827'}}/>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <label style={{fontSize:12,color:'#6b7280',whiteSpace:'nowrap'}}>من:</label>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
              style={{padding:'8px 10px',borderRadius:8,border:'2px solid #d1d5db',fontSize:12,color:'#111827'}}/>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <label style={{fontSize:12,color:'#6b7280',whiteSpace:'nowrap'}}>إلى:</label>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
              style={{padding:'8px 10px',borderRadius:8,border:'2px solid #d1d5db',fontSize:12,color:'#111827'}}/>
          </div>
          {(searchTerm || dateFrom || dateTo) && (
            <button onClick={()=>{setSearchTerm('');setDateFrom('');setDateTo('')}} style={{background:'#f3f4f6',color:'#6b7280',border:'none',borderRadius:8,padding:'9px 14px',cursor:'pointer',fontSize:12}}>مسح</button>
          )}
          <span style={{fontSize:12,color:'#9ca3af',whiteSpace:'nowrap'}}>{filteredSearch.length} وصل</span>
        </div>

        {loading ? (
          <div style={{textAlign:'center',padding:'3rem',color:'#6b7280'}}>جارٍ التحميل...</div>
        ) : filteredSearch.length === 0 ? (
          <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لا توجد وصولات</div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{background:'#f3f4f6'}}>
                  {['رقم الوصل','النوع','كود السلفة','الاسم','المبلغ','التاريخ','مرفق',''].map(h=>(
                    <th key={h} style={{padding:'10px 14px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSearch.map(r => {
                  const typeInfo = receiptTypes.find(t => t.key === r.type)!
                  return (
                    <tr key={r.id} style={{borderBottom:'1px solid #e5e7eb'}}>
                      <td style={{padding:'10px 14px',fontWeight:700,color:'#111827'}}>{r.receipt_number}</td>
                      <td style={{padding:'10px 14px'}}>
                        <span style={{background:typeInfo.bg,color:typeInfo.color,padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600}}>{typeInfo.label}</span>
                      </td>
                      <td style={{padding:'10px 14px',color:'#6b7280'}}>{r.fund_code || '—'}</td>
                      <td style={{padding:'10px 14px',color:'#111827',fontWeight:500}}>{r.displayName}</td>
                      <td style={{padding:'10px 14px',color:'#dc2626',fontWeight:700}}>{formatAmount(r.amount)}</td>
                      <td style={{padding:'10px 14px',color:'#6b7280',fontSize:12}}>{formatDateTime(r.receipt_date)}</td>
                      <td style={{padding:'10px 14px'}}>
                        {r.attachment_url ? (
                          <a href={r.attachment_url} target="_blank" rel="noreferrer" style={{fontSize:12,color:'#1d4ed8',textDecoration:'none',fontWeight:600}}>عرض</a>
                        ) : (
                          <span style={{fontSize:12,color:'#d1d5db'}}>—</span>
                        )}
                      </td>
                      <td style={{padding:'10px 14px'}}>
                        <div style={{display:'flex',gap:6}}>
                          <button onClick={()=>printReceipt(r)}
                            style={{background:'#f3f4f6',color:'#374151',border:'1px solid #d1d5db',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:11,fontWeight:600}}>
                            طباعة
                          </button>
                          {!readOnly && (
                            <button onClick={()=>deleteReceipt(r.type, r.id)}
                              style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:11,fontWeight:600}}>
                              حذف
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
