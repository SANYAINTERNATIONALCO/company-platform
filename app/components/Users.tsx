'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { logActivity } from '../logActivity'
import { Button, Input, Badge, Card, Table } from '../ui'
import { SECTIONS, PRESETS, resolvePermissions, type Permissions, type PermLevel } from '../lib/permissions'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

interface UserRow {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  role: string | null
  display_name: string | null
  permissions: Permissions | null
  is_active: boolean
}

const roleLabel: Record<string, string> = {
  editor: 'محرر', admin: 'مدير', accountant: 'محاسب', guest_1: 'ضيف 1', guest_2: 'ضيف 2', custom: 'مخصص',
}
const TEMPLATE_OPTIONS = [
  { key: 'editor', label: 'محرر (كل شيء)' },
  { key: 'admin', label: 'مدير (قراءة فقط + مهام)' },
  { key: 'accountant', label: 'محاسب (حسابات + مهام)' },
  { key: 'guest_1', label: 'ضيف (قراءة فقط)' },
  { key: 'custom', label: 'مخصص' },
]
const LEVELS: { key: PermLevel; label: string }[] = [
  { key: 'none', label: 'بلا وصول' },
  { key: 'read', label: 'قراءة' },
  { key: 'edit', label: 'تعديل' },
]

function fmtDateTime(d: string | null) { return d ? new Date(d).toLocaleString('ar-IQ') : '—' }

function passwordStrength(pw: string): { label: string; color: string } {
  let score = 0
  if (pw.length >= 6) score++
  if (pw.length >= 10) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { label: 'ضعيفة', color: 'var(--color-danger)' }
  if (score <= 3) return { label: 'متوسطة', color: 'var(--color-warning)' }
  return { label: 'قوية', color: 'var(--color-success)' }
}

function permCount(perms: Permissions | null): number {
  if (!perms) return 0
  return Object.values(perms).filter(l => l !== 'none').length
}

const formLabelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 'var(--space-1)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-secondary)',
}
const formSelectStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)', border: 'var(--border-width-default) solid var(--color-border-strong)',
  fontSize: 'var(--text-sm)', boxSizing: 'border-box', color: 'var(--color-text)', background: 'var(--color-surface)',
}

function PermissionMatrixEditor({ matrix, onChange }: { matrix: Permissions; onChange: (m: Permissions) => void }) {
  function setLevel(sectionId: string, level: PermLevel) {
    onChange({ ...matrix, [sectionId]: level })
  }
  function setAll(level: PermLevel) {
    const m: Permissions = {}
    SECTIONS.forEach(s => { m[s.id] = level })
    onChange(m)
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-3)' }}>
        <Button variant="success-soft" size="sm" onClick={() => setAll('read')}>الكل قراءة</Button>
        <Button variant="accent-soft" size="sm" onClick={() => setAll('edit')}>الكل تعديل</Button>
        <Button variant="ghost" size="sm" onClick={() => setAll('none')}>مسح الكل</Button>
      </div>
      <Table>
        <thead>
          <tr>
            <Table.Th>القسم</Table.Th>
            {LEVELS.map(l => <Table.Th key={l.key} style={{ textAlign: 'center' }}>{l.label}</Table.Th>)}
          </tr>
        </thead>
        <tbody>
          {SECTIONS.map(s => (
            <tr key={s.id}>
              <Table.Td style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)' }}>{s.label}</Table.Td>
              {LEVELS.map(l => (
                <Table.Td key={l.key} style={{ textAlign: 'center' }}>
                  <input type="radio" name={`perm-${s.id}`} checked={(matrix[s.id] || 'none') === l.key} onChange={() => setLevel(s.id, l.key)} />
                </Table.Td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  )
}

export default function Users({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => { loadUsers() }, [])

  async function callManageUsers(action: string, payload: Record<string, unknown> = {}) {
    const { data, error } = await supabase.functions.invoke('manage-users', { body: { action, ...payload } })
    if (error) {
      let message = error.message || 'حدث خطأ غير متوقع'
      const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context
      if (ctx && typeof ctx.json === 'function') {
        try { const parsed = await ctx.json(); if (parsed?.error) message = parsed.error } catch { /* تجاهل — استخدم الرسالة الافتراضية */ }
      }
      throw new Error(message)
    }
    if (data?.error) throw new Error(data.error)
    return data
  }

  async function loadUsers() {
    setLoading(true)
    setLoadError(null)
    try {
      const result = await callManageUsers('list')
      setUsers((result.users as UserRow[]) || [])
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'تعذر تحميل المستخدمين')
    }
    setLoading(false)
  }

  const activeEditorsCount = useMemo(() => users.filter(u => u.role === 'editor' && u.is_active).length, [users])

  // ===== إنشاء مستخدم =====
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState({ email: '', password: '', display_name: '', template: 'guest_1' })
  const [createMatrix, setCreateMatrix] = useState<Permissions>({ ...PRESETS.guest_1 })
  const [creating, setCreating] = useState(false)

  function handleTemplateChange(template: string) {
    setCreateForm(prev => ({ ...prev, template }))
    if (template !== 'custom' && PRESETS[template]) setCreateMatrix({ ...PRESETS[template] })
  }

  async function submitCreate() {
    const email = createForm.email.trim()
    if (!email || !createForm.password) { alert('البريد الإلكتروني وكلمة المرور مطلوبان'); return }
    if (createForm.password.length < 6) { alert('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return }
    setCreating(true)
    try {
      await callManageUsers('create', {
        email, password: createForm.password,
        display_name: createForm.display_name.trim() || null,
        role: createForm.template,
        permissions: createMatrix,
      })
      await logActivity('إنشاء مستخدم', 'users', `إنشاء مستخدم جديد: ${email}`)
      setCreateForm({ email: '', password: '', display_name: '', template: 'guest_1' })
      setCreateMatrix({ ...PRESETS.guest_1 })
      setShowCreateForm(false)
      await loadUsers()
      alert('تم إنشاء المستخدم بنجاح')
    } catch (e) {
      alert('خطأ: ' + (e instanceof Error ? e.message : 'تعذر إنشاء المستخدم'))
    }
    setCreating(false)
  }

  // ===== تعديل الصلاحيات =====
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [editTemplate, setEditTemplate] = useState('custom')
  const [editMatrix, setEditMatrix] = useState<Permissions>({})
  const [savingPerms, setSavingPerms] = useState(false)

  function startEditPermissions(u: UserRow) {
    setEditingUser(u)
    setEditTemplate(u.role && PRESETS[u.role] ? u.role : 'custom')
    setEditMatrix(resolvePermissions(u.role, u.permissions))
  }

  function handleEditTemplateChange(template: string) {
    setEditTemplate(template)
    if (template !== 'custom' && PRESETS[template]) setEditMatrix({ ...PRESETS[template] })
  }

  async function savePermissions() {
    if (!editingUser) return
    setSavingPerms(true)
    const { error } = await supabase.from('user_roles').update({
      role: editTemplate, permissions: editMatrix, updated_at: new Date().toISOString(),
    }).eq('user_id', editingUser.id)
    if (error) { alert('خطأ: ' + error.message); setSavingPerms(false); return }
    await logActivity('تعديل صلاحيات', 'users', `تعديل صلاحيات ${editingUser.email}`)
    setEditingUser(null)
    await loadUsers()
    setSavingPerms(false)
  }

  // ===== تغيير كلمة المرور =====
  const [passwordTarget, setPasswordTarget] = useState<UserRow | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  async function submitPasswordChange() {
    if (!passwordTarget) return
    if (newPassword.length < 6) { alert('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return }
    setChangingPassword(true)
    try {
      await callManageUsers('update_password', { user_id: passwordTarget.id, password: newPassword })
      await logActivity('تغيير كلمة مرور', 'users', `تغيير كلمة مرور ${passwordTarget.email}`)
      setPasswordTarget(null)
      setNewPassword('')
      alert('تم تغيير كلمة المرور بنجاح')
    } catch (e) {
      alert('خطأ: ' + (e instanceof Error ? e.message : 'تعذر تغيير كلمة المرور'))
    }
    setChangingPassword(false)
  }

  // ===== تفعيل/تعطيل =====
  async function toggleActive(u: UserRow) {
    if (u.is_active && u.role === 'editor' && activeEditorsCount <= 1) {
      alert('لا يمكن تعطيل آخر مستخدم دوره محرر (editor) في النظام')
      return
    }
    const actionLabel = u.is_active ? 'تعطيل' : 'تفعيل'
    if (!confirm(`تأكيد ${actionLabel} المستخدم ${u.display_name || u.email}؟`)) return
    const { error } = await supabase.from('user_roles').update({ is_active: !u.is_active }).eq('user_id', u.id)
    if (error) { alert('خطأ: ' + error.message); return }
    await logActivity(u.is_active ? 'تعطيل مستخدم' : 'تفعيل مستخدم', 'users', `${actionLabel} المستخدم ${u.email}`)
    await loadUsers()
  }

  // ===== حذف =====
  const [deletingId, setDeletingId] = useState<string | null>(null)
  async function deleteUser(u: UserRow) {
    if (u.role === 'editor' && u.is_active && activeEditorsCount <= 1) {
      alert('لا يمكن حذف آخر مستخدم دوره محرر (editor) في النظام')
      return
    }
    if (!confirm(`تأكيد حذف المستخدم ${u.display_name || u.email} نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.`)) return
    setDeletingId(u.id)
    try {
      await callManageUsers('delete', { user_id: u.id })
      await logActivity('حذف مستخدم', 'users', `حذف المستخدم ${u.email}`)
      await loadUsers()
    } catch (e) {
      alert('خطأ: ' + (e instanceof Error ? e.message : 'تعذر حذف المستخدم'))
    }
    setDeletingId(null)
  }

  const createStrength = passwordStrength(createForm.password)
  const changeStrength = passwordStrength(newPassword)

  return (
    <div style={{ margin: '24px', fontFamily: 'var(--font-sans)', direction: 'rtl' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text)' }}>إدارة المستخدمين</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{users.length} مستخدم — {activeEditorsCount} محرر نشط</div>
        </div>
        <Button variant="primary" size="md" onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? 'إلغاء' : '+ مستخدم جديد'}
        </Button>
      </div>

      {showCreateForm && (
        <Card style={{ marginBottom: 'var(--space-4)' }}>
          <div className="ui-card__header">
            <h3 className="ui-card__title" style={{ fontSize: 'var(--text-md)' }}>مستخدم جديد</h3>
          </div>
          <div style={{ padding: 'var(--space-5)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)', maxWidth: 900, marginBottom: 'var(--space-4)' }}>
              <Input label="البريد الإلكتروني *" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} style={{ direction: 'ltr' }} />
              <div>
                <Input label="كلمة المرور *" type="password" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} style={{ direction: 'ltr' }} />
                {createForm.password && (
                  <div style={{ marginTop: 4, fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)', color: createStrength.color }}>قوة كلمة المرور: {createStrength.label}</div>
                )}
              </div>
              <Input label="الاسم المعروض" value={createForm.display_name} onChange={e => setCreateForm({ ...createForm, display_name: e.target.value })} />
              <div>
                <label style={formLabelStyle}>القالب</label>
                <select value={createForm.template} onChange={e => handleTemplateChange(e.target.value)} style={formSelectStyle}>
                  {TEMPLATE_OPTIONS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>مصفوفة الصلاحيات</div>
            <PermissionMatrixEditor matrix={createMatrix} onChange={setCreateMatrix} />

            <Button variant="success" size="md" onClick={submitCreate} disabled={creating} style={{ marginTop: 'var(--space-4)' }}>
              {creating ? 'جارٍ الإنشاء...' : 'إنشاء المستخدم'}
            </Button>
          </div>
        </Card>
      )}

      {editingUser && (
        <Card style={{ marginBottom: 'var(--space-4)' }}>
          <div className="ui-card__header">
            <h3 className="ui-card__title" style={{ fontSize: 'var(--text-md)' }}>تعديل صلاحيات: {editingUser.display_name || editingUser.email}</h3>
            <Button variant="ghost" size="sm" onClick={() => setEditingUser(null)}>إغلاق ✕</Button>
          </div>
          <div style={{ padding: 'var(--space-5)' }}>
            <div style={{ maxWidth: 300, marginBottom: 'var(--space-4)' }}>
              <label style={formLabelStyle}>القالب / الدور</label>
              <select value={editTemplate} onChange={e => handleEditTemplateChange(e.target.value)} style={formSelectStyle}>
                {TEMPLATE_OPTIONS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <PermissionMatrixEditor matrix={editMatrix} onChange={setEditMatrix} />
            <div style={{ display: 'flex', gap: 8, marginTop: 'var(--space-4)' }}>
              <Button variant="success" size="md" onClick={savePermissions} disabled={savingPerms}>{savingPerms ? 'جارٍ الحفظ...' : 'حفظ الصلاحيات'}</Button>
              <Button variant="secondary" size="md" onClick={() => setEditingUser(null)}>إلغاء</Button>
            </div>
          </div>
        </Card>
      )}

      {passwordTarget && (
        <Card style={{ marginBottom: 'var(--space-4)' }}>
          <div className="ui-card__header">
            <h3 className="ui-card__title" style={{ fontSize: 'var(--text-md)' }}>تغيير كلمة مرور: {passwordTarget.display_name || passwordTarget.email}</h3>
            <Button variant="ghost" size="sm" onClick={() => { setPasswordTarget(null); setNewPassword('') }}>إغلاق ✕</Button>
          </div>
          <div style={{ padding: 'var(--space-5)', maxWidth: 360 }}>
            <Input label="كلمة المرور الجديدة *" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ direction: 'ltr' }} />
            {newPassword && (
              <div style={{ marginTop: 4, marginBottom: 8, fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)', color: changeStrength.color }}>قوة كلمة المرور: {changeStrength.label}</div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 'var(--space-3)' }}>
              <Button variant="success" size="md" onClick={submitPasswordChange} disabled={changingPassword}>{changingPassword ? 'جارٍ الحفظ...' : 'تغيير كلمة المرور'}</Button>
              <Button variant="secondary" size="md" onClick={() => { setPasswordTarget(null); setNewPassword('') }}>إلغاء</Button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>جارٍ التحميل...</div>
        ) : loadError ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-danger)' }}>{loadError}</div>
        ) : users.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-faint)' }}>لا يوجد مستخدمون</div>
        ) : (
          <Table>
            <thead>
              <tr>{['الاسم المعروض', 'البريد', 'الدور/القالب', 'الأقسام المصرّح بها', 'الحالة', 'آخر دخول', ''].map((h, i) => <Table.Th key={i}>{h}</Table.Th>)}</tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isSelf = u.id === currentUserId
                return (
                  <tr key={u.id}>
                    <Table.Td style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)' }}>{u.display_name || '—'}</Table.Td>
                    <Table.Td style={{ direction: 'ltr', textAlign: 'right' }}>{u.email}</Table.Td>
                    <Table.Td>{u.role ? (roleLabel[u.role] || u.role) : '—'}</Table.Td>
                    <Table.Td className="ui-table__numeric">{permCount(resolvePermissions(u.role, u.permissions))} / {SECTIONS.length}</Table.Td>
                    <Table.Td><Badge tone={u.is_active ? 'success' : 'danger'}>{u.is_active ? 'نشط' : 'معطل'}</Badge></Table.Td>
                    <Table.Td>{fmtDateTime(u.last_sign_in_at)}</Table.Td>
                    <Table.Td>
                      {isSelf ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Badge tone="accent">حسابك</Badge>
                          <Button variant="secondary" size="sm" onClick={() => setPasswordTarget(u)}>تغيير كلمة المرور</Button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <Button variant="accent-soft" size="sm" onClick={() => startEditPermissions(u)}>الصلاحيات</Button>
                          <Button variant="secondary" size="sm" onClick={() => setPasswordTarget(u)}>كلمة المرور</Button>
                          <Button variant={u.is_active ? 'warning-soft' : 'success-soft'} size="sm" onClick={() => toggleActive(u)}>{u.is_active ? 'تعطيل' : 'تفعيل'}</Button>
                          <Button variant="danger" size="sm" onClick={() => deleteUser(u)} disabled={deletingId === u.id}>{deletingId === u.id ? '...' : 'حذف'}</Button>
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
