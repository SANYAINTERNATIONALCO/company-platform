import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

export async function logActivity(
  action: string,
  section: string,
  details: string = ''
) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single()
    await supabase.from('activity_log').insert([{
      user_email: user.email || '',
      user_role: roleData?.role || '',
      action,
      section,
      details
    }])
  } catch {
    // لا نوقف التطبيق إذا فشل التسجيل
  }
}
