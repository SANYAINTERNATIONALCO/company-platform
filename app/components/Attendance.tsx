'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

interface Employee {
  id: string
  name: string
  job_title: string
  shift_type?: string
}

interface AttendanceRecord {
  employee_id: string
  status: string
  check_in?: string
  check_out?: string
  notes?: string
}

interface MonthlyRow {
  الاسم: string
  الشهر: string
  'أيام الدوام': number
  روتيشن: number
  'ايام الجمعه': number
  'عدد ايام الغياب': number
  'إجازة مرضية': number
  'إجازة طارئة': number
  'إجازة اعتيادية': number
  'عطلة رسمية': number
  'مجموع الايام': number
}

interface DailyDetail {
  record_date: string
  status: string
  check_in: string | null
  check_out: string | null
  notes: string | null
}

const DEFAULT_CHECK_IN = '07:00'
const DEFAULT_CHECK_OUT = '14:00'

const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

const monthLabel = (m: string): string => {
  const [year, month] = m.split('-')
  const names = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
  return names[parseInt(month) - 1] + ' ' + year
}

export default function Attendance({ readOnly = false }: { readOnly?: boolean }) {
  const [viewMode, setViewMode] = useState('daily')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [records, setRecords] = useState<Record<string, AttendanceRecord>>({})
  const [savedRecords, setSavedRecords] = useState<Record<string, AttendanceRecord>>({})
  const [monthlySummaryList, setMonthlySummaryList] = useState<MonthlyRow[]>([])
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [selectedMonths, setSelectedMonths] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  // فلترة
  const [searchName, setSearchName] = useState('')
  const [filterJobTitle, setFilterJobTitle] = useState('')

  // اختيار موظفين للموقف الشهري
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([])
  const [dailyDetails, setDailyDetails] = useState<Record<string, DailyDetail[]>>({})

  useEffect(() => { loadEmployees() }, [])

  useEffect(() => {
    if (employees.length > 0 && viewMode === 'daily' && selectedDate) {
      loadDailyRecords(selectedDate)
    }
  }, [selectedDate, employees, viewMode])

  useEffect(() => {
    if (viewMode === 'monthly') loadAvailableMonths()
  }, [viewMode])

  useEffect(() => {
    if (selectedMonths.length > 0) loadMonthlySummary(selectedMonths)
  }, [selectedMonths])

  async function loadEmployees() {
    const { data } = await supabase.from('employees').select('*').eq('status', 'active').order('name')
    setEmployees((data as Employee[]) || [])
    const t = new Date().toISOString().split('T')[0]
    setSelectedDate(t)
  }

  // جلب آخر حالة روتيشن معروفة لموظف قبل تاريخ معين
  async function getLastRotationStatus(employeeId: string, beforeDate: string): Promise<string | null> {
    const { data } = await supabase
      .from('attendance_records')
      .select('status, record_date')
      .eq('employee_id', employeeId)
      .lt('record_date', beforeDate)
      .order('record_date', { ascending: false })
      .limit(1)
    if (data && data.length > 0) return data[0].status
    return null
  }

  async function loadDailyRecords(date: string) {
    setLoading(true)
    const { data } = await supabase.from('attendance_records').select('*').eq('record_date', date)
    const existing: Record<string, AttendanceRecord> = {}
    const saved: Record<string, AttendanceRecord> = {}

    if (data) {
      data.forEach((r: any) => {
        const rec: AttendanceRecord = {
          employee_id: r.employee_id,
          status: r.status,
          check_in: r.check_in || DEFAULT_CHECK_IN,
          check_out: r.check_out || DEFAULT_CHECK_OUT,
          notes: r.notes || ''
        }
        existing[r.employee_id] = rec
        saved[r.employee_id] = { ...rec }
      })
    }

    // تطبيق الحالة الافتراضية للموظفين الذين لا يوجد لهم سجل اليوم
    for (const emp of employees) {
      if (!existing[emp.id]) {
        if (emp.shift_type === 'روتيشن') {
          // جلب آخر حالة روتيشن معروفة
          const lastStatus = await getLastRotationStatus(emp.id, date)
          existing[emp.id] = {
            employee_id: emp.id,
            status: lastStatus || 'حاضر',
            check_in: DEFAULT_CHECK_IN,
            check_out: DEFAULT_CHECK_OUT,
            notes: ''
          }
        } else {
          // دوام يومي = حاضر افتراضياً
          existing[emp.id] = {
            employee_id: emp.id,
            status: 'حاضر',
            check_in: DEFAULT_CHECK_IN,
            check_out: DEFAULT_CHECK_OUT,
            notes: ''
          }
        }
      }
    }

    setRecords(existing)
    setSavedRecords(saved)
    setLoading(false)
  }

  async function loadAvailableMonths() {
    const { data } = await supabase.from('attendance_records').select('record_date').order('record_date', { ascending: false })
    if (data) {
      const months = [...new Set((data as { record_date: string }[]).map(r => r.record_date.slice(0, 7)))]
      setAvailableMonths(months)
      if (months.length > 0 && selectedMonths.length === 0) setSelectedMonths([months[0]])
    }
  }

  async function loadMonthlySummary(months: string[]) {
    setLoading(true)
    const { data } = await supabase.from('monthly_attendance_summary').select('*').in('الشهر', months)
    setMonthlySummaryList((data as MonthlyRow[]) || [])

    // إذا تم اختيار موظف واحد بالتحديد، نجلب التفاصيل اليومية
    if (selectedEmployeeIds.length === 1) {
      const empId = selectedEmployeeIds[0]
      const { data: dailyData } = await supabase
        .from('attendance_records')
        .select('record_date, status, check_in, check_out, notes')
        .eq('employee_id', empId)
        .order('record_date', { ascending: true })
      if (dailyData) {
        const filtered = (dailyData as DailyDetail[]).filter(d => months.includes(d.record_date.slice(0,7)))
        setDailyDetails({ [empId]: filtered })
      }
    } else {
      setDailyDetails({})
    }
    setLoading(false)
  }

  async function saveAll() {
    const changedEmployees = employees.filter(emp => {
      const cur = records[emp.id]
      const sav = savedRecords[emp.id]
      if (!cur) return false
      if (!sav) return true
      return cur.status !== sav.status || cur.check_in !== sav.check_in || cur.check_out !== sav.check_out || cur.notes !== sav.notes
    })
    if (changedEmployees.length === 0) { alert('لا توجد تغييرات جديدة للحفظ'); return }
    setSaving(true)
    for (const emp of changedEmployees) {
      const rec = records[emp.id]
      const { error } = await supabase.from('attendance_records').upsert({
        employee_id: emp.id,
        record_date: selectedDate,
        status: rec.status,
        check_in: rec.check_in,
        check_out: rec.check_out,
        notes: rec.notes
      }, { onConflict: 'employee_id,record_date' })
      if (error) { alert('خطأ في حفظ ' + emp.name + ': ' + error.message); setSaving(false); return }
    }
    await loadDailyRecords(selectedDate)
    await loadAvailableMonths()
    setSaving(false)
    alert('تم حفظ ' + changedEmployees.length + ' سجل بنجاح')
  }

  function updateRecord(empId: string, field: keyof AttendanceRecord, value: string) {
    setRecords(prev => ({
      ...prev,
      [empId]: { ...prev[empId], [field]: value }
    }))
  }

  function selectAllPresent() {
    const updated = { ...records }
    filteredEmployees.forEach(emp => {
      updated[emp.id] = { ...updated[emp.id], status: 'حاضر' }
    })
    setRecords(updated)
  }

  function handlePrintMonthly() {
    const printContent = printRef.current
    if (!printContent) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>الموقف الشهري</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; direction: rtl; color: #111; padding: 20px; }
          .header { text-align: center; border-bottom: 3px solid #1e40af; padding-bottom: 16px; margin-bottom: 24px; }
          .company-name { font-size: 22px; font-weight: bold; color: #1e40af; margin-bottom: 4px; }
          .report-title { font-size: 16px; color: #374151; margin-bottom: 4px; }
          .report-date { font-size: 13px; color: #6b7280; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px; }
          th { background: #1e40af; color: #fff; padding: 9px 10px; text-align: center; font-weight: 600; white-space: nowrap; }
          th:first-child { text-align: right; }
          td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: center; }
          td:first-child { text-align: right; font-weight: 600; }
          tr:nth-child(even) { background: #f9fafb; }
          .total-col { background: #eff6ff; font-weight: bold; color: #1e40af; }
          .absent { color: #dc2626; font-weight: bold; }
          .present { color: #15803d; font-weight: bold; }
          .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 11px; color: #9ca3af; }
        </style>
      </head>
      <body>${printContent.innerHTML}</body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => { printWindow.print(); printWindow.close() }, 500)
  }

  const statusColor = (s: string) => {
    if (!s) return { background: '#f3f4f6', color: '#9ca3af' }
    if (['حاضر', 'روتيشن'].includes(s)) return { background: '#dcfce7', color: '#15803d' }
    if (s === 'يوم جمعة') return { background: '#dbeafe', color: '#1d4ed8' }
    if (s === 'غائب') return { background: '#fee2e2', color: '#dc2626' }
    return { background: '#fef9c3', color: '#b45309' }
  }

  const jobTitles = useMemo(() => {
    return [...new Set(employees.map(e => e.job_title))].filter(Boolean)
  }, [employees])

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const nameMatch = !searchName || emp.name.toLowerCase().includes(searchName.toLowerCase())
      const jobMatch = !filterJobTitle || emp.job_title === filterJobTitle
      return nameMatch && jobMatch
    })
  }, [employees, searchName, filterJobTitle])

  const unsavedCount = employees.filter(emp => {
    const cur = records[emp.id]
    const sav = savedRecords[emp.id]
    if (!cur) return false
    if (!sav) return true
    return cur.status !== sav.status || cur.check_in !== sav.check_in || cur.check_out !== sav.check_out || cur.notes !== sav.notes
  }).length

  const monthlyCols = ['الاسم','الشهر','أيام الدوام','روتيشن','ايام الجمعه','عدد ايام الغياب','إجازة مرضية','إجازة طارئة','إجازة اعتيادية','عطلة رسمية','مجموع الايام']

  const filteredMonthlySummary = useMemo(() => {
    if (selectedEmployeeIds.length === 0) return monthlySummaryList
    const selectedNames = employees.filter(e => selectedEmployeeIds.includes(e.id)).map(e => e.name)
    return monthlySummaryList.filter(row => selectedNames.includes(row['الاسم']))
  }, [monthlySummaryList, selectedEmployeeIds, employees])

  function toggleMonth(m: string) {
    setSelectedMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }

  function toggleEmployeeSelect(id: string) {
    setSelectedEmployeeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const statusLabels = ['حاضر','روتيشن','يوم جمعة','غائب','إجازة مرضية','إجازة طارئة','إجازة اعتيادية','عطلة رسمية']

  return (
    <div style={{margin:'24px',background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
      <div style={{padding:'16px 20px',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,background:'#f9fafb'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <h2 style={{margin:0,fontSize:17,fontWeight:700,color:'#111827'}}>نظام إدارة الأفراد</h2>
          <div style={{display:'flex',gap:6,background:'#e5e7eb',padding:4,borderRadius:8}}>
            <button onClick={()=>setViewMode('daily')}
              style={{padding:'6px 14px',fontSize:13,border:'none',borderRadius:6,cursor:'pointer',fontWeight:600,
                background:viewMode==='daily'?'#fff':'transparent',color:viewMode==='daily'?'#1e40af':'#6b7280',
                boxShadow:viewMode==='daily'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
              التسجيل اليومي
            </button>
            <button onClick={()=>setViewMode('monthly')}
              style={{padding:'6px 14px',fontSize:13,border:'none',borderRadius:6,cursor:'pointer',fontWeight:600,
                background:viewMode==='monthly'?'#fff':'transparent',color:viewMode==='monthly'?'#1e40af':'#6b7280',
                boxShadow:viewMode==='monthly'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
              الموقف الشهري
            </button>
          </div>
        </div>

        {viewMode === 'daily' && (
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <label style={{fontSize:13,fontWeight:600,color:'#374151'}}>التاريخ:</label>
              <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}
                style={{padding:'7px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:13,color:'#111827',background:'#fff'}}/>
            </div>
            {!readOnly && (
              <>
                <button onClick={selectAllPresent}
                  style={{background:'#dcfce7',color:'#15803d',border:'1px solid #86efac',borderRadius:8,padding:'8px 14px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                  تحديد الكل حاضر
                </button>
                <button onClick={saveAll} disabled={saving || unsavedCount === 0}
                  style={{background:unsavedCount>0?'#16a34a':'#9ca3af',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:unsavedCount>0?'pointer':'default',fontSize:14,fontWeight:600}}>
                  {saving ? 'جارٍ الحفظ...' : unsavedCount > 0 ? `حفظ الكل (${unsavedCount})` : 'محفوظ'}
                </button>
              </>
            )}
          </div>
        )}
