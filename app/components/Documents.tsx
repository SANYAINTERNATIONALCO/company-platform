'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { logActivity } from '../logActivity'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

const LOGO_URL = 'https://idsedrnuopflzepasmvc.supabase.co/storage/v1/object/public/assets/upscalemedia-transformed.png'
const PROJECT_NAME = 'مشروع سمنت الأمير'
const PROJECT_NAME_EN = 'Al-Amir Cement Project'

interface Employee {
  id: string
  name: string
  job_title: string
  hire_date: string | null
  base_salary: number | null
}

interface Signature {
  role_name: string
  person_name: string
  signature_url: string | null
}

interface IssuedDoc {
  id: string
  doc_number: string
  doc_type: string
  doc_language: string
  employee_name: string
  subject: string
  created_at: string
}

// أنواع الكتب المتاحة
const docTypes = [
  { key: 'SAL', label: 'تعريف بالراتب', labelEn: 'Salary Certificate', needsEmployee: true, extraFields: [{ key: 'directed_to', label: 'الجهة الموجَّه لها (اختياري، الافتراضي: مدير الموقع)', placeholder: 'مثال: مصرف الرافدين' }] },
  { key: 'ATT', label: 'موقف الحضور الشهري', labelEn: 'Monthly Attendance Report', needsEmployee: false, extraFields: [{ key: 'month_text', label: 'الشهر والسنة', placeholder: 'مثال: آيار (مايو) لعام 2026' }] },
  { key: 'EMP', label: 'كتاب مباشرة', labelEn: 'Commencement Letter', needsEmployee: true, extraFields: [] },
  { key: 'CON', label: 'استمرارية بالعمل', labelEn: 'Employment Continuity', needsEmployee: true, extraFields: [] },
  { key: 'WRN', label: 'كتاب إنذار', labelEn: 'Warning Letter', needsEmployee: true, extraFields: [{ key: 'reason', label: 'سبب الإنذار', placeholder: 'مثال: الغياب المتكرر بدون عذر' }] },
  { key: 'TRM', label: 'إخلاء طرف / إنهاء خدمة', labelEn: 'Termination / Clearance', needsEmployee: true, extraFields: [{ key: 'last_day', label: 'تاريخ آخر يوم عمل', placeholder: 'مثال: 2026/08/15' }] },
]

function numberToArabicWords(num: number): string {
  if (num === 0) return 'صفر'
  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر']
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون']
  const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة']
  function below1000(n: number): string {
    if (n === 0) return ''
    const h = Math.floor(n / 100), rem = n % 100
    const parts: string[] = []
    if (h > 0) parts.push(hundreds[h])
    if (rem > 0) {
      if (rem < 20) parts.push(ones[rem])
      else {
        const t = Math.floor(rem / 10), o = rem % 10
        if (o > 0) parts.push(ones[o] + ' و' + tens[t])
        else parts.push(tens[t])
      }
    }
    return parts.join(' و')
  }
  const billions = Math.floor(num / 1000000000)
  const millions = Math.floor((num % 1000000000) / 1000000)
  const thousands = Math.floor((num % 1000000) / 1000)
  const rest = num % 1000
  const parts: string[] = []
  if (billions > 0) parts.push(billions === 1 ? 'مليار' : billions === 2 ? 'ملياران' : below1000(billions) + ' مليارات')
  if (millions > 0) parts.push(millions === 1 ? 'مليون' : millions === 2 ? 'مليونان' : below1000(millions) + (millions <= 10 ? ' ملايين' : ' مليون'))
  if (thousands > 0) parts.push(thousands === 1 ? 'ألف' : thousands === 2 ? 'ألفان' : below1000(thousands) + (thousands <= 10 ? ' آلاف' : ' ألف'))
  if (rest > 0) parts.push(below1000(rest))
  return parts.join(' و')
}

export default function Documents({ readOnly = false }: { readOnly?: boolean }) {
  const [activeTab, setActiveTab] = useState<'create' | 'archive'>('create')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [issuedDocs, setIssuedDocs] = useState<IssuedDoc[]>([])
  const [hrSignature, setHrSignature] = useState<Signature | null>(null)
  const [loading, setLoading] = useState(false)

  const [docType, setDocType] = useState('SAL')
  const [docLang, setDocLang] = useState<'ar' | 'en'>('ar')
  const [selectedEmpId, setSelectedEmpId] = useState('')
  const [extraValues, setExtraValues] = useState<Record<string, string>>({})
  const [generatedDoc, setGeneratedDoc] = useState<{ number: string; date: string } | null>(null)

  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadEmployees()
    loadIssuedDocs()
    loadHrSignature()
  }, [])

  async function loadEmployees() {
    const { data } = await supabase.from('employees').select('id, name, job_title, hire_date, base_salary').eq('status', 'active').order('name')
    setEmployees((data as Employee[]) || [])
  }

  async function loadIssuedDocs() {
    const { data } = await supabase.from('official_documents').select('*').order('created_at', { ascending: false }).limit(200)
    setIssuedDocs((data as IssuedDoc[]) || [])
  }

  async function loadHrSignature() {
    const { data } = await supabase.from('signatures').select('*').eq('role_name', 'hr_manager').single()
    setHrSignature(data as Signature)
  }

  const currentType = docTypes.find(t => t.key === docType)!
  const selectedEmp = employees.find(e => e.id === selectedEmpId)

  async function generateDocument() {
    if (currentType.needsEmployee && !selectedEmpId) { alert('يرجى اختيار الموظف'); return }
    for (const f of currentType.extraFields) {
      if (f.key !== 'directed_to' && !extraValues[f.key]) { alert('يرجى تعبئة: ' + f.label); return }
    }
    setLoading(true)
    // رقم تلقائي متسلسل
    const { data: counter } = await supabase.from('document_counters').select('current_number').eq('doc_type', docType).single()
    const nextNum = ((counter?.current_number as number) || 0) + 1
    await supabase.from('document_counters').update({ current_number: nextNum }).eq('doc_type', docType)
    const year = new Date().getFullYear()
    const docNumber = `HR-${docType}-${year}-${String(nextNum).padStart(3, '0')}`
    const today = new Date().toLocaleDateString('en-GB').split('/').join('/')

    // حفظ في الأرشيف
    await supabase.from('official_documents').insert([{
      doc_number: docNumber,
      doc_type: docType,
      doc_language: docLang,
      employee_id: currentType.needsEmployee ? selectedEmpId : null,
      employee_name: selectedEmp?.name || '',
      subject: currentType.label,
      extra_fields: extraValues,
      created_by: 'hr_manager'
    }])
    await logActivity('إصدار كتاب رسمي', 'documents', `${currentType.label} — ${docNumber}`)
    setGeneratedDoc({ number: docNumber, date: today })
    await loadIssuedDocs()
    setLoading(false)
    setTimeout(() => handlePrint(docNumber, today), 400)
  }

  function fmtDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-GB')
  }

  function getBodyAr(docNumber: string, dateStr: string): { to: string; subject: string; body: string } {
    const emp = selectedEmp
    const salaryWords = emp?.base_salary ? numberToArabicWords(emp.base_salary) : ''
    switch (docType) {
      case 'SAL': {
        const directed = extraValues['directed_to']
        return {
          to: directed ? `السادة / ${directed} المحترمين` : 'السيد مدير الموقع المحترم',
          subject: 'تأييد استمرارية بالعمل وتعريف بالراتب',
          body: `تؤيد شركة سانيا الدولية بأن السيد (${emp?.name}) يعمل لدى شركتنا - ${PROJECT_NAME} بصفة (${emp?.job_title}) اعتباراً من تاريخ ${fmtDate(emp?.hire_date || null)} ولا يزال مستمراً بالخدمة حتى تاريخه، ويتقاضى راتباً شهرياً إجمالياً قدره (${Number(emp?.base_salary || 0).toLocaleString('en-US')}) دينار عراقي (فقط ${salaryWords} دينار عراقي لا غير).\n\nوقد أُعطي هذا التأييد بناءً على طلبه${directed ? ` لتقديمه إلى ${directed}` : ''} دون أدنى مسؤولية على الشركة تجاه أي طرف آخر.`
        }
      }
      case 'ATT':
        return {
          to: 'السيد مدير الموقع المحترم',
          subject: 'موقف الحضور الشهري للموظفين',
          body: `نرفق لحضراتكم الموقف الشهري للحضور والغياب لموظفي شركة سانيا الدولية - ${PROJECT_NAME} لشهر ${extraValues['month_text'] || ''} مرفق معه تفاصيل الدوام اليومي والإجازات والغياب (إن وجد) راجين الاطلاع عليه واتخاذ ما يلزم مع فائق التقدير.`
        }
      case 'EMP':
        return {
          to: 'السيد مدير الموقع المحترم',
          subject: 'كتاب مباشرة',
          body: `نود إعلامكم بأن السيد (${emp?.name}) قد باشر العمل لدى شركة سانيا الدولية - ${PROJECT_NAME} بصفة (${emp?.job_title}) اعتباراً من تاريخ ${fmtDate(emp?.hire_date || null)}، راجين تفضلكم بالاطلاع واتخاذ ما يلزم مع فائق الشكر والتقدير.`
        }
      case 'CON':
        return {
          to: 'السيد مدير الموقع المحترم',
          subject: 'تأييد استمرارية بالعمل',
          body: `تؤيد شركة سانيا الدولية بأن السيد (${emp?.name}) يعمل لدى شركتنا - ${PROJECT_NAME} بصفة (${emp?.job_title}) اعتباراً من تاريخ ${fmtDate(emp?.hire_date || null)} ولا يزال مستمراً بالخدمة حتى تاريخه.\n\nوقد أُعطي هذا التأييد بناءً على طلبه دون أدنى مسؤولية على الشركة تجاه أي طرف آخر.`
        }
      case 'WRN':
        return {
          to: `السيد (${emp?.name}) المحترم`,
          subject: 'إنذار',
          body: `نظراً لما لوحظ عليكم من (${extraValues['reason'] || ''})، ننذركم بضرورة الالتزام بأنظمة وتعليمات العمل المعمول بها في الشركة، وبخلافه ستضطر الشركة آسفةً إلى اتخاذ الإجراءات القانونية اللازمة بحقكم وفق قانون العمل النافذ.\n\nنأمل منكم أخذ ما ورد أعلاه بنظر الاعتبار والحرص على عدم تكراره مستقبلاً.`
        }
      case 'TRM':
        return {
          to: 'السيد مدير الموقع المحترم',
          subject: 'إخلاء طرف / إنهاء خدمة',
          body: `نود إعلامكم بإنهاء خدمة السيد (${emp?.name}) الذي كان يعمل لدى شركة سانيا الدولية - ${PROJECT_NAME} بصفة (${emp?.job_title})، وذلك اعتباراً من تاريخ ${extraValues['last_day'] || ''}، علماً أنه قد تمت تسوية كافة مستحقاته المالية وإخلاء طرفه من الشركة أصولياً.\n\nراجين تفضلكم بالاطلاع مع فائق الشكر والتقدير.`
        }
      default: return { to: '', subject: '', body: '' }
    }
  }

  function getBodyEn(docNumber: string, dateStr: string): { to: string; subject: string; body: string } {
    const emp = selectedEmp
    switch (docType) {
      case 'SAL': {
        const directed = extraValues['directed_to']
        return {
          to: directed ? `To / ${directed}` : 'To / Site Manager',
          subject: 'Employment & Salary Certificate',
          body: `This is to certify that Mr. (${emp?.name}) has been employed by Sanya International Company - ${PROJECT_NAME_EN} as a (${emp?.job_title}) since ${fmtDate(emp?.hire_date || null)}, and is still working with us to date. His total monthly salary is IQD (${Number(emp?.base_salary || 0).toLocaleString('en-US')}).\n\nThis certificate has been issued upon his request${directed ? ` to be submitted to ${directed}` : ''}, without any liability on the company towards any third party.`
        }
      }
      case 'ATT':
        return {
          to: 'To / Site Manager',
          subject: 'Monthly Attendance Report',
          body: `Please find attached the monthly attendance and absence report for the employees of Sanya International Company - ${PROJECT_NAME_EN} for the month of ${extraValues['month_text'] || ''}, including details of daily attendance, leaves, and absences (if any). Kindly review and take the necessary action.`
        }
      case 'EMP':
        return {
          to: 'To / Site Manager',
          subject: 'Commencement of Employment',
          body: `This is to inform you that Mr. (${emp?.name}) has commenced his employment with Sanya International Company - ${PROJECT_NAME_EN} as a (${emp?.job_title}) effective from ${fmtDate(emp?.hire_date || null)}. Kindly review and take the necessary action.`
        }
      case 'CON':
        return {
          to: 'To / Site Manager',
          subject: 'Employment Continuity Certificate',
          body: `This is to certify that Mr. (${emp?.name}) has been employed by Sanya International Company - ${PROJECT_NAME_EN} as a (${emp?.job_title}) since ${fmtDate(emp?.hire_date || null)}, and is still working with us to date.\n\nThis certificate has been issued upon his request, without any liability on the company towards any third party.`
        }
      case 'WRN':
        return {
          to: `To / Mr. (${emp?.name})`,
          subject: 'Warning Letter',
          body: `Due to (${extraValues['reason'] || ''}), you are hereby warned to comply with the company's rules and regulations. Failure to do so will regrettably result in the company taking the necessary legal actions against you in accordance with the applicable labor law.\n\nWe hope you take this warning into serious consideration and avoid repeating such conduct in the future.`
        }
      case 'TRM':
        return {
          to: 'To / Site Manager',
          subject: 'Termination / Clearance Letter',
          body: `This is to inform you that the employment of Mr. (${emp?.name}), who worked for Sanya International Company - ${PROJECT_NAME_EN} as a (${emp?.job_title}), has been terminated effective from ${extraValues['last_day'] || ''}. All his financial entitlements have been settled and he has been officially cleared from the company.\n\nKindly review with our best regards.`
        }
      default: return { to: '', subject: '', body: '' }
    }
  }

  function handlePrint(docNumber: string, dateStr: string) {
    const content = docLang === 'ar' ? getBodyAr(docNumber, dateStr) : getBodyEn(docNumber, dateStr)
    const isAr = docLang === 'ar'
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="${isAr ? 'rtl' : 'ltr'}" lang="${isAr ? 'ar' : 'en'}">
      <head>
        <meta charset="UTF-8">
        <title>${content.subject} - ${docNumber}</title>
        <style>
          @page { margin: 15mm; size: A4; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { height: 100%; }
          body { font-family: 'Times New Roman', Arial, serif; direction: ${isAr ? 'rtl' : 'ltr'}; color: #111; display: flex; flex-direction: column; min-height: 100%; font-size: 15px; }
          .letterhead { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px double #1e40af; padding-bottom: 12px; margin-bottom: 30px; }
          .lh-en { font-size: 10px; font-weight: bold; color: #1e40af; text-align: left; line-height: 1.5; max-width: 220px; }
          .lh-ar { font-size: 11px; font-weight: bold; color: #1e40af; text-align: right; line-height: 1.7; max-width: 220px; }
          .lh-logo { height: 75px; object-fit: contain; }
          .doc-date { text-align: ${isAr ? 'right' : 'left'}; font-size: 14px; font-weight: 600; margin-bottom: 24px; }
          .doc-to { font-size: 15px; font-weight: 700; margin-bottom: 10px; }
          .doc-subject { font-size: 15px; font-weight: 700; margin-bottom: 24px; text-decoration: underline; }
          .doc-greeting { font-size: 15px; margin-bottom: 16px; }
          .doc-body { font-size: 15px; line-height: 2.1; text-align: justify; white-space: pre-line; flex: 0; }
          .spacer { flex: 1; }
          .sig-area { margin-top: 50px; text-align: ${isAr ? 'left' : 'right'}; ${isAr ? 'padding-left' : 'padding-right'}: 40px; }
          .sig-img { height: 65px; object-fit: contain; display: block; ${isAr ? 'margin-right: auto; margin-left: 30px' : 'margin-left: auto; margin-right: 30px'}; }
          .sig-title { font-size: 14px; font-weight: 700; margin-top: 6px; }
          .doc-footer { border-top: 2px solid #1e40af; margin-top: 30px; padding-top: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #6b7280; }
          .doc-number { font-weight: 700; color: #374151; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="letterhead">
          <div class="${isAr ? 'lh-en' : 'lh-en'}">
            Sanya International Com.<br/>
            For Trading & General Contracting, Industrial<br/>
            & Real Estate Investments & Glass Industry<br/>
            Limited Liability<br/>
            Capital (5000000000) Milyard Dinar
          </div>
          <img class="lh-logo" src="${LOGO_URL}" alt="logo"/>
          <div class="lh-ar">
            شركة سانيا الدولية<br/>
            للتجارة والمقاولات العامة والاستثمارات<br/>
            الصناعية والعقارية وصناعة الزجاج<br/>
            المحدودة المسؤولية<br/>
            رأسمالها (5000000000) مليار دينار
          </div>
        </div>
        <div class="doc-date">${isAr ? 'التاريخ' : 'Date'}: ${dateStr}</div>
        <div class="doc-to">${isAr ? 'إلى/ ' : ''}${content.to}</div>
        <div class="doc-subject">${isAr ? 'م/ ' : 'Subject: '}${content.subject}</div>
        ${isAr ? '<div class="doc-greeting">تحية طيبة</div>' : ''}
        <div class="doc-body">${content.body}</div>
        <div class="spacer"></div>
        <div class="sig-area">
          ${hrSignature?.signature_url ? `<img class="sig-img" src="${hrSignature.signature_url}" alt=""/>` : '<div style="height:65px"></div>'}
          <div class="sig-title">${isAr ? 'قسم الموارد البشرية' : 'HR Department'}</div>
        </div>
        <div class="doc-footer">
          <div class="doc-number">${docNumber}</div>
          <div>${isAr ? 'العراق - بغداد' : 'Iraq - Baghdad'}</div>
        </div>
      </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => { printWindow.print() }, 700)
  }

  function reprintDocument(doc: IssuedDoc) {
    alert('لإعادة الطباعة بنفس المحتوى، أنشئ الكتاب من جديد بنفس البيانات. (الأرشيف يحفظ السجل فقط وليس المحتوى الكامل)')
  }

  const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, border:'2px solid #d1d5db', fontSize:13, boxSizing:'border-box' as const, color:'#111827', background:'#fff', marginBottom:10 }

  return (
    <div style={{margin:'24px',fontFamily:'system-ui',direction:'rtl'}}>

      {/* تبويبات */}
      <div style={{display:'flex',gap:6,marginBottom:16,background:'#e5e7eb',padding:4,borderRadius:10,width:'fit-content'}}>
        <button onClick={()=>setActiveTab('create')}
          style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
            background:activeTab==='create'?'#fff':'transparent',color:activeTab==='create'?'#1e40af':'#6b7280',
            boxShadow:activeTab==='create'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
          إنشاء كتاب
        </button>
        <button onClick={()=>setActiveTab('archive')}
          style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
            background:activeTab==='archive'?'#fff':'transparent',color:activeTab==='archive'?'#1e40af':'#6b7280',
            boxShadow:activeTab==='archive'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
          سجل الكتب الصادرة ({issuedDocs.length})
        </button>
      </div>

      {/* إنشاء كتاب */}
      {activeTab === 'create' && (
        <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
          <div style={{padding:'16px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb'}}>
            <h2 style={{margin:0,fontSize:17,fontWeight:700,color:'#111827'}}>إنشاء كتاب رسمي</h2>
            <p style={{margin:'6px 0 0',fontSize:12,color:'#6b7280'}}>اختر نوع الكتاب والموظف، وستتعبأ البيانات تلقائياً — الكتاب يُطبع بترويسة الشركة مع توقيعك الرقمي</p>
          </div>

          <div style={{padding:'20px'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,maxWidth:640}}>
              <div>
                <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>نوع الكتاب *</label>
                <select value={docType} onChange={e=>{setDocType(e.target.value); setExtraValues({}); setGeneratedDoc(null)}} style={inputStyle}>
                  {docTypes.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>اللغة *</label>
                <select value={docLang} onChange={e=>setDocLang(e.target.value as 'ar'|'en')} style={inputStyle}>
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </select>
              </div>
              {currentType.needsEmployee && (
                <div style={{gridColumn:'span 2'}}>
                  <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>الموظف *</label>
                  <select value={selectedEmpId} onChange={e=>setSelectedEmpId(e.target.value)} style={inputStyle}>
                    <option value="">اختر الموظف...</option>
                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} — {emp.job_title}</option>)}
                  </select>
                </div>
              )}
              {currentType.extraFields.map(f => (
                <div key={f.key} style={{gridColumn:'span 2'}}>
                  <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>{f.label}</label>
                  <input value={extraValues[f.key] || ''} onChange={e=>setExtraValues({...extraValues,[f.key]:e.target.value})} placeholder={f.placeholder} style={inputStyle}/>
                </div>
              ))}
            </div>

            {/* معاينة بيانات الموظف */}
            {currentType.needsEmployee && selectedEmp && (
              <div style={{background:'#f9fafb',border:'1px solid #e5e7eb',borderRadius:10,padding:'12px 16px',marginTop:8,marginBottom:16,maxWidth:640}}>
                <div style={{fontSize:12,color:'#6b7280',marginBottom:6,fontWeight:600}}>البيانات التي ستظهر في الكتاب:</div>
                <div style={{display:'flex',gap:20,flexWrap:'wrap',fontSize:13,color:'#374151'}}>
                  <span>الاسم: <strong>{selectedEmp.name}</strong></span>
                  <span>المنصب: <strong>{selectedEmp.job_title}</strong></span>
                  <span>تاريخ المباشرة: <strong>{fmtDate(selectedEmp.hire_date)}</strong></span>
                  {docType === 'SAL' && <span>الراتب: <strong>{Number(selectedEmp.base_salary || 0).toLocaleString('en-US')} د.ع</strong></span>}
                </div>
              </div>
            )}

            {!hrSignature?.signature_url && (
              <div style={{background:'#fef9c3',border:'1px solid #fcd34d',borderRadius:10,padding:'10px 14px',marginBottom:16,maxWidth:640,fontSize:12,color:'#b45309',fontWeight:600}}>
                ⚠ لا يوجد توقيع محفوظ — سيُطبع الكتاب بدون توقيع رقمي (يمكنك رفع توقيعك من قسم الرواتب أولاً)
              </div>
            )}

            {!readOnly && (
              <button onClick={generateDocument} disabled={loading}
                style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'11px 28px',cursor:'pointer',fontSize:14,fontWeight:600}}>
                {loading ? 'جارٍ الإنشاء...' : 'إنشاء وطباعة الكتاب'}
              </button>
            )}

            {generatedDoc && (
              <div style={{background:'#dcfce7',border:'1px solid #86efac',borderRadius:10,padding:'10px 14px',marginTop:16,maxWidth:640,fontSize:13,color:'#15803d',fontWeight:600}}>
                ✓ تم إنشاء الكتاب برقم: {generatedDoc.number} — إذا لم تفتح نافذة الطباعة تلقائياً تحقق من إعدادات المتصفح
              </div>
            )}
          </div>
        </div>
      )}

      {/* سجل الكتب الصادرة */}
      {activeTab === 'archive' && (
        <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
          <div style={{padding:'14px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb'}}>
            <h2 style={{margin:0,fontSize:16,fontWeight:700,color:'#111827'}}>سجل الكتب الصادرة</h2>
          </div>
          {issuedDocs.length === 0 ? (
            <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لم يصدر أي كتاب بعد</div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead>
                  <tr style={{background:'#f3f4f6'}}>
                    {['رقم الكتاب','النوع','اللغة','الموظف','تاريخ الإصدار'].map(h=>(
                      <th key={h} style={{padding:'10px 14px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {issuedDocs.map(doc => (
                    <tr key={doc.id} style={{borderBottom:'1px solid #e5e7eb'}}>
                      <td style={{padding:'10px 14px',fontWeight:700,color:'#1e40af',direction:'ltr',textAlign:'right'}}>{doc.doc_number}</td>
                      <td style={{padding:'10px 14px',color:'#111827',fontWeight:600}}>{docTypes.find(t=>t.key===doc.doc_type)?.label || doc.doc_type}</td>
                      <td style={{padding:'10px 14px'}}>
                        <span style={{background:doc.doc_language==='ar'?'#dbeafe':'#fef9c3',color:doc.doc_language==='ar'?'#1d4ed8':'#b45309',padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600}}>
                          {doc.doc_language === 'ar' ? 'عربي' : 'English'}
                        </span>
                      </td>
                      <td style={{padding:'10px 14px',color:'#6b7280'}}>{doc.employee_name || '—'}</td>
                      <td style={{padding:'10px 14px',color:'#6b7280',fontSize:12}}>{new Date(doc.created_at).toLocaleDateString('ar-IQ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
