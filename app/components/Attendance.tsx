'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { logActivity } from '../logActivity'
import * as XLSX from 'xlsx'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

interface Employee {
  id: string
  name: string
  job_title: string
  shift_type?: string
  overtime_leave_balance?: number
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
  'إجازة تعويضية': number
  'إجازة وفاة': number
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
  const [regularLeaveUsed, setRegularLeaveUsed] = useState<Record<string, number>>({})
  const [savedRecords, setSavedRecords] = useState<Record<string, AttendanceRecord>>({})
  const [monthlySummaryList, setMonthlySummaryList] = useState<MonthlyRow[]>([])
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [selectedMonths, setSelectedMonths] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)
  const printDetailRef = useRef<HTMLDivElement>(null)

  // فلترة
  const [searchName, setSearchName] = useState('')
  const [filterJobTitle, setFilterJobTitle] = useState('')

  // اختيار موظفين للموقف الشهري
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([])
  const [dailyDetails, setDailyDetails] = useState<Record<string, DailyDetail[]>>({})

  // قوائم منسدلة
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false)
  const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false)
  const monthDropdownRef = useRef<HTMLDivElement>(null)
  const employeeDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(e.target as Node)) {
        setMonthDropdownOpen(false)
      }
      if (employeeDropdownRef.current && !employeeDropdownRef.current.contains(e.target as Node)) {
        setEmployeeDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => { loadEmployees() }, [])

  useEffect(() => {
    if (employees.length > 0 && viewMode === 'daily' && selectedDate) {
      loadDailyRecords(selectedDate)
      loadRegularLeaveUsed(selectedDate)
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

  // حساب الإجازات الاعتيادية المستخدمة في شهر التاريخ المحدد (الرصيد الشهري = 2 يوم، غير تراكمي)
  async function loadRegularLeaveUsed(date: string) {
    const month = date.slice(0, 7)
    const [year, mon] = month.split('-').map(Number)
    const lastDay = new Date(year, mon, 0).getDate()
    const { data } = await supabase
      .from('attendance_records')
      .select('employee_id, status')
      .in('status', ['إجازة اعتيادية', 'إجازة'])
      .gte('record_date', month + '-01')
      .lte('record_date', month + '-' + String(lastDay).padStart(2, '0'))
    const counts: Record<string, number> = {}
    ;(data || []).forEach((r: any) => { counts[r.employee_id] = (counts[r.employee_id] || 0) + 1 })
    setRegularLeaveUsed(counts)
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

      // استهلاك/استرجاع رصيد الإجازة التعويضية عند دخول/خروج هذه الحالة
      const prevStatus = savedRecords[emp.id]?.status || ''
      const enteredComp = rec.status === 'إجازة تعويضية' && prevStatus !== 'إجازة تعويضية'
      const exitedComp = prevStatus === 'إجازة تعويضية' && rec.status !== 'إجازة تعويضية'
      if (enteredComp || exitedComp) {
        const delta = enteredComp ? -1 : 1
        const newBalance = (emp.overtime_leave_balance || 0) + delta
        await supabase.from('employees').update({ overtime_leave_balance: newBalance }).eq('id', emp.id)
        setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, overtime_leave_balance: newBalance } : e))
      }
    }
    await loadDailyRecords(selectedDate)
    await loadRegularLeaveUsed(selectedDate)
    await loadAvailableMonths()
    setSaving(false)
    alert('تم حفظ ' + changedEmployees.length + ' سجل بنجاح')
  }

  function updateRecord(empId: string, field: keyof AttendanceRecord, value: string) {
    // تحذير عند تسجيل إجازة اعتيادية لموظف استنفد رصيده الشهري (يومان) — تحذير فقط دون منع
    if (field === 'status' && value === 'إجازة اعتيادية') {
      const emp = employees.find(e => e.id === empId)
      const used = regularLeaveUsed[empId] || 0
      const alreadyRegular = ['إجازة اعتيادية', 'إجازة'].includes(records[empId]?.status || '')
      if (emp?.shift_type !== 'روتيشن' && !alreadyRegular && used >= 2) {
        alert(`تنبيه: ${emp?.name || 'هذا الموظف'} استنفد رصيده الشهري من الإجازة الاعتيادية (${used} من 2). يمكنك المتابعة إذا كان ذلك بقرار استثنائي.`)
      }
    }
    // تحذير عند تسجيل إجازة تعويضية لموظف رصيده صفر أو أقل — تحذير فقط دون منع
    if (field === 'status' && value === 'إجازة تعويضية') {
      const emp = employees.find(e => e.id === empId)
      const alreadyComp = records[empId]?.status === 'إجازة تعويضية'
      if (!alreadyComp && (emp?.overtime_leave_balance || 0) <= 0) {
        alert(`تنبيه: ${emp?.name || 'هذا الموظف'} رصيده من الإجازة التعويضية ${emp?.overtime_leave_balance || 0}. يمكنك المتابعة إذا كان ذلك بقرار استثنائي.`)
      }
    }
    setRecords(prev => ({
      ...prev,
      [empId]: { ...prev[empId], [field]: value }
    }))
  }

  function selectAllStatus(status: string) {
    const updated = { ...records }
    filteredEmployees.forEach(emp => {
      updated[emp.id] = { ...updated[emp.id], status }
    })
    setRecords(updated)
  }

  async function deleteEmployeeRecord(empId: string) {
    if (!confirm('هل أنت متأكد من حذف سجل هذا الموظف لهذا اليوم؟')) return
    const emp = employees.find(e => e.id === empId)
    if (records[empId]?.status === 'إجازة تعويضية') {
      const newBalance = (emp?.overtime_leave_balance || 0) + 1
      await supabase.from('employees').update({ overtime_leave_balance: newBalance }).eq('id', empId)
      setEmployees(prev => prev.map(e => e.id === empId ? { ...e, overtime_leave_balance: newBalance } : e))
    }
    await supabase.from('attendance_records').delete().eq('employee_id', empId).eq('record_date', selectedDate)
    await logActivity('حذف سجل حضور', 'attendance', `حذف سجل حضور ${emp?.name || ''} بتاريخ ${selectedDate}`)
    await loadDailyRecords(selectedDate)
    await loadRegularLeaveUsed(selectedDate)
    await loadAvailableMonths()
  }

  async function deleteFullDayRecords() {
    if (!confirm('هل أنت متأكد من حذف سجلات جميع الموظفين لهذا اليوم بالكامل؟ لا يمكن التراجع عن هذا الإجراء.')) return
    setSaving(true)
    const compEmployees = employees.filter(emp => records[emp.id]?.status === 'إجازة تعويضية')
    for (const emp of compEmployees) {
      const newBalance = (emp.overtime_leave_balance || 0) + 1
      await supabase.from('employees').update({ overtime_leave_balance: newBalance }).eq('id', emp.id)
    }
    if (compEmployees.length > 0) {
      setEmployees(prev => prev.map(e => compEmployees.some(c => c.id === e.id) ? { ...e, overtime_leave_balance: (e.overtime_leave_balance || 0) + 1 } : e))
    }
    await supabase.from('attendance_records').delete().eq('record_date', selectedDate)
    await logActivity('حذف سجل حضور يومي كامل', 'attendance', `حذف سجلات يوم ${selectedDate} بالكامل`)
    await loadDailyRecords(selectedDate)
    await loadRegularLeaveUsed(selectedDate)
    await loadAvailableMonths()
    setSaving(false)
    alert('تم حذف سجلات هذا اليوم بالكامل')
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
          @page { margin: 12mm; size: A4; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; direction: rtl; color: #111; padding: 0; }
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
          .signatures { display: flex; justify-content: space-between; margin-top: 60px; padding: 0 20px; }
          .signature-box { text-align: center; min-width: 200px; }
          .signature-line { border-top: 1px solid #111; margin-top: 50px; padding-top: 8px; font-size: 13px; font-weight: 600; color: #111827; }
        </style>
      </head>
      <body>${printContent.innerHTML}</body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => { printWindow.print(); printWindow.close() }, 500)
  }

  function handlePrintDetailedReport() {
    const printContent = printDetailRef.current
    if (!printContent) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>التقرير المفصل</title>
        <style>
          @page { margin: 12mm; size: A4; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; direction: rtl; color: #111; padding: 0; }
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
          .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 11px; color: #9ca3af; }
          .signatures { display: flex; justify-content: space-between; margin-top: 60px; padding: 0 20px; }
          .signature-box { text-align: center; min-width: 200px; }
          .signature-line { border-top: 1px solid #111; margin-top: 50px; padding-top: 8px; font-size: 13px; font-weight: 600; color: #111827; }
        </style>
      </head>
      <body>${printContent.innerHTML}</body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => { printWindow.print(); printWindow.close() }, 500)
  }

  function handleExportExcel() {
    const rows = filteredMonthlySummary.map(row => ({
      'الاسم': row['الاسم'],
      'الشهر': monthLabel(row['الشهر']),
      'أيام الدوام': row['أيام الدوام'],
      'روتيشن': row['روتيشن'],
      'أيام الجمعة': row['ايام الجمعه'],
      'الغياب': row['عدد ايام الغياب'],
      'إجازة مرضية': row['إجازة مرضية'],
      'إجازة طارئة': row['إجازة طارئة'],
      'إجازة اعتيادية': row['إجازة اعتيادية'],
      'إجازة تعويضية': row['إجازة تعويضية'],
      'إجازة وفاة': row['إجازة وفاة'],
      'عطلة رسمية': row['عطلة رسمية'],
      'مجموع الأيام': row['مجموع الايام'],
    }))
    const worksheet = XLSX.utils.json_to_sheet(rows)
    worksheet['!cols'] = [
      { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
      { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }
    ]
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'الموقف الشهري')
    const monthsPart = selectedMonths.map(monthLabel).join('-')
    XLSX.writeFile(workbook, `الموقف الشهري - ${monthsPart}.xlsx`)
  }

  const statusColor = (s: string) => {
    if (!s) return { background: '#f3f4f6', color: '#9ca3af' }
    if (['حاضر', 'روتيشن'].includes(s)) return { background: '#dcfce7', color: '#15803d' }
    if (s === 'يوم جمعة') return { background: '#dbeafe', color: '#1d4ed8' }
    if (s === 'غائب') return { background: '#fee2e2', color: '#dc2626' }
    if (s === 'إجازة وفاة') return { background: '#ede9fe', color: '#7c3aed' }
    if (s === 'إجازة تعويضية') return { background: '#cffafe', color: '#0e7490' }
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

  const monthlyCols = ['الاسم','الشهر','أيام الدوام','روتيشن','ايام الجمعه','عدد ايام الغياب','إجازة مرضية','إجازة طارئة','إجازة اعتيادية','إجازة تعويضية','إجازة وفاة','عطلة رسمية','مجموع الايام']

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

  const statusLabels = ['حاضر','روتيشن','يوم جمعة','غائب','إجازة مرضية','إجازة طارئة','إجازة اعتيادية','إجازة تعويضية','إجازة وفاة','عطلة رسمية']

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
                <select onChange={e=>{ if(e.target.value){ selectAllStatus(e.target.value); e.target.value='' } }}
                  defaultValue=""
                  style={{background:'#dcfce7',color:'#15803d',border:'1px solid #86efac',borderRadius:8,padding:'8px 14px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                  <option value="" disabled>تحديد الكل كـ...</option>
                  <option value="حاضر">الكل حاضر</option>
                  <option value="عطلة رسمية">الكل عطلة رسمية</option>
                  <option value="يوم جمعة">الكل يوم جمعة</option>
                </select>
                <button onClick={deleteFullDayRecords} disabled={saving}
                  style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:8,padding:'8px 14px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                  حذف سجلات اليوم
                </button>
                <button onClick={saveAll} disabled={saving || unsavedCount === 0}
                  style={{background:unsavedCount>0?'#16a34a':'#9ca3af',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:unsavedCount>0?'pointer':'default',fontSize:14,fontWeight:600}}>
                  {saving ? 'جارٍ الحفظ...' : unsavedCount > 0 ? 'حفظ الكل (' + unsavedCount + ')' : 'محفوظ'}
                </button>
              </>
            )}
          </div>
        )}

        {viewMode === 'monthly' && (
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            {filteredMonthlySummary.length > 0 && (
              <>
                <button onClick={handleExportExcel}
                  style={{background:'#dcfce7',color:'#15803d',border:'1px solid #86efac',borderRadius:8,padding:'7px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                  تصدير Excel
                </button>
                <button onClick={handlePrintMonthly}
                  style={{background:'#f3f4f6',color:'#374151',border:'1px solid #d1d5db',borderRadius:8,padding:'7px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                  طباعة التقرير
                </button>
              </>
            )}
            {selectedEmployeeIds.length === 1 && dailyDetails[selectedEmployeeIds[0]] && dailyDetails[selectedEmployeeIds[0]].length > 0 && (
              <button onClick={handlePrintDetailedReport}
                style={{background:'#ede9fe',color:'#7c3aed',border:'1px solid #c4b5fd',borderRadius:8,padding:'7px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                تقرير مفصل
              </button>
            )}
          </div>
        )}
      </div>

      {/* فلاتر البحث - يومي فقط */}
      {viewMode === 'daily' && (
        <div style={{padding:'12px 20px',background:'#fff',borderBottom:'1px solid #e5e7eb',display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
          <input
            placeholder="بحث بالاسم..."
            value={searchName}
            onChange={e=>setSearchName(e.target.value)}
            style={{padding:'8px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:13,color:'#111827',minWidth:180}}/>
          <select value={filterJobTitle} onChange={e=>setFilterJobTitle(e.target.value)}
            style={{padding:'8px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:13,color:'#111827',background:'#fff',minWidth:160}}>
            <option value="">كل المناصب</option>
            {jobTitles.map(jt => <option key={jt} value={jt}>{jt}</option>)}
          </select>
          {(searchName || filterJobTitle) && (
            <button onClick={()=>{setSearchName('');setFilterJobTitle('')}}
              style={{background:'#f3f4f6',color:'#6b7280',border:'none',borderRadius:8,padding:'8px 14px',cursor:'pointer',fontSize:12}}>
              مسح الفلاتر
            </button>
          )}
          <span style={{fontSize:12,color:'#9ca3af',marginRight:'auto'}}>{filteredEmployees.length} من {employees.length}</span>
        </div>
      )}

      {viewMode === 'daily' && selectedDate && (
        <div style={{padding:'12px 20px',background:'#eff6ff',borderBottom:'1px solid #dbeafe',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span style={{fontSize:14,color:'#1d4ed8',fontWeight:600}}>{formatDate(selectedDate)}</span>
          <div style={{display:'flex',gap:12,alignItems:'center'}}>
            {!readOnly && unsavedCount > 0 && <span style={{fontSize:13,color:'#d97706',fontWeight:500}}>يوجد {unsavedCount} تغيير غير محفوظ</span>}
            {readOnly && <span style={{fontSize:12,color:'#6b7280'}}>وضع القراءة فقط</span>}
          </div>
        </div>
      )}

      {viewMode === 'daily' ? (
        loading ? (
          <div style={{textAlign:'center',padding:'3rem',color:'#6b7280'}}>جارٍ التحميل...</div>
        ) : (
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{background:'#f3f4f6'}}>
                <th style={{padding:'10px 14px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',width:36}}>#</th>
                <th style={{padding:'10px 14px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>الموظف</th>
                <th style={{padding:'10px 14px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>المنصب</th>
                <th style={{padding:'10px 14px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>الحالة</th>
                <th style={{padding:'10px 14px',textAlign:'center',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>رصيد الاعتيادية</th>
                <th style={{padding:'10px 14px',textAlign:'center',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>رصيد التعويضية</th>
                <th style={{padding:'10px 14px',textAlign:'center',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>دخول</th>
                <th style={{padding:'10px 14px',textAlign:'center',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>خروج</th>
                <th style={{padding:'10px 14px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',minWidth:160}}>ملاحظات</th>
                {!readOnly && <th style={{padding:'10px 14px',borderBottom:'2px solid #e5e7eb'}}></th>}
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp,idx)=>{
                const rec = records[emp.id]
                return (
                  <tr key={emp.id} style={{borderBottom:'1px solid #e5e7eb'}}>
                    <td style={{padding:'10px 14px',color:'#9ca3af',fontSize:12}}>{idx+1}</td>
                    <td style={{padding:'10px 14px',fontWeight:600,color:'#111827'}}>
                      {emp.name}
                      {emp.shift_type === 'روتيشن' && <span style={{fontSize:10,color:'#0891b2',marginRight:6,background:'#cffafe',padding:'1px 6px',borderRadius:8}}>روتيشن</span>}
                    </td>
                    <td style={{padding:'10px 14px',color:'#6b7280',fontSize:12}}>{emp.job_title}</td>
                    <td style={{padding:'10px 14px'}}>
                      {readOnly ? (
                        <span style={{...statusColor(rec?.status),padding:'5px 12px',borderRadius:20,fontSize:12,fontWeight:600}}>{rec?.status || '— لم يسجل —'}</span>
                      ) : (
                        <select value={rec?.status||''} onChange={e=>updateRecord(emp.id,'status',e.target.value)}
                          style={{padding:'6px 10px',borderRadius:8,border:'2px solid #d1d5db',fontSize:12,color:'#111827',background:'#fff',cursor:'pointer',fontWeight:500,...(rec?.status?statusColor(rec.status):{})}}>
                          {statusLabels.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      )}
                    </td>
                    <td style={{padding:'10px 14px',textAlign:'center'}}>
                      {emp.shift_type === 'روتيشن' ? (
                        <span style={{fontSize:11,color:'#9ca3af'}}>—</span>
                      ) : (() => {
                        const used = regularLeaveUsed[emp.id] || 0
                        const remaining = Math.max(0, 2 - used)
                        return (
                          <span style={{fontSize:12,fontWeight:700,padding:'3px 10px',borderRadius:20,
                            background: remaining === 0 ? '#fee2e2' : remaining === 1 ? '#fef9c3' : '#dcfce7',
                            color: remaining === 0 ? '#dc2626' : remaining === 1 ? '#b45309' : '#15803d'}}>
                            {remaining} / 2
                          </span>
                        )
                      })()}
                    </td>
                    <td style={{padding:'10px 14px',textAlign:'center'}}>
                      {(() => {
                        const bal = emp.overtime_leave_balance || 0
                        return (
                          <span style={{fontSize:12,fontWeight:700,padding:'3px 10px',borderRadius:20,
                            background: bal <= 0 ? '#fee2e2' : '#dcfce7',
                            color: bal <= 0 ? '#dc2626' : '#15803d'}}>
                            {bal} يوم
                          </span>
                        )
                      })()}
                    </td>
                    <td style={{padding:'10px 14px',textAlign:'center'}}>
                      {readOnly ? (
                        <span style={{fontSize:12,color:'#374151'}}>{rec?.check_in || '—'}</span>
                      ) : (
                        <input type="time" value={rec?.check_in || DEFAULT_CHECK_IN} onChange={e=>updateRecord(emp.id,'check_in',e.target.value)}
                          style={{padding:'5px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12,color:'#111827',width:90}}/>
                      )}
                    </td>
                    <td style={{padding:'10px 14px',textAlign:'center'}}>
                      {readOnly ? (
                        <span style={{fontSize:12,color:'#374151'}}>{rec?.check_out || '—'}</span>
                      ) : (
                        <input type="time" value={rec?.check_out || DEFAULT_CHECK_OUT} onChange={e=>updateRecord(emp.id,'check_out',e.target.value)}
                          style={{padding:'5px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12,color:'#111827',width:90}}/>
                      )}
                    </td>
                    <td style={{padding:'10px 14px'}}>
                      {readOnly ? (
                        <span style={{fontSize:12,color:'#6b7280'}}>{rec?.notes || '—'}</span>
                      ) : (
                        <input value={rec?.notes || ''} onChange={e=>updateRecord(emp.id,'notes',e.target.value)} placeholder="ملاحظة..."
                          style={{padding:'6px 10px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12,color:'#111827',width:'100%',boxSizing:'border-box'}}/>
                      )}
                    </td>
                    {!readOnly && (
                      <td style={{padding:'10px 14px'}}>
                        {savedRecords[emp.id] && (
                          <button onClick={()=>deleteEmployeeRecord(emp.id)}
                            style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:11,fontWeight:600,whiteSpace:'nowrap'}}>
                            حذف
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!readOnly && (
            <div style={{padding:'16px 20px',borderTop:'2px solid #e5e7eb',display:'flex',justifyContent:'flex-end',background:'#f9fafb'}}>
              <button onClick={saveAll} disabled={saving||unsavedCount===0}
                style={{background:unsavedCount>0?'#16a34a':'#9ca3af',color:'#fff',border:'none',borderRadius:8,padding:'10px 28px',cursor:unsavedCount>0?'pointer':'default',fontSize:14,fontWeight:700}}>
                {saving?'جارٍ الحفظ...':unsavedCount>0?'حفظ الكل (' + unsavedCount + ')':'جميع السجلات محفوظة'}
              </button>
            </div>
          )}
        </div>
        )
      ) : (
        <div>
          {/* اختيار الأشهر والموظفين */}
          <div style={{padding:'16px 20px',borderBottom:'1px solid #e5e7eb',background:'#fff',display:'flex',gap:24,flexWrap:'wrap'}}>
            {/* قائمة منسدلة للأشهر */}
            <div ref={monthDropdownRef} style={{position:'relative',minWidth:220}}>
              <div style={{fontSize:13,fontWeight:600,color:'#374151',marginBottom:8}}>اختر الشهر/الأشهر:</div>
              <button onClick={()=>setMonthDropdownOpen(!monthDropdownOpen)}
                style={{width:'100%',padding:'9px 14px',borderRadius:8,border:'2px solid #d1d5db',background:'#fff',cursor:'pointer',
                  fontSize:13,color:'#111827',display:'flex',alignItems:'center',justifyContent:'space-between',textAlign:'right'}}>
                <span>
                  {availableMonths.length === 0 ? 'لا توجد بيانات بعد'
                    : selectedMonths.length === 0 ? 'اختر الشهر/الأشهر'
                    : selectedMonths.length === 1 ? monthLabel(selectedMonths[0])
                    : selectedMonths.length + ' أشهر محددة'}
                </span>
                <span style={{fontSize:11,color:'#9ca3af'}}>{monthDropdownOpen ? '▲' : '▼'}</span>
              </button>
              {monthDropdownOpen && availableMonths.length > 0 && (
                <div style={{position:'absolute',top:'100%',right:0,left:0,marginTop:4,background:'#fff',border:'2px solid #d1d5db',borderRadius:8,
                  boxShadow:'0 8px 24px rgba(0,0,0,0.12)',zIndex:20,maxHeight:240,overflowY:'auto'}}>
                  {availableMonths.map(m => (
                    <label key={m} style={{display:'flex',alignItems:'center',gap:8,padding:'9px 14px',cursor:'pointer',fontSize:13,
                      borderBottom:'1px solid #f3f4f6',background:selectedMonths.includes(m)?'#eff6ff':'#fff'}}>
                      <input type="checkbox" checked={selectedMonths.includes(m)} onChange={()=>toggleMonth(m)}/>
                      <span style={{color:selectedMonths.includes(m)?'#1e40af':'#374151',fontWeight:selectedMonths.includes(m)?600:400}}>{monthLabel(m)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* قائمة منسدلة للموظفين */}
            <div ref={employeeDropdownRef} style={{position:'relative',minWidth:260}}>
              <div style={{fontSize:13,fontWeight:600,color:'#374151',marginBottom:8}}>اختر موظفين (اختياري - افتراضي: الجميع):</div>
              <button onClick={()=>setEmployeeDropdownOpen(!employeeDropdownOpen)}
                style={{width:'100%',padding:'9px 14px',borderRadius:8,border:'2px solid #d1d5db',background:'#fff',cursor:'pointer',
                  fontSize:13,color:'#111827',display:'flex',alignItems:'center',justifyContent:'space-between',textAlign:'right'}}>
                <span>
                  {selectedEmployeeIds.length === 0 ? 'كل الموظفين'
                    : selectedEmployeeIds.length === 1 ? employees.find(e=>e.id===selectedEmployeeIds[0])?.name
                    : selectedEmployeeIds.length + ' موظفين محددين'}
                </span>
                <span style={{fontSize:11,color:'#9ca3af'}}>{employeeDropdownOpen ? '▲' : '▼'}</span>
              </button>
              {employeeDropdownOpen && (
                <div style={{position:'absolute',top:'100%',right:0,left:0,marginTop:4,background:'#fff',border:'2px solid #d1d5db',borderRadius:8,
                  boxShadow:'0 8px 24px rgba(0,0,0,0.12)',zIndex:20,maxHeight:280,overflowY:'auto'}}>
                  {selectedEmployeeIds.length > 0 && (
                    <button onClick={()=>setSelectedEmployeeIds([])}
                      style={{width:'100%',textAlign:'right',padding:'8px 14px',background:'#fef2f2',color:'#dc2626',border:'none',borderBottom:'1px solid #fca5a5',cursor:'pointer',fontSize:12,fontWeight:600}}>
                      إلغاء كل التحديدات
                    </button>
                  )}
                  {employees.map(emp => (
                    <label key={emp.id} style={{display:'flex',alignItems:'center',gap:8,padding:'9px 14px',cursor:'pointer',fontSize:13,
                      borderBottom:'1px solid #f3f4f6',background:selectedEmployeeIds.includes(emp.id)?'#f5f3ff':'#fff'}}>
                      <input type="checkbox" checked={selectedEmployeeIds.includes(emp.id)} onChange={()=>toggleEmployeeSelect(emp.id)}/>
                      <span style={{color:selectedEmployeeIds.includes(emp.id)?'#7c3aed':'#374151',fontWeight:selectedEmployeeIds.includes(emp.id)?600:400}}>{emp.name}</span>
                      <span style={{fontSize:11,color:'#9ca3af',marginRight:'auto'}}>{emp.job_title}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* محتوى الطباعة */}
          <div ref={printRef} style={{display:'none'}}>
            <div className="header">
              <div className="company-name">Sanya International Company</div>
              <div className="report-title">الموقف الشهري — {selectedMonths.map(monthLabel).join(' ، ')}</div>
              <div className="report-date">تاريخ الطباعة: {new Date().toLocaleDateString('ar-IQ')}</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>الاسم</th><th>الشهر</th><th>أيام الدوام</th><th>روتيشن</th><th>أيام الجمعة</th>
                  <th>الغياب</th><th>مرضية</th><th>طارئة</th><th>اعتيادية</th><th>تعويضية</th><th>وفاة</th><th>عطلة رسمية</th><th>المجموع</th>
                </tr>
              </thead>
              <tbody>
                {filteredMonthlySummary.map((row, idx) => (
                  <tr key={idx}>
                    <td>{row['الاسم']}</td>
                    <td>{monthLabel(row['الشهر'])}</td>
                    <td className="present">{row['أيام الدوام']}</td>
                    <td>{row['روتيشن']}</td>
                    <td>{row['ايام الجمعه']}</td>
                    <td className="absent">{row['عدد ايام الغياب']}</td>
                    <td>{row['إجازة مرضية']}</td>
                    <td>{row['إجازة طارئة']}</td>
                    <td>{row['إجازة اعتيادية']}</td>
                    <td>{row['إجازة تعويضية']}</td>
                    <td>{row['إجازة وفاة']}</td>
                    <td>{row['عطلة رسمية']}</td>
                    <td className="total-col">{row['مجموع الايام']}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="signatures">
              <div className="signature-box">
                <div className="signature-line">مدير قسم الموارد البشرية</div>
              </div>
              <div className="signature-box">
                <div className="signature-line">مدير الموقع</div>
              </div>
            </div>
            <div className="footer">تم إنشاء هذا التقرير بواسطة منصة Sanya International Company — {new Date().toLocaleDateString('ar-IQ')}</div>
          </div>

          {/* محتوى الطباعة - التقرير المفصل لموظف واحد */}
          {selectedEmployeeIds.length === 1 && dailyDetails[selectedEmployeeIds[0]] && (
            <div ref={printDetailRef} style={{display:'none'}}>
              <div className="header">
                <div className="company-name">Sanya International Company</div>
                <div className="report-title">تقرير مفصل — {employees.find(e=>e.id===selectedEmployeeIds[0])?.name}</div>
                <div className="report-date">الأشهر: {selectedMonths.map(monthLabel).join(' ، ')} — تاريخ الطباعة: {new Date().toLocaleDateString('ar-IQ')}</div>
              </div>
              <table>
                <thead>
                  <tr><th>التاريخ</th><th>الحالة</th><th>دخول</th><th>خروج</th><th>ملاحظات</th></tr>
                </thead>
                <tbody>
                  {dailyDetails[selectedEmployeeIds[0]].map((d,i) => (
                    <tr key={i}>
                      <td>{d.record_date}</td>
                      <td>{d.status}</td>
                      <td>{d.check_in || '—'}</td>
                      <td>{d.check_out || '—'}</td>
                      <td>{d.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="signatures">
                <div className="signature-box">
                  <div className="signature-line">مدير قسم الموارد البشرية</div>
                </div>
                <div className="signature-box">
                  <div className="signature-line">مدير الموقع</div>
                </div>
              </div>
              <div className="footer">تم إنشاء هذا التقرير بواسطة منصة Sanya International Company — {new Date().toLocaleDateString('ar-IQ')}</div>
            </div>
          )}

          {selectedMonths.length === 0 ? (
            <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>اختر شهراً لعرض البيانات</div>
          ) : loading ? (
            <div style={{textAlign:'center',padding:'3rem',color:'#6b7280',fontSize:14}}>جارٍ تحميل البيانات...</div>
          ) : filteredMonthlySummary.length === 0 ? (
            <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لا توجد بيانات لهذا الاختيار</div>
          ) : (
            <div>
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
                    {filteredMonthlySummary.map((row,idx)=>(
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
                        <td style={{padding:'12px 16px',textAlign:'center'}}>{row['إجازة تعويضية']}</td>
                        <td style={{padding:'12px 16px',textAlign:'center'}}>{row['إجازة وفاة']}</td>
                        <td style={{padding:'12px 16px',textAlign:'center'}}>{row['عطلة رسمية']}</td>
                        <td style={{padding:'12px 16px',textAlign:'center',fontWeight:700,background:'#f9fafb'}}>{row['مجموع الايام']}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* التفاصيل اليومية لموظف واحد */}
              {selectedEmployeeIds.length === 1 && dailyDetails[selectedEmployeeIds[0]] && dailyDetails[selectedEmployeeIds[0]].length > 0 && (
                <div style={{marginTop:8}}>
                  <div style={{padding:'12px 20px',background:'#eff6ff',borderTop:'1px solid #dbeafe',borderBottom:'1px solid #dbeafe'}}>
                    <span style={{fontSize:14,color:'#1d4ed8',fontWeight:600}}>التفاصيل اليومية — {employees.find(e=>e.id===selectedEmployeeIds[0])?.name}</span>
                  </div>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                      <thead>
                        <tr style={{background:'#f3f4f6'}}>
                          {['التاريخ','الحالة','دخول','خروج','ملاحظات'].map(h=>(
                            <th key={h} style={{padding:'10px 14px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb'}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dailyDetails[selectedEmployeeIds[0]].map((d,i)=>(
                          <tr key={i} style={{borderBottom:'1px solid #e5e7eb'}}>
                            <td style={{padding:'10px 14px',color:'#374151'}}>{d.record_date}</td>
                            <td style={{padding:'10px 14px'}}>
                              <span style={{...statusColor(d.status),padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600}}>{d.status}</span>
                            </td>
                            <td style={{padding:'10px 14px',color:'#6b7280'}}>{d.check_in || '—'}</td>
                            <td style={{padding:'10px 14px',color:'#6b7280'}}>{d.check_out || '—'}</td>
                            <td style={{padding:'10px 14px',color:'#6b7280'}}>{d.notes || '—'}</td>
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
