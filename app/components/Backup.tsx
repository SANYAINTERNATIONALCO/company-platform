'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { logActivity } from '../logActivity'
import { Button, Card, Table, Badge } from '../ui'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

const PLATFORM_VERSION = '1.0.0'
const PAGE_SIZE = 1000

// أعمدة المفتاح الأساسي التي لا تُسمّى "id" — استثناءات معروفة فقط، الاكتشاف نفسه (الجداول) يبقى ديناميكياً بالكامل
const PRIMARY_KEY_OVERRIDES: Record<string, string> = {
  receipt_counters: 'receipt_type',
  document_counters: 'doc_type',
  document_assets: 'asset_key',
}

// تسميات عربية مختصرة لأسماء الجداول (لأسماء أوراق Excel) — الجدول غير الموجود بالقائمة يستخدم اسمه الإنجليزي كما هو
const TABLE_LABELS: Record<string, string> = {
  profiles: 'الملفات الشخصية (قديم)',
  attendance: 'الحضور (قديم)',
  employees: 'الموظفين',
  attendance_records: 'سجلات الحضور',
  funds: 'السلف',
  expenses: 'المصاريف',
  user_roles: 'أدوار المستخدمين',
  visa_stats: 'إحصائيات التأشيرات',
  visa_files: 'ملفات التأشيرات',
  employee_files: 'ملفات الموظفين',
  employee_notes: 'ملاحظات الموظفين',
  tourist_visas: 'التأشيرات السياحية',
  receipt_counters: 'عدادات الوصولات',
  fuel_receipts: 'وصولات الوقود',
  maintenance_receipts: 'وصولات الصيانة',
  delivery_receipts: 'وصولات التسليم',
  annual_visas: 'التأشيرات السنوية',
  payroll_records: 'سجلات الرواتب',
  signatures: 'التوقيعات',
  payroll_approvals: 'موافقات الرواتب',
  tasks: 'المهام',
  activity_log: 'سجل النشاطات',
  official_documents: 'الكتب الرسمية',
  document_counters: 'عدادات الكتب',
  document_assets: 'أصول الكتب',
  custody_items: 'العهد المالية',
  contracts: 'العقود',
  visa_cycles: 'دورات المغادرة والعودة',
  overtime_records: 'سجلات الأوفرتايم',
  attendance_approvals: 'موافقات الحضور',
  job_openings: 'الوظائف الشاغرة',
  applicants: 'المتقدمين',
  applicant_notes: 'ملاحظات المتقدمين',
  applicant_files: 'ملفات المتقدمين',
  fingerprint_records: 'سجلات البصمة',
}

// تسميات عربية للأعمدة الشائعة عبر الجداول — العمود غير الموجود يُعرض باسمه الإنجليزي كما هو
const COLUMN_LABELS: Record<string, string> = {
  id: 'المعرف', employee_id: 'معرف الموظف', user_id: 'معرف المستخدم', job_id: 'معرف الوظيفة',
  applicant_id: 'معرف المتقدم', hired_employee_id: 'معرف الموظف المُعيَّن',
  created_by: 'أنشأه', created_by_name: 'اسم المنشئ', assigned_to: 'مكلَّف إلى', assigned_to_name: 'اسم المكلَّف',
  full_name: 'الاسم الكامل', name: 'الاسم', employee_name: 'اسم الموظف', person_name: 'اسم الشخص',
  receiver_name: 'اسم المستلم', driver_name: 'اسم السائق', owner_name: 'اسم المالك', interviewer_name: 'اسم المُقابِل',
  job_title: 'المسمى الوظيفي', work_location: 'موقع العمل', shift_type: 'نوع الدوام',
  role: 'الدور', role_name: 'اسم الدور', user_role: 'دور المستخدم', user_email: 'البريد الإلكتروني', email: 'البريد الإلكتروني',
  phone: 'الهاتف', nationality: 'الجنسية', passport_number: 'رقم الجواز', id_number: 'رقم الهوية',
  device_user_id: 'معرف الجهاز', device_name: 'اسم الجهاز',
  status: 'الحالة', notes: 'ملاحظات', note: 'ملاحظة', details: 'التفاصيل', description: 'الوصف',
  subject: 'الموضوع', title: 'العنوان', content: 'المحتوى', department: 'القسم', priority: 'الأولوية',
  category: 'الفئة', section: 'القسم', action: 'الإجراء', source: 'المصدر', referral_by: 'مُحيل من',
  languages: 'اللغات', years_experience: 'سنوات الخبرة', expected_salary: 'الراتب المتوقع', offered_salary: 'الراتب المعروض',
  rejection_reason: 'سبب الرفض', in_talent_pool: 'في بنك المرشحين',
  salary: 'الراتب', base_salary: 'الراتب الأساسي', net_salary: 'صافي الراتب', amount: 'المبلغ', amount_text: 'المبلغ كتابة',
  extra_amount: 'مبلغ إضافي', absent_days: 'أيام الغياب', absent_deduction: 'خصم الغياب', advance_deduction: 'خصم السلفة',
  advance_total: 'إجمالي السلفة', advance_monthly_deduction: 'الخصم الشهري للسلفة', advance_remaining: 'المتبقي من السلفة',
  advance_remaining_installments: 'الأقساط المتبقية', advance_total_installments: 'إجمالي الأقساط',
  advance_completed_installments: 'الأقساط المكتملة', overtime_leave_balance: 'رصيد إجازة الأوفرتايم',
  days_count: 'عدد الأيام', quantity: 'الكمية', odometer_reading: 'قراءة العداد',
  fund_code: 'رمز السلفة', receipt_number: 'رقم الوصل', receipt_type: 'نوع الوصل', last_number: 'آخر رقم',
  current_number: 'الرقم الحالي', doc_number: 'رقم الكتاب', doc_type: 'نوع الكتاب', doc_language: 'لغة الكتاب',
  doc_content: 'محتوى الكتاب', extra_fields: 'حقول إضافية', scores: 'التقييمات', note_type: 'نوع الملاحظة',
  file_name: 'اسم الملف', file_url: 'رابط الملف', file_type: 'نوع الملف', attachment_url: 'رابط المرفق',
  signature_url: 'رابط التوقيع', signature_scale: 'مقياس التوقيع', asset_key: 'مفتاح الأصل', asset_url: 'رابط الأصل',
  sort_order: 'ترتيب العرض', is_active: 'نشط', is_seen: 'تمت رؤيتها', applied_to_attendance: 'طُبِّق على الحضور',
  new_visa_obtained: 'حصل على فيزا جديدة', new_visa_type: 'نوع الفيزا الجديدة', new_visa_number: 'رقم الفيزا الجديدة',
  group_name: 'اسم المجموعة', contract_type: 'نوع العقد', maintenance_type: 'نوع الصيانة', workshop_name: 'اسم الورشة',
  product_type: 'نوع المنتج', vehicle_type: 'نوع المركبة', vehicle_number: 'رقم المركبة', visa_duration: 'مدة الفيزا',
  punch_count: 'عدد البصمات', first_punch: 'أول بصمة', last_punch: 'آخر بصمة', check_in: 'وقت الحضور', check_out: 'وقت الانصراف',
  permissions: 'الصلاحيات', scope: 'النطاق', display_name: 'الاسم المعروض',
  google_form_url: 'رابط نموذج Google', google_sheet_url: 'رابط شيت Google', departure_notes: 'ملاحظات المغادرة',
  location: 'الموقع',
  created_at: 'تاريخ الإنشاء', updated_at: 'تاريخ التحديث', uploaded_at: 'تاريخ الرفع', imported_at: 'تاريخ الاستيراد',
  approved_at: 'تاريخ الموافقة', completed_at: 'تاريخ الإكمال', received_date: 'تاريخ الاستلام', expense_date: 'تاريخ المصروف',
  entry_date: 'تاريخ الدخول', expiry_date: 'تاريخ الانتهاء', hire_date: 'تاريخ التعيين', receipt_date: 'تاريخ الوصل',
  record_date: 'تاريخ السجل', due_date: 'تاريخ الاستحقاق', start_date: 'تاريخ البدء', end_date: 'تاريخ الانتهاء',
  returned_date: 'تاريخ الإرجاع', visa_expired_date: 'تاريخ انتهاء الفيزا', exit_visa_issued_date: 'تاريخ إصدار فيزا المغادرة',
  departure_date: 'تاريخ المغادرة', return_date: 'تاريخ العودة', opened_date: 'تاريخ الفتح', closed_date: 'تاريخ الإغلاق',
  payroll_month: 'شهر الرواتب', attendance_month: 'شهر الحضور', date: 'التاريخ',
}

function tableLabel(name: string): string {
  return TABLE_LABELS[name] || name
}

function columnLabel(name: string): string {
  return COLUMN_LABELS[name] || name
}

function primaryKeyFor(name: string): string {
  return PRIMARY_KEY_OVERRIDES[name] || 'id'
}

function formatDateDMY(dateStr: string): string {
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  const [y, m, d] = parts
  return `${d}/${m}/${y}`
}

function formatTimestampDMYHM(value: string): string {
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hh}:${mm}`
}

function formatCellValue(value: any): string | number {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا'
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDateDMY(value)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return formatTimestampDMYHM(value)
    return value
  }
  return JSON.stringify(value)
}

// اسم ورقة Excel: عربي مختصر، بلا الرموز المحظورة، بحد 31 حرفاً، وبلا تكرار
function sheetNameFor(tableName: string, used: Set<string>): string {
  let base = tableLabel(tableName).replace(/[:\\/?*[\]]/g, '-').slice(0, 31)
  if (!base.trim()) base = tableName.slice(0, 31)
  let candidate = base
  let i = 2
  while (used.has(candidate)) {
    const suffix = ` ${i}`
    candidate = base.slice(0, 31 - suffix.length) + suffix
    i++
  }
  used.add(candidate)
  return candidate
}

interface TableOverview { name: string; count: number | null }
interface BackupProgress { current: number; total: number; tableName: string }
interface BackupResult { tablesCount: number; rowsCount: number; excelUrl: string; jsonUrl: string; excelFileName: string; jsonFileName: string }

export default function Backup() {
  const [tables, setTables] = useState<TableOverview[]>([])
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null)
  const [lastBackupDaysSince, setLastBackupDaysSince] = useState<number | null>(null)
  const [lastBackupLoaded, setLastBackupLoaded] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<BackupProgress | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [result, setResult] = useState<BackupResult | null>(null)
  const resultUrlsRef = useRef<string[]>([])

  useEffect(() => {
    loadOverview()
    loadLastBackup()
    return () => { resultUrlsRef.current.forEach(u => URL.revokeObjectURL(u)) }
  }, [])

  async function loadLastBackup() {
    const { data } = await supabase.from('activity_log').select('created_at').eq('section', 'backup').order('created_at', { ascending: false }).limit(1)
    const rec = (data || [])[0]
    if (!rec) { setLastBackupDate(null); setLastBackupDaysSince(null); setLastBackupLoaded(true); return }
    const backupDay = new Date(rec.created_at); backupDay.setHours(0, 0, 0, 0)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    setLastBackupDate(rec.created_at)
    setLastBackupDaysSince(Math.floor((today.getTime() - backupDay.getTime()) / 86400000))
    setLastBackupLoaded(true)
  }

  // اكتشاف الجداول ديناميكياً عبر backup_list_tables() — لا قائمة ثابتة، فالجداول تتغير مع نمو المنصة
  async function discoverTables(): Promise<string[]> {
    const { data, error } = await supabase.rpc('backup_list_tables')
    if (error) throw new Error('تعذر جلب قائمة جداول قاعدة البيانات: ' + error.message)
    return ((data as { table_name: string }[]) || []).map(r => r.table_name)
  }

  async function loadOverview() {
    setOverviewLoading(true)
    try {
      const names = await discoverTables()
      const results: TableOverview[] = []
      // بالتتابع لا بالتوازي — نفس قاعدة معالجة الجداول في التصدير
      for (const name of names) {
        const { count } = await supabase.from(name).select('*', { count: 'exact', head: true })
        results.push({ name, count: count ?? null })
        setTables([...results])
      }
    } catch {
      // فشل جلب العرض لا يمنع استخدام الصفحة — زر التصدير نفسه يعيد المحاولة ويُظهر الخطأ عند الفشل الفعلي
    }
    setOverviewLoading(false)
  }

  async function fetchAllRows(tableName: string): Promise<any[]> {
    const { count, error: countError } = await supabase.from(tableName).select('*', { count: 'exact', head: true })
    if (countError) throw new Error(`تعذر جلب عدد صفوف "${tableLabel(tableName)}": ${countError.message}`)
    const total = count || 0
    if (total === 0) return []
    const rows: any[] = []
    const pk = primaryKeyFor(tableName)
    for (let from = 0; from < total; from += PAGE_SIZE) {
      const to = Math.min(from + PAGE_SIZE - 1, total - 1)
      const { data, error } = await supabase.from(tableName).select('*').order(pk, { ascending: true }).range(from, to)
      if (error) throw new Error(`تعذر جلب بيانات "${tableLabel(tableName)}": ${error.message}`)
      rows.push(...(data || []))
    }
    if (rows.length !== total) {
      throw new Error(`عدد الصفوف المجلوبة من "${tableLabel(tableName)}" (${rows.length}) لا يطابق العدد الكلي في قاعدة البيانات (${total}) — تم إيقاف النسخ الاحتياطي لتجنّب نسخة ناقصة`)
    }
    return rows
  }

  async function runBackup() {
    if (exporting) return
    resultUrlsRef.current.forEach(u => URL.revokeObjectURL(u))
    resultUrlsRef.current = []
    setResult(null)
    setExportError(null)
    setExporting(true)

    const beforeUnloadHandler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', beforeUnloadHandler)

    try {
      const names = await discoverTables()
      const dataset: Record<string, any[]> = {}
      let totalRows = 0

      // معالجة الجداول بالتتابع لا بالتوازي لتجنّب تجاوز حدود المعدل
      for (let i = 0; i < names.length; i++) {
        const name = names[i]
        setProgress({ current: i + 1, total: names.length, tableName: tableLabel(name) })
        const rows = await fetchAllRows(name)
        dataset[name] = rows
        totalRows += rows.length
      }

      // ملف Excel — ورقة لكل جدول
      const workbook = XLSX.utils.book_new()
      const usedSheetNames = new Set<string>()
      for (const name of names) {
        const rows = dataset[name]
        const sheetName = sheetNameFor(name, usedSheetNames)
        if (rows.length === 0) {
          XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['لا توجد بيانات في هذا الجدول']]), sheetName)
          continue
        }
        const columns = Object.keys(rows[0])
        const aoa = [columns.map(columnLabel), ...rows.map(r => columns.map(c => formatCellValue(r[c])))]
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(aoa), sheetName)
      }
      const excelBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
      const excelUrl = URL.createObjectURL(new Blob([excelBuffer], { type: 'application/octet-stream' }))

      // ملف JSON — بيانات خام بلا تنسيق، للاستعادة الدقيقة
      const isoDate = new Date().toISOString().split('T')[0]
      const jsonPayload: Record<string, any> = {
        ...dataset,
        _meta: {
          exported_at: new Date().toISOString(),
          total_tables: names.length,
          total_rows: totalRows,
          platform_version: PLATFORM_VERSION,
        },
      }
      const jsonUrl = URL.createObjectURL(new Blob([JSON.stringify(jsonPayload)], { type: 'application/json' }))

      resultUrlsRef.current = [excelUrl, jsonUrl]
      setResult({
        tablesCount: names.length,
        rowsCount: totalRows,
        excelUrl,
        jsonUrl,
        excelFileName: `sanya_backup_${isoDate}.xlsx`,
        jsonFileName: `sanya_backup_${isoDate}.json`,
      })

      await logActivity('تصدير نسخة احتياطية', 'backup', `${names.length} جدول، ${totalRows} صف`)
      await loadLastBackup()
    } catch (err: any) {
      setExportError(err?.message || 'حدث خطأ غير متوقع أثناء التصدير')
    } finally {
      window.removeEventListener('beforeunload', beforeUnloadHandler)
      setExporting(false)
      setProgress(null)
    }
  }

  function downloadBlob(url: string, fileName: string) {
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const totalRowsNow = tables.reduce((s, t) => s + (t.count || 0), 0)
  const isStale = lastBackupLoaded && (lastBackupDate === null || (lastBackupDaysSince !== null && lastBackupDaysSince > 30))

  return (
    <div style={{ margin: '24px', fontFamily: 'var(--font-sans)', direction: 'rtl' }}>

      {/* بطاقة آخر نسخة احتياطية */}
      <Card style={{ marginBottom: 'var(--space-5)' }}>
        <Card.Body>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 4 }}>آخر نسخة احتياطية</div>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text)' }}>
                {!lastBackupLoaded ? '...' : lastBackupDate
                  ? new Date(lastBackupDate).toLocaleString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : 'لم تُؤخذ أي نسخة احتياطية بعد'}
              </div>
            </div>
            {lastBackupLoaded && lastBackupDate && lastBackupDaysSince !== null && (
              <Badge tone={lastBackupDaysSince > 30 ? 'danger' : 'success'}>
                {lastBackupDaysSince === 0 ? 'اليوم' : `منذ ${lastBackupDaysSince} يوم`}
              </Badge>
            )}
          </div>
          {isStale && (
            <div style={{ marginTop: 'var(--space-3)', background: 'var(--color-warning-surface)', border: 'var(--border-width-thin) solid var(--color-warning-border)', borderRadius: 'var(--radius-md)', padding: '12px 16px', color: 'var(--color-warning)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>
              {lastBackupDate === null
                ? '⚠ لم تُؤخذ أي نسخة احتياطية بعد — يُنصح بأخذ نسخة الآن'
                : `⚠ لم تُؤخذ نسخة احتياطية منذ ${lastBackupDaysSince} يوم`}
            </div>
          )}
        </Card.Body>
      </Card>

      {/* جدول الجداول وعدد الصفوف */}
      <Card style={{ marginBottom: 'var(--space-5)' }}>
        <Card.Header title="جداول قاعدة البيانات" count={tables.length || undefined} />
        {overviewLoading && tables.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>جارٍ حساب عدد الصفوف...</div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Table.Th>الجدول</Table.Th>
                <Table.Th numeric>عدد الصفوف</Table.Th>
              </tr>
            </thead>
            <tbody>
              {tables.map(t => (
                <tr key={t.name}>
                  <Table.Td style={{ color: 'var(--color-text)' }}>{tableLabel(t.name)}</Table.Td>
                  <Table.Td numeric>{t.count !== null ? t.count.toLocaleString('ar-IQ') : '...'}</Table.Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {!overviewLoading && tables.length > 0 && (
          <div style={{ padding: '10px 20px', borderTop: 'var(--border-width-thin) solid var(--color-border)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            إجمالي الصفوف الحالي: {totalRowsNow.toLocaleString('ar-IQ')} صف في {tables.length} جدول
          </div>
        )}
      </Card>

      {/* التصدير */}
      <Card style={{ marginBottom: 'var(--space-5)' }}>
        <Card.Body>
          <Button variant="primary" size="lg" onClick={runBackup} disabled={exporting}>
            {exporting ? 'جارٍ التصدير...' : '⬇ تصدير نسخة احتياطية شاملة'}
          </Button>

          {exporting && progress && (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                جارٍ تصدير: {progress.tableName} ({progress.current} من {progress.total})
              </div>
              <div style={{ height: 8, background: 'var(--color-border)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round((progress.current / progress.total) * 100)}%`, background: 'var(--color-accent)', borderRadius: 'var(--radius-full)', transition: 'width 0.2s' }} />
              </div>
            </div>
          )}

          {exportError && (
            <div style={{ marginTop: 'var(--space-4)', background: 'var(--color-danger-surface)', border: 'var(--border-width-thin) solid var(--color-danger-border)', borderRadius: 'var(--radius-md)', padding: '12px 16px', color: 'var(--color-danger)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>
              فشل التصدير: {exportError}
            </div>
          )}

          {result && (
            <div style={{ marginTop: 'var(--space-4)', background: 'var(--color-success-surface)', border: 'var(--border-width-thin) solid var(--color-success-border)', borderRadius: 'var(--radius-md)', padding: '16px 18px' }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-bold)', color: 'var(--color-success)', marginBottom: 10 }}>
                ✓ تم تصدير {result.tablesCount} جدول و {result.rowsCount.toLocaleString('ar-IQ')} صف بنجاح
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <Button variant="success" size="md" onClick={() => downloadBlob(result.excelUrl, result.excelFileName)}>⬇ تنزيل ملف Excel</Button>
                <Button variant="secondary" size="md" onClick={() => downloadBlob(result.jsonUrl, result.jsonFileName)}>⬇ تنزيل ملف JSON</Button>
              </div>
            </div>
          )}
        </Card.Body>
      </Card>

      {/* ملاحظة ثابتة */}
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', padding: '0 4px' }}>
        ⓘ لا يشمل هذا التصدير الملفات المرفوعة (التواقيع، ملفات الموظفين، السير الذاتية، ترويسات الكتب) — نزّلها يدوياً من لوحة تحكم Supabase قسم Storage.
      </div>
    </div>
  )
}
