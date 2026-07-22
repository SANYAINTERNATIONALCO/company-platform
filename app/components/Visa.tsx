'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
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
  group_name: string | null
  visa_expired_date: string
  exit_visa_issued_date: string | null
  new_visa_obtained: boolean
  new_visa_type: string | null
  new_visa_number: string | null
  new_visa_duration_days: number | null
  departure_date: string | null
  departure_time: string | null
  departure_notes: string | null
  return_date: string | null
  return_time: string | null
  status: string
  notes: string | null
  tourist_visa_created: boolean
  created_at: string
}

type BatchVisaType = 'tourist' | 'annual'
interface BatchRow { full_name: string; passport_number: string }
interface ExcelImportRow {
  full_name: string
  passport_number: string
  nationality: string
  entry_date: string
  visa_duration: string
  statusTag: 'new' | 'duplicate' | 'incomplete'
}
function normalizeHeaderText(s: string) {
  return s.replace(/[ً-ٰٟ]/g, '').replace(/\s+/g, ' ').trim()
}

function formatDateDMY(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length !== 3) return ''
  const [y, m, d] = parts
  return `${d}/${m}/${y}`
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
  const [activeTab, setActiveTab] = useState<'stats' | 'tourist' | 'annual' | 'cycles' | 'batch'>('stats')
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
  const [cycleForm, setCycleForm] = useState({ person_name: '', passport_number: '', nationality: '', visa_expired_date: '', group_name: '' })
  const [cycleSearch, setCycleSearch] = useState('')
  const [cycleSaving, setCycleSaving] = useState(false)
  const [stageInputs, setStageInputs] = useState<Record<string, any>>({})

  // ===== إضافة دفعة دورات مغادرة وعودة =====
  const [showCycleBatchForm, setShowCycleBatchForm] = useState(false)
  const [cycleBatchCommon, setCycleBatchCommon] = useState({ nationality: '', group_name: '', visa_expired_date: '' })
  const [cycleBatchRows, setCycleBatchRows] = useState<BatchRow[]>(Array.from({ length: 10 }, () => ({ full_name: '', passport_number: '' })))
  const [cycleBatchSaving, setCycleBatchSaving] = useState(false)
  const cycleBatchNameRefs = useRef<(HTMLInputElement | null)[]>([])
  const prevCycleBatchRowsLen = useRef(cycleBatchRows.length)

  // ===== toast للحفظ اللاصق =====
  const [toast, setToast] = useState<string | null>(null)
  const touristNameRef = useRef<HTMLInputElement>(null)
  const annualNameRef = useRef<HTMLInputElement>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(msg)
    toastTimerRef.current = setTimeout(() => setToast(null), 2000)
  }

  // ===== إضافة دفعة =====
  const [batchCommon, setBatchCommon] = useState({ type: 'tourist' as BatchVisaType, nationality: '', entry_date: '', visa_duration: '30' })
  const [batchRows, setBatchRows] = useState<BatchRow[]>(Array.from({ length: 10 }, () => ({ full_name: '', passport_number: '' })))
  const [batchSaving, setBatchSaving] = useState(false)
  const batchNameRefs = useRef<(HTMLInputElement | null)[]>([])
  const prevBatchRowsLen = useRef(batchRows.length)
  const [excelPreview, setExcelPreview] = useState<ExcelImportRow[]>([])
  const [showExcelPreview, setShowExcelPreview] = useState(false)
  const [excelError, setExcelError] = useState<string | null>(null)
  const [excelImporting, setExcelImporting] = useState(false)

  useEffect(() => {
    if (batchRows.length > prevBatchRowsLen.current) {
      batchNameRefs.current[prevBatchRowsLen.current]?.focus()
    }
    prevBatchRowsLen.current = batchRows.length
  }, [batchRows.length])

  useEffect(() => {
    if (cycleBatchRows.length > prevCycleBatchRowsLen.current) {
      cycleBatchNameRefs.current[prevCycleBatchRowsLen.current]?.focus()
    }
    prevCycleBatchRowsLen.current = cycleBatchRows.length
  }, [cycleBatchRows.length])

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
  // ينشئ سجل التأشيرة الجديدة المرتبط تلقائياً بعد اكتمال الدورة فعلياً — تاريخ الدخول هو تاريخ العودة الفعلي
  // (لا تاريخ إصدار الفيزا الجديدة). لا رقم فيزا مخصّص بجدولي tourist_visas/annual_visas فيُحفظ ضمن الملاحظات
  async function performCycleCompletionLink(c: VisaCycle): Promise<boolean> {
    if (!c.new_visa_obtained || !c.new_visa_type || !c.return_date) return false
    const notesText = c.new_visa_number ? `ربط تلقائي من دورة مغادرة/عودة — رقم الفيزا: ${c.new_visa_number}` : 'ربط تلقائي من دورة مغادرة/عودة'
    if (c.new_visa_type === 'سياحية') {
      await supabase.from('tourist_visas').insert([{
        full_name: c.person_name, nationality: c.nationality, passport_number: c.passport_number,
        entry_date: c.return_date, visa_duration: c.new_visa_duration_days || 30, status: 'active', notes: notesText,
      }])
    } else if (c.new_visa_type === 'متعددة') {
      await supabase.from('annual_visas').insert([{
        full_name: c.person_name, nationality: c.nationality, passport_number: c.passport_number,
        entry_date: c.return_date, status: 'active', notes: notesText,
      }])
    } else {
      return false
    }
    await logActivity('ربط تلقائي بعد العودة', 'visa', `ربط تلقائي: ${c.person_name} عاد للعراق وأُنشئت له تأشيرة ${c.new_visa_type} جديدة`)
    return true
  }

  async function loadCycles() {
    const { data } = await supabase.from('visa_cycles').select('*').order('created_at', { ascending: false })
    const list = (data as VisaCycle[]) || []
    // فحص دوري (بنفس فلسفة كشف "مخالف" بالتأشيرات) — يكتشف وصول اللحظة الفعلية للمغادرة/العودة ويثبّتها،
    // وينفّذ الربط التلقائي مرة واحدة فقط لكل دورة (بوابة tourist_visa_created)
    for (const c of list) {
      if (c.status === 'completed') continue
      const actual = computeActualStatus(c)
      if (actual === 'completed') {
        if (!c.tourist_visa_created) {
          const linked = await performCycleCompletionLink(c)
          await supabase.from('visa_cycles').update({ status: 'completed', tourist_visa_created: linked }).eq('id', c.id)
        } else {
          await supabase.from('visa_cycles').update({ status: 'completed' }).eq('id', c.id)
        }
      } else if (actual === 'departed' && c.status !== 'departed') {
        await supabase.from('visa_cycles').update({ status: 'departed' }).eq('id', c.id)
      }
    }
    const { data: updated } = await supabase.from('visa_cycles').select('*').order('created_at', { ascending: false })
    setCycles((updated as VisaCycle[]) || [])
  }

  function cycleDaysInfo(c: VisaCycle) {
    const today = new Date(); today.setHours(0,0,0,0)
    // فترة السماح: 60 يوماً من انتهاء الفيزا
    const graceEnd = new Date(c.visa_expired_date); graceEnd.setHours(0,0,0,0)
    graceEnd.setDate(graceEnd.getDate() + 60)
    const graceDaysLeft = Math.ceil((graceEnd.getTime() - today.getTime()) / 86400000)
    // فيزا المغادرة: 10 أيام من الإصدار
    let exitDaysLeft: number | null = null
    if (c.exit_visa_issued_date) {
      const exitEnd = new Date(c.exit_visa_issued_date); exitEnd.setHours(0,0,0,0)
      exitEnd.setDate(exitEnd.getDate() + 10)
      exitDaysLeft = Math.ceil((exitEnd.getTime() - today.getTime()) / 86400000)
    }
    return { graceDaysLeft, graceEnd, exitDaysLeft }
  }

  function nowTimeStr(): string {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  function formatTimeHM(t: string | null | undefined): string {
    return t ? t.slice(0, 5) : ''
  }

  // الحالة الفعلية للدورة تُحسب دائماً من التواريخ/الأوقات المخزّنة مقارنة باللحظة الحالية — بنفس فلسفة
  // فترة السماح (cycleDaysInfo) — لا تُكتب "departed"/"completed" مباشرة عند إدخال تاريخ مستقبلي، فقط عند
  // وصول اللحظة الفعلية تُصبح هذه الدالة تُرجعها (registerExitVisa/فترة السماح لا وقت لهما فيبقيان كما هما)
  function computeActualStatus(c: VisaCycle): string {
    if (c.status === 'completed') return 'completed'
    if (!c.departure_date) return c.status
    const depMoment = new Date(`${c.departure_date}T${c.departure_time || '00:00:00'}`).getTime()
    if (depMoment > Date.now()) return 'exit_visa_issued' // مغادرة مجدولة لم تقع بعد
    if (!c.return_date) return 'departed'
    const retMoment = new Date(`${c.return_date}T${c.return_time || '00:00:00'}`).getTime()
    if (retMoment > Date.now()) return 'departed' // عودة مجدولة لم تقع بعد
    return 'completed'
  }

  // سطر عرض لكل موعد مجدول لم تصل لحظته الفعلية بعد — يعيد الاثنين معاً إن وُجدا (رحلة ذهاب وعودة أُدخلتا سويةً)
  // بدلاً من إعادة أولهما فقط، لأن دخول المغادرة لا يمنع العودة من أن تكون مجدولة أيضاً بنفس اللحظة
  function cycleScheduledNotes(c: VisaCycle): string[] {
    if (c.status === 'completed' || !c.departure_date) return []
    const notes: string[] = []
    const depMoment = new Date(`${c.departure_date}T${c.departure_time || '00:00:00'}`).getTime()
    if (depMoment > Date.now()) notes.push(`مغادرة مجدولة: ${formatDateDMY(c.departure_date)} الساعة ${formatTimeHM(c.departure_time)}`)
    if (c.return_date) {
      const retMoment = new Date(`${c.return_date}T${c.return_time || '00:00:00'}`).getTime()
      if (retMoment > Date.now()) notes.push(`عودة مجدولة: ${formatDateDMY(c.return_date)} الساعة ${formatTimeHM(c.return_time)}`)
    }
    return notes
  }

  function cycleStatusLabel(c: VisaCycle): string {
    const actual = computeActualStatus(c)
    if (actual === 'completed') return 'مكتملة'
    const info = cycleDaysInfo(c)
    const notes = cycleScheduledNotes(c)
    const suffix = notes.length > 0 ? ` — ${notes.join(' — ')}` : ''
    if (actual === 'grace_period') return (info.graceDaysLeft <= 0 ? `تجاوز فترة السماح (${Math.abs(info.graceDaysLeft)} يوم)` : `فترة سماح (${info.graceDaysLeft} يوم متبقي)`) + suffix
    if (actual === 'exit_visa_issued') return ((info.exitDaysLeft !== null && info.exitDaysLeft <= 0) ? 'فيزا المغادرة منتهية' : `فيزا مغادرة صادرة (${info.exitDaysLeft} يوم متبقي)`) + suffix
    if (actual === 'departed') return 'غادر العراق' + suffix
    return actual
  }

  async function createCycle() {
    if (!cycleForm.person_name || !cycleForm.visa_expired_date) { alert('يرجى تعبئة الاسم وتاريخ انتهاء الفيزا'); return }
    setCycleSaving(true)
    const { error } = await supabase.from('visa_cycles').insert([{
      person_name: cycleForm.person_name,
      passport_number: cycleForm.passport_number || null,
      nationality: cycleForm.nationality || null,
      visa_expired_date: cycleForm.visa_expired_date,
      group_name: cycleForm.group_name.trim() || null,
      status: 'grace_period'
    }])
    if (error) alert('خطأ: ' + error.message)
    else {
      await logActivity('بدء دورة مغادرة وعودة', 'visa', `بدء دورة لـ ${cycleForm.person_name}`)
      setCycleForm({ person_name: '', passport_number: '', nationality: '', visa_expired_date: '', group_name: '' })
      setShowCycleForm(false)
      await loadCycles()
    }
    setCycleSaving(false)
  }

  function addCycleBatchRows(n: number) {
    setCycleBatchRows(prev => [...prev, ...Array.from({ length: n }, () => ({ full_name: '', passport_number: '' }))])
  }

  function updateCycleBatchRow(idx: number, field: keyof BatchRow, value: string) {
    setCycleBatchRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  async function saveCycleBatch() {
    const rowsToSave = cycleBatchRows.filter(r => r.full_name.trim() !== '')
    if (rowsToSave.length === 0) { alert('لا توجد أسطر معبأة للحفظ'); return }
    if (!cycleBatchCommon.group_name.trim() || !cycleBatchCommon.visa_expired_date) { alert('يرجى تعبئة اسم المجموعة وتاريخ انتهاء الفيزا'); return }

    const passportsInBatch = rowsToSave.map(r => r.passport_number.trim()).filter(Boolean)
    const seen = new Set<string>()
    const dupInBatch = new Set<string>()
    passportsInBatch.forEach(p => { if (seen.has(p)) dupInBatch.add(p); else seen.add(p) })
    const existingPassports = new Set(cycles.filter(c => computeActualStatus(c) !== 'completed').map(c => (c.passport_number || '').trim()).filter(Boolean))
    const dupExisting = Array.from(new Set(passportsInBatch.filter(p => existingPassports.has(p))))
    if (dupInBatch.size > 0 || dupExisting.length > 0) {
      const parts: string[] = []
      if (dupInBatch.size > 0) parts.push(`مكررة داخل الدفعة: ${Array.from(dupInBatch).join('، ')}`)
      if (dupExisting.length > 0) parts.push(`موجودة مسبقاً في دورة نشطة: ${dupExisting.join('، ')}`)
      if (!confirm(`تحذير — أرقام جوازات ${parts.join(' | ')}. هل تريد المتابعة بالحفظ؟`)) return
    }

    setCycleBatchSaving(true)
    const groupName = cycleBatchCommon.group_name.trim()
    const payload = rowsToSave.map(r => ({
      person_name: r.full_name.trim(),
      passport_number: r.passport_number.trim() || null,
      nationality: cycleBatchCommon.nationality.trim() || null,
      visa_expired_date: cycleBatchCommon.visa_expired_date,
      group_name: groupName,
      status: 'grace_period',
    }))
    const { error } = await supabase.from('visa_cycles').insert(payload)
    if (error) { alert('خطأ: ' + error.message); setCycleBatchSaving(false); return }
    await logActivity('إضافة دفعة دورات مغادرة وعودة', 'visa', `إنشاء ${rowsToSave.length} دورة في مجموعة ${groupName}`)
    setCycleBatchRows(Array.from({ length: 10 }, () => ({ full_name: '', passport_number: '' })))
    setCycleBatchCommon({ nationality: '', group_name: '', visa_expired_date: '' })
    setShowCycleBatchForm(false)
    setCycleBatchSaving(false)
    await loadCycles()
    setCycleView('active')
    alert(`تم إنشاء ${rowsToSave.length} دورة في المجموعة ${groupName}`)
  }

  async function registerExitVisa(c: VisaCycle) {
    const date = stageInputs[c.id]?.exitDate
    if (!date) { alert('يرجى تحديد تاريخ إصدار فيزا المغادرة'); return }
    await supabase.from('visa_cycles').update({ exit_visa_issued_date: date, status: 'exit_visa_issued' }).eq('id', c.id)
    await logActivity('تسجيل فيزا مغادرة', 'visa', `فيزا مغادرة لـ ${c.person_name}`)
    setStageInputs(prev => ({ ...prev, [c.id]: {} }))
    await loadCycles()
  }

  // نموذج مغادرة/عودة مدمج — يظهر بمجرد صدور فيزا المغادرة بلا أي شرط زمني (رحلة ذهاب وعودة قد تُحجز معاً
  // مسبقاً)، ويُحفظ ما أُدخل بضغطة واحدة. لا تُكتب status هنا إطلاقاً — الحالة الفعلية تُحسب دائماً من
  // التاريخ+الوقت عبر computeActualStatus، وتُثبَّت في DB فقط عند وصول اللحظة الفعلية (الفحص الدوري بـloadCycles)
  async function saveDepartureReturn(c: VisaCycle) {
    const si = stageInputs[c.id] || {}
    const depDate = si.depDate ?? c.departure_date ?? ''
    if (!depDate) { alert('يرجى تحديد تاريخ المغادرة على الأقل'); return }
    const depTime = si.depTime ?? c.departure_time ?? nowTimeStr()
    const depNotes = si.depNotes ?? c.departure_notes ?? ''
    const retDate = si.retDate ?? c.return_date ?? ''
    const retTime = si.retTime ?? c.return_time ?? nowTimeStr()

    if (retDate) {
      const retMoment = new Date(`${retDate}T${retTime}`).getTime()
      if (retMoment <= Date.now()) {
        if (!confirm(`سيتم تسجيل عودة ${c.person_name} إلى العراق الآن — ستكتمل الدورة فوراً وتُنقل للأرشيف. متابعة؟`)) return
      }
    }

    const payload: Record<string, string | null> = { departure_date: depDate, departure_time: depTime, departure_notes: depNotes || null }
    if (retDate) { payload.return_date = retDate; payload.return_time = retTime }
    await supabase.from('visa_cycles').update(payload).eq('id', c.id)
    await logActivity('تسجيل مغادرة/عودة', 'visa', `${c.person_name} — مغادرة ${depDate} ${depTime}${retDate ? ` وعودة ${retDate} ${retTime}` : ''}`)
    setStageInputs(prev => ({ ...prev, [c.id]: {} }))
    await loadCycles()
  }

  async function saveNewVisaInfo(c: VisaCycle) {
    const inp = stageInputs[c.id] || {}
    const nvType = inp.nvType || 'سياحية'
    await supabase.from('visa_cycles').update({
      new_visa_obtained: true,
      new_visa_type: nvType,
      new_visa_number: inp.nvNumber || null,
      new_visa_duration_days: nvType === 'سياحية' ? (parseInt(inp.nvDuration) || 30) : null,
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

  // ===== إدارة المجموعات =====
  async function addToGroup(c: VisaCycle, groupName: string) {
    if (!groupName.trim()) { alert('يرجى اختيار أو كتابة اسم المجموعة'); return }
    await supabase.from('visa_cycles').update({ group_name: groupName.trim() }).eq('id', c.id)
    await logActivity('ضم لمجموعة مغادرة', 'visa', `ضم ${c.person_name} إلى مجموعة ${groupName}`)
    setStageInputs(prev => ({ ...prev, [c.id]: {} }))
    await loadCycles()
  }

  async function removeFromGroup(c: VisaCycle) {
    if (!confirm(`فصل ${c.person_name} عن المجموعة ليصبح دورة فردية مستقلة؟`)) return
    await supabase.from('visa_cycles').update({ group_name: null }).eq('id', c.id)
    await logActivity('فصل عن مجموعة مغادرة', 'visa', `فصل ${c.person_name} عن مجموعته`)
    await loadCycles()
  }

  async function groupRegisterExitVisa(gname: string) {
    const date = stageInputs['grp:' + gname]?.exitDate
    if (!date) { alert('يرجى تحديد تاريخ إصدار فيزا المغادرة'); return }
    await supabase.from('visa_cycles').update({ exit_visa_issued_date: date, status: 'exit_visa_issued' }).eq('group_name', gname).eq('status', 'grace_period')
    await logActivity('تسجيل فيزا مغادرة جماعية', 'visa', `فيزا مغادرة لمجموعة ${gname}`)
    setStageInputs(prev => ({ ...prev, ['grp:' + gname]: {} }))
    await loadCycles()
  }

  // نموذج مغادرة/عودة مدمج للمجموعة — نفس فلسفة الفردي: يظهر بمجرد صدور فيزا المغادرة لأي عضو، ويُطبَّق
  // التاريخ/الوقت المُدخل على كل عضو مؤهّل لم يُسجَّل له ذلك الحقل بعد. التحديثان متسلسلان (not await) —
  // تحديث المغادرة يُنفَّذ أولاً ويُثبَّت قبل تحديث العودة، فيلتقط الأخير من دخلت مغادرته للتو بنفس الضغطة
  async function groupSaveDepartureReturn(gname: string) {
    const si = stageInputs['grp:' + gname] || {}
    const depDate = si.depDate
    if (!depDate) { alert('يرجى تحديد تاريخ المغادرة على الأقل'); return }
    const depTime = si.depTime || nowTimeStr()
    const retDate = si.retDate
    const retTime = si.retTime || nowTimeStr()

    if (retDate) {
      const retMoment = new Date(`${retDate}T${retTime}`).getTime()
      if (retMoment <= Date.now()) {
        if (!confirm(`سيتم تسجيل عودة كل أفراد مجموعة ${gname} الآن — ستكتمل دوراتهم فوراً وتُنقل للأرشيف. متابعة؟`)) return
      }
    }

    await supabase.from('visa_cycles').update({ departure_date: depDate, departure_time: depTime, departure_notes: si.depNotes || null })
      .eq('group_name', gname).not('exit_visa_issued_date', 'is', null).is('departure_date', null)
    if (retDate) {
      await supabase.from('visa_cycles').update({ return_date: retDate, return_time: retTime })
        .eq('group_name', gname).not('departure_date', 'is', null).is('return_date', null)
    }
    await logActivity('تسجيل مغادرة/عودة جماعية', 'visa', `مجموعة ${gname} — مغادرة ${depDate} ${depTime}${retDate ? ` وعودة ${retDate} ${retTime}` : ''}`)
    setStageInputs(prev => ({ ...prev, ['grp:' + gname]: {} }))
    await loadCycles()
  }

  async function groupSaveNewVisa(gname: string) {
    const si = stageInputs['grp:' + gname] || {}
    const nvType = si.nvType || 'سياحية'
    await supabase.from('visa_cycles').update({
      new_visa_obtained: true,
      new_visa_type: nvType,
      new_visa_duration_days: nvType === 'سياحية' ? (parseInt(si.nvDuration) || 30) : null,
    }).eq('group_name', gname).neq('status', 'completed')
    await logActivity('تسجيل فيزا جديدة جماعية', 'visa', `مجموعة ${gname} حصلت على الفيزا الجديدة`)
    setStageInputs(prev => ({ ...prev, ['grp:' + gname]: {} }))
    await loadCycles()
  }

  // بدء دورة مباشرة لمخالف من التأشيرات السياحية
  async function startCycleFromTourist(visa: TouristVisa) {
    const exists = cycles.find(c => computeActualStatus(c) !== 'completed' && c.passport_number && c.passport_number === visa.passport_number)
    if (exists) { alert(`${visa.full_name} لديه دورة نشطة بالفعل`); return }
    if (!confirm(`بدء دورة مغادرة وعودة لـ ${visa.full_name}؟ ستبدأ فترة السماح (60 يوماً) من تاريخ انتهاء فيزته.`)) return
    const natLabel = visa.nationality === 'chinese' ? 'صيني' : visa.nationality === 'pakistani' ? 'باكستاني' : (visa.nationality || 'أخرى')
    await supabase.from('visa_cycles').insert([{
      person_name: visa.full_name,
      passport_number: visa.passport_number || null,
      nationality: natLabel,
      visa_expired_date: visa.expiry_date,
      status: 'grace_period'
    }])
    await logActivity('بدء دورة مغادرة وعودة', 'visa', `بدء دورة للمخالف ${visa.full_name}`)
    await loadCycles()
    setActiveTab('cycles')
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
      showToast(`تم حفظ: ${touristForm.full_name}`)
      setTouristForm(prev => ({ ...prev, full_name: '', passport_number: '' }))
      loadTouristVisas()
      touristNameRef.current?.focus()
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
      showToast(`تم حفظ: ${annualForm.full_name}`)
      setAnnualForm(prev => ({ ...prev, full_name: '', passport_number: '' }))
      loadAnnualVisas()
      annualNameRef.current?.focus()
    }
    setLoading(false)
  }

  // ===== إضافة دفعة =====
  function setBatchType(t: BatchVisaType) {
    setBatchCommon(prev => ({ ...prev, type: t }))
    setShowExcelPreview(false)
    setExcelPreview([])
    setExcelError(null)
  }

  function addBatchRows(n: number) {
    setBatchRows(prev => [...prev, ...Array.from({ length: n }, () => ({ full_name: '', passport_number: '' }))])
  }

  function updateBatchRow(idx: number, field: keyof BatchRow, value: string) {
    setBatchRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  async function saveBatch() {
    const rowsToSave = batchRows.filter(r => r.full_name.trim() !== '')
    if (rowsToSave.length === 0) { alert('لا توجد أسطر معبأة للحفظ'); return }
    if (!batchCommon.nationality.trim() || !batchCommon.entry_date) { alert('يرجى تعبئة الجنسية وتاريخ الدخول للدفعة'); return }

    const passportsInBatch = rowsToSave.map(r => r.passport_number.trim()).filter(Boolean)
    const seen = new Set<string>()
    const dupInBatch = new Set<string>()
    passportsInBatch.forEach(p => { if (seen.has(p)) dupInBatch.add(p); else seen.add(p) })
    const existingList = batchCommon.type === 'tourist' ? touristVisas : annualVisas
    const existingPassports = new Set(existingList.map(v => (v.passport_number || '').trim()).filter(Boolean))
    const dupExisting = Array.from(new Set(passportsInBatch.filter(p => existingPassports.has(p))))
    if (dupInBatch.size > 0 || dupExisting.length > 0) {
      const parts: string[] = []
      if (dupInBatch.size > 0) parts.push(`مكررة داخل الدفعة: ${Array.from(dupInBatch).join('، ')}`)
      if (dupExisting.length > 0) parts.push(`موجودة مسبقاً في قاعدة البيانات: ${dupExisting.join('، ')}`)
      if (!confirm(`تحذير — أرقام جوازات ${parts.join(' | ')}. هل تريد المتابعة بالحفظ؟`)) return
    }

    setBatchSaving(true)
    const table = batchCommon.type === 'tourist' ? 'tourist_visas' : 'annual_visas'
    const payload = rowsToSave.map(r => batchCommon.type === 'tourist' ? {
      full_name: r.full_name.trim(),
      nationality: batchCommon.nationality.trim(),
      passport_number: r.passport_number.trim(),
      entry_date: batchCommon.entry_date,
      visa_duration: parseInt(batchCommon.visa_duration),
      status: 'active',
    } : {
      full_name: r.full_name.trim(),
      nationality: batchCommon.nationality.trim(),
      passport_number: r.passport_number.trim(),
      entry_date: batchCommon.entry_date,
      status: 'active',
    })
    const { error } = await supabase.from(table).insert(payload)
    if (error) { alert('خطأ: ' + error.message); setBatchSaving(false); return }
    await logActivity('إضافة دفعة تأشيرات', 'visa', `إضافة ${rowsToSave.length} تأشيرة ${batchCommon.type === 'tourist' ? 'سياحية' : 'سنوية'} دفعة واحدة`)
    if (batchCommon.type === 'tourist') await loadTouristVisas(); else await loadAnnualVisas()
    setBatchRows(Array.from({ length: 10 }, () => ({ full_name: '', passport_number: '' })))
    setBatchSaving(false)
    alert(`تم حفظ ${rowsToSave.length} تأشيرة`)
  }

  function downloadExcelTemplate() {
    const worksheet = XLSX.utils.aoa_to_sheet([['الاسم', 'رقم الجواز', 'الجنسية', 'تاريخ الدخول', 'المدة']])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'قالب')
    XLSX.writeFile(workbook, 'قالب استيراد التأشيرات.xlsx')
  }

  // ===== تصدير Excel =====
  function writeSheet(rows: (string | number)[][], headers: string[], sheetName: string, fileName: string) {
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
    XLSX.writeFile(workbook, fileName)
  }

  const touristExportHeaders = ['الاسم', 'رقم الجواز', 'الجنسية', 'تاريخ الدخول', 'المدة', 'تاريخ الانتهاء', 'الأيام المتبقية', 'الحالة']
  function buildTouristRows(list: TouristVisa[]): (string | number)[][] {
    return list.map(v => {
      const vs = getTouristStatus(v)
      return [v.full_name, v.passport_number || '', v.nationality || '', formatDateDMY(v.entry_date), v.visa_duration ? `${v.visa_duration} يوم` : '', formatDateDMY(v.expiry_date), getDaysRemaining(v.expiry_date), vs.label]
    })
  }

  const annualExportHeaders = ['الاسم', 'رقم الجواز', 'الجنسية', 'تاريخ الدخول', 'تاريخ الانتهاء', 'الأيام المتبقية', 'الحالة']
  function buildAnnualRows(list: AnnualVisa[]): (string | number)[][] {
    return list.map(v => {
      const vs = getAnnualStatus(v)
      return [v.full_name, v.passport_number || '', v.nationality || '', formatDateDMY(v.entry_date), formatDateDMY(v.expiry_date), getDaysRemaining(v.expiry_date), vs.label]
    })
  }

  const cycleExportHeaders = ['الاسم', 'رقم الجواز', 'الجنسية', 'المجموعة', 'تاريخ انتهاء الفيزا', 'متبقي فترة السماح', 'تاريخ فيزا المغادرة', 'متبقي فيزا المغادرة', 'الفيزا الجديدة', 'تاريخ المغادرة', 'تاريخ العودة', 'الحالة']
  function buildCycleRows(list: VisaCycle[]): (string | number)[][] {
    return list.map(c => {
      const info = cycleDaysInfo(c)
      const actual = computeActualStatus(c)
      const newVisaText = c.new_visa_obtained ? `نعم - ${c.new_visa_type || ''} ${c.new_visa_number || ''}`.trim() : 'لا'
      return [
        c.person_name,
        c.passport_number || '',
        c.nationality || '',
        c.group_name || '',
        formatDateDMY(c.visa_expired_date),
        actual === 'grace_period' ? info.graceDaysLeft : '',
        c.exit_visa_issued_date ? formatDateDMY(c.exit_visa_issued_date) : '',
        (actual === 'exit_visa_issued' && info.exitDaysLeft !== null) ? info.exitDaysLeft : '',
        newVisaText,
        c.departure_date ? `${formatDateDMY(c.departure_date)} ${formatTimeHM(c.departure_time)}`.trim() : '',
        c.return_date ? `${formatDateDMY(c.return_date)} ${formatTimeHM(c.return_time)}`.trim() : '',
        cycleStatusLabel(c),
      ]
    })
  }

  function exportTouristExcel() {
    writeSheet(buildTouristRows(filteredTourist), touristExportHeaders, 'السياحية', `التأشيرات_السياحية_${todayStr}.xlsx`)
  }

  function exportAnnualExcel() {
    writeSheet(buildAnnualRows(filteredAnnual), annualExportHeaders, 'السنوية', `التأشيرات_السنوية_${todayStr}.xlsx`)
  }

  function exportCyclesExcel(list: VisaCycle[], view: 'active' | 'completed') {
    writeSheet(buildCycleRows(list), cycleExportHeaders, view === 'active' ? 'دورات نشطة' : 'دورات مكتملة', `التأشيرات_دورات_المغادرة_والعودة_${todayStr}.xlsx`)
  }

  function exportStatsExcel() {
    const headers = ['الفئة', 'صينيين', 'باكستانيين', 'الإجمالي']
    const rows: (string | number)[][] = categories.map(cat => [cat.label, getCount(cat.key, 'chinese'), getCount(cat.key, 'pakistani'), getTotal(cat.key)])
    rows.push(['إجمالي الأجانب في الشركة', '', '', grandTotal])
    rows.push(['إجمالي المخالفين (شامل التأشيرات)', '', '', totalViolatorsCombined])
    writeSheet(rows, headers, 'إحصائيات', `التأشيرات_احصائيات_${todayStr}.xlsx`)
  }

  async function exportComprehensiveExcel() {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([touristExportHeaders, ...buildTouristRows(touristVisas)]), 'السياحية')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([annualExportHeaders, ...buildAnnualRows(annualVisas)]), 'السنوية')
    const cyclesList = cycles.filter(c => cycleView === 'active' ? computeActualStatus(c) !== 'completed' : computeActualStatus(c) === 'completed')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([cycleExportHeaders, ...buildCycleRows(cyclesList)]), cycleView === 'active' ? 'دورات نشطة' : 'دورات مكتملة')
    const statsHeaders = ['الفئة', 'صينيين', 'باكستانيين', 'الإجمالي']
    const statsRows: (string | number)[][] = categories.map(cat => [cat.label, getCount(cat.key, 'chinese'), getCount(cat.key, 'pakistani'), getTotal(cat.key)])
    statsRows.push(['إجمالي الأجانب في الشركة', '', '', grandTotal])
    statsRows.push(['إجمالي المخالفين (شامل التأشيرات)', '', '', totalViolatorsCombined])
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([statsHeaders, ...statsRows]), 'إحصائيات')
    XLSX.writeFile(workbook, `التأشيرات_شامل_${todayStr}.xlsx`)
    await logActivity('تصدير شامل لبيانات التأشيرات', 'visa', 'تصدير ملف Excel شامل بأربع أوراق (سياحية، سنوية، دورات، إحصائيات)')
  }

  async function handleExcelFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setExcelError(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', dateNF: 'yyyy-mm-dd' })
      if (rows.length < 2) { setExcelError('الملف فارغ أو لا يحتوي على بيانات'); e.target.value = ''; return }

      const headers = rows[0].map(h => String(h || ''))
      const fieldIndex: Partial<Record<'full_name' | 'passport_number' | 'nationality' | 'entry_date' | 'visa_duration', number>> = {}
      headers.forEach((h, i) => {
        const norm = normalizeHeaderText(h)
        if (fieldIndex.full_name === undefined && norm.includes('الاسم')) fieldIndex.full_name = i
        else if (fieldIndex.passport_number === undefined && norm.includes('جواز')) fieldIndex.passport_number = i
        else if (fieldIndex.nationality === undefined && norm.includes('جنسية')) fieldIndex.nationality = i
        else if (fieldIndex.entry_date === undefined && norm.includes('دخول')) fieldIndex.entry_date = i
        else if (fieldIndex.visa_duration === undefined && norm.includes('مدة')) fieldIndex.visa_duration = i
      })
      if (fieldIndex.full_name === undefined) { setExcelError('لم يتم العثور على عمود "الاسم" في الملف'); e.target.value = ''; return }

      const existingList = batchCommon.type === 'tourist' ? touristVisas : annualVisas
      const existingPassports = new Set(existingList.map(v => (v.passport_number || '').trim()).filter(Boolean))
      const seen = new Set<string>()
      const results: ExcelImportRow[] = []
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r]
        if (!row || row.every(c => !String(c || '').trim())) continue
        const full_name = String(fieldIndex.full_name !== undefined ? row[fieldIndex.full_name] : '').trim()
        const passport_number = String(fieldIndex.passport_number !== undefined ? row[fieldIndex.passport_number] : '').trim()
        const nationality = String(fieldIndex.nationality !== undefined ? row[fieldIndex.nationality] : '').trim() || batchCommon.nationality.trim()
        const entry_date = String(fieldIndex.entry_date !== undefined ? row[fieldIndex.entry_date] : '').trim() || batchCommon.entry_date
        const visa_duration = String(fieldIndex.visa_duration !== undefined ? row[fieldIndex.visa_duration] : '').trim() || batchCommon.visa_duration

        let statusTag: ExcelImportRow['statusTag'] = 'new'
        if (!full_name) statusTag = 'incomplete'
        else if (passport_number && (existingPassports.has(passport_number) || seen.has(passport_number))) statusTag = 'duplicate'
        if (statusTag !== 'incomplete' && passport_number) seen.add(passport_number)

        results.push({ full_name, passport_number, nationality, entry_date, visa_duration, statusTag })
      }
      if (results.length === 0) { setExcelError('لا توجد بيانات صالحة في الملف'); e.target.value = ''; return }
      setExcelPreview(results)
      setShowExcelPreview(true)
    } catch {
      setExcelError('تعذر قراءة الملف — تأكد أنه بصيغة Excel صحيحة')
    }
    e.target.value = ''
  }

  async function confirmExcelImport() {
    const toInsert = excelPreview.filter(r => r.statusTag === 'new')
    if (toInsert.length === 0) { setShowExcelPreview(false); return }
    setExcelImporting(true)
    const table = batchCommon.type === 'tourist' ? 'tourist_visas' : 'annual_visas'
    const payload = toInsert.map(r => batchCommon.type === 'tourist' ? {
      full_name: r.full_name,
      nationality: r.nationality || null,
      passport_number: r.passport_number || null,
      entry_date: r.entry_date,
      visa_duration: parseInt(r.visa_duration) || 30,
      status: 'active',
    } : {
      full_name: r.full_name,
      nationality: r.nationality || null,
      passport_number: r.passport_number || null,
      entry_date: r.entry_date,
      status: 'active',
    })
    const { error } = await supabase.from(table).insert(payload)
    if (error) { alert('خطأ: ' + error.message); setExcelImporting(false); return }
    const skipped = excelPreview.length - toInsert.length
    await logActivity('استيراد تأشيرات من Excel', 'visa', `استيراد ${toInsert.length} تأشيرة ${batchCommon.type === 'tourist' ? 'سياحية' : 'سنوية'} من Excel`)
    if (batchCommon.type === 'tourist') await loadTouristVisas(); else await loadAnnualVisas()
    setShowExcelPreview(false)
    setExcelPreview([])
    setExcelImporting(false)
    alert(`تم استيراد ${toInsert.length} تأشيرة بنجاح (تم تخطي ${skipped})`)
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

  const batchFilledCount = useMemo(() => batchRows.filter(r => r.full_name.trim() !== '').length, [batchRows])
  const cycleBatchFilledCount = useMemo(() => cycleBatchRows.filter(r => r.full_name.trim() !== '').length, [cycleBatchRows])
  const batchImportCounts = useMemo(() => {
    const counts = { new: 0, duplicate: 0, incomplete: 0 }
    excelPreview.forEach(r => { counts[r.statusTag]++ })
    return counts
  }, [excelPreview])

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

      {toast && (
        <div style={{position:'fixed',top:20,left:'50%',transform:'translateX(-50%)',background:'#16a34a',color:'#fff',
          padding:'10px 22px',borderRadius:8,fontSize:14,fontWeight:600,boxShadow:'0 4px 12px rgba(0,0,0,0.18)',zIndex:9999}}>
          {toast}
        </div>
      )}

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
            const activeCycles = cycles.filter(c => computeActualStatus(c) !== 'completed')
            const urgent = activeCycles.filter(c => {
              const info = cycleDaysInfo(c)
              const actual = computeActualStatus(c)
              return (actual === 'grace_period' && info.graceDaysLeft <= 10) ||
                     (actual === 'exit_visa_issued' && info.exitDaysLeft !== null && info.exitDaysLeft <= 5)
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
        {!readOnly && (
          <button onClick={()=>setActiveTab('batch')}
            style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
              background:activeTab==='batch'?'#fff':'transparent',color:activeTab==='batch'?'#1e40af':'#6b7280',
              boxShadow:activeTab==='batch'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
            إضافة دفعة
          </button>
        )}
      </div>

      {/* قسم الإحصائيات */}
      {activeTab === 'stats' && (
        <div>
          <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden',marginBottom:20}}>
            <div style={{padding:'16px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <h2 style={{margin:0,fontSize:17,fontWeight:700,color:'#111827'}}>إحصائيات الأجانب والتأشيرات</h2>
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                {readOnly && <span style={{fontSize:12,background:'#fef9c3',color:'#b45309',padding:'3px 10px',borderRadius:20,fontWeight:600}}>قراءة فقط</span>}
                <button onClick={exportStatsExcel}
                  style={{background:'#eff6ff',color:'#1d4ed8',border:'1px solid #93c5fd',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                  ⬇ تصدير Excel
                </button>
                <button onClick={exportComprehensiveExcel}
                  style={{background:'#ede9fe',color:'#7c3aed',border:'1px solid #c4b5fd',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                  ⬇ تصدير شامل
                </button>
              </div>
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
                <button onClick={exportTouristExcel}
                  style={{background:'#eff6ff',color:'#1d4ed8',border:'1px solid #93c5fd',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                  ⬇ تصدير Excel
                </button>
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
                    <input ref={touristNameRef} autoFocus value={touristForm.full_name} onChange={e=>setTouristForm({...touristForm,full_name:e.target.value})} placeholder="اسم الشخص" style={inputStyle}/></div>
                  <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>رقم الجواز</label>
                    <input value={touristForm.passport_number} onChange={e=>setTouristForm({...touristForm,passport_number:e.target.value})}
                      onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); addTouristVisa() } }}
                      placeholder="رقم الجواز" style={{...inputStyle,direction:'ltr',textAlign:'right'}}/></div>
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
                              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                                {(() => {
                                  const exp = new Date(visa.expiry_date); exp.setHours(0,0,0,0)
                                  const t = new Date(); t.setHours(0,0,0,0)
                                  const isViolated = exp.getTime() <= t.getTime() || visa.status === 'violated'
                                  const hasCycle = cycles.some(c => computeActualStatus(c) !== 'completed' && c.passport_number && c.passport_number === visa.passport_number)
                                  if (!isViolated) return null
                                  return hasCycle
                                    ? <span style={{background:'#dbeafe',color:'#1d4ed8',padding:'5px 10px',borderRadius:6,fontSize:11,fontWeight:700}}>في دورة نشطة</span>
                                    : <button onClick={()=>startCycleFromTourist(visa)} style={{background:'#ede9fe',color:'#7c3aed',border:'1px solid #c4b5fd',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:11,fontWeight:700,whiteSpace:'nowrap'}}>بدء دورة مغادرة</button>
                                })()}
                                <button onClick={()=>deleteTouristVisa(visa.id)} style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:12,fontWeight:600}}>حذف</button>
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
                <button onClick={exportAnnualExcel}
                  style={{background:'#eff6ff',color:'#1d4ed8',border:'1px solid #93c5fd',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                  ⬇ تصدير Excel
                </button>
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
                    <input ref={annualNameRef} autoFocus value={annualForm.full_name} onChange={e=>setAnnualForm({...annualForm,full_name:e.target.value})} placeholder="اسم الشخص" style={inputStyle}/></div>
                  <div><label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>رقم الجواز</label>
                    <input value={annualForm.passport_number} onChange={e=>setAnnualForm({...annualForm,passport_number:e.target.value})}
                      onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); addAnnualVisa() } }}
                      placeholder="رقم الجواز" style={{...inputStyle,direction:'ltr',textAlign:'right'}}/></div>
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
        const activeCycles = cycles.filter(c => computeActualStatus(c) !== 'completed')
        const completedCycles = cycles.filter(c => computeActualStatus(c) === 'completed')
        // تنبيهات
        let exceededGrace = 0, graceUrgent = 0, exitUrgent = 0
        activeCycles.forEach(c => {
          const info = cycleDaysInfo(c)
          const actual = computeActualStatus(c)
          if (actual === 'grace_period') {
            if (info.graceDaysLeft <= 0) exceededGrace++
            else if (info.graceDaysLeft <= 10) graceUrgent++
          }
          if (actual === 'exit_visa_issued' && info.exitDaysLeft !== null && info.exitDaysLeft <= 5) exitUrgent++
        })
        const shownList = (cycleView === 'active' ? activeCycles : completedCycles).filter(c =>
          !cycleSearch.trim() || c.person_name.toLowerCase().includes(cycleSearch.toLowerCase()) || (c.passport_number || '').toLowerCase().includes(cycleSearch.toLowerCase()) || (c.group_name || '').toLowerCase().includes(cycleSearch.toLowerCase())
        )
        const groupsMap: Record<string, VisaCycle[]> = {}
        const individualList: VisaCycle[] = []
        shownList.forEach(c => {
          if (cycleView === 'active' && c.group_name) { (groupsMap[c.group_name] = groupsMap[c.group_name] || []).push(c) }
          else individualList.push(c)
        })
        const existingGroups = [...new Set(cycles.filter(x => x.group_name && computeActualStatus(x) !== 'completed').map(x => x.group_name!))]
        const cycleStatusBadge = (c: VisaCycle) => {
          const info = cycleDaysInfo(c)
          const actual = computeActualStatus(c)
          if (actual === 'grace_period') {
            if (info.graceDaysLeft <= 0) return <span style={{background:'#dc2626',color:'#fff',padding:'3px 10px',borderRadius:20,fontSize:10,fontWeight:700}}>تجاوز السماح بـ {Math.abs(info.graceDaysLeft)} يوم!</span>
            return <span style={{background:info.graceDaysLeft<=10?'#fee2e2':'#fef9c3',color:info.graceDaysLeft<=10?'#dc2626':'#b45309',padding:'3px 10px',borderRadius:20,fontSize:10,fontWeight:700}}>سماح: {info.graceDaysLeft} يوم</span>
          }
          if (actual === 'exit_visa_issued') {
            const d = info.exitDaysLeft
            if (d !== null && d <= 0) return <span style={{background:'#dc2626',color:'#fff',padding:'3px 10px',borderRadius:20,fontSize:10,fontWeight:700}}>فيزا المغادرة منتهية!</span>
            return <span style={{background:(d!==null&&d<=5)?'#fee2e2':'#dbeafe',color:(d!==null&&d<=5)?'#dc2626':'#1d4ed8',padding:'3px 10px',borderRadius:20,fontSize:10,fontWeight:700}}>مغادرة: {d} يوم</span>
          }
          if (actual === 'departed') return <span style={{background:'#ede9fe',color:'#7c3aed',padding:'3px 10px',borderRadius:20,fontSize:10,fontWeight:700}}>خارج العراق</span>
          return null
        }
        const scheduledNoteBadges = (c: VisaCycle) => {
          const notes = cycleScheduledNotes(c)
          if (notes.length === 0) return null
          return <>{notes.map((n, i) => <span key={i} style={{background:'#e0f2fe',color:'#0369a1',padding:'3px 10px',borderRadius:20,fontSize:10,fontWeight:700}}>🕓 {n}</span>)}</>
        }
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
                <button onClick={()=>exportCyclesExcel(shownList, cycleView)}
                  style={{background:'#eff6ff',color:'#1d4ed8',border:'1px solid #93c5fd',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                  ⬇ تصدير Excel
                </button>
                {!readOnly && cycleView === 'active' && (
                  <div style={{display:'flex',gap:8,marginRight:'auto'}}>
                    <button onClick={()=>{ setShowCycleForm(!showCycleForm); setShowCycleBatchForm(false) }}
                      style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                      {showCycleForm ? 'إلغاء' : '+ بدء دورة جديدة'}
                    </button>
                    <button onClick={()=>{ setShowCycleBatchForm(!showCycleBatchForm); setShowCycleForm(false) }}
                      style={{background:'#7c3aed',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                      {showCycleBatchForm ? 'إلغاء' : '+ إضافة دفعة'}
                    </button>
                  </div>
                )}
              </div>

              {/* نموذج بدء دورة */}
              {showCycleForm && !readOnly && (
                <div style={{padding:'18px 20px',borderBottom:'2px solid #e5e7eb',background:'#f9fafb'}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr',gap:12,marginBottom:12}}>
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
                    <div>
                      <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>المجموعة (اختياري)</label>
                      <input list="cycle-groups" value={cycleForm.group_name} onChange={e=>setCycleForm({...cycleForm,group_name:e.target.value})} placeholder="اسم مجموعة موجودة أو جديدة" style={{...inputSm,width:'100%',boxSizing:'border-box'}}/>
                      <datalist id="cycle-groups">
                        {[...new Set(cycles.filter(x=>x.group_name&&computeActualStatus(x)!=='completed').map(x=>x.group_name!))].map(g=><option key={g} value={g}/>)}
                      </datalist>
                    </div>
                  </div>
                  <button onClick={createCycle} disabled={cycleSaving}
                    style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'9px 22px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                    {cycleSaving ? 'جارٍ الحفظ...' : 'بدء الدورة (تبدأ فترة السماح 60 يوماً)'}
                  </button>
                </div>
              )}

              {/* نموذج إضافة دفعة دورات */}
              {showCycleBatchForm && !readOnly && (
                <div style={{padding:'18px 20px',borderBottom:'2px solid #e5e7eb',background:'#f9fafb'}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:14,maxWidth:700}}>
                    <div>
                      <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>الجنسية</label>
                      <input value={cycleBatchCommon.nationality} onChange={e=>setCycleBatchCommon({...cycleBatchCommon,nationality:e.target.value})} placeholder="مثال: صيني" style={{...inputSm,width:'100%',boxSizing:'border-box'}}/>
                    </div>
                    <div>
                      <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>اسم المجموعة *</label>
                      <input list="cycle-groups-batch" value={cycleBatchCommon.group_name} onChange={e=>setCycleBatchCommon({...cycleBatchCommon,group_name:e.target.value})} placeholder="اسم مجموعة موجودة أو جديدة" style={{...inputSm,width:'100%',boxSizing:'border-box'}}/>
                      <datalist id="cycle-groups-batch">
                        {[...new Set(cycles.filter(x=>x.group_name&&computeActualStatus(x)!=='completed').map(x=>x.group_name!))].map(g=><option key={g} value={g}/>)}
                      </datalist>
                    </div>
                    <div>
                      <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>تاريخ انتهاء الفيزا *</label>
                      <input type="date" value={cycleBatchCommon.visa_expired_date} onChange={e=>setCycleBatchCommon({...cycleBatchCommon,visa_expired_date:e.target.value})} style={{...inputSm,width:'100%',boxSizing:'border-box'}}/>
                    </div>
                  </div>

                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10,flexWrap:'wrap'}}>
                    <span style={{fontSize:13,fontWeight:700,color:'#7c3aed',background:'#ede9fe',padding:'6px 14px',borderRadius:20}}>
                      تم تعبئة {cycleBatchFilledCount} من {cycleBatchRows.length} سطر
                    </span>
                    <button onClick={()=>addCycleBatchRows(10)}
                      style={{background:'#f3f4f6',color:'#374151',border:'1px solid #d1d5db',borderRadius:8,padding:'7px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                      + إضافة 10 أسطر
                    </button>
                  </div>

                  <div style={{overflowX:'auto',border:'1px solid #e5e7eb',borderRadius:10,marginBottom:14}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                      <thead>
                        <tr style={{background:'#f3f4f6'}}>
                          <th style={{padding:'8px 12px',borderBottom:'2px solid #e5e7eb',width:40,color:'#6b7280'}}>#</th>
                          <th style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>الاسم</th>
                          <th style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>رقم الجواز</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cycleBatchRows.map((row,idx)=>(
                          <tr key={idx} style={{borderBottom:'1px solid #f3f4f6'}}>
                            <td style={{padding:'6px 12px',color:'#9ca3af',fontSize:12,textAlign:'center'}}>{idx+1}</td>
                            <td style={{padding:'6px 8px'}}>
                              <input ref={el=>{cycleBatchNameRefs.current[idx]=el}} value={row.full_name} onChange={e=>updateCycleBatchRow(idx,'full_name',e.target.value)}
                                style={{width:'100%',padding:'7px 10px',borderRadius:6,border:'1px solid #d1d5db',fontSize:13,color:'#111827',boxSizing:'border-box'}}/>
                            </td>
                            <td style={{padding:'6px 8px'}}>
                              <input value={row.passport_number} onChange={e=>updateCycleBatchRow(idx,'passport_number',e.target.value)}
                                onKeyDown={e=>{ if(e.key==='Enter' && idx===cycleBatchRows.length-1){ e.preventDefault(); addCycleBatchRows(1) } }}
                                style={{width:'100%',padding:'7px 10px',borderRadius:6,border:'1px solid #d1d5db',fontSize:13,color:'#111827',boxSizing:'border-box',direction:'ltr',textAlign:'right'}}/>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button onClick={saveCycleBatch} disabled={cycleBatchSaving || cycleBatchFilledCount===0}
                    style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontSize:14,fontWeight:600,opacity:(cycleBatchSaving||cycleBatchFilledCount===0)?0.6:1}}>
                    {cycleBatchSaving ? 'جارٍ الحفظ...' : `حفظ الكل (${cycleBatchFilledCount})`}
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
                          <td style={{padding:'9px 12px',color:'#6b7280'}}>{c.departure_date?`${new Date(c.departure_date).toLocaleDateString('ar-IQ')} ${formatTimeHM(c.departure_time)}`:'—'}</td>
                          <td style={{padding:'9px 12px',color:'#15803d',fontWeight:600}}>{c.return_date?`${new Date(c.return_date).toLocaleDateString('ar-IQ')} ${formatTimeHM(c.return_time)}`:'—'}</td>
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
                  {/* بطاقات المجموعات */}
                  {Object.entries(groupsMap).map(([gname, members]) => {
                    const gsi = stageInputs['grp:' + gname] || {}
                    const anyGrace = members.some(m => m.status === 'grace_period')
                    // نموذج المغادرة/العودة المدمج يظهر بمجرد صدور فيزا المغادرة لأي عضو — بلا أي شرط زمني
                    const anyExitIssued = members.some(m => !!m.exit_visa_issued_date)
                    const anyNoNewVisa = members.some(m => !m.new_visa_obtained)
                    return (
                      <div key={gname} style={{border:'2px solid #0891b2',borderRadius:12,padding:'16px 18px',background:'#f0fdff'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
                          <div style={{display:'flex',alignItems:'center',gap:10}}>
                            <span style={{background:'#0891b2',color:'#fff',padding:'4px 14px',borderRadius:20,fontSize:13,fontWeight:700}}>👥 مجموعة: {gname}</span>
                            <span style={{fontSize:12,color:'#6b7280',fontWeight:600}}>{members.length} أشخاص</span>
                          </div>
                        </div>
                        {/* أفراد المجموعة */}
                        <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:12}}>
                          {members.map(m => (
                            <div key={m.id} style={{display:'flex',alignItems:'center',gap:10,background:'#fff',border:'1px solid #e5e7eb',borderRadius:8,padding:'8px 12px',flexWrap:'wrap'}}>
                              <span style={{fontWeight:700,color:'#111827',fontSize:13}}>{m.person_name}</span>
                              <span style={{fontSize:11,color:'#6b7280',direction:'ltr'}}>{m.passport_number||''}</span>
                              <span style={{fontSize:11,color:'#9ca3af'}}>{m.nationality||''}</span>
                              {cycleStatusBadge(m)}
                              {scheduledNoteBadges(m)}
                              {m.new_visa_obtained && <span style={{background:'#dcfce7',color:'#15803d',padding:'2px 8px',borderRadius:20,fontSize:10,fontWeight:700}}>✓ فيزا جديدة</span>}
                              {!readOnly && (
                                <div style={{display:'flex',gap:5,marginRight:'auto'}}>
                                  <button onClick={()=>removeFromGroup(m)} style={{background:'#fef9c3',color:'#b45309',border:'none',borderRadius:6,padding:'3px 10px',cursor:'pointer',fontSize:10,fontWeight:700}}>فصل عن المجموعة</button>
                                  <button onClick={()=>deleteCycle(m)} style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:6,padding:'3px 8px',cursor:'pointer',fontSize:10}}>حذف</button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        {/* إجراءات جماعية */}
                        {!readOnly && (
                          <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'flex-end',borderTop:'1px solid #cffafe',paddingTop:12}}>
                            {anyGrace && (
                              <div style={{display:'flex',gap:6,alignItems:'flex-end'}}>
                                <div>
                                  <label style={{display:'block',marginBottom:3,fontSize:10,fontWeight:600,color:'#374151'}}>تاريخ فيزا المغادرة (للجميع)</label>
                                  <input type="date" value={gsi.exitDate||''} onChange={e=>updateStageInput('grp:'+gname,'exitDate',e.target.value)} style={inputSm}/>
                                </div>
                                <button onClick={()=>groupRegisterExitVisa(gname)} style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'7px 12px',cursor:'pointer',fontSize:11,fontWeight:600}}>فيزا مغادرة للجميع</button>
                              </div>
                            )}
                            {anyExitIssued && (
                              <div style={{display:'flex',gap:14,alignItems:'flex-end',flexWrap:'wrap'}}>
                                <div style={{display:'flex',gap:6,alignItems:'flex-end',flexWrap:'wrap'}}>
                                  <div>
                                    <label style={{display:'block',marginBottom:3,fontSize:10,fontWeight:600,color:'#374151'}}>تاريخ المغادرة (للجميع)</label>
                                    <input type="date" value={gsi.depDate||''} onChange={e=>updateStageInput('grp:'+gname,'depDate',e.target.value)} style={inputSm}/>
                                  </div>
                                  <div>
                                    <label style={{display:'block',marginBottom:3,fontSize:10,fontWeight:600,color:'#374151'}}>الوقت</label>
                                    <input type="time" value={gsi.depTime??nowTimeStr()} onChange={e=>updateStageInput('grp:'+gname,'depTime',e.target.value)} style={inputSm}/>
                                  </div>
                                  <input value={gsi.depNotes||''} onChange={e=>updateStageInput('grp:'+gname,'depNotes',e.target.value)} placeholder="وجهة/رحلة (اختياري)" style={{...inputSm,width:140}}/>
                                </div>
                                <div style={{display:'flex',gap:6,alignItems:'flex-end',flexWrap:'wrap'}}>
                                  <div>
                                    <label style={{display:'block',marginBottom:3,fontSize:10,fontWeight:600,color:'#374151'}}>تاريخ العودة (اختياري الآن، للجميع)</label>
                                    <input type="date" value={gsi.retDate||''} onChange={e=>updateStageInput('grp:'+gname,'retDate',e.target.value)} style={inputSm}/>
                                  </div>
                                  <div>
                                    <label style={{display:'block',marginBottom:3,fontSize:10,fontWeight:600,color:'#374151'}}>الوقت</label>
                                    <input type="time" value={gsi.retTime??nowTimeStr()} onChange={e=>updateStageInput('grp:'+gname,'retTime',e.target.value)} style={inputSm}/>
                                  </div>
                                </div>
                                <button onClick={()=>groupSaveDepartureReturn(gname)} style={{background:'#7c3aed',color:'#fff',border:'none',borderRadius:8,padding:'7px 12px',cursor:'pointer',fontSize:11,fontWeight:600}}>حفظ المغادرة/العودة للجميع</button>
                              </div>
                            )}
                            {anyNoNewVisa && (
                              <div style={{display:'flex',gap:6,alignItems:'flex-end',flexWrap:'wrap',marginRight:'auto'}}>
                                <div>
                                  <label style={{display:'block',marginBottom:3,fontSize:10,fontWeight:600,color:'#374151'}}>نوع الفيزا الجديدة</label>
                                  <select value={gsi.nvType||'سياحية'} onChange={e=>updateStageInput('grp:'+gname,'nvType',e.target.value)} style={inputSm}>
                                    <option value="سياحية">سياحية</option>
                                    <option value="متعددة">متعددة</option>
                                  </select>
                                </div>
                                {(gsi.nvType||'سياحية') === 'سياحية' && (
                                  <div>
                                    <label style={{display:'block',marginBottom:3,fontSize:10,fontWeight:600,color:'#374151'}}>مدة الفيزا</label>
                                    <select value={gsi.nvDuration||'30'} onChange={e=>updateStageInput('grp:'+gname,'nvDuration',e.target.value)} style={inputSm}>
                                      <option value="30">30 يوم</option>
                                      <option value="60">60 يوم</option>
                                    </select>
                                  </div>
                                )}
                                <button onClick={()=>groupSaveNewVisa(gname)} style={{background:'#dcfce7',color:'#15803d',border:'1px solid #86efac',borderRadius:8,padding:'7px 12px',cursor:'pointer',fontSize:11,fontWeight:700}}>✓ الجميع حصلوا على الفيزا</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {individualList.map(c => {
                    const info = cycleDaysInfo(c)
                    const actual = computeActualStatus(c)
                    const graceExceeded = actual === 'grace_period' && info.graceDaysLeft <= 0
                    const gracePct = Math.max(0, Math.min(100, Math.round(((60 - info.graceDaysLeft) / 60) * 100)))
                    const si = stageInputs[c.id] || {}
                    const scheduledNotes = cycleScheduledNotes(c)
                    const actuallyDeparted = actual === 'departed' || actual === 'completed'
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
                            {actual === 'grace_period' && (graceExceeded
                              ? <span style={{background:'#dc2626',color:'#fff',padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:700}}>تجاوز فترة السماح بـ {Math.abs(info.graceDaysLeft)} يوم!</span>
                              : <span style={{background:info.graceDaysLeft<=10?'#fee2e2':'#fef9c3',color:info.graceDaysLeft<=10?'#dc2626':'#b45309',padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:700}}>متبقي {info.graceDaysLeft} يوم من فترة السماح</span>
                            )}
                            {actual === 'exit_visa_issued' && info.exitDaysLeft !== null && (
                              info.exitDaysLeft <= 0
                                ? <span style={{background:'#dc2626',color:'#fff',padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:700}}>فيزا المغادرة منتهية!</span>
                                : <span style={{background:info.exitDaysLeft<=5?'#fee2e2':'#dbeafe',color:info.exitDaysLeft<=5?'#dc2626':'#1d4ed8',padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:700}}>{info.exitDaysLeft<=5?'⚠ ':''}متبقي {info.exitDaysLeft} يوم على فيزا المغادرة</span>
                            )}
                            {actual === 'departed' && <span style={{background:'#ede9fe',color:'#7c3aed',padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:700}}>خارج العراق</span>}
                            {c.new_visa_obtained && <span style={{background:'#dcfce7',color:'#15803d',padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:700}}>✓ حاصل على الفيزا الجديدة {c.new_visa_type ? `(${c.new_visa_type})` : ''}</span>}
                            {!readOnly && <button onClick={()=>deleteCycle(c)} style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:11}}>حذف</button>}
                          </div>
                        </div>

                        {/* ملاحظات المواعيد المجدولة — تُعرض كلها معاً إن وُجدت (مغادرة وعودة مستقبليتان مُدخلتان سويةً) */}
                        {scheduledNotes.length > 0 && (
                          <div style={{marginBottom:14,padding:'8px 12px',background:'#e0f2fe',border:'1px solid #7dd3fc',borderRadius:8,display:'flex',flexDirection:'column',gap:3}}>
                            {scheduledNotes.map((n, i) => (
                              <div key={i} style={{fontSize:12,color:'#0369a1',fontWeight:600}}>🕓 {n}</div>
                            ))}
                          </div>
                        )}

                        {/* شريط فترة السماح */}
                        {actual === 'grace_period' && !graceExceeded && (
                          <div style={{marginBottom:14}}>
                            <div style={{height:8,background:'#e5e7eb',borderRadius:4,overflow:'hidden'}}>
                              <div style={{height:'100%',width:gracePct+'%',background:info.graceDaysLeft<=10?'#dc2626':info.graceDaysLeft<=25?'#eab308':'#15803d',borderRadius:4,transition:'width 0.3s'}}/>
                            </div>
                          </div>
                        )}

                        {/* الخط الزمني — "غادر العراق"/"عاد للعراق" تعتمدان اللحظة الفعلية لا مجرد إدخال تاريخ مجدول */}
                        <div style={{display:'flex',alignItems:'flex-start',marginBottom:16,padding:'0 8px'}}>
                          {stageDot(true, 'فترة السماح', '#b45309')}
                          {stageLine(!!c.exit_visa_issued_date)}
                          {stageDot(!!c.exit_visa_issued_date, 'فيزا المغادرة', '#1d4ed8')}
                          {stageLine(c.new_visa_obtained)}
                          {stageDot(c.new_visa_obtained, 'الفيزا الجديدة', '#15803d')}
                          {stageLine(actuallyDeparted)}
                          {stageDot(actuallyDeparted, 'غادر العراق', '#7c3aed')}
                          {stageLine(actual === 'completed')}
                          {stageDot(actual === 'completed', 'عاد للعراق', '#0891b2')}
                        </div>

                        {/* إجراءات المرحلة الحالية */}
                        {!readOnly && (
                          <div style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'flex-end',borderTop:'1px solid #f3f4f6',paddingTop:12}}>
                            {actual === 'grace_period' && (
                              <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
                                <div>
                                  <label style={{display:'block',marginBottom:3,fontSize:11,fontWeight:600,color:'#374151'}}>تاريخ إصدار فيزا المغادرة</label>
                                  <input type="date" value={si.exitDate||''} onChange={e=>updateStageInput(c.id,'exitDate',e.target.value)} style={inputSm}/>
                                </div>
                                <button onClick={()=>registerExitVisa(c)} style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:12,fontWeight:600}}>تسجيل فيزا المغادرة</button>
                              </div>
                            )}
                            {/* تظهر بمجرد صدور فيزا المغادرة بلا أي شرط زمني — تتيح إدخال رحلة ذهاب وعودة
                                محجوزة معاً مسبقاً؛ العودة تبقى اختيارية ويمكن تركها فارغة وإضافتها لاحقاً */}
                            {!!c.exit_visa_issued_date && (
                              <div style={{display:'flex',gap:16,alignItems:'flex-end',flexWrap:'wrap'}}>
                                <div style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap'}}>
                                  <div>
                                    <label style={{display:'block',marginBottom:3,fontSize:11,fontWeight:600,color:'#374151'}}>تاريخ المغادرة</label>
                                    <input type="date" value={si.depDate ?? c.departure_date ?? ''} onChange={e=>updateStageInput(c.id,'depDate',e.target.value)} style={inputSm}/>
                                  </div>
                                  <div>
                                    <label style={{display:'block',marginBottom:3,fontSize:11,fontWeight:600,color:'#374151'}}>الوقت</label>
                                    <input type="time" value={si.depTime ?? c.departure_time ?? nowTimeStr()} onChange={e=>updateStageInput(c.id,'depTime',e.target.value)} style={inputSm}/>
                                  </div>
                                  <div>
                                    <label style={{display:'block',marginBottom:3,fontSize:11,fontWeight:600,color:'#374151'}}>ملاحظة (وجهة/رحلة، اختياري)</label>
                                    <input value={si.depNotes ?? c.departure_notes ?? ''} onChange={e=>updateStageInput(c.id,'depNotes',e.target.value)} placeholder="مثال: دبي — FZ374" style={{...inputSm,minWidth:150}}/>
                                  </div>
                                </div>
                                <div style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap'}}>
                                  <div>
                                    <label style={{display:'block',marginBottom:3,fontSize:11,fontWeight:600,color:'#374151'}}>تاريخ العودة (اختياري الآن)</label>
                                    <input type="date" value={si.retDate ?? c.return_date ?? ''} onChange={e=>updateStageInput(c.id,'retDate',e.target.value)} style={inputSm}/>
                                  </div>
                                  <div>
                                    <label style={{display:'block',marginBottom:3,fontSize:11,fontWeight:600,color:'#374151'}}>الوقت</label>
                                    <input type="time" value={si.retTime ?? c.return_time ?? nowTimeStr()} onChange={e=>updateStageInput(c.id,'retTime',e.target.value)} style={inputSm}/>
                                  </div>
                                </div>
                                <button onClick={()=>saveDepartureReturn(c)} style={{background:'#7c3aed',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:12,fontWeight:600}}>حفظ بيانات المغادرة/العودة</button>
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
                                {(si.nvType||'سياحية') === 'سياحية' && (
                                  <div>
                                    <label style={{display:'block',marginBottom:3,fontSize:11,fontWeight:600,color:'#374151'}}>مدة الفيزا</label>
                                    <select value={si.nvDuration||'30'} onChange={e=>updateStageInput(c.id,'nvDuration',e.target.value)} style={inputSm}>
                                      <option value="30">30 يوم</option>
                                      <option value="60">60 يوم</option>
                                    </select>
                                  </div>
                                )}
                                <div>
                                  <label style={{display:'block',marginBottom:3,fontSize:11,fontWeight:600,color:'#374151'}}>رقمها (اختياري)</label>
                                  <input value={si.nvNumber||''} onChange={e=>updateStageInput(c.id,'nvNumber',e.target.value)} style={{...inputSm,width:120}}/>
                                </div>
                                <button onClick={()=>saveNewVisaInfo(c)} style={{background:'#dcfce7',color:'#15803d',border:'1px solid #86efac',borderRadius:8,padding:'8px 14px',cursor:'pointer',fontSize:12,fontWeight:700}}>✓ حصل على الفيزا الجديدة</button>
                              </div>
                            )}
                            <div style={{display:'flex',gap:6,alignItems:'flex-end'}}>
                              <div>
                                <label style={{display:'block',marginBottom:3,fontSize:11,fontWeight:600,color:'#374151'}}>ضم لمجموعة</label>
                                <input list="cycle-groups-join" value={si.grpName||''} onChange={e=>updateStageInput(c.id,'grpName',e.target.value)} placeholder="اسم مجموعة موجودة أو جديدة" style={{...inputSm,width:170}}/>
                                <datalist id="cycle-groups-join">
                                  {existingGroups.map(g=><option key={g} value={g}/>)}
                                </datalist>
                              </div>
                              <button onClick={()=>addToGroup(c, si.grpName||'')} style={{background:'#cffafe',color:'#0891b2',border:'1px solid #67e8f9',borderRadius:8,padding:'8px 12px',cursor:'pointer',fontSize:11,fontWeight:700}}>👥 ضم</button>
                            </div>
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

      {/* تبويب إضافة دفعة */}
      {activeTab === 'batch' && !readOnly && (
        <div>
          <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden',marginBottom:20}}>
            <div style={{padding:'16px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb'}}>
              <h2 style={{margin:0,fontSize:17,fontWeight:700,color:'#111827'}}>إضافة دفعة تأشيرات</h2>
            </div>
            <div style={{padding:'20px'}}>
              <div style={{display:'flex',gap:8,marginBottom:16}}>
                <button onClick={()=>setBatchType('tourist')}
                  style={{padding:'8px 18px',fontSize:13,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
                    background:batchCommon.type==='tourist'?'#1e40af':'#e5e7eb',color:batchCommon.type==='tourist'?'#fff':'#374151'}}>
                  سياحية
                </button>
                <button onClick={()=>setBatchType('annual')}
                  style={{padding:'8px 18px',fontSize:13,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
                    background:batchCommon.type==='annual'?'#7c3aed':'#e5e7eb',color:batchCommon.type==='annual'?'#fff':'#374151'}}>
                  سنوية
                </button>
              </div>

              <div style={{display:'grid',gridTemplateColumns: batchCommon.type==='tourist' ? '1fr 1fr 1fr' : '1fr 1fr',gap:12,maxWidth:700,marginBottom:16}}>
                <div>
                  <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>الجنسية *</label>
                  <input value={batchCommon.nationality} onChange={e=>setBatchCommon({...batchCommon,nationality:e.target.value})} placeholder="مثال: صيني" style={inputStyle}/>
                </div>
                <div>
                  <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>تاريخ الدخول *</label>
                  <input type="date" value={batchCommon.entry_date} onChange={e=>setBatchCommon({...batchCommon,entry_date:e.target.value})} style={inputStyle}/>
                </div>
                {batchCommon.type==='tourist' && (
                  <div>
                    <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>مدة الفيزا</label>
                    <select value={batchCommon.visa_duration} onChange={e=>setBatchCommon({...batchCommon,visa_duration:e.target.value})} style={inputStyle}>
                      <option value="30">30 يوم</option>
                      <option value="60">60 يوم</option>
                    </select>
                  </div>
                )}
              </div>

              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10,flexWrap:'wrap'}}>
                <span style={{fontSize:13,fontWeight:700,color:'#1e40af',background:'#eff6ff',padding:'6px 14px',borderRadius:20}}>
                  تم تعبئة {batchFilledCount} من {batchRows.length} سطر
                </span>
                <button onClick={()=>addBatchRows(10)}
                  style={{background:'#f3f4f6',color:'#374151',border:'1px solid #d1d5db',borderRadius:8,padding:'7px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                  + إضافة 10 أسطر
                </button>
                <label style={{display:'inline-flex',alignItems:'center',gap:6,background:'#eff6ff',color:'#1d4ed8',border:'1px dashed #93c5fd',borderRadius:8,padding:'7px 14px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                  📥 استيراد من Excel
                  <input type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={handleExcelFile}/>
                </label>
                <button onClick={downloadExcelTemplate}
                  style={{background:'#f3f4f6',color:'#374151',border:'1px solid #d1d5db',borderRadius:8,padding:'7px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                  ⬇ تنزيل قالب Excel فارغ
                </button>
              </div>
              {excelError && (
                <div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:8,padding:'10px 14px',marginBottom:12,color:'#dc2626',fontSize:13,fontWeight:600}}>
                  {excelError}
                </div>
              )}

              <div style={{overflowX:'auto',border:'1px solid #e5e7eb',borderRadius:10,marginBottom:14}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr style={{background:'#f3f4f6'}}>
                      <th style={{padding:'8px 12px',borderBottom:'2px solid #e5e7eb',width:40,color:'#6b7280'}}>#</th>
                      <th style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>الاسم</th>
                      <th style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>رقم الجواز</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchRows.map((row,idx)=>(
                      <tr key={idx} style={{borderBottom:'1px solid #f3f4f6'}}>
                        <td style={{padding:'6px 12px',color:'#9ca3af',fontSize:12,textAlign:'center'}}>{idx+1}</td>
                        <td style={{padding:'6px 8px'}}>
                          <input ref={el=>{batchNameRefs.current[idx]=el}} value={row.full_name} onChange={e=>updateBatchRow(idx,'full_name',e.target.value)}
                            style={{width:'100%',padding:'7px 10px',borderRadius:6,border:'1px solid #d1d5db',fontSize:13,color:'#111827',boxSizing:'border-box'}}/>
                        </td>
                        <td style={{padding:'6px 8px'}}>
                          <input value={row.passport_number} onChange={e=>updateBatchRow(idx,'passport_number',e.target.value)}
                            onKeyDown={e=>{ if(e.key==='Enter' && idx===batchRows.length-1){ e.preventDefault(); addBatchRows(1) } }}
                            style={{width:'100%',padding:'7px 10px',borderRadius:6,border:'1px solid #d1d5db',fontSize:13,color:'#111827',boxSizing:'border-box',direction:'ltr',textAlign:'right'}}/>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button onClick={saveBatch} disabled={batchSaving || batchFilledCount===0}
                style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontSize:14,fontWeight:600,opacity:(batchSaving||batchFilledCount===0)?0.6:1}}>
                {batchSaving ? 'جارٍ الحفظ...' : `حفظ الكل (${batchFilledCount})`}
              </button>
            </div>
          </div>

          {showExcelPreview && (
            <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden',marginBottom:20}}>
              <div style={{padding:'16px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <h2 style={{margin:0,fontSize:16,fontWeight:700,color:'#111827'}}>معاينة الاستيراد من Excel</h2>
                <button onClick={()=>setShowExcelPreview(false)} style={{background:'none',border:'none',color:'#6b7280',cursor:'pointer',fontSize:16}}>✕</button>
              </div>
              <div style={{padding:'12px 20px',display:'flex',gap:8,flexWrap:'wrap'}}>
                <span style={{background:'#dcfce7',color:'#15803d',padding:'4px 12px',borderRadius:20,fontSize:12,fontWeight:700}}>{batchImportCounts.new} جاهز للاستيراد</span>
                <span style={{background:'#f3f4f6',color:'#374151',padding:'4px 12px',borderRadius:20,fontSize:12,fontWeight:700}}>{batchImportCounts.duplicate} مكرر</span>
                <span style={{background:'#fee2e2',color:'#dc2626',padding:'4px 12px',borderRadius:20,fontSize:12,fontWeight:700}}>{batchImportCounts.incomplete} ناقص</span>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr style={{background:'#f3f4f6'}}>
                      {['الاسم','رقم الجواز','الجنسية','تاريخ الدخول','المدة','الحالة'].map(h=>(
                        <th key={h} style={{padding:'10px 14px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {excelPreview.map((r,i)=>(
                      <tr key={i} style={{borderBottom:'1px solid #e5e7eb'}}>
                        <td style={{padding:'8px 14px',fontWeight:600,color:'#111827'}}>{r.full_name || '—'}</td>
                        <td style={{padding:'8px 14px',color:'#6b7280',direction:'ltr',textAlign:'right'}}>{r.passport_number || '—'}</td>
                        <td style={{padding:'8px 14px',color:'#6b7280'}}>{r.nationality || '—'}</td>
                        <td style={{padding:'8px 14px',color:'#6b7280'}}>{r.entry_date || '—'}</td>
                        <td style={{padding:'8px 14px',color:'#6b7280'}}>{r.visa_duration ? `${r.visa_duration} يوم` : '—'}</td>
                        <td style={{padding:'8px 14px'}}>
                          {r.statusTag==='new' && <span style={{background:'#dcfce7',color:'#15803d',padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700}}>جديد</span>}
                          {r.statusTag==='duplicate' && <span style={{background:'#f3f4f6',color:'#374151',padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700}}>مكرر</span>}
                          {r.statusTag==='incomplete' && <span style={{background:'#fee2e2',color:'#dc2626',padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700}}>ناقص</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{padding:'14px 20px',display:'flex',gap:8}}>
                <button onClick={confirmExcelImport} disabled={excelImporting || batchImportCounts.new===0}
                  style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',cursor:'pointer',fontSize:14,fontWeight:600,opacity:(excelImporting||batchImportCounts.new===0)?0.6:1}}>
                  {excelImporting ? 'جارٍ الاستيراد...' : `تأكيد الاستيراد (${batchImportCounts.new})`}
                </button>
                <button onClick={()=>setShowExcelPreview(false)}
                  style={{background:'#e5e7eb',color:'#374151',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:14,fontWeight:600}}>
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
