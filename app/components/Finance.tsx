'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

interface Fund {
  id: string
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

  const [fundForm, setFundForm] = useState<FundForm>({ source: '', amount: '', received_date: '', notes: '' })
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

  async function saveFund() {
    if (!fundForm.source || !fundForm.amount) { alert('يرجى تعبئة المصدر والمبلغ'); return }
    setLoading(true)
    const { error } = await supabase.from('funds').insert([{
      source: fundForm.source,
      amount: parseFloat(fundForm.amount),
      received_date: fundForm.received_date,
      notes: fundForm.notes
    }])
    if (error) alert('خطأ: ' + error.message)
    else {
      setFundForm({ source: '', amount: '', received_date: todayStr, notes: '' })
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
      loadExpenses(selectedFund.id)
      loadFunds()
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
    loadExpenses(selectedFund.id)
    loadFunds()
  }

  function openFundExpenses(fund: Fund) {
    setSelectedFund(fund)
    loadExpenses(fund.id)
    setView('expenses')
  }

  const formatAmount = (n: number) => Number(n).toLocaleString('ar-IQ') + ' د.ع'

  return (
    <div style={{margin:'24px',background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>

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
        {!readOnly && (
          <button onClick={()=>{ view === 'funds' ? setShowFundForm(!showFundForm) : setShowExpenseForm(!showExpenseForm) }}
            style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:14,fontWeight:600}}>
            {view === 'funds' ? (showFundForm ? 'إلغاء' : '+ إضافة مبلغ مستلم') : (showExpenseForm ? 'إلغاء' : '+ إضافة مصروف')}
          </button>
        )}
      </div>

      {!readOnly && view === 'funds' && showFundForm && (
        <div style={{padding:'20px',borderBottom:'2px solid #e5e7eb',background:'#f9fafb'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,maxWidth:600}}>
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
                  {['المصدر','تاريخ الاستلام','المبلغ المستلم','إجمالي المصروف','المتبقي','ملاحظات',''].map(h=>(
                    <th key={h} style={{padding:'12px 16px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {funds.map((fund,idx)=>(
                  <tr key={idx} style={{borderBottom:'1px solid #e5e7eb'}}>
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
                    <td style={{padding:'12px 16px',color:'#6b7280'}}>{exp.expense_date}</td>
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
