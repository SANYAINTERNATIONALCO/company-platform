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
import Overtime from './components/Overtime'
import Recruitment from './components/Recruitment'
import Fingerprint from './components/Fingerprint'
import Users from './components/Users'
import Backup from './components/Backup'
import Reports from './components/Reports'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { logActivity } from './logActivity'
import { Button, Input, Badge } from './ui'
import { EDITOR_ONLY, resolvePermissions, canView, canEdit, type Permissions } from './lib/permissions'

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
  const [perms, setPerms] = useState<Permissions>({})
  const [displayName, setDisplayName] = useState('')
  const [isActive, setIsActive] = useState<boolean | null>(null)
  const [activeSection, setActiveSection] = useState<string>('dashboard')
  const [financeTab, setFinanceTab] = useState<'expenses' | 'receipts'>('expenses')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [visaAlerts, setVisaAlerts] = useState<{ touristViolated: number; touristWarning: number; annualViolated: number; annualWarning: number }>({ touristViolated: 0, touristWarning: 0, annualViolated: 0, annualWarning: 0 })
  const [taskAlerts, setTaskAlerts] = useState<{ unseen: number; overdue: number }>({ unseen: 0, overdue: 0 })
  const [dashStats, setDashStats] = useState<{ employees: number; lowFunds: number; myPendingTasks: number }>({ employees: 0, lowFunds: 0, myPendingTasks: 0 })
  const [miniChart, setMiniChart] = useState<any[]>([])

  useEffect(() => { if (user) loadRole() }, [user])

  // كل تحميل مشروط فعلياً بصلاحية القسم — لا يُجلب شيء ثم يُخفى، بل لا يُجلب أصلاً بلا canView
  // لوحة المعلومات صارت قسماً كباقي الأقسام ضمن SECTIONS — تُخفى/تُظهر عبر الصلاحيات مثل أي قسم آخر
  function isSectionAllowed(id: string): boolean {
    if (EDITOR_ONLY.includes(id)) return userRole === 'editor'
    return canView(perms, id)
  }

  // أول قسم مصرَّح به فعلياً — يُستخدم كوجهة آمنة عند رفض الوصول لقسم (بدل الافتراض القديم بأن لوحة المعلومات دائماً متاحة)
  function firstAllowedSectionId(): string {
    for (const group of navGroups) {
      for (const item of group.items) {
        if (isSectionAllowed(item.id)) return item.id
      }
    }
    return 'dashboard'
  }

  useEffect(() => {
    if (user && userRole && canView(perms, 'visa')) loadVisaAlerts()
  }, [user, userRole, perms])

  useEffect(() => {
    if (!user || !userRole) return
    if (canView(perms, 'tasks')) loadTaskAlerts()
    loadDashStats()
    if (canView(perms, 'reports')) loadMiniChart()
  }, [user, userRole, perms])

  // دفاع في العمق: لو activeSection قسماً غير مصرَّح به لأي سبب (رابط مباشر، حالة قديمة، تعديل صلاحيات أثناء التصفح،
  // أو لوحة المعلومات نفسها أصبحت مخفية عن هذا المستخدم) — التوجيه لأول قسم مصرَّح به فعلياً، وليس للوحة المعلومات دائماً
  // تصحيح مشروط لحالة تصفح غير صالحة، وليس مزامنة قيمة مشتقة من render — استثناء متعمد لقاعدة set-state-in-effect
  useEffect(() => {
    if (userRole && !isSectionAllowed(activeSection)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveSection(firstAllowedSectionId())
    }
  }, [activeSection, userRole, perms])

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
    // عدد الموظفين النشطين — فقط إذا كان له صلاحية قسم الموظفين
    if (canView(perms, 'employees')) {
      const { count: empCount } = await supabase.from('employees').select('*', { count: 'exact', head: true }).eq('status', 'active')
      setDashStats(prev => ({ ...prev, employees: empCount || 0 }))
    }
    // السلف المنخفضة — فقط إذا كان له صلاحية قسم الحسابات
    if (canView(perms, 'finance')) {
      const { data: funds } = await supabase.from('funds_summary').select('*')
      const lowFunds = (funds || []).filter((f: any) => f['المتبقي'] > 0 && f['المتبقي'] <= f['المبلغ المستلم'] * 0.10).length
      setDashStats(prev => ({ ...prev, lowFunds }))
    }
  }

  async function loadMiniChart() {
    const year = new Date().getFullYear()
    const yearStr = String(year)
    const MONTHS_SHORT = ['ينا','فبر','مار','أبر','ماي','يون','يول','أغس','سبت','أكت','نوف','ديس']
    const salaries: Record<number, number> = {}
    const spending: Record<number, number> = {}
    for (let i = 1; i <= 12; i++) { salaries[i] = 0; spending[i] = 0 }

    if (canView(perms, 'payroll')) {
      const { data: payroll } = await supabase.from('payroll_records').select('payroll_month, net_salary').gte('payroll_month', yearStr + '-01').lte('payroll_month', yearStr + '-12')
      ;(payroll || []).forEach((r: any) => { const m = parseInt(r.payroll_month?.slice(5, 7)); if (m) salaries[m] += r.net_salary || 0 })
    }
    if (canView(perms, 'finance')) {
      const [expenses, fuel, maint, delivery] = await Promise.all([
        supabase.from('expenses').select('amount, expense_date').gte('expense_date', yearStr + '-01-01').lte('expense_date', yearStr + '-12-31'),
        supabase.from('fuel_receipts').select('amount, created_at').gte('created_at', yearStr + '-01-01').lte('created_at', yearStr + '-12-31'),
        supabase.from('maintenance_receipts').select('amount, created_at').gte('created_at', yearStr + '-01-01').lte('created_at', yearStr + '-12-31'),
        supabase.from('delivery_receipts').select('amount, created_at').gte('created_at', yearStr + '-01-01').lte('created_at', yearStr + '-12-31'),
      ])
      const addSpend = (rows: any[], dateField: string) => rows.forEach((r: any) => { const m = parseInt(r[dateField]?.slice(5, 7)); if (m) spending[m] += r.amount || 0 })
      addSpend(expenses.data || [], 'expense_date')
      addSpend(fuel.data || [], 'created_at')
      addSpend(maint.data || [], 'created_at')
      addSpend(delivery.data || [], 'created_at')
    }
    setMiniChart(MONTHS_SHORT.map((label, i) => ({ month: label, 'الرواتب': salaries[i + 1], 'المصروفات': spending[i + 1] })))
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
    setPerms({})
    setDisplayName('')
    setIsActive(null)
    setActiveSection('dashboard')
  }

  async function loadRole() {
    if (!user) return
    const { data } = await supabase.from('user_roles').select('role, permissions, display_name, is_active').eq('user_id', user.id).single()
    if (data) {
      setUserRole(data.role)
      setPerms(resolvePermissions(data.role, data.permissions))
      setDisplayName(data.display_name || '')
      setIsActive(data.is_active !== false)
    } else {
      setUserRole('viewer')
      setPerms(resolvePermissions('viewer', null))
      setIsActive(true)
    }
  }

  const roleLabel: Record<string, string> = { editor: 'محرر', admin: 'مدير', accountant: 'محاسب', guest_1: 'ضيف 1', guest_2: 'ضيف 2' }

  // مجموعات الشريط الجانبي — الظهور محسوب عبر canView(perms, id) عدا dashboard (دائماً ظاهر) وEDITOR_ONLY (role==='editor' حصراً)
  const navGroups = [
    {
      title: '',
      items: [
        { id: 'dashboard', label: 'لوحة المعلومات', icon: 'DASH' },
      ]
    },
    {
      title: 'الموارد البشرية',
      // مرتبة حسب دورة حياة الموظف: استقطاب ← سجل ← دوام ← أجور ← وثائق
      items: [
        { id: 'recruitment', label: 'التوظيف', icon: 'RECRUIT' },
        { id: 'employees', label: 'الموظفين', icon: 'EMP' },
        { id: 'contracts', label: 'العقود', icon: 'CONT' },
        { id: 'attendance', label: 'الحضور', icon: 'ATT' },
        { id: 'fingerprint', label: 'تقارير البصمة', icon: 'FP' },
        { id: 'overtime', label: 'الأوفرتايم', icon: 'OT' },
        { id: 'payroll', label: 'الرواتب', icon: 'PAY' },
        { id: 'custody', label: 'العهد المالية', icon: 'CUST' },
        { id: 'documents', label: 'الكتب الرسمية', icon: 'DOC' },
      ]
    },
    {
      title: 'المالية',
      items: [
        { id: 'finance', label: 'الحسابات', icon: 'FIN' },
      ]
    },
    {
      title: 'الإدارة',
      // اليومي أولاً ثم الدوري ثم السنوي
      items: [
        { id: 'tasks', label: 'المهام', icon: 'TASK' },
        { id: 'visa', label: 'التأشيرات', icon: 'VISA' },
        { id: 'reports', label: 'التقارير السنوية', icon: 'RPT' },
      ]
    },
    {
      title: 'النظام',
      items: [
        { id: 'users', label: 'إدارة المستخدمين', icon: 'USERS' },
        { id: 'activity_log', label: 'سجل النشاطات', icon: 'LOG' },
        { id: 'backup', label: 'النسخ الاحتياطي', icon: 'BACKUP' },
      ]
    },
  ]

  const sectionTitles: Record<string, string> = {
    dashboard: 'لوحة المعلومات',
    employees: 'الموظفين',
    attendance: 'الحضور',
    fingerprint: 'تقارير البصمة',
    payroll: 'الرواتب',
    documents: 'الكتب الرسمية',
    custody: 'العهد المالية',
    contracts: 'العقود',
    overtime: 'الأوفرتايم',
    recruitment: 'التوظيف',
    reports: 'التقارير السنوية',
    finance: 'الحسابات',
    visa: 'التأشيرات',
    tasks: 'المهام',
    activity_log: 'سجل النشاطات',
    users: 'إدارة المستخدمين',
    backup: 'النسخ الاحتياطي',
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
      RPT: (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke={color} strokeWidth="1.8"/>
          <path d="M7 16v-4M10 16v-6M13 16v-3M16 16v-7" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
      OT: (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="12.5" r="8" stroke={color} strokeWidth="1.8"/>
          <path d="M11 8v4.5l3 2" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M17 3.5v4h-4" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      FP: (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M12 3a7 7 0 00-7 7v2c0 3 1 5.5 2.5 7.5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M12 3a7 7 0 017 7v2c0 1.5-.2 2.8-.6 4" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M8.5 10a3.5 3.5 0 017 0v2.5c0 3-1 5.5-2.7 7.5" stroke={color} strokeWidth="1.7" strokeLinecap="round"/>
          <path d="M12 10v3c0 3.2-.9 5.9-2.4 8" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
          <path d="M15 10.2V13c0 1.6-.2 3-.6 4.3" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity="0.7"/>
        </svg>
      ),
      USERS: (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <circle cx="8.5" cy="7.5" r="3" stroke={color} strokeWidth="1.8"/>
          <path d="M2.8 19c0-3.1 2.5-5.6 5.7-5.6s5.7 2.5 5.7 5.6" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
          <circle cx="16.5" cy="8.5" r="2.3" stroke={color} strokeWidth="1.6"/>
          <path d="M14.5 19c.1-2.5 1.9-4.4 4-4.4.6 0 1.2.15 1.7.4" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
          <path d="M18.5 3.5v3.4M20.2 5.2h-3.4" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      ),
      RECRUIT: (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <circle cx="9.5" cy="8" r="3.5" stroke={color} strokeWidth="1.8"/>
          <path d="M3.5 20c0-3.6 2.7-6.2 6-6.2s6 2.6 6 6.2" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M18 6.5v5M15.5 9h5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
      BACKUP: (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M4 7c0-1.4 3.6-2.5 8-2.5s8 1.1 8 2.5-3.6 2.5-8 2.5-8-1.1-8-2.5z" stroke={color} strokeWidth="1.8"/>
          <path d="M4 7v10c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V7" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    }
    return icons[type] || null
  }

  // صفحة تسجيل الدخول
  if (!user) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg, var(--color-sidebar-bg) 0%, var(--color-accent) 50%, var(--blue-600) 100%)',fontFamily:'var(--font-sans)',direction:'rtl',padding:20}}>
      <div style={{background:'var(--color-surface)',borderRadius:'var(--radius-xl)',padding:'2.5rem',width:380,maxWidth:'100%',boxShadow:'var(--shadow-lg)'}}>
        <div style={{textAlign:'center',marginBottom:'var(--space-6)'}}>
          <img src={LOGO_URL} alt="Sanya International Company"
            style={{width:140,height:140,objectFit:'contain',marginBottom:'var(--space-2)'}}
            onError={(e)=>{ (e.target as HTMLImageElement).style.display='none' }}/>
          <h1 style={{margin:'0 0 4px',fontSize:'var(--text-2xl)',fontWeight:'var(--weight-bold)',color:'var(--color-text)'}}>منصة الشركة</h1>
          <p style={{margin:0,color:'var(--color-text-muted)',fontSize:'var(--text-base)'}}>Sanya International Company</p>
        </div>
        {error && <div style={{background:'var(--color-danger-surface-subtle)',color:'var(--color-danger)',padding:'10px 14px',borderRadius:'var(--radius-md)',marginBottom:'var(--space-4)',fontSize:'var(--text-sm)',border:'var(--border-width-thin) solid var(--color-danger-border)'}}>{error}</div>}
        <div style={{marginBottom:'var(--space-3)'}}>
          <Input
            label="البريد الإلكتروني"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&login()}
            style={{direction:'ltr'}}
          />
        </div>
        <div style={{marginBottom:'var(--space-6)'}}>
          <Input
            label="كلمة المرور"
            type="password"
            value={password}
            onChange={e=>setPassword(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&login()}
            style={{direction:'ltr'}}
          />
        </div>
        <Button variant="primary" size="lg" onClick={login} disabled={loading} style={{ width: '100%' }}>
          {loading ? 'جارٍ الدخول...' : 'تسجيل الدخول'}
        </Button>
      </div>
    </div>
  )

  if (!userRole) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--color-canvas)'}}>
      <div style={{color:'var(--color-text-muted)',fontSize:'var(--text-md)'}}>جارٍ تحميل الصلاحيات...</div>
    </div>
  )

  if (isActive === false) return (
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'var(--color-canvas)',gap:16,padding:20,textAlign:'center'}}>
      <div style={{fontSize:'var(--text-lg)',fontWeight:'var(--weight-bold)',color:'var(--color-danger)'}}>هذا الحساب معطّل — راجع مدير النظام</div>
      <Button variant="secondary" size="md" onClick={logout}>تسجيل خروج</Button>
    </div>
  )

  const sidebarWidth = sidebarCollapsed ? 72 : 240
  const dashboardHasContent = canView(perms, 'employees') || canView(perms, 'tasks') || canView(perms, 'finance') || canView(perms, 'visa') || canView(perms, 'reports')

  return (
    <div style={{minHeight:'100vh',background:'var(--color-canvas)',fontFamily:'var(--font-sans)',direction:'rtl',display:'flex'}}>

      {/* الشريط الجانبي */}
      <aside style={{width:sidebarWidth,minWidth:sidebarWidth,background:'var(--color-sidebar-bg)',display:'flex',flexDirection:'column',position:'sticky',top:0,height:'100vh',transition:'width var(--duration-base) var(--ease-standard), min-width var(--duration-base) var(--ease-standard)',boxShadow:'var(--shadow-md)'}}>

        {/* شعار الشركة */}
        <div style={{padding:sidebarCollapsed?'16px 0':'20px 16px',display:'flex',alignItems:'center',gap:10,justifyContent:sidebarCollapsed?'center':'flex-start',borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
          <img src={LOGO_URL} alt="" style={{width:38,height:38,objectFit:'contain'}}
            onError={(e)=>{ (e.target as HTMLImageElement).style.display='none' }}/>
          {!sidebarCollapsed && (
            <div>
              <div style={{fontWeight:'var(--weight-bold)',fontSize:'var(--text-sm)',color:'var(--color-text-on-dark)',lineHeight:'var(--leading-tight)'}}>Sanya International</div>
              <div style={{fontSize:'var(--text-2xs)',color:'rgba(255,255,255,0.5)'}}>منصة إدارة الشركة</div>
            </div>
          )}
        </div>

        {/* القوائم */}
        <nav style={{flex:1,overflowY:'auto',padding:'12px 8px'}}>
          {navGroups.map((group, gi) => {
            const visibleItems = group.items.filter(item => isSectionAllowed(item.id))
            if (visibleItems.length === 0) return null
            return (
              <div key={gi} style={{marginBottom:14}}>
                {group.title && !sidebarCollapsed && (
                  <div style={{fontSize:'var(--text-2xs)',fontWeight:'var(--weight-bold)',color:'rgba(255,255,255,0.35)',padding:'0 12px',marginBottom:6,letterSpacing:'var(--tracking-wide)'}}>{group.title}</div>
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
                        border:'none',borderRadius:'var(--radius-md)',cursor:'pointer',marginBottom:2,
                        color:isActive?'var(--color-text-on-dark)':'rgba(255,255,255,0.65)',
                        fontSize:13.5,fontWeight:isActive?'var(--weight-bold)':'var(--weight-medium)',
                        position:'relative',transition:'background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard)'
                      }}>
                      {iconSvg(item.icon, isActive ? '#fff' : 'rgba(255,255,255,0.65)')}
                      {!sidebarCollapsed && <span>{item.label}</span>}
                      {badge && (
                        <span style={{position:sidebarCollapsed?'absolute':'static',top:4,insetInlineStart:8,marginInlineStart:sidebarCollapsed?0:'auto',background:'var(--color-danger)',color:'var(--color-text-on-accent)',borderRadius:'var(--radius-full)',padding:'1px 7px',fontSize:'var(--text-2xs)',fontWeight:'var(--weight-bold)'}}>
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
              background:'transparent',border:'none',borderRadius:'var(--radius-md)',cursor:'pointer',color:'rgba(255,255,255,0.55)',fontSize:'var(--text-sm)',marginBottom:4}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{transform:sidebarCollapsed?'rotate(180deg)':'none',transition:'transform var(--duration-base) var(--ease-standard)'}}>
              <path d="M13 5l7 7-7 7M4 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {!sidebarCollapsed && <span>طي القائمة</span>}
          </button>
          <button onClick={logout} title="خروج"
            style={{width:'100%',display:'flex',alignItems:'center',gap:12,padding:sidebarCollapsed?'10px 0':'9px 12px',justifyContent:sidebarCollapsed?'center':'flex-start',
              background:'transparent',border:'none',borderRadius:'var(--radius-md)',cursor:'pointer',color:'rgba(255,255,255,0.55)',fontSize:'var(--text-sm)'}}>
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
        <div style={{background:'var(--color-surface)',padding:'0 24px',display:'flex',alignItems:'center',justifyContent:'space-between',height:58,boxShadow:'var(--shadow-xs)',position:'sticky',top:0,zIndex:10 /* var(--z-sticky) */}}>
          <h1 style={{margin:0,fontSize:'var(--text-lg)',fontWeight:'var(--weight-bold)',color:'var(--color-text)'}}>{sectionTitles[activeSection] || ''}</h1>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{textAlign:'left'}}>
              {displayName && <div style={{fontSize:'var(--text-xs)',fontWeight:'var(--weight-semibold)',color:'var(--color-text)',direction:'rtl'}}>{displayName}</div>}
              <div style={{fontSize:'var(--text-2xs)',fontWeight:'var(--weight-medium)',color:'var(--color-text-muted)',direction:'ltr'}}>{user.email}</div>
            </div>
            <Badge tone="accent">{roleLabel[userRole] || userRole}</Badge>
          </div>
        </div>

        {/* المحتوى */}
        <div style={{flex:1}}>

          {/* لوحة المعلومات — قسم كباقي الأقسام، تُخفى/تُظهر عبر الصلاحيات */}
          {activeSection === 'dashboard' && canView(perms, 'dashboard') && (
            <div style={{padding:'28px 24px',maxWidth:1100,margin:'0 auto'}}>
              <div style={{marginBottom:'var(--space-6)'}}>
                <h2 style={{margin:'0 0 4px',fontSize:'var(--text-xl)',fontWeight:'var(--weight-bold)',color:'var(--color-sidebar-bg)'}}>
                  {dashboardHasContent ? 'مرحباً بك 👋' : `مرحباً ${displayName || user.email} 👋`}
                </h2>
                <p style={{margin:0,fontSize:'var(--text-sm)',color:'var(--color-text-muted)'}}>
                  {dashboardHasContent
                    ? `نظرة عامة سريعة على المنصة — ${new Date().toLocaleDateString('ar-IQ', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}`
                    : 'استخدم القائمة الجانبية للتنقل بين أقسامك'}
                </p>
              </div>

              {dashboardHasContent && (
              <>
              {/* بطاقات إحصائية سريعة */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:16,marginBottom:'var(--space-8)'}}>
                {canView(perms, 'employees') && (
                  <button onClick={()=>setActiveSection('employees')} style={{background:'var(--color-surface)',border:'var(--border-width-thin) solid var(--color-border)',borderRadius:'var(--radius-lg)',padding:'18px 20px',cursor:'pointer',textAlign:'right',boxShadow:'var(--shadow-xs)',display:'flex',alignItems:'center',gap:14}}>
                    <div style={{background:'var(--color-info-surface)',borderRadius:'var(--radius-md)',width:48,height:48,display:'flex',alignItems:'center',justifyContent:'center'}}>{iconSvg('EMP','#7c3aed',24)}</div>
                    <div>
                      <div style={{fontSize:'var(--text-2xl)',fontWeight:'var(--weight-bold)',color:'var(--color-text)',fontVariantNumeric:'tabular-nums'}}>{dashStats.employees}</div>
                      <div style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)'}}>موظف نشط</div>
                    </div>
                  </button>
                )}
                {canView(perms, 'tasks') && (
                  <button onClick={()=>setActiveSection('tasks')} style={{background:'var(--color-surface)',border:'var(--border-width-thin) solid var(--color-border)',borderRadius:'var(--radius-lg)',padding:'18px 20px',cursor:'pointer',textAlign:'right',boxShadow:'var(--shadow-xs)',display:'flex',alignItems:'center',gap:14}}>
                    <div style={{background:'var(--color-danger-surface)',borderRadius:'var(--radius-md)',width:48,height:48,display:'flex',alignItems:'center',justifyContent:'center'}}>{iconSvg('TASK','#dc2626',24)}</div>
                    <div>
                      <div style={{fontSize:'var(--text-2xl)',fontWeight:'var(--weight-bold)',color:'var(--color-text)',fontVariantNumeric:'tabular-nums'}}>{dashStats.myPendingTasks}</div>
                      <div style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)'}}>مهمة غير مكتملة لديك</div>
                    </div>
                  </button>
                )}
                {canView(perms, 'finance') && (
                  <button onClick={()=>setActiveSection('finance')} style={{background:'var(--color-surface)',border:'var(--border-width-thin) solid var(--color-border)',borderRadius:'var(--radius-lg)',padding:'18px 20px',cursor:'pointer',textAlign:'right',boxShadow:'var(--shadow-xs)',display:'flex',alignItems:'center',gap:14}}>
                    <div style={{background:dashStats.lowFunds>0?'var(--color-warning-surface)':'var(--color-success-surface)',borderRadius:'var(--radius-md)',width:48,height:48,display:'flex',alignItems:'center',justifyContent:'center'}}>{iconSvg('FIN',dashStats.lowFunds>0?'#b45309':'#15803d',24)}</div>
                    <div>
                      <div style={{fontSize:'var(--text-2xl)',fontWeight:'var(--weight-bold)',color:dashStats.lowFunds>0?'var(--color-warning)':'var(--color-text)',fontVariantNumeric:'tabular-nums'}}>{dashStats.lowFunds}</div>
                      <div style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)'}}>سلفة منخفضة الرصيد</div>
                    </div>
                  </button>
                )}
                {canView(perms, 'visa') && (
                  <button onClick={()=>setActiveSection('visa')} style={{background:'var(--color-surface)',border:'var(--border-width-thin) solid var(--color-border)',borderRadius:'var(--radius-lg)',padding:'18px 20px',cursor:'pointer',textAlign:'right',boxShadow:'var(--shadow-xs)',display:'flex',alignItems:'center',gap:14}}>
                    <div style={{background:(visaAlerts.touristViolated+visaAlerts.annualViolated)>0?'var(--color-danger-surface)':'var(--color-warning-surface)',borderRadius:'var(--radius-md)',width:48,height:48,display:'flex',alignItems:'center',justifyContent:'center'}}>{iconSvg('VISA',(visaAlerts.touristViolated+visaAlerts.annualViolated)>0?'#dc2626':'#b45309',24)}</div>
                    <div>
                      <div style={{fontSize:'var(--text-2xl)',fontWeight:'var(--weight-bold)',color:(visaAlerts.touristViolated+visaAlerts.annualViolated)>0?'var(--color-danger)':'var(--color-text)',fontVariantNumeric:'tabular-nums'}}>{visaAlerts.touristViolated+visaAlerts.annualViolated}</div>
                      <div style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)'}}>مخالف تأشيرة</div>
                    </div>
                  </button>
                )}
              </div>

              {/* تنبيهات المهام */}
              {canView(perms, 'tasks') && (taskAlerts.unseen > 0 || taskAlerts.overdue > 0) && (
                <div style={{background:'var(--color-surface)',border:'var(--border-width-thin) solid var(--color-accent-border)',borderRadius:'var(--radius-xl)',padding:'20px 24px',marginBottom:'var(--space-5)',boxShadow:'var(--shadow-xs)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                    <span style={{width:10,height:10,borderRadius:'var(--radius-full)',background:'var(--blue-600)',display:'inline-block'}}></span>
                    <h2 style={{margin:0,fontSize:'var(--text-md)',fontWeight:'var(--weight-bold)',color:'var(--color-text)'}}>تنبيهات المهام</h2>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
                    {taskAlerts.unseen > 0 && (
                      <button onClick={()=>setActiveSection('tasks')} style={{textAlign:'right',background:'var(--color-accent-subtle)',border:'none',borderRadius:'var(--radius-md)',padding:'12px 16px',cursor:'pointer'}}>
                        <div style={{fontSize:'var(--text-sm)',color:'var(--color-accent-hover)',fontWeight:'var(--weight-bold)'}}>{taskAlerts.unseen} مهمة جديدة لم تُفتح بعد</div>
                      </button>
                    )}
                    {taskAlerts.overdue > 0 && (
                      <button onClick={()=>setActiveSection('tasks')} style={{textAlign:'right',background:'var(--color-danger-surface)',border:'none',borderRadius:'var(--radius-md)',padding:'12px 16px',cursor:'pointer'}}>
                        <div style={{fontSize:'var(--text-sm)',color:'var(--color-danger)',fontWeight:'var(--weight-bold)'}}>{taskAlerts.overdue} مهمة متأخرة عن تاريخ الاستحقاق</div>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* تنبيهات التأشيرات */}
              {canView(perms, 'visa') && (() => {
                const totalViolated = visaAlerts.touristViolated + visaAlerts.annualViolated
                const totalWarning = visaAlerts.touristWarning + visaAlerts.annualWarning
                if (totalViolated === 0 && totalWarning === 0) return null
                return (
                  <div style={{background:'var(--color-surface)',border:'var(--border-width-thin) solid var(--color-danger-border)',borderRadius:'var(--radius-xl)',padding:'20px 24px',marginBottom:'var(--space-5)',boxShadow:'var(--shadow-xs)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                      <span style={{width:10,height:10,borderRadius:'var(--radius-full)',background:'var(--color-danger)',display:'inline-block'}}></span>
                      <h2 style={{margin:0,fontSize:'var(--text-md)',fontWeight:'var(--weight-bold)',color:'var(--color-text)'}}>تنبيهات التأشيرات</h2>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
                      {visaAlerts.touristViolated > 0 && (
                        <button onClick={()=>setActiveSection('visa')} style={{textAlign:'right',background:'var(--color-danger-surface)',border:'none',borderRadius:'var(--radius-md)',padding:'12px 16px',cursor:'pointer'}}>
                          <div style={{fontSize:'var(--text-sm)',color:'var(--color-danger)',fontWeight:'var(--weight-bold)'}}>{visaAlerts.touristViolated} مخالف — تأشيرة سياحية منتهية</div>
                        </button>
                      )}
                      {visaAlerts.touristWarning > 0 && (
                        <button onClick={()=>setActiveSection('visa')} style={{textAlign:'right',background:'var(--color-warning-surface)',border:'none',borderRadius:'var(--radius-md)',padding:'12px 16px',cursor:'pointer'}}>
                          <div style={{fontSize:'var(--text-sm)',color:'var(--color-warning)',fontWeight:'var(--weight-bold)'}}>{visaAlerts.touristWarning} تأشيرة سياحية تنتهي قريباً (أقل من 7 أيام)</div>
                        </button>
                      )}
                      {visaAlerts.annualViolated > 0 && (
                        <button onClick={()=>setActiveSection('visa')} style={{textAlign:'right',background:'var(--color-danger-surface)',border:'none',borderRadius:'var(--radius-md)',padding:'12px 16px',cursor:'pointer'}}>
                          <div style={{fontSize:'var(--text-sm)',color:'var(--color-danger)',fontWeight:'var(--weight-bold)'}}>{visaAlerts.annualViolated} مخالف — تأشيرة سنوية منتهية</div>
                        </button>
                      )}
                      {visaAlerts.annualWarning > 0 && (
                        <button onClick={()=>setActiveSection('visa')} style={{textAlign:'right',background:'var(--color-warning-surface)',border:'none',borderRadius:'var(--radius-md)',padding:'12px 16px',cursor:'pointer'}}>
                          <div style={{fontSize:'var(--text-sm)',color:'var(--color-warning)',fontWeight:'var(--weight-bold)'}}>{visaAlerts.annualWarning} تأشيرة سنوية تنتهي قريباً (أقل من 4 أشهر)</div>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* نظرة سريعة على السنة */}
              {canView(perms, 'reports') && miniChart.length > 0 && (
                <div style={{background:'var(--color-surface)',border:'var(--border-width-thin) solid var(--color-border)',borderRadius:'var(--radius-xl)',padding:'20px 24px',marginBottom:'var(--space-5)',boxShadow:'var(--shadow-xs)'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:10}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <span style={{width:10,height:10,borderRadius:'var(--radius-full)',background:'var(--color-info)',display:'inline-block'}}></span>
                      <h2 style={{margin:0,fontSize:'var(--text-md)',fontWeight:'var(--weight-bold)',color:'var(--color-text)'}}>نظرة سريعة على سنة {new Date().getFullYear()}</h2>
                    </div>
                    {canView(perms, 'reports') && (
                      <Button variant="info-soft" size="sm" onClick={()=>setActiveSection('reports')}>
                        عرض التقرير الكامل ←
                      </Button>
                    )}
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={miniChart} margin={{top:5,right:5,bottom:5,left:5}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                      <XAxis dataKey="month" tick={{fontSize:10,fontFamily:'system-ui'}} tickLine={false}/>
                      <YAxis tickFormatter={(v:number)=>Math.round(v/1000000)+' م'} tick={{fontSize:10}} tickLine={false} axisLine={false}/>
                      <Tooltip formatter={(value: any, name: any) => [Math.round(Number(value)).toLocaleString('ar-IQ') + ' د.ع', name]} labelStyle={{fontFamily:'system-ui',fontWeight:700}} contentStyle={{direction:'rtl',fontSize:12,borderRadius:8}}/>
                      <Bar dataKey="الرواتب" fill="#1e40af" radius={[4,4,0,0]}/>
                      <Bar dataKey="المصروفات" fill="#dc2626" radius={[4,4,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              </>
              )}
            </div>
          )}

          {/* دفاع في العمق: قسم غير مصرَّح به وصل إليه activeSection لأي سبب (يشمل لوحة المعلومات نفسها إن أُخفيت) */}
          {!isSectionAllowed(activeSection) && (
            <div style={{textAlign:'center',padding:'80px 24px'}}>
              <div style={{fontSize:'var(--text-lg)',fontWeight:'var(--weight-bold)',color:'var(--color-danger)',marginBottom:8}}>ليس لديك صلاحية الوصول لهذا القسم</div>
              <div style={{fontSize:'var(--text-sm)',color:'var(--color-text-muted)'}}>جارٍ إعادة التوجيه...</div>
            </div>
          )}

          {/* الأقسام */}
          {activeSection === 'tasks' && user && userRole && canView(perms, 'tasks') && (
            <Tasks currentUserId={user.id} currentUserRole={userRole} currentUserEmail={user.email || ''} canEditTasks={canEdit(perms, 'tasks')} />
          )}
          {activeSection === 'documents' && canView(perms, 'documents') && <Documents readOnly={!canEdit(perms, 'documents')} />}
          {activeSection === 'custody' && canView(perms, 'custody') && <Custody readOnly={!canEdit(perms, 'custody')} />}
          {activeSection === 'contracts' && canView(perms, 'contracts') && <Contracts readOnly={!canEdit(perms, 'contracts')} />}
          {activeSection === 'overtime' && canView(perms, 'overtime') && <Overtime readOnly={!canEdit(perms, 'overtime')} />}
          {activeSection === 'recruitment' && canView(perms, 'recruitment') && <Recruitment readOnly={!canEdit(perms, 'recruitment')} />}
          {activeSection === 'reports' && canView(perms, 'reports') && <Reports />}
          {activeSection === 'activity_log' && userRole === 'editor' && <ActivityLog />}
          {activeSection === 'users' && userRole === 'editor' && user && <Users currentUserId={user.id} />}
          {activeSection === 'backup' && userRole === 'editor' && <Backup />}
          {activeSection === 'employees' && canView(perms, 'employees') && <Employees readOnly={!canEdit(perms, 'employees')} />}
          {activeSection === 'attendance' && canView(perms, 'attendance') && <Attendance readOnly={!canEdit(perms, 'attendance')} userRole={userRole || ''} />}
          {activeSection === 'fingerprint' && canView(perms, 'fingerprint') && <Fingerprint readOnly={!canEdit(perms, 'fingerprint')} />}
          {activeSection === 'visa' && canView(perms, 'visa') && <Visa readOnly={!canEdit(perms, 'visa')} />}
          {activeSection === 'payroll' && canView(perms, 'payroll') && <Payroll readOnly={!canEdit(perms, 'payroll')} userRole={userRole || ''} />}

          {/* قسم الحسابات: مصاريف + وصولات */}
          {activeSection === 'finance' && canView(perms, 'finance') && (
            <div>
              <div style={{margin:'24px 24px 0',display:'flex',gap:6,background:'var(--color-border)',padding:4,borderRadius:'var(--radius-lg)',width:'fit-content'}}>
                <button onClick={()=>setFinanceTab('expenses')}
                  style={{padding:'8px 20px',fontSize:'var(--text-base)',border:'none',borderRadius:'var(--radius-md)',cursor:'pointer',fontWeight:'var(--weight-semibold)',
                    background:financeTab==='expenses'?'var(--color-surface)':'transparent',color:financeTab==='expenses'?'var(--color-success)':'var(--color-text-muted)',
                    boxShadow:financeTab==='expenses'?'var(--shadow-xs)':'none'}}>
                  المصاريف
                </button>
                <button onClick={()=>setFinanceTab('receipts')}
                  style={{padding:'8px 20px',fontSize:'var(--text-base)',border:'none',borderRadius:'var(--radius-md)',cursor:'pointer',fontWeight:'var(--weight-semibold)',
                    background:financeTab==='receipts'?'var(--color-surface)':'transparent',color:financeTab==='receipts'?'var(--color-success)':'var(--color-text-muted)',
                    boxShadow:financeTab==='receipts'?'var(--shadow-xs)':'none'}}>
                  الوصولات
                </button>
              </div>
              {financeTab === 'expenses' && <Finance readOnly={!canEdit(perms, 'finance')} />}
              {financeTab === 'receipts' && <Receipts readOnly={!canEdit(perms, 'finance')} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
