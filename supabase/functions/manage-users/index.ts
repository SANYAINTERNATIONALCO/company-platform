// Edge Function: manage-users
// عمليات إدارة المستخدمين التي تتطلب مفتاح service_role (لا يمكن تنفيذها من العميل بالمفتاح anon):
// list (سرد auth.users مدموجاً مع user_roles) / create (إنشاء حساب auth + صف user_roles) /
// update_password / delete. أي تعديل آخر (الصلاحيات، الدور، الاسم المعروض، is_active) يتم مباشرة
// من العميل عبر جدول user_roles لأنه لا يحتاج صلاحيات إدارية.
//
// الأمان: كل طلب يُتحقق من هويته عبر JWT المرسل بهيدر Authorization، ثم يُتحقق أن role الخاص به
// في user_roles يساوي 'editor' حصراً — وإلا يُرفض بـ403. مفتاح SUPABASE_SERVICE_ROLE_KEY يُقرأ فقط
// من متغيرات البيئة التي يوفرها Supabase تلقائياً لكل Edge Function، ولا يُكتب في الكود ولا يُرسل للعميل.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'الطريقة غير مدعومة' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'إعداد الخادم غير مكتمل' }, 500)
  }
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ===== التحقق من الهوية والصلاحية =====
  const authHeader = req.headers.get('Authorization') || ''
  const jwt = authHeader.replace('Bearer ', '').trim()
  if (!jwt) return jsonResponse({ error: 'يجب تسجيل الدخول' }, 401)

  const { data: authData, error: authErr } = await adminClient.auth.getUser(jwt)
  if (authErr || !authData?.user) return jsonResponse({ error: 'جلسة غير صالحة — يرجى تسجيل الدخول مجدداً' }, 401)
  const callerId = authData.user.id

  const { data: callerRoleRow, error: callerRoleErr } = await adminClient
    .from('user_roles').select('role').eq('user_id', callerId).single()
  if (callerRoleErr || !callerRoleRow || callerRoleRow.role !== 'editor') {
    return jsonResponse({ error: 'ليست لديك صلاحية الوصول لإدارة المستخدمين' }, 403)
  }

  // ===== جسم الطلب =====
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return jsonResponse({ error: 'طلب غير صالح' }, 400) }
  const action = body.action as string

  try {
    if (action === 'list') {
      const { data: listData, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
      if (error) return jsonResponse({ error: 'تعذر جلب قائمة المستخدمين: ' + error.message }, 500)

      const { data: roles } = await adminClient.from('user_roles').select('*')
      const rolesByUserId = new Map((roles || []).map((r: Record<string, unknown>) => [r.user_id as string, r]))

      const users = listData.users.map(u => {
        const r = rolesByUserId.get(u.id) as Record<string, unknown> | undefined
        return {
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          role: r?.role ?? null,
          display_name: r?.display_name ?? null,
          permissions: r?.permissions ?? null,
          is_active: r?.is_active ?? true,
        }
      })
      return jsonResponse({ users })
    }

    if (action === 'create') {
      const email = String(body.email || '').trim()
      const password = String(body.password || '')
      const display_name = body.display_name ? String(body.display_name) : null
      const role = body.role ? String(body.role) : 'guest_1'
      const permissions = body.permissions ?? null

      if (!email || !password) return jsonResponse({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' }, 400)
      if (password.length < 6) return jsonResponse({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, 400)

      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email, password, email_confirm: true,
      })
      if (createErr || !created?.user) {
        return jsonResponse({ error: 'تعذر إنشاء المستخدم: ' + (createErr?.message || 'خطأ غير معروف') }, 400)
      }

      const { error: insertErr } = await adminClient.from('user_roles').insert([{
        user_id: created.user.id, role, display_name, permissions, is_active: true,
      }])
      if (insertErr) {
        // تراجع لمنع بقاء حساب دخول بلا صف صلاحيات (مستخدم يتيم)
        await adminClient.auth.admin.deleteUser(created.user.id)
        return jsonResponse({ error: 'تعذر حفظ بيانات الصلاحيات: ' + insertErr.message }, 500)
      }

      return jsonResponse({ user: { id: created.user.id, email: created.user.email } })
    }

    if (action === 'update_password') {
      const user_id = String(body.user_id || '')
      const password = String(body.password || '')
      if (!user_id || !password) return jsonResponse({ error: 'بيانات ناقصة' }, 400)
      if (password.length < 6) return jsonResponse({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, 400)

      const { error } = await adminClient.auth.admin.updateUserById(user_id, { password })
      if (error) return jsonResponse({ error: 'تعذر تغيير كلمة المرور: ' + error.message }, 500)
      return jsonResponse({ success: true })
    }

    if (action === 'delete') {
      const user_id = String(body.user_id || '')
      if (!user_id) return jsonResponse({ error: 'بيانات ناقصة' }, 400)

      await adminClient.from('user_roles').delete().eq('user_id', user_id)
      const { error } = await adminClient.auth.admin.deleteUser(user_id)
      if (error) return jsonResponse({ error: 'تعذر حذف المستخدم: ' + error.message }, 500)
      return jsonResponse({ success: true })
    }

    return jsonResponse({ error: 'عملية غير معروفة' }, 400)
  } catch (e) {
    return jsonResponse({ error: 'خطأ غير متوقع: ' + (e instanceof Error ? e.message : String(e)) }, 500)
  }
})
