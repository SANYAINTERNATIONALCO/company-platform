'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { logActivity } from '../logActivity'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

interface Employee {
  id: string
  name: string
  job_title: string
}

interface Contract {
  id: string
  employee_id: string
  contract_type: string
  start_date: string
  end_date: string | null
  status: string
  notes: string | null
  created_at: string
}

export default function Contracts({ readOnly = false }: { readOnly?: boolean }) {
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [form, setForm] = useState({
    employee_id: '', contract_type: 'fixed', start_date: new Date().toISOString().split('T')[0], end_date: '', notes: ''
  })

  useEffect(() => {
    loadEmployees()
    loadContracts()
  }, [])

  async function loadEmployees() {
    const { data } = await supabase.from('employees').select('id, name, job_title').eq('status', 'active').order('name')
    setEmployees((data as Employee[]) || [])
  }

  async function loadContracts() {
    setLoading(true)
    const { data } = await supabase.from('contracts').select('*').order('created_at', { ascending: false })
    setContracts((data as Contract[]) || [])
    setLoading(false)
  }

  function empName(id: string) {
    return employees.find(e => e.id === id)?.name || '—'
  }

  function empTitle(id: string) {
    return employees.find(e => e.id === id)?.job_title || ''
  }

  function daysRemaining(c: Contract): number | null {
    if (!c.end_date) return null
    const today = new Date(new Date().toDateString())
    const end = new Date(c.end_date)
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  function contractState(c: Contract): { label: string; bg: string; color: string; priority: number } {
    if (c.status === 'renewed') return { label: 'مجدد', bg: '#dbeafe', color: '#1d4ed8', priority: 4 }
    if (c.status === 'terminated') return { label: 'ملغى', bg: '#f3f4f6', color: '#6b7280', priority: 5 }
    if (c.contract_type === 'permanent' || !c.end_date) return { label: 'غير محدد المدة', bg: '#ede9fe', color: '#7c3aed', priority: 3 }
    const days = daysRemaining(c)!
    if (days < 0) return { label: 'منتهي', bg: '#fee2e2', color: '#dc2626', priority: 0 }
    if (days <= 30) return { label: `ينتهي خلال ${days} يوم`, bg: '#fef9c3', color: '#b45309', priority: 1 }
    return { label: 'نشط', bg: '#dcfce7', color: '#15803d', priority: 2 }
  }

  async function addContract() {
    if (!form.employee_id || !form.start_date) { alert('يرجى اختيار الموظف وتاريخ البداية'); return }
    if (form.contract_type === 'fixed' && !form.end_date) { alert('يرجى تحديد تاريخ نهاية العقد (أو اختر "غير محدد المدة")'); return }
    setSaving(true)
    const { error } = await supabase.from('contracts').insert([{
      employee_id: form.employee_id,
      contract_type: form.contract_type,
      start_date: form.start_date,
      end_date: form.contract_type === 'fixed' ? form.end_date : null,
      notes: form.notes || null,
      status: 'active'
    }])
    if (error) alert('خطأ: ' + error.message)
    else {
      setForm({ employee_id: '', contract_type: 'fixed', start_date: new Date().toISOString().split('T')[0], end_date: '', notes: '' })
      setShowForm(false)
      await loadContracts()
    }
    setSaving(false)
  }

  async function renewContract(c: Contract) {
    if (!confirm(`تجديد عقد ${empName(c.employee_id)}؟ سيُنقل العقد الحالي للأرشيف كـ"مجدد" وستُفتح استمارة العقد الجديد.`)) return
    await supabase.from('contracts').update({ status: 'renewed' }).eq('id', c.id)
    await logActivity('تجديد عقد', 'contracts', `تجديد عقد ${empName(c.employee_id)}`)
    // فتح النموذج مع بيانات مسبقة: نفس الموظف، البداية = نهاية العقد السابق أو اليوم
    setForm({
      employee_id: c.employee_id,
      contract_type: c.contract_type,
      start_date: c.end_date || new Date().toISOString().split('T')[0],
      end_date: '',
      notes: ''
    })
    setActiveTab('active')
    setShowForm(true)
    await loadContracts()
  }

  async function terminateContract(c: Contract) {
    if (!confirm(`إلغاء عقد ${empName(c.employee_id)}؟ سيُنقل للأرشيف كـ"ملغى".`)) return
    await supabase.from('contracts').update({ status: 'terminated' }).eq('id', c.id)
    await logActivity('إلغاء عقد', 'contracts', `إلغاء عقد ${empName(c.employee_id)}`)
    await loadContracts()
  }

  async function deleteContract(c: Contract) {
    if (!confirm(`هل أنت متأكد من حذف هذا العقد نهائياً؟`)) return
    await supabase.from('contracts').delete().eq('id', c.id)
    await logActivity('حذف عقد', 'contracts', `حذف عقد ${empName(c.employee_id)}`)
    await loadContracts()
  }

  const activeContracts = useMemo(() => contracts.filter(c => c.status === 'active'), [contracts])
  const archivedContracts = useMemo(() => contracts.filter(c => c.status !== 'active'), [contracts])

  const alerts = useMemo(() => {
    let expired = 0, expiringSoon = 0
    activeContracts.forEach(c => {
      const days = daysRemaining(c)
      if (days !== null) {
        if (days < 0) expired++
        else if (days <= 30) expiringSoon++
      }
    })
    return { expired, expiringSoon }
  }, [activeContracts])

  const filteredContracts = useMemo(() => {
    let list = activeTab === 'active' ? activeContracts : archivedContracts
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      list = list.filter(c => empName(c.employee_id).toLowerCase().includes(term))
    }
    // ترتيب: المنتهية أولاً ثم القريبة من الانتهاء
    return [...list].sort((a, b) => contractState(a).priority - contractState(b).priority)
  }, [activeTab, activeContracts, archivedContracts, searchTerm, employees])

  function fmtDate(d: string | null) {
    return d ? new Date(d).toLocaleDateString('ar-IQ') : '—'
  }

  const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, border:'2px solid #d1d5db', fontSize:13, boxSizing:'border-box' as const, color:'#111827', background:'#fff', marginBottom:10 }

  return (
    <div style={{margin:'24px',fontFamily:'system-ui',direction:'rtl'}}>

      {/* تنبيهات العقود */}
      {(alerts.expired > 0 || alerts.expiringSoon > 0) && (
        <div style={{background:'#fff',border:'1px solid #fcd34d',borderRadius:12,padding:'14px 20px',marginBottom:16,display:'flex',gap:16,flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:14,fontWeight:700,color:'#111827'}}>⚠ تنبيهات العقود:</span>
          {alerts.expired > 0 && (
            <span style={{background:'#fee2e2',color:'#dc2626',padding:'5px 14px',borderRadius:20,fontSize:12,fontWeight:700}}>
              {alerts.expired} عقد منتهي يحتاج إجراء
            </span>
          )}
          {alerts.expiringSoon > 0 && (
            <span style={{background:'#fef9c3',color:'#b45309',padding:'5px 14px',borderRadius:20,fontSize:12,fontWeight:700}}>
              {alerts.expiringSoon} عقد ينتهي خلال 30 يوماً
            </span>
          )}
        </div>
      )}

      {/* تبويبات */}
      <div style={{display:'flex',gap:6,marginBottom:16,background:'#e5e7eb',padding:4,borderRadius:10,width:'fit-content'}}>
        <button onClick={()=>setActiveTab('active')}
          style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
            background:activeTab==='active'?'#fff':'transparent',color:activeTab==='active'?'#1e40af':'#6b7280',
            boxShadow:activeTab==='active'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
          العقود النشطة ({activeContracts.length})
        </button>
        <button onClick={()=>setActiveTab('archive')}
          style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
            background:activeTab==='archive'?'#fff':'transparent',color:activeTab==='archive'?'#1e40af':'#6b7280',
            boxShadow:activeTab==='archive'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
          الأرشيف ({archivedContracts.length})
        </button>
      </div>

      <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
        {/* رأس البطاقة */}
        <div style={{padding:'14px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <h2 style={{margin:0,fontSize:16,fontWeight:700,color:'#111827'}}>
            {activeTab === 'active' ? 'العقود النشطة' : 'أرشيف العقود'}
          </h2>
          <input placeholder="بحث باسم الموظف..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}
            style={{padding:'8px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:12,color:'#111827',minWidth:200}}/>
          {searchTerm && (
            <button onClick={()=>setSearchTerm('')}
              style={{background:'#f3f4f6',color:'#6b7280',border:'none',borderRadius:8,padding:'8px 12px',cursor:'pointer',fontSize:12}}>مسح</button>
          )}
          {!readOnly && activeTab === 'active' && (
            <button onClick={()=>setShowForm(!showForm)}
              style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:13,fontWeight:600,marginRight:'auto'}}>
              {showForm ? 'إلغاء' : '+ عقد جديد'}
            </button>
          )}
        </div>

        {/* نموذج إضافة */}
        {showForm && !readOnly && (
          <div style={{padding:'20px',borderBottom:'2px solid #e5e7eb',background:'#f9fafb'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,maxWidth:640}}>
              <div>
                <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>الموظف *</label>
                <select value={form.employee_id} onChange={e=>setForm({...form,employee_id:e.target.value})} style={inputStyle}>
                  <option value="">اختر الموظف...</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} — {emp.job_title}</option>)}
                </select>
              </div>
              <div>
                <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>نوع العقد *</label>
                <select value={form.contract_type} onChange={e=>setForm({...form,contract_type:e.target.value})} style={inputStyle}>
                  <option value="fixed">محدد المدة</option>
                  <option value="permanent">غير محدد المدة</option>
                </select>
              </div>
              <div>
                <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>تاريخ بداية العقد *</label>
                <input type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})} style={inputStyle}/>
              </div>
              {form.contract_type === 'fixed' && (
                <div>
                  <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>تاريخ نهاية العقد *</label>
                  <input type="date" value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})} style={inputStyle}/>
                </div>
              )}
              <div style={{gridColumn:'span 2'}}>
                <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>ملاحظات (اختياري)</label>
                <input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="شروط خاصة، مرجع العقد الورقي..." style={inputStyle}/>
              </div>
            </div>
            <button onClick={addContract} disabled={saving}
              style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontSize:14,fontWeight:600}}>
              {saving ? 'جارٍ الحفظ...' : 'حفظ العقد'}
            </button>
          </div>
        )}

        {/* الجدول */}
        {loading ? (
          <div style={{textAlign:'center',padding:'3rem',color:'#6b7280'}}>جارٍ التحميل...</div>
        ) : filteredContracts.length === 0 ? (
          <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>
            {activeTab === 'active' ? 'لا توجد عقود نشطة — أضف أول عقد' : 'الأرشيف فارغ'}
          </div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{background:'#f3f4f6'}}>
                  {['الموظف','المنصب','نوع العقد','تاريخ البداية','تاريخ النهاية','الحالة','ملاحظات',''].map((h,i)=>(
                    <th key={i} style={{padding:'10px 14px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map(c => {
                  const state = contractState(c)
                  return (
                    <tr key={c.id} style={{borderBottom:'1px solid #e5e7eb'}}>
                      <td style={{padding:'10px 14px',fontWeight:600,color:'#111827'}}>{empName(c.employee_id)}</td>
                      <td style={{padding:'10px 14px',color:'#6b7280',fontSize:12}}>{empTitle(c.employee_id)}</td>
                      <td style={{padding:'10px 14px',color:'#374151'}}>{c.contract_type === 'fixed' ? 'محدد المدة' : 'غير محدد المدة'}</td>
                      <td style={{padding:'10px 14px',color:'#6b7280'}}>{fmtDate(c.start_date)}</td>
                      <td style={{padding:'10px 14px',color:'#6b7280'}}>{fmtDate(c.end_date)}</td>
                      <td style={{padding:'10px 14px'}}>
                        <span style={{background:state.bg,color:state.color,padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:700}}>
                          {state.label}
                        </span>
                      </td>
                      <td style={{padding:'10px 14px',color:'#6b7280',fontSize:12,maxWidth:160}}>{c.notes || '—'}</td>
                      <td style={{padding:'10px 14px'}}>
                        {!readOnly && (
                          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                            {c.status === 'active' && (
                              <>
                                <button onClick={()=>renewContract(c)}
                                  style={{background:'#dbeafe',color:'#1d4ed8',border:'none',borderRadius:6,padding:'5px 12px',cursor:'pointer',fontSize:11,fontWeight:600,whiteSpace:'nowrap'}}>
                                  تجديد
                                </button>
                                <button onClick={()=>terminateContract(c)}
                                  style={{background:'#fef9c3',color:'#b45309',border:'none',borderRadius:6,padding:'5px 12px',cursor:'pointer',fontSize:11,fontWeight:600}}>
                                  إلغاء
                                </button>
                              </>
                            )}
                            <button onClick={()=>deleteContract(c)}
                              style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:11,fontWeight:600}}>
                              حذف
                            </button>
                          </div>
                        )}
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
