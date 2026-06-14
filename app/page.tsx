'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Attendance from './components/Attendance'
import Finance from './components/Finance'
import Visa from './components/Visa'
import Employees from './components/Employees'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

export default function Home() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<string | null>(null)

  useEffect(() => { if (user) loadRole() }, [user])

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

  const isReadOnly = userRole === 'admin'
  const roleLabel: Record<string, string> = { editor: '✏️ محرر', admin: '👁️ مدير', accountant: '💼 محاسب' }

  const sections = [
    { id: 'employees', label: 'الموظفين', icon: '👥', color: '#7c3aed', bg: '#ede9fe', show: ['editor','admin'] },
    { id: 'attendance', label: 'الحضور', icon: '📅', color: '#1e40af', bg: '#dbeafe', show: ['editor','admin'] },
    { id: 'finance', label: 'المصاريف', icon: '💰', color: '#15803d', bg: '#dcfce7', show: ['editor','admin','accountant'] },
    { id: 'visa', label: 'التأشيرات', icon: '🪪', color: '#b45309', bg: '#fef9c3', show: ['editor','admin'] },
  ]

  const visibleSections = sections.filter(s => s.show.includes(userRole || ''))

  // صفحة تسجيل الدخول
  if (!user) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #3b82f6 100%)',fontFamily:'system-ui',direction:'rtl'}}>
      <div style={{background:'#fff',borderRadius:20,padding:'2.5rem',width:380,boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
        <div style={{textAlign:'center',marginBottom:28}}>
          <img src="https://delivery.pixelbin.io/predictions/outputs/1d/sr/upscaleRestricted/019ec681-1e18-799f-8ece-f71fdf8350a7/result_0.png" 
  alt="Sanya International Company" 
  style={{width:180,height:180,objectFit:'contain',marginBottom:8}}/>
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
      <div style={{background:'#1e40af',padding:'0 24px',display:'flex',alignItems:'center',justifyContent:'space-between',height:56,boxShadow:'0 2px 8px rgba(0,0,0,0.15)'}}>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <span style={{fontWeight:700,fontSize:17,color:'#fff'}}>🏢 Sanya International</span>
          {activeSection && (
            <button onClick={()=>setActiveSection(null)}
              style={{background:'rgba(255,255,255,0.15)',border:'none',borderRadius:6,padding:'5px 12px',cursor:'pointer',fontSize:13,color:'#fff',fontWeight:500}}>
              ← الرئيسية
            </button>
          )}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:12,background:'rgba(255,255,255,0.2)',padding:'4px 10px',borderRadius:20,color:'#fff',fontWeight:600}}>
            {roleLabel[userRole] || userRole}
          </span>
          <button onClick={logout} style={{background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',borderRadius:8,padding:'6px 16px',cursor:'pointer',fontSize:13,color:'#fff'}}>خروج</button>
        </div>
      </div>

      {/* الصفحة الرئيسية */}
      {!activeSection && (
        <div style={{maxWidth:900,margin:'0 auto',padding:'40px 24px'}}>
          {/* رأس الصفحة الرئيسية */}
          <div style={{textAlign:'center',marginBottom:48}}>
            <div style={{fontSize:64,marginBottom:16}}>🏢</div>
            <h1 style={{fontSize:28,fontWeight:700,color:'#111827',margin:'0 0 8px'}}>Sanya International Company</h1>
            <p style={{fontSize:16,color:'#6b7280',margin:0}}>اختر القسم الذي تريد الدخول إليه</p>
          </div>

          {/* بطاقات الأقسام */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:20}}>
            {visibleSections.map(section => (
              <button key={section.id} onClick={()=>setActiveSection(section.id)}
                style={{background:'#fff',border:`2px solid ${section.color}22`,borderRadius:16,padding:'32px 20px',cursor:'pointer',textAlign:'center',
                  boxShadow:'0 4px 16px rgba(0,0,0,0.06)',transition:'all 0.2s',outline:'none',
                  display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
                <div style={{fontSize:48,background:section.bg,borderRadius:16,width:80,height:80,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {section.icon}
                </div>
                <div style={{fontSize:17,fontWeight:700,color:section.color}}>{section.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* الأقسام */}
      {activeSection === 'employees' && <Employees readOnly={isReadOnly} />}
      {activeSection === 'attendance' && <Attendance readOnly={isReadOnly} />}
      {activeSection === 'finance' && <Finance readOnly={isReadOnly} />}
      {activeSection === 'visa' && <Visa readOnly={isReadOnly} />}
    </div>
  )
}
