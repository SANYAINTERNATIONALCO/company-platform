'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

interface Employee {
  id: string
  name: string
  job_title: string
  phone?: string
  hire_date?: string
  salary?: number
  passport_number?: string
  status?: string
  shift_type?: string
}

interface EmployeeFile {
  id: string
  employee_id: string
  file_name: string
  file_url: string
  file_type: string
  notes: string
  uploaded_at: string
}

interface EmployeeNote {
  id: string
  employee_id: string
  note: string
  created_at: string
}

const fileTypes = [
  { key: 'id_card', label: 'الهوية الشخصية', icon: '🪪' },
  { key: 'bank', label: 'الحساب البنكي', icon: '🏦' },
  { key: 'contract', label: 'عقد العمل', icon: '📝' },
  { key: 'start_work', label: 'مباشرة العمل', icon: '✅' },
  { key: 'resignation', label: 'الاستقالة', icon: '📤' },
  { key: 'warning', label: 'إنذار', icon: '⚠️' },
  { key: 'passport', label: 'الجواز', icon: '📕' },
  { key: 'other', label: 'أخرى', icon: '📄' },
]

export default function Employees({ readOnly = false }: { readOnly?: boolean }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [files, setFiles] = useState<EmployeeFile[]>([])
  const [notes, setNotes] = useState<EmployeeNote[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [newNote, setNewNote] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [empForm, setEmpForm] = useState({
    name: '', job_title: '', phone: '', hire_date: '', salary: '', passport_number: '', shift_type: 'يومي', status: 'active'
  })

  useEffect(() => { loadEmployees() }, [])

  async function loadEmployees() {
    setLoading(true)
    const { data } = await supabase.from('employees').select('*').order('name')
    setEmployees((data as Employee[]) || [])
    setLoading(false)
  }

  async function loadEmployeeData(emp: Employee) {
    setSelectedEmployee(emp)
    const [filesRes, notesRes] = await Promise.all([
      supabase.from('employee_files').select('*').eq('employee_id', emp.id).order('uploaded_at', { ascending: false }),
      supabase.from('employee_notes').select('*').eq('employee_id', emp.id).order('created_at', { ascending: false })
    ])
    setFiles((filesRes.data as EmployeeFile[]) || [])
    setNotes((notesRes.data as EmployeeNote[]) || [])
  }

  async function addEmployee() {
    if (!empForm.name || !empForm.job_title) { alert('يرجى تعبئة الاسم والمنصب'); return }
    setLoading(true)
    const { error } = await supabase.from('employees').insert([{
      name: empForm.name,
      job_title: empForm.job_title,
      phone: empForm.phone || null,
      hire_date: empForm.hire_date || null,
      salary: empForm.salary ? parseFloat(empForm.salary) : null,
      passport_number: empForm.passport_number || null,
      shift_type: empForm.shift_type,
      status: empForm.status
    }])
    if (error) alert('خطأ: ' + error.message)
    else {
      setEmpForm({ name: '', job_title: '', phone: '', hire_date: '', salary: '', passport_number: '', shift_type: 'يومي', status: 'active' })
      setShowAddForm(false)
      loadEmployees()
    }
    setLoading(false)
  }

  async function updateEmployee() {
    if (!selectedEmployee || !empForm.name || !empForm.job_title) { alert('يرجى تعبئة الاسم والمنصب'); return }
    setLoading(true)
    const { error } = await supabase.from('employees').update({
      name: empForm.name,
      job_title: empForm.job_title,
      phone: empForm.phone || null,
      hire_date: empForm.hire_date || null,
      salary: empForm.salary ? parseFloat(empForm.salary) : null,
      passport_number: empForm.passport_number || null,
      shift_type: empForm.shift_type,
      status: empForm.status
    }).eq('id', selectedEmployee.id)
    if (error) alert('خطأ: ' + error.message)
    else {
      setShowEditForm(false)
      loadEmployees()
      const updated = { ...selectedEmployee, ...empForm, salary: empForm.salary ? parseFloat(empForm.salary) : undefined }
      setSelectedEmployee(updated)
    }
    setLoading(false)
  }

  async function handleFileUpload(fileType: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedEmployee) return
    setUploading(fileType)
    const fileExt = file.name.split('.').pop()
const fileName = `${selectedEmployee.id}_${fileType}_${Date.now()}.${fileExt}`
    const { data, error } = await supabase.storage.from('employee-files').upload(fileName, file)
    if (error) {
      alert('خطأ في رفع الملف: ' + error.message)
    } else {
      const { data: urlData } = supabase.storage.from('employee-files').getPublicUrl(data.path)
      await supabase.from('employee_files').insert([{
        employee_id: selectedEmployee.id,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_type: fileType,
        notes: ''
      }])
      const { data: filesData } = await supabase.from('employee_files').select('*').eq('employee_id', selectedEmployee.id).order('uploaded_at', { ascending: false })
      setFiles((filesData as EmployeeFile[]) || [])
    }
    setUploading(null)
    e.target.value = ''
  }

  async function deleteFile(id: string, fileUrl: string) {
    if (!confirm('هل أنت متأكد من حذف هذا الملف؟')) return
    await supabase.from('employee_files').delete().eq('id', id)
    const path = fileUrl.split('/').pop()
    if (path) await supabase.storage.from('employee-files').remove([path])
    if (selectedEmployee) {
      const { data } = await supabase.from('employee_files').select('*').eq('employee_id', selectedEmployee.id).order('uploaded_at', { ascending: false })
      setFiles((data as EmployeeFile[]) || [])
    }
  }

  async function addNote() {
    if (!newNote.trim() || !selectedEmployee) return
    await supabase.from('employee_notes').insert([{ employee_id: selectedEmployee.id, note: newNote.trim() }])
    setNewNote('')
    const { data } = await supabase.from('employee_notes').select('*').eq('employee_id', selectedEmployee.id).order('created_at', { ascending: false })
    setNotes((data as EmployeeNote[]) || [])
  }

  async function deleteNote(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذه الملاحظة؟')) return
    await supabase.from('employee_notes').delete().eq('id', id)
    if (selectedEmployee) {
      const { data } = await supabase.from('employee_notes').select('*').eq('employee_id', selectedEmployee.id).order('created_at', { ascending: false })
      setNotes((data as EmployeeNote[]) || [])
    }
  }

  function startEdit() {
    if (!selectedEmployee) return
    setEmpForm({
      name: selectedEmployee.name || '',
      job_title: selectedEmployee.job_title || '',
      phone: selectedEmployee.phone || '',
      hire_date: selectedEmployee.hire_date || '',
      salary: selectedEmployee.salary?.toString() || '',
      passport_number: selectedEmployee.passport_number || '',
      shift_type: selectedEmployee.shift_type || 'يومي',
      status: selectedEmployee.status || 'active'
    })
    setShowEditForm(true)
  }

  const getFilesByType = (type: string) => files.filter(f => f.file_type === type)
  const activeCount = employees.filter(e => e.status === 'active').length

  const inputStyle = {width:'100%',padding:'9px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:13,boxSizing:'border-box' as const,color:'#111827',background:'#fff',marginBottom:10}

  return (
    <div style={{margin:'24px',fontFamily:'system-ui',direction:'rtl'}}>

      {!selectedEmployee ? (
        // قائمة الموظفين
        <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
          <div style={{padding:'16px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div>
              <h2 style={{margin:0,fontSize:17,fontWeight:700,color:'#111827'}}>👥 سجلات الموظفين</h2>
              <div style={{fontSize:13,color:'#6b7280',marginTop:2}}>إجمالي: <strong>{employees.length}</strong> — نشطون: <strong style={{color:'#15803d'}}>{activeCount}</strong></div>
            </div>
            {!readOnly && (
              <button onClick={()=>setShowAddForm(!showAddForm)}
                style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:14,fontWeight:600}}>
                {showAddForm ? 'إلغاء' : '+ إضافة موظف'}
              </button>
            )}
          </div>

          {/* نموذج إضافة موظف */}
          {!readOnly && showAddForm && (
            <div style={{padding:'20px',borderBottom:'2px solid #e5e7eb',background:'#f9fafb'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,maxWidth:700}}>
                <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>الاسم *</label><input value={empForm.name} onChange={e=>setEmpForm({...empForm,name:e.target.value})} placeholder="الاسم الكامل" style={inputStyle}/></div>
                <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>المنصب *</label><input value={empForm.job_title} onChange={e=>setEmpForm({...empForm,job_title:e.target.value})} placeholder="المنصب الوظيفي" style={inputStyle}/></div>
                <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>رقم الهاتف</label><input value={empForm.phone} onChange={e=>setEmpForm({...empForm,phone:e.target.value})} placeholder="07xxxxxxxx" style={inputStyle}/></div>
                <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>تاريخ التعيين</label><input type="date" value={empForm.hire_date} onChange={e=>setEmpForm({...empForm,hire_date:e.target.value})} style={inputStyle}/></div>
                <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>الراتب (د.ع)</label><input type="number" value={empForm.salary} onChange={e=>setEmpForm({...empForm,salary:e.target.value})} placeholder="0" style={inputStyle}/></div>
                <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>رقم الجواز</label><input value={empForm.passport_number} onChange={e=>setEmpForm({...empForm,passport_number:e.target.value})} placeholder="اختياري" style={inputStyle}/></div>
                <div>
                  <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>نوع الدوام</label>
                  <select value={empForm.shift_type} onChange={e=>setEmpForm({...empForm,shift_type:e.target.value})} style={inputStyle}>
                    <option value="يومي">يومي</option>
                    <option value="روتيشن">روتيشن</option>
                  </select>
                </div>
                <div>
                  <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>الحالة</label>
                  <select value={empForm.status} onChange={e=>setEmpForm({...empForm,status:e.target.value})} style={inputStyle}>
                    <option value="active">نشط</option>
                    <option value="inactive">غير نشط</option>
                  </select>
                </div>
              </div>
              <button onClick={addEmployee} disabled={loading}
                style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontSize:14,fontWeight:600}}>
                {loading ? 'جارٍ الحفظ...' : 'حفظ الموظف'}
              </button>
            </div>
          )}

          {/* قائمة الموظفين */}
          {loading ? (
            <div style={{textAlign:'center',padding:'3rem',color:'#6b7280'}}>جارٍ التحميل...</div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}>
                <thead>
                  <tr style={{background:'#f3f4f6'}}>
                    <th style={{padding:'12px 16px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>#</th>
                    <th style={{padding:'12px 16px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>الاسم</th>
                    <th style={{padding:'12px 16px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>المنصب</th>
                    <th style={{padding:'12px 16px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>الهاتف</th>
                    <th style={{padding:'12px 16px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>تاريخ التعيين</th>
                    <th style={{padding:'12px 16px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>الحالة</th>
                    <th style={{padding:'12px 16px',borderBottom:'2px solid #e5e7eb'}}></th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp,idx)=>(
                    <tr key={emp.id} style={{borderBottom:'1px solid #e5e7eb',cursor:'pointer'}} onClick={()=>loadEmployeeData(emp)}>
                      <td style={{padding:'12px 16px',color:'#9ca3af'}}>{idx+1}</td>
                      <td style={{padding:'12px 16px',fontWeight:600,color:'#111827'}}>{emp.name}</td>
                      <td style={{padding:'12px 16px',color:'#6b7280'}}>{emp.job_title}</td>
                      <td style={{padding:'12px 16px',color:'#6b7280'}}>{emp.phone || '—'}</td>
                      <td style={{padding:'12px 16px',color:'#6b7280'}}>{emp.hire_date || '—'}</td>
                      <td style={{padding:'12px 16px'}}>
                        <span style={{background:emp.status==='active'?'#dcfce7':'#fee2e2',color:emp.status==='active'?'#15803d':'#dc2626',padding:'3px 10px',borderRadius:20,fontSize:12,fontWeight:600}}>
                          {emp.status==='active'?'نشط':'غير نشط'}
                        </span>
                      </td>
                      <td style={{padding:'12px 16px',color:'#1d4ed8',fontSize:13,fontWeight:600}}>فتح الملف ←</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        // ملف الموظف
        <div>
          {/* رأس ملف الموظف */}
          <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden',marginBottom:16}}>
            <div style={{padding:'16px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <button onClick={()=>{ setSelectedEmployee(null); setShowEditForm(false) }}
                  style={{background:'#e5e7eb',color:'#374151',border:'none',borderRadius:8,padding:'7px 14px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                  ← رجوع
                </button>
                <div>
                  <h2 style={{margin:0,fontSize:17,fontWeight:700,color:'#111827'}}>{selectedEmployee.name}</h2>
                  <div style={{fontSize:13,color:'#6b7280',marginTop:2}}>{selectedEmployee.job_title}</div>
                </div>
              </div>
              {!readOnly && (
                <button onClick={startEdit}
                  style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'7px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                  ✏️ تعديل البيانات
                </button>
              )}
            </div>

            {/* بيانات الموظف */}
            {showEditForm && !readOnly ? (
              <div style={{padding:'20px',borderBottom:'2px solid #e5e7eb',background:'#f9fafb'}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,maxWidth:700}}>
                  <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>الاسم *</label><input value={empForm.name} onChange={e=>setEmpForm({...empForm,name:e.target.value})} style={inputStyle}/></div>
                  <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>المنصب *</label><input value={empForm.job_title} onChange={e=>setEmpForm({...empForm,job_title:e.target.value})} style={inputStyle}/></div>
                  <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>رقم الهاتف</label><input value={empForm.phone} onChange={e=>setEmpForm({...empForm,phone:e.target.value})} style={inputStyle}/></div>
                  <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>تاريخ التعيين</label><input type="date" value={empForm.hire_date} onChange={e=>setEmpForm({...empForm,hire_date:e.target.value})} style={inputStyle}/></div>
                  <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>الراتب (د.ع)</label><input type="number" value={empForm.salary} onChange={e=>setEmpForm({...empForm,salary:e.target.value})} style={inputStyle}/></div>
                  <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>رقم الجواز</label><input value={empForm.passport_number} onChange={e=>setEmpForm({...empForm,passport_number:e.target.value})} style={inputStyle}/></div>
                  <div>
                    <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>نوع الدوام</label>
                    <select value={empForm.shift_type} onChange={e=>setEmpForm({...empForm,shift_type:e.target.value})} style={inputStyle}>
                      <option value="يومي">يومي</option>
                      <option value="روتيشن">روتيشن</option>
                    </select>
                  </div>
                  <div>
                    <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>الحالة</label>
                    <select value={empForm.status} onChange={e=>setEmpForm({...empForm,status:e.target.value})} style={inputStyle}>
                      <option value="active">نشط</option>
                      <option value="inactive">غير نشط</option>
                    </select>
                  </div>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={updateEmployee} disabled={loading}
                    style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                    {loading ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
                  </button>
                  <button onClick={()=>setShowEditForm(false)}
                    style={{background:'#e5e7eb',color:'#374151',border:'none',borderRadius:8,padding:'9px 16px',cursor:'pointer',fontSize:13}}>
                    إلغاء
                  </button>
                </div>
              </div>
            ) : (
              <div style={{padding:'16px 20px',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12}}>
                {[
                  { label: 'الهاتف', value: selectedEmployee.phone },
                  { label: 'تاريخ التعيين', value: selectedEmployee.hire_date },
                  { label: 'الراتب', value: selectedEmployee.salary ? selectedEmployee.salary.toLocaleString('ar-IQ') + ' د.ع' : null },
                  { label: 'رقم الجواز', value: selectedEmployee.passport_number },
                  { label: 'نوع الدوام', value: selectedEmployee.shift_type },
                ].map(item => (
                  <div key={item.label} style={{background:'#f9fafb',borderRadius:8,padding:'10px 14px'}}>
                    <div style={{fontSize:11,color:'#6b7280',fontWeight:600,marginBottom:4}}>{item.label}</div>
                    <div style={{fontSize:14,fontWeight:600,color:'#111827'}}>{item.value || '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* الملفات */}
          <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden',marginBottom:16}}>
            <div style={{padding:'14px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb'}}>
              <h3 style={{margin:0,fontSize:15,fontWeight:700,color:'#111827'}}>📁 ملفات الموظف</h3>
            </div>
            <div style={{padding:'16px 20px',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12}}>
              {fileTypes.map(ft => (
                <div key={ft.key} style={{border:'1px solid #e5e7eb',borderRadius:10,padding:'12px 14px'}}>
                  <div style={{fontSize:13,fontWeight:700,color:'#374151',marginBottom:8}}>{ft.icon} {ft.label}</div>
                  {getFilesByType(ft.key).length === 0 ? (
                    <div style={{fontSize:12,color:'#9ca3af',marginBottom:8}}>لا توجد ملفات</div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:8}}>
                      {getFilesByType(ft.key).map(f => (
                        <div key={f.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'#f9fafb',borderRadius:6,padding:'4px 8px'}}>
                          <a href={f.file_url} target="_blank" rel="noreferrer"
                            style={{fontSize:12,color:'#1d4ed8',textDecoration:'none',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:120}}>
                            📄 {f.file_name}
                          </a>
                          {!readOnly && (
                            <button onClick={()=>deleteFile(f.id, f.file_url)}
                              style={{background:'none',border:'none',color:'#dc2626',cursor:'pointer',fontSize:13,padding:'0 4px'}}>✕</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {!readOnly && (
                    <label style={{display:'inline-flex',alignItems:'center',gap:4,background:'#eff6ff',color:'#1d4ed8',border:'1px dashed #93c5fd',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:11,fontWeight:500}}>
                      {uploading === ft.key ? '⏳...' : '📎 رفع'}
                      <input type="file" style={{display:'none'}} onChange={e=>handleFileUpload(ft.key, e)} disabled={uploading !== null}/>
                    </label>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* الملاحظات */}
          <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
            <div style={{padding:'14px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb'}}>
              <h3 style={{margin:0,fontSize:15,fontWeight:700,color:'#111827'}}>📝 الملاحظات</h3>
            </div>
            <div style={{padding:'16px 20px'}}>
              {!readOnly && (
                <div style={{display:'flex',gap:8,marginBottom:16}}>
                  <input value={newNote} onChange={e=>setNewNote(e.target.value)}
                    placeholder="أضف ملاحظة..." onKeyDown={e=>e.key==='Enter'&&addNote()}
                    style={{flex:1,padding:'9px 14px',borderRadius:8,border:'2px solid #d1d5db',fontSize:13,color:'#111827'}}/>
                  <button onClick={addNote}
                    style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                    إضافة
                  </button>
                </div>
              )}
              {notes.length === 0 ? (
                <div style={{textAlign:'center',padding:'2rem',color:'#9ca3af',fontSize:14}}>لا توجد ملاحظات</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {notes.map(n => (
                    <div key={n.id} style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',background:'#fef9c3',borderRadius:8,padding:'10px 14px',gap:8}}>
                      <div>
                        <div style={{fontSize:14,color:'#111827'}}>{n.note}</div>
                        <div style={{fontSize:11,color:'#9ca3af',marginTop:4}}>{new Date(n.created_at).toLocaleDateString('ar-IQ')}</div>
                      </div>
                      {!readOnly && (
                        <button onClick={()=>deleteNote(n.id)}
                          style={{background:'none',border:'none',color:'#dc2626',cursor:'pointer',fontSize:14,flexShrink:0}}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
