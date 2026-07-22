'use client'
import { useState, useEffect, useMemo, useRef, useCallback, type ReactElement } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Tree, TreeNode } from 'react-organizational-chart'
import { motion } from 'framer-motion'
import { logActivity } from '../logActivity'
import { Button, Input, Badge, Card } from '../ui'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

interface Employee {
  id: string
  name: string
  job_title: string | null
  status: string | null
  manager_id: string | null
  org_sort_order: number | null
  phone: string | null
  hire_date: string | null
  shift_type: string | null
  work_location: string | null
}

type Tone = 'neutral' | 'accent' | 'success' | 'danger' | 'warning' | 'info' | 'tertiary'
const TONES: Tone[] = ['accent', 'success', 'warning', 'info', 'tertiary', 'danger', 'neutral']
const TONE_VARS: Record<Tone, { surface: string; solid: string }> = {
  neutral: { surface: 'var(--color-surface-muted)', solid: 'var(--color-text-muted)' },
  accent: { surface: 'var(--color-accent-surface)', solid: 'var(--color-accent)' },
  success: { surface: 'var(--color-success-surface)', solid: 'var(--color-success)' },
  danger: { surface: 'var(--color-danger-surface)', solid: 'var(--color-danger)' },
  warning: { surface: 'var(--color-warning-surface)', solid: 'var(--color-warning)' },
  info: { surface: 'var(--color-info-surface)', solid: 'var(--color-info)' },
  tertiary: { surface: 'var(--color-tertiary-surface)', solid: 'var(--color-tertiary)' },
}

function toneForTitle(title: string | null): Tone {
  const t = title || ''
  if (!t) return 'neutral'
  let hash = 0
  for (let i = 0; i < t.length; i++) hash = (hash * 31 + t.charCodeAt(i)) | 0
  return TONES[Math.abs(hash) % TONES.length]
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '؟'
  if (parts.length === 1) return parts[0].slice(0, 2)
  return parts[0][0] + parts[1][0]
}

function managesText(count: number): string {
  if (count === 0) return 'لا يدير أحداً'
  if (count === 1) return 'يدير موظفاً واحداً'
  if (count === 2) return 'يدير موظفَين'
  if (count >= 3 && count <= 10) return `يدير ${count} موظفين`
  return `يدير ${count} موظف`
}

const ROOT_KEY = '__root__'

export default function OrgChart({ readOnly = false }: { readOnly?: boolean }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [assignFor, setAssignFor] = useState<Employee | null>(null)
  const [assignSearch, setAssignSearch] = useState('')
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => { loadEmployees() }, [])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if ((e.target as HTMLElement).closest('[data-orgchart-menu]')) return
      setMenuOpenId(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  async function loadEmployees() {
    setLoading(true)
    const { data } = await supabase
      .from('employees')
      .select('id,name,job_title,status,manager_id,org_sort_order,phone,hire_date,shift_type,work_location')
      .order('name')
    setEmployees((data as Employee[]) || [])
    setLoading(false)
  }

  const byId = useMemo(() => {
    const m = new Map<string, Employee>()
    employees.forEach(e => m.set(e.id, e))
    return m
  }, [employees])

  const childrenOf = useMemo(() => {
    const m = new Map<string, Employee[]>()
    employees.forEach(e => {
      const key = e.manager_id && byId.has(e.manager_id) ? e.manager_id : ROOT_KEY
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(e)
    })
    m.forEach(list => list.sort((a, b) => (a.org_sort_order ?? 0) - (b.org_sort_order ?? 0) || a.name.localeCompare(b.name, 'ar')))
    return m
  }, [employees, byId])

  const roots = childrenOf.get(ROOT_KEY) || []

  const ancestorsOf = useCallback((id: string): string[] => {
    const chain: string[] = []
    let cur = byId.get(id)
    while (cur && cur.manager_id && byId.has(cur.manager_id)) {
      chain.push(cur.manager_id)
      cur = byId.get(cur.manager_id)
    }
    return chain
  }, [byId])

  const descendantsOf = useCallback((id: string): Set<string> => {
    const result = new Set<string>()
    const stack = [id]
    while (stack.length) {
      const cur = stack.pop()!
      const kids = childrenOf.get(cur) || []
      kids.forEach(k => { if (!result.has(k.id)) { result.add(k.id); stack.push(k.id) } })
    }
    return result
  }, [childrenOf])

  function directReportsCount(id: string): number {
    return (childrenOf.get(id) || []).length
  }

  function toggleCollapse(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function expandAll() { setCollapsed(new Set()) }
  function collapseAll() {
    setCollapsed(new Set(employees.filter(e => directReportsCount(e.id) > 0).map(e => e.id)))
  }

  function focusEmployee(id: string) {
    const ancestors = ancestorsOf(id)
    setCollapsed(prev => {
      const next = new Set(prev)
      ancestors.forEach(a => next.delete(a))
      return next
    })
    setSelectedId(id)
    setSearchOpen(false)
    setSearch('')
    requestAnimationFrame(() => {
      nodeRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    })
  }

  const searchMatches = useMemo(() => {
    const q = search.trim()
    if (!q) return []
    return employees.filter(e => e.name.includes(q)).slice(0, 8)
  }, [employees, search])

  function wouldCreateCycle(employeeId: string, candidateManagerId: string): boolean {
    if (employeeId === candidateManagerId) return true
    return descendantsOf(employeeId).has(candidateManagerId)
  }

  async function assignManager(emp: Employee, managerId: string | null) {
    if (managerId && wouldCreateCycle(emp.id, managerId)) {
      alert(`لا يمكن تعيين هذا الموظف مديراً لـ${emp.name} — هذا سينشئ تبعية دائرية (هو أصلاً أحد مرؤوسيه)`)
      return
    }
    setSaving(true)
    const { error } = await supabase.from('employees').update({ manager_id: managerId }).eq('id', emp.id)
    if (error) { alert('خطأ: ' + error.message); setSaving(false); return }
    const managerName = managerId ? (byId.get(managerId)?.name || '') : 'بلا مدير — قمة الهرم'
    await logActivity('تعيين مدير بالهيكل التنظيمي', 'org_chart', `${emp.name} ← ${managerName}`)
    setAssignFor(null)
    setAssignSearch('')
    await loadEmployees()
    setSaving(false)
  }

  async function moveSibling(emp: Employee, direction: -1 | 1) {
    const key = emp.manager_id && byId.has(emp.manager_id) ? emp.manager_id : ROOT_KEY
    const siblings = childrenOf.get(key) || []
    const idx = siblings.findIndex(s => s.id === emp.id)
    const targetIdx = idx + direction
    if (idx < 0 || targetIdx < 0 || targetIdx >= siblings.length) return
    const target = siblings[targetIdx]
    setSaving(true)
    const normalized = siblings.map((s, i) => ({ id: s.id, order: i }))
    const tmp = normalized[idx].order
    normalized[idx].order = normalized[targetIdx].order
    normalized[targetIdx].order = tmp
    await Promise.all(normalized.map(u => supabase.from('employees').update({ org_sort_order: u.order }).eq('id', u.id)))
    await logActivity('إعادة ترتيب الهيكل التنظيمي', 'org_chart', `${emp.name} ↔ ${target.name}`)
    await loadEmployees()
    setSaving(false)
  }

  function renderNode(emp: Employee): ReactElement {
    const kids = childrenOf.get(emp.id) || []
    const key = emp.manager_id && byId.has(emp.manager_id) ? emp.manager_id : ROOT_KEY
    const siblings = childrenOf.get(key) || []
    const idx = siblings.findIndex(s => s.id === emp.id)
    const isCollapsed = collapsed.has(emp.id)
    return (
      <TreeNode key={emp.id} label={
        <NodeCard
          emp={emp}
          childCount={kids.length}
          hasChildren={kids.length > 0}
          isCollapsed={isCollapsed}
          isSelected={selectedId === emp.id}
          readOnly={readOnly}
          menuOpen={menuOpenId === emp.id}
          canMoveUp={idx > 0}
          canMoveDown={idx >= 0 && idx < siblings.length - 1}
          nodeRef={(el) => { nodeRefs.current[emp.id] = el }}
          onSelect={() => focusEmployee(emp.id)}
          onToggleCollapse={() => toggleCollapse(emp.id)}
          onToggleMenu={(e) => { e.stopPropagation(); setMenuOpenId(prev => prev === emp.id ? null : emp.id) }}
          onAssignManager={() => { setMenuOpenId(null); setAssignFor(emp) }}
          onMoveUp={() => { setMenuOpenId(null); moveSibling(emp, -1) }}
          onMoveDown={() => { setMenuOpenId(null); moveSibling(emp, 1) }}
        />
      }>
        {!isCollapsed && kids.map(k => renderNode(k))}
      </TreeNode>
    )
  }

  const selected = selectedId ? byId.get(selectedId) || null : null
  const selectedManager = selected?.manager_id ? byId.get(selected.manager_id) || null : null
  const selectedReports = selectedId ? (childrenOf.get(selectedId) || []) : []

  const assignExcluded = assignFor ? new Set([assignFor.id, ...descendantsOf(assignFor.id)]) : new Set<string>()
  const assignCandidates = assignFor
    ? employees.filter(e => !assignExcluded.has(e.id) && (!assignSearch.trim() || e.name.includes(assignSearch.trim())))
    : []

  return (
    <div style={{ position: 'relative' }}>
      <Card>
        <Card.Header
          title="الهيكل التنظيمي"
          count={employees.length}
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <Input
                  size="sm"
                  placeholder="ابحث باسم الموظف..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setSearchOpen(true) }}
                  onFocus={() => setSearchOpen(true)}
                  style={{ width: 220 }}
                />
                {searchOpen && searchMatches.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', insetInlineStart: 0, marginTop: 4, width: 240, zIndex: 20,
                    background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-md)', overflow: 'hidden'
                  }}>
                    {searchMatches.map(m => (
                      <div key={m.id}
                        onClick={() => focusEmployee(m.id)}
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-sunken)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <div style={{ fontWeight: 'var(--weight-semibold)' }}>{m.name}</div>
                        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>{m.job_title || '—'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Button variant="secondary" size="sm" onClick={expandAll}>فتح الكل</Button>
              <Button variant="secondary" size="sm" onClick={collapseAll}>طي الكل</Button>
            </div>
          }
        />
        <Card.Body style={{ overflow: 'auto', padding: 'var(--space-6)' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-muted)' }}>جارٍ التحميل...</div>
          ) : roots.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-muted)' }}>لا يوجد موظفون بعد</div>
          ) : (
            <div style={{ display: 'flex', gap: 'var(--space-8)', justifyContent: 'center', minWidth: 'min-content', direction: 'rtl' }}>
              {roots.map(root => (
                <Tree
                  key={root.id}
                  lineWidth="2px"
                  lineColor="var(--color-border-strong)"
                  lineBorderRadius="10px"
                  lineHeight="28px"
                  nodePadding="10px"
                  label={
                    <NodeCard
                      emp={root}
                      childCount={directReportsCount(root.id)}
                      hasChildren={directReportsCount(root.id) > 0}
                      isCollapsed={collapsed.has(root.id)}
                      isSelected={selectedId === root.id}
                      readOnly={readOnly}
                      menuOpen={menuOpenId === root.id}
                      canMoveUp={roots.findIndex(r => r.id === root.id) > 0}
                      canMoveDown={roots.findIndex(r => r.id === root.id) < roots.length - 1}
                      nodeRef={(el) => { nodeRefs.current[root.id] = el }}
                      onSelect={() => focusEmployee(root.id)}
                      onToggleCollapse={() => toggleCollapse(root.id)}
                      onToggleMenu={(e) => { e.stopPropagation(); setMenuOpenId(prev => prev === root.id ? null : root.id) }}
                      onAssignManager={() => { setMenuOpenId(null); setAssignFor(root) }}
                      onMoveUp={() => { setMenuOpenId(null); moveSibling(root, -1) }}
                      onMoveDown={() => { setMenuOpenId(null); moveSibling(root, 1) }}
                    />
                  }
                >
                  {!collapsed.has(root.id) && (childrenOf.get(root.id) || []).map(k => renderNode(k))}
                </Tree>
              ))}
            </div>
          )}
        </Card.Body>
      </Card>

      {/* لوحة تفاصيل الموظف */}
      {selected && (
        <motion.div
          initial={{ x: -360, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          style={{
            position: 'fixed', left: 0, top: 0, bottom: 0, width: 340, zIndex: 30,
            background: 'var(--color-surface)', boxShadow: 'var(--shadow-lg)', borderRight: '1px solid var(--color-border)',
            padding: 'var(--space-5)', overflowY: 'auto', direction: 'rtl'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
              <Avatar name={selected.name} tone={toneForTitle(selected.job_title)} size={44} />
              <div>
                <div style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-md)', color: 'var(--color-text)' }}>{selected.name}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{selected.job_title || '—'}</div>
              </div>
            </div>
            <button onClick={() => setSelectedId(null)} style={{
              background: 'var(--color-surface-muted)', border: 'none', borderRadius: 'var(--radius-md)', width: 28, height: 28,
              cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 'var(--text-md)', lineHeight: 1
            }}>×</button>
          </div>

          <DetailRow label="الحالة">
            <Badge tone={selected.status === 'active' ? 'success' : 'neutral'} size="sm">{selected.status === 'active' ? 'نشط' : 'غير نشط'}</Badge>
          </DetailRow>
          <DetailRow label="الهاتف">{selected.phone || '—'}</DetailRow>
          <DetailRow label="تاريخ التعيين">{selected.hire_date || '—'}</DetailRow>
          <DetailRow label="نظام الدوام">{selected.shift_type || '—'}</DetailRow>
          {selected.work_location && <DetailRow label="موقع العمل">{selected.work_location}</DetailRow>}

          <div style={{ marginTop: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>المدير المباشر</div>
            {selectedManager ? (
              <ClickableChip name={selectedManager.name} onClick={() => focusEmployee(selectedManager.id)} />
            ) : (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>بلا مدير — قمة الهرم</div>
            )}
          </div>

          <div style={{ marginTop: 'var(--space-4)' }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
              {managesText(selectedReports.length)}
            </div>
            {selectedReports.length === 0 ? (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>لا يوجد</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {selectedReports.map(r => <ClickableChip key={r.id} name={r.name} onClick={() => focusEmployee(r.id)} />)}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* نافذة تعيين المدير الأعلى */}
      {assignFor && (
        <div
          onClick={() => { setAssignFor(null); setAssignSearch('') }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,var(--opacity-backdrop))', zIndex: 40,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{ width: 380, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <Card>
              <Card.Header title={`تعيين المدير الأعلى لـ${assignFor.name}`} />
              <Card.Body style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxHeight: '60vh', overflow: 'hidden' }}>
                <Input size="sm" placeholder="ابحث عن موظف..." value={assignSearch} onChange={e => setAssignSearch(e.target.value)} autoFocus />
                <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <button
                    onClick={() => assignManager(assignFor, null)}
                    disabled={saving || !assignFor.manager_id}
                    style={optionBtnStyle(!assignFor.manager_id)}
                  >
                    بلا مدير — قمة الهرم
                  </button>
                  {assignCandidates.map(c => (
                    <button key={c.id} onClick={() => assignManager(assignFor, c.id)} disabled={saving} style={optionBtnStyle(assignFor.manager_id === c.id)}>
                      <span style={{ fontWeight: 'var(--weight-semibold)' }}>{c.name}</span>
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-2xs)' }}> — {c.job_title || '—'}</span>
                    </button>
                  ))}
                  {assignCandidates.length === 0 && (
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', padding: 'var(--space-3)', textAlign: 'center' }}>لا توجد نتائج</div>
                  )}
                </div>
              </Card.Body>
              <Card.Footer>
                <Button variant="secondary" size="sm" onClick={() => { setAssignFor(null); setAssignSearch('') }}>إلغاء</Button>
              </Card.Footer>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function optionBtnStyle(active: boolean): React.CSSProperties {
  return {
    textAlign: 'right', padding: '8px 12px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
    border: active ? '1px solid var(--color-accent-border)' : '1px solid transparent',
    background: active ? 'var(--color-accent-surface)' : 'transparent',
    fontSize: 'var(--text-sm)', color: 'var(--color-text)', fontFamily: 'var(--font-sans)'
  }
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 'var(--text-sm)' }}>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--color-text)', fontWeight: 'var(--weight-medium)' }}>{children}</span>
    </div>
  )
}

function ClickableChip({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{
      cursor: 'pointer', padding: '6px 10px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-sunken)',
      fontSize: 'var(--text-sm)', color: 'var(--color-text)', fontWeight: 'var(--weight-medium)'
    }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-muted)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-surface-sunken)')}>
      {name}
    </div>
  )
}

function Avatar({ name, tone, size = 40 }: { name: string; tone: Tone; size?: number }) {
  const v = TONE_VARS[tone]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: v.surface, color: v.solid,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'var(--weight-bold)',
      fontSize: size * 0.36, flexShrink: 0, border: `2px solid ${v.solid}`
    }}>
      {initials(name)}
    </div>
  )
}

function NodeCard({
  emp, childCount, hasChildren, isCollapsed, isSelected, readOnly, menuOpen,
  canMoveUp, canMoveDown, nodeRef, onSelect, onToggleCollapse, onToggleMenu, onAssignManager, onMoveUp, onMoveDown
}: {
  emp: Employee
  childCount: number
  hasChildren: boolean
  isCollapsed: boolean
  isSelected: boolean
  readOnly: boolean
  menuOpen: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  nodeRef: (el: HTMLDivElement | null) => void
  onSelect: () => void
  onToggleCollapse: () => void
  onToggleMenu: (e: React.MouseEvent) => void
  onAssignManager: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const tone = toneForTitle(emp.job_title)
  const v = TONE_VARS[tone]
  const inactive = emp.status !== 'active'

  return (
    <motion.div
      ref={nodeRef}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{
        position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        width: 190, padding: '12px 10px 10px', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface)',
        borderInlineStart: `1px solid ${isSelected ? v.solid : 'var(--color-border)'}`,
        borderInlineEnd: `1px solid ${isSelected ? v.solid : 'var(--color-border)'}`,
        borderBottom: `1px solid ${isSelected ? v.solid : 'var(--color-border)'}`,
        borderTop: `3px solid ${v.solid}`,
        boxShadow: isSelected ? '0 0 0 3px ' + v.surface : 'var(--shadow-sm)',
        cursor: 'pointer', opacity: inactive ? 0.65 : 1
      }}
      onClick={onSelect}
    >
      <Avatar name={emp.name} tone={tone} size={40} />
      <div style={{ marginTop: 6, fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-sm)', color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
        {emp.name}
      </div>
      <div style={{ marginTop: 4 }}>
        <Badge tone={tone} size="sm">{emp.job_title || '—'}</Badge>
      </div>
      <div style={{ marginTop: 6, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        {inactive && <Badge tone="neutral" size="sm">غير نشط</Badge>}
        {hasChildren && <Badge tone="neutral" size="sm">{managesText(childCount)}</Badge>}
      </div>

      <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4 }}>
        {hasChildren && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleCollapse() }}
            title={isCollapsed ? 'فتح الفرع' : 'طي الفرع'}
            style={{
              width: 24, height: 24, borderRadius: '50%', border: '1px solid var(--color-border-strong)',
              background: 'var(--color-surface)', color: 'var(--color-text-secondary)', cursor: 'pointer',
              fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-xs)'
            }}
          >
            {isCollapsed ? '+' : '−'}
          </button>
        )}
      </div>

      {!readOnly && (
        <div data-orgchart-menu style={{ position: 'absolute', top: 4, insetInlineEnd: 4 }}>
          <button
            onClick={onToggleMenu}
            title="إجراءات"
            style={{
              width: 22, height: 22, border: 'none', background: 'transparent', color: 'var(--color-text-muted)',
              cursor: 'pointer', fontSize: 14, borderRadius: 'var(--radius-sm)', lineHeight: 1
            }}
          >
            ⋮
          </button>
          {menuOpen && (
            <div
              onClick={e => e.stopPropagation()}
              style={{
                position: 'absolute', top: 24, insetInlineEnd: 0, width: 170, background: 'var(--color-surface)',
                border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
                zIndex: 20, overflow: 'hidden', textAlign: 'start'
              }}
            >
              <MenuItem onClick={onAssignManager}>تعيين المدير الأعلى</MenuItem>
              <MenuItem onClick={onMoveUp} disabled={!canMoveUp}>نقل لأعلى</MenuItem>
              <MenuItem onClick={onMoveDown} disabled={!canMoveDown}>نقل لأسفل</MenuItem>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}

function MenuItem({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'block', width: '100%', padding: '8px 12px', border: 'none', background: 'transparent',
        color: disabled ? 'var(--color-text-faint)' : 'var(--color-text)', fontSize: 'var(--text-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)'
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'var(--color-surface-sunken)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {children}
    </button>
  )
}
