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
  overtime_leave_balance: number
}

interface OvertimeRecord {
  id: string
  employee_id: string
  overtime_date: string
  notes: string | null
  created_at: string
}

export default function Overtime({ readOnly = false }: { readOnly?: boolean }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [records, setRecords] = useState<OvertimeRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [form, setForm] = useState({
    employee_id: '', overtime_date: new Date().toISOString().split('T')[0], notes: ''
  })

  useEffect(() => {
    loadEmployees()
    loadRecords()
  }, [])

  async function loadEmployees() {
    const { data } = await supabase.from('employees').select('id, name, job_title, overtime_leave_balance').eq('status', 'active').order('name')
    setEmployees((data as Employee[]) || [])
  }

  async function loadRecords() {
    setLoading(true)
    const { data } = await supabase.from('overtime_records').select('*').order('overtime_date', { ascending: false })
    setRecords((data as OvertimeRecord[]) || [])
    setLoading(false)
  }

  function empName(id: string) {
    return employees.find(e => e.id === id)?.name || '—'
  }

  function empTitle(id: string) {
    return employees.find(e => e.id === id)?.job_title || ''
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('ar-IQ')
  }

  async function addRecord() {
    if (!form.employee_id || !form.overtime_date) { alert('يرجى اختيار الموظف والتاريخ'); return }
    setSaving(true)
    const emp = employees.find(e => e.id === form.employee_id)
    const { error } = await supabase.from('overtime_records').insert([{
      employee_id: form.employee_id,
      overtime_date: form.overtime_date,
      notes: form.notes || null
    }])
    if (error) { alert('خطأ: ' + error.message); setSaving(false); return }
    await supabase.from('employees').update({
      overtime_leave_balance: (emp?.overtime_leave_balance || 0) + 1
    }).eq('id', form.employee_id)
    setForm({ employee_id: '', overtime_date: new Date().toISOString().split('T')[0], notes: '' })
    setShowForm(false)
    await Promise.all([loadEmployees(), loadRecords()])
    setSaving(false)
  }

  async function deleteRecord(r: OvertimeRecord) {
    if (!confirm(`هل أنت متأكد من حذف يوم الأوفرتايم هذا لـ${empName(r.employee_id)}؟ سيُخصم يوم من رصيده.`)) return
    const emp = employees.find(e => e.id === r.employee_id)
    await supabase.from('overtime_records').delete().eq('id', r.id)
    await supabase.from('employees').update({
      overtime_leave_balance: (emp?.overtime_leave_balance || 0) - 1
    }).eq('id', r.employee_id)
    await logActivity('حذف يوم أوفرتايم', 'overtime', `حذف يوم أوفرتايم ${empName(r.employee_id)} بتاريخ ${fmtDate(r.overtime_date)}`)
    await Promise.all([loadEmployees(), loadRecords()])
  }

  const sortedBalances = useMemo(() => {
    return [...employees].sort((a, b) => (b.overtime_leave_balance || 0) - (a.overtime_leave_balance || 0))
  }, [employees])

  const filteredRecords = useMemo(() => {
    if (!searchTerm.trim()) return records
    const term = searchTerm.toLowerCase()
    return records.filter(r => empName(r.employee_id).toLowerCase().includes(term))
  }, [records, searchTerm, employees])

  const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, border:'2px solid #d1d5db', fontSize:13, boxSizing:'border-box' as const, color:'#111827', background:'#fff', marginBottom:10 }

  const balanceColor = (b: number) => b > 0 ? { bg: '#dcfce7', color: '#15803d' } : b === 0 ? { bg: '#f3f4f6', color: '#6b7280' } : { bg: '#fee2e2', color: '#dc2626' }

  return (
    <div style={{margin:'24px',fontFamily:'system-ui',direction:'rtl'}}>

      {/* أرصدة الأوفرتايم */}
      <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden',marginBottom:16}}>
        <div style={{padding:'14px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb'}}>
          <h2 style={{margin:0,fontSize:16,fontWeight:700,color:'#111827'}}>أرصدة الإجازة التعويضية</h2>
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{background:'#f3f4f6'}}>
                {['الموظف','المنصب','الرصيد الحالي'].map((h,i)=>(
                  <th key={i} style={{padding:'10px 14px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedBalances.map(emp => {
                const c = balanceColor(emp.overtime_leave_balance || 0)
                return (
                  <tr key={emp.id} style={{borderBottom:'1px solid #e5e7eb'}}>
                    <td style={{padding:'10px 14px',fontWeight:600,color:'#111827'}}>{emp.name}</td>
                    <td style={{padding:'10px 14px',color:'#6b7280',fontSize:12}}>{emp.job_title}</td>
                    <td style={{padding:'10px 14px'}}>
                      <span style={{background:c.bg,color:c.color,padding:'4px 12px',borderRadius:20,fontSize:12,fontWeight:700}}>
                        {emp.overtime_leave_balance || 0} يوم
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* سجل الأوفرتايم */}
      <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
        <div style={{padding:'14px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <h2 style={{margin:0,fontSize:16,fontWeight:700,color:'#111827'}}>سجل أيام الأوفرتايم</h2>
          <input placeholder="بحث باسم الموظف..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}
            style={{padding:'8px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:12,color:'#111827',minWidth:200}}/>
          {searchTerm && (
            <button onClick={()=>setSearchTerm('')}
              style={{background:'#f3f4f6',color:'#6b7280',border:'none',borderRadius:8,padding:'8px 12px',cursor:'pointer',fontSize:12}}>مسح</button>
          )}
          {!readOnly && (
            <button onClick={()=>setShowForm(!showForm)}
              style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:13,fontWeight:600,marginRight:'auto'}}>
              {showForm ? 'إلغاء' : '+ يوم أوفرتايم'}
            </button>
          )}
        </div>

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
                <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>تاريخ يوم الأوفرتايم *</label>
                <input type="date" value={form.overtime_date} onChange={e=>setForm({...form,overtime_date:e.target.value})} style={inputStyle}/>
              </div>
              <div style={{gridColumn:'span 2'}}>
                <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>ملاحظات (اختياري)</label>
                <input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="سبب الأوفرتايم..." style={inputStyle}/>
              </div>
            </div>
            <button onClick={addRecord} disabled={saving}
              style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontSize:14,fontWeight:600}}>
              {saving ? 'جارٍ الحفظ...' : 'حفظ (يُضاف يوم لرصيد التعويضية)'}
            </button>
          </div>
        )}

        {loading ? (
          <div style={{textAlign:'center',padding:'3rem',color:'#6b7280'}}>جارٍ التحميل...</div>
        ) : filteredRecords.length === 0 ? (
          <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لا توجد أيام أوفرتايم مسجلة</div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{background:'#f3f4f6'}}>
                  {['الموظف','المنصب','تاريخ الأوفرتايم','ملاحظات',''].map((h,i)=>(
                    <th key={i} style={{padding:'10px 14px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map(r => (
                  <tr key={r.id} style={{borderBottom:'1px solid #e5e7eb'}}>
                    <td style={{padding:'10px 14px',fontWeight:600,color:'#111827'}}>{empName(r.employee_id)}</td>
                    <td style={{padding:'10px 14px',color:'#6b7280',fontSize:12}}>{empTitle(r.employee_id)}</td>
                    <td style={{padding:'10px 14px',color:'#6b7280'}}>{fmtDate(r.overtime_date)}</td>
                    <td style={{padding:'10px 14px',color:'#6b7280',fontSize:12,maxWidth:200}}>{r.notes || '—'}</td>
                    <td style={{padding:'10px 14px'}}>
                      {!readOnly && (
                        <button onClick={()=>deleteRecord(r)}
                          style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:11,fontWeight:600}}>
                          حذف
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
