// نظام الصلاحيات المرن — لكل مستخدم صلاحية مستقلة لكل قسم (none / read / edit)
// الأدوار (role) تبقى كقوالب تعبئة سريعة فقط؛ resolvePermissions يقرر السلوك الفعلي

export type PermLevel = 'none' | 'read' | 'edit'
export type Permissions = Record<string, PermLevel>

export const SECTIONS: { id: string; label: string }[] = [
  { id: 'dashboard', label: 'لوحة المعلومات' },
  { id: 'employees', label: 'الموظفين' },
  { id: 'org_chart', label: 'الهيكل التنظيمي' },
  { id: 'attendance', label: 'الحضور' },
  { id: 'overtime', label: 'الأوفرتايم' },
  { id: 'payroll', label: 'الرواتب' },
  { id: 'documents', label: 'الكتب الرسمية' },
  { id: 'custody', label: 'العهد المالية' },
  { id: 'contracts', label: 'العقود' },
  { id: 'recruitment', label: 'التوظيف' },
  { id: 'fingerprint', label: 'تقارير البصمة' },
  { id: 'finance', label: 'الحسابات' },
  { id: 'visa', label: 'التأشيرات' },
  { id: 'tasks', label: 'المهام' },
  { id: 'reports', label: 'التقارير السنوية' },
]

// أقسام تُتحقق من role === 'editor' حصراً ولا تدخل نظام الصلاحيات إطلاقاً
export const EDITOR_ONLY = ['activity_log', 'users', 'backup']

function allSectionsAt(level: PermLevel): Permissions {
  const p: Permissions = {}
  SECTIONS.forEach(s => { p[s.id] = level })
  return p
}

export const PRESETS: Record<string, Permissions> = {
  editor: allSectionsAt('edit'),
  // استثناء: المدير يحتفظ بقدرته الحالية على إنشاء/تكليف المهام رغم أن باقي الأقسام قراءة فقط
  admin: { ...allSectionsAt('read'), tasks: 'edit' },
  accountant: { ...allSectionsAt('none'), finance: 'edit', tasks: 'edit' },
  guest_1: allSectionsAt('read'),
  guest_2: allSectionsAt('read'),
}

// إذا كان permissions فارغاً (null أو بلا مفاتيح) يُعاد قالب الدور — يضمن عمل المستخدمين الحاليين بلا أي تغيير سلوكي
export function resolvePermissions(role: string | null, permissions: Permissions | null | undefined): Permissions {
  if (permissions && Object.keys(permissions).length > 0) return permissions
  if (role && PRESETS[role]) return PRESETS[role]
  return allSectionsAt('none')
}

export function canView(perms: Permissions, section: string): boolean {
  const level = perms[section]
  return level === 'read' || level === 'edit'
}

export function canEdit(perms: Permissions, section: string): boolean {
  return perms[section] === 'edit'
}
