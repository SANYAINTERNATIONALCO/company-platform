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

interface CustodyItem {
  id: string
  employee_id: string
  item_name: string
  item_type: string
  serial_number: string | null
  received_date: string
  returned_date: string | null
  status: string
  notes: string | null
  created_at: string
}

const itemTypes = [
  { key: 'vehicle', label: 'سيارة', icon: '🚗' },
  { key: 'laptop', label: 'حاسوب', icon: '💻' },
  { key: 'phone', label: 'هاتف', icon: '📱' },
  { key: 'tools', label: 'أدوات ومعدات', icon: '🧰' },
  { key: 'other', label: 'أخرى', icon: '📦' },
]

export default function Custody({ readOnly = false }: { readOnly?: boolean }) {
  const [activeTab, setActiveTab] = useState<'active' | 'returned'>('active')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [items, setItems] = useState<CustodyItem[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [form, setForm] = useState({
    employee_id: '', item_name: '', item_type: 'other', serial_number: '', received_date: new Date().toISOString().split('T')[0], notes: ''
  })

  useEffect(() => {
    loadEmployees()
    loadItems()
  }, [])

  async function loadEmployees() {
    const { data } = await supabase.from('employees').select('id, name, job_title').eq('status', 'active').order('name')
    setEmployees((data as Employee[]) || [])
  }

  async function loadItems() {
    setLoading(true)
    const { data } = await supabase.from('custody_items').select('*').order('created_at', { ascending: false })
    setItems((data as CustodyItem[]) || [])
    setLoading(false)
  }

  function empName(id: string) {
    return employees.find(e => e.id === id)?.name || '—'
  }

  async function addItem() {
    if (!form.employee_id || !form.item_name || !form.received_date) {
      alert('يرجى تعبئة الموظف واسم العهدة وتاريخ الاستلام')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('custody_items').insert([{
      employee_id: form.employee_id,
      item_name: form.item_name,
      item_type: form.item_type,
      serial_number: form.serial_number || null,
      received_date: form.received_date,
      notes: form.notes || null,
      status: 'active'
    }])
    if (error) alert('خطأ: ' + error.message)
    else {
      setForm({ employee_id: '', item_name: '', item_type: 'other', serial_number: '', received_date: new Date().toISOString().split('T')[0], notes: '' })
      setShowForm(false)
      await loadItems()
    }
    setSaving(false)
  }

  async function returnItem(item: CustodyItem) {
    if (!confirm(`تأكيد إرجاع العهدة "${item.item_name}" من ${empName(item.employee_id)}؟`)) return
    await supabase.from('custody_items').update({
      status: 'returned',
      returned_date: new Date().toISOString().split('T')[0]
    }).eq('id', item.id)
    await logActivity('إرجاع عهدة', 'custody', `إرجاع ${item.item_name} من ${empName(item.employee_id)}`)
    await loadItems()
  }

  async function undoReturn(item: CustodyItem) {
    if (!confirm(`إعادة العهدة "${item.item_name}" إلى حالة نشطة (بحوزة الموظف)؟`)) return
    await supabase.from('custody_items').update({ status: 'active', returned_date: null }).eq('id', item.id)
    await loadItems()
  }

  async function deleteItem(item: CustodyItem) {
    if (!confirm(`هل أنت متأكد من حذف العهدة "${item.item_name}" نهائياً؟`)) return
    await supabase.from('custody_items').delete().eq('id', item.id)
    await logActivity('حذف عهدة', 'custody', `حذف ${item.item_name} — ${empName(item.employee_id)}`)
    await loadItems()
  }

  const filteredItems = useMemo(() => {
    let list = items.filter(i => activeTab === 'active' ? i.status === 'active' : i.status === 'returned')
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      list = list.filter(i =>
        i.item_name.toLowerCase().includes(term) ||
        empName(i.employee_id).toLowerCase().includes(term) ||
        (i.serial_number || '').toLowerCase().includes(term)
      )
    }
    if (typeFilter) list = list.filter(i => i.item_type === typeFilter)
    return list
  }, [items, activeTab, searchTerm, typeFilter, employees])

  // إحصائية: عدد العهد النشطة لكل موظف
  const activeCountByEmployee = useMemo(() => {
    const counts: Record<string, number> = {}
    items.filter(i => i.status === 'active').forEach(i => { counts[i.employee_id] = (counts[i.employee_id] || 0) + 1 })
    return counts
  }, [items])

  function fmtDate(d: string | null) {
    return d ? new Date(d).toLocaleDateString('ar-IQ') : '—'
  }

  const typeInfo = (key: string) => itemTypes.find(t => t.key === key) || itemTypes[4]

  const selectStyle: React.CSSProperties = {
    padding: '8px 10px', borderRadius: 'var(--radius-md)', border: 'var(--border-width-default) solid var(--color-border-strong)',
    fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', background: 'var(--color-surface)',
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

      {/* تبويبات */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', background: 'var(--color-border)', padding: 'var(--space-1)', borderRadius: 'var(--radius-lg)', width: 'fit-content' }}>
        <button onClick={() => setActiveTab('active')}
          style={{ padding: '8px 20px', fontSize: 'var(--text-base)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 'var(--weight-semibold)',
            background: activeTab === 'active' ? 'var(--color-surface)' : 'transparent', color: activeTab === 'active' ? 'var(--color-accent)' : 'var(--color-text-muted)',
            boxShadow: activeTab === 'active' ? 'var(--shadow-xs)' : 'none' }}>
          عهد نشطة ({items.filter(i => i.status === 'active').length})
        </button>
        <button onClick={() => setActiveTab('returned')}
          style={{ padding: '8px 20px', fontSize: 'var(--text-base)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 'var(--weight-semibold)',
            background: activeTab === 'returned' ? 'var(--color-surface)' : 'transparent', color: activeTab === 'returned' ? 'var(--color-accent)' : 'var(--color-text-muted)',
            boxShadow: activeTab === 'returned' ? 'var(--shadow-xs)' : 'none' }}>
          عهد مُرجَعة ({items.filter(i => i.status === 'returned').length})
        </button>
      </div>

      <Card>
        {/* رأس البطاقة */}
        <div className="ui-card__header">
          <h2 className="ui-card__title" style={{ fontSize: 'var(--text-md)' }}>
            {activeTab === 'active' ? 'العهد بحوزة الموظفين' : 'العهد المُرجَعة'}
          </h2>
          <Input placeholder="بحث بالاسم أو العهدة أو الرقم التسلسلي..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            size="sm" style={{ minWidth: 230, width: 'auto' }} />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectStyle}>
            <option value="">كل الأنواع</option>
            {itemTypes.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
          </select>
          {(searchTerm || typeFilter) && (
            <Button variant="secondary" size="sm" onClick={() => { setSearchTerm(''); setTypeFilter('') }}>مسح</Button>
          )}
          {!readOnly && activeTab === 'active' && (
            <Button variant="primary" size="md" onClick={() => setShowForm(!showForm)} style={{ marginInlineStart: 'auto' }}>
              {showForm ? 'إلغاء' : '+ تسجيل عهدة جديدة'}
            </Button>
          )}
        </div>

        {/* نموذج إضافة */}
        {showForm && !readOnly && (
          <div style={{ padding: 'var(--space-5)', borderBottom: 'var(--border-width-thick) solid var(--color-border)', background: 'var(--color-surface-sunken)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)', maxWidth: 800 }}>
              <div>
                <label style={formLabelStyle}>الموظف *</label>
                <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} style={formSelectStyle}>
                  <option value="">اختر الموظف...</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} — {emp.job_title}</option>)}
                </select>
              </div>
              <Input label="اسم العهدة *" value={form.item_name} onChange={e => setForm({ ...form, item_name: e.target.value })} placeholder="مثال: سيارة تويوتا هايلوكس 2022" />
              <div>
                <label style={formLabelStyle}>النوع *</label>
                <select value={form.item_type} onChange={e => setForm({ ...form, item_type: e.target.value })} style={formSelectStyle}>
                  {itemTypes.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <Input label="الرقم التسلسلي / رقم اللوحة (اختياري)" value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} placeholder="مثال: 123456 أو أ ب ج 1234" />
              <Input label="تاريخ الاستلام *" type="date" value={form.received_date} onChange={e => setForm({ ...form, received_date: e.target.value })} />
              <Input label="ملاحظات (اختياري)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="حالة العهدة، ملحقاتها..." />
            </div>
            <Button variant="success" size="md" onClick={addItem} disabled={saving} style={{ marginTop: 'var(--space-2)' }}>
              {saving ? 'جارٍ الحفظ...' : 'تسجيل العهدة'}
            </Button>
          </div>
        )}

        {/* الجدول */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>جارٍ التحميل...</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-faint)', fontSize: 'var(--text-base)' }}>
            {activeTab === 'active' ? 'لا توجد عهد نشطة' : 'لا توجد عهد مُرجَعة'}
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                {['الموظف', 'العهدة', 'النوع', 'الرقم التسلسلي', 'تاريخ الاستلام', activeTab === 'returned' ? 'تاريخ الإرجاع' : '', 'ملاحظات', ''].map((h, i) => (
                  <Table.Th key={i}>{h}</Table.Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => {
                const t = typeInfo(item.item_type)
                return (
                  <tr key={item.id}>
                    <Table.Td style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)' }}>
                      {empName(item.employee_id)}
                      {activeTab === 'active' && (activeCountByEmployee[item.employee_id] || 0) > 1 && (
                        <span style={{ marginInlineStart: 6, display: 'inline-block' }}>
                          <Badge tone="accent" size="sm">{activeCountByEmployee[item.employee_id]} عهد</Badge>
                        </span>
                      )}
                    </Table.Td>
                    <Table.Td style={{ color: 'var(--color-text)' }}>{item.item_name}</Table.Td>
                    <Table.Td>
                      <Badge tone="neutral">{t.icon} {t.label}</Badge>
                    </Table.Td>
                    <Table.Td style={{ direction: 'ltr', textAlign: 'right' }}>{item.serial_number || '—'}</Table.Td>
                    <Table.Td>{fmtDate(item.received_date)}</Table.Td>
                    {activeTab === 'returned' && <Table.Td style={{ color: 'var(--color-success)', fontWeight: 'var(--weight-semibold)' }}>{fmtDate(item.returned_date)}</Table.Td>}
                    {activeTab === 'active' && <Table.Td></Table.Td>}
                    <Table.Td style={{ fontSize: 'var(--text-xs)', maxWidth: 180 }}>{item.notes || '—'}</Table.Td>
                    <Table.Td>
                      {!readOnly && (
                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                          {item.status === 'active' ? (
                            <Button variant="success-soft" size="sm" onClick={() => returnItem(item)}>تسجيل إرجاع</Button>
                          ) : (
                            <Button variant="accent-soft" size="sm" onClick={() => undoReturn(item)}>إلغاء الإرجاع</Button>
                          )}
                          <Button variant="danger" size="sm" onClick={() => deleteItem(item)}>حذف</Button>
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
