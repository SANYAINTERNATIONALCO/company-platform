'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { logActivity } from '../logActivity'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

interface Employee {
  id: string
  name: string
  job_title: string
  hire_date: string | null
  base_salary: number | null
  advance_total: number | null
  advance_monthly_deduction: number | null
  advance_remaining: number | null
  advance_total_installments: number | null
  advance_completed_installments: number | null
  sort_order: number | null
  status: string
}

interface PayrollRecord {
  id?: string
  employee_id: string
  payroll_month: string
  base_salary: number
  absent_days: number
  absent_deduction: number
  advance_deduction: number
  extra_amount: number
  net_salary: number
  notes: string
}

interface Approval {
  id?: string
  payroll_month: string
  role_name: string
  person_name: string
  signature_url: string | null
  signature_scale: number
}

const monthLabel = (m: string): string => {
  const [year, month] = m.split('-')
  const names = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
  return names[parseInt(month) - 1] + ' ' + year
}

export default function Payroll({ readOnly = false, userRole = '' }: { readOnly?: boolean; userRole?: string }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [isArchivedMonth, setIsArchivedMonth] = useState(false)
  const [absentCounts, setAbsentCounts] = useState<Record<string, number>>({})
  const [draftValues, setDraftValues] = useState<Record<string, { advanceDeduction: string; extraAmount: string; notes: string }>>({})
  const [savedRecords, setSavedRecords] = useState<Record<string, PayrollRecord>>({})
  const [editingEmployee, setEditingEmployee] = useState<string | null>(null)
  const [empEditForm, setEmpEditForm] = useState({ base_salary: '', advance_total: '', advance_monthly_deduction: '', advance_remaining: '', advance_total_installments: '', advance_completed_installments: '', sort_order: '' })
  const [approvals, setApprovals] = useState<Record<string, Approval>>({})
  const [uploadingSig, setUploadingSig] = useState<string | null>(null)
  const [sigScaleDraft, setSigScaleDraft] = useState<Record<string, number>>({})
  const printRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const [searchName, setSearchName] = useState('')
  const [selectedForPrint, setSelectedForPrint] = useState<string[]>([])
  const [archivedMonthsList, setArchivedMonthsList] = useState<string[]>([])

  useEffect(() => {
    const t = new Date()
    const ym = t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0')
    setSelectedMonth(ym)
    loadEmployees()
    loadArchivedMonthsList()
  }, [])

  useEffect(() => {
    if (selectedMonth && employees.length > 0) {
      loadMonthData(selectedMonth)
    }
  }, [selectedMonth, employees])

  async function loadEmployees() {
    setLoading(true)
    const { data } = await supabase.from('employees').select('*').eq('status', 'active').order('sort_order', { ascending: true }).order('name')
    setEmployees((data as Employee[]) || [])
    setLoading(false)
  }

  async function loadArchivedMonthsList() {
    const { data } = await supabase.from('payroll_records').select('payroll_month')
    const months = [...new Set((data || []).map((r: any) => r.payroll_month))].sort().reverse()
    setArchivedMonthsList(months as string[])
  }

  async function loadMonthData(month: string) {
    setLoading(true)
    // أيام الغياب الفعلية لهذا الشهر
    const [year, mon] = month.split('-').map(Number)
    const startDate = month + '-01'
    const lastDay = new Date(year, mon, 0).getDate()
    const endDate = month + '-' + String(lastDay).padStart(2, '0')
    const { data: absentData } = await supabase
      .from('attendance_records')
      .select('employee_id, status, record_date')
      .eq('status', 'غائب')
      .gte('record_date', startDate)
      .lte('record_date', endDate)
    const counts: Record<string, number> = {}
    ;(absentData || []).forEach((r: any) => { counts[r.employee_id] = (counts[r.employee_id] || 0) + 1 })
    setAbsentCounts(counts)

    // السجلات المحفوظة لهذا الشهر (الأرشيف)
    const { data: payrollData } = await supabase.from('payroll_records').select('*').eq('payroll_month', month)
    const savedMap: Record<string, PayrollRecord> = {}
    const draft: Record<string, { advanceDeduction: string; extraAmount: string; notes: string }> = {}
    ;(payrollData || []).forEach((r: any) => {
      savedMap[r.employee_id] = r
      draft[r.employee_id] = { advanceDeduction: String(r.advance_deduction), extraAmount: String(r.extra_amount), notes: r.notes || '' }
    })
    setSavedRecords(savedMap)
    setIsArchivedMonth(Object.keys(savedMap).length > 0)

    // تعبئة افتراضية للموظفين الذين لا سجل محفوظ لهم بعد
    employees.forEach(emp => {
      if (!draft[emp.id]) {
        const defaultAdvance = (emp.advance_remaining || 0) > 0 ? (emp.advance_monthly_deduction || 0) : 0
        draft[emp.id] = { advanceDeduction: String(defaultAdvance), extraAmount: '0', notes: '' }
      }
    })
    setDraftValues(draft)

    // الموافقات/التوقيعات الخاصة بهذا الشهر
    const { data: approvalData } = await supabase.from('payroll_approvals').select('*').eq('payroll_month', month)
    const appMap: Record<string, Approval> = {}
    ;(approvalData || []).forEach((a: any) => { appMap[a.role_name] = a })
    if (!appMap['site_manager']) appMap['site_manager'] = { payroll_month: month, role_name: 'site_manager', person_name: 'جعفر محمد سعيد', signature_url: null, signature_scale: 1 }
    if (!appMap['hr_manager']) appMap['hr_manager'] = { payroll_month: month, role_name: 'hr_manager', person_name: 'حسن عادل شعلان', signature_url: null, signature_scale: 1 }
    setApprovals(appMap)
    setSigScaleDraft({ site_manager: appMap['site_manager'].signature_scale || 1, hr_manager: appMap['hr_manager'].signature_scale || 1 })

    setLoading(false)
  }

  function getDraft(empId: string) {
    return draftValues[empId] || { advanceDeduction: '0', extraAmount: '0', notes: '' }
  }

  function updateDraft(empId: string, field: 'advanceDeduction' | 'extraAmount' | 'notes', value: string) {
    setDraftValues(prev => ({ ...prev, [empId]: { ...getDraft(empId), [field]: value } }))
  }

  function calcDayValue(emp: Employee): number {
    return (emp.base_salary || 0) / 30
  }

  function calcNetSalary(emp: Employee) {
    const absentDays = absentCounts[emp.id] || 0
    const absentDeduction = Math.round(calcDayValue(emp) * absentDays)
    const d = getDraft(emp.id)
    const advanceDeduction = Number(d.advanceDeduction) || 0
    const extraAmount = Number(d.extraAmount) || 0
    const net = (emp.base_salary || 0) - absentDeduction - advanceDeduction + extraAmount
    return { absentDays, absentDeduction, advanceDeduction, extraAmount, net }
  }

  async function saveMonthPayroll() {
    if (!confirm('هل أنت متأكد من حفظ كشف راتب شهر ' + monthLabel(selectedMonth) + '؟ سيتم أرشفته وتحديث أرصدة السلف تلقائياً.')) return
    setSaving(true)
    for (const emp of employees) {
      const calc = calcNetSalary(emp)
      const d = getDraft(emp.id)
      const alreadySaved = !!savedRecords[emp.id]

      const { error } = await supabase.from('payroll_records').upsert({
        employee_id: emp.id,
        payroll_month: selectedMonth,
        base_salary: emp.base_salary || 0,
        absent_days: calc.absentDays,
        absent_deduction: calc.absentDeduction,
        advance_deduction: calc.advanceDeduction,
        extra_amount: calc.extraAmount,
        net_salary: calc.net,
        notes: d.notes
      }, { onConflict: 'employee_id,payroll_month' })
      if (error) { alert('خطأ في حفظ راتب ' + emp.name + ': ' + error.message); setSaving(false); return }

      // تحديث عداد السلفة فقط أول مرة يُحفظ هذا الشهر لهذا الموظف (لتجنب الخصم المضاعف عند إعادة الحفظ)
      if (!alreadySaved && calc.advanceDeduction > 0) {
        const newRemaining = Math.max(0, (emp.advance_remaining || 0) - calc.advanceDeduction)
        const newCompleted = (emp.advance_completed_installments || 0) + 1
        await supabase.from('employees').update({
          advance_remaining: newRemaining,
          advance_completed_installments: newCompleted
        }).eq('id', emp.id)
      }
    }
    await loadEmployees()
    await loadArchivedMonthsList()
    setSaving(false)
    await logActivity('حفظ وأرشفة كشف رواتب', 'payroll', `تم حفظ كشف رواتب شهر ${monthLabel(selectedMonth)}`)
    alert('تم حفظ وأرشفة كشف رواتب شهر ' + monthLabel(selectedMonth) + ' بنجاح')
  }

  async function deleteArchive() {
    if (!confirm('هل أنت متأكد من حذف أرشفة كشف شهر ' + monthLabel(selectedMonth) + ' بالكامل؟ سيتم إرجاع أي استقطاع سلفة تم تطبيقه لهذا الشهر، ويمكن إعادة حساب وحفظ الشهر من جديد.')) return
    setSaving(true)
    // إرجاع تأثير استقطاع السلفة لكل موظف له سجل محفوظ بهذا الشهر
    for (const emp of employees) {
      const rec = savedRecords[emp.id]
      if (rec && rec.advance_deduction > 0) {
        const restoredRemaining = (emp.advance_remaining || 0) + rec.advance_deduction
        const restoredCompleted = Math.max(0, (emp.advance_completed_installments || 0) - 1)
        await supabase.from('employees').update({
          advance_remaining: restoredRemaining,
          advance_completed_installments: restoredCompleted
        }).eq('id', emp.id)
      }
    }
    await supabase.from('payroll_records').delete().eq('payroll_month', selectedMonth)
    await supabase.from('payroll_approvals').delete().eq('payroll_month', selectedMonth)
    await loadEmployees()
    await loadArchivedMonthsList()
    await loadMonthData(selectedMonth)
    setSaving(false)
    await logActivity('حذف أرشفة رواتب', 'payroll', `تم حذف أرشفة شهر ${monthLabel(selectedMonth)}`)
    alert('تم حذف أرشفة شهر ' + monthLabel(selectedMonth) + ' بنجاح')
  }

  function startEditEmployee(emp: Employee) {
    setEditingEmployee(emp.id)
    setEmpEditForm({
      base_salary: emp.base_salary?.toString() || '',
      advance_total: emp.advance_total?.toString() || '',
      advance_monthly_deduction: emp.advance_monthly_deduction?.toString() || '',
      advance_remaining: emp.advance_remaining?.toString() || '',
      advance_total_installments: emp.advance_total_installments?.toString() || '',
      advance_completed_installments: emp.advance_completed_installments?.toString() || '',
      sort_order: emp.sort_order?.toString() || ''
    })
  }

  async function saveEmployeeFinancials() {
    if (!editingEmployee) return
    setSaving(true)
    await supabase.from('employees').update({
      base_salary: parseFloat(empEditForm.base_salary) || 0,
      advance_total: parseFloat(empEditForm.advance_total) || 0,
      advance_monthly_deduction: parseFloat(empEditForm.advance_monthly_deduction) || 0,
      advance_remaining: parseFloat(empEditForm.advance_remaining) || 0,
      advance_total_installments: parseInt(empEditForm.advance_total_installments) || 0,
      advance_completed_installments: parseInt(empEditForm.advance_completed_installments) || 0,
      sort_order: parseInt(empEditForm.sort_order) || 999
    }).eq('id', editingEmployee)
    setEditingEmployee(null)
    await loadEmployees()
    await logActivity('تعديل بيانات مالية', 'payroll', `تم تعديل الراتب/السلفة للموظف`)
    setSaving(false)
  }

  async function handleSignatureUpload(roleName: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingSig(roleName)
    const fileExt = file.name.split('.').pop()
    const fileName = `${roleName}_${selectedMonth}_${Date.now()}.${fileExt}`
    const { data, error } = await supabase.storage.from('signatures').upload(fileName, file)
    if (error) { alert('خطأ في رفع التوقيع: ' + error.message) }
    else {
      const { data: urlData } = supabase.storage.from('signatures').getPublicUrl(data.path)
      const approval = approvals[roleName]
      await supabase.from('payroll_approvals').upsert({
        payroll_month: selectedMonth,
        role_name: roleName,
        person_name: approval.person_name,
        signature_url: urlData.publicUrl,
        signature_scale: 1
      }, { onConflict: 'payroll_month,role_name' })
      setSigScaleDraft(prev => ({ ...prev, [roleName]: 1 }))
      await logActivity('رفع توقيع موافقة', 'payroll', `رفع توقيع موافقة على كشف رواتب شهر ${monthLabel(selectedMonth)}`)
      await loadMonthData(selectedMonth)
    }
    setUploadingSig(null)
    e.target.value = ''
  }

  async function removeApprovalSignature(roleName: string) {
    if (!confirm('هل أنت متأكد من إزالة هذا التوقيع لهذا الشهر؟ سيحتاج إعادة الرفع للموافقة من جديد.')) return
    await supabase.from('payroll_approvals').delete().eq('payroll_month', selectedMonth).eq('role_name', roleName)
    await logActivity('إزالة توقيع موافقة', 'payroll', `إزالة توقيع موافقة من كشف رواتب شهر ${monthLabel(selectedMonth)}`)
    await loadMonthData(selectedMonth)
  }

  async function updateSignatureScale(roleName: string, scale: number) {
    setSigScaleDraft(prev => ({ ...prev, [roleName]: scale }))
    await supabase.from('payroll_approvals').update({ signature_scale: scale }).eq('payroll_month', selectedMonth).eq('role_name', roleName)
  }

  function formatAmount(n: number) { return Math.round(n).toLocaleString('ar-IQ') + ' د.ع' }

  const filteredEmployees = useMemo(() => {
    if (!searchName.trim()) return employees
    const term = searchName.toLowerCase()
    return employees.filter(e => e.name.toLowerCase().includes(term))
  }, [employees, searchName])

  function toggleSelectForPrint(id: string) {
    setSelectedForPrint(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id])
  }

  const printEmployees = selectedForPrint.length > 0 ? employees.filter(e => selectedForPrint.includes(e.id)) : filteredEmployees

  const totals = useMemo(() => {
    let totalBase = 0, totalAbsentDed = 0, totalAdvanceDed = 0, totalExtra = 0, totalNet = 0
    printEmployees.forEach(emp => {
      const c = calcNetSalary(emp)
      totalBase += emp.base_salary || 0
      totalAbsentDed += c.absentDeduction
      totalAdvanceDed += c.advanceDeduction
      totalExtra += c.extraAmount
      totalNet += c.net
    })
    return { totalBase, totalAbsentDed, totalAdvanceDed, totalExtra, totalNet }
  }, [printEmployees, absentCounts, draftValues])

  const bothApproved = approvals['site_manager']?.signature_url && approvals['hr_manager']?.signature_url

  function handlePrint() {
    const printContent = printRef.current
    if (!printContent) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>قائمة الرواتب - ${monthLabel(selectedMonth)}</title>
        <style>
          @page { margin: 10mm; size: A4 landscape; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { height: 100%; }
          body { font-family: Arial, sans-serif; direction: rtl; color: #111; padding: 0; display: flex; flex-direction: column; min-height: 100%; }
          .content { flex: 1; }
          .header { text-align: center; border-bottom: 3px solid #1e40af; padding-bottom: 14px; margin-bottom: 20px; }
          .company-name { font-size: 20px; font-weight: bold; color: #1e40af; margin-bottom: 4px; }
          .report-title { font-size: 16px; font-weight: 700; color: #374151; }
          .report-date { font-size: 12px; color: #6b7280; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px; }
          th { background: #1e40af; color: #fff; padding: 7px 8px; text-align: center; font-weight: 600; white-space: nowrap; }
          th:first-child { text-align: right; }
          td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: center; }
          td:first-child { text-align: right; font-weight: 600; }
          tr:nth-child(even) { background: #f9fafb; }
          .total-row td { background: #eff6ff; font-weight: bold; color: #1e40af; border-top: 2px solid #1e40af; }
          .deduction { color: #dc2626; }
          .net { font-weight: bold; color: #15803d; }
          .signatures { display: flex; justify-content: space-between; padding: 0 30px 10px; page-break-inside: avoid; }
          .signature-box { text-align: center; min-width: 220px; }
          .signature-img-wrap { height: 70px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px; }
          .signature-line { border-top: 1px solid #111; padding-top: 8px; font-size: 13px; font-weight: 700; color: #111827; }
          .signature-person { font-size: 12px; color: #374151; margin-top: 2px; }
          .footer { margin-top: 16px; padding-top: 10px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 10px; color: #9ca3af; }
        </style>
      </head>
      <body>
        <div class="content">${printContent.innerHTML}</div>
      </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => { printWindow.print(); printWindow.close() }, 500)
  }

  const inputSm = { padding:'6px 8px', borderRadius:6, border:'1px solid #d1d5db', fontSize:12, color:'#111827', width:'100%', boxSizing:'border-box' as const }

  return (
    <div style={{margin:'24px',background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>

      {/* رأس البطاقة */}
      <div style={{padding:'16px 20px',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,background:'#f9fafb'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <h2 style={{margin:0,fontSize:17,fontWeight:700,color:'#111827'}}>الرواتب</h2>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <label style={{fontSize:13,fontWeight:600,color:'#374151'}}>الشهر:</label>
            <input type="month" value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}
              style={{padding:'7px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:13,color:'#111827',background:'#fff'}}/>
          </div>
          {isArchivedMonth && (
            <span style={{fontSize:12,background:'#dbeafe',color:'#1d4ed8',padding:'4px 10px',borderRadius:20,fontWeight:600}}>مؤرشف</span>
          )}
          {archivedMonthsList.length > 0 && (
            <select onChange={e=>{ if(e.target.value) setSelectedMonth(e.target.value) }} value=""
              style={{padding:'7px 10px',borderRadius:8,border:'2px solid #d1d5db',fontSize:12,color:'#374151',background:'#fff'}}>
              <option value="">عرض أرشيف شهر سابق...</option>
              {archivedMonthsList.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          )}
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={handlePrint}
            style={{background:'#f3f4f6',color:'#374151',border:'1px solid #d1d5db',borderRadius:8,padding:'9px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
            طباعة {selectedForPrint.length > 0 ? '(' + selectedForPrint.length + ' محدد)' : 'الكل'}
          </button>
          {!readOnly && isArchivedMonth && (
            <button onClick={deleteArchive} disabled={saving}
              style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:8,padding:'9px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
              حذف الأرشفة
            </button>
          )}
          {!readOnly && (
            <button onClick={saveMonthPayroll} disabled={saving}
              style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:14,fontWeight:600}}>
              {saving ? 'جارٍ الحفظ...' : isArchivedMonth ? 'تحديث الكشف المؤرشف' : 'حفظ وأرشفة كشف الشهر'}
            </button>
          )}
        </div>
      </div>

      {/* بحث */}
      <div style={{padding:'12px 20px',background:'#fff',borderBottom:'1px solid #e5e7eb',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
        <input placeholder="بحث بالاسم..." value={searchName} onChange={e=>setSearchName(e.target.value)}
          style={{padding:'8px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:13,color:'#111827',minWidth:200}}/>
        {selectedForPrint.length > 0 && (
          <button onClick={()=>setSelectedForPrint([])} style={{background:'#f3f4f6',color:'#6b7280',border:'none',borderRadius:8,padding:'8px 12px',cursor:'pointer',fontSize:12}}>
            إلغاء التحديد ({selectedForPrint.length})
          </button>
        )}
        <span style={{fontSize:12,color:'#9ca3af'}}>حدد موظفين بعلامة ✓ لطباعة تقرير خاص بهم فقط</span>
      </div>

      {/* إعدادات التوقيعات والموافقة الشهرية */}
      {(!readOnly || userRole === 'admin') && (
        <div style={{padding:'14px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',gap:24,flexWrap:'wrap'}}>
          {['site_manager','hr_manager']
            .filter(role => !readOnly || (userRole === 'admin' && role === 'site_manager'))
            .map(role => {
            const app = approvals[role]
            const canManageThis = !readOnly || (userRole === 'admin' && role === 'site_manager')
            return (
              <div key={role} style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                <span style={{fontSize:12,fontWeight:600,color:'#374151'}}>
                  {role === 'site_manager' ? 'موافقة مدير الموقع' : 'موافقة مدير الموارد البشرية'} ({app?.person_name}):
                </span>
                {app?.signature_url ? (
                  <>
                    <img src={app.signature_url} alt="" style={{height: 28 * (sigScaleDraft[role] || 1), objectFit:'contain'}}/>
                    {canManageThis && (
                      <>
                        <input type="range" min="0.5" max="2" step="0.1" value={sigScaleDraft[role] || 1}
                          onChange={e=>updateSignatureScale(role, parseFloat(e.target.value))} style={{width:80}}/>
                        <button onClick={()=>removeApprovalSignature(role)}
                          style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:6,padding:'3px 10px',cursor:'pointer',fontSize:11}}>
                          إزالة الموافقة
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <span style={{fontSize:11,color:'#dc2626',fontWeight:600}}>لم تتم الموافقة على هذا الشهر</span>
                    {canManageThis && (
                      <label style={{background:'#eff6ff',color:'#1d4ed8',border:'1px dashed #93c5fd',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:11,fontWeight:500}}>
                        {uploadingSig === role ? 'جارٍ الرفع...' : 'رفع توقيع الموافقة'}
                        <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>handleSignatureUpload(role, e)} disabled={uploadingSig !== null}/>
                      </label>
                    )}
                  </>
                )}
              </div>
            )
          })}
          {!bothApproved && <span style={{fontSize:12,color:'#b45309',fontWeight:600}}>⚠ لم تكتمل موافقة الطرفين على كشف هذا الشهر بعد</span>}
        </div>
      )}

      {/* محتوى الطباعة المخفي */}
      <div ref={printRef} style={{display:'none'}}>
        <div className="header">
          <div className="company-name">Sanya International Company</div>
          <div className="report-title">قائمة الرواتب لموظفي شركة سانيا الدولية — شهر {monthLabel(selectedMonth)}</div>
          <div className="report-date">تاريخ الطباعة: {new Date().toLocaleDateString('ar-IQ')}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th><th>الاسم</th><th>المنصب</th><th>الراتب الأساسي</th><th>أيام الغياب</th><th>خصم الغياب</th>
              <th>استقطاع السلفة</th><th>مبلغ إضافي</th><th>صافي الراتب</th><th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {printEmployees.map((emp, idx) => {
              const c = calcNetSalary(emp)
              const d = getDraft(emp.id)
              return (
                <tr key={emp.id}>
                  <td>{idx+1}</td>
                  <td>{emp.name}</td>
                  <td>{emp.job_title}</td>
                  <td>{formatAmount(emp.base_salary || 0)}</td>
                  <td>{c.absentDays}</td>
                  <td className="deduction">{c.absentDeduction > 0 ? '-' + formatAmount(c.absentDeduction) : '—'}</td>
                  <td className="deduction">{c.advanceDeduction > 0 ? '-' + formatAmount(c.advanceDeduction) : '—'}</td>
                  <td>{c.extraAmount > 0 ? '+' + formatAmount(c.extraAmount) : '—'}</td>
                  <td className="net">{formatAmount(c.net)}</td>
                  <td>{d.notes || '—'}</td>
                </tr>
              )
            })}
            <tr className="total-row">
              <td colSpan={3}>الإجمالي</td>
              <td>{formatAmount(totals.totalBase)}</td>
              <td>—</td>
              <td>-{formatAmount(totals.totalAbsentDed)}</td>
              <td>-{formatAmount(totals.totalAdvanceDed)}</td>
              <td>+{formatAmount(totals.totalExtra)}</td>
              <td>{formatAmount(totals.totalNet)}</td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
        <div className="signatures">
          <div className="signature-box">
            <div className="signature-img-wrap">
              {approvals['site_manager']?.signature_url && <img src={approvals['site_manager'].signature_url!} alt="" style={{height: 50 * (sigScaleDraft['site_manager'] || 1), objectFit:'contain'}}/>}
            </div>
            <div className="signature-line">مدير الموقع</div>
            <div className="signature-person">{approvals['site_manager']?.person_name}</div>
          </div>
          <div className="signature-box">
            <div className="signature-img-wrap">
              {approvals['hr_manager']?.signature_url && <img src={approvals['hr_manager'].signature_url!} alt="" style={{height: 50 * (sigScaleDraft['hr_manager'] || 1), objectFit:'contain'}}/>}
            </div>
            <div className="signature-line">مدير قسم الموارد البشرية</div>
            <div className="signature-person">{approvals['hr_manager']?.person_name}</div>
          </div>
        </div>
        <div className="footer">تم إنشاء هذا التقرير بواسطة منصة Sanya International Company — {new Date().toLocaleDateString('ar-IQ')}</div>
      </div>

      {/* الجدول التفاعلي */}
      {loading ? (
        <div style={{textAlign:'center',padding:'3rem',color:'#6b7280',fontSize:14}}>جارٍ تحميل البيانات...</div>
      ) : filteredEmployees.length === 0 ? (
        <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لا توجد نتائج</div>
      ) : (
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{background:'#f3f4f6'}}>
                <th style={{padding:'10px 12px',borderBottom:'2px solid #e5e7eb'}}></th>
                {['تسلسل','الاسم','المنصب','الراتب الأساسي','أيام الغياب','خصم الغياب','استقطاع السلفة','المتبقي من السلفة','مبلغ إضافي','صافي الراتب','ملاحظات',''].map(h=>(
                  <th key={h} style={{padding:'10px 12px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map(emp => {
                const c = calcNetSalary(emp)
                const d = getDraft(emp.id)
                const isEditing = editingEmployee === emp.id
                return (
                  <tr key={emp.id} style={{borderBottom:'1px solid #e5e7eb'}}>
                    <td style={{padding:'10px 12px'}}>
                      <input type="checkbox" checked={selectedForPrint.includes(emp.id)} onChange={()=>toggleSelectForPrint(emp.id)}/>
                    </td>
                    <td style={{padding:'10px 12px',color:'#9ca3af',fontSize:12}}>
                      {isEditing ? (
                        <input value={empEditForm.sort_order} onChange={e=>setEmpEditForm({...empEditForm,sort_order:e.target.value})} style={{...inputSm,width:50}} type="number"/>
                      ) : (emp.sort_order || '—')}
                    </td>
                    <td style={{padding:'10px 12px',fontWeight:600,color:'#111827'}}>{emp.name}</td>
                    <td style={{padding:'10px 12px',color:'#6b7280',fontSize:12}}>{emp.job_title}</td>
                    <td style={{padding:'10px 12px'}}>
                      {isEditing ? (
                        <input value={empEditForm.base_salary} onChange={e=>setEmpEditForm({...empEditForm,base_salary:e.target.value})} style={inputSm} type="number"/>
                      ) : (
                        <span style={{fontWeight:600}}>{formatAmount(emp.base_salary || 0)}</span>
                      )}
                    </td>
                    <td style={{padding:'10px 12px',textAlign:'center',color:c.absentDays>0?'#dc2626':'#9ca3af',fontWeight:600}}>{c.absentDays}</td>
                    <td style={{padding:'10px 12px',color:'#dc2626'}}>{c.absentDeduction > 0 ? '-' + formatAmount(c.absentDeduction) : '—'}</td>
                    <td style={{padding:'10px 12px'}}>
                      {!readOnly ? (
                        <input type="number" value={d.advanceDeduction} onChange={e=>updateDraft(emp.id,'advanceDeduction',e.target.value)} style={{...inputSm,width:90}}/>
                      ) : (
                        <span style={{color:'#dc2626'}}>{c.advanceDeduction > 0 ? '-' + formatAmount(c.advanceDeduction) : '—'}</span>
                      )}
                    </td>
                    <td style={{padding:'10px 12px',color:'#6b7280',fontSize:12}}>
                      {isEditing ? (
                        <div style={{display:'flex',flexDirection:'column',gap:3}}>
                          <input value={empEditForm.advance_remaining} onChange={e=>setEmpEditForm({...empEditForm,advance_remaining:e.target.value})} style={inputSm} type="number" placeholder="المتبقي"/>
                          <div style={{display:'flex',gap:3}}>
                            <input value={empEditForm.advance_completed_installments} onChange={e=>setEmpEditForm({...empEditForm,advance_completed_installments:e.target.value})} style={{...inputSm,width:50}} type="number" placeholder="منفذ"/>
                            <span style={{fontSize:11,alignSelf:'center'}}>/</span>
                            <input value={empEditForm.advance_total_installments} onChange={e=>setEmpEditForm({...empEditForm,advance_total_installments:e.target.value})} style={{...inputSm,width:50}} type="number" placeholder="الكل"/>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div>{formatAmount(emp.advance_remaining || 0)}</div>
                          <div style={{fontSize:11,color:'#9ca3af'}}>{emp.advance_completed_installments || 0} / {emp.advance_total_installments || 0} دفعة</div>
                        </div>
                      )}
                    </td>
                    <td style={{padding:'10px 12px'}}>
                      {!readOnly ? (
                        <input type="number" value={d.extraAmount} onChange={e=>updateDraft(emp.id,'extraAmount',e.target.value)} style={{...inputSm,width:90}}/>
                      ) : (
                        <span>{c.extraAmount > 0 ? '+' + formatAmount(c.extraAmount) : '—'}</span>
                      )}
                    </td>
                    <td style={{padding:'10px 12px',fontWeight:700,color:'#15803d'}}>{formatAmount(c.net)}</td>
                    <td style={{padding:'10px 12px'}}>
                      {!readOnly ? (
                        <input value={d.notes} onChange={e=>updateDraft(emp.id,'notes',e.target.value)} placeholder="ملاحظة..." style={{...inputSm,width:120}}/>
                      ) : (
                        <span style={{fontSize:12,color:'#6b7280'}}>{d.notes || '—'}</span>
                      )}
                    </td>
                    <td style={{padding:'10px 12px'}}>
                      {!readOnly && (
                        isEditing ? (
                          <div style={{display:'flex',gap:6}}>
                            <button onClick={saveEmployeeFinancials} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:11}}>حفظ</button>
                            <button onClick={()=>setEditingEmployee(null)} style={{background:'#e5e7eb',color:'#374151',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',fontSize:11}}>✕</button>
                          </div>
                        ) : (
                          <button onClick={()=>startEditEmployee(emp)}
                            style={{background:'#eff6ff',color:'#1d4ed8',border:'1px solid #93c5fd',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:11,fontWeight:600,whiteSpace:'nowrap'}}>
                            تعديل البيانات
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{background:'#eff6ff',fontWeight:700}}>
                <td colSpan={4} style={{padding:'10px 12px',color:'#1e40af'}}>الإجمالي ({printEmployees.length} موظف)</td>
                <td style={{padding:'10px 12px',color:'#1e40af'}}>{formatAmount(totals.totalBase)}</td>
                <td></td>
                <td style={{padding:'10px 12px',color:'#dc2626'}}>-{formatAmount(totals.totalAbsentDed)}</td>
                <td style={{padding:'10px 12px',color:'#dc2626'}}>-{formatAmount(totals.totalAdvanceDed)}</td>
                <td></td>
                <td style={{padding:'10px 12px',color:'#15803d'}}>+{formatAmount(totals.totalExtra)}</td>
                <td style={{padding:'10px 12px',color:'#15803d'}}>{formatAmount(totals.totalNet)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
