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
import ActivityLog from './components/ActivityLog'
import Documents from './components/Documents'
import Custody from './components/Custody'
import Contracts from './components/Contracts'
import { logActivity } from './logActivity'

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
  const [activeSection, setActiveSection] = useState<string>('dashboard')
  const [financeTab, setFinanceTab] = useState<'expenses' | 'receipts'>('expenses')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [visaAlerts, setVisaAlerts] = useState<{ touristViolated: number; touristWarning: number; annualViolated: number; annualWarning: number }>({ touristViolated: 0, touristWarning: 0, annualViolated: 0, annualWarning: 0 })
  const [taskAlerts, setTaskAlerts] = useState<{ unseen: number; overdue: number }>({ unseen: 0, overdue: 0 })
  const [dashStats, setDashStats] = useState<{ employees: number; lowFunds: number; myPendingTasks: number }>({ employees: 0, lowFunds: 0, myPendingTasks: 0 })

  useEffect(() => { if (user) loadRole() }, [user])

  useEffect(() => {
    if (userRole === 'editor' || userRole === 'admin') loadVisaAlerts()
  }, [userRole])

  useEffect(() => {
    if (user && userRole) {
      loadTaskAlerts()
      loadDashStats()
    }
  }, [user, userRole])

  async function loadTaskAlerts() {
    if (!user) return
    const { data } = await supabase.from('tasks').select('is_seen, status, due_date').eq('assigned_to', user.id)
    const today = new Date(new Date().toDateString())
    let unseen = 0, overdue = 0, pending = 0
    ;(data || []).forEach((t: any) => {
      if (!t.is_seen) unseen++
      if (t.status !== 'completed') pending++
      if (t.status !== 'completed' && t.due_date && new Date(t.due_date) < today) overdue++
    })
    setTaskAlerts({ unseen, overdue })
    setDashStats(prev => ({ ...prev, myPendingTasks: pending }))
  }

  async function loadDashStats() {
    // عدد الموظفين النشطين
    const { count: empCount } = await supabase.from('employees').select('*', { count: 'exact', head: true }).eq('status', 'active')
    // السلف المنخفضة
    const { data: funds } = await supabase.from('funds_summary').select('*')
    const lowFunds = (funds || []).filter((f: any) => f['المتبقي'] > 0 && f['المتبقي'] <= f['المبلغ المستلم'] * 0.10).length
    setDashStats(prev => ({ ...prev, employees: empCount || 0, lowFunds }))
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
    else {
      setUser(data.user)
      logActivity('تسجيل دخول', 'auth', `دخل المستخدم ${email} إلى المنصة`)
    }
    setLoading(false)
  }

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
    setUserRole(null)
    setActiveSection('dashboard')
  }

  async function loadRole() {
    if (!user) return
    const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single()
    if (data) setUserRole(data.role)
    else setUserRole('viewer')
  }

  const isReadOnly = ['admin', 'guest_1', 'guest_2'].includes(userRole || '')
  const roleLabel: Record<string, string> = { editor: 'محرر', admin: 'مدير', accountant: 'محاسب', guest_1: 'ضيف 1', guest_2: 'ضيف 2' }

  // مجموعات الشريط الجانبي
  const navGroups = [
    {
      title: '',
      items: [
        { id: 'dashboard', label: 'لوحة المعلومات', icon: 'DASH', show: ['editor','admin','accountant','guest_1','guest_2'] },
      ]
    },
    {
      title: 'الموارد البشرية',
      items: [
        { id: 'employees', label: 'الموظفين', icon: 'EMP', show: ['editor','admin','guest_1','guest_2'] },
        { id: 'attendance', label: 'الحضور', icon: 'ATT', show: ['editor','admin','guest_1','guest_2'] },
        { id: 'payroll', label: 'الرواتب', icon: 'PAY', show: ['editor','admin','guest_1','guest_2'] },
        { id: 'documents', label: 'الكتب الرسمية', icon: 'DOC', show: ['editor','admin','guest_1','guest_2'] },
        { id: 'custody', label: 'العهد المالية', icon: 'CUST', show: ['editor','admin','guest_1','guest_2'] },
        { id: 'contracts', label: 'العقود', icon: 'CONT', show: ['editor','admin','guest_1','guest_2'] },
      ]
    },
    {
      title: 'المالية',
      items: [
        { id: 'finance', label: 'الحسابات', icon: 'FIN', show: ['editor','admin','accountant','guest_1','guest_2'] },
      ]
    },
    {
      title: 'الإدارة',
      items: [
        { id: 'visa', label: 'التأشيرات', icon: 'VISA', show: ['editor','admin','guest_1','guest_2'] },
        { id: 'tasks', label: 'المهام', icon: 'TASK', show: ['editor','admin','accountant','guest_1','guest_2'] },
      ]
    },
    {
      title: 'النظام',
      items: [
        { id: 'activity_log', label: 'سجل النشاطات', icon: 'LOG', show: ['editor'] },
      ]
    },
  ]

  const sectionTitles: Record<string, string> = {
    dashboard: 'لوحة المعلومات',
    employees: 'الموظفين',
    attendance: 'الحضور',
    payroll: 'الرواتب',
    documents: 'الكتب الرسمية',
    custody: 'العهد المالية',
    contracts: 'العقود',
    finance: 'الحسابات',
    visa: 'التأشيرات',
    tasks: 'المهام',
    activity_log: 'سجل النشاطات',
  }

  const iconSvg = (type: string, color: string, size: number = 20) => {
    const icons: Record<string, React.ReactElement> = {
      DASH: (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="8" height="8" rx="1.5" stroke={color} strokeWidth="1.8"/>
          <rect x="13" y="3" width="8" height="5" rx="1.5" stroke={color} strokeWidth="1.8"/>
          <rect x="13" y="10" width="8" height="11" rx="1.5" stroke={color} strokeWidth="1.8"/>
          <rect x="3" y="13" width="8" height="8" rx="1.5" stroke={color} strokeWidth="1.8"/>
        </svg>
      ),
      EMP: (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <circle cx="9" cy="7" r="3.2" stroke={color} strokeWidth="1.8"/>
          <path d="M3.5 19c0-3.3 2.6-5.8 5.8-5.8h.4c3.2 0 5.8 2.5 5.8 5.8" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
          <circle cx="17" cy="8.5" r="2.4" stroke={color} strokeWidth="1.6" opacity="0.6"/>
          <path d="M14.8 19c.2-2.4 1.8-4.2 3.9-4.2.4 0 .8.05 1.1.15" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity="0.6"/>
        </svg>
      ),
      ATT: (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect x="3.5" y="4.5" width="17" height="16" rx="2.2" stroke={color} strokeWidth="1.8"/>
          <path d="M3.5 9.5h17" stroke={color} strokeWidth="1.8"/>
          <path d="M8 3v3M16 3v3" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M7.5 13.5l2 2 4-4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      FIN: (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="1.8"/>
          <path d="M12 7.5v9M9.5 9.7c0-1.1 1.1-1.9 2.5-1.9s2.5.8 2.5 1.7c0 2.4-5 1.1-5 3.5 0 1 1.1 1.7 2.5 1.7s2.5-.7 2.5-1.8" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      ),
      VISA: (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect x="2.5" y="5.5" width="19" height="13" rx="2" stroke={color} strokeWidth="1.8"/>
          <circle cx="8" cy="12" r="2.2" stroke={color} strokeWidth="1.6"/>
          <path d="M13.5 10h6M13.5 14h4" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      ),
      PAY: (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect x="3" y="6" width="18" height="13" rx="2" stroke={color} strokeWidth="1.8"/>
          <path d="M3 10h18" stroke={color} strokeWidth="1.8"/>
          <circle cx="8" cy="14.5" r="1.6" fill={color}/>
          <path d="M13 14.5h5" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      ),
      TASK: (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect x="4" y="3.5" width="16" height="17" rx="2" stroke={color} strokeWidth="1.8"/>
          <path d="M8 8h8M8 12h8M8 16h5" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
          <path d="M7 3.5v-1M17 3.5v-1" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      ),
      LOG: (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5z" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
          <path d="M2 17l10 5 10-5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 12l10 5 10-5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      DOC: (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M6 2.5h8l5 5V21a1 1 0 01-1 1H6a1 1 0 01-1-1V3.5a1 1 0 011-1z" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
          <path d="M14 2.5v5h5" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
          <path d="M9 13h6M9 17h6M9 9h2" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      ),
      CUST: (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M3.5 8.5L12 4l8.5 4.5v7L12 20l-8.5-4.5v-7z" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
          <path d="M3.5 8.5L12 13l8.5-4.5M12 13v7" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
        </svg>
      ),
      CONT: (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M5 3h14a1 1 0 011 1v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
          <path d="M8 8h8M8 12h8M8 16h4" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
          <path d="M14.5 17.5l1.5 1.5 3-3" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
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

  const sidebarWidth = sidebarCollapsed ? 72 : 240

  return (
    <div style={{minHeight:'100vh',background:'#f0f4f8',fontFamily:'system-ui',direction:'rtl',display:'flex'}}>

      {/* الشريط الجانبي */}
      <aside style={{width:sidebarWidth,minWidth:sidebarWidth,background:'#0f2557',display:'flex',flexDirection:'column',position:'sticky',top:0,height:'100vh',transition:'width 0.2s, min-width 0.2s',boxShadow:'2px 0 10px rgba(0,0,0,0.15)'}}>

        {/* شعار الشركة */}
        <div style={{padding:sidebarCollapsed?'16px 0':'20px 16px',display:'flex',alignItems:'center',gap:10,justifyContent:sidebarCollapsed?'center':'flex-start',borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
          <img src={LOGO_URL} alt="" style={{width:38,height:38,objectFit:'contain'}}
            onError={(e)=>{ (e.target as HTMLImageElement).style.display='none' }}/>
          {!sidebarCollapsed && (
            <div>
              <div style={{fontWeight:700,fontSize:13,color:'#fff',lineHeight:1.3}}>Sanya International</div>
              <div style={{fontSize:10,color:'rgba(255,255,255,0.5)'}}>منصة إدارة الشركة</div>
            </div>
          )}
        </div>

        {/* القوائم */}
        <nav style={{flex:1,overflowY:'auto',padding:'12px 8px'}}>
          {navGroups.map((group, gi) => {
            const visibleItems = group.items.filter(item => item.show.includes(userRole || ''))
            if (visibleItems.length === 0) return null
            return (
              <div key={gi} style={{marginBottom:14}}>
                {group.title && !sidebarCollapsed && (
                  <div style={{fontSize:10,fontWeight:700,color:'rgba(255,255,255,0.35)',padding:'0 12px',marginBottom:6,letterSpacing:1}}>{group.title}</div>
                )}
                {group.title && sidebarCollapsed && (
                  <div style={{height:1,background:'rgba(255,255,255,0.1)',margin:'8px 12px'}}></div>
                )}
                {visibleItems.map(item => {
                  const isActive = activeSection === item.id
                  const badge = item.id === 'tasks' && taskAlerts.unseen > 0 ? taskAlerts.unseen : null
                  return (
                    <button key={item.id} onClick={()=>setActiveSection(item.id)} title={sidebarCollapsed ? item.label : undefined}
                      style={{
                        width:'100%',display:'flex',alignItems:'center',gap:12,padding:sidebarCollapsed?'11px 0':'10px 12px',
                        justifyContent:sidebarCollapsed?'center':'flex-start',
                        background:isActive?'rgba(255,255,255,0.14)':'transparent',
                        border:'none',borderRadius:9,cursor:'pointer',marginBottom:2,
                        color:isActive?'#fff':'rgba(255,255,255,0.65)',
                        fontSize:13.5,fontWeight:isActive?700:500,
                        position:'relative',transition:'background 0.15s, color 0.15s'
                      }}>
                      {iconSvg(item.icon, isActive ? '#fff' : 'rgba(255,255,255,0.65)')}
                      {!sidebarCollapsed && <span>{item.label}</span>}
                      {badge && (
                        <span style={{position:sidebarCollapsed?'absolute':'static',top:4,left:8,marginRight:sidebarCollapsed?0:'auto',background:'#dc2626',color:'#fff',borderRadius:20,padding:'1px 7px',fontSize:10,fontWeight:700}}>
                          {badge}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* أسفل الشريط: طي + خروج */}
        <div style={{padding:'12px 8px',borderTop:'1px solid rgba(255,255,255,0.1)'}}>
          <button onClick={()=>setSidebarCollapsed(!sidebarCollapsed)} title={sidebarCollapsed ? 'توسيع القائمة' : 'طي القائمة'}
            style={{width:'100%',display:'flex',alignItems:'center',gap:12,padding:sidebarCollapsed?'10px 0':'9px 12px',justifyContent:sidebarCollapsed?'center':'flex-start',
              background:'transparent',border:'none',borderRadius:9,cursor:'pointer',color:'rgba(255,255,255,0.55)',fontSize:13,marginBottom:4}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{transform:sidebarCollapsed?'rotate(180deg)':'none',transition:'transform 0.2s'}}>
              <path d="M13 5l7 7-7 7M4 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {!sidebarCollapsed && <span>طي القائمة</span>}
          </button>
          <button onClick={logout} title="خروج"
            style={{width:'100%',display:'flex',alignItems:'center',gap:12,padding:sidebarCollapsed?'10px 0':'9px 12px',justifyContent:sidebarCollapsed?'center':'flex-start',
              background:'transparent',border:'none',borderRadius:9,cursor:'pointer',color:'rgba(255,255,255,0.55)',fontSize:13}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M15 3h4a1 1 0 011 1v16a1 1 0 01-1 1h-4M10 17l5-5-5-5M15 12H3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {!sidebarCollapsed && <span>تسجيل خروج</span>}
          </button>
        </div>
      </aside>

      {/* المحتوى الرئيسي */}
      <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column'}}>

        {/* الشريط العلوي */}
        <div style={{background:'#fff',padding:'0 24px',display:'flex',alignItems:'center',justifyContent:'space-between',height:58,boxShadow:'0 1px 4px rgba(0,0,0,0.06)',position:'sticky',top:0,zIndex:10}}>
          <h1 style={{margin:0,fontSize:17,fontWeight:700,color:'#111827'}}>{sectionTitles[activeSection] || ''}</h1>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{textAlign:'left'}}>
              <div style={{fontSize:12,fontWeight:600,color:'#374151',direction:'ltr'}}>{user.email}</div>
            </div>
            <span style={{fontSize:11,background:'#eff6ff',padding:'4px 12px',borderRadius:20,color:'#1d4ed8',fontWeight:700,border:'1px solid #bfdbfe'}}>
              {roleLabel[userRole] || userRole}
            </span>
          </div>
        </div>

        {/* المحتوى */}
        <div style={{flex:1}}>

          {/* لوحة المعلومات */}
          {activeSection === 'dashboard' && (
            <div style={{padding:'28px 24px',maxWidth:1100,margin:'0 auto'}}>
              <div style={{marginBottom:24}}>
                <h2 style={{margin:'0 0 4px',fontSize:22,fontWeight:700,color:'#0f2557'}}>مرحباً بك 👋</h2>
                <p style={{margin:0,fontSize:13,color:'#6b7280'}}>نظرة عامة سريعة على المنصة — {new Date().toLocaleDateString('ar-IQ', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
              </div>

              {/* بطاقات إحصائية سريعة */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:16,marginBottom:28}}>
                {userRole !== 'accountant' && (
                  <button onClick={()=>setActiveSection('employees')} style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:14,padding:'18px 20px',cursor:'pointer',textAlign:'right',boxShadow:'0 1px 3px rgba(0,0,0,0.05)',display:'flex',alignItems:'center',gap:14}}>
                    <div style={{background:'#ede9fe',borderRadius:12,width:48,height:48,display:'flex',alignItems:'center',justifyContent:'center'}}>{iconSvg('EMP','#7c3aed',24)}</div>
                    <div>
                      <div style={{fontSize:24,fontWeight:700,color:'#111827'}}>{dashStats.employees}</div>
                      <div style={{fontSize:12,color:'#6b7280'}}>موظف نشط</div>
                    </div>
                  </button>
                )}
                <button onClick={()=>setActiveSection('tasks')} style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:14,padding:'18px 20px',cursor:'pointer',textAlign:'right',boxShadow:'0 1px 3px rgba(0,0,0,0.05)',display:'flex',alignItems:'center',gap:14}}>
                  <div style={{background:'#fee2e2',borderRadius:12,width:48,height:48,display:'flex',alignItems:'center',justifyContent:'center'}}>{iconSvg('TASK','#dc2626',24)}</div>
                  <div>
                    <div style={{fontSize:24,fontWeight:700,color:'#111827'}}>{dashStats.myPendingTasks}</div>
                    <div style={{fontSize:12,color:'#6b7280'}}>مهمة غير مكتملة لديك</div>
                  </div>
                </button>
                <button onClick={()=>setActiveSection('finance')} style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:14,padding:'18px 20px',cursor:'pointer',textAlign:'right',boxShadow:'0 1px 3px rgba(0,0,0,0.05)',display:'flex',alignItems:'center',gap:14}}>
                  <div style={{background:dashStats.lowFunds>0?'#fef9c3':'#dcfce7',borderRadius:12,width:48,height:48,display:'flex',alignItems:'center',justifyContent:'center'}}>{iconSvg('FIN',dashStats.lowFunds>0?'#b45309':'#15803d',24)}</div>
                  <div>
                    <div style={{fontSize:24,fontWeight:700,color:dashStats.lowFunds>0?'#b45309':'#111827'}}>{dashStats.lowFunds}</div>
                    <div style={{fontSize:12,color:'#6b7280'}}>سلفة منخفضة الرصيد</div>
                  </div>
                </button>
                {(userRole === 'editor' || userRole === 'admin') && (
                  <button onClick={()=>setActiveSection('visa')} style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:14,padding:'18px 20px',cursor:'pointer',textAlign:'right',boxShadow:'0 1px 3px rgba(0,0,0,0.05)',display:'flex',alignItems:'center',gap:14}}>
                    <div style={{background:(visaAlerts.touristViolated+visaAlerts.annualViolated)>0?'#fee2e2':'#fef9c3',borderRadius:12,width:48,height:48,display:'flex',alignItems:'center',justifyContent:'center'}}>{iconSvg('VISA',(visaAlerts.touristViolated+visaAlerts.annualViolated)>0?'#dc2626':'#b45309',24)}</div>
                    <div>
                      <div style={{fontSize:24,fontWeight:700,color:(visaAlerts.touristViolated+visaAlerts.annualViolated)>0?'#dc2626':'#111827'}}>{visaAlerts.touristViolated+visaAlerts.annualViolated}</div>
                      <div style={{fontSize:12,color:'#6b7280'}}>مخالف تأشيرة</div>
                    </div>
                  </button>
                )}
              </div>

              {/* تنبيهات المهام */}
              {(taskAlerts.unseen > 0 || taskAlerts.overdue > 0) && (
                <div style={{background:'#fff',border:'1px solid #bfdbfe',borderRadius:16,padding:'20px 24px',marginBottom:20,boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                    <span style={{width:10,height:10,borderRadius:'50%',background:'#2563eb',display:'inline-block'}}></span>
                    <h2 style={{margin:0,fontSize:15,fontWeight:700,color:'#111827'}}>تنبيهات المهام</h2>
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

              {/* تنبيهات التأشيرات */}
              {(userRole === 'editor' || userRole === 'admin') && (() => {
                const totalViolated = visaAlerts.touristViolated + visaAlerts.annualViolated
                const totalWarning = visaAlerts.touristWarning + visaAlerts.annualWarning
                if (totalViolated === 0 && totalWarning === 0) return null
                return (
                  <div style={{background:'#fff',border:'1px solid #fecaca',borderRadius:16,padding:'20px 24px',marginBottom:20,boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                      <span style={{width:10,height:10,borderRadius:'50%',background:'#dc2626',display:'inline-block'}}></span>
                      <h2 style={{margin:0,fontSize:15,fontWeight:700,color:'#111827'}}>تنبيهات التأشيرات</h2>
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
            </div>
          )}

          {/* الأقسام */}
          {activeSection === 'tasks' && user && userRole && (
            <Tasks currentUserId={user.id} currentUserRole={userRole} currentUserEmail={user.email || ''} />
          )}
          {activeSection === 'documents' && <Documents readOnly={isReadOnly} />}
          {activeSection === 'custody' && <Custody readOnly={isReadOnly} />}
          {activeSection === 'contracts' && <Contracts readOnly={isReadOnly} />}
          {activeSection === 'activity_log' && userRole === 'editor' && <ActivityLog />}
          {activeSection === 'employees' && <Employees readOnly={isReadOnly} />}
          {activeSection === 'attendance' && <Attendance readOnly={isReadOnly} />}
          {activeSection === 'visa' && <Visa readOnly={isReadOnly} />}
          {activeSection === 'payroll' && <Payroll readOnly={isReadOnly} userRole={userRole || ''} />}

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
      </div>
    </div>
  )
}
