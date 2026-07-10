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

interface CustodyItem {
  id: string
  employee_id: string
  item_name: string
  item_type: string
  serial_number: string | null
  received_date: string
  returned_date: string | null
  status: string
  notes: string | null
  created_at: string
}

const itemTypes = [
  { key: 'vehicle', label: 'سيارة', icon: '🚗' },
  { key: 'laptop', label: 'حاسوب', icon: '💻' },
  { key: 'phone', label: 'هاتف', icon: '📱' },
  { key: 'tools', label: 'أدوات ومعدات', icon: '🧰' },
  { key: 'other', label: 'أخرى', icon: '📦' },
]

export default function Custody({ readOnly = false }: { readOnly?: boolean }) {
  const [activeTab, setActiveTab] = useState<'active' | 'returned'>('active')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [items, setItems] = useState<CustodyItem[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [form, setForm] = useState({
    employee_id: '', item_name: '', item_type: 'other', serial_number: '', received_date: new Date().toISOString().split('T')[0], notes: ''
  })

  useEffect(() => {
    loadEmployees()
    loadItems()
  }, [])

  async function loadEmployees() {
    const { data } = await supabase.from('employees').select('id, name, job_title').eq('status', 'active').order('name')
    setEmployees((data as Employee[]) || [])
  }

  async function loadItems() {
    setLoading(true)
    const { data } = await supabase.from('custody_items').select('*').order('created_at', { ascending: false })
    setItems((data as CustodyItem[]) || [])
    setLoading(false)
  }

  function empName(id: string) {
    return employees.find(e => e.id === id)?.name || '—'
  }

  async function addItem() {
    if (!form.employee_id || !form.item_name || !form.received_date) {
      alert('يرجى تعبئة الموظف واسم العهدة وتاريخ الاستلام')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('custody_items').insert([{
      employee_id: form.employee_id,
      item_name: form.item_name,
      item_type: form.item_type,
      serial_number: form.serial_number || null,
      received_date: form.received_date,
      notes: form.notes || null,
      status: 'active'
    }])
    if (error) alert('خطأ: ' + error.message)
    else {
      setForm({ employee_id: '', item_name: '', item_type: 'other', serial_number: '', received_date: new Date().toISOString().split('T')[0], notes: '' })
      setShowForm(false)
      await loadItems()
    }
    setSaving(false)
  }

  async function returnItem(item: CustodyItem) {
    if (!confirm(`تأكيد إرجاع العهدة "${item.item_name}" من ${empName(item.employee_id)}؟`)) return
    await supabase.from('custody_items').update({
      status: 'returned',
      returned_date: new Date().toISOString().split('T')[0]
    }).eq('id', item.id)
    await logActivity('إرجاع عهدة', 'custody', `إرجاع ${item.item_name} من ${empName(item.employee_id)}`)
    await loadItems()
  }

  async function undoReturn(item: CustodyItem) {
    if (!confirm(`إعادة العهدة "${item.item_name}" إلى حالة نشطة (بحوزة الموظف)؟`)) return
    await supabase.from('custody_items').update({ status: 'active', returned_date: null }).eq('id', item.id)
    await loadItems()
  }

  async function deleteItem(item: CustodyItem) {
    if (!confirm(`هل أنت متأكد من حذف العهدة "${item.item_name}" نهائياً؟`)) return
    await supabase.from('custody_items').delete().eq('id', item.id)
    await logActivity('حذف عهدة', 'custody', `حذف ${item.item_name} — ${empName(item.employee_id)}`)
    await loadItems()
  }

  const filteredItems = useMemo(() => {
    let list = items.filter(i => activeTab === 'active' ? i.status === 'active' : i.status === 'returned')
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      list = list.filter(i =>
        i.item_name.toLowerCase().includes(term) ||
        empName(i.employee_id).toLowerCase().includes(term) ||
        (i.serial_number || '').toLowerCase().includes(term)
      )
    }
    if (typeFilter) list = list.filter(i => i.item_type === typeFilter)
    return list
  }, [items, activeTab, searchTerm, typeFilter, employees])

  // إحصائية: عدد العهد النشطة لكل موظف
  const activeCountByEmployee = useMemo(() => {
    const counts: Record<string, number> = {}
    items.filter(i => i.status === 'active').forEach(i => { counts[i.employee_id] = (counts[i.employee_id] || 0) + 1 })
    return counts
  }, [items])

  function fmtDate(d: string | null) {
    return d ? new Date(d).toLocaleDateString('ar-IQ') : '—'
  }

  const typeInfo = (key: string) => itemTypes.find(t => t.key === key) || itemTypes[4]

  const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, border:'2px solid #d1d5db', fontSize:13, boxSizing:'border-box' as const, color:'#111827', background:'#fff', marginBottom:10 }

  return (
    <div style={{margin:'24px',fontFamily:'system-ui',direction:'rtl'}}>

      {/* تبويبات */}
      <div style={{display:'flex',gap:6,marginBottom:16,background:'#e5e7eb',padding:4,borderRadius:10,width:'fit-content'}}>
        <button onClick={()=>setActiveTab('active')}
          style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
            background:activeTab==='active'?'#fff':'transparent',color:activeTab==='active'?'#1e40af':'#6b7280',
            boxShadow:activeTab==='active'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
          عهد نشطة ({items.filter(i=>i.status==='active').length})
        </button>
        <button onClick={()=>setActiveTab('returned')}
          style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
            background:activeTab==='returned'?'#fff':'transparent',color:activeTab==='returned'?'#1e40af':'#6b7280',
            boxShadow:activeTab==='returned'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
          عهد مُرجَعة ({items.filter(i=>i.status==='returned').length})
        </button>
      </div>

      <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
        {/* رأس البطاقة */}
        <div style={{padding:'14px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <h2 style={{margin:0,fontSize:16,fontWeight:700,color:'#111827'}}>
            {activeTab === 'active' ? 'العهد بحوزة الموظفين' : 'العهد المُرجَعة'}
          </h2>
          <input placeholder="بحث بالاسم أو العهدة أو الرقم التسلسلي..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}
            style={{padding:'8px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:12,color:'#111827',minWidth:230}}/>
          <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}
            style={{padding:'8px 10px',borderRadius:8,border:'2px solid #d1d5db',fontSize:12,color:'#374151',background:'#fff'}}>
            <option value="">كل الأنواع</option>
            {itemTypes.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
          </select>
          {(searchTerm||typeFilter) && (
            <button onClick={()=>{setSearchTerm('');setTypeFilter('')}}
              style={{background:'#f3f4f6',color:'#6b7280',border:'none',borderRadius:8,padding:'8px 12px',cursor:'pointer',fontSize:12}}>مسح</button>
          )}
          {!readOnly && activeTab === 'active' && (
            <button onClick={()=>setShowForm(!showForm)}
              style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:13,fontWeight:600,marginRight:'auto'}}>
              {showForm ? 'إلغاء' : '+ تسجيل عهدة جديدة'}
            </button>
          )}
        </div>

        {/* نموذج إضافة */}
        {showForm && !readOnly && (
          <div style={{padding:'20px',borderBottom:'2px solid #e5e7eb',background:'#f9fafb'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,maxWidth:800}}>
              <div>
                <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>الموظف *</label>
                <select value={form.employee_id} onChange={e=>setForm({...form,employee_id:e.target.value})} style={inputStyle}>
                  <option value="">اختر الموظف...</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} — {emp.job_title}</option>)}
                </select>
              </div>
              <div>
                <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>اسم العهدة *</label>
                <input value={form.item_name} onChange={e=>setForm({...form,item_name:e.target.value})} placeholder="مثال: سيارة تويوتا هايلوكس 2022" style={inputStyle}/>
              </div>
              <div>
                <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>النوع *</label>
                <select value={form.item_type} onChange={e=>setForm({...form,item_type:e.target.value})} style={inputStyle}>
                  {itemTypes.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>الرقم التسلسلي / رقم اللوحة (اختياري)</label>
                <input value={form.serial_number} onChange={e=>setForm({...form,serial_number:e.target.value})} placeholder="مثال: 123456 أو أ ب ج 1234" style={inputStyle}/>
              </div>
              <div>
                <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>تاريخ الاستلام *</label>
                <input type="date" value={form.received_date} onChange={e=>setForm({...form,received_date:e.target.value})} style={inputStyle}/>
              </div>
              <div>
                <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>ملاحظات (اختياري)</label>
                <input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="حالة العهدة، ملحقاتها..." style={inputStyle}/>
              </div>
            </div>
            <button onClick={addItem} disabled={saving}
              style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontSize:14,fontWeight:600}}>
              {saving ? 'جارٍ الحفظ...' : 'تسجيل العهدة'}
            </button>
          </div>
        )}

        {/* الجدول */}
        {loading ? (
          <div style={{textAlign:'center',padding:'3rem',color:'#6b7280'}}>جارٍ التحميل...</div>
        ) : filteredItems.length === 0 ? (
          <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>
            {activeTab === 'active' ? 'لا توجد عهد نشطة' : 'لا توجد عهد مُرجَعة'}
          </div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{background:'#f3f4f6'}}>
                  {['الموظف','العهدة','النوع','الرقم التسلسلي','تاريخ الاستلام',activeTab==='returned'?'تاريخ الإرجاع':'','ملاحظات',''].filter(h=>h!=='' || true).map((h,i)=>(
                    <th key={i} style={{padding:'10px 14px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => {
                  const t = typeInfo(item.item_type)
                  return (
                    <tr key={item.id} style={{borderBottom:'1px solid #e5e7eb'}}>
                      <td style={{padding:'10px 14px',fontWeight:600,color:'#111827'}}>
                        {empName(item.employee_id)}
                        {activeTab === 'active' && (activeCountByEmployee[item.employee_id] || 0) > 1 && (
                          <span style={{marginRight:6,background:'#dbeafe',color:'#1d4ed8',padding:'2px 8px',borderRadius:20,fontSize:10,fontWeight:700}}>
                            {activeCountByEmployee[item.employee_id]} عهد
                          </span>
                        )}
                      </td>
                      <td style={{padding:'10px 14px',color:'#111827'}}>{item.item_name}</td>
                      <td style={{padding:'10px 14px'}}>
                        <span style={{background:'#f3f4f6',color:'#374151',padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600}}>
                          {t.icon} {t.label}
                        </span>
                      </td>
                      <td style={{padding:'10px 14px',color:'#6b7280',direction:'ltr',textAlign:'right'}}>{item.serial_number || '—'}</td>
                      <td style={{padding:'10px 14px',color:'#6b7280'}}>{fmtDate(item.received_date)}</td>
                      {activeTab === 'returned' && <td style={{padding:'10px 14px',color:'#15803d',fontWeight:600}}>{fmtDate(item.returned_date)}</td>}
                      {activeTab === 'active' && <td style={{padding:'10px 14px'}}></td>}
                      <td style={{padding:'10px 14px',color:'#6b7280',fontSize:12,maxWidth:180}}>{item.notes || '—'}</td>
                      <td style={{padding:'10px 14px'}}>
                        {!readOnly && (
                          <div style={{display:'flex',gap:6}}>
                            {item.status === 'active' ? (
                              <button onClick={()=>returnItem(item)}
                                style={{background:'#dcfce7',color:'#15803d',border:'none',borderRadius:6,padding:'5px 12px',cursor:'pointer',fontSize:11,fontWeight:600,whiteSpace:'nowrap'}}>
                                تسجيل إرجاع
                              </button>
                            ) : (
                              <button onClick={()=>undoReturn(item)}
                                style={{background:'#dbeafe',color:'#1d4ed8',border:'none',borderRadius:6,padding:'5px 12px',cursor:'pointer',fontSize:11,fontWeight:600,whiteSpace:'nowrap'}}>
                                إلغاء الإرجاع
                              </button>
                            )}
                            <button onClick={()=>deleteItem(item)}
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
