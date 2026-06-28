'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

interface Fund {
  id: string
  fund_code: string
  المصدر: string
  'تاريخ الاستلام': string
  'المبلغ المستلم': number
  'إجمالي المصروف': number
  المتبقي: number
  ملاحظات: string
}

interface Expense {
  id: string
  fund_id: string | null
  description: string
  amount: number
  expense_type: string
  expense_date: string
  notes: string
}

// عنصر موحّد يجمع المصاريف العادية + كل أنواع الوصولات لعرضها معاً في قائمة واحدة
interface UnifiedItem {
  id: string
  source: 'expense' | 'fuel' | 'maintenance' | 'delivery'
  sourceLabel: string
  description: string
  amount: number
  date: string
  notes: string
  receiptNumber?: string
}

interface FundForm {
  fund_code: string
  source: string
  amount: string
  received_date: string
  notes: string
}

interface ExpenseForm {
  description: string
  amount: string
  expense_type: string
  expense_date: string
  notes: string
}

const LOW_FUND_THRESHOLD_RATIO = 0.10 // 10%

export default function Finance({ readOnly = false }: { readOnly?: boolean }) {
  const [funds, setFunds] = useState<Fund[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [unifiedItems, setUnifiedItems] = useState<UnifiedItem[]>([])
  const [selectedFund, setSelectedFund] = useState<Fund | null>(null)
  const [view, setView] = useState<'funds' | 'expenses' | 'summary'>('funds')
  const [fundsFilter, setFundsFilter] = useState<'active' | 'closed'>('active')
  const [showFundForm, setShowFundForm] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [todayStr, setTodayStr] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const printRef = useRef<HTMLDivElement>(null)
  const summaryPrintRef = useRef<HTMLDivElement>(null)

  const [fundForm, setFundForm] = useState<FundForm>({ fund_code: '', source: '', amount: '', received_date: '', notes: '' })
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>({ description: '', amount: '', expense_type: '', expense_date: '', notes: '' })

  useEffect(() => {
    const t = new Date().toISOString().split('T')[0]
    setTodayStr(t)
    setFundForm(f => ({ ...f, received_date: t }))
    setExpenseForm(f => ({ ...f, expense_date: t }))
    loadFunds()
  }, [])

  async function loadFunds() {
    setLoading(true)
    const { data } = await supabase.from('funds_summary').select('*')
    setFunds((data as Fund[]) || [])
    setLoading(false)
  }

  // يجمع المصاريف العادية مع كل أنواع الوصولات المرتبطة بنفس كود السلفة
  async function loadUnifiedItems(fund: Fund) {
    setLoading(true)
    const [expRes, fuelRes, maintRes, deliveryRes] = await Promise.all([
      supabase.from('expenses').select('*').eq('fund_id', fund.id),
      fund.fund_code ? supabase.from('fuel_receipts').select('*').eq('fund_code', fund.fund_code) : Promise.resolve({ data: [] as any[] }),
      fund.fund_code ? supabase.from('maintenance_receipts').select('*').eq('fund_code', fund.fund_code) : Promise.resolve({ data: [] as any[] }),
      fund.fund_code ? supabase.from('delivery_receipts').select('*').eq('fund_code', fund.fund_code) : Promise.resolve({ data: [] as any[] }),
    ])

    const expenseItems: UnifiedItem[] = ((expRes.data as Expense[]) || []).map(e => ({
      id: e.id, source: 'expense', sourceLabel: e.expense_type, description: e.description,
      amount: e.amount, date: e.expense_date, notes: e.notes || ''
    }))
    const fuelItems: UnifiedItem[] = ((fuelRes.data as any[]) || []).map(r => ({
      id: r.id, source: 'fuel', sourceLabel: 'وصل كاز', description: `كاز — ${r.driver_name} (${r.vehicle_number})`,
      amount: r.amount, date: r.receipt_date, notes: '', receiptNumber: r.receipt_number
    }))
    const maintItems: UnifiedItem[] = ((maintRes.data as any[]) || []).map(r => ({
      id: r.id, source: 'maintenance', sourceLabel: 'وصل صيانة', description: `صيانة — ${r.owner_name} (${r.vehicle_number})`,
      amount: r.amount, date: r.receipt_date, notes: '', receiptNumber: r.receipt_number
    }))
    const deliveryItems: UnifiedItem[] = ((deliveryRes.data as any[]) || []).map(r => ({
      id: r.id, source: 'delivery', sourceLabel: 'وصل تسليم', description: `تسليم مبلغ — ${r.receiver_name}`,
      amount: r.amount, date: r.receipt_date, notes: r.details || '', receiptNumber: r.receipt_number
    }))

    const all = [...expenseItems, ...fuelItems, ...maintItems, ...deliveryItems]
      .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    setUnifiedItems(all)
    setExpenses((expRes.data as Expense[]) || [])
    setLoading(false)
  }

  async function refreshFundData(fundId: string) {
    const { data } = await supabase.from('funds_summary').select('*')
    const updatedFunds = (data as Fund[]) || []
    setFunds(updatedFunds)
    const updated = updatedFunds.find(f => f.id === fundId)
    if (updated) {
      setSelectedFund(updated)
      loadUnifiedItems(updated)
    }
  }

  async function saveFund() {
    if (!fundForm.source || !fundForm.amount || !fundForm.fund_code) { alert('يرجى تعبئة كود السلفة والمصدر والمبلغ'); return }
    setLoading(true)
    const { error } = await supabase.from('funds').insert([{
      fund_code: fundForm.fund_code,
      source: fundForm.source,
      amount: parseFloat(fundForm.amount),
      received_date: fundForm.received_date,
      notes: fundForm.notes
    }])
    if (error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        alert('كود السلفة هذا مستخدم من قبل، اختر كوداً آخر')
      } else {
        alert('خطأ: ' + error.message)
      }
    } else {
      setFundForm({ fund_code: '', source: '', amount: '', received_date: todayStr, notes: '' })
      setShowFundForm(false)
      loadFunds()
    }
    setLoading(false)
  }

  async function saveExpense() {
    if (!expenseForm.description || !expenseForm.amount || !expenseForm.expense_type) { alert('يرجى تعبئة جميع الحقول المطلوبة'); return }
    if (!selectedFund) return
    setLoading(true)
    const { error } = await supabase.from('expenses').insert([{
      fund_id: selectedFund.id,
      description: expenseForm.description,
      amount: parseFloat(expenseForm.amount),
      expense_type: expenseForm.expense_type,
      expense_date: expenseForm.expense_date,
      notes: expenseForm.notes
    }])
    if (error) alert('خطأ: ' + error.message)
    else {
      setExpenseForm({ description: '', amount: '', expense_type: '', expense_date: todayStr, notes: '' })
      setShowExpenseForm(false)
      await refreshFundData(selectedFund.id)
    }
    setLoading(false)
  }

  async function deleteFund(id: string) {
    if (!confirm('هل أنت متأكد؟ سيتم حذف جميع المصاريف المرتبطة!')) return
    await supabase.from('funds').delete().eq('id', id)
    loadFunds()
  }

  async function deleteUnifiedItem(item: UnifiedItem) {
    if (!confirm('هل أنت متأكد من حذف هذا العنصر؟')) return
    if (!selectedFund) return
    const tableMap: Record<string,string> = {
      expense: 'expenses', fuel: 'fuel_receipts', maintenance: 'maintenance_receipts', delivery: 'delivery_receipts'
    }
    await supabase.from(tableMap[item.source]).delete().eq('id', item.id)
    await refreshFundData(selectedFund.id)
  }

  function openFundExpenses(fund: Fund) {
    setSelectedFund(fund)
    loadUnifiedItems(fund)
    setView('expenses')
  }

  function formatAmount(n: number) { return Number(n).toLocaleString('ar-IQ') + ' د.ع' }
  function formatDate(d: string) { return d ? new Date(d).toLocaleDateString('ar-IQ') : '—' }

  const sourceColors: Record<string, { bg: string; color: string }> = {
    expense: { bg: '#f3f4f6', color: '#374151' },
    fuel: { bg: '#fef9c3', color: '#b45309' },
    maintenance: { bg: '#dbeafe', color: '#1d4ed8' },
    delivery: { bg: '#dcfce7', color: '#15803d' },
  }

  const filteredUnifiedItems = useMemo(() => {
    let items = unifiedItems
    if (dateFrom) items = items.filter(i => new Date(i.date) >= new Date(dateFrom))
    if (dateTo) { const to = new Date(dateTo); to.setHours(23,59,59,999); items = items.filter(i => new Date(i.date) <= to) }
    return items
  }, [unifiedItems, dateFrom, dateTo])

  // فصل السلف النشطة عن المغلقة (المتبقي صفر أو أقل)
  const activeFunds = useMemo(() => funds.filter(f => f['المتبقي'] > 0), [funds])
  const closedFunds = useMemo(() => funds.filter(f => f['المتبقي'] <= 0), [funds])
  const displayedFunds = fundsFilter === 'active' ? activeFunds : closedFunds

  // السلف منخفضة الرصيد (المتبقي <= 10% من المبلغ المستلم وأكبر من صفر)
  const lowFunds = useMemo(() => {
    return activeFunds.filter(f => f['المتبقي'] > 0 && f['المتبقي'] <= f['المبلغ المستلم'] * LOW_FUND_THRESHOLD_RATIO)
  }, [activeFunds])

  // إجمالي شامل لكل الشركة
  const grandTotals = useMemo(() => {
    const totalReceived = funds.reduce((s,f) => s + f['المبلغ المستلم'], 0)
    const totalSpent = funds.reduce((s,f) => s + f['إجمالي المصروف'], 0)
    const totalRemaining = funds.reduce((s,f) => s + f['المتبقي'], 0)
    return { totalReceived, totalSpent, totalRemaining }
  }, [funds])

  function handleExportFundsExcel() {
    const rows = displayedFunds.map(f => ({
      'كود السلفة': f.fund_code, 'المصدر': f['المصدر'], 'تاريخ الاستلام': f['تاريخ الاستلام'],
      'المبلغ المستلم': f['المبلغ المستلم'], 'إجمالي المصروف': f['إجمالي المصروف'], 'المتبقي': f['المتبقي'], 'ملاحظات': f['ملاحظات'] || '',
    }))
    const worksheet = XLSX.utils.json_to_sheet(rows)
    worksheet['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 22 }]
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'المبالغ المستلمة')
    XLSX.writeFile(workbook, 'المبالغ المستلمة.xlsx')
  }

  function handleExportExpensesExcel() {
    const rows = filteredUnifiedItems.map(i => ({
      'البيان': i.description, 'المصدر': i.sourceLabel, 'رقم الوصل': i.receiptNumber || '—',
      'المبلغ': i.amount, 'التاريخ': formatDate(i.date), 'ملاحظات': i.notes || '',
    }))
    const worksheet = XLSX.utils.json_to_sheet(rows)
    worksheet['!cols'] = [{ wch: 26 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 24 }]
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'المصاريف')
    XLSX.writeFile(workbook, `مصاريف - ${selectedFund?.['المصدر'] || ''}.xlsx`)
  }

  function handlePrint() {
    const printContent = printRef.current
    if (!printContent) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>تقرير المصاريف - ${selectedFund?.['المصدر'] || ''}</title>
        <style>
          @page { margin: 12mm; size: A4; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Arial', sans-serif; direction: rtl; color: #111; padding: 0; }
          .header { text-align: center; border-bottom: 3px solid #1e40af; padding-bottom: 16px; margin-bottom: 24px; }
          .company-name { font-size: 22px; font-weight: bold; color: #1e40af; margin-bottom: 4px; }
          .report-title { font-size: 16px; color: #374151; margin-bottom: 4px; }
          .report-date { font-size: 13px; color: #6b7280; }
          .fund-info { background: #f9fafb; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; }
          .fund-info span { margin-left: 24px; color: #374151; }
          .fund-info strong { color: #111827; }
          .summary-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
          .card { border-radius: 8px; padding: 12px 16px; }
          .card-blue { background: #dbeafe; } .card-red { background: #fee2e2; } .card-green { background: #dcfce7; } .card-amber { background: #fef9c3; }
          .card-label { font-size: 12px; font-weight: 600; margin-bottom: 4px; }
          .card-blue .card-label { color: #1d4ed8; } .card-red .card-label { color: #dc2626; } .card-green .card-label { color: #15803d; } .card-amber .card-label { color: #b45309; }
          .card-value { font-size: 18px; font-weight: bold; }
          .card-blue .card-value { color: #1e40af; } .card-red .card-value { color: #dc2626; } .card-green .card-value { color: #15803d; } .card-amber .card-value { color: #b45309; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th { background: #1e40af; color: #fff; padding: 10px 12px; text-align: right; font-weight: 600; }
          td { padding: 9px 12px; border-bottom: 1px solid #e5e7eb; }
          tr:nth-child(even) { background: #f9fafb; }
          .type-badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; background: #f3f4f6; color: #374151; }
          .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 11px; color: #9ca3af; }
        </style>
      </head>
      <body>${printContent.innerHTML}</body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => { printWindow.print(); printWindow.close() }, 500)
  }

  function handlePrintSummary() {
    const printContent = summaryPrintRef.current
    if (!printContent) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>التقرير الإجمالي الشامل</title>
        <style>
          @page { margin: 12mm; size: A4; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Arial', sans-serif; direction: rtl; color: #111; padding: 0; }
          .header { text-align: center; border-bottom: 3px solid #1e40af; padding-bottom: 16px; margin-bottom: 24px; }
          .company-name { font-size: 22px; font-weight: bold; color: #1e40af; margin-bottom: 4px; }
          .report-title { font-size: 16px; color: #374151; margin-bottom: 4px; }
          .report-date { font-size: 13px; color: #6b7280; }
          .summary-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
          .card { border-radius: 8px; padding: 14px 18px; }
          .card-blue { background: #dbeafe; } .card-red { background: #fee2e2; } .card-green { background: #dcfce7; }
          .card-label { font-size: 12px; font-weight: 600; margin-bottom: 4px; }
          .card-blue .card-label { color: #1d4ed8; } .card-red .card-label { color: #dc2626; } .card-green .card-label { color: #15803d; }
          .card-value { font-size: 20px; font-weight: bold; }
          .card-blue .card-value { color: #1e40af; } .card-red .card-value { color: #dc2626; } .card-green .card-value { color: #15803d; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th { background: #1e40af; color: #fff; padding: 10px 12px; text-align: right; font-weight: 600; }
          td { padding: 9px 12px; border-bottom: 1px solid #e5e7eb; }
          tr:nth-child(even) { background: #f9fafb; }
          .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 11px; color: #9ca3af; }
        </style>
      </head>
      <body>${printContent.innerHTML}</body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => { printWindow.print(); printWindow.close() }, 500)
  }

  const inputBase = { width:'100%', padding:'10px 14px', borderRadius:8, border:'2px solid #d1d5db', fontSize:14, boxSizing:'border-box' as const, color:'#111827', background:'#fff' }

  return (
    <div style={{margin:'24px',background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>

      {/* تنبيه السلف المنخفضة */}
      {lowFunds.length > 0 && view === 'funds' && (
        <div style={{padding:'14px 20px',background:'#fef9c3',borderBottom:'2px solid #fcd34d'}}>
          <div style={{fontSize:13,fontWeight:700,color:'#b45309',marginBottom:6}}>تنبيه: {lowFunds.length} سلفة منخفضة الرصيد (أقل من 10% من المبلغ المستلم)</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {lowFunds.map(f => (
              <button key={f.id} onClick={()=>openFundExpenses(f)}
                style={{background:'#fff',border:'1px solid #fcd34d',borderRadius:8,padding:'5px 12px',cursor:'pointer',fontSize:12,fontWeight:600,color:'#b45309'}}>
                {f.fund_code} — متبقي {formatAmount(f['المتبقي'])}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* رأس البطاقة */}
      <div style={{padding:'16px 20px',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,background:'#f9fafb'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          {view === 'expenses' && (
            <button onClick={()=>{ setView('funds'); setSelectedFund(null) }}
              style={{background:'#e5e7eb',color:'#374151',border:'none',borderRadius:8,padding:'7px 14px',cursor:'pointer',fontSize:13,fontWeight:600}}>
              ← رجوع
            </button>
          )}
          <h2 style={{margin:0,fontSize:17,fontWeight:700,color:'#111827'}}>
            {view === 'funds' ? 'المبالغ المستلمة' : view === 'summary' ? 'التقرير الإجمالي الشامل' : `مصاريف: ${selectedFund?.['المصدر']}`}
          </h2>
          {readOnly && <span style={{fontSize:12,background:'#fef9c3',color:'#b45309',padding:'3px 10px',borderRadius:20,fontWeight:600}}>قراءة فقط</span>}
        </div>

        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {view === 'funds' && (
            <>
              <div style={{display:'flex',gap:4,background:'#e5e7eb',padding:3,borderRadius:8}}>
                <button onClick={()=>setFundsFilter('active')}
                  style={{padding:'6px 12px',fontSize:12,border:'none',borderRadius:6,cursor:'pointer',fontWeight:600,
                    background:fundsFilter==='active'?'#fff':'transparent',color:fundsFilter==='active'?'#1e40af':'#6b7280'}}>
                  نشطة ({activeFunds.length})
                </button>
                <button onClick={()=>setFundsFilter('closed')}
                  style={{padding:'6px 12px',fontSize:12,border:'none',borderRadius:6,cursor:'pointer',fontWeight:600,
                    background:fundsFilter==='closed'?'#fff':'transparent',color:fundsFilter==='closed'?'#1e40af':'#6b7280'}}>
                  مغلقة ({closedFunds.length})
                </button>
              </div>
              <button onClick={()=>setView('summary')}
                style={{background:'#ede9fe',color:'#7c3aed',border:'1px solid #c4b5fd',borderRadius:8,padding:'9px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                التقرير الشامل
              </button>
              {displayedFunds.length > 0 && (
                <button onClick={handleExportFundsExcel}
                  style={{background:'#dcfce7',color:'#15803d',border:'1px solid #86efac',borderRadius:8,padding:'9px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                  تصدير Excel
                </button>
              )}
              {!readOnly && (
                <button onClick={()=>setShowFundForm(!showFundForm)}
                  style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:14,fontWeight:600}}>
                  {showFundForm ? 'إلغاء' : '+ إضافة مبلغ مستلم'}
                </button>
              )}
            </>
          )}
          {view === 'expenses' && (
            <>
              {filteredUnifiedItems.length > 0 && (
                <>
                  <button onClick={handleExportExpensesExcel}
                    style={{background:'#dcfce7',color:'#15803d',border:'1px solid #86efac',borderRadius:8,padding:'9px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                    تصدير Excel
                  </button>
                  <button onClick={handlePrint}
                    style={{background:'#f3f4f6',color:'#374151',border:'1px solid #d1d5db',borderRadius:8,padding:'9px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                    طباعة التقرير
                  </button>
                </>
              )}
              {!readOnly && (
                <button onClick={()=>setShowExpenseForm(!showExpenseForm)}
                  style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:14,fontWeight:600}}>
                  {showExpenseForm ? 'إلغاء' : '+ إضافة مصروف'}
                </button>
              )}
            </>
          )}
          {view === 'summary' && (
            <button onClick={handlePrintSummary}
              style={{background:'#f3f4f6',color:'#374151',border:'1px solid #d1d5db',borderRadius:8,padding:'9px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
              طباعة التقرير الشامل
            </button>
          )}
        </div>
      </div>

      {/* نموذج إضافة مبلغ */}
      {!readOnly && view === 'funds' && showFundForm && (
        <div style={{padding:'20px',borderBottom:'2px solid #e5e7eb',background:'#f9fafb'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,maxWidth:600}}>
            <div>
              <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>كود السلفة *</label>
              <input value={fundForm.fund_code} onChange={e=>setFundForm({...fundForm,fund_code:e.target.value})} placeholder="مثال: S-001"
                style={{...inputBase,direction:'ltr',textAlign:'right'}}/>
            </div>
            <div>
              <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>مصدر المبلغ *</label>
              <input value={fundForm.source} onChange={e=>setFundForm({...fundForm,source:e.target.value})} placeholder="مثال: الإدارة العامة" style={inputBase}/>
            </div>
            <div>
              <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>المبلغ (د.ع) *</label>
              <input type="number" value={fundForm.amount} onChange={e=>setFundForm({...fundForm,amount:e.target.value})} placeholder="0" style={inputBase}/>
            </div>
            <div>
              <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>تاريخ الاستلام</label>
              <input type="date" value={fundForm.received_date} onChange={e=>setFundForm({...fundForm,received_date:e.target.value})} style={inputBase}/>
            </div>
            <div>
              <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>ملاحظات</label>
              <input value={fundForm.notes} onChange={e=>setFundForm({...fundForm,notes:e.target.value})} placeholder="اختياري" style={inputBase}/>
            </div>
          </div>
          <button onClick={saveFund} disabled={loading}
            style={{marginTop:16,background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontSize:14,fontWeight:600}}>
            {loading ? 'جارٍ الحفظ...' : 'حفظ المبلغ'}
          </button>
        </div>
      )}

      {/* نموذج إضافة مصروف */}
      {!readOnly && view === 'expenses' && showExpenseForm && (
        <div style={{padding:'20px',borderBottom:'2px solid #e5e7eb',background:'#f9fafb'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,maxWidth:600}}>
            <div>
              <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>البيان *</label>
              <input value={expenseForm.description} onChange={e=>setExpenseForm({...expenseForm,description:e.target.value})} style={inputBase}/>
            </div>
            <div>
              <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>النوع *</label>
              <select value={expenseForm.expense_type} onChange={e=>setExpenseForm({...expenseForm,expense_type:e.target.value})} style={inputBase}>
                <option value="">اختر النوع...</option>
                {['مصروف تشغيلي','رواتب','مشتريات','صيانة','أخرى'].map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>المبلغ (د.ع) *</label>
              <input type="number" value={expenseForm.amount} onChange={e=>setExpenseForm({...expenseForm,amount:e.target.value})} style={inputBase}/>
            </div>
            <div>
              <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>التاريخ</label>
              <input type="date" value={expenseForm.expense_date} onChange={e=>setExpenseForm({...expenseForm,expense_date:e.target.value})} style={inputBase}/>
            </div>
            <div style={{gridColumn:'span 2'}}>
              <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>ملاحظات</label>
              <input value={expenseForm.notes} onChange={e=>setExpenseForm({...expenseForm,notes:e.target.value})} style={inputBase}/>
            </div>
          </div>
          <button onClick={saveExpense} disabled={loading}
            style={{marginTop:16,background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontSize:14,fontWeight:600}}>
            {loading ? 'جارٍ الحفظ...' : 'حفظ المصروف'}
          </button>
        </div>
      )}

      {/* بطاقات الملخص + فلتر التاريخ */}
      {view === 'expenses' && selectedFund && (
        <div style={{padding:'16px 20px',borderBottom:'2px solid #e5e7eb',background:'#f9fafb'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:14}}>
            <div style={{background:'#dbeafe',borderRadius:10,padding:'14px 16px'}}>
              <div style={{fontSize:12,color:'#1d4ed8',fontWeight:600,marginBottom:4}}>المبلغ المستلم</div>
              <div style={{fontSize:20,fontWeight:700,color:'#1e40af'}}>{formatAmount(selectedFund['المبلغ المستلم'])}</div>
            </div>
            <div style={{background:'#fee2e2',borderRadius:10,padding:'14px 16px'}}>
              <div style={{fontSize:12,color:'#dc2626',fontWeight:600,marginBottom:4}}>إجمالي المصروف (مصاريف + وصولات)</div>
              <div style={{fontSize:20,fontWeight:700,color:'#dc2626'}}>{formatAmount(selectedFund['إجمالي المصروف'])}</div>
            </div>
            <div style={{background: selectedFund['المتبقي'] >= 0 ? '#dcfce7' : '#fef9c3',borderRadius:10,padding:'14px 16px'}}>
              <div style={{fontSize:12,color: selectedFund['المتبقي'] >= 0 ? '#15803d' : '#b45309',fontWeight:600,marginBottom:4}}>المتبقي</div>
              <div style={{fontSize:20,fontWeight:700,color: selectedFund['المتبقي'] >= 0 ? '#15803d' : '#b45309'}}>{formatAmount(selectedFund['المتبقي'])}</div>
            </div>
          </div>
          <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <label style={{fontSize:12,color:'#6b7280'}}>من:</label>
              <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{padding:'7px 10px',borderRadius:8,border:'2px solid #d1d5db',fontSize:12,color:'#111827'}}/>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <label style={{fontSize:12,color:'#6b7280'}}>إلى:</label>
              <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{padding:'7px 10px',borderRadius:8,border:'2px solid #d1d5db',fontSize:12,color:'#111827'}}/>
            </div>
            {(dateFrom || dateTo) && (
              <button onClick={()=>{setDateFrom('');setDateTo('')}} style={{background:'#f3f4f6',color:'#6b7280',border:'none',borderRadius:8,padding:'7px 12px',cursor:'pointer',fontSize:12}}>مسح</button>
            )}
            <span style={{fontSize:12,color:'#9ca3af'}}>{filteredUnifiedItems.length} عنصر (مصاريف + وصولات)</span>
          </div>
        </div>
      )}

      {/* محتوى الطباعة المخفي - تقرير سلفة واحدة */}
      <div ref={printRef} style={{display:'none'}}>
        {selectedFund && (
          <>
            <div className="header">
              <div className="company-name">Sanya International Company</div>
              <div className="report-title">تقرير المصاريف — {selectedFund['المصدر']}</div>
              <div className="report-date">تاريخ الطباعة: {new Date().toLocaleDateString('ar-IQ')}</div>
            </div>
            <div className="fund-info">
              <span>كود السلفة: <strong>{selectedFund.fund_code}</strong></span>
              <span>المصدر: <strong>{selectedFund['المصدر']}</strong></span>
              <span>تاريخ الاستلام: <strong>{formatDate(selectedFund['تاريخ الاستلام'])}</strong></span>
            </div>
            <div className="summary-cards">
              <div className="card card-blue"><div className="card-label">المبلغ المستلم</div><div className="card-value">{formatAmount(selectedFund['المبلغ المستلم'])}</div></div>
              <div className="card card-red"><div className="card-label">إجمالي المصروف</div><div className="card-value">{formatAmount(selectedFund['إجمالي المصروف'])}</div></div>
              <div className={selectedFund['المتبقي'] >= 0 ? 'card card-green' : 'card card-amber'}><div className="card-label">المتبقي</div><div className="card-value">{formatAmount(selectedFund['المتبقي'])}</div></div>
            </div>
            <table>
              <thead><tr><th>#</th><th>البيان</th><th>المصدر</th><th>رقم الوصل</th><th>المبلغ</th><th>التاريخ</th><th>ملاحظات</th></tr></thead>
              <tbody>
                {filteredUnifiedItems.map((item, idx) => (
                  <tr key={item.id}>
                    <td>{idx + 1}</td>
                    <td>{item.description}</td>
                    <td><span className="type-badge">{item.sourceLabel}</span></td>
                    <td>{item.receiptNumber || '—'}</td>
                    <td style={{fontWeight:'bold',color:'#dc2626'}}>{formatAmount(item.amount)}</td>
                    <td>{formatDate(item.date)}</td>
                    <td>{item.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="footer">تم إنشاء هذا التقرير بواسطة منصة Sanya International Company — {new Date().toLocaleDateString('ar-IQ')}</div>
          </>
        )}
      </div>

      {/* محتوى الطباعة المخفي - التقرير الإجمالي الشامل */}
      <div ref={summaryPrintRef} style={{display:'none'}}>
        <div className="header">
          <div className="company-name">Sanya International Company</div>
          <div className="report-title">التقرير الإجمالي الشامل لكل السلف</div>
          <div className="report-date">تاريخ الطباعة: {new Date().toLocaleDateString('ar-IQ')}</div>
        </div>
        <div className="summary-cards">
          <div className="card card-blue"><div className="card-label">إجمالي المبالغ المستلمة</div><div className="card-value">{formatAmount(grandTotals.totalReceived)}</div></div>
          <div className="card card-red"><div className="card-label">إجمالي المصروف</div><div className="card-value">{formatAmount(grandTotals.totalSpent)}</div></div>
          <div className="card card-green"><div className="card-label">الصافي المتبقي</div><div className="card-value">{formatAmount(grandTotals.totalRemaining)}</div></div>
        </div>
        <table>
          <thead><tr><th>كود السلفة</th><th>المصدر</th><th>المبلغ المستلم</th><th>المصروف</th><th>المتبقي</th><th>الحالة</th></tr></thead>
          <tbody>
            {funds.map((f,idx)=>(
              <tr key={idx}>
                <td>{f.fund_code}</td><td>{f['المصدر']}</td><td>{formatAmount(f['المبلغ المستلم'])}</td>
                <td>{formatAmount(f['إجمالي المصروف'])}</td><td>{formatAmount(f['المتبقي'])}</td>
                <td>{f['المتبقي'] <= 0 ? 'مغلقة' : f['المتبقي'] <= f['المبلغ المستلم']*LOW_FUND_THRESHOLD_RATIO ? 'منخفضة' : 'نشطة'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="footer">تم إنشاء هذا التقرير بواسطة منصة Sanya International Company — {new Date().toLocaleDateString('ar-IQ')}</div>
      </div>

      {/* الجداول */}
      {loading ? (
        <div style={{textAlign:'center',padding:'3rem',color:'#6b7280',fontSize:14}}>جارٍ تحميل البيانات...</div>
      ) : view === 'summary' ? (
        <div>
          <div style={{padding:'20px',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14}}>
            <div style={{background:'#dbeafe',borderRadius:12,padding:'18px 20px'}}>
              <div style={{fontSize:13,color:'#1d4ed8',fontWeight:600,marginBottom:6}}>إجمالي المبالغ المستلمة</div>
              <div style={{fontSize:26,fontWeight:700,color:'#1e40af'}}>{formatAmount(grandTotals.totalReceived)}</div>
            </div>
            <div style={{background:'#fee2e2',borderRadius:12,padding:'18px 20px'}}>
              <div style={{fontSize:13,color:'#dc2626',fontWeight:600,marginBottom:6}}>إجمالي المصروف</div>
              <div style={{fontSize:26,fontWeight:700,color:'#dc2626'}}>{formatAmount(grandTotals.totalSpent)}</div>
            </div>
            <div style={{background:'#dcfce7',borderRadius:12,padding:'18px 20px'}}>
              <div style={{fontSize:13,color:'#15803d',fontWeight:600,marginBottom:6}}>الصافي المتبقي</div>
              <div style={{fontSize:26,fontWeight:700,color:'#15803d'}}>{formatAmount(grandTotals.totalRemaining)}</div>
            </div>
          </div>
          <div style={{overflowX:'auto',padding:'0 20px 20px'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}>
              <thead>
                <tr style={{background:'#f3f4f6'}}>
                  {['كود السلفة','المصدر','المبلغ المستلم','المصروف','المتبقي','الحالة'].map(h=>(
                    <th key={h} style={{padding:'12px 16px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {funds.map((f,idx)=>{
                  const isClosed = f['المتبقي'] <= 0
                  const isLow = !isClosed && f['المتبقي'] <= f['المبلغ المستلم']*LOW_FUND_THRESHOLD_RATIO
                  return (
                    <tr key={idx} style={{borderBottom:'1px solid #e5e7eb'}}>
                      <td style={{padding:'12px 16px',fontWeight:700,color:'#7c3aed',direction:'ltr',textAlign:'right'}}>{f.fund_code}</td>
                      <td style={{padding:'12px 16px',fontWeight:600,color:'#111827'}}>{f['المصدر']}</td>
                      <td style={{padding:'12px 16px',color:'#1d4ed8',fontWeight:700}}>{formatAmount(f['المبلغ المستلم'])}</td>
                      <td style={{padding:'12px 16px',color:'#dc2626'}}>{formatAmount(f['إجمالي المصروف'])}</td>
                      <td style={{padding:'12px 16px',fontWeight:700}}>{formatAmount(f['المتبقي'])}</td>
                      <td style={{padding:'12px 16px'}}>
                        <span style={{background:isClosed?'#f3f4f6':isLow?'#fef9c3':'#dcfce7',color:isClosed?'#6b7280':isLow?'#b45309':'#15803d',padding:'3px 10px',borderRadius:20,fontSize:12,fontWeight:600}}>
                          {isClosed?'مغلقة':isLow?'منخفضة':'نشطة'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : view === 'funds' ? (
        displayedFunds.length === 0 ? (
          <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لا توجد سلف {fundsFilter==='active'?'نشطة':'مغلقة'}</div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}>
              <thead>
                <tr style={{background:'#f3f4f6'}}>
                  {['كود السلفة','المصدر','تاريخ الاستلام','المبلغ المستلم','إجمالي المصروف','المتبقي','ملاحظات',''].map(h=>(
                    <th key={h} style={{padding:'12px 16px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedFunds.map((fund,idx)=>(
                  <tr key={idx} style={{borderBottom:'1px solid #e5e7eb'}}>
                    <td style={{padding:'12px 16px',fontWeight:700,color:'#7c3aed',direction:'ltr',textAlign:'right'}}>{fund.fund_code}</td>
                    <td style={{padding:'12px 16px',fontWeight:600,color:'#111827'}}>{fund['المصدر']}</td>
                    <td style={{padding:'12px 16px',color:'#6b7280'}}>{fund['تاريخ الاستلام']}</td>
                    <td style={{padding:'12px 16px',color:'#1d4ed8',fontWeight:700}}>{formatAmount(fund['المبلغ المستلم'])}</td>
                    <td style={{padding:'12px 16px',color:'#dc2626',fontWeight:600}}>{formatAmount(fund['إجمالي المصروف'])}</td>
                    <td style={{padding:'12px 16px'}}>
                      <span style={{background: fund['المتبقي'] >= 0 ? '#dcfce7' : '#fee2e2',color: fund['المتبقي'] >= 0 ? '#15803d' : '#dc2626',padding:'4px 12px',borderRadius:20,fontSize:13,fontWeight:700}}>
                        {formatAmount(fund['المتبقي'])}
                      </span>
                    </td>
                    <td style={{padding:'12px 16px',color:'#6b7280',fontSize:13}}>{fund['ملاحظات'] || '—'}</td>
                    <td style={{padding:'12px 16px'}}>
                      <div style={{display:'flex',gap:8}}>
                        <button onClick={()=>openFundExpenses(fund)}
                          style={{background:'#dbeafe',color:'#1d4ed8',border:'none',borderRadius:6,padding:'5px 12px',cursor:'pointer',fontSize:12,fontWeight:600}}>
                          المصاريف
                        </button>
                        {!readOnly && (
                          <button onClick={()=>deleteFund(fund.id)}
                            style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:6,padding:'5px 12px',cursor:'pointer',fontSize:12,fontWeight:600}}>
                            حذف
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        filteredUnifiedItems.length === 0 ? (
          <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لا توجد مصاريف أو وصولات لهذه السلفة</div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}>
              <thead>
                <tr style={{background:'#f3f4f6'}}>
                  {['البيان','المصدر','رقم الوصل','المبلغ','التاريخ','ملاحظات',''].map(h=>(
                    <th key={h} style={{padding:'12px 16px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredUnifiedItems.map(item=>(
                  <tr key={item.id} style={{borderBottom:'1px solid #e5e7eb'}}>
                    <td style={{padding:'12px 16px',fontWeight:600,color:'#111827'}}>{item.description}</td>
                    <td style={{padding:'12px 16px'}}>
                      <span style={{background:sourceColors[item.source].bg,color:sourceColors[item.source].color,padding:'4px 10px',borderRadius:20,fontSize:12,fontWeight:600}}>{item.sourceLabel}</span>
                    </td>
                    <td style={{padding:'12px 16px',color:'#6b7280',fontSize:12}}>{item.receiptNumber || '—'}</td>
                    <td style={{padding:'12px 16px',color:'#dc2626',fontWeight:700}}>{formatAmount(item.amount)}</td>
                    <td style={{padding:'12px 16px',color:'#6b7280'}}>{formatDate(item.date)}</td>
                    <td style={{padding:'12px 16px',color:'#6b7280',fontSize:13}}>{item.notes || '—'}</td>
                    <td style={{padding:'12px 16px'}}>
                      {!readOnly && (
                        <button onClick={()=>deleteUnifiedItem(item)}
                          style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:6,padding:'5px 12px',cursor:'pointer',fontSize:12,fontWeight:600}}>
                          حذف
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
