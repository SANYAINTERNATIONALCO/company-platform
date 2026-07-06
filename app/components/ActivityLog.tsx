'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

interface ActivityEntry {
  id: string
  user_email: string
  user_role: string
  action: string
  section: string
  details: string
  created_at: string
}

interface LoginEntry {
  email: string
  last_sign_in_at: string | null
  created_at: string
}

const sectionLabel: Record<string, string> = {
  employees: 'الموظفين',
  attendance: 'الحضور',
  finance: 'الحسابات',
  receipts: 'الوصولات',
  visa: 'التأشيرات',
  payroll: 'الرواتب',
  tasks: 'المهام',
  auth: 'تسجيل الدخول',
}

const actionColor = (action: string) => {
  if (action.includes('حذف')) return { bg: '#fee2e2', color: '#dc2626' }
  if (action.includes('أرشف') || action.includes('حفظ كشف')) return { bg: '#dbeafe', color: '#1d4ed8' }
  if (action.includes('توقيع')) return { bg: '#ede9fe', color: '#7c3aed' }
  if (action.includes('تعديل')) return { bg: '#fef9c3', color: '#b45309' }
  return { bg: '#f3f4f6', color: '#374151' }
}

export default function ActivityLog() {
  const [activeTab, setActiveTab] = useState<'activity' | 'logins'>('activity')
  const [activities, setActivities] = useState<ActivityEntry[]>([])
  const [logins, setLogins] = useState<LoginEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [sectionFilter, setSectionFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    loadActivities()
    loadLogins()
  }, [])

  async function loadActivities() {
    setLoading(true)
    const { data } = await supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
    setActivities((data as ActivityEntry[]) || [])
    setLoading(false)
  }

  async function loadLogins() {
    const { data } = await supabase
      .from('user_roles')
      .select('user_id, role')
    const userIds = (data || []).map((r: any) => r.user_id)
    if (userIds.length === 0) return
    const { data: users } = await supabase.auth.admin?.listUsers?.() || { data: null }
    if (!users) {
      // Fallback: use activity_log for login entries
      const { data: loginData } = await supabase
        .from('activity_log')
        .select('*')
        .eq('section', 'auth')
        .order('created_at', { ascending: false })
      setLogins((loginData || []).map((l: any) => ({
        email: l.user_email,
        last_sign_in_at: l.created_at,
        created_at: l.created_at
      })))
      return
    }
    setLogins(users.users?.map((u: any) => ({
      email: u.email,
      last_sign_in_at: u.last_sign_in_at,
      created_at: u.created_at
    })) || [])
  }

  function formatDateTime(d: string) {
    return new Date(d).toLocaleString('ar-IQ', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
  }

  const filteredActivities = activities.filter(a => {
    if (sectionFilter && a.section !== sectionFilter) return false
    if (dateFrom && new Date(a.created_at) < new Date(dateFrom)) return false
    if (dateTo) { const to = new Date(dateTo); to.setHours(23,59,59,999); if (new Date(a.created_at) > to) return false }
    return true
  })

  return (
    <div style={{margin:'24px',fontFamily:'system-ui',direction:'rtl'}}>
      {/* تبويبات */}
      <div style={{display:'flex',gap:6,marginBottom:16,background:'#e5e7eb',padding:4,borderRadius:10,width:'fit-content'}}>
        <button onClick={()=>setActiveTab('activity')}
          style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
            background:activeTab==='activity'?'#fff':'transparent',color:activeTab==='activity'?'#1e40af':'#6b7280',
            boxShadow:activeTab==='activity'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
          سجل النشاطات
        </button>
        <button onClick={()=>setActiveTab('logins')}
          style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
            background:activeTab==='logins'?'#fff':'transparent',color:activeTab==='logins'?'#1e40af':'#6b7280',
            boxShadow:activeTab==='logins'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
          سجل الدخول
        </button>
      </div>

      {/* سجل النشاطات */}
      {activeTab === 'activity' && (
        <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
          <div style={{padding:'14px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <h2 style={{margin:0,fontSize:16,fontWeight:700,color:'#111827'}}>سجل النشاطات</h2>
            <select value={sectionFilter} onChange={e=>setSectionFilter(e.target.value)}
              style={{padding:'7px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:12,color:'#374151',background:'#fff'}}>
              <option value="">كل الأقسام</option>
              {Object.entries(sectionLabel).filter(([k])=>k!=='auth').map(([k,v])=>(
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <label style={{fontSize:12,color:'#6b7280'}}>من:</label>
              <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                style={{padding:'7px 10px',borderRadius:8,border:'2px solid #d1d5db',fontSize:12,color:'#111827'}}/>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <label style={{fontSize:12,color:'#6b7280'}}>إلى:</label>
              <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                style={{padding:'7px 10px',borderRadius:8,border:'2px solid #d1d5db',fontSize:12,color:'#111827'}}/>
            </div>
            {(sectionFilter||dateFrom||dateTo) && (
              <button onClick={()=>{setSectionFilter('');setDateFrom('');setDateTo('')}}
                style={{background:'#f3f4f6',color:'#6b7280',border:'none',borderRadius:8,padding:'7px 12px',cursor:'pointer',fontSize:12}}>
                مسح
              </button>
            )}
            <span style={{fontSize:12,color:'#9ca3af',marginRight:'auto'}}>{filteredActivities.length} نشاط</span>
          </div>

          {loading ? (
            <div style={{textAlign:'center',padding:'3rem',color:'#6b7280'}}>جارٍ التحميل...</div>
          ) : filteredActivities.length === 0 ? (
            <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لا توجد نشاطات مسجّلة</div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead>
                  <tr style={{background:'#f3f4f6'}}>
                    {['التاريخ والوقت','المستخدم','القسم','النشاط','التفاصيل'].map(h=>(
                      <th key={h} style={{padding:'10px 14px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredActivities.map(a => {
                    const ac = actionColor(a.action)
                    return (
                      <tr key={a.id} style={{borderBottom:'1px solid #e5e7eb'}}>
                        <td style={{padding:'10px 14px',color:'#6b7280',fontSize:12,whiteSpace:'nowrap'}}>{formatDateTime(a.created_at)}</td>
                        <td style={{padding:'10px 14px'}}>
                          <div style={{fontWeight:600,color:'#111827',fontSize:12}}>{a.user_email}</div>
                          <div style={{fontSize:11,color:'#9ca3af'}}>{a.user_role}</div>
                        </td>
                        <td style={{padding:'10px 14px'}}>
                          <span style={{background:'#f3f4f6',color:'#374151',padding:'3px 8px',borderRadius:20,fontSize:11,fontWeight:600}}>
                            {sectionLabel[a.section] || a.section}
                          </span>
                        </td>
                        <td style={{padding:'10px 14px'}}>
                          <span style={{background:ac.bg,color:ac.color,padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700}}>
                            {a.action}
                          </span>
                        </td>
                        <td style={{padding:'10px 14px',color:'#6b7280',fontSize:12,maxWidth:250}}>{a.details || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* سجل الدخول */}
      {activeTab === 'logins' && (
        <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
          <div style={{padding:'14px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb'}}>
            <h2 style={{margin:0,fontSize:16,fontWeight:700,color:'#111827'}}>سجل الدخول</h2>
          </div>
          {logins.length === 0 ? (
            <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لا توجد بيانات دخول</div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead>
                  <tr style={{background:'#f3f4f6'}}>
                    {['البريد الإلكتروني','آخر دخول','تاريخ إنشاء الحساب'].map(h=>(
                      <th key={h} style={{padding:'10px 14px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logins.map((l,i) => (
                    <tr key={i} style={{borderBottom:'1px solid #e5e7eb'}}>
                      <td style={{padding:'10px 14px',fontWeight:600,color:'#111827'}}>{l.email}</td>
                      <td style={{padding:'10px 14px',color:'#6b7280'}}>{l.last_sign_in_at ? formatDateTime(l.last_sign_in_at) : '—'}</td>
                      <td style={{padding:'10px 14px',color:'#6b7280'}}>{formatDateTime(l.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{padding:'12px 20px',background:'#f9fafb',borderTop:'1px solid #e5e7eb',fontSize:12,color:'#9ca3af'}}>
            ملاحظة: يعرض آخر تسجيل دخول لكل مستخدم. للتاريخ الكامل لكل دخول، راجع تبويب "سجل النشاطات".
          </div>
        </div>
      )}
    </div>
  )
}
