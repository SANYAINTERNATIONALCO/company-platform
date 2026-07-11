'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
const COLORS = ['#1e40af','#15803d','#dc2626','#b45309','#7c3aed','#0891b2','#be185d','#065f46','#92400e','#1e3a5f','#374151','#6d28d9']

function fmt(n: number) { return Math.round(n).toLocaleString('ar-IQ') + ' د.ع' }
function fmtM(n: number) { return Math.round(n / 1000000) + ' م' }

export default function Reports() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(false)

  // بيانات الرواتب
  const [payrollData, setPayrollData] = useState<any[]>([])
  // بيانات المصاريف
  const [expensesData, setExpensesData] = useState<any[]>([])
  // بيانات الحضور السنوية
  const [attendanceData, setAttendanceData] = useState<any[]>([])
  // بيانات الموظفين
  const [empStats, setEmpStats] = useState({ active: 0, hired: 0, left: 0 })
  // توزيع أنواع الإجازات
  const [leaveData, setLeaveData] = useState<any[]>([])

  useEffect(() => { loadAllData() }, [selectedYear])

  async function loadAllData() {
    setLoading(true)
    await Promise.all([
      loadPayrollData(),
      loadExpensesData(),
      loadAttendanceData(),
      loadEmpStats(),
      loadLeaveData(),
    ])
    setLoading(false)
  }

  async function loadPayrollData() {
    const { data } = await supabase
      .from('payroll_records')
      .select('payroll_month, net_salary, base_salary, absent_deduction, advance_deduction')
      .gte('payroll_month', selectedYear + '-01')
      .lte('payroll_month', selectedYear + '-12')
    const monthly: Record<string, { net: number; base: number; absentDed: number; advanceDed: number; count: number }> = {}
    ;(data || []).forEach((r: any) => {
      const m = r.payroll_month
      if (!monthly[m]) monthly[m] = { net: 0, base: 0, absentDed: 0, advanceDed: 0, count: 0 }
      monthly[m].net += r.net_salary || 0
      monthly[m].base += r.base_salary || 0
      monthly[m].absentDed += r.absent_deduction || 0
      monthly[m].advanceDed += r.advance_deduction || 0
      monthly[m].count++
    })
    const result = MONTHS_AR.map((label, i) => {
      const key = selectedYear + '-' + String(i + 1).padStart(2, '0')
      const d = monthly[key]
      return { month: label, 'صافي الرواتب': d?.net || 0, 'الرواتب الأساسية': d?.base || 0, 'خصم الغياب': d?.absentDed || 0, 'استقطاع سلف': d?.advanceDed || 0, عدد: d?.count || 0 }
    })
    setPayrollData(result)
  }

  async function loadExpensesData() {
    const yearStr = String(selectedYear)
    // مصاريف
    const { data: expenses } = await supabase.from('expenses').select('amount, expense_date').gte('expense_date', yearStr + '-01-01').lte('expense_date', yearStr + '-12-31')
    // وصولات كاز
    const { data: fuel } = await supabase.from('fuel_receipts').select('amount, created_at').gte('created_at', yearStr + '-01-01').lte('created_at', yearStr + '-12-31')
    // وصولات صيانة
    const { data: maint } = await supabase.from('maintenance_receipts').select('amount, created_at').gte('created_at', yearStr + '-01-01').lte('created_at', yearStr + '-12-31')
    // وصولات تسليم
    const { data: delivery } = await supabase.from('delivery_receipts').select('amount, created_at').gte('created_at', yearStr + '-01-01').lte('created_at', yearStr + '-12-31')

    const monthly: Record<number, { مصاريف: number; كاز: number; صيانة: number; تسليم: number }> = {}
    for (let i = 1; i <= 12; i++) monthly[i] = { مصاريف: 0, كاز: 0, صيانة: 0, تسليم: 0 }

    ;(expenses || []).forEach((r: any) => { const m = parseInt(r.expense_date?.slice(5, 7)); if (m) monthly[m].مصاريف += r.amount || 0 })
    ;(fuel || []).forEach((r: any) => { const m = parseInt(r.created_at?.slice(5, 7)); if (m) monthly[m].كاز += r.amount || 0 })
    ;(maint || []).forEach((r: any) => { const m = parseInt(r.created_at?.slice(5, 7)); if (m) monthly[m].صيانة += r.amount || 0 })
    ;(delivery || []).forEach((r: any) => { const m = parseInt(r.created_at?.slice(5, 7)); if (m) monthly[m].تسليم += r.amount || 0 })

    const result = MONTHS_AR.map((label, i) => {
      const d = monthly[i + 1]
      const total = d.مصاريف + d.كاز + d.صيانة + d.تسليم
      return { month: label, مصاريف: d.مصاريف, كاز: d.كاز, صيانة: d.صيانة, تسليم: d.تسليم, الإجمالي: total }
    })
    setExpensesData(result)
  }

  async function loadAttendanceData() {
    const yearStr = String(selectedYear)
    const { data } = await supabase
      .from('attendance_records')
      .select('status, record_date')
      .gte('record_date', yearStr + '-01-01')
      .lte('record_date', yearStr + '-12-31')

    const monthly: Record<number, Record<string, number>> = {}
    for (let i = 1; i <= 12; i++) monthly[i] = { حاضر: 0, غائب: 0, إجازة: 0 }

    ;(data || []).forEach((r: any) => {
      const m = parseInt(r.record_date?.slice(5, 7))
      if (!m) return
      if (r.status === 'حاضر') monthly[m].حاضر++
      else if (r.status === 'غائب') monthly[m].غائب++
      else if (r.status && r.status.includes('إجازة')) monthly[m].إجازة++
    })

    const result = MONTHS_AR.map((label, i) => ({
      month: label,
      حاضر: monthly[i + 1].حاضر,
      غائب: monthly[i + 1].غائب,
      إجازات: monthly[i + 1].إجازة,
    }))
    setAttendanceData(result)
  }

  async function loadEmpStats() {
    const yearStr = String(selectedYear)
    const { data: active } = await supabase.from('employees').select('id', { count: 'exact' }).eq('status', 'active')
    const { data: hired } = await supabase.from('employees').select('id', { count: 'exact' }).gte('hire_date', yearStr + '-01-01').lte('hire_date', yearStr + '-12-31')
    setEmpStats({ active: (active as any)?.length || 0, hired: (hired as any)?.length || 0, left: 0 })
  }

  async function loadLeaveData() {
    const yearStr = String(selectedYear)
    const { data } = await supabase
      .from('attendance_records')
      .select('status')
      .gte('record_date', yearStr + '-01-01')
      .lte('record_date', yearStr + '-12-31')
      .like('status', 'إجازة%')

    const counts: Record<string, number> = {}
    ;(data || []).forEach((r: any) => { counts[r.status] = (counts[r.status] || 0) + 1 })
    setLeaveData(Object.entries(counts).map(([name, value]) => ({ name, value })))
  }

  // إجماليات سنوية
  const totals = useMemo(() => {
    const totalNet = payrollData.reduce((s, r) => s + r['صافي الرواتب'], 0)
    const totalBase = payrollData.reduce((s, r) => s + r['الرواتب الأساسية'], 0)
    const totalExpenses = expensesData.reduce((s, r) => s + r.الإجمالي, 0)
    const totalPresent = attendanceData.reduce((s, r) => s + r.حاضر, 0)
    const totalAbsent = attendanceData.reduce((s, r) => s + r.غائب, 0)
    const totalLeave = attendanceData.reduce((s, r) => s + r.إجازات, 0)
    return { totalNet, totalBase, totalExpenses, totalPresent, totalAbsent, totalLeave }
  }, [payrollData, expensesData, attendanceData])

  const availableYears = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:8,padding:'10px 14px',direction:'rtl',fontSize:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
        <div style={{fontWeight:700,marginBottom:6,color:'#111827'}}>{label}</div>
        {payload.map((p: any, i: number) => (
          <div key={i} style={{color:p.color,marginBottom:2}}>
            {p.name}: <strong>{Math.round(p.value).toLocaleString('ar-IQ')}{p.name.includes('راتب') || p.name.includes('مصروف') || p.name.includes('إجمالي') || p.name.includes('كاز') || p.name.includes('صيانة') || p.name.includes('تسليم') ? ' د.ع' : ''}</strong>
          </div>
        ))}
      </div>
    )
  }

  const statCard = (label: string, value: string, color: string, bg: string) => (
    <div style={{background:'#fff',borderRadius:12,padding:'16px 20px',boxShadow:'0 2px 8px rgba(0,0,0,0.06)',border:`1px solid ${bg}`,flex:'1',minWidth:160}}>
      <div style={{fontSize:12,color:'#6b7280',marginBottom:6}}>{label}</div>
      <div style={{fontSize:22,fontWeight:700,color}}>{value}</div>
    </div>
  )

  return (
    <div style={{margin:'24px',fontFamily:'system-ui',direction:'rtl'}}>

      {/* رأس القسم */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:12}}>
        <div>
          <h2 style={{margin:0,fontSize:20,fontWeight:700,color:'#111827'}}>التقرير السنوي</h2>
          <p style={{margin:'4px 0 0',fontSize:13,color:'#6b7280'}}>ملخص شامل لأداء الشركة خلال السنة</p>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <label style={{fontSize:13,fontWeight:600,color:'#374151'}}>السنة:</label>
          <select value={selectedYear} onChange={e=>setSelectedYear(parseInt(e.target.value))}
            style={{padding:'8px 14px',borderRadius:8,border:'2px solid #d1d5db',fontSize:14,fontWeight:600,color:'#111827',background:'#fff'}}>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {loading && <span style={{fontSize:12,color:'#6b7280'}}>جارٍ التحميل...</span>}
        </div>
      </div>

      {/* بطاقات ملخص سريع */}
      <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:24}}>
        {statCard('الموظفون النشطون', String(empStats.active), '#1e40af', '#dbeafe')}
        {statCard('موظفون جدد ' + selectedYear, String(empStats.hired), '#15803d', '#dcfce7')}
        {statCard('إجمالي الرواتب السنوية', fmtM(totals.totalNet), '#7c3aed', '#ede9fe')}
        {statCard('إجمالي المصروفات السنوية', fmtM(totals.totalExpenses), '#dc2626', '#fee2e2')}
        {statCard('أيام حضور', totals.totalPresent.toLocaleString('ar-IQ'), '#0891b2', '#cffafe')}
        {statCard('أيام غياب', totals.totalAbsent.toLocaleString('ar-IQ'), '#b45309', '#fef9c3')}
      </div>

      {/* الرسوم البيانية */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:24}}>

        {/* رسم الرواتب الشهرية */}
        <div style={{background:'#fff',borderRadius:12,padding:'20px',boxShadow:'0 2px 8px rgba(0,0,0,0.06)'}}>
          <h3 style={{margin:'0 0 16px',fontSize:15,fontWeight:700,color:'#111827'}}>إجمالي الرواتب الشهرية</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={payrollData} margin={{top:5,right:5,bottom:5,left:5}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="month" tick={{fontSize:10,fontFamily:'system-ui'}} tickLine={false}/>
              <YAxis tickFormatter={fmtM} tick={{fontSize:10}} tickLine={false} axisLine={false}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Bar dataKey="صافي الرواتب" fill="#1e40af" radius={[4,4,0,0]}/>
              <Bar dataKey="الرواتب الأساسية" fill="#93c5fd" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* رسم المصاريف الشهرية */}
        <div style={{background:'#fff',borderRadius:12,padding:'20px',boxShadow:'0 2px 8px rgba(0,0,0,0.06)'}}>
          <h3 style={{margin:'0 0 16px',fontSize:15,fontWeight:700,color:'#111827'}}>المصروفات الشهرية</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={expensesData} margin={{top:5,right:5,bottom:5,left:5}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="month" tick={{fontSize:10,fontFamily:'system-ui'}} tickLine={false}/>
              <YAxis tickFormatter={fmtM} tick={{fontSize:10}} tickLine={false} axisLine={false}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Bar dataKey="مصاريف" fill="#dc2626" radius={[4,4,0,0]}/>
              <Bar dataKey="كاز" fill="#f97316" radius={[4,4,0,0]}/>
              <Bar dataKey="صيانة" fill="#eab308" radius={[4,4,0,0]}/>
              <Bar dataKey="تسليم" fill="#8b5cf6" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* رسم الحضور الشهري */}
        <div style={{background:'#fff',borderRadius:12,padding:'20px',boxShadow:'0 2px 8px rgba(0,0,0,0.06)'}}>
          <h3 style={{margin:'0 0 16px',fontSize:15,fontWeight:700,color:'#111827'}}>الحضور والغياب الشهري</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={attendanceData} margin={{top:5,right:5,bottom:5,left:5}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="month" tick={{fontSize:10,fontFamily:'system-ui'}} tickLine={false}/>
              <YAxis tick={{fontSize:10}} tickLine={false} axisLine={false}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Legend wrapperStyle={{fontSize:12,fontFamily:'system-ui'}}/>
              <Line type="monotone" dataKey="حاضر" stroke="#15803d" strokeWidth={2.5} dot={{r:3}}/>
              <Line type="monotone" dataKey="غائب" stroke="#dc2626" strokeWidth={2.5} dot={{r:3}}/>
              <Line type="monotone" dataKey="إجازات" stroke="#b45309" strokeWidth={2.5} dot={{r:3}}/>
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* رسم توزيع الإجازات */}
        <div style={{background:'#fff',borderRadius:12,padding:'20px',boxShadow:'0 2px 8px rgba(0,0,0,0.06)'}}>
          <h3 style={{margin:'0 0 16px',fontSize:15,fontWeight:700,color:'#111827'}}>توزيع أنواع الإجازات</h3>
          {leaveData.length === 0 ? (
            <div style={{textAlign:'center',padding:'60px 0',color:'#9ca3af',fontSize:13}}>لا توجد بيانات إجازات لهذه السنة</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={leaveData} cx="50%" cy="50%" outerRadius={90} dataKey="value" nameKey="name" label={({name,percent})=>`${name} ${Math.round((percent||0)*100)}%`} labelLine={false}>
                  {leaveData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
                </Pie>
                <Tooltip formatter={(value: any) => [value + ' يوم', '']}/>
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* جدول الملخص الشهري */}
      <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.06)',overflow:'hidden',marginBottom:24}}>
        <div style={{padding:'14px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb'}}>
          <h3 style={{margin:0,fontSize:15,fontWeight:700,color:'#111827'}}>الملخص الشهري التفصيلي</h3>
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{background:'#f3f4f6'}}>
                {['الشهر','صافي الرواتب','المصروفات الكلية','أيام حضور','أيام غياب','أيام إجازة'].map(h=>(
                  <th key={h} style={{padding:'10px 14px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MONTHS_AR.map((m, i) => {
                const pay = payrollData[i]
                const exp = expensesData[i]
                const att = attendanceData[i]
                const hasData = pay?.['صافي الرواتب'] > 0 || exp?.الإجمالي > 0 || att?.حاضر > 0
                return (
                  <tr key={m} style={{borderBottom:'1px solid #e5e7eb',background:hasData?'#fff':'#fafafa'}}>
                    <td style={{padding:'9px 14px',fontWeight:600,color:'#111827'}}>{m}</td>
                    <td style={{padding:'9px 14px',color:pay?.['صافي الرواتب']>0?'#1e40af':'#9ca3af'}}>{pay?.['صافي الرواتب']>0?fmt(pay['صافي الرواتب']):'—'}</td>
                    <td style={{padding:'9px 14px',color:exp?.الإجمالي>0?'#dc2626':'#9ca3af'}}>{exp?.الإجمالي>0?fmt(exp.الإجمالي):'—'}</td>
                    <td style={{padding:'9px 14px',color:'#15803d',textAlign:'center'}}>{att?.حاضر||'—'}</td>
                    <td style={{padding:'9px 14px',color:'#dc2626',textAlign:'center'}}>{att?.غائب||'—'}</td>
                    <td style={{padding:'9px 14px',color:'#b45309',textAlign:'center'}}>{att?.إجازات||'—'}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{background:'#eff6ff',fontWeight:700}}>
                <td style={{padding:'10px 14px',color:'#1e40af'}}>الإجمالي السنوي</td>
                <td style={{padding:'10px 14px',color:'#1e40af'}}>{fmt(totals.totalNet)}</td>
                <td style={{padding:'10px 14px',color:'#dc2626'}}>{fmt(totals.totalExpenses)}</td>
                <td style={{padding:'10px 14px',color:'#15803d',textAlign:'center'}}>{totals.totalPresent.toLocaleString('ar-IQ')}</td>
                <td style={{padding:'10px 14px',color:'#dc2626',textAlign:'center'}}>{totals.totalAbsent.toLocaleString('ar-IQ')}</td>
                <td style={{padding:'10px 14px',color:'#b45309',textAlign:'center'}}>{totals.totalLeave.toLocaleString('ar-IQ')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
