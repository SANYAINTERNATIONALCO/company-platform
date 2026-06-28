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
  hire_date: string | null
  base_salary: number | null
  advance_total: number | null
  advance_monthly_deduction: number | null
  advance_remaining: number | null
  advance_remaining_installments: number | null
  status: string
}

interface PayrollOverride {
  advanceDeduction: number
  extraAmount: number
  notes: string
}

interface Signature {
  role_name: string
  person_name: string
  signature_url: string | null
}

const monthLabel = (m: string): string => {
  const [year, month] = m.split('-')
  const names = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
  return names[parseInt(month) - 1] + ' ' + year
}

export default function Payroll({ readOnly = false }: { readOnly?: boolean }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [absentCounts, setAbsentCounts] = useState<Record<string, number>>({})
  const [overrides, setOverrides] = useState<Record<string, PayrollOverride>>({})
  const [savedRecords, setSavedRecords] = useState<Record<string, any>>({})
  const [editingEmployee, setEditingEmployee] = useState<string | null>(null)
  const [empEditForm, setEmpEditForm] = useState({ base_salary: '', advance_total: '', advance_monthly_deduction: '', advance_remaining: '', advance_remaining_installments: '' })
  const [signatures, setSignatures] = useState<Record<string, Signature>>({})
  const [uploadingSig, setUploadingSig] = useState<string | null>(null)
  const printRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const t = new Date()
    const ym = t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0')
    setSelectedMonth(ym)
    loadEmployees()
    loadSignatures()
  }, [])

  useEffect(() => {
    if (selectedMonth && employees.length > 0) {
      loadAbsentCounts(selectedMonth)
      loadSavedPayroll(selectedMonth)
    }
  }, [selectedMonth, employees])

  async function loadEmployees() {
    setLoading(true)
    const { data } = await supabase.from('employees').select('*').eq('status', 'active').order('name')
    setEmployees((data as Employee[]) || [])
    setLoading(false)
  }

  async function loadSignatures() {
    const { data } = await supabase.from('signatures').select('*')
    const map: Record<string, Signature> = {}
    ;(data as Signature[] || []).forEach(s => { map[s.role_name] = s })
    setSignatures(map)
  }

  async function loadAbsentCounts(month: string) {
    const { data } = await supabase
      .from('attendance_records')
      .select('employee_id, status, record_date')
      .eq('status', 'غائب')
      .gte('record_date', month + '-01')
      .lte('record_date', month + '-31')
    const counts: Record<string, number> = {}
    ;(data || []).forEach((r: any) => { counts[r.employee_id] = (counts[r.employee_id] || 0) + 1 })
    setAbsentCounts(counts)
  }

  async function loadSavedPayroll(month: string) {
    const { data } = await supabase.from('payroll_records').select('*').eq('payroll_month', month)
    const map: Record<string, any> = {}
    const ov: Record<string, PayrollOverride> = {}
    ;(data || []).forEach((r: any) => {
      map[r.employee_id] = r
      ov[r.employee_id] = { advanceDeduction: r.advance_deduction, extraAmount: r.extra_amount, notes: r.notes || '' }
    })
    setSavedRecords(map)
    setOverrides(prev => ({ ...ov, ...prev }))
  }

  function getOverride(empId: string, emp: Employee): PayrollOverride {
    if (overrides[empId]) return overrides[empId]
    return {
      advanceDeduction: emp.advance_remaining_installments && emp.advance_remaining_installments > 0 ? (emp.advance_monthly_deduction || 0) : 0,
      extraAmount: 0,
      notes: ''
    }
  }

  function updateOverride(empId: string, field: keyof PayrollOverride, value: string | number) {
    setOverrides(prev => {
      const emp = employees.find(e => e.id === empId)!
      const cur = prev[empId] || getOverride(empId, emp)
      return { ...prev, [empId]: { ...cur, [field]: value } }
    })
  }

  function calcDayValue(emp: Employee): number {
    // قيمة اليوم تقديرية لخصم الغياب: الراتب الأساسي / 30
    return (emp.base_salary || 0) / 30
  }

  function calcNetSalary(emp: Employee): { absentDays: number; absentDeduction: number; advanceDeduction: number; extraAmount: number; net: number } {
    const absentDays = absentCounts[emp.id] || 0
    const absentDeduction = Math.round(calcDayValue(emp) * absentDays)
    const ov = getOverride(emp.id, emp)
    const advanceDeduction = Number(ov.advanceDeduction) || 0
    const extraAmount = Number(ov.extraAmount) || 0
    const net = (emp.base_salary || 0) - absentDeduction - advanceDeduction + extraAmount
    return { absentDays, absentDeduction, advanceDeduction, extraAmount, net }
  }

  async function saveMonthPayroll() {
    setSaving(true)
    for (const emp of employees) {
      const calc = calcNetSalary(emp)
      const ov = getOverride(emp.id, emp)
      const { error } = await supabase.from('payroll_records').upsert({
        employee_id: emp.id,
        payroll_month: selectedMonth,
        base_salary: emp.base_salary || 0,
        absent_days: calc.absentDays,
        absent_deduction: calc.absentDeduction,
        advance_deduction: calc.advanceDeduction,
        extra_amount: calc.extraAmount,
        net_salary: calc.net,
        notes: ov.notes
      }, { onConflict: 'employee_id,payroll_month' })
      if (error) { alert('خطأ في حفظ راتب ' + emp.name + ': ' + error.message); setSaving(false); return }

      // تحديث المتبقي من السلفة وعدد الاستقطاعات إذا تم الاستقطاع هذا الشهر
      if (calc.advanceDeduction > 0 && emp.advance_remaining_installments && emp.advance_remaining_installments > 0) {
        const newRemaining = Math.max(0, (emp.advance_remaining || 0) - calc.advanceDeduction)
        const newInstallments = Math.max(0, (emp.advance_remaining_installments || 0) - 1)
        await supabase.from('employees').update({
          advance_remaining: newRemaining,
          advance_remaining_installments: newInstallments
        }).eq('id', emp.id)
      }
    }
    await loadEmployees()
    await loadSavedPayroll(selectedMonth)
    setSaving(false)
    alert('تم حفظ كشف رواتب شهر ' + monthLabel(selectedMonth) + ' بنجاح')
  }

  function startEditEmployee(emp: Employee) {
    setEditingEmployee(emp.id)
    setEmpEditForm({
      base_salary: emp.base_salary?.toString() || '',
      advance_total: emp.advance_total?.toString() || '',
      advance_monthly_deduction: emp.advance_monthly_deduction?.toString() || '',
      advance_remaining: emp.advance_remaining?.toString() || '',
      advance_remaining_installments: emp.advance_remaining_installments?.toString() || ''
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
      advance_remaining_installments: parseInt(empEditForm.advance_remaining_installments) || 0
    }).eq('id', editingEmployee)
    setEditingEmployee(null)
    await loadEmployees()
    setSaving(false)
  }

  async function handleSignatureUpload(roleName: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingSig(roleName)
    const fileExt = file.name.split('.').pop()
    const fileName = `${roleName}_${Date.now()}.${fileExt}`
    const { data, error } = await supabase.storage.from('signatures').upload(fileName, file)
    if (error) { alert('خطأ في رفع التوقيع: ' + error.message) }
    else {
      const { data: urlData } = supabase.storage.from('signatures').getPublicUrl(data.path)
      await supabase.from('signatures').update({ signature_url: urlData.publicUrl }).eq('role_name', roleName)
      await loadSignatures()
    }
    setUploadingSig(null)
    e.target.value = ''
  }

  function formatAmount(n: number) { return Math.round(n).toLocaleString('ar-IQ') + ' د.ع' }

  const totals = useMemo(() => {
    let totalBase = 0, totalAbsentDed = 0, totalAdvanceDed = 0, totalExtra = 0, totalNet = 0
    employees.forEach(emp => {
      const c = calcNetSalary(emp)
      totalBase += emp.base_salary || 0
      totalAbsentDed += c.absentDeduction
      totalAdvanceDed += c.advanceDeduction
      totalExtra += c.extraAmount
      totalNet += c.net
    })
    return { totalBase, totalAbsentDed, totalAdvanceDed, totalExtra, totalNet }
  }, [employees, absentCounts, overrides])

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
          body { font-family: Arial, sans-serif; direction: rtl; color: #111; padding: 0; }
          .header { text-align: center; border-bottom: 3px solid #1e40af; padding-bottom: 14px; margin-bottom: 20px; }
          .company-name { font-size: 20px; font-weight: bold; color: #1e40af; margin-bottom: 4px; }
          .report-title { font-size: 16px; font-weight: 700; color: #374151; }
          .report-date { font-size: 12px; color: #6b7280; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 30px; }
          th { background: #1e40af; color: #fff; padding: 7px 8px; text-align: center; font-weight: 600; white-space: nowrap; }
          th:first-child { text-align: right; }
          td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: center; }
          td:first-child { text-align: right; font-weight: 600; }
          tr:nth-child(even) { background: #f9fafb; }
          .total-row td { background: #eff6ff; font-weight: bold; color: #1e40af; border-top: 2px solid #1e40af; }
          .deduction { color: #dc2626; }
          .net { font-weight: bold; color: #15803d; }
          .signatures { display: flex; justify-content: space-between; margin-top: 50px; padding: 0 30px; }
          .signature-box { text-align: center; min-width: 220px; }
          .signature-img { height: 60px; max-width: 180px; object-fit: contain; margin-bottom: 4px; }
          .signature-line { border-top: 1px solid #111; padding-top: 8px; font-size: 13px; font-weight: 700; color: #111827; }
          .signature-person { font-size: 12px; color: #374151; margin-top: 2px; }
          .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 10px; color: #9ca3af; }
        </style>
      </head>
      <body>${printContent.innerHTML}</body>
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
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <h2 style={{margin:0,fontSize:17,fontWeight:700,color:'#111827'}}>الرواتب</h2>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <label style={{fontSize:13,fontWeight:600,color:'#374151'}}>الشهر:</label>
            <input type="month" value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}
              style={{padding:'7px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:13,color:'#111827',background:'#fff'}}/>
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={handlePrint}
            style={{background:'#f3f4f6',color:'#374151',border:'1px solid #d1d5db',borderRadius:8,padding:'9px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
            طباعة كشف الرواتب
          </button>
          {!readOnly && (
            <button onClick={saveMonthPayroll} disabled={saving}
              style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:14,fontWeight:600}}>
              {saving ? 'جارٍ الحفظ...' : 'حفظ كشف الشهر'}
            </button>
          )}
        </div>
      </div>

      {/* إعدادات التوقيعات */}
      {!readOnly && (
        <div style={{padding:'14px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',gap:20,flexWrap:'wrap'}}>
          {['site_manager','hr_manager'].map(role => (
            <div key={role} style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:12,fontWeight:600,color:'#374151'}}>
                {role === 'site_manager' ? 'توقيع مدير الموقع' : 'توقيع مدير الموارد البشرية'} ({signatures[role]?.person_name}):
              </span>
              {signatures[role]?.signature_url ? (
                <img src={signatures[role].signature_url!} alt="" style={{height:32,objectFit:'contain'}}/>
              ) : (
                <span style={{fontSize:11,color:'#9ca3af'}}>لا يوجد توقيع</span>
              )}
              <label style={{background:'#eff6ff',color:'#1d4ed8',border:'1px dashed #93c5fd',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:11,fontWeight:500}}>
                {uploadingSig === role ? 'جارٍ الرفع...' : 'رفع/تغيير'}
                <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>handleSignatureUpload(role, e)} disabled={uploadingSig !== null}/>
              </label>
            </div>
          ))}
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
              <th>الاسم</th><th>المنصب</th><th>الراتب الأساسي</th><th>أيام الغياب</th><th>خصم الغياب</th>
              <th>استقطاع السلفة</th><th>مبلغ إضافي</th><th>صافي الراتب</th><th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => {
              const c = calcNetSalary(emp)
              const ov = getOverride(emp.id, emp)
              return (
                <tr key={emp.id}>
                  <td>{emp.name}</td>
                  <td>{emp.job_title}</td>
                  <td>{formatAmount(emp.base_salary || 0)}</td>
                  <td>{c.absentDays}</td>
                  <td className="deduction">{c.absentDeduction > 0 ? '-' + formatAmount(c.absentDeduction) : '—'}</td>
                  <td className="deduction">{c.advanceDeduction > 0 ? '-' + formatAmount(c.advanceDeduction) : '—'}</td>
                  <td>{c.extraAmount > 0 ? '+' + formatAmount(c.extraAmount) : '—'}</td>
                  <td className="net">{formatAmount(c.net)}</td>
                  <td>{ov.notes || '—'}</td>
                </tr>
              )
            })}
            <tr className="total-row">
              <td colSpan={2}>الإجمالي</td>
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
            {signatures['site_manager']?.signature_url && <img className="signature-img" src={signatures['site_manager'].signature_url!} alt=""/>}
            <div className="signature-line">مدير الموقع</div>
            <div className="signature-person">{signatures['site_manager']?.person_name}</div>
          </div>
          <div className="signature-box">
            {signatures['hr_manager']?.signature_url && <img className="signature-img" src={signatures['hr_manager'].signature_url!} alt=""/>}
            <div className="signature-line">مدير قسم الموارد البشرية</div>
            <div className="signature-person">{signatures['hr_manager']?.person_name}</div>
          </div>
        </div>
        <div className="footer">تم إنشاء هذا التقرير بواسطة منصة Sanya International Company — {new Date().toLocaleDateString('ar-IQ')}</div>
      </div>

      {/* الجدول التفاعلي */}
      {loading ? (
        <div style={{textAlign:'center',padding:'3rem',color:'#6b7280',fontSize:14}}>جارٍ تحميل البيانات...</div>
      ) : employees.length === 0 ? (
        <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لا يوجد موظفون نشطون</div>
      ) : (
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{background:'#f3f4f6'}}>
                {['الاسم','المنصب','الراتب الأساسي','أيام الغياب','خصم الغياب','استقطاع السلفة','المتبقي من السلفة','مبلغ إضافي','صافي الراتب','ملاحظات',''].map(h=>(
                  <th key={h} style={{padding:'10px 12px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => {
                const c = calcNetSalary(emp)
                const ov = getOverride(emp.id, emp)
                const isEditing = editingEmployee === emp.id
                return (
                  <tr key={emp.id} style={{borderBottom:'1px solid #e5e7eb'}}>
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
                        <input type="number" value={ov.advanceDeduction} onChange={e=>updateOverride(emp.id,'advanceDeduction',e.target.value)} style={{...inputSm,width:90}}/>
                      ) : (
                        <span style={{color:'#dc2626'}}>{c.advanceDeduction > 0 ? '-' + formatAmount(c.advanceDeduction) : '—'}</span>
                      )}
                    </td>
                    <td style={{padding:'10px 12px',color:'#6b7280',fontSize:12}}>
                      {isEditing ? (
                        <input value={empEditForm.advance_remaining} onChange={e=>setEmpEditForm({...empEditForm,advance_remaining:e.target.value})} style={inputSm} type="number"/>
                      ) : (
                        formatAmount(emp.advance_remaining || 0)
                      )}
                    </td>
                    <td style={{padding:'10px 12px'}}>
                      {!readOnly ? (
                        <input type="number" value={ov.extraAmount} onChange={e=>updateOverride(emp.id,'extraAmount',e.target.value)} style={{...inputSm,width:90}}/>
                      ) : (
                        <span>{c.extraAmount > 0 ? '+' + formatAmount(c.extraAmount) : '—'}</span>
                      )}
                    </td>
                    <td style={{padding:'10px 12px',fontWeight:700,color:'#15803d'}}>{formatAmount(c.net)}</td>
                    <td style={{padding:'10px 12px'}}>
                      {!readOnly ? (
                        <input value={ov.notes} onChange={e=>updateOverride(emp.id,'notes',e.target.value)} placeholder="ملاحظة..." style={{...inputSm,width:120}}/>
                      ) : (
                        <span style={{fontSize:12,color:'#6b7280'}}>{ov.notes || '—'}</span>
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
                            style={{background:'#eff6ff',color:'#1d4ed8',border:'1px solid #93c5fd',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:11,fontWeight:600}}>
                            تعديل الراتب/السلفة
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
                <td colSpan={2} style={{padding:'10px 12px',color:'#1e40af'}}>الإجمالي</td>
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
