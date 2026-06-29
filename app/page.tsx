'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Attendance from './components/Attendance'
import Finance from './components/Finance'
import Receipts from './components/Receipts'
import Visa from './components/Visa'
import Employees from './components/Employees'
import Payroll from './components/Payroll'
import Tasks from './components/Tasks'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

const LOGO_URL = 'https://idsedrnuopflzepasmvc.supabase.co/storage/v1/object/public/assets/upscalemedia-transformed.png'

export default function Home() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [financeTab, setFinanceTab] = useState<'expenses' | 'receipts'>('expenses')
  const [visaAlerts, setVisaAlerts] = useState<{ touristViolated: number; touristWarning: number; annualViolated: number; annualWarning: number }>({ touristViolated: 0, touristWarning: 0, annualViolated: 0, annualWarning: 0 })
  const [taskAlerts, setTaskAlerts] = useState<{ unseen: number; overdue: number }>({ unseen: 0, overdue: 0 })

  useEffect(() => { if (user) loadRole() }, [user])

  useEffect(() => {
    if (userRole === 'editor' || userRole === 'admin') loadVisaAlerts()
  }, [userRole])

  useEffect(() => {
    if (user && userRole) loadTaskAlerts()
  }, [user, userRole])

  async function loadTaskAlerts() {
    if (!user) return
    const { data } = await supabase.from('tasks').select('is_seen, status, due_date').eq('assigned_to', user.id)
    const today = new Date(new Date().toDateString())
    let unseen = 0, overdue = 0
    ;(data || []).forEach((t: any) => {
      if (!t.is_seen) unseen++
      if (t.status !== 'completed' && t.due_date && new Date(t.due_date) < today) overdue++
    })
    setTaskAlerts({ unseen, overdue })
  }

  async function loadVisaAlerts() {
    const today = new Date(); today.setHours(0,0,0,0)
    const { data: tourist } = await supabase.from('tourist_visas').select('expiry_date, status')
    const { data: annual } = await supabase.from('annual_visas').select('expiry_date, status')

    let touristViolated = 0, touristWarning = 0, annualViolated = 0, annualWarning = 0

    ;(tourist || []).forEach((v: { expiry_date: string; status: string }) => {
      const expiry = new Date(v.expiry_date); expiry.setHours(0,0,0,0)
      const days = Math.ceil((expiry.getTime() - today.getTime()) / (1000*60*60*24))
      if (days <= 0 || v.status === 'violated') touristViolated++
      else if (days <= 7) touristWarning++
    })

    ;(annual || []).forEach((v: { expiry_date: string; status: string }) => {
      const expiry = new Date(v.expiry_date); expiry.setHours(0,0,0,0)
      const days = Math.ceil((expiry.getTime() - today.getTime()) / (1000*60*60*24))
      if (days <= 0 || v.status === 'violated') annualViolated++
      else if (days <= 120) annualWarning++
    })

    setVisaAlerts({ touristViolated, touristWarning, annualViolated, annualWarning })
  }

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
    setActiveSection(null)
  }

  async function loadRole() {
    if (!user) return
    const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single()
    if (data) setUserRole(data.role)
    else setUserRole('viewer')
  }

  const isReadOnly = ['admin', 'guest_1', 'guest_2'].includes(userRole || '')
  const roleLabel: Record<string, string> = { editor: 'محرر', admin: 'مدير', accountant: 'محاسب', guest_1: 'ضيف 1', guest_2: 'ضيف 2' }

  const sections = [
    { id: 'tasks', label: 'المهام', desc: 'مهامك ومتابعة التكليفات', icon: 'TASK', color: '#dc2626', bg: '#fee2e2', show: ['editor','admin','accountant','guest_1','guest_2'] },
    { id: 'employees', label: 'الموظفين', desc: 'سجلات وملفات الموظفين', icon: 'EMP', color: '#7c3aed', bg: '#ede9fe', show: ['editor','admin','guest_1','guest_2'] },
    { id: 'attendance', label: 'الحضور', desc: 'التسجيل اليومي والموقف الشهري', icon: 'ATT', color: '#1e40af', bg: '#dbeafe', show: ['editor','admin','guest_1','guest_2'] },
    { id: 'finance', label: 'الحسابات', desc: 'المصاريف والوصولات', icon: 'FIN', color: '#15803d', bg: '#dcfce7', show: ['editor','admin','accountant','guest_1','guest_2'] },
    { id: 'payroll', label: 'الرواتب', desc: 'كشوف رواتب الموظفين الشهرية', icon: 'PAY', color: '#0891b2', bg: '#cffafe', show: ['editor','admin','guest_1','guest_2'] },
    { id: 'visa', label: 'التأشيرات', desc: 'إحصائيات الأجانب والتأشيرات السياحية', icon: 'VISA', color: '#b45309', bg: '#fef9c3', show: ['editor','admin','guest_1','guest_2'] },
  ]

  const visibleSections = sections.filter(s => s.show.includes(userRole || ''))

  const iconSvg = (type: string, color: string) => {
    const icons: Record<string, React.ReactElement> = {
      EMP: (
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <circle cx="9" cy="7" r="3.2" stroke={color} strokeWidth="1.8"/>
          <path d="M3.5 19c0-3.3 2.6-5.8 5.8-5.8h.4c3.2 0 5.8 2.5 5.8 5.8" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
          <circle cx="17" cy="8.5" r="2.4" stroke={color} strokeWidth="1.6" opacity="0.6"/>
          <path d="M14.8 19c.2-2.4 1.8-4.2 3.9-4.2.4 0 .8.05 1.1.15" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity="0.6"/>
        </svg>
      ),
      ATT: (
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <rect x="3.5" y="4.5" width="17" height="16" rx="2.2" stroke={color} strokeWidth="1.8"/>
          <path d="M3.5 9.5h17" stroke={color} strokeWidth="1.8"/>
          <path d="M8 3v3M16 3v3" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M7.5 13.5l2 2 4-4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      FIN: (
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="1.8"/>
          <path d="M12 7.5v9M9.5 9.7c0-1.1 1.1-1.9 2.5-1.9s2.5.8 2.5 1.7c0 2.4-5 1.1-5 3.5 0 1 1.1 1.7 2.5 1.7s2.5-.7 2.5-1.8" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      ),
      VISA: (
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <rect x="2.5" y="5.5" width="19" height="13" rx="2" stroke={color} strokeWidth="1.8"/>
          <circle cx="8" cy="12" r="2.2" stroke={color} strokeWidth="1.6"/>
          <path d="M13.5 10h6M13.5 14h4" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      ),
      PAY: (
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="6" width="18" height="13" rx="2" stroke={color} strokeWidth="1.8"/>
          <path d="M3 10h18" stroke={color} strokeWidth="1.8"/>
          <circle cx="8" cy="14.5" r="1.6" fill={color}/>
          <path d="M13 14.5h5" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      ),
      TASK: (
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="3.5" width="16" height="17" rx="2" stroke={color} strokeWidth="1.8"/>
          <path d="M8 8h8M8 12h8M8 16h5" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
          <path d="M7 3.5v-1M17 3.5v-1" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      ),
    }
    return icons[type] || null
  }

  // صفحة تسجيل الدخول
  if (!user) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg, #0f2557 0%, #1e40af 50%, #2563eb 100%)',fontFamily:'system-ui',direction:'rtl',padding:20}}>
      <div style={{background:'#fff',borderRadius:20,padding:'2.5rem',width:380,maxWidth:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
        <div style={{textAlign:'center',marginBottom:28}}>
          <img src={LOGO_URL} alt="Sanya International Company"
            style={{width:140,height:140,objectFit:'contain',marginBottom:8}}
            onError={(e)=>{ (e.target as HTMLImageElement).style.display='none' }}/>
          <h1 style={{margin:'0 0 4px',fontSize:22,fontWeight:700,color:'#111827'}}>منصة الشركة</h1>
          <p style={{margin:0,color:'#6b7280',fontSize:14}}>Sanya International Company</p>
        </div>
        {error && <div style={{background:'#fef2f2',color:'#dc2626',padding:'10px 14px',borderRadius:8,marginBottom:16,fontSize:13,border:'1px solid #fca5a5'}}>{error}</div>}
        <div style={{marginBottom:12}}>
          <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>البريد الإلكتروني</label>
          <input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()}
            style={{width:'100%',padding:'11px 14px',borderRadius:10,border:'2px solid #e5e7eb',fontSize:14,boxSizing:'border-box',direction:'ltr',color:'#111827',outline:'none'}}/>
        </div>
        <div style={{marginBottom:24}}>
          <label style={{display:'block',marginBottom:6,fontSize:13,fontWeight:600,color:'#374151'}}>كلمة المرور</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()}
            style={{width:'100%',padding:'11px 14px',borderRadius:10,border:'2px solid #e5e7eb',fontSize:14,boxSizing:'border-box',direction:'ltr',color:'#111827',outline:'none'}}/>
        </div>
        <button onClick={login} disabled={loading}
          style={{width:'100%',padding:'13px',borderRadius:10,background:'linear-gradient(135deg,#1e40af,#3b82f6)',color:'#fff',border:'none',fontSize:15,fontWeight:700,cursor:'pointer',boxShadow:'0 4px 12px rgba(30,64,175,0.4)'}}>
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
      {/* الشريط العلوي */}
      <div style={{background:'#0f2557',padding:'0 24px',display:'flex',alignItems:'center',justifyContent:'space-between',height:60,boxShadow:'0 2px 10px rgba(0,0,0,0.2)'}}>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <img src={LOGO_URL} alt="" style={{width:34,height:34,objectFit:'contain'}}
            onError={(e)=>{ (e.target as HTMLImageElement).style.display='none' }}/>
          <span style={{fontWeight:700,fontSize:16,color:'#fff',letterSpacing:0.3}}>Sanya International Company</span>
          {activeSection && (
            <button onClick={()=>setActiveSection(null)}
              style={{background:'rgba(255,255,255,0.12)',border:'1px solid rgba(255,255,255,0.2)',borderRadius:6,padding:'6px 14px',cursor:'pointer',fontSize:13,color:'#fff',fontWeight:500}}>
              ← الرئيسية
            </button>
          )}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:12,background:'rgba(255,255,255,0.15)',padding:'5px 12px',borderRadius:20,color:'#fff',fontWeight:600,border:'1px solid rgba(255,255,255,0.2)'}}>
            {roleLabel[userRole] || userRole}
          </span>
          <button onClick={logout} style={{background:'rgba(255,255,255,0.12)',border:'1px solid rgba(255,255,255,0.25)',borderRadius:8,padding:'7px 16px',cursor:'pointer',fontSize:13,color:'#fff',fontWeight:500}}>خروج</button>
        </div>
      </div>

      {/* الصفحة الرئيسية */}
      {!activeSection && (
        <div style={{maxWidth:980,margin:'0 auto',padding:'50px 24px'}}>
          {/* رأس الصفحة الرئيسية */}
          <div style={{textAlign:'center',marginBottom:50}}>
            <img src={LOGO_URL} alt="Sanya International Company"
              style={{width:130,height:130,objectFit:'contain',marginBottom:12}}
              onError={(e)=>{ (e.target as HTMLImageElement).style.display='none' }}/>
            <h1 style={{fontSize:30,fontWeight:700,color:'#0f2557',margin:'0 0 6px',letterSpacing:0.3}}>Sanya International Company</h1>
            <p style={{fontSize:15,color:'#6b7280',margin:0}}>اختر القسم الذي تريد الدخول إليه</p>
          </div>

          {/* بطاقة تنبيهات المهام */}
          {(taskAlerts.unseen > 0 || taskAlerts.overdue > 0) && (
            <div style={{background:'#fff',border:'1px solid #bfdbfe',borderRadius:16,padding:'20px 24px',marginBottom:24,boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                <span style={{width:10,height:10,borderRadius:'50%',background:'#2563eb',display:'inline-block'}}></span>
                <h2 style={{margin:0,fontSize:16,fontWeight:700,color:'#111827'}}>المهام</h2>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
                {taskAlerts.unseen > 0 && (
                  <button onClick={()=>setActiveSection('tasks')} style={{textAlign:'right',background:'#eff6ff',border:'none',borderRadius:10,padding:'12px 16px',cursor:'pointer'}}>
                    <div style={{fontSize:13,color:'#1d4ed8',fontWeight:700}}>{taskAlerts.unseen} مهمة جديدة لم تُفتح بعد</div>
                  </button>
                )}
                {taskAlerts.overdue > 0 && (
                  <button onClick={()=>setActiveSection('tasks')} style={{textAlign:'right',background:'#fee2e2',border:'none',borderRadius:10,padding:'12px 16px',cursor:'pointer'}}>
                    <div style={{fontSize:13,color:'#dc2626',fontWeight:700}}>{taskAlerts.overdue} مهمة متأخرة عن تاريخ الاستحقاق</div>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* بطاقة التنبيهات الموحدة */}
          {(userRole === 'editor' || userRole === 'admin') && (() => {
            const totalViolated = visaAlerts.touristViolated + visaAlerts.annualViolated
            const totalWarning = visaAlerts.touristWarning + visaAlerts.annualWarning
            if (totalViolated === 0 && totalWarning === 0) return null
            return (
              <div style={{background:'#fff',border:'1px solid #fecaca',borderRadius:16,padding:'20px 24px',marginBottom:32,boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                  <span style={{width:10,height:10,borderRadius:'50%',background:'#dc2626',display:'inline-block'}}></span>
                  <h2 style={{margin:0,fontSize:16,fontWeight:700,color:'#111827'}}>التنبيهات</h2>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
                  {visaAlerts.touristViolated > 0 && (
                    <button onClick={()=>setActiveSection('visa')} style={{textAlign:'right',background:'#fee2e2',border:'none',borderRadius:10,padding:'12px 16px',cursor:'pointer'}}>
                      <div style={{fontSize:13,color:'#dc2626',fontWeight:700}}>{visaAlerts.touristViolated} مخالف — تأشيرة سياحية منتهية</div>
                    </button>
                  )}
                  {visaAlerts.touristWarning > 0 && (
                    <button onClick={()=>setActiveSection('visa')} style={{textAlign:'right',background:'#fef9c3',border:'none',borderRadius:10,padding:'12px 16px',cursor:'pointer'}}>
                      <div style={{fontSize:13,color:'#b45309',fontWeight:700}}>{visaAlerts.touristWarning} تأشيرة سياحية تنتهي قريباً (أقل من 7 أيام)</div>
                    </button>
                  )}
                  {visaAlerts.annualViolated > 0 && (
                    <button onClick={()=>setActiveSection('visa')} style={{textAlign:'right',background:'#fee2e2',border:'none',borderRadius:10,padding:'12px 16px',cursor:'pointer'}}>
                      <div style={{fontSize:13,color:'#dc2626',fontWeight:700}}>{visaAlerts.annualViolated} مخالف — تأشيرة سنوية منتهية</div>
                    </button>
                  )}
                  {visaAlerts.annualWarning > 0 && (
                    <button onClick={()=>setActiveSection('visa')} style={{textAlign:'right',background:'#fef9c3',border:'none',borderRadius:10,padding:'12px 16px',cursor:'pointer'}}>
                      <div style={{fontSize:13,color:'#b45309',fontWeight:700}}>{visaAlerts.annualWarning} تأشيرة سنوية تنتهي قريباً (أقل من 4 أشهر)</div>
                    </button>
                  )}
                </div>
              </div>
            )
          })()}

          {/* بطاقات الأقسام */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:20}}>
            {visibleSections.map(section => (
              <button key={section.id} onClick={()=>setActiveSection(section.id)}
                style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:16,padding:'30px 22px',cursor:'pointer',textAlign:'right',
                  boxShadow:'0 1px 3px rgba(0,0,0,0.06)',transition:'all 0.15s',outline:'none',
                  display:'flex',flexDirection:'column',alignItems:'flex-start',gap:14}}>
                <div style={{background:section.bg,borderRadius:14,width:64,height:64,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {iconSvg(section.icon, section.color)}
                </div>
                <div>
                  <div style={{fontSize:17,fontWeight:700,color:'#111827',marginBottom:4}}>{section.label}</div>
                  <div style={{fontSize:12.5,color:'#9ca3af',lineHeight:1.5}}>{section.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* قسم الموظفين والحضور والتأشيرات */}
      {activeSection === 'tasks' && user && userRole && (
        <Tasks currentUserId={user.id} currentUserRole={userRole} currentUserEmail={user.email || ''} />
      )}
      {activeSection === 'employees' && <Employees readOnly={isReadOnly} />}
      {activeSection === 'attendance' && <Attendance readOnly={isReadOnly} />}
      {activeSection === 'visa' && <Visa readOnly={isReadOnly} />}
      {activeSection === 'payroll' && <Payroll readOnly={isReadOnly} />}

      {/* قسم الحسابات: مصاريف + وصولات */}
      {activeSection === 'finance' && (
        <div>
          <div style={{margin:'24px 24px 0',display:'flex',gap:6,background:'#e5e7eb',padding:4,borderRadius:10,width:'fit-content'}}>
            <button onClick={()=>setFinanceTab('expenses')}
              style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
                background:financeTab==='expenses'?'#fff':'transparent',color:financeTab==='expenses'?'#15803d':'#6b7280',
                boxShadow:financeTab==='expenses'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
              المصاريف
            </button>
            <button onClick={()=>setFinanceTab('receipts')}
              style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
                background:financeTab==='receipts'?'#fff':'transparent',color:financeTab==='receipts'?'#15803d':'#6b7280',
                boxShadow:financeTab==='receipts'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
              الوصولات
            </button>
          </div>
          {financeTab === 'expenses' && <Finance readOnly={isReadOnly} />}
          {financeTab === 'receipts' && <Receipts readOnly={isReadOnly} />}
        </div>
      )}
    </div>
  )
}
