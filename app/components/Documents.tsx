'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { logActivity } from '../logActivity'
import { generatePdf, esc } from '../pdfPrint'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

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
  signature_scale: number | null
}

interface DocContent {
  to: string
  subject: string
  body: string
  date: string
  lang: string
  number: string
  fontSize?: number
}

interface IssuedDoc {
  id: string
  doc_number: string
  doc_type: string
  doc_language: string
  employee_name: string
  subject: string
  doc_content: DocContent | null
  created_at: string
}

const docTypes = [
  { key: 'SAL', label: 'تعريف بالراتب', needsEmployee: true, extraFields: [{ key: 'directed_to', label: 'الجهة الموجَّه لها (اختياري، الافتراضي: مدير الموقع)', placeholder: 'مثال: مصرف الرافدين' }] },
  { key: 'ATT', label: 'موقف الحضور الشهري', needsEmployee: false, extraFields: [{ key: 'month_text', label: 'الشهر والسنة', placeholder: 'مثال: آيار (مايو) لعام 2026' }] },
  { key: 'EMP', label: 'كتاب مباشرة', needsEmployee: true, extraFields: [] },
  { key: 'CON', label: 'استمرارية بالعمل', needsEmployee: true, extraFields: [] },
  { key: 'WRN', label: 'كتاب إنذار', needsEmployee: true, extraFields: [{ key: 'reason', label: 'سبب الإنذار', placeholder: 'مثال: الغياب المتكرر بدون عذر' }] },
  { key: 'TRM', label: 'إخلاء طرف / إنهاء خدمة', needsEmployee: true, extraFields: [{ key: 'last_day', label: 'تاريخ آخر يوم عمل', placeholder: 'مثال: 2026/08/15' }] },
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
  const [activeTab, setActiveTab] = useState<'create' | 'archive'>(readOnly ? 'archive' : 'create')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [issuedDocs, setIssuedDocs] = useState<IssuedDoc[]>([])
  const [hrSignature, setHrSignature] = useState<Signature | null>(null)
  const [sigScale, setSigScale] = useState(1)
  const [letterheadTop, setLetterheadTop] = useState<string | null>(null)
  const [letterheadBottom, setLetterheadBottom] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [docType, setDocType] = useState('SAL')
  const [docLang, setDocLang] = useState<'ar' | 'en'>('ar')
  const [docFontSize, setDocFontSize] = useState(15)
  const [selectedEmpId, setSelectedEmpId] = useState('')
  const [extraValues, setExtraValues] = useState<Record<string, string>>({})
  const [generatedDoc, setGeneratedDoc] = useState<{ number: string } | null>(null)

  // فلاتر الأرشيف
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [langFilter, setLangFilter] = useState('')

  useEffect(() => {
    loadEmployees()
    loadIssuedDocs()
    loadHrSignature()
    loadLetterheads()
  }, [])

  async function loadEmployees() {
    const { data } = await supabase.from('employees').select('id, name, job_title, hire_date, base_salary').eq('status', 'active').order('name')
    setEmployees((data as Employee[]) || [])
  }

  async function loadIssuedDocs() {
    const { data } = await supabase.from('official_documents').select('*').order('created_at', { ascending: false }).limit(300)
    setIssuedDocs((data as IssuedDoc[]) || [])
  }

  async function loadHrSignature() {
    const { data } = await supabase.from('signatures').select('*').eq('role_name', 'hr_manager').single()
    if (data) {
      setHrSignature(data as Signature)
      setSigScale((data as Signature).signature_scale || 1)
    }
  }

  async function loadLetterheads() {
    const { data } = await supabase.from('document_assets').select('*')
    ;(data || []).forEach((a: any) => {
      if (a.asset_key === 'letterhead_top') setLetterheadTop(a.asset_url)
      if (a.asset_key === 'letterhead_bottom') setLetterheadBottom(a.asset_url)
    })
  }

  async function uploadLetterhead(key: 'letterhead_top' | 'letterhead_bottom', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(key)
    const fileExt = file.name.split('.').pop()
    const fileName = `${key}_${Date.now()}.${fileExt}`
    const { data, error } = await supabase.storage.from('assets').upload(fileName, file)
    if (error) alert('خطأ في الرفع: ' + error.message)
    else {
      const { data: urlData } = supabase.storage.from('assets').getPublicUrl(data.path)
      await supabase.from('document_assets').update({ asset_url: urlData.publicUrl, updated_at: new Date().toISOString() }).eq('asset_key', key)
      await loadLetterheads()
    }
    setUploading(null)
    e.target.value = ''
  }

  async function uploadHrSignature(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading('signature')
    const fileExt = file.name.split('.').pop()
    const fileName = `hr_docs_${Date.now()}.${fileExt}`
    const { data, error } = await supabase.storage.from('signatures').upload(fileName, file)
    if (error) alert('خطأ في الرفع: ' + error.message)
    else {
      const { data: urlData } = supabase.storage.from('signatures').getPublicUrl(data.path)
      await supabase.from('signatures').update({ signature_url: urlData.publicUrl, signature_scale: 1 }).eq('role_name', 'hr_manager')
      setSigScale(1)
      await loadHrSignature()
    }
    setUploading(null)
    e.target.value = ''
  }

  async function updateSigScale(scale: number) {
    setSigScale(scale)
    await supabase.from('signatures').update({ signature_scale: scale }).eq('role_name', 'hr_manager')
  }

  const currentType = docTypes.find(t => t.key === docType)!
  const selectedEmp = employees.find(e => e.id === selectedEmpId)

  function fmtDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-GB')
  }

  function buildContent(): { to: string; subject: string; body: string } {
    const emp = selectedEmp
    const isAr = docLang === 'ar'
    const salaryWords = emp?.base_salary ? numberToArabicWords(emp.base_salary) : ''
    if (isAr) {
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
    } else {
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
  }

  async function generateDocument() {
    if (currentType.needsEmployee && !selectedEmpId) { alert('يرجى اختيار الموظف'); return }
    for (const f of currentType.extraFields) {
      if (f.key !== 'directed_to' && !extraValues[f.key]) { alert('يرجى تعبئة: ' + f.label); return }
    }
    setLoading(true)
    const { data: counter } = await supabase.from('document_counters').select('current_number').eq('doc_type', docType).single()
    const nextNum = ((counter?.current_number as number) || 0) + 1
    await supabase.from('document_counters').update({ current_number: nextNum }).eq('doc_type', docType)
    const year = new Date().getFullYear()
    const docNumber = `HR-${docType}-${year}-${String(nextNum).padStart(3, '0')}`
    const today = new Date().toLocaleDateString('en-GB')

    const content = buildContent()
    const docContent: DocContent = { ...content, date: today, lang: docLang, number: docNumber, fontSize: docFontSize }

    await supabase.from('official_documents').insert([{
      doc_number: docNumber,
      doc_type: docType,
      doc_language: docLang,
      employee_id: currentType.needsEmployee ? selectedEmpId : null,
      employee_name: selectedEmp?.name || '',
      subject: currentType.label,
      extra_fields: extraValues,
      doc_content: docContent,
      created_by: 'hr_manager'
    }])
    await logActivity('إصدار كتاب رسمي', 'documents', `${currentType.label} — ${docNumber}`)
    setGeneratedDoc({ number: docNumber })
    await loadIssuedDocs()
    setLoading(false)
    setTimeout(() => printDocument(docContent), 400)
  }

  async function printDocument(content: DocContent) {
    const isAr = content.lang === 'ar'
    const fs = content.fontSize || 15

    const styleCss = `
      body { font-family: 'Cairo', 'Times New Roman', Arial, serif; direction: ${isAr ? 'rtl' : 'ltr'}; color: #111; font-size: ${fs}px; }
      .doc-date { text-align: ${isAr ? 'right' : 'left'}; font-size: ${fs - 1}px; font-weight: 600; margin-bottom: 22px; }
      .doc-to { font-size: ${fs}px; font-weight: 700; margin-bottom: 14px; }
      .doc-subject { font-size: ${fs + 1}px; font-weight: 700; margin-bottom: 24px; text-align: center; }
      .doc-subject span { border-bottom: 2px solid #111; padding-bottom: 2px; }
      .doc-greeting { font-size: ${fs}px; margin-bottom: 16px; }
      .doc-body { font-size: ${fs}px; line-height: 2.1; text-align: justify; white-space: pre-line; }
      .sig-area { margin-top: 55px; text-align: ${isAr ? 'left' : 'right'}; ${isAr ? 'padding-left' : 'padding-right'}: 50px; }
      .sig-img { height: ${Math.round(65 * sigScale)}px; object-fit: contain; display: block; ${isAr ? 'margin-right: auto; margin-left: 20px' : 'margin-left: auto; margin-right: 20px'}; }
      .sig-title { font-size: 14px; font-weight: 700; margin-top: 6px; }
      .doc-number-row { font-weight: 700; color: #374151; font-size: 12px; margin-bottom: 6px; text-align: ${isAr ? 'left' : 'right'}; }
    `

    const headerHtml = letterheadTop
      ? `<div style="width:100%;height:20mm;overflow:hidden;display:flex;align-items:center;justify-content:center;"><img src="${letterheadTop}" style="max-width:100%;max-height:100%;object-fit:contain;"/></div>`
      : `<div style="width:100%;height:20mm;overflow:hidden;padding:0 10mm;box-sizing:border-box;display:flex;justify-content:space-between;align-items:center;direction:rtl;font-family:Arial,sans-serif;">
          <div style="font-size:9px;font-weight:bold;color:#1e40af;text-align:right;line-height:1.5;max-width:220px;">شركة سانيا الدولية<br/>للتجارة والمقاولات العامة والاستثمارات<br/>الصناعية والعقارية وصناعة الزجاج<br/>المحدودة المسؤولية<br/>رأسمالها (5000000000) مليار دينار</div>
          <div style="font-size:8px;font-weight:bold;color:#1e40af;text-align:left;line-height:1.4;max-width:220px;direction:ltr;">Sanya International Com.<br/>For Trading & General Contracting, Industrial<br/>& Real Estate Investments & Glass Industry<br/>Limited Liability<br/>Capital (5000000000) Milyard Dinar</div>
        </div>`
    const footerHtml = letterheadBottom
      ? `<div style="width:100%;height:16mm;overflow:hidden;display:flex;align-items:center;justify-content:center;"><img src="${letterheadBottom}" style="max-width:100%;max-height:100%;object-fit:contain;"/></div>`
      : `<div style="width:100%;height:16mm;overflow:hidden;text-align:center;font-size:9px;color:#6b7280;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;">${isAr ? 'العراق - بغداد' : 'Iraq - Baghdad'}</div>`

    const mainHtml = `
      <div class="doc-date">${isAr ? 'التاريخ' : 'Date'}: ${content.date}</div>
      <div class="doc-to">${isAr ? 'إلى/ ' : ''}${esc(content.to)}</div>
      <div class="doc-subject"><span>${isAr ? 'م/ ' : 'Subject: '}${esc(content.subject)}</span></div>
      ${isAr ? '<div class="doc-greeting">تحية طيبة</div>' : ''}
      <div class="doc-body">${esc(content.body)}</div>
    `
    const trailingHtml = `
      <div class="sig-area">
        ${hrSignature?.signature_url ? `<img class="sig-img" src="${hrSignature.signature_url}" alt=""/>` : '<div style="height:65px"></div>'}
        <div class="sig-title">${isAr ? 'قسم الموارد البشرية' : 'HR Department'}</div>
      </div>
      <div class="doc-number-row">${content.number}</div>
    `
    const bodyHtml = `<div style="display:flex;flex-direction:column;min-height:252mm;"><div>${mainHtml}</div><div style="flex:1"></div><div>${trailingHtml}</div></div>`

    await generatePdf({
      bodyHtml, styleCss, headerHtml, footerHtml, landscape: false,
      filename: `${content.subject} - ${content.number}.pdf`
    })
  }

  async function deleteDocument(doc: IssuedDoc) {
    if (!confirm(`هل أنت متأكد من حذف الكتاب ${doc.doc_number}؟`)) return
    await supabase.from('official_documents').delete().eq('id', doc.id)
    await logActivity('حذف كتاب رسمي', 'documents', `حذف ${docTypes.find(t=>t.key===doc.doc_type)?.label || doc.doc_type} — ${doc.doc_number}`)
    await loadIssuedDocs()
  }

  const filteredDocs = useMemo(() => {
    let docs = issuedDocs
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      docs = docs.filter(d => d.doc_number.toLowerCase().includes(term) || (d.employee_name || '').toLowerCase().includes(term))
    }
    if (typeFilter) docs = docs.filter(d => d.doc_type === typeFilter)
    if (langFilter) docs = docs.filter(d => d.doc_language === langFilter)
    return docs
  }, [issuedDocs, searchTerm, typeFilter, langFilter])

  const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, border:'2px solid #d1d5db', fontSize:13, boxSizing:'border-box' as const, color:'#111827', background:'#fff', marginBottom:10 }

  return (
    <div style={{margin:'24px',fontFamily:'system-ui',direction:'rtl'}}>

      {/* تبويبات */}
      <div style={{display:'flex',gap:6,marginBottom:16,background:'#e5e7eb',padding:4,borderRadius:10,width:'fit-content'}}>
        {!readOnly && (
          <button onClick={()=>setActiveTab('create')}
            style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
              background:activeTab==='create'?'#fff':'transparent',color:activeTab==='create'?'#1e40af':'#6b7280',
              boxShadow:activeTab==='create'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
            إنشاء كتاب
          </button>
        )}
        <button onClick={()=>setActiveTab('archive')}
          style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
            background:activeTab==='archive'?'#fff':'transparent',color:activeTab==='archive'?'#1e40af':'#6b7280',
            boxShadow:activeTab==='archive'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
          سجل الكتب الصادرة ({issuedDocs.length})
        </button>
      </div>

      {/* إعدادات الترويسة والتوقيع */}
      {!readOnly && activeTab === 'create' && (
        <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',padding:'14px 20px',marginBottom:16,display:'flex',gap:24,flexWrap:'wrap',alignItems:'center'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:12,fontWeight:600,color:'#374151'}}>الترويسة العلوية:</span>
            {letterheadTop ? <img src={letterheadTop} alt="" style={{height:36,objectFit:'contain',border:'1px solid #e5e7eb',borderRadius:4}}/> : <span style={{fontSize:11,color:'#dc2626'}}>غير مرفوعة</span>}
            <label style={{background:'#eff6ff',color:'#1d4ed8',border:'1px dashed #93c5fd',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:11,fontWeight:500}}>
              {uploading === 'letterhead_top' ? 'جارٍ الرفع...' : 'رفع/تغيير'}
              <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>uploadLetterhead('letterhead_top', e)} disabled={uploading !== null}/>
            </label>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:12,fontWeight:600,color:'#374151'}}>التذييل السفلي:</span>
            {letterheadBottom ? <img src={letterheadBottom} alt="" style={{height:36,objectFit:'contain',border:'1px solid #e5e7eb',borderRadius:4}}/> : <span style={{fontSize:11,color:'#dc2626'}}>غير مرفوع</span>}
            <label style={{background:'#eff6ff',color:'#1d4ed8',border:'1px dashed #93c5fd',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:11,fontWeight:500}}>
              {uploading === 'letterhead_bottom' ? 'جارٍ الرفع...' : 'رفع/تغيير'}
              <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>uploadLetterhead('letterhead_bottom', e)} disabled={uploading !== null}/>
            </label>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:12,fontWeight:600,color:'#374151'}}>توقيعك:</span>
            {hrSignature?.signature_url ? (
              <>
                <img src={hrSignature.signature_url} alt="" style={{height: 28 * sigScale, objectFit:'contain'}}/>
                <input type="range" min="0.5" max="2" step="0.1" value={sigScale}
                  onChange={e=>updateSigScale(parseFloat(e.target.value))} style={{width:80}}/>
              </>
            ) : <span style={{fontSize:11,color:'#dc2626'}}>غير مرفوع</span>}
            <label style={{background:'#eff6ff',color:'#1d4ed8',border:'1px dashed #93c5fd',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:11,fontWeight:500}}>
              {uploading === 'signature' ? 'جارٍ الرفع...' : 'رفع/تغيير'}
              <input type="file" accept="image/*" style={{display:'none'}} onChange={uploadHrSignature} disabled={uploading !== null}/>
            </label>
          </div>
        </div>
      )}

      {/* إنشاء كتاب */}
      {activeTab === 'create' && !readOnly && (
        <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
          <div style={{padding:'16px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb'}}>
            <h2 style={{margin:0,fontSize:17,fontWeight:700,color:'#111827'}}>إنشاء كتاب رسمي</h2>
            <p style={{margin:'6px 0 0',fontSize:12,color:'#6b7280'}}>اختر نوع الكتاب والموظف، وستتعبأ البيانات تلقائياً — الكتاب يُطبع بالترويسة والتذييل الرسميين مع توقيعك</p>
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
              <div>
                <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>حجم خط الكتاب</label>
                <select value={docFontSize} onChange={e=>setDocFontSize(parseInt(e.target.value))} style={inputStyle}>
                  <option value="13">صغير</option>
                  <option value="15">عادي</option>
                  <option value="17">كبير</option>
                  <option value="19">كبير جداً</option>
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

            {!readOnly && (
              <button onClick={generateDocument} disabled={loading}
                style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'11px 28px',cursor:'pointer',fontSize:14,fontWeight:600}}>
                {loading ? 'جارٍ الإنشاء...' : 'إنشاء وطباعة الكتاب'}
              </button>
            )}

            {generatedDoc && (
              <div style={{background:'#dcfce7',border:'1px solid #86efac',borderRadius:10,padding:'10px 14px',marginTop:16,maxWidth:640,fontSize:13,color:'#15803d',fontWeight:600}}>
                ✓ تم إنشاء الكتاب برقم: {generatedDoc.number} — تجده أيضاً في سجل الكتب الصادرة لإعادة طباعته في أي وقت
              </div>
            )}
          </div>
        </div>
      )}

      {/* سجل الكتب الصادرة */}
      {activeTab === 'archive' && (
        <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
          <div style={{padding:'14px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <h2 style={{margin:0,fontSize:16,fontWeight:700,color:'#111827'}}>سجل الكتب الصادرة</h2>
            <input placeholder="بحث برقم الكتاب أو اسم الموظف..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}
              style={{padding:'8px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:12,color:'#111827',minWidth:220}}/>
            <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}
              style={{padding:'8px 10px',borderRadius:8,border:'2px solid #d1d5db',fontSize:12,color:'#374151',background:'#fff'}}>
              <option value="">كل الأنواع</option>
              {docTypes.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <select value={langFilter} onChange={e=>setLangFilter(e.target.value)}
              style={{padding:'8px 10px',borderRadius:8,border:'2px solid #d1d5db',fontSize:12,color:'#374151',background:'#fff'}}>
              <option value="">كل اللغات</option>
              <option value="ar">عربي</option>
              <option value="en">English</option>
            </select>
            {(searchTerm||typeFilter||langFilter) && (
              <button onClick={()=>{setSearchTerm('');setTypeFilter('');setLangFilter('')}}
                style={{background:'#f3f4f6',color:'#6b7280',border:'none',borderRadius:8,padding:'8px 12px',cursor:'pointer',fontSize:12}}>مسح</button>
            )}
            <span style={{fontSize:12,color:'#9ca3af',marginRight:'auto'}}>{filteredDocs.length} كتاب</span>
          </div>
          {filteredDocs.length === 0 ? (
            <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لا توجد كتب مطابقة</div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead>
                  <tr style={{background:'#f3f4f6'}}>
                    {['رقم الكتاب','النوع','اللغة','الموظف','تاريخ الإصدار',''].map(h=>(
                      <th key={h} style={{padding:'10px 14px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map(doc => (
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
                      <td style={{padding:'10px 14px'}}>
                        <div style={{display:'flex',gap:6}}>
                          {doc.doc_content && (
                            <button onClick={()=>printDocument(doc.doc_content!)}
                              style={{background:'#f3f4f6',color:'#374151',border:'1px solid #d1d5db',borderRadius:6,padding:'5px 12px',cursor:'pointer',fontSize:11,fontWeight:600}}>
                              طباعة
                            </button>
                          )}
                          {!readOnly && (
                            <button onClick={()=>deleteDocument(doc)}
                              style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:6,padding:'5px 12px',cursor:'pointer',fontSize:11,fontWeight:600}}>
                              حذف
                            </button>
                          )}
                        </div>
                      </td>
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
