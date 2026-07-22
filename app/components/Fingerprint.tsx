'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { logActivity } from '../logActivity'
import { Button, Input, Badge, Card, Table } from '../ui'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

interface Employee {
  id: string
  name: string
  device_user_id: string | null
  status: string
}

interface FingerprintRecord {
  id: string
  employee_id: string | null
  device_user_id: string
  device_name: string | null
  record_date: string
  first_punch: string | null
  last_punch: string | null
  punch_count: number
  applied_to_attendance: boolean
  notes: string | null
  imported_at: string
}

interface AttendanceRecord {
  id: string
  employee_id: string
  record_date: string
  status: string
  check_in: string | null
  check_out: string | null
}

interface ImportPreviewRow {
  device_user_id: string
  employee_id: string | null
  employee_name: string | null
  record_date: string
  first_punch: string
  last_punch: string
  punch_count: number
  statusTag: 'new' | 'duplicate' | 'unlinked'
}

interface MatchRow {
  key: string
  employee_id: string
  employee_name: string
  record_date: string
  fp: FingerprintRecord | null
  att: AttendanceRecord | null
  state: 'match' | 'mismatch' | 'none'
}

// ===== أدوات عامة =====
function today() { return new Date().toISOString().split('T')[0] }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('ar-IQ') }
function toHHMM(t: string | null): string { return t ? t.slice(0, 5) : '' }

// ينزع لواحق تشويش مثل A7P7 أو A1P1 (ترميز مكسور لاحظناه سابقاً في بعض الملفات) — لا علاقة له بمؤشر AM/PM الحقيقي
function stripGarbledSuffix(s: string): string {
  return s.replace(/[AP]\d[AP]\d/gi, '').trim()
}

// يقرأ خلية تاريخ ووقت مدمجة بصيغة M/D/YYYY H:mm[:ss] [AM/PM] (تنسيق جهاز البصمة) —
// يحوّل الوقت فوراً لنظام 24 ساعة صريح حسب مؤشر AM/PM (حرج: بدونه يُقرأ المساء أصغر من الصباح، مثلاً "1:45 PM" يبقى "01:45")
// يرفض تواريخ 1900/epoch وأوقات 0:00 لأنها ناتجة عن فصل عمود التاريخ/الوقت يدوياً بشكل معطوب في إكسل
function parseDateTimeCell(raw: string): { date: string | null; time: string | null } {
  const s = stripGarbledSuffix(String(raw || '').trim())
  if (!s) return { date: null, time: null }

  let date: string | null = null
  const dm = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (dm) {
    const month = parseInt(dm[1], 10), day = parseInt(dm[2], 10), year = parseInt(dm[3], 10)
    if (year >= 1971 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  } else {
    const dm2 = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (dm2) {
      const year = parseInt(dm2[1], 10)
      if (year >= 1971) date = `${dm2[1]}-${dm2[2].padStart(2, '0')}-${dm2[3].padStart(2, '0')}`
    }
  }

  let time: string | null = null
  const tm = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?/)
  if (tm) {
    let h = parseInt(tm[1], 10)
    const meridiem = tm[4] ? tm[4].replace(/[.\s]/g, '').toUpperCase() : null
    if (meridiem === 'PM' && h !== 12) h += 12
    else if (meridiem === 'AM' && h === 12) h = 0
    if (h <= 23) {
      const candidate = `${String(h).padStart(2, '0')}:${tm[2]}:${tm[3] || '00'}`
      if (candidate !== '00:00:00') time = candidate
    }
  }
  return { date, time }
}

function minutesBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  const [h1, m1] = a.split(':').map(Number)
  const [h2, m2] = b.split(':').map(Number)
  return Math.abs((h1 * 60 + m1) - (h2 * 60 + m2))
}

function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = []
  const start = new Date(from + 'T00:00:00')
  const end = new Date(to + 'T00:00:00')
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return dates
  const cur = new Date(start)
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function getDuration(r: FingerprintRecord): string {
  if (!r.first_punch || !r.last_punch || r.punch_count <= 1) return '—'
  const [h1, m1] = r.first_punch.split(':').map(Number)
  const [h2, m2] = r.last_punch.split(':').map(Number)
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1)
  if (mins < 0) mins = 0
  return `${Math.floor(mins / 60)}س ${mins % 60}د`
}

function getRecordIndicators(r: FingerprintRecord): { label: string; tone: 'warning' | 'danger' | 'neutral' | 'info' }[] {
  const badges: { label: string; tone: 'warning' | 'danger' | 'neutral' | 'info' }[] = []
  if (r.punch_count <= 1) {
    badges.push({ label: 'دخول بلا خروج', tone: 'neutral' })
  } else {
    if (r.first_punch && r.first_punch.slice(0, 5) > '07:00') badges.push({ label: 'تأخر', tone: 'warning' })
    if (r.last_punch && r.last_punch.slice(0, 5) < '14:00') badges.push({ label: 'خروج مبكر', tone: 'danger' })
  }
  const lateNight = (!!r.first_punch && r.first_punch.slice(0, 5) >= '21:00') || (!!r.last_punch && r.last_punch.slice(0, 5) >= '21:00')
  if (lateNight) badges.push({ label: 'خارج أوقات الدوام', tone: 'info' })
  return badges
}

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 20px', fontSize: 'var(--text-base)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 'var(--weight-semibold)',
  background: active ? 'var(--color-surface)' : 'transparent', color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
  boxShadow: active ? 'var(--shadow-xs)' : 'none',
})
const formLabelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 'var(--space-1)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-secondary)',
}
const formSelectStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)', border: 'var(--border-width-default) solid var(--color-border-strong)',
  fontSize: 'var(--text-sm)', boxSizing: 'border-box', color: 'var(--color-text)', background: 'var(--color-surface)',
}

export default function Fingerprint({ readOnly = false }: { readOnly?: boolean }) {
  const [activeTab, setActiveTab] = useState<'records' | 'link' | 'import' | 'match'>('records')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [fingerprintRecords, setFingerprintRecords] = useState<FingerprintRecord[]>([])

  useEffect(() => { loadEmployees(); loadFingerprintRecords() }, [])

  async function loadEmployees() {
    const { data } = await supabase.from('employees').select('id, name, device_user_id, status').eq('status', 'active').order('name')
    setEmployees((data as Employee[]) || [])
  }

  async function loadFingerprintRecords() {
    const { data } = await supabase.from('fingerprint_records').select('*').order('record_date', { ascending: false })
    setFingerprintRecords((data as FingerprintRecord[]) || [])
  }

  const employeeName = (id: string | null) => employees.find(e => e.id === id)?.name || null

  // ===== تبويب إعدادات الربط =====
  // خريطة جزئية للحقول التي عدّلها المستخدم فقط؛ الحقول غير المعدَّلة تعرض employees.device_user_id مباشرة
  const [linkValues, setLinkValues] = useState<Record<string, string>>({})
  const [savingLinks, setSavingLinks] = useState(false)

  const unlinkedCount = useMemo(() => employees.filter(e => !e.device_user_id || !e.device_user_id.trim()).length, [employees])

  async function saveLinkChanges() {
    const changed = employees.filter(e => e.id in linkValues && linkValues[e.id].trim() !== (e.device_user_id || ''))
    if (changed.length === 0) { alert('لا توجد تغييرات لحفظها'); return }
    setSavingLinks(true)
    for (const emp of changed) {
      await supabase.from('employees').update({ device_user_id: linkValues[emp.id].trim() || null }).eq('id', emp.id)
    }
    await logActivity('تعديل أرقام الربط', 'fingerprint', `تحديث ربط ${changed.length} موظف بجهاز البصمة`)
    await loadEmployees()
    setLinkValues({})
    setSavingLinks(false)
    alert(`تم تحديث ربط ${changed.length} موظف`)
  }

  // ===== تبويب استيراد سجلات =====
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([])
  const [importReadSample, setImportReadSample] = useState<{ device_user_id: string; record_date: string; time: string }[]>([])
  const [showImportPreview, setShowImportPreview] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const importCounts = useMemo(() => {
    const counts = { new: 0, duplicate: 0, unlinked: 0 }
    importPreview.forEach(r => { counts[r.statusTag]++ })
    return counts
  }, [importPreview])

  async function handleFingerprintFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
      if (rows.length < 2) { setImportError('الملف فارغ أو لا يحتوي على بيانات'); e.target.value = ''; return }

      // بنية ثابتة بالموضع (لا تُطابق بالاسم إطلاقاً): A=اسم المشروع (يُهمل) B=اسم الموظف (عرض فقط) C=رقم المستخدم (مفتاح الربط) D=تاريخ ووقت مدمج — أي عمود بعد D يُهمل
      const NAME_COL = 1, DEVICE_ID_COL = 2, DATETIME_COL = 3
      if ((rows[0]?.length || 0) <= DATETIME_COL) {
        setImportError('لم يتم العثور على الأعمدة المتوقعة (من A إلى D) في الملف'); e.target.value = ''; return
      }

      interface PunchEntry { device_user_id: string; record_date: string; time: string }
      const entries: PunchEntry[] = []
      const rawNameByDevice: Record<string, string> = {}

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r]
        if (!row || row.every(c => !String(c || '').trim())) continue
        const device_user_id = String(row[DEVICE_ID_COL] ?? '').trim()
        if (!device_user_id) continue
        if (!rawNameByDevice[device_user_id]) {
          const rn = String(row[NAME_COL] ?? '').trim()
          if (rn) rawNameByDevice[device_user_id] = rn
        }

        const { date: record_date, time } = parseDateTimeCell(String(row[DATETIME_COL] ?? ''))
        if (!record_date || !time) continue
        entries.push({ device_user_id, record_date, time })
      }

      setImportReadSample(entries.slice(0, 3))

      if (entries.length === 0) { setImportError('لا توجد بصمات صالحة في الملف — تحقق من صيغة الوقت والتاريخ'); e.target.value = ''; return }

      const groups: Record<string, PunchEntry[]> = {}
      entries.forEach(en => {
        const key = `${en.device_user_id}__${en.record_date}`
        ;(groups[key] = groups[key] || []).push(en)
      })

      const existingKeys = new Set(fingerprintRecords.map(r => `${r.device_user_id}__${r.record_date}`))
      const preview: ImportPreviewRow[] = Object.values(groups).map(list => {
        // إزالة تكرار البصمة بدقة الدقيقة (الجهاز أحياناً يقرأ الإصبع مرتين لنفس الدقيقة)
        const uniqueTimes = Array.from(new Set(list.map(en => en.time))).sort()
        const device_user_id = list[0].device_user_id
        const record_date = list[0].record_date
        const emp = employees.find(e => (e.device_user_id || '').trim() === device_user_id)
        const key = `${device_user_id}__${record_date}`
        const statusTag: ImportPreviewRow['statusTag'] = !emp ? 'unlinked' : existingKeys.has(key) ? 'duplicate' : 'new'
        return {
          device_user_id, record_date, employee_id: emp?.id || null,
          employee_name: emp?.name || (rawNameByDevice[device_user_id] ? `${rawNameByDevice[device_user_id]} (من الملف)` : null),
          first_punch: uniqueTimes[0], last_punch: uniqueTimes[uniqueTimes.length - 1], punch_count: uniqueTimes.length, statusTag,
        }
      })

      setImportPreview(preview)
      setShowImportPreview(true)
    } catch {
      setImportError('تعذر قراءة الملف — تأكد أنه بصيغة Excel أو CSV صحيحة')
    }
    e.target.value = ''
  }

  async function confirmFingerprintImport() {
    if (importPreview.length === 0) { setShowImportPreview(false); return }
    setImporting(true)
    const payload = importPreview.map(r => ({
      device_user_id: r.device_user_id,
      employee_id: r.employee_id,
      record_date: r.record_date,
      first_punch: r.first_punch,
      last_punch: r.last_punch,
      punch_count: r.punch_count,
    }))
    const { error } = await supabase.from('fingerprint_records').upsert(payload, { onConflict: 'device_user_id,record_date' })
    if (error) { alert('خطأ: ' + error.message); setImporting(false); return }
    await logActivity('استيراد سجلات بصمة', 'fingerprint', `استيراد ${payload.length} سجل بصمة`)
    await loadFingerprintRecords()
    setShowImportPreview(false)
    setImportPreview([])
    setImporting(false)
    alert(`تم استيراد ${payload.length} سجل بصمة بنجاح`)
  }

  // ===== تبويب السجلات =====
  const [recFrom, setRecFrom] = useState('')
  const [recTo, setRecTo] = useState('')
  const [recEmployee, setRecEmployee] = useState('all')
  const [recSearch, setRecSearch] = useState('')

  const filteredRecords = useMemo(() => {
    let list = fingerprintRecords
    if (recFrom) list = list.filter(r => r.record_date >= recFrom)
    if (recTo) list = list.filter(r => r.record_date <= recTo)
    if (recEmployee !== 'all') list = list.filter(r => r.employee_id === recEmployee)
    if (recSearch.trim()) {
      const term = recSearch.trim().toLowerCase()
      list = list.filter(r => (employees.find(e => e.id === r.employee_id)?.name || '').toLowerCase().includes(term) || r.device_user_id.toLowerCase().includes(term))
    }
    return list
  }, [fingerprintRecords, recFrom, recTo, recEmployee, recSearch, employees])

  function exportRecordsExcel() {
    const rows = filteredRecords.map(r => ({
      'الموظف': employeeName(r.employee_id) || `${r.device_user_id} (غير مربوط)`,
      'التاريخ': r.record_date,
      'أول بصمة': toHHMM(r.first_punch),
      'آخر بصمة': toHHMM(r.last_punch),
      'عدد البصمات': r.punch_count,
      'المدة': getDuration(r),
    }))
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'سجلات البصمة')
    XLSX.writeFile(workbook, 'سجلات البصمة.xlsx')
  }

  async function deleteFingerprintRecord(r: FingerprintRecord) {
    const label = employeeName(r.employee_id) || r.device_user_id
    if (!confirm(`حذف سجل بصمة ${label} بتاريخ ${fmtDate(r.record_date)}؟`)) return
    await supabase.from('fingerprint_records').delete().eq('id', r.id)
    await logActivity('حذف سجل بصمة', 'fingerprint', `حذف سجل ${label} - ${r.record_date}`)
    await loadFingerprintRecords()
  }

  // ===== تبويب المطابقة مع الحضور =====
  const [matchFrom, setMatchFrom] = useState(today())
  const [matchTo, setMatchTo] = useState(today())
  const [matchRows, setMatchRows] = useState<MatchRow[]>([])
  const [matchLoading, setMatchLoading] = useState(false)
  const [matchLoaded, setMatchLoaded] = useState(false)
  const [matchDiffOnly, setMatchDiffOnly] = useState(false)
  const [matchSearch, setMatchSearch] = useState('')
  const [matchSelected, setMatchSelected] = useState<Set<string>>(new Set())
  const [matchApplying, setMatchApplying] = useState(false)

  async function loadMatchComparison() {
    if (!matchFrom || !matchTo) return
    setMatchLoading(true)
    const [{ data: fpData }, { data: attData }] = await Promise.all([
      supabase.from('fingerprint_records').select('*').gte('record_date', matchFrom).lte('record_date', matchTo),
      supabase.from('attendance_records').select('*').gte('record_date', matchFrom).lte('record_date', matchTo),
    ])
    const fpList = (fpData as FingerprintRecord[]) || []
    const attList = (attData as AttendanceRecord[]) || []
    const dates = enumerateDates(matchFrom, matchTo)
    const rows: MatchRow[] = []
    employees.forEach(emp => {
      dates.forEach(d => {
        const fp = fpList.find(f => f.employee_id === emp.id && f.record_date === d) || null
        const att = attList.find(a => a.employee_id === emp.id && a.record_date === d) || null
        if (!fp && !att) return
        const attPresent = !!att && att.status === 'حاضر'
        let state: MatchRow['state']
        if (fp && attPresent) {
          // نطاق ساعة كاملة (60 دقيقة) وليس تطابقاً حرفياً للدقيقة — يُطبَّق على الدخول والخروج معاً
          const inDiff = minutesBetween(fp.first_punch, att!.check_in)
          const outDiff = minutesBetween(fp.last_punch, att!.check_out)
          const inOk = inDiff !== null && inDiff <= 60
          const outOk = outDiff !== null && outDiff <= 60
          state = (inOk && outOk) ? 'match' : 'mismatch'
        } else if (fp || attPresent) state = 'mismatch'
        else state = 'none'
        rows.push({ key: `${emp.id}__${d}`, employee_id: emp.id, employee_name: emp.name, record_date: d, fp, att, state })
      })
    })
    rows.sort((a, b) => a.record_date === b.record_date ? a.employee_name.localeCompare(b.employee_name, 'ar') : (a.record_date < b.record_date ? 1 : -1))
    setMatchRows(rows)
    setMatchSelected(new Set())
    setMatchLoaded(true)
    setMatchLoading(false)
  }

  const displayedMatchRows = useMemo(() => {
    let rows = matchDiffOnly ? matchRows.filter(r => r.state === 'mismatch') : matchRows
    if (matchSearch.trim()) {
      const term = matchSearch.trim().toLowerCase()
      rows = rows.filter(r => r.employee_name.toLowerCase().includes(term))
    }
    return rows
  }, [matchRows, matchDiffOnly, matchSearch])

  function toggleMatchSelect(key: string) {
    setMatchSelected(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
  }

  async function applyRowToAttendance(row: MatchRow) {
    if (!row.fp || !row.fp.first_punch || !row.fp.last_punch) return
    if (!confirm(`تسجيل حضور ${row.employee_name} ليوم ${fmtDate(row.record_date)} من بيانات البصمة (${toHHMM(row.fp.first_punch)} - ${toHHMM(row.fp.last_punch)})؟ سيُستبدل أي سجل حضور موجود لهذا اليوم.`)) return
    setMatchApplying(true)
    const { error } = await supabase.from('attendance_records').upsert([{
      employee_id: row.employee_id, record_date: row.record_date, status: 'حاضر',
      check_in: toHHMM(row.fp.first_punch), check_out: toHHMM(row.fp.last_punch),
    }], { onConflict: 'employee_id,record_date' })
    if (error) { alert('خطأ: ' + error.message); setMatchApplying(false); return }
    await supabase.from('fingerprint_records').update({ applied_to_attendance: true }).eq('id', row.fp.id)
    await logActivity('تطبيق بصمة على الحضور', 'fingerprint', `تطبيق يوم واحد لـ ${row.employee_name} (${row.record_date})`)
    await loadMatchComparison()
    setMatchApplying(false)
  }

  async function applySelectedToAttendance() {
    const rows = matchRows.filter(r => matchSelected.has(r.key) && r.fp && r.fp.first_punch && r.fp.last_punch)
    if (rows.length === 0) { alert('يرجى تحديد صفوف تحتوي على بصمة'); return }
    const employeesCount = new Set(rows.map(r => r.employee_id)).size
    if (!confirm(`تطبيق ${rows.length} يوم حضور لـ ${employeesCount} موظف من بيانات البصمة؟ سيُستبدل أي سجل حضور موجود لهذه الأيام.`)) return
    setMatchApplying(true)
    const payload = rows.map(r => ({
      employee_id: r.employee_id, record_date: r.record_date, status: 'حاضر',
      check_in: toHHMM(r.fp!.first_punch), check_out: toHHMM(r.fp!.last_punch),
    }))
    const { error } = await supabase.from('attendance_records').upsert(payload, { onConflict: 'employee_id,record_date' })
    if (error) { alert('خطأ: ' + error.message); setMatchApplying(false); return }
    await supabase.from('fingerprint_records').update({ applied_to_attendance: true }).in('id', rows.map(r => r.fp!.id))
    await logActivity('تطبيق بصمة على الحضور', 'fingerprint', `تطبيق ${rows.length} يوم حضور لـ ${employeesCount} موظف`)
    setMatchSelected(new Set())
    await loadMatchComparison()
    setMatchApplying(false)
  }

  // ================================================================= JSX
  return (
    <div style={{ margin: '24px', fontFamily: 'var(--font-sans)', direction: 'rtl' }}>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', background: 'var(--color-border)', padding: 'var(--space-1)', borderRadius: 'var(--radius-lg)', width: 'fit-content', flexWrap: 'wrap' }}>
        <button onClick={() => setActiveTab('records')} style={tabBtnStyle(activeTab === 'records')}>السجلات</button>
        <button onClick={() => setActiveTab('match')} style={tabBtnStyle(activeTab === 'match')}>المطابقة مع الحضور</button>
        <button onClick={() => setActiveTab('link')} style={tabBtnStyle(activeTab === 'link')}>إعدادات الربط</button>
        {!readOnly && <button onClick={() => setActiveTab('import')} style={tabBtnStyle(activeTab === 'import')}>استيراد سجلات</button>}
      </div>

      {/* ========================== تبويب إعدادات الربط ========================== */}
      {activeTab === 'link' && (
        <Card>
          <div className="ui-card__header">
            <h2 className="ui-card__title" style={{ fontSize: 'var(--text-md)' }}>ربط الموظفين برقم الجهاز</h2>
            {!readOnly && <Button variant="success" size="sm" onClick={saveLinkChanges} disabled={savingLinks}>{savingLinks ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}</Button>}
          </div>
          {unlinkedCount > 0 && (
            <div style={{ margin: '0 var(--space-5)', marginTop: 'var(--space-4)', background: 'var(--color-warning-surface)', border: 'var(--border-width-thin) solid var(--color-warning-border)', borderRadius: 'var(--radius-md)', padding: '10px 16px', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-warning)' }}>
              {unlinkedCount} موظف غير مربوط بالجهاز — سجلاتهم لن تُستورد
            </div>
          )}
          <div style={{ padding: 'var(--space-5)' }}>
            <Table>
              <thead>
                <tr>{['الموظف', 'رقم الجهاز'].map((h, i) => <Table.Th key={i}>{h}</Table.Th>)}</tr>
              </thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.id}>
                    <Table.Td style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)' }}>{emp.name}</Table.Td>
                    <Table.Td>
                      {readOnly ? (emp.device_user_id || '—') : (
                        <input value={linkValues[emp.id] ?? emp.device_user_id ?? ''} onChange={e => setLinkValues({ ...linkValues, [emp.id]: e.target.value })}
                          placeholder="رقم الموظف بالجهاز" style={{ ...formSelectStyle, maxWidth: 200, direction: 'ltr', textAlign: 'right' }} />
                      )}
                    </Table.Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      )}

      {/* ========================== تبويب استيراد سجلات ========================== */}
      {activeTab === 'import' && !readOnly && (
        <div>
          <Card style={{ marginBottom: 'var(--space-4)' }}>
            <div className="ui-card__header">
              <h2 className="ui-card__title" style={{ fontSize: 'var(--text-md)' }}>استيراد سجلات من ملف الجهاز</h2>
            </div>
            <div style={{ padding: 'var(--space-5)' }}>
              <div style={{ background: 'var(--color-info-surface)', border: 'var(--border-width-thin) solid var(--color-info-border)', borderRadius: 'var(--radius-md)', padding: '10px 16px', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-info)', fontWeight: 'var(--weight-semibold)' }}>
                ارفع الملف كما يصدّره الجهاز مباشرة دون فصل أعمدة التاريخ والوقت يدوياً
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--color-accent-subtle)', color: 'var(--color-accent-hover)', border: 'var(--border-width-thin) dashed var(--color-border-strong)', borderRadius: 'var(--radius-md)', padding: '10px 18px', cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>
                📥 رفع ملف Excel أو CSV
                <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFingerprintFile} />
              </label>
              {importError && <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-danger)', fontWeight: 'var(--weight-semibold)' }}>{importError}</div>}
            </div>
          </Card>

          {showImportPreview && importReadSample.length > 0 && (
            <Card style={{ marginBottom: 'var(--space-4)' }}>
              <div className="ui-card__header">
                <h3 className="ui-card__title" style={{ fontSize: 'var(--text-md)' }}>تأكيد القراءة (أول 3 صفوف من الملف)</h3>
              </div>
              <Table>
                <thead>
                  <tr>{['رقم المستخدم', 'التاريخ المقروء', 'الوقت المقروء'].map((h, i) => <Table.Th key={i}>{h}</Table.Th>)}</tr>
                </thead>
                <tbody>
                  {importReadSample.map((s, i) => (
                    <tr key={i}>
                      <Table.Td style={{ direction: 'ltr', textAlign: 'right' }}>{s.device_user_id}</Table.Td>
                      <Table.Td>{fmtDate(s.record_date)}</Table.Td>
                      <Table.Td>{toHHMM(s.time)}</Table.Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}

          {showImportPreview && (
            <Card>
              <div className="ui-card__header">
                <h3 className="ui-card__title" style={{ fontSize: 'var(--text-md)' }}>معاينة الاستيراد</h3>
                <Button variant="ghost" size="sm" onClick={() => setShowImportPreview(false)}>إغلاق ✕</Button>
              </div>
              <div style={{ padding: '12px 20px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Badge tone="success">{importCounts.new} جديد</Badge>
                <Badge tone="info">{importCounts.duplicate} مكرر (سيُحدَّث)</Badge>
                <Badge tone="warning">{importCounts.unlinked} رقم غير مربوط بموظف</Badge>
              </div>
              <Table>
                <thead>
                  <tr>{['رقم الجهاز', 'الموظف', 'التاريخ', 'أول بصمة', 'آخر بصمة', 'عدد البصمات', 'الحالة'].map((h, i) => <Table.Th key={i}>{h}</Table.Th>)}</tr>
                </thead>
                <tbody>
                  {importPreview.map((r, i) => (
                    <tr key={i}>
                      <Table.Td style={{ direction: 'ltr', textAlign: 'right' }}>{r.device_user_id}</Table.Td>
                      <Table.Td style={{ fontWeight: 'var(--weight-semibold)' }}>{r.employee_name || '—'}</Table.Td>
                      <Table.Td>{fmtDate(r.record_date)}</Table.Td>
                      <Table.Td>{toHHMM(r.first_punch)}</Table.Td>
                      <Table.Td>{toHHMM(r.last_punch)}</Table.Td>
                      <Table.Td className="ui-table__numeric">{r.punch_count}</Table.Td>
                      <Table.Td>
                        {r.statusTag === 'new' && <Badge tone="success" size="sm">جديد</Badge>}
                        {r.statusTag === 'duplicate' && <Badge tone="info" size="sm">مكرر</Badge>}
                        {r.statusTag === 'unlinked' && <Badge tone="warning" size="sm">غير مربوط</Badge>}
                      </Table.Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <div style={{ padding: '12px 20px', display: 'flex', gap: 8 }}>
                <Button variant="success" size="md" disabled={importing} onClick={confirmFingerprintImport}>
                  {importing ? 'جارٍ الاستيراد...' : `تأكيد الاستيراد (${importPreview.length})`}
                </Button>
                <Button variant="secondary" size="md" onClick={() => setShowImportPreview(false)}>إلغاء</Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ========================== تبويب السجلات ========================== */}
      {activeTab === 'records' && (
        <Card>
          <div className="ui-card__header">
            <h2 className="ui-card__title" style={{ fontSize: 'var(--text-md)' }}>سجلات البصمة ({filteredRecords.length})</h2>
            <Button variant="success-soft" size="sm" onClick={exportRecordsExcel}>تصدير Excel</Button>
          </div>
          <div style={{ padding: '14px 20px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', borderBottom: 'var(--border-width-thin) solid var(--color-border)' }}>
            <div><label style={formLabelStyle}>من تاريخ</label><input type="date" value={recFrom} onChange={e => setRecFrom(e.target.value)} style={{ ...formSelectStyle, width: 'auto' }} /></div>
            <div><label style={formLabelStyle}>إلى تاريخ</label><input type="date" value={recTo} onChange={e => setRecTo(e.target.value)} style={{ ...formSelectStyle, width: 'auto' }} /></div>
            <div>
              <label style={formLabelStyle}>الموظف</label>
              <select value={recEmployee} onChange={e => setRecEmployee(e.target.value)} style={{ ...formSelectStyle, width: 'auto', minWidth: 160 }}>
                <option value="all">كل الموظفين</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <Input placeholder="بحث بالاسم أو رقم الجهاز..." value={recSearch} onChange={e => setRecSearch(e.target.value)} size="sm" style={{ minWidth: 220, width: 'auto' }} />
          </div>
          {filteredRecords.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-faint)' }}>لا توجد سجلات مطابقة</div>
          ) : (
            <Table>
              <thead>
                <tr>{['الموظف', 'التاريخ', 'أول بصمة', 'آخر بصمة', 'عدد البصمات', 'المدة', 'مؤشرات', ''].map((h, i) => <Table.Th key={i}>{h}</Table.Th>)}</tr>
              </thead>
              <tbody>
                {filteredRecords.map(r => (
                  <tr key={r.id}>
                    <Table.Td style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)' }}>{employeeName(r.employee_id) || `${r.device_user_id} (غير مربوط)`}</Table.Td>
                    <Table.Td>{fmtDate(r.record_date)}</Table.Td>
                    <Table.Td>{toHHMM(r.first_punch)}</Table.Td>
                    <Table.Td>{toHHMM(r.last_punch)}</Table.Td>
                    <Table.Td className="ui-table__numeric">{r.punch_count}</Table.Td>
                    <Table.Td>{getDuration(r)}</Table.Td>
                    <Table.Td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {getRecordIndicators(r).map((b, i) => <Badge key={i} tone={b.tone} size="sm">{b.label}</Badge>)}
                        {r.applied_to_attendance && <Badge tone="success" size="sm">مُطبَّق على الحضور</Badge>}
                      </div>
                    </Table.Td>
                    <Table.Td>
                      {!readOnly && <Button variant="danger" size="sm" onClick={() => deleteFingerprintRecord(r)}>حذف</Button>}
                    </Table.Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {/* ========================== تبويب المطابقة مع الحضور ========================== */}
      {activeTab === 'match' && (
        <div>
          <Card style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ padding: 'var(--space-5)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div><label style={formLabelStyle}>من تاريخ</label><input type="date" value={matchFrom} onChange={e => setMatchFrom(e.target.value)} style={{ ...formSelectStyle, width: 'auto' }} /></div>
              <div><label style={formLabelStyle}>إلى تاريخ</label><input type="date" value={matchTo} onChange={e => setMatchTo(e.target.value)} style={{ ...formSelectStyle, width: 'auto' }} /></div>
              <Button variant="primary" size="md" onClick={loadMatchComparison} disabled={matchLoading}>{matchLoading ? 'جارٍ التحميل...' : 'عرض المقارنة'}</Button>
              {matchLoaded && (
                <>
                  <Input placeholder="بحث بالاسم..." value={matchSearch} onChange={e => setMatchSearch(e.target.value)} size="sm" style={{ minWidth: 180, width: 'auto' }} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', cursor: 'pointer', marginRight: 'auto' }}>
                    <input type="checkbox" checked={matchDiffOnly} onChange={e => setMatchDiffOnly(e.target.checked)} />
                    عرض الاختلافات فقط
                  </label>
                </>
              )}
              {!readOnly && matchSelected.size > 0 && (
                <Button variant="success" size="md" onClick={applySelectedToAttendance} disabled={matchApplying}>
                  {matchApplying ? 'جارٍ التطبيق...' : `تطبيق كل المطابقات المختارة (${matchSelected.size})`}
                </Button>
              )}
            </div>
          </Card>

          {matchLoaded && (
            <Card>
              {displayedMatchRows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-faint)' }}>لا توجد بيانات للمقارنة في هذا النطاق</div>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Table.Th></Table.Th>
                      {['التاريخ', 'الموظف', 'البصمة', 'الحضور المسجل', 'الحالة', ''].map((h, i) => <Table.Th key={i}>{h}</Table.Th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {displayedMatchRows.map(row => (
                      <tr key={row.key}>
                        <Table.Td onClick={e => e.stopPropagation()}>
                          {!readOnly && row.fp && (
                            <input type="checkbox" checked={matchSelected.has(row.key)} onChange={() => toggleMatchSelect(row.key)} />
                          )}
                        </Table.Td>
                        <Table.Td>{fmtDate(row.record_date)}</Table.Td>
                        <Table.Td style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)' }}>{row.employee_name}</Table.Td>
                        <Table.Td>{row.fp ? `${toHHMM(row.fp.first_punch)} - ${toHHMM(row.fp.last_punch)}` : '—'}</Table.Td>
                        <Table.Td>{row.att ? `${row.att.status} (${toHHMM(row.att.check_in)} - ${toHHMM(row.att.check_out)})` : '—'}</Table.Td>
                        <Table.Td>
                          {row.state === 'match' && <Badge tone="success">مطابق</Badge>}
                          {row.state === 'mismatch' && <Badge tone="warning">اختلاف</Badge>}
                          {row.state === 'none' && <Badge tone="neutral">لا بصمة</Badge>}
                        </Table.Td>
                        <Table.Td>
                          {!readOnly && row.fp && (
                            <Button variant="accent-soft" size="sm" disabled={matchApplying} onClick={() => applyRowToAttendance(row)}>تطبيق على الحضور</Button>
                          )}
                        </Table.Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
