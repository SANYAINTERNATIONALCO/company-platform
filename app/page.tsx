'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Finance from './components/Finance'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

const formatDate = (dateStr) => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

const monthLabel = (m) => {
  const [year, month] = m.split('-')
  const names = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
  return names[parseInt(month) - 1] + ' ' + year
}

export default function Home() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [activeSection, setActiveSection] = useState('attendance')
  const [viewMode, setViewMode] = useState('daily')
  const [employees, setEmployees] = useState([])
  const [statuses, setStatuses] = useState({})
  const [savedToday, setSavedToday] = useState({})
  const [monthlySummaryList, setMonthlySummaryList] = useState([])
  const [availableMonths, setAvailableMonths] = useState([])
  const [selectedMonth, setSelectedMonth] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user) loadRole()
  }, [user])

  useEffect(() => {
    if (userRole) {
      if (userRole === 'accountant') setActiveSection('finance')
      else loadEmployees()
    }
  }, [userRole])

  useEffect(() => {
    if (user && employees.length > 0 && viewMode === 'daily' && selectedDate) {
      loadExistingRecords(selectedDate)
    }
  }, [selectedDate, employees, viewMode])

  useEffect(() => {
    if (viewMode === 'monthly' && user) loadAvailableMonths()
  }, [viewMode])

  useEffect(() => {
    if (selectedMonth) loadMonthlySummary(selectedMonth)
  }, [selectedMonth])

  async function login() {
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('خطأ: ' + error.message)
    else setUser(data.user)
    setLoading(false)
  }

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
    setUserRole(null)
  }

  async function loadRole() {
    const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single()
    if (data) setUserRole(data.role)
    else setUserRole('viewer')
  }

  async function loadEmployees() {
    const { data } = await supabase.from('employees').select('*').order('name')
    setEmployees(data || [])
    const t = new Date().toISOString().split('T')[0]
    setSelectedDate(t)
  }

  async function loadExistingRecords(date) {
    const { data } = await supabase.from('attendance_records').select('*').eq('record_date', date)
    const existing = {}
    const saved = {}
    if (data) { data.forEach(r => { existing[r.employee_id] = r.status; saved[r.employee_id] = r.status }) }
    setStatuses(existing)
    setSavedToday(saved)
  }

  async function loadAvailableMonths() {
    const { data } = await supabase.from('attendance_records').select('record_date').order('record_date', { ascending: false })
    if (data) {
      const months = [...new Set(data.map(r => r.record_date.slice(0, 7)))]
      setAvailableMonths(months)
      if (months.length > 0 && !selectedMonth) setSelectedMonth(months[0])
    }
  }

  async function loadMonthlySummary(month) {
    setLoading(true)
    const { data } = await supabase.from('monthly_attendance_summary').select('*').eq('الشهر', month)
    setMonthlySummaryList(data || [])
    setLoading(false)
  }

  async function saveAll() {
    const unsaved = employees.filter(emp => statuses[emp.id] && statuses[emp.id] !== savedToday[emp.id])
    if (unsaved.length === 0) { alert('لا توجد تغييرات جديدة للحفظ'); return }
    setSaving(true)
    for (const emp of unsaved) {
      const { error } = await supabase.from('attendance_records').upsert({
        employee_id: emp.id, record_date: selectedDate, status: statuses[emp.id]
      }, { onConflict: 'employee_id,record_date' })
      if (error) { alert('خطأ في حفظ ' + emp.name + ': ' + error.message); setSaving(false); return }
    }
    await loadExistingRecords(selectedDate)
await loadAvailableMonths()
setSaving(false)
alert('تم حفظ ' + unsaved.length + ' سجل بنجاح ✓')
  }

  const statusColor = (s) => {
    if (!s) return { background: '#f3f4f6', color: '#9ca3af' }
    if (['حاضر', 'روتيشن'].includes(s)) return { background: '#dcfce7', color: '#15803d' }
    if (s === 'يوم جمعة') return { background: '#dbeafe', color: '#1d4ed8' }
    if (s === 'غائب') return { background: '#fee2e2', color: '#dc2626' }
    return { background: '#fef9c3', color: '#b45309' }
  }

  const unsavedCount = employees.filter(emp => statuses[emp.id] && statuses[emp.id] !== savedToday[emp.id]).length
  const isReadOnly = userRole === 'admin'
  const canSeeAttendance = ['editor', 'admin'].includes(userRole)
  const canSeeFinance = ['editor', 'admin', 'accountant'].includes(userRole)
  const roleLabel = { editor: '✏️ محرر', admin: '👁️ مدير', accountant: '💼 محاسب' }

  const monthlyCols = ['الاسم','الشهر','أيام الدوام','روتيشن','ايام الجمعه','عدد ايام الغياب','إجازة مرضية','إجازة طارئة','إجازة اعتيادية','عطلة رسمية','مجموع الايام']

  if (!user) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f0f4f8',fontFamily:'system-ui',direction:'rtl'}}>
      <div style={{background:'#fff',borderRadius:16,padding:'2.5rem',width:360,boxShadow:'0 8px 32px rgba(0,0,0,0.12)',border:'1px solid #e5e7eb'}}>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:40,marginBottom:8}}>🏢</div>
          <h1 style={{margin:'0 0 4px',fontSize:22,fontWeight:700,color:'#111827'}}>منصة الشركة</h1>
          <p style={{margin:0,color:'#6b7280',fontSize:14}}>SANYA INTERNATIONAL CO.</p>
        </div>
        {error && <div style={{background:'#fef2f2',color:'#dc2626',padding:'10px 14px',borderRadius:8,marginBottom:16,fontSize:13,border:'1px solid #fca5a5'}}>{error}</div>}
        <div style={{marginBottom:12}}>
          <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>البريد الإلكتروني</label>
          <input value={email} onChange={e=>setEmail(e.target.value)}
            style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'2px solid #d1d5db',fontSize:14,boxSizing:'border-box',direction:'ltr',color:'#111827'}}/>
        </div>
        <div style={{marginBottom:20}}>
          <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>كلمة المرور</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
            style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'2px solid #d1d5db',fontSize:14,boxSizing:'border-box',direction:'ltr',color:'#111827'}}/>
        </div>
        <button onClick={login} disabled={loading}
          style={{width:'100%',padding:'12px',borderRadius:8,background:'#1e40af',color:'#fff',border:'none',fontSize:15,fontWeight:700,cursor:'pointer'}}>
          {loading ? 'جارٍ الدخول...' : 'تسجيل الدخول'}
        </button>
      </div>
    </div>
  )

  if (!userRole) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f0f4f8'}}>
      <div style={{color:'#6b7280',fontSize:15}}>جارٍ تحميل الصلاحيات...</div>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:'#f0f4f8',fontFamily:'system-ui',direction:'rtl'}}>
      <div style={{background:'#1e40af',padding:'0 24px',display:'flex',alignItems:'center',justifyContent:'space-between',height:56}}>
        <div style={{display:'flex',alignItems:'center',gap:24}}>
          <span style={{fontWeight:700,fontSize:17,color:'#fff'}}>🏢 SANYA INTERNATIONAL CO.</span>
          <div style={{display:'flex',gap:4}}>
            {canSeeAttendance && (
              <button onClick={()=>setActiveSection('attendance')}
                style={{padding:'6px 16px',fontSize:13,border:'none',borderRadius:6,cursor:'pointer',fontWeight:600,
                  background:activeSection==='attendance'?'rgba(255,255,255,0.25)':'transparent',color:'#fff'}}>
                📅 الحضور
              </button>
            )}
            {canSeeFinance && (
              <button onClick={()=>setActiveSection('finance')}
                style={{padding:'6px 16px',fontSize:13,border:'none',borderRadius:6,cursor:'pointer',fontWeight:600,
                  background:activeSection==='finance'?'rgba(255,255,255,0.25)':'transparent',color:'#fff'}}>
                💰 المصاريف
              </button>
            )}
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:12,background:'rgba(255,255,255,0.2)',padding:'4px 10px',borderRadius:20,color:'#fff',fontWeight:600}}>
            {roleLabel[userRole]}
          </span>
          <button onClick={logout} style={{background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',borderRadius:8,padding:'6px 16px',cursor:'pointer',fontSize:13,color:'#fff'}}>خروج</button>
        </div>
      </div>

      {activeSection === 'finance' && <Finance readOnly={isReadOnly} />}

      {activeSection === 'attendance' && canSeeAttendance && (
        <div style={{margin:'24px',background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
          <div style={{padding:'16px 20px',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,background:'#f9fafb'}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <h2 style={{margin:0,fontSize:17,fontWeight:700,color:'#111827'}}>نظام إدارة الأفراد</h2>
              <div style={{display:'flex',gap:6,background:'#e5e7eb',padding:4,borderRadius:8}}>
                <button onClick={()=>setViewMode('daily')}
                  style={{padding:'6px 14px',fontSize:13,border:'none',borderRadius:6,cursor:'pointer',fontWeight:600,
                    background:viewMode==='daily'?'#fff':'transparent',color:viewMode==='daily'?'#1e40af':'#6b7280',
                    boxShadow:viewMode==='daily'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
                  📅 التسجيل اليومي
                </button>
                <button onClick={()=>setViewMode('monthly')}
                  style={{padding:'6px 14px',fontSize:13,border:'none',borderRadius:6,cursor:'pointer',fontWeight:600,
                    background:viewMode==='monthly'?'#fff':'transparent',color:viewMode==='monthly'?'#1e40af':'#6b7280',
                    boxShadow:viewMode==='monthly'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
                  📊 الموقف الشهري
                </button>
              </div>
            </div>

            {viewMode === 'daily' && (
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <label style={{fontSize:13,fontWeight:600,color:'#374151'}}>التاريخ:</label>
                  <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}
                    style={{padding:'7px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:13,color:'#111827',background:'#fff'}}/>
                </div>
                {!isReadOnly && (
                  <button onClick={saveAll} disabled={saving || unsavedCount === 0}
                    style={{background:unsavedCount>0?'#16a34a':'#9ca3af',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:unsavedCount>0?'pointer':'default',fontSize:14,fontWeight:600}}>
                    {saving ? 'جارٍ الحفظ...' : unsavedCount > 0 ? `💾 حفظ الكل (${unsavedCount})` : '✓ محفوظ'}
                  </button>
                )}
              </div>
            )}

            {viewMode === 'monthly' && availableMonths.length > 0 && (
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <label style={{fontSize:13,fontWeight:600,color:'#374151'}}>الشهر:</label>
                <select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}
                  style={{padding:'7px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:13,color:'#111827',background:'#fff',fontWeight:500}}>
                  {availableMonths.map(m=>(
                    <option key={m} value={m}>{monthLabel(m)}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {viewMode === 'daily' && selectedDate && (
            <div style={{padding:'12px 20px',background:'#eff6ff',borderBottom:'1px solid #dbeafe',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:14,color:'#1d4ed8',fontWeight:600}}>📅 {formatDate(selectedDate)}</span>
              <div style={{display:'flex',gap:12,alignItems:'center'}}>
                {!isReadOnly && unsavedCount > 0 && <span style={{fontSize:13,color:'#d97706',fontWeight:500}}>⚠️ يوجد {unsavedCount} تغيير غير محفوظ</span>}
                {isReadOnly && <span style={{fontSize:12,color:'#6b7280'}}>👁️ وضع القراءة فقط</span>}
              </div>
            </div>
          )}

          {viewMode === 'daily' ? (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}>
                <thead>
                  <tr style={{background:'#f3f4f6'}}>
                    <th style={{padding:'12px 16px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',width:40}}>#</th>
                    <th style={{padding:'12px 16px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>الموظف</th>
                    <th style={{padding:'12px 16px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>المنصب</th>
                    <th style={{padding:'12px 16px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp,idx)=>(
                    <tr key={emp.id} style={{borderBottom:'1px solid #e5e7eb',background:statuses[emp.id]?'#fff':'#fafafa'}}>
                      <td style={{padding:'12px 16px',color:'#9ca3af',fontSize:13}}>{idx+1}</td>
                      <td style={{padding:'12px 16px',fontWeight:600,color:'#111827'}}>{emp.name}</td>
                      <td style={{padding:'12px 16px',color:'#6b7280',fontSize:13}}>{emp.job_title}</td>
                      <td style={{padding:'12px 16px'}}>
                        {isReadOnly ? (
                          <span style={{...statusColor(statuses[emp.id]),padding:'5px 14px',borderRadius:20,fontSize:13,fontWeight:600}}>
                            {statuses[emp.id] || '— لم يسجل —'}
                          </span>
                        ) : (
                          <select value={statuses[emp.id]||''} onChange={e=>setStatuses({...statuses,[emp.id]:e.target.value})}
                            style={{padding:'7px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:13,color:'#111827',background:'#fff',cursor:'pointer',fontWeight:500,...(statuses[emp.id]?statusColor(statuses[emp.id]):{})}} >
                            <option value="">— اختر الحالة —</option>
                            <option value="حاضر">✅ حاضر</option>
                            <option value="روتيشن">🔄 روتيشن</option>
                            <option value="يوم جمعة">🕌 يوم جمعة</option>
                            <option value="غائب">❌ غائب</option>
                            <option value="إجازة مرضية">🏥 إجازة مرضية</option>
                            <option value="إجازة طارئة">⚡ إجازة طارئة</option>
                            <option value="إجازة اعتيادية">🌴 إجازة اعتيادية</option>
                            <option value="عطلة رسمية">🎉 عطلة رسمية</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!isReadOnly && (
                <div style={{padding:'16px 20px',borderTop:'2px solid #e5e7eb',display:'flex',justifyContent:'flex-end',background:'#f9fafb'}}>
                  <button onClick={saveAll} disabled={saving||unsavedCount===0}
                    style={{background:unsavedCount>0?'#16a34a':'#9ca3af',color:'#fff',border:'none',borderRadius:8,padding:'10px 28px',cursor:unsavedCount>0?'pointer':'default',fontSize:15,fontWeight:700}}>
                    {saving?'جارٍ الحفظ...':unsavedCount>0?`💾 حفظ الكل (${unsavedCount})`:'✓ جميع السجلات محفوظة'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div>
              {availableMonths.length === 0 ? (
                <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لا توجد بيانات بعد</div>
              ) : loading ? (
                <div style={{textAlign:'center',padding:'3rem',color:'#6b7280',fontSize:14}}>جارٍ تحميل البيانات...</div>
              ) : monthlySummaryList.length === 0 ? (
                <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لا توجد بيانات لهذا الشهر</div>
              ) : (
                <div>
                  <div style={{padding:'12px 20px',background:'#eff6ff',borderBottom:'1px solid #dbeafe'}}>
                    <span style={{fontSize:14,color:'#1d4ed8',fontWeight:600}}>📊 تقرير شهر {monthLabel(selectedMonth)}</span>
                  </div>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}>
                      <thead>
                        <tr style={{background:'#f3f4f6'}}>
                          {monthlyCols.map(h=>(
                            <th key={h} style={{padding:'12px 16px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {monthlySummaryList.map((row,idx)=>(
                          <tr key={idx} style={{borderBottom:'1px solid #e5e7eb'}}>
                            <td style={{padding:'12px 16px',fontWeight:600,color:'#111827'}}>{row['الاسم']}</td>
                            <td style={{padding:'12px 16px',color:'#6b7280'}}>{monthLabel(row['الشهر'])}</td>
                            <td style={{padding:'12px 16px',textAlign:'center',color:'#15803d',fontWeight:700}}>{row['أيام الدوام']}</td>
                            <td style={{padding:'12px 16px',textAlign:'center',color:'#0891b2'}}>{row['روتيشن']}</td>
                            <td style={{padding:'12px 16px',textAlign:'center',color:'#1d4ed8'}}>{row['ايام الجمعه']}</td>
                            <td style={{padding:'12px 16px',textAlign:'center',color:'#dc2626',fontWeight:700}}>{row['عدد ايام الغياب']}</td>
                            <td style={{padding:'12px 16px',textAlign:'center'}}>{row['إجازة مرضية']}</td>
                            <td style={{padding:'12px 16px',textAlign:'center'}}>{row['إجازة طارئة']}</td>
                            <td style={{padding:'12px 16px',textAlign:'center'}}>{row['إجازة اعتيادية']}</td>
                            <td style={{padding:'12px 16px',textAlign:'center'}}>{row['عطلة رسمية']}</td>
                            <td style={{padding:'12px 16px',textAlign:'center',fontWeight:700,background:'#f9fafb'}}>{row['مجموع الايام']}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
