'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { logActivity } from '../logActivity'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

interface VisaStat {
  id: string
  category: string
  nationality: string
  count: number
}

interface VisaFile {
  id: string
  category: string
  nationality: string
  file_name: string
  file_url: string
  uploaded_at: string
}

interface TouristVisa {
  id: string
  full_name: string
  nationality: string
  passport_number: string
  entry_date: string
  visa_duration: number
  expiry_date: string
  status: string
  notes: string
  created_at: string
}

interface AnnualVisa {
  id: string
  full_name: string
  nationality: string
  passport_number: string
  entry_date: string
  expiry_date: string
  status: string
  notes: string
  created_at: string
}

interface VisaCycle {
  id: string
  person_name: string
  passport_number: string | null
  nationality: string | null
  visa_expired_date: string
  exit_visa_issued_date: string | null
  new_visa_obtained: boolean
  new_visa_type: string | null
  new_visa_number: string | null
  departure_date: string | null
  departure_notes: string | null
  return_date: string | null
  status: string
  notes: string | null
  created_at: string
}

const categories = [
  { key: 'total', label: 'إجمالي الأجانب', icon: '👥', color: '#1e40af', bg: '#dbeafe' },
  { key: 'multiple_visa', label: 'حاصلون على فيزا متعددة', icon: '✅', color: '#15803d', bg: '#dcfce7' },
  { key: 'applied_multiple', label: 'مقدمون على فيزا متعددة', icon: '📋', color: '#b45309', bg: '#fef9c3' },
  { key: 'violators', label: 'مخالفون', icon: '⚠️', color: '#dc2626', bg: '#fee2e2' },
  { key: 'tourist_visas', label: 'التأشيرات السياحية', icon: '✈️', color: '#7c3aed', bg: '#ede9fe' },
]

const nationalities = [
  { key: 'chinese', label: 'صينيين', flag: '🇨🇳' },
  { key: 'pakistani', label: 'باكستانيين', flag: '🇵🇰' },
]

export default function Visa({ readOnly = false }: { readOnly?: boolean }) {
  const [activeTab, setActiveTab] = useState<'stats' | 'tourist' | 'annual' | 'cycles'>('stats')
  const [stats, setStats] = useState<VisaStat[]>([])
  const [files, setFiles] = useState<VisaFile[]>([])
  const [loading, setLoading] = useState(false)
  const [editMode, setEditMode] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, number>>({})
  const [uploading, setUploading] = useState<string | null>(null)

  // Tourist visa states
  const [touristVisas, setTouristVisas] = useState<TouristVisa[]>([])
  const [showTouristForm, setShowTouristForm] = useState(false)
  const [touristForm, setTouristForm] = useState({ full_name: '', nationality: '', passport_number: '', entry_date: '', visa_duration: '30' })
  const [touristSearch, setTouristSearch] = useState('')
  const [touristSelected, setTouristSelected] = useState<string[]>([])

  // Annual visa states
  const [annualVisas, setAnnualVisas] = useState<AnnualVisa[]>([])
  const [showAnnualForm, setShowAnnualForm] = useState(false)
  const [annualForm, setAnnualForm] = useState({ full_name: '', nationality: '', passport_number: '', entry_date: '' })
  const [annualSearch, setAnnualSearch] = useState('')
  const [annualSelected, setAnnualSelected] = useState<string[]>([])

  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [todayStr, setTodayStr] = useState('')

  // Visa cycle states (دورات المغادرة والعودة)
  const [cycles, setCycles] = useState<VisaCycle[]>([])
  const [cycleView, setCycleView] = useState<'active' | 'completed'>('active')
  const [showCycleForm, setShowCycleForm] = useState(false)
  const [cycleForm, setCycleForm] = useState({ person_name: '', passport_number: '', nationality: '', visa_expired_date: '' })
  const [cycleSearch, setCycleSearch] = useState('')
  const [cycleSaving, setCycleSaving] = useState(false)
  const [stageInputs, setStageInputs] = useState<Record<string, any>>({})

  useEffect(() => {
    const t = new Date().toISOString().split('T')[0]
    setTodayStr(t)
    loadStats()
    loadFiles()
    loadTouristVisas()
    loadAnnualVisas()
    loadCycles()
  }, [])

  // ===== دورات المغادرة والعودة =====
  async function loadCycles() {
    const { data } = await supabase.from('visa_cycles').select('*').order('created_at', { ascending: false })
    setCycles((data as VisaCycle[]) || [])
  }

  function cycleDaysInfo(c: VisaCycle) {
    const today = new Date(new Date().toDateString())
    // فترة السماح: 60 يوماً من انتهاء الفيزا
    const graceEnd = new Date(c.visa_expired_date)
    graceEnd.setDate(graceEnd.getDate() + 60)
    const graceDaysLeft = Math.ceil((graceEnd.getTime() - today.getTime()) / 86400000)
    // فيزا المغادرة: 10 أيام من الإصدار
    let exitDaysLeft: number | null = null
    if (c.exit_visa_issued_date) {
      const exitEnd = new Date(c.exit_visa_issued_date)
      exitEnd.setDate(exitEnd.getDate() + 10)
      exitDaysLeft = Math.ceil((exitEnd.getTime() - today.getTime()) / 86400000)
    }
    return { graceDaysLeft, graceEnd, exitDaysLeft }
  }

  async function createCycle() {
    if (!cycleForm.person_name || !cycleForm.visa_expired_date) { alert('يرجى تعبئة الاسم وتاريخ انتهاء الفيزا'); return }
    setCycleSaving(true)
    const { error } = await supabase.from('visa_cycles').insert([{
      person_name: cycleForm.person_name,
      passport_number: cycleForm.passport_number || null,
      nationality: cycleForm.nationality || null,
      visa_expired_date: cycleForm.visa_expired_date,
      status: 'grace_period'
    }])
    if (error) alert('خطأ: ' + error.message)
    else {
      await logActivity('بدء دورة مغادرة وعودة', 'visa', `بدء دورة لـ ${cycleForm.person_name}`)
      setCycleForm({ person_name: '', passport_number: '', nationality: '', visa_expired_date: '' })
      setShowCycleForm(false)
      await loadCycles()
    }
    setCycleSaving(false)
  }

  async function registerExitVisa(c: VisaCycle) {
    const date = stageInputs[c.id]?.exitDate
    if (!date) { alert('يرجى تحديد تاريخ إصدار فيزا المغادرة'); return }
    await supabase.from('visa_cycles').update({ exit_visa_issued_date: date, status: 'exit_visa_issued' }).eq('id', c.id)
    await logActivity('تسجيل فيزا مغادرة', 'visa', `فيزا مغادرة لـ ${c.person_name}`)
    setStageInputs(prev => ({ ...prev, [c.id]: {} }))
    await loadCycles()
  }

  async function registerDeparture(c: VisaCycle) {
    const date = stageInputs[c.id]?.depDate
    if (!date) { alert('يرجى تحديد تاريخ المغادرة'); return }
    await supabase.from('visa_cycles').update({
      departure_date: date,
      departure_notes: stageInputs[c.id]?.depNotes || null,
      status: 'departed'
    }).eq('id', c.id)
    await logActivity('تسجيل مغادرة', 'visa', `${c.person_name} غادر العراق`)
    setStageInputs(prev => ({ ...prev, [c.id]: {} }))
    await loadCycles()
  }

  async function registerReturn(c: VisaCycle) {
    const date = stageInputs[c.id]?.retDate
    if (!date) { alert('يرجى تحديد تاريخ العودة'); return }
    if (!confirm(`تسجيل عودة ${c.person_name} إلى العراق؟ ستكتمل الدورة وتُنقل للأرشيف.`)) return
    await supabase.from('visa_cycles').update({ return_date: date, status: 'completed' }).eq('id', c.id)
    await logActivity('تسجيل عودة', 'visa', `${c.person_name} عاد إلى العراق — اكتملت الدورة`)
    setStageInputs(prev => ({ ...prev, [c.id]: {} }))
    await loadCycles()
  }

  async function saveNewVisaInfo(c: VisaCycle) {
    const inp = stageInputs[c.id] || {}
    await supabase.from('visa_cycles').update({
      new_visa_obtained: true,
      new_visa_type: inp.nvType || 'سياحية',
      new_visa_number: inp.nvNumber || null
    }).eq('id', c.id)
    await logActivity('تسجيل حصول على فيزا جديدة', 'visa', `${c.person_name} حصل على الفيزا الجديدة`)
    setStageInputs(prev => ({ ...prev, [c.id]: {} }))
    await loadCycles()
  }

  async function deleteCycle(c: VisaCycle) {
    if (!confirm(`هل أنت متأكد من حذف دورة ${c.person_name} نهائياً؟`)) return
    await supabase.from('visa_cycles').delete().eq('id', c.id)
    await logActivity('حذف دورة مغادرة', 'visa', `حذف دورة ${c.person_name}`)
    await loadCycles()
  }

  function updateStageInput(cycleId: string, key: string, value: any) {
    setStageInputs(prev => ({ ...prev, [cycleId]: { ...(prev[cycleId] || {}), [key]: value } }))
  }

  async function loadStats() {
    setLoading(true)
    const { data } = await supabase.from('visa_stats').select('*')
    setStats((data as VisaStat[]) || [])
    setLoading(false)
  }

  async function loadFiles() {
    const { data } = await supabase.from('visa_files').select('*').order('uploaded_at', { ascending: false })
    setFiles((data as VisaFile[]) || [])
  }

  async function loadTouristVisas() {
    const { data } = await supabase.from('tourist_visas').select('*').order('created_at', { ascending: false })
    const visas = (data as TouristVisa[]) || []
    const today = new Date(); today.setHours(0,0,0,0)
    for (const visa of visas) {
      const expiry = new Date(visa.expiry_date); expiry.setHours(0,0,0,0)
      if (expiry < today && visa.status !== 'violated') {
        await supabase.from('tourist_visas').update({ status: 'violated' }).eq('id', visa.id)
      }
    }
    const { data: updated } = await supabase.from('tourist_visas').select('*').order('created_at', { ascending: false })
    setTouristVisas((updated as TouristVisa[]) || [])
  }

  async function loadAnnualVisas() {
    const { data } = await supabase.from('annual_visas').select('*').order('created_at', { ascending: false })
    const visas = (data as AnnualVisa[]) || []
    const today = new Date(); today.setHours(0,0,0,0)
    for (const visa of visas) {
      const expiry = new Date(visa.expiry_date); expiry.setHours(0,0,0,0)
      if (expiry < today && visa.status !== 'violated') {
        await supabase.from('annual_visas').update({ status: 'violated' }).eq('id', visa.id)
      }
    }
    const { data: updated } = await supabase.from('annual_visas').select('*').order('created_at', { ascending: false })
    setAnnualVisas((updated as AnnualVisa[]) || [])
  }

  function getDaysRemaining(expiryDate: string): number {
    const today = new Date(); today.setHours(0,0,0,0)
    const expiry = new Date(expiryDate); expiry.setHours(0,0,0,0)
    return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  function getTouristStatus(visa: TouristVisa) {
    if (visa.status === 'violated') return { label: 'مخالف', bg: '#fee2e2', color: '#dc2626' }
    const days = getDaysRemaining(visa.expiry_date)
    if (days <= 0) return { label: 'منتهية', bg: '#fee2e2', color: '#dc2626' }
    if (days <= 7) return { label: days + ' أيام', bg: '#fef9c3', color: '#b45309' }
    return { label: days + ' يوم', bg: '#dcfce7', color: '#15803d' }
  }

  function getAnnualStatus(visa: AnnualVisa) {
    if (visa.status === 'violated') return { label: 'مخالف', bg: '#fee2e2', color: '#dc2626' }
    const days = getDaysRemaining(visa.expiry_date)
    const fourMonthsDays = 120
    if (days <= 0) return { label: 'منتهية', bg: '#fee2e2', color: '#dc2626' }
    if (days <= fourMonthsDays) return { label: days + ' يوم', bg: '#fef9c3', color: '#b45309' }
    return { label: days + ' يوم', bg: '#dcfce7', color: '#15803d' }
  }

  const touristViolated = touristVisas.filter(v => v.status === 'violated' || getDaysRemaining(v.expiry_date) <= 0).length
  const touristWarning = touristVisas.filter(v => v.status !== 'violated' && getDaysRemaining(v.expiry_date) > 0 && getDaysRemaining(v.expiry_date) <= 7).length
  const annualViolated = annualVisas.filter(v => v.status === 'violated' || getDaysRemaining(v.expiry_date) <= 0).length
  const annualWarning = annualVisas.filter(v => v.status !== 'violated' && getDaysRemaining(v.expiry_date) > 0 && getDaysRemaining(v.expiry_date) <= 120).length

  async function addTouristVisa() {
    if (!touristForm.full_name || !touristForm.entry_date) { alert('يرجى تعبئة الاسم وتاريخ الدخول'); return }
    setLoading(true)
    const { error } = await supabase.from('tourist_visas').insert([{
      full_name: touristForm.full_name,
      nationality: touristForm.nationality,
      passport_number: touristForm.passport_number,
      entry_date: touristForm.entry_date,
      visa_duration: parseInt(touristForm.visa_duration),
      status: 'active'
    }])
    if (error) alert('خطأ: ' + error.message)
    else {
      setTouristForm({ full_name: '', nationality: '', passport_number: '', entry_date: '', visa_duration: '30' })
      setShowTouristForm(false)
      loadTouristVisas()
    }
    setLoading(false)
  }

  async function addAnnualVisa() {
    if (!annualForm.full_name || !annualForm.entry_date) { alert('يرجى تعبئة الاسم وتاريخ الدخول'); return }
    setLoading(true)
    const { error } = await supabase.from('annual_visas').insert([{
      full_name: annualForm.full_name,
      nationality: annualForm.nationality,
      passport_number: annualForm.passport_number,
      entry_date: annualForm.entry_date,
      status: 'active'
    }])
    if (error) alert('خطأ: ' + error.message)
    else {
      setAnnualForm({ full_name: '', nationality: '', passport_number: '', entry_date: '' })
      setShowAnnualForm(false)
      loadAnnualVisas()
    }
    setLoading(false)
  }

  async function deleteTouristVisa(id: string) {
    if (!confirm('هل أنت متأكد من الحذف؟')) return
    const visa = touristVisas.find(v => v.id === id)
    await supabase.from('tourist_visas').delete().eq('id', id)
    await logActivity('حذف تأشيرة سياحية', 'visa', `حذف تأشيرة ${visa?.full_name || ''}`)
    loadTouristVisas()
  }

  async function deleteAnnualVisa(id: string) {
    if (!confirm('هل أنت متأكد من الحذف؟')) return
    const visa = annualVisas.find(v => v.id === id)
    await supabase.from('annual_visas').delete().eq('id', id)
    await logActivity('حذف تأشيرة سنوية', 'visa', `حذف تأشيرة ${visa?.full_name || ''}`)
    loadAnnualVisas()
  }

  async function deleteSelectedTourist() {
    if (touristSelected.length === 0) return
    if (!confirm('هل أنت متأكد من حذف ' + touristSelected.length + ' شخص محدد؟')) return
    await supabase.from('tourist_visas').delete().in('id', touristSelected)
    await logActivity('حذف تأشيرات سياحية جماعي', 'visa', `حذف ${touristSelected.length} تأشيرة سياحية`)
    setTouristSelected([])
    loadTouristVisas()
  }

  async function deleteSelectedAnnual() {
    if (annualSelected.length === 0) return
    if (!confirm('هل أنت متأكد من حذف ' + annualSelected.length + ' شخص محدد؟')) return
    await supabase.from('annual_visas').delete().in('id', annualSelected)
    await logActivity('حذف تأشيرات سنوية جماعي', 'visa', `حذف ${annualSelected.length} تأشيرة سنوية`)
    setAnnualSelected([])
    loadAnnualVisas()
  }

  async function saveTouristNote(id: string) {
    await supabase.from('tourist_visas').update({ notes: noteText }).eq('id', id)
    setEditingNote(null); setNoteText('')
    loadTouristVisas()
  }

  async function saveAnnualNote(id: string) {
    await supabase.from('annual_visas').update({ notes: noteText }).eq('id', id)
    setEditingNote(null); setNoteText('')
    loadAnnualVisas()
  }

  function getCount(category: string, nationality: string): number {
    const stat = stats.find(s => s.category === category && s.nationality === nationality)
    return stat?.count || 0
  }
  function getTotal(category: string): number {
    return getCount(category, 'chinese') + getCount(category, 'pakistani')
  }
  function startEdit(category: string) {
    const vals: Record<string, number> = {}
    nationalities.forEach(n => { vals[n.key] = getCount(category, n.key) })
    setEditValues(vals)
    setEditMode(category)
  }
  async function saveEdit(category: string) {
    setLoading(true)
    for (const nat of nationalities) {
      await supabase.from('visa_stats').upsert({
        category, nationality: nat.key, count: editValues[nat.key] || 0, updated_at: new Date().toISOString()
      }, { onConflict: 'category,nationality' })
    }
    await loadStats()
    setEditMode(null)
    setLoading(false)
  }

  async function handleFileUpload(category: string, nationality: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const key = category + '_' + nationality
    setUploading(key)
    const fileExt = file.name.split('.').pop()
    const fileName = `${category}_${nationality}_${Date.now()}.${fileExt}`
    const { data, error } = await supabase.storage.from('visa-files').upload(fileName, file)
    if (error) {
      await supabase.from('visa_files').insert([{ category, nationality, file_name: file.name, file_url: '' }])
    } else {
      const { data: urlData } = supabase.storage.from('visa-files').getPublicUrl(data.path)
      await supabase.from('visa_files').insert([{ category, nationality, file_name: file.name, file_url: urlData.publicUrl }])
    }
    await loadFiles()
    setUploading(null)
    e.target.value = ''
  }

  async function deleteFile(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذا الملف؟')) return
    await supabase.from('visa_files').delete().eq('id', id)
    loadFiles()
  }

  function getFiles(category: string, nationality: string): VisaFile[] {
    return files.filter(f => f.category === category && f.nationality === nationality)
  }

  const grandTotal = getTotal('total')
  const totalViolatorsCombined = getTotal('violators') + touristViolated + annualViolated
  const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, border:'2px solid #d1d5db', fontSize:13, boxSizing:'border-box' as const, color:'#111827', background:'#fff', marginBottom:10 }

  const filteredTourist = useMemo(() => {
    if (!touristSearch.trim()) return touristVisas
    const term = touristSearch.toLowerCase()
    return touristVisas.filter(v => v.full_name.toLowerCase().includes(term) || (v.passport_number||'').toLowerCase().includes(term))
  }, [touristVisas, touristSearch])

  const filteredAnnual = useMemo(() => {
    if (!annualSearch.trim()) return annualVisas
    const term = annualSearch.toLowerCase()
    return annualVisas.filter(v => v.full_name.toLowerCase().includes(term) || (v.passport_number||'').toLowerCase().includes(term))
  }, [annualVisas, annualSearch])

  function toggleTouristSelect(id: string) {
    setTouristSelected(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id])
  }
  function toggleAnnualSelect(id: string) {
    setAnnualSelected(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id])
  }
  function toggleAllTourist() {
    if (touristSelected.length === filteredTourist.length) setTouristSelected([])
    else setTouristSelected(filteredTourist.map(v=>v.id))
  }
  function toggleAllAnnual() {
    if (annualSelected.length === filteredAnnual.length) setAnnualSelected([])
    else setAnnualSelected(filteredAnnual.map(v=>v.id))
  }

  return (
    <div style={{margin:'24px',fontFamily:'system-ui',direction:'rtl'}}>

      {/* تبويبات */}
      <div style={{display:'flex',gap:6,marginBottom:16,background:'#e5e7eb',padding:4,borderRadius:10,width:'fit-content',flexWrap:'wrap'}}>
        <button onClick={()=>setActiveTab('stats')}
          style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
            background:activeTab==='stats'?'#fff':'transparent',color:activeTab==='stats'?'#1e40af':'#6b7280',
            boxShadow:activeTab==='stats'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
          إحصائيات الأجانب
        </button>
        <button onClick={()=>setActiveTab('tourist')}
          style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
            background:activeTab==='tourist'?'#fff':'transparent',color:activeTab==='tourist'?'#1e40af':'#6b7280',
            boxShadow:activeTab==='tourist'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
          التأشيرات السياحية
          {(touristViolated > 0 || touristWarning > 0) && (
            <span style={{marginRight:6,background:'#dc2626',color:'#fff',borderRadius:20,padding:'1px 7px',fontSize:11,fontWeight:700}}>
              {touristViolated + touristWarning}
            </span>
          )}
        </button>
        <button onClick={()=>setActiveTab('annual')}
          style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
            background:activeTab==='annual'?'#fff':'transparent',color:activeTab==='annual'?'#1e40af':'#6b7280',
            boxShadow:activeTab==='annual'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
          التأشيرات السنوية
          {(annualViolated > 0 || annualWarning > 0) && (
            <span style={{marginRight:6,background:'#dc2626',color:'#fff',borderRadius:20,padding:'1px 7px',fontSize:11,fontWeight:700}}>
              {annualViolated + annualWarning}
            </span>
          )}
        </button>
        <button onClick={()=>setActiveTab('cycles')}
          style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
            background:activeTab==='cycles'?'#fff':'transparent',color:activeTab==='cycles'?'#1e40af':'#6b7280',
            boxShadow:activeTab==='cycles'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
          دورات المغادرة والعودة
          {(() => {
            const activeCycles = cycles.filter(c => c.status !== 'completed')
            const urgent = activeCycles.filter(c => {
              const info = cycleDaysInfo(c)
              return (c.status === 'grace_period' && info.graceDaysLeft <= 10) ||
                     (c.status === 'exit_visa_issued' && info.exitDaysLeft !== null && info.exitDaysLeft <= 5)
            }).length
            if (urgent > 0) return (
              <span style={{marginRight:6,background:'#dc2626',color:'#fff',borderRadius:20,padding:'1px 7px',fontSize:11,fontWeight:700}}>
                {urgent}
              </span>
            )
            if (activeCycles.length > 0) return (
              <span style={{marginRight:6,background:'#dbeafe',color:'#1d4ed8',borderRadius:20,padding:'1px 7px',fontSize:11,fontWeight:700}}>
                {activeCycles.length}
              </span>
            )
            return null
          })()}
        </button>
      </div>

      {/* قسم الإحصائيات */}
      {activeTab === 'stats' && (
        <div>
          <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden',marginBottom:20}}>
            <div style={{padding:'16px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <h2 style={{margin:0,fontSize:17,fontWeight:700,color:'#111827'}}>إحصائيات الأجانب والتأشيرات</h2>
              {readOnly && <span style={{fontSize:12,background:'#fef9c3',color:'#b45309',padding:'3px 10px',borderRadius:20,fontWeight:600}}>قراءة فقط</span>}
            </div>
            <div style={{padding:'20px'}}>
              <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:12}}>
                <div style={{background:'linear-gradient(135deg, #1e40af, #3b82f6)',borderRadius:12,padding:'20px 24px',color:'#fff',textAlign:'center'}}>
                  <div style={{fontSize:13,opacity:0.85,marginBottom:6}}>إجمالي الأجانب في الشركة</div>
                  <div style={{fontSize:48,fontWeight:700,marginBottom:4}}>{grandTotal}</div>
                  <div style={{fontSize:13,opacity:0.75}}>صينيين: {getCount('total','chinese')} — باكستانيين: {getCount('total','pakistani')}</div>
                </div>
                <div style={{background:'linear-gradient(135deg, #dc2626, #ef4444)',borderRadius:12,padding:'20px 24px',color:'#fff',textAlign:'center',display:'flex',flexDirection:'column',justifyContent:'center'}}>
                  <div style={{fontSize:13,opacity:0.85,marginBottom:6}}>إجمالي المخالفين (شامل التأشيرات)</div>
                  <div style={{fontSize:40,fontWeight:700}}>{totalViolatorsCombined}</div>
                </div>
              </div>
            </div>
          </div>

          {/* إحصائيات التأشيرات السياحية والسنوية */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20}}>
            {/* التأشيرات السياحية */}
            <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
              <div style={{padding:'14px 20px',background:'#eff6ff',borderBottom:'2px solid #bfdbfe',display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:20}}>✈️</span>
                <div>
                  <div style={{fontSize:15,fontWeight:700,color:'#1e40af'}}>التأشيرات السياحية</div>
                  <div style={{fontSize:13,color:'#6b7280',marginTop:2}}>الإجمالي: <strong style={{color:'#1e40af'}}>{touristVisas.length}</strong></div>
                </div>
              </div>
              <div style={{padding:'16px 20px'}}>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
                  <div style={{background:'#dcfce7',borderRadius:10,padding:'12px 14px',textAlign:'center'}}>
                    <div style={{fontSize:11,color:'#15803d',fontWeight:600,marginBottom:4}}>سارية</div>
                    <div style={{fontSize:26,fontWeight:700,color:'#15803d'}}>{touristVisas.length - touristViolated}</div>
                  </div>
                  <div style={{background:'#fee2e2',borderRadius:10,padding:'12px 14px',textAlign:'center'}}>
                    <div style={{fontSize:11,color:'#dc2626',fontWeight:600,marginBottom:4}}>مخالفون</div>
                    <div style={{fontSize:26,fontWeight:700,color:'#dc2626'}}>{touristViolated}</div>
                  </div>
                  <div style={{background:'#fef9c3',borderRadius:10,padding:'12px 14px',textAlign:'center'}}>
                    <div style={{fontSize:11,color:'#b45309',fontWeight:600,marginBottom:4}}>تنتهي قريباً</div>
                    <div style={{fontSize:26,fontWeight:700,color:'#b45309'}}>{touristWarning}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* التأشيرات السنوية */}
            <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
              <div style={{padding:'14px 20px',background:'#fdf4ff',borderBottom:'2px solid #e9d5ff',display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:20}}>📅</span>
                <div>
                  <div style={{fontSize:15,fontWeight:700,color:'#7c3aed'}}>التأشيرات السنوية</div>
                  <div style={{fontSize:13,color:'#6b7280',marginTop:2}}>الإجمالي: <strong style={{color:'#7c3aed'}}>{annualVisas.length}</strong></div>
                </div>
              </div>
              <div style={{padding:'16px 20px'}}>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
                  <div style={{background:'#dcfce7',borderRadius:10,padding:'12px 14px',textAlign:'center'}}>
                    <div style={{fontSize:11,color:'#15803d',fontWeight:600,marginBottom:4}}>سارية</div>
                    <div style={{fontSize:26,fontWeight:700,color:'#15803d'}}>{annualVisas.length - annualViolated}</div>
                  </div>
                  <div style={{background:'#fee2e2',borderRadius:10,padding:'12px 14px',textAlign:'center'}}>
                    <div style={{fontSize:11,color:'#dc2626',fontWeight:600,marginBottom:4}}>مخالفون</div>
                    <div style={{fontSize:26,fontWeight:700,color:'#dc2626'}}>{annualViolated}</div>
                  </div>
                  <div style={{background:'#fef9c3',borderRadius:10,padding:'12px 14px',textAlign:'center'}}>
                    <div style={{fontSize:11,color:'#b45309',fontWeight:600,marginBottom:4}}>تنتهي قريباً</div>
                    <div style={{fontSize:26,fontWeight:700,color:'#b45309'}}>{annualWarning}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {categories.map(cat => (
            <div key={cat.key} style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden',marginBottom:16}}>
              <div style={{padding:'14px 20px',background:cat.bg,borderBottom:`2px solid ${cat.color}22`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:20}}>{cat.icon}</span>
                  <div>
                    <div style={{fontSize:15,fontWeight:700,color:cat.color}}>{cat.label}</div>
                    <div style={{fontSize:13,color:'#6b7280',marginTop:2}}>المجموع: <strong style={{color:cat.color}}>{getTotal(cat.key)}</strong></div>
                  </div>
                </div>
                {!readOnly && (
                  editMode === cat.key ? (
                    <div style={{display:'flex',gap:8}}>
                      <button onClick={()=>saveEdit(cat.key)} disabled={loading}
                        style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'7px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                        {loading ? '...' : 'حفظ'}
                      </button>
                      <button onClick={()=>setEditMode(null)}
                        style={{background:'#e5e7eb',color:'#374151',border:'none',borderRadius:8,padding:'7px 14px',cursor:'pointer',fontSize:13}}>
                        إلغاء
                      </button>
                    </div>
                  ) : (
                    <button onClick={()=>startEdit(cat.key)}
                      style={{background:'#fff',color:cat.color,border:`1px solid ${cat.color}`,borderRadius:8,padding:'7px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                      تعديل
                    </button>
                  )
                )}
              </div>
              <div style={{padding:'16px 20px'}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  {nationalities.map(nat => (
                    <div key={nat.key} style={{background:'#f9fafb',borderRadius:10,padding:'14px 16px',border:'1px solid #e5e7eb'}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                        <div style={{fontSize:14,fontWeight:600,color:'#374151'}}>{nat.flag} {nat.label}</div>
                        {editMode === cat.key ? (
                          <input type="number" min="0" value={editValues[nat.key] || 0}
                            onChange={e=>setEditValues({...editValues,[nat.key]:parseInt(e.target.value)||0})}
                            style={{width:80,padding:'6px 10px',borderRadius:8,border:'2px solid #d1d5db',fontSize:16,fontWeight:700,textAlign:'center',color:'#111827'}}/>
                        ) : (
                          <div style={{fontSize:28,fontWeight:700,color:cat.color}}>{getCount(cat.key, nat.key)}</div>
                        )}
                      </div>
                      <div style={{borderTop:'1px solid #e5e7eb',paddingTop:10,marginTop:4}}>
                        <div style={{fontSize:12,color:'#6b7280',marginBottom:6,fontWeight:500}}>الملفات المرفوعة:</div>
                        {getFiles(cat.key, nat.key).length === 0 ? (
                          <div style={{fontSize:12,color:'#9ca3af'}}>لا توجد ملفات</div>
                        ) : (
                          <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:8}}>
                            {getFiles(cat.key, nat.key).map(f => (
                              <div key={f.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'#fff',borderRadius:6,padding:'5px 8px',border:'1px solid #e5e7eb'}}>
                                <div style={{display:'flex',alignItems:'center',gap:6}}>
                                  <span style={{fontSize:16}}>📄</span>
                                  {f.file_url ? (
                                    <a href={f.file_url} target="_blank" rel="noreferrer" style={{fontSize:12,color:'#1d4ed8',textDecoration:'none',fontWeight:500}}>{f.file_name}</a>
                                  ) : (<span style={{fontSize:12,color:'#374151'}}>{f.file_name}</span>)}
                                </div>
                                {!readOnly && (<button onClick={()=>deleteFile(f.id)} style={{background:'none',border:'none',color:'#dc2626',cursor:'pointer',fontSize:14,padding:'0 4px'}}>✕</button>)}
                              </div>
                            ))}
                          </div>
                        )}
                        {!readOnly && (
                          <label style={{display:'inline-flex',alignItems:'center',gap:6,background:'#eff6ff',color:'#1d4ed8',border:'1px dashed #93c5fd',borderRadius:8,padding:'6px 12px',cursor:'pointer',fontSize:12,fontWeight:500}}>
                            {uploading === cat.key+'_'+nat.key ? 'جارٍ الرفع...' : 'رفع ملف Excel'}
                            <input type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={e=>handleFileUpload(cat.key, nat.key, e)} disabled={uploading !== null}/>
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* قسم التأشيرات السياحية */}
      {activeTab === 'tourist' && (
        <div>
          {touristViolated > 0 && (
            <div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:10,padding:'12px 16px',marginBottom:12,display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:14,fontWeight:600,color:'#dc2626'}}>{touristViolated} شخص منتهية تأشيرته ويعتبر مخالفاً</span>
            </div>
          )}
          {touristWarning > 0 && (
            <div style={{background:'#fef9c3',border:'1px solid #fcd34d',borderRadius:10,padding:'12px 16px',marginBottom:12,display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:14,fontWeight:600,color:'#b45309'}}>{touristWarning} شخص تأشيرته تنتهي خلال 7 أيام</span>
            </div>
          )}

          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
            <div style={{background:'#fff',borderRadius:10,padding:'14px 16px',boxShadow:'0 1px 4px rgba(0,0,0,0.06)',textAlign:'center'}}>
              <div style={{fontSize:12,color:'#6b7280',fontWeight:600,marginBottom:4}}>إجمالي</div>
              <div style={{fontSize:28,fontWeight:700,color:'#1e40af'}}>{touristVisas.length}</div>
            </div>
            <div style={{background:'#fee2e2',borderRadius:10,padding:'14px 16px',textAlign:'center'}}>
              <div style={{fontSize:12,color:'#dc2626',fontWeight:600,marginBottom:4}}>مخالفون</div>
              <div style={{fontSize:28,fontWeight:700,color:'#dc2626'}}>{touristViolated}</div>
            </div>
            <div style={{background:'#dcfce7',borderRadius:10,padding:'14px 16px',textAlign:'center'}}>
              <div style={{fontSize:12,color:'#15803d',fontWeight:600,marginBottom:4}}>سارية</div>
              <div style={{fontSize:28,fontWeight:700,color:'#15803d'}}>{touristVisas.length - touristViolated}</div>
            </div>
          </div>

          <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
            <div style={{padding:'16px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
              <h2 style={{margin:0,fontSize:17,fontWeight:700,color:'#111827'}}>التأشيرات السياحية</h2>
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <input placeholder="بحث بالاسم أو رقم الجواز..." value={touristSearch} onChange={e=>setTouristSearch(e.target.value)}
                  style={{padding:'8px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:13,color:'#111827',minWidth:200}}/>
                {!readOnly && touristSelected.length > 0 && (
                  <button onClick={deleteSelectedTourist}
                    style={{background:'#dc2626',color:'#fff',border:'none',borderRadius:8,padding:'8px 14px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                    حذف المحدد ({touristSelected.length})
                  </button>
                )}
                {!readOnly && (
                  <button onClick={()=>setShowTouristForm(!showTouristForm)}
                    style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:14,fontWeight:600}}>
                    {showTouristForm ? 'إلغاء' : '+ إضافة شخص'}
                  </button>
                )}
              </div>
            </div>

            {!readOnly && showTouristForm && (
              <div style={{padding:'20px',borderBottom:'2px solid #e5e7eb',background:'#f9fafb'}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,maxWidth:600}}>
                  <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>الاسم الكامل *</label>
                    <input value={touristForm.full_name} onChange={e=>setTouristForm({...touristForm,full_name:e.target.value})} placeholder="اسم الشخص" style={inputStyle}/></div>
                  <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>رقم الجواز</label>
                    <input value={touristForm.passport_number} onChange={e=>setTouristForm({...touristForm,passport_number:e.target.value})} placeholder="رقم الجواز" style={{...inputStyle,direction:'ltr',textAlign:'right'}}/></div>
                  <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>الجنسية</label>
                    <input value={touristForm.nationality} onChange={e=>setTouristForm({...touristForm,nationality:e.target.value})} placeholder="مثال: صيني" style={inputStyle}/></div>
                  <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>تاريخ الدخول *</label>
                    <input type="date" value={touristForm.entry_date} onChange={e=>setTouristForm({...touristForm,entry_date:e.target.value})} style={inputStyle}/></div>
                  <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>مدة الفيزا</label>
                    <select value={touristForm.visa_duration} onChange={e=>setTouristForm({...touristForm,visa_duration:e.target.value})} style={inputStyle}>
                      <option value="30">30 يوم</option>
                      <option value="60">60 يوم</option>
                    </select>
                  </div>
                </div>
                <button onClick={addTouristVisa} disabled={loading}
                  style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontSize:14,fontWeight:600}}>
                  {loading ? 'جارٍ الحفظ...' : 'حفظ'}
                </button>
              </div>
            )}

            {filteredTourist.length === 0 ? (
              <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لا توجد نتائج</div>
            ) : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr style={{background:'#f3f4f6'}}>
                      <th style={{padding:'10px 14px',borderBottom:'2px solid #e5e7eb'}}>
                        {!readOnly && <input type="checkbox" checked={touristSelected.length===filteredTourist.length && filteredTourist.length>0} onChange={toggleAllTourist}/>}
                      </th>
                      {['الاسم','رقم الجواز','الجنسية','تاريخ الدخول','المدة','تاريخ الانتهاء','الحالة','ملاحظات',''].map(h=>(
                        <th key={h} style={{padding:'10px 14px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTourist.map(visa=>{
                      const vs = getTouristStatus(visa)
                      return (
                        <tr key={visa.id} style={{borderBottom:'1px solid #e5e7eb',background:visa.status==='violated'?'#fff5f5':'#fff'}}>
                          <td style={{padding:'10px 14px'}}>
                            {!readOnly && <input type="checkbox" checked={touristSelected.includes(visa.id)} onChange={()=>toggleTouristSelect(visa.id)}/>}
                          </td>
                          <td style={{padding:'10px 14px',fontWeight:600,color:'#111827'}}>{visa.full_name}</td>
                          <td style={{padding:'10px 14px',color:'#6b7280',direction:'ltr',textAlign:'right'}}>{visa.passport_number || '—'}</td>
                          <td style={{padding:'10px 14px',color:'#6b7280'}}>{visa.nationality || '—'}</td>
                          <td style={{padding:'10px 14px',color:'#6b7280'}}>{visa.entry_date}</td>
                          <td style={{padding:'10px 14px',textAlign:'center'}}>
                            <span style={{background:'#dbeafe',color:'#1d4ed8',padding:'3px 10px',borderRadius:20,fontSize:12,fontWeight:600}}>{visa.visa_duration} يوم</span>
                          </td>
                          <td style={{padding:'10px 14px',color:'#374151',fontWeight:500}}>{visa.expiry_date}</td>
                          <td style={{padding:'10px 14px'}}>
                            <span style={{background:vs.bg,color:vs.color,padding:'4px 12px',borderRadius:20,fontSize:12,fontWeight:700}}>{vs.label}</span>
                          </td>
                          <td style={{padding:'10px 14px',maxWidth:200}}>
                            {editingNote === visa.id ? (
                              <div style={{display:'flex',gap:6}}>
                                <input value={noteText} onChange={e=>setNoteText(e.target.value)} style={{flex:1,padding:'5px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12,color:'#111827'}}/>
                                <button onClick={()=>saveTouristNote(visa.id)} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:12}}>حفظ</button>
                                <button onClick={()=>setEditingNote(null)} style={{background:'#e5e7eb',color:'#374151',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',fontSize:12}}>✕</button>
                              </div>
                            ) : (
                              <div style={{display:'flex',alignItems:'center',gap:6}}>
                                <span style={{fontSize:12,color:'#6b7280'}}>{visa.notes || '—'}</span>
                                {!readOnly && (<button onClick={()=>{ setEditingNote(visa.id); setNoteText(visa.notes||'') }} style={{background:'none',border:'none',color:'#1d4ed8',cursor:'pointer',fontSize:12,padding:'2px 6px'}}>تعديل</button>)}
                              </div>
                            )}
                          </td>
                          <td style={{padding:'10px 14px'}}>
                            {!readOnly && (
                              <button onClick={()=>deleteTouristVisa(visa.id)} style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:12,fontWeight:600}}>حذف</button>
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
      )}

      {/* قسم التأشيرات السنوية */}
      {activeTab === 'annual' && (
        <div>
          {annualViolated > 0 && (
            <div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:10,padding:'12px 16px',marginBottom:12,display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:14,fontWeight:600,color:'#dc2626'}}>{annualViolated} شخص منتهية تأشيرته ويعتبر مخالفاً</span>
            </div>
          )}
          {annualWarning > 0 && (
            <div style={{background:'#fef9c3',border:'1px solid #fcd34d',borderRadius:10,padding:'12px 16px',marginBottom:12,display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:14,fontWeight:600,color:'#b45309'}}>{annualWarning} شخص تأشيرته تنتهي خلال 4 أشهر أو أقل</span>
            </div>
          )}

          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
            <div style={{background:'#fff',borderRadius:10,padding:'14px 16px',boxShadow:'0 1px 4px rgba(0,0,0,0.06)',textAlign:'center'}}>
              <div style={{fontSize:12,color:'#6b7280',fontWeight:600,marginBottom:4}}>إجمالي</div>
              <div style={{fontSize:28,fontWeight:700,color:'#1e40af'}}>{annualVisas.length}</div>
            </div>
            <div style={{background:'#fee2e2',borderRadius:10,padding:'14px 16px',textAlign:'center'}}>
              <div style={{fontSize:12,color:'#dc2626',fontWeight:600,marginBottom:4}}>مخالفون</div>
              <div style={{fontSize:28,fontWeight:700,color:'#dc2626'}}>{annualViolated}</div>
            </div>
            <div style={{background:'#dcfce7',borderRadius:10,padding:'14px 16px',textAlign:'center'}}>
              <div style={{fontSize:12,color:'#15803d',fontWeight:600,marginBottom:4}}>سارية</div>
              <div style={{fontSize:28,fontWeight:700,color:'#15803d'}}>{annualVisas.length - annualViolated}</div>
            </div>
          </div>

          <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
            <div style={{padding:'16px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
              <h2 style={{margin:0,fontSize:17,fontWeight:700,color:'#111827'}}>التأشيرات السنوية</h2>
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <input placeholder="بحث بالاسم أو رقم الجواز..." value={annualSearch} onChange={e=>setAnnualSearch(e.target.value)}
                  style={{padding:'8px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:13,color:'#111827',minWidth:200}}/>
                {!readOnly && annualSelected.length > 0 && (
                  <button onClick={deleteSelectedAnnual}
                    style={{background:'#dc2626',color:'#fff',border:'none',borderRadius:8,padding:'8px 14px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                    حذف المحدد ({annualSelected.length})
                  </button>
                )}
                {!readOnly && (
                  <button onClick={()=>setShowAnnualForm(!showAnnualForm)}
                    style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:14,fontWeight:600}}>
                    {showAnnualForm ? 'إلغاء' : '+ إضافة شخص'}
                  </button>
                )}
              </div>
            </div>

            {!readOnly && showAnnualForm && (
              <div style={{padding:'20px',borderBottom:'2px solid #e5e7eb',background:'#f9fafb'}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,maxWidth:600}}>
                  <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>الاسم الكامل *</label>
                    <input value={annualForm.full_name} onChange={e=>setAnnualForm({...annualForm,full_name:e.target.value})} placeholder="اسم الشخص" style={inputStyle}/></div>
                  <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>رقم الجواز</label>
                    <input value={annualForm.passport_number} onChange={e=>setAnnualForm({...annualForm,passport_number:e.target.value})} placeholder="رقم الجواز" style={{...inputStyle,direction:'ltr',textAlign:'right'}}/></div>
                  <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>الجنسية</label>
                    <input value={annualForm.nationality} onChange={e=>setAnnualForm({...annualForm,nationality:e.target.value})} placeholder="مثال: صيني" style={inputStyle}/></div>
                  <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>تاريخ الدخول *</label>
                    <input type="date" value={annualForm.entry_date} onChange={e=>setAnnualForm({...annualForm,entry_date:e.target.value})} style={inputStyle}/></div>
                </div>
                <button onClick={addAnnualVisa} disabled={loading}
                  style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontSize:14,fontWeight:600}}>
                  {loading ? 'جارٍ الحفظ...' : 'حفظ'}
                </button>
              </div>
            )}

            {filteredAnnual.length === 0 ? (
              <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لا توجد نتائج</div>
            ) : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr style={{background:'#f3f4f6'}}>
                      <th style={{padding:'10px 14px',borderBottom:'2px solid #e5e7eb'}}>
                        {!readOnly && <input type="checkbox" checked={annualSelected.length===filteredAnnual.length && filteredAnnual.length>0} onChange={toggleAllAnnual}/>}
                      </th>
                      {['الاسم','رقم الجواز','الجنسية','تاريخ الدخول','تاريخ الانتهاء','الحالة','ملاحظات',''].map(h=>(
                        <th key={h} style={{padding:'10px 14px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAnnual.map(visa=>{
                      const vs = getAnnualStatus(visa)
                      return (
                        <tr key={visa.id} style={{borderBottom:'1px solid #e5e7eb',background:visa.status==='violated'?'#fff5f5':'#fff'}}>
                          <td style={{padding:'10px 14px'}}>
                            {!readOnly && <input type="checkbox" checked={annualSelected.includes(visa.id)} onChange={()=>toggleAnnualSelect(visa.id)}/>}
                          </td>
                          <td style={{padding:'10px 14px',fontWeight:600,color:'#111827'}}>{visa.full_name}</td>
                          <td style={{padding:'10px 14px',color:'#6b7280',direction:'ltr',textAlign:'right'}}>{visa.passport_number || '—'}</td>
                          <td style={{padding:'10px 14px',color:'#6b7280'}}>{visa.nationality || '—'}</td>
                          <td style={{padding:'10px 14px',color:'#6b7280'}}>{visa.entry_date}</td>
                          <td style={{padding:'10px 14px',color:'#374151',fontWeight:500}}>{visa.expiry_date}</td>
                          <td style={{padding:'10px 14px'}}>
                            <span style={{background:vs.bg,color:vs.color,padding:'4px 12px',borderRadius:20,fontSize:12,fontWeight:700}}>{vs.label}</span>
                          </td>
                          <td style={{padding:'10px 14px',maxWidth:200}}>
                            {editingNote === visa.id ? (
                              <div style={{display:'flex',gap:6}}>
                                <input value={noteText} onChange={e=>setNoteText(e.target.value)} style={{flex:1,padding:'5px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12,color:'#111827'}}/>
                                <button onClick={()=>saveAnnualNote(visa.id)} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:12}}>حفظ</button>
                                <button onClick={()=>setEditingNote(null)} style={{background:'#e5e7eb',color:'#374151',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',fontSize:12}}>✕</button>
                              </div>
                            ) : (
                              <div style={{display:'flex',alignItems:'center',gap:6}}>
                                <span style={{fontSize:12,color:'#6b7280'}}>{visa.notes || '—'}</span>
                                {!readOnly && (<button onClick={()=>{ setEditingNote(visa.id); setNoteText(visa.notes||'') }} style={{background:'none',border:'none',color:'#1d4ed8',cursor:'pointer',fontSize:12,padding:'2px 6px'}}>تعديل</button>)}
                              </div>
                            )}
                          </td>
                          <td style={{padding:'10px 14px'}}>
                            {!readOnly && (
                              <button onClick={()=>deleteAnnualVisa(visa.id)} style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:12,fontWeight:600}}>حذف</button>
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
      )}

      {/* تبويب دورات المغادرة والعودة */}
      {activeTab === 'cycles' && (() => {
        const activeCycles = cycles.filter(c => c.status !== 'completed')
        const completedCycles = cycles.filter(c => c.status === 'completed')
        // تنبيهات
        let exceededGrace = 0, graceUrgent = 0, exitUrgent = 0
        activeCycles.forEach(c => {
          const info = cycleDaysInfo(c)
          if (c.status === 'grace_period') {
            if (info.graceDaysLeft <= 0) exceededGrace++
            else if (info.graceDaysLeft <= 10) graceUrgent++
          }
          if (c.status === 'exit_visa_issued' && info.exitDaysLeft !== null && info.exitDaysLeft <= 5) exitUrgent++
        })
        const shownList = (cycleView === 'active' ? activeCycles : completedCycles).filter(c =>
          !cycleSearch.trim() || c.person_name.toLowerCase().includes(cycleSearch.toLowerCase()) || (c.passport_number || '').toLowerCase().includes(cycleSearch.toLowerCase())
        )
        const stageDot = (done: boolean, label: string, color: string) => (
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,flex:1}}>
            <div style={{width:22,height:22,borderRadius:'50%',background:done?color:'#e5e7eb',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:11,fontWeight:700}}>{done?'✓':''}</div>
            <span style={{fontSize:10,color:done?'#111827':'#9ca3af',fontWeight:done?700:400,textAlign:'center'}}>{label}</span>
          </div>
        )
        const stageLine = (done: boolean) => <div style={{flex:1,height:3,background:done?'#15803d':'#e5e7eb',borderRadius:2,marginTop:10}}/>
        const inputSm = { padding:'7px 10px', borderRadius:8, border:'2px solid #d1d5db', fontSize:12, color:'#111827', background:'#fff' }
        return (
          <div>
            {/* تنبيهات الدورات */}
            {(exceededGrace > 0 || graceUrgent > 0 || exitUrgent > 0) && (
              <div style={{background:'#fff',border:'1px solid #fca5a5',borderRadius:12,padding:'14px 20px',marginBottom:16,display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
                <span style={{fontSize:14,fontWeight:700,color:'#111827'}}>⚠ تنبيهات عاجلة:</span>
                {exceededGrace > 0 && <span style={{background:'#dc2626',color:'#fff',padding:'5px 14px',borderRadius:20,fontSize:12,fontWeight:700}}>{exceededGrace} تجاوز فترة السماح!</span>}
                {graceUrgent > 0 && <span style={{background:'#fee2e2',color:'#dc2626',padding:'5px 14px',borderRadius:20,fontSize:12,fontWeight:700}}>{graceUrgent} متبقٍ له ≤ 10 أيام من فترة السماح</span>}
                {exitUrgent > 0 && <span style={{background:'#fef9c3',color:'#b45309',padding:'5px 14px',borderRadius:20,fontSize:12,fontWeight:700}}>{exitUrgent} فيزا مغادرة تنتهي خلال ≤ 5 أيام — يجب السفر!</span>}
              </div>
            )}

            <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
              <div style={{padding:'14px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                <h2 style={{margin:0,fontSize:16,fontWeight:700,color:'#111827'}}>دورات المغادرة والعودة</h2>
                <div style={{display:'flex',gap:4,background:'#e5e7eb',padding:3,borderRadius:8}}>
                  <button onClick={()=>setCycleView('active')} style={{padding:'5px 14px',fontSize:12,border:'none',borderRadius:6,cursor:'pointer',fontWeight:600,background:cycleView==='active'?'#fff':'transparent',color:cycleView==='active'?'#1e40af':'#6b7280'}}>نشطة ({activeCycles.length})</button>
                  <button onClick={()=>setCycleView('completed')} style={{padding:'5px 14px',fontSize:12,border:'none',borderRadius:6,cursor:'pointer',fontWeight:600,background:cycleView==='completed'?'#fff':'transparent',color:cycleView==='completed'?'#1e40af':'#6b7280'}}>مكتملة ({completedCycles.length})</button>
                </div>
                <input placeholder="بحث بالاسم أو الجواز..." value={cycleSearch} onChange={e=>setCycleSearch(e.target.value)}
                  style={{padding:'8px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:12,color:'#111827',minWidth:190}}/>
                {!readOnly && cycleView === 'active' && (
                  <button onClick={()=>setShowCycleForm(!showCycleForm)}
                    style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:13,fontWeight:600,marginRight:'auto'}}>
                    {showCycleForm ? 'إلغاء' : '+ بدء دورة جديدة'}
                  </button>
                )}
              </div>

              {/* نموذج بدء دورة */}
              {showCycleForm && !readOnly && (
                <div style={{padding:'18px 20px',borderBottom:'2px solid #e5e7eb',background:'#f9fafb'}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:12,marginBottom:12}}>
                    <div>
                      <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>اسم الشخص *</label>
                      <input value={cycleForm.person_name} onChange={e=>setCycleForm({...cycleForm,person_name:e.target.value})} style={{...inputSm,width:'100%',boxSizing:'border-box'}}/>
                    </div>
                    <div>
                      <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>رقم الجواز</label>
                      <input value={cycleForm.passport_number} onChange={e=>setCycleForm({...cycleForm,passport_number:e.target.value})} style={{...inputSm,width:'100%',boxSizing:'border-box'}}/>
                    </div>
                    <div>
                      <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>الجنسية</label>
                      <select value={cycleForm.nationality} onChange={e=>setCycleForm({...cycleForm,nationality:e.target.value})} style={{...inputSm,width:'100%',boxSizing:'border-box'}}>
                        <option value="">اختر...</option>
                        <option value="صيني">صيني</option>
                        <option value="باكستاني">باكستاني</option>
                        <option value="أخرى">أخرى</option>
                      </select>
                    </div>
                    <div>
                      <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>تاريخ انتهاء الفيزا *</label>
                      <input type="date" value={cycleForm.visa_expired_date} onChange={e=>setCycleForm({...cycleForm,visa_expired_date:e.target.value})} style={{...inputSm,width:'100%',boxSizing:'border-box'}}/>
                    </div>
                  </div>
                  <button onClick={createCycle} disabled={cycleSaving}
                    style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'9px 22px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                    {cycleSaving ? 'جارٍ الحفظ...' : 'بدء الدورة (تبدأ فترة السماح 60 يوماً)'}
                  </button>
                </div>
              )}

              {/* عرض الدورات */}
              {shownList.length === 0 ? (
                <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>
                  {cycleView === 'active' ? 'لا توجد دورات نشطة' : 'لا توجد دورات مكتملة'}
                </div>
              ) : cycleView === 'completed' ? (
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <thead>
                      <tr style={{background:'#f3f4f6'}}>
                        {['الاسم','الجواز','الجنسية','انتهاء الفيزا','فيزا المغادرة','المغادرة','العودة','الفيزا الجديدة',''].map((h,i)=>(
                          <th key={i} style={{padding:'10px 12px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shownList.map(c => (
                        <tr key={c.id} style={{borderBottom:'1px solid #e5e7eb'}}>
                          <td style={{padding:'9px 12px',fontWeight:600,color:'#111827'}}>{c.person_name}</td>
                          <td style={{padding:'9px 12px',color:'#6b7280',direction:'ltr',textAlign:'right'}}>{c.passport_number||'—'}</td>
                          <td style={{padding:'9px 12px',color:'#6b7280'}}>{c.nationality||'—'}</td>
                          <td style={{padding:'9px 12px',color:'#6b7280'}}>{new Date(c.visa_expired_date).toLocaleDateString('ar-IQ')}</td>
                          <td style={{padding:'9px 12px',color:'#6b7280'}}>{c.exit_visa_issued_date?new Date(c.exit_visa_issued_date).toLocaleDateString('ar-IQ'):'—'}</td>
                          <td style={{padding:'9px 12px',color:'#6b7280'}}>{c.departure_date?new Date(c.departure_date).toLocaleDateString('ar-IQ'):'—'}</td>
                          <td style={{padding:'9px 12px',color:'#15803d',fontWeight:600}}>{c.return_date?new Date(c.return_date).toLocaleDateString('ar-IQ'):'—'}</td>
                          <td style={{padding:'9px 12px'}}>{c.new_visa_obtained?<span style={{background:'#dcfce7',color:'#15803d',padding:'2px 8px',borderRadius:20,fontSize:10,fontWeight:700}}>✓ {c.new_visa_type||''} {c.new_visa_number||''}</span>:'—'}</td>
                          <td style={{padding:'9px 12px'}}>
                            {!readOnly && <button onClick={()=>deleteCycle(c)} style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:11}}>حذف</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:16}}>
                  {shownList.map(c => {
                    const info = cycleDaysInfo(c)
                    const graceExceeded = c.status === 'grace_period' && info.graceDaysLeft <= 0
                    const gracePct = Math.max(0, Math.min(100, Math.round(((60 - info.graceDaysLeft) / 60) * 100)))
                    const si = stageInputs[c.id] || {}
                    return (
                      <div key={c.id} style={{border: graceExceeded ? '2px solid #dc2626' : '1px solid #e5e7eb', borderRadius:12, padding:'16px 18px', background: graceExceeded ? '#fef2f2' : '#fff'}}>
                        {/* رأس البطاقة */}
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10,marginBottom:12,flexWrap:'wrap'}}>
                          <div>
                            <div style={{fontSize:15,fontWeight:700,color:'#111827'}}>{c.person_name}</div>
                            <div style={{fontSize:12,color:'#6b7280',marginTop:2}}>
                              {c.nationality || '—'} {c.passport_number && <span style={{direction:'ltr',display:'inline-block'}}>• {c.passport_number}</span>} • انتهت فيزته: {new Date(c.visa_expired_date).toLocaleDateString('ar-IQ')}
                            </div>
                          </div>
                          <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                            {c.status === 'grace_period' && (graceExceeded
                              ? <span style={{background:'#dc2626',color:'#fff',padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:700}}>تجاوز فترة السماح بـ {Math.abs(info.graceDaysLeft)} يوم!</span>
                              : <span style={{background:info.graceDaysLeft<=10?'#fee2e2':'#fef9c3',color:info.graceDaysLeft<=10?'#dc2626':'#b45309',padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:700}}>متبقي {info.graceDaysLeft} يوم من فترة السماح</span>
                            )}
                            {c.status === 'exit_visa_issued' && info.exitDaysLeft !== null && (
                              info.exitDaysLeft <= 0
                                ? <span style={{background:'#dc2626',color:'#fff',padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:700}}>فيزا المغادرة منتهية!</span>
                                : <span style={{background:info.exitDaysLeft<=5?'#fee2e2':'#dbeafe',color:info.exitDaysLeft<=5?'#dc2626':'#1d4ed8',padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:700}}>{info.exitDaysLeft<=5?'⚠ ':''}متبقي {info.exitDaysLeft} يوم على فيزا المغادرة</span>
                            )}
                            {c.status === 'departed' && <span style={{background:'#ede9fe',color:'#7c3aed',padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:700}}>خارج العراق</span>}
                            {c.new_visa_obtained && <span style={{background:'#dcfce7',color:'#15803d',padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:700}}>✓ حاصل على الفيزا الجديدة {c.new_visa_type ? `(${c.new_visa_type})` : ''}</span>}
                            {!readOnly && <button onClick={()=>deleteCycle(c)} style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:11}}>حذف</button>}
                          </div>
                        </div>

                        {/* شريط فترة السماح */}
                        {c.status === 'grace_period' && !graceExceeded && (
                          <div style={{marginBottom:14}}>
                            <div style={{height:8,background:'#e5e7eb',borderRadius:4,overflow:'hidden'}}>
                              <div style={{height:'100%',width:gracePct+'%',background:info.graceDaysLeft<=10?'#dc2626':info.graceDaysLeft<=25?'#eab308':'#15803d',borderRadius:4,transition:'width 0.3s'}}/>
                            </div>
                          </div>
                        )}

                        {/* الخط الزمني */}
                        <div style={{display:'flex',alignItems:'flex-start',marginBottom:16,padding:'0 8px'}}>
                          {stageDot(true, 'فترة السماح', '#b45309')}
                          {stageLine(!!c.exit_visa_issued_date)}
                          {stageDot(!!c.exit_visa_issued_date, 'فيزا المغادرة', '#1d4ed8')}
                          {stageLine(c.new_visa_obtained)}
                          {stageDot(c.new_visa_obtained, 'الفيزا الجديدة', '#15803d')}
                          {stageLine(!!c.departure_date)}
                          {stageDot(!!c.departure_date, 'غادر العراق', '#7c3aed')}
                          {stageLine(!!c.return_date)}
                          {stageDot(!!c.return_date, 'عاد للعراق', '#0891b2')}
                        </div>

                        {/* إجراءات المرحلة الحالية */}
                        {!readOnly && (
                          <div style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'flex-end',borderTop:'1px solid #f3f4f6',paddingTop:12}}>
                            {c.status === 'grace_period' && (
                              <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
                                <div>
                                  <label style={{display:'block',marginBottom:3,fontSize:11,fontWeight:600,color:'#374151'}}>تاريخ إصدار فيزا المغادرة</label>
                                  <input type="date" value={si.exitDate||''} onChange={e=>updateStageInput(c.id,'exitDate',e.target.value)} style={inputSm}/>
                                </div>
                                <button onClick={()=>registerExitVisa(c)} style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:12,fontWeight:600}}>تسجيل فيزا المغادرة</button>
                              </div>
                            )}
                            {c.status === 'exit_visa_issued' && (
                              <div style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap'}}>
                                <div>
                                  <label style={{display:'block',marginBottom:3,fontSize:11,fontWeight:600,color:'#374151'}}>تاريخ المغادرة</label>
                                  <input type="date" value={si.depDate||''} onChange={e=>updateStageInput(c.id,'depDate',e.target.value)} style={inputSm}/>
                                </div>
                                <div>
                                  <label style={{display:'block',marginBottom:3,fontSize:11,fontWeight:600,color:'#374151'}}>ملاحظة (وجهة/رحلة، اختياري)</label>
                                  <input value={si.depNotes||''} onChange={e=>updateStageInput(c.id,'depNotes',e.target.value)} placeholder="مثال: دبي — FZ374" style={{...inputSm,minWidth:170}}/>
                                </div>
                                <button onClick={()=>registerDeparture(c)} style={{background:'#7c3aed',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:12,fontWeight:600}}>تسجيل المغادرة</button>
                              </div>
                            )}
                            {c.status === 'departed' && (
                              <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
                                <div>
                                  <label style={{display:'block',marginBottom:3,fontSize:11,fontWeight:600,color:'#374151'}}>تاريخ العودة إلى العراق</label>
                                  <input type="date" value={si.retDate||''} onChange={e=>updateStageInput(c.id,'retDate',e.target.value)} style={inputSm}/>
                                </div>
                                <button onClick={()=>registerReturn(c)} style={{background:'#0891b2',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:12,fontWeight:600}}>تسجيل العودة (إكمال الدورة)</button>
                              </div>
                            )}
                            {!c.new_visa_obtained && (
                              <div style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap',marginRight:'auto'}}>
                                <div>
                                  <label style={{display:'block',marginBottom:3,fontSize:11,fontWeight:600,color:'#374151'}}>نوع الفيزا الجديدة</label>
                                  <select value={si.nvType||'سياحية'} onChange={e=>updateStageInput(c.id,'nvType',e.target.value)} style={inputSm}>
                                    <option value="سياحية">سياحية</option>
                                    <option value="متعددة">متعددة</option>
                                  </select>
                                </div>
                                <div>
                                  <label style={{display:'block',marginBottom:3,fontSize:11,fontWeight:600,color:'#374151'}}>رقمها (اختياري)</label>
                                  <input value={si.nvNumber||''} onChange={e=>updateStageInput(c.id,'nvNumber',e.target.value)} style={{...inputSm,width:120}}/>
                                </div>
                                <button onClick={()=>saveNewVisaInfo(c)} style={{background:'#dcfce7',color:'#15803d',border:'1px solid #86efac',borderRadius:8,padding:'8px 14px',cursor:'pointer',fontSize:12,fontWeight:700}}>✓ حصل على الفيزا الجديدة</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
