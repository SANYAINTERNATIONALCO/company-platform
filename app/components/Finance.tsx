'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

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
  description: string
  amount: number
  expense_type: string
  expense_date: string
  notes: string
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

export default function Finance({ readOnly = false }: { readOnly?: boolean }) {
  const [funds, setFunds] = useState<Fund[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [selectedFund, setSelectedFund] = useState<Fund | null>(null)
  const [view, setView] = useState<'funds' | 'expenses'>('funds')
  const [showFundForm, setShowFundForm] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [todayStr, setTodayStr] = useState('')
  const printRef = useRef<HTMLDivElement>(null)

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

  async function loadExpenses(fundId: string) {
    setLoading(true)
    const { data } = await supabase.from('expenses').select('*').eq('fund_id', fundId).order('expense_date', { ascending: false })
    setExpenses((data as Expense[]) || [])
    setLoading(false)
  }

  async function refreshFundData(fundId: string) {
    // تحديث بيانات المبلغ المحدد
    const { data } = await supabase.from('funds_summary').select('*')
    const updatedFunds = (data as Fund[]) || []
    setFunds(updatedFunds)
    const updated = updatedFunds.find(f => f.id === fundId)
    if (updated) setSelectedFund(updated)
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
      // تحديث المصاريف والبطاقات في نفس الوقت
      await Promise.all([
        loadExpenses(selectedFund.id),
        refreshFundData(selectedFund.id)
      ])
    }
    setLoading(false)
  }

  async function deleteFund(id: string) {
    if (!confirm('هل أنت متأكد؟ سيتم حذف جميع المصاريف المرتبطة!')) return
    await supabase.from('funds').delete().eq('id', id)
    loadFunds()
  }

  async function deleteExpense(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذا المصروف؟')) return
    if (!selectedFund) return
    await supabase.from('expenses').delete().eq('id', id)
    await Promise.all([
      loadExpenses(selectedFund.id),
      refreshFundData(selectedFund.id)
    ])
  }

  function openFundExpenses(fund: Fund) {
    setSelectedFund(fund)
    loadExpenses(fund.id)
    setView('expenses')
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
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Arial', sans-serif; direction: rtl; color: #111; background: #fff; padding: 20px; }
          .header { text-align: center; border-bottom: 3px solid #1e40af; padding-bottom: 16px; margin-bottom: 24px; }
          .company-name { font-size: 22px; font-weight: bold; color: #1e40af; margin-bottom: 4px; }
          .report-title { font-size: 16px; color: #374151; margin-bottom: 4px; }
          .report-date { font-size: 13px; color: #6b7280; }
          .summary-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
          .card { border-radius: 8px; padding: 12px 16px; }
          .card-blue { background: #dbeafe; }
          .card-red { background: #fee2e2; }
          .card-green { background: #dcfce7; }
          .card-amber { background: #fef9c3; }
          .card-label { font-size: 12px; font-weight: 600; margin-bottom: 4px; }
          .card-blue .card-label { color: #1d4ed8; }
          .card-red .card-label { color: #dc2626; }
          .card-green .card-label { color: #15803d; }
          .card-amber .card-label { color: #b45309; }
          .card-value { font-size: 18px; font-weight: bold; }
          .card-blue .card-value { color: #1e40af; }
          .card-red .card-value { color: #dc2626; }
          .card-green .card-value { color: #15803d; }
          .card-amber .card-value { color: #b45309; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th { background: #1e40af; color: #fff; padding: 10px 12px; text-align: right; font-weight: 600; }
          td { padding: 9px 12px; border-bottom: 1px solid #e5e7eb; }
          tr:nth-child(even) { background: #f9fafb; }
          .type-badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; background: #f3f4f6; color: #374151; }
          .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 11px; color: #9ca3af; }
          .fund-info { background: #f9fafb; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; }
          .fund-info span { margin-left: 24px; color: #374151; }
          .fund-info strong { color: #111827; }
          @media print {
            body { padding: 10px; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
      </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => { printWindow.print(); printWindow.close() }, 500)
  }

  const formatAmount = (n: number) => Number(n).toLocaleString('ar-IQ') + ' د.ع'
  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('ar-IQ') : '—'

  return (
    <div style={{margin:'24px',background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>

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
            {view === 'funds' ? '📋 المبالغ المستلمة' : `📋 مصاريف: ${selectedFund?.['المصدر']}`}
          </h2>
          {readOnly && <span style={{fontSize:12,background:'#fef9c3',color:'#b45309',padding:'3px 10px',borderRadius:20,fontWeight:600}}>👁️ قراءة فقط</span>}
        </div>
        <div style={{display:'flex',gap:8}}>
          {view === 'expenses' && (
            <button onClick={handlePrint}
              style={{background:'#f3f4f6',color:'#374151',border:'1px solid #d1d5db',borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:14,fontWeight:600}}>
              🖨️ طباعة التقرير
            </button>
          )}
          {!readOnly && (
            <button onClick={()=>{ view === 'funds' ? setShowFundForm(!showFundForm) : setShowExpenseForm(!showExpenseForm) }}
              style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:14,fontWeight:600}}>
              {view === 'funds' ? (showFundForm ? 'إلغاء' : '+ إضافة مبلغ مستلم') : (showExpenseForm ? 'إلغاء' : '+ إضافة مصروف')}
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
                style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'2px solid #d1d5db',fontSize:14,boxSizing:'border-box',color:'#111827',background:'#fff',direction:'ltr',textAlign:'right'}}/>
            </div>
            <div>
              <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>مصدر المبلغ *</label>
              <input value={fundForm.source} onChange={e=>setFundForm({...fundForm,source:e.target.value})} placeholder="مثال: الإدارة العامة"
                style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'2px solid #d1d5db',fontSize:14,boxSizing:'border-box',color:'#111827',background:'#fff'}}/>
            </div>
            <div>
              <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>المبلغ (د.ع) *</label>
              <input type="number" value={fundForm.amount} onChange={e=>setFundForm({...fundForm,amount:e.target.value})} placeholder="0"
                style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'2px solid #d1d5db',fontSize:14,boxSizing:'border-box',color:'#111827',background:'#fff'}}/>
            </div>
            <div>
              <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>تاريخ الاستلام</label>
              <input type="date" value={fundForm.received_date} onChange={e=>setFundForm({...fundForm,received_date:e.target.value})}
                style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'2px solid #d1d5db',fontSize:14,boxSizing:'border-box',color:'#111827',background:'#fff'}}/>
            </div>
            <div>
              <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>ملاحظات</label>
              <input value={fundForm.notes} onChange={e=>setFundForm({...fundForm,notes:e.target.value})} placeholder="اختياري"
                style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'2px solid #d1d5db',fontSize:14,boxSizing:'border-box',color:'#111827',background:'#fff'}}/>
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
              <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>الغرض من الصرف *</label>
              <input value={expenseForm.description} onChange={e=>setExpenseForm({...expenseForm,description:e.target.value})} placeholder="مثال: شراء مواد"
                style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'2px solid #d1d5db',fontSize:14,boxSizing:'border-box',color:'#111827',background:'#fff'}}/>
            </div>
            <div>
              <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>المبلغ المصروف (د.ع) *</label>
              <input type="number" value={expenseForm.amount} onChange={e=>setExpenseForm({...expenseForm,amount:e.target.value})} placeholder="0"
                style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'2px solid #d1d5db',fontSize:14,boxSizing:'border-box',color:'#111827',background:'#fff'}}/>
            </div>
            <div>
              <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>نوع المصروف *</label>
              <select value={expenseForm.expense_type} onChange={e=>setExpenseForm({...expenseForm,expense_type:e.target.value})}
                style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'2px solid #d1d5db',fontSize:14,boxSizing:'border-box',color:'#111827',background:'#fff'}}>
                <option value="">اختر النوع...</option>
                {['مصروف تشغيلي','رواتب','مشتريات','صيانة','أخرى'].map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>تاريخ الصرف</label>
              <input type="date" value={expenseForm.expense_date} onChange={e=>setExpenseForm({...expenseForm,expense_date:e.target.value})}
                style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'2px solid #d1d5db',fontSize:14,boxSizing:'border-box',color:'#111827',background:'#fff'}}/>
            </div>
            <div style={{gridColumn:'span 2'}}>
              <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>ملاحظات</label>
              <input value={expenseForm.notes} onChange={e=>setExpenseForm({...expenseForm,notes:e.target.value})} placeholder="اختياري"
                style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'2px solid #d1d5db',fontSize:14,boxSizing:'border-box',color:'#111827',background:'#fff'}}/>
            </div>
          </div>
          <button onClick={saveExpense} disabled={loading}
            style={{marginTop:16,background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontSize:14,fontWeight:600}}>
            {loading ? 'جارٍ الحفظ...' : 'حفظ المصروف'}
          </button>
        </div>
      )}

      {/* بطاقات الملخص */}
      {view === 'expenses' && selectedFund && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,padding:'16px 20px',borderBottom:'2px solid #e5e7eb',background:'#f9fafb'}}>
          <div style={{background:'#dbeafe',borderRadius:10,padding:'14px 16px'}}>
            <div style={{fontSize:12,color:'#1d4ed8',fontWeight:600,marginBottom:4}}>المبلغ المستلم</div>
            <div style={{fontSize:20,fontWeight:700,color:'#1e40af'}}>{formatAmount(selectedFund['المبلغ المستلم'])}</div>
          </div>
          <div style={{background:'#fee2e2',borderRadius:10,padding:'14px 16px'}}>
            <div style={{fontSize:12,color:'#dc2626',fontWeight:600,marginBottom:4}}>إجمالي المصروف</div>
            <div style={{fontSize:20,fontWeight:700,color:'#dc2626'}}>{formatAmount(selectedFund['إجمالي المصروف'])}</div>
          </div>
          <div style={{background: selectedFund['المتبقي'] >= 0 ? '#dcfce7' : '#fef9c3',borderRadius:10,padding:'14px 16px'}}>
            <div style={{fontSize:12,color: selectedFund['المتبقي'] >= 0 ? '#15803d' : '#b45309',fontWeight:600,marginBottom:4}}>المتبقي</div>
            <div style={{fontSize:20,fontWeight:700,color: selectedFund['المتبقي'] >= 0 ? '#15803d' : '#b45309'}}>{formatAmount(selectedFund['المتبقي'])}</div>
          </div>
        </div>
      )}

      {/* محتوى الطباعة المخفي */}
      <div ref={printRef} style={{display:'none'}}>
        {selectedFund && (
          <>
            <div className="header">
              <div className="company-name">Sanya International Company</div>
              <div className="report-title">تقرير المصاريف — {selectedFund['المصدر']}</div>
              <div className="report-date">تاريخ الطباعة: {new Date().toLocaleDateString('ar-IQ')}</div>
            </div>
            <div className="fund-info">
              <span>المصدر: <strong>{selectedFund['المصدر']}</strong></span>
              <span>تاريخ الاستلام: <strong>{formatDate(selectedFund['تاريخ الاستلام'])}</strong></span>
              {selectedFund['ملاحظات'] && <span>ملاحظات: <strong>{selectedFund['ملاحظات']}</strong></span>}
            </div>
            <div className="summary-cards">
              <div className="card card-blue">
                <div className="card-label">المبلغ المستلم</div>
                <div className="card-value">{formatAmount(selectedFund['المبلغ المستلم'])}</div>
              </div>
              <div className="card card-red">
                <div className="card-label">إجمالي المصروف</div>
                <div className="card-value">{formatAmount(selectedFund['إجمالي المصروف'])}</div>
              </div>
              <div className={`card ${selectedFund['المتبقي'] >= 0 ? 'card-green' : 'card-amber'}`}>
                <div className="card-label">المتبقي</div>
                <div className="card-value">{formatAmount(selectedFund['المتبقي'])}</div>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>الغرض من الصرف</th>
                  <th>النوع</th>
                  <th>المبلغ</th>
                  <th>التاريخ</th>
                  <th>ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp, idx) => (
                  <tr key={exp.id}>
                    <td>{idx + 1}</td>
                    <td>{exp.description}</td>
                    <td><span className="type-badge">{exp.expense_type}</span></td>
                    <td style={{fontWeight:'bold',color:'#dc2626'}}>{formatAmount(exp.amount)}</td>
                    <td>{formatDate(exp.expense_date)}</td>
                    <td>{exp.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="footer">
              تم إنشاء هذا التقرير بواسطة منصة Sanya International Company — {new Date().toLocaleDateString('ar-IQ')}
            </div>
          </>
        )}
      </div>

      {/* الجداول */}
      {loading ? (
        <div style={{textAlign:'center',padding:'3rem',color:'#6b7280',fontSize:14}}>جارٍ تحميل البيانات...</div>
      ) : view === 'funds' ? (
        funds.length === 0 ? (
          <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لا توجد مبالغ مستلمة</div>
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
                {funds.map((fund,idx)=>(
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
        expenses.length === 0 ? (
          <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لا توجد مصاريف</div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}>
              <thead>
                <tr style={{background:'#f3f4f6'}}>
                  {['الغرض','النوع','المبلغ','التاريخ','ملاحظات',''].map(h=>(
                    <th key={h} style={{padding:'12px 16px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expenses.map(exp=>(
                  <tr key={exp.id} style={{borderBottom:'1px solid #e5e7eb'}}>
                    <td style={{padding:'12px 16px',fontWeight:600,color:'#111827'}}>{exp.description}</td>
                    <td style={{padding:'12px 16px'}}>
                      <span style={{background:'#f3f4f6',color:'#374151',padding:'4px 10px',borderRadius:20,fontSize:12,fontWeight:600}}>{exp.expense_type}</span>
                    </td>
                    <td style={{padding:'12px 16px',color:'#dc2626',fontWeight:700}}>{formatAmount(exp.amount)}</td>
                    <td style={{padding:'12px 16px',color:'#6b7280'}}>{formatDate(exp.expense_date)}</td>
                    <td style={{padding:'12px 16px',color:'#6b7280',fontSize:13}}>{exp.notes || '—'}</td>
                    <td style={{padding:'12px 16px'}}>
                      {!readOnly && (
                        <button onClick={()=>deleteExpense(exp.id)}
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
