'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { logActivity } from '../logActivity'
import { Button, Input, Badge, Card, Table } from '../ui'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

interface Employee {
  id: string
  name: string
  job_title: string
}

interface Contract {
  id: string
  employee_id: string
  contract_type: string
  start_date: string
  end_date: string | null
  status: string
  notes: string | null
  created_at: string
}

type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger' | 'warning' | 'info' | 'tertiary'

export default function Contracts({ readOnly = false }: { readOnly?: boolean }) {
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [form, setForm] = useState({
    employee_id: '', contract_type: 'fixed', start_date: new Date().toISOString().split('T')[0], end_date: '', notes: ''
  })

  useEffect(() => {
    loadEmployees()
    loadContracts()
  }, [])

  async function loadEmployees() {
    const { data } = await supabase.from('employees').select('id, name, job_title').eq('status', 'active').order('name')
    setEmployees((data as Employee[]) || [])
  }

  async function loadContracts() {
    setLoading(true)
    const { data } = await supabase.from('contracts').select('*').order('created_at', { ascending: false })
    setContracts((data as Contract[]) || [])
    setLoading(false)
  }

  function empName(id: string) {
    return employees.find(e => e.id === id)?.name || '—'
  }

  function empTitle(id: string) {
    return employees.find(e => e.id === id)?.job_title || ''
  }

  function daysRemaining(c: Contract): number | null {
    if (!c.end_date) return null
    const today = new Date(new Date().toDateString())
    const end = new Date(c.end_date)
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  function contractState(c: Contract): { label: string; tone: BadgeTone; priority: number } {
    if (c.status === 'renewed') return { label: 'مجدد', tone: 'accent', priority: 4 }
    if (c.status === 'terminated') return { label: 'ملغى', tone: 'neutral', priority: 5 }
    if (c.contract_type === 'permanent' || !c.end_date) return { label: 'غير محدد المدة', tone: 'info', priority: 3 }
    const days = daysRemaining(c)!
    if (days < 0) return { label: 'منتهي', tone: 'danger', priority: 0 }
    if (days <= 30) return { label: `ينتهي خلال ${days} يوم`, tone: 'warning', priority: 1 }
    return { label: 'نشط', tone: 'success', priority: 2 }
  }

  async function addContract() {
    if (!form.employee_id || !form.start_date) { alert('يرجى اختيار الموظف وتاريخ البداية'); return }
    if (form.contract_type === 'fixed' && !form.end_date) { alert('يرجى تحديد تاريخ نهاية العقد (أو اختر "غير محدد المدة")'); return }
    setSaving(true)
    const { error } = await supabase.from('contracts').insert([{
      employee_id: form.employee_id,
      contract_type: form.contract_type,
      start_date: form.start_date,
      end_date: form.contract_type === 'fixed' ? form.end_date : null,
      notes: form.notes || null,
      status: 'active'
    }])
    if (error) alert('خطأ: ' + error.message)
    else {
      setForm({ employee_id: '', contract_type: 'fixed', start_date: new Date().toISOString().split('T')[0], end_date: '', notes: '' })
      setShowForm(false)
      await loadContracts()
    }
    setSaving(false)
  }

  async function renewContract(c: Contract) {
    if (!confirm(`تجديد عقد ${empName(c.employee_id)}؟ سيُنقل العقد الحالي للأرشيف كـ"مجدد" وستُفتح استمارة العقد الجديد.`)) return
    await supabase.from('contracts').update({ status: 'renewed' }).eq('id', c.id)
    await logActivity('تجديد عقد', 'contracts', `تجديد عقد ${empName(c.employee_id)}`)
    // فتح النموذج مع بيانات مسبقة: نفس الموظف، البداية = نهاية العقد السابق أو اليوم
    setForm({
      employee_id: c.employee_id,
      contract_type: c.contract_type,
      start_date: c.end_date || new Date().toISOString().split('T')[0],
      end_date: '',
      notes: ''
    })
    setActiveTab('active')
    setShowForm(true)
    await loadContracts()
  }

  async function terminateContract(c: Contract) {
    if (!confirm(`إلغاء عقد ${empName(c.employee_id)}؟ سيُنقل للأرشيف كـ"ملغى".`)) return
    await supabase.from('contracts').update({ status: 'terminated' }).eq('id', c.id)
    await logActivity('إلغاء عقد', 'contracts', `إلغاء عقد ${empName(c.employee_id)}`)
    await loadContracts()
  }

  async function deleteContract(c: Contract) {
    if (!confirm(`هل أنت متأكد من حذف هذا العقد نهائياً؟`)) return
    await supabase.from('contracts').delete().eq('id', c.id)
    await logActivity('حذف عقد', 'contracts', `حذف عقد ${empName(c.employee_id)}`)
    await loadContracts()
  }

  const activeContracts = useMemo(() => contracts.filter(c => c.status === 'active'), [contracts])
  const archivedContracts = useMemo(() => contracts.filter(c => c.status !== 'active'), [contracts])

  const alerts = useMemo(() => {
    let expired = 0, expiringSoon = 0
    activeContracts.forEach(c => {
      const days = daysRemaining(c)
      if (days !== null) {
        if (days < 0) expired++
        else if (days <= 30) expiringSoon++
      }
    })
    return { expired, expiringSoon }
  }, [activeContracts])

  const filteredContracts = useMemo(() => {
    let list = activeTab === 'active' ? activeContracts : archivedContracts
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      list = list.filter(c => empName(c.employee_id).toLowerCase().includes(term))
    }
    // ترتيب: المنتهية أولاً ثم القريبة من الانتهاء
    return [...list].sort((a, b) => contractState(a).priority - contractState(b).priority)
  }, [activeTab, activeContracts, archivedContracts, searchTerm, employees])

  function fmtDate(d: string | null) {
    return d ? new Date(d).toLocaleDateString('ar-IQ') : '—'
  }

  const formSelectStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)', border: 'var(--border-width-default) solid var(--color-border-strong)',
    fontSize: 'var(--text-sm)', boxSizing: 'border-box', color: 'var(--color-text)', background: 'var(--color-surface)', marginBottom: 'var(--space-2)',
  }
  const formLabelStyle: React.CSSProperties = {
    display: 'block', marginBottom: 'var(--space-1)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-secondary)',
  }

  return (
    <div style={{ margin: '24px', fontFamily: 'var(--font-sans)', direction: 'rtl' }}>

      {/* تنبيهات العقود */}
      {(alerts.expired > 0 || alerts.expiringSoon > 0) && (
        <div style={{ background: 'var(--color-surface)', border: 'var(--border-width-thin) solid var(--color-warning-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4) var(--space-5)', marginBottom: 'var(--space-4)', display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text)' }}>⚠ تنبيهات العقود:</span>
          {alerts.expired > 0 && <Badge tone="danger">{alerts.expired} عقد منتهي يحتاج إجراء</Badge>}
          {alerts.expiringSoon > 0 && <Badge tone="warning">{alerts.expiringSoon} عقد ينتهي خلال 30 يوماً</Badge>}
        </div>
      )}

      {/* تبويبات */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', background: 'var(--color-border)', padding: 'var(--space-1)', borderRadius: 'var(--radius-lg)', width: 'fit-content' }}>
        <button onClick={() => setActiveTab('active')}
          style={{ padding: '8px 20px', fontSize: 'var(--text-base)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 'var(--weight-semibold)',
            background: activeTab === 'active' ? 'var(--color-surface)' : 'transparent', color: activeTab === 'active' ? 'var(--color-accent)' : 'var(--color-text-muted)',
            boxShadow: activeTab === 'active' ? 'var(--shadow-xs)' : 'none' }}>
          العقود النشطة ({activeContracts.length})
        </button>
        <button onClick={() => setActiveTab('archive')}
          style={{ padding: '8px 20px', fontSize: 'var(--text-base)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 'var(--weight-semibold)',
            background: activeTab === 'archive' ? 'var(--color-surface)' : 'transparent', color: activeTab === 'archive' ? 'var(--color-accent)' : 'var(--color-text-muted)',
            boxShadow: activeTab === 'archive' ? 'var(--shadow-xs)' : 'none' }}>
          الأرشيف ({archivedContracts.length})
        </button>
      </div>

      <Card>
        {/* رأس البطاقة */}
        <div className="ui-card__header">
          <h2 className="ui-card__title" style={{ fontSize: 'var(--text-md)' }}>
            {activeTab === 'active' ? 'العقود النشطة' : 'أرشيف العقود'}
          </h2>
          <Input placeholder="بحث باسم الموظف..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            size="sm" style={{ minWidth: 200, width: 'auto' }} />
          {searchTerm && (
            <Button variant="secondary" size="sm" onClick={() => setSearchTerm('')}>مسح</Button>
          )}
          {!readOnly && activeTab === 'active' && (
            <Button variant="primary" size="md" onClick={() => setShowForm(!showForm)} style={{ marginInlineStart: 'auto' }}>
              {showForm ? 'إلغاء' : '+ عقد جديد'}
            </Button>
          )}
        </div>

        {/* نموذج إضافة */}
        {showForm && !readOnly && (
          <div style={{ padding: 'var(--space-5)', borderBottom: 'var(--border-width-thick) solid var(--color-border)', background: 'var(--color-surface-sunken)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', maxWidth: 640 }}>
              <div>
                <label style={formLabelStyle}>الموظف *</label>
                <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} style={formSelectStyle}>
                  <option value="">اختر الموظف...</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} — {emp.job_title}</option>)}
                </select>
              </div>
              <div>
                <label style={formLabelStyle}>نوع العقد *</label>
                <select value={form.contract_type} onChange={e => setForm({ ...form, contract_type: e.target.value })} style={formSelectStyle}>
                  <option value="fixed">محدد المدة</option>
                  <option value="permanent">غير محدد المدة</option>
                </select>
              </div>
              <Input label="تاريخ بداية العقد *" type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
              {form.contract_type === 'fixed' && (
                <Input label="تاريخ نهاية العقد *" type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
              )}
              <div style={{ gridColumn: 'span 2' }}>
                <Input label="ملاحظات (اختياري)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="شروط خاصة، مرجع العقد الورقي..." />
              </div>
            </div>
            <Button variant="success" size="md" onClick={addContract} disabled={saving} style={{ marginTop: 'var(--space-2)' }}>
              {saving ? 'جارٍ الحفظ...' : 'حفظ العقد'}
            </Button>
          </div>
        )}

        {/* الجدول */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>جارٍ التحميل...</div>
        ) : filteredContracts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-faint)', fontSize: 'var(--text-base)' }}>
            {activeTab === 'active' ? 'لا توجد عقود نشطة — أضف أول عقد' : 'الأرشيف فارغ'}
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                {['الموظف', 'المنصب', 'نوع العقد', 'تاريخ البداية', 'تاريخ النهاية', 'الحالة', 'ملاحظات', ''].map((h, i) => (
                  <Table.Th key={i}>{h}</Table.Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredContracts.map(c => {
                const state = contractState(c)
                return (
                  <tr key={c.id}>
                    <Table.Td style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)' }}>{empName(c.employee_id)}</Table.Td>
                    <Table.Td style={{ fontSize: 'var(--text-xs)' }}>{empTitle(c.employee_id)}</Table.Td>
                    <Table.Td>{c.contract_type === 'fixed' ? 'محدد المدة' : 'غير محدد المدة'}</Table.Td>
                    <Table.Td>{fmtDate(c.start_date)}</Table.Td>
                    <Table.Td>{fmtDate(c.end_date)}</Table.Td>
                    <Table.Td>
                      <Badge tone={state.tone}>{state.label}</Badge>
                    </Table.Td>
                    <Table.Td style={{ fontSize: 'var(--text-xs)', maxWidth: 160 }}>{c.notes || '—'}</Table.Td>
                    <Table.Td>
                      {!readOnly && (
                        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                          {c.status === 'active' && (
                            <>
                              <Button variant="accent-soft" size="sm" onClick={() => renewContract(c)}>تجديد</Button>
                              <Button variant="warning-soft" size="sm" onClick={() => terminateContract(c)}>إلغاء</Button>
                            </>
                          )}
                          <Button variant="danger" size="sm" onClick={() => deleteContract(c)}>حذف</Button>
                        </div>
                      )}
                    </Table.Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  )
}
