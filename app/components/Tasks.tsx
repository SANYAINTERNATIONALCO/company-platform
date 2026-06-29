'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

interface Task {
  id: string
  title: string
  description: string
  created_by: string
  created_by_name: string
  assigned_to: string
  assigned_to_name: string
  priority: string
  status: string
  due_date: string | null
  is_seen: boolean
  created_at: string
  completed_at: string | null
}

interface AssignableUser {
  id: string
  email: string
  role: string
  displayName: string
}

const roleLabel: Record<string,string> = { editor: 'محرر (مدير الموارد البشرية)', admin: 'مدير', accountant: 'محاسب' }
const priorityInfo: Record<string,{label:string,bg:string,color:string}> = {
  normal: { label: 'عادية', bg: '#f3f4f6', color: '#374151' },
  important: { label: 'مهمة', bg: '#fef9c3', color: '#b45309' },
  urgent: { label: 'عاجلة', bg: '#fee2e2', color: '#dc2626' },
}
const statusInfo: Record<string,{label:string,bg:string,color:string}> = {
  pending: { label: 'معلقة', bg: '#f3f4f6', color: '#6b7280' },
  in_progress: { label: 'قيد التنفيذ', bg: '#dbeafe', color: '#1d4ed8' },
  completed: { label: 'مكتملة', bg: '#dcfce7', color: '#15803d' },
}

export default function Tasks({ currentUserId, currentUserRole, currentUserEmail }: { currentUserId: string; currentUserRole: string; currentUserEmail: string }) {
  const [activeTab, setActiveTab] = useState<'my' | 'created' | 'all'>('my')
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [createdTasks, setCreatedTasks] = useState<Task[]>([])
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [allUsers, setAllUsers] = useState<AssignableUser[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [form, setForm] = useState({ title: '', description: '', assigned_to: '', priority: 'normal', due_date: '' })

  useEffect(() => {
    loadAllUsers()
    loadMyTasks()
    loadCreatedTasks()
    loadAllTasks()
  }, [])

  async function loadAllUsers() {
    // قائمة المستخدمين معروفة مسبقاً (3 أدوار فقط في المنصة)
    const knownUsers: AssignableUser[] = [
      { id: '3a216261-8365-45eb-b5e8-0b80d62a0548', email: 'site.manager@sanyacement.com', role: 'admin', displayName: 'مدير الموقع' },
      { id: 'cf49f69b-15d1-47cb-8aed-1a682f76b46d', email: 'hr@sanyacement.com', role: 'editor', displayName: 'مدير الموارد البشرية' },
      { id: '3949f2ac-9312-4acb-91e7-cc8447654c90', email: 'husseinsattar651@gmail.com', role: 'accountant', displayName: 'المحاسب' },
    ]
    setAllUsers(knownUsers)
  }

  async function loadMyTasks() {
    setLoading(true)
    const { data } = await supabase.from('tasks').select('*').eq('assigned_to', currentUserId).order('created_at', { ascending: false })
    setMyTasks((data as Task[]) || [])
    setLoading(false)
  }

  async function loadCreatedTasks() {
    const { data } = await supabase.from('tasks').select('*').eq('created_by', currentUserId).order('created_at', { ascending: false })
    setCreatedTasks((data as Task[]) || [])
  }

  async function loadAllTasks() {
    const { data } = await supabase.from('tasks').select('*').order('created_at', { ascending: false })
    setAllTasks((data as Task[]) || [])
  }

  // من يقدر هذا المستخدم يكلّف حسب الهرمية
  const assignableUsers = useMemo(() => {
    if (currentUserRole === 'admin') return allUsers.filter(u => u.id !== currentUserId)
    if (currentUserRole === 'editor') return allUsers.filter(u => u.role === 'accountant')
    return [] // المحاسب لا يكلّف أحداً
  }, [allUsers, currentUserRole, currentUserId])

  const canCreateTasks = assignableUsers.length > 0
  const canSeeAll = currentUserRole === 'editor' || currentUserRole === 'admin'

  async function createTask() {
    if (!form.title || !form.assigned_to) { alert('يرجى تعبئة العنوان وتحديد الشخص المكلَّف'); return }
    setLoading(true)
    const assignee = allUsers.find(u => u.id === form.assigned_to)
    const { error } = await supabase.from('tasks').insert([{
      title: form.title,
      description: form.description,
      created_by: currentUserId,
      created_by_name: roleLabel[currentUserRole] || currentUserEmail,
      assigned_to: form.assigned_to,
      assigned_to_name: assignee?.displayName || '',
      priority: form.priority,
      due_date: form.due_date || null,
      status: 'pending',
      is_seen: false
    }])
    if (error) alert('خطأ: ' + error.message)
    else {
      setForm({ title: '', description: '', assigned_to: '', priority: 'normal', due_date: '' })
      setShowForm(false)
      loadCreatedTasks()
      loadAllTasks()
    }
    setLoading(false)
  }

  async function updateTaskStatus(taskId: string, status: string) {
    const updates: any = { status, is_seen: true }
    if (status === 'completed') updates.completed_at = new Date().toISOString()
    await supabase.from('tasks').update(updates).eq('id', taskId)
    loadMyTasks()
    loadAllTasks()
  }

  async function markAsSeen(taskId: string) {
    await supabase.from('tasks').update({ is_seen: true }).eq('id', taskId)
    loadMyTasks()
    loadAllTasks()
  }

  async function deleteTask(taskId: string) {
    if (!confirm('هل أنت متأكد من حذف هذه المهمة؟')) return
    await supabase.from('tasks').delete().eq('id', taskId)
    loadCreatedTasks()
    loadAllTasks()
  }

  const filteredMyTasks = useMemo(() => {
    if (!statusFilter) return myTasks
    return myTasks.filter(t => t.status === statusFilter)
  }, [myTasks, statusFilter])

  function isOverdue(task: Task) {
    if (!task.due_date || task.status === 'completed') return false
    return new Date(task.due_date) < new Date(new Date().toDateString())
  }

  function formatDate(d: string | null) { return d ? new Date(d).toLocaleDateString('ar-IQ') : '—' }

  const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, border:'2px solid #d1d5db', fontSize:13, boxSizing:'border-box' as const, color:'#111827', background:'#fff', marginBottom:10 }

  return (
    <div style={{margin:'24px',fontFamily:'system-ui',direction:'rtl'}}>

      {/* تبويبات */}
      <div style={{display:'flex',gap:6,marginBottom:16,background:'#e5e7eb',padding:4,borderRadius:10,width:'fit-content'}}>
        <button onClick={()=>setActiveTab('my')}
          style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
            background:activeTab==='my'?'#fff':'transparent',color:activeTab==='my'?'#1e40af':'#6b7280',
            boxShadow:activeTab==='my'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
          مهامي
          {myTasks.filter(t=>!t.is_seen).length > 0 && (
            <span style={{marginRight:6,background:'#dc2626',color:'#fff',borderRadius:20,padding:'1px 7px',fontSize:11,fontWeight:700}}>
              {myTasks.filter(t=>!t.is_seen).length}
            </span>
          )}
        </button>
        {canCreateTasks && (
          <button onClick={()=>setActiveTab('created')}
            style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
              background:activeTab==='created'?'#fff':'transparent',color:activeTab==='created'?'#1e40af':'#6b7280',
              boxShadow:activeTab==='created'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
            المهام التي أنشأتها
          </button>
        )}
        {canSeeAll && (
          <button onClick={()=>setActiveTab('all')}
            style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
              background:activeTab==='all'?'#fff':'transparent',color:activeTab==='all'?'#1e40af':'#6b7280',
              boxShadow:activeTab==='all'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
            كل المهام في النظام
          </button>
        )}
      </div>

      {/* تبويب مهامي */}
      {activeTab === 'my' && (
        <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
          <div style={{padding:'14px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <h2 style={{margin:0,fontSize:16,fontWeight:700,color:'#111827'}}>المهام الموجَّهة إليّ</h2>
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
              style={{padding:'7px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:12,color:'#374151',background:'#fff',marginRight:'auto'}}>
              <option value="">كل الحالات</option>
              <option value="pending">معلقة</option>
              <option value="in_progress">قيد التنفيذ</option>
              <option value="completed">مكتملة</option>
            </select>
          </div>
          {loading ? (
            <div style={{textAlign:'center',padding:'3rem',color:'#6b7280'}}>جارٍ التحميل...</div>
          ) : filteredMyTasks.length === 0 ? (
            <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لا توجد مهام</div>
          ) : (
            <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:12}}>
              {filteredMyTasks.map(task => {
                const pInfo = priorityInfo[task.priority]
                const sInfo = statusInfo[task.status]
                const overdue = isOverdue(task)
                return (
                  <div key={task.id} onClick={()=>!task.is_seen && markAsSeen(task.id)}
                    style={{border: !task.is_seen ? '2px solid #93c5fd' : '1px solid #e5e7eb', borderRadius:10, padding:'14px 16px', background: !task.is_seen ? '#eff6ff' : '#fff'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10,marginBottom:8,flexWrap:'wrap'}}>
                      <div>
                        <div style={{fontSize:15,fontWeight:700,color:'#111827',marginBottom:4}}>
                          {!task.is_seen && <span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:'#2563eb',marginLeft:6}}></span>}
                          {task.title}
                        </div>
                        <div style={{fontSize:12,color:'#6b7280'}}>من: {task.created_by_name} — {formatDate(task.created_at)}</div>
                      </div>
                      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                        <span style={{background:pInfo.bg,color:pInfo.color,padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600}}>{pInfo.label}</span>
                        <span style={{background:sInfo.bg,color:sInfo.color,padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600}}>{sInfo.label}</span>
                        {overdue && <span style={{background:'#fee2e2',color:'#dc2626',padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700}}>متأخرة</span>}
                      </div>
                    </div>
                    {task.description && <div style={{fontSize:13,color:'#374151',marginBottom:8,lineHeight:1.6}}>{task.description}</div>}
                    {task.due_date && <div style={{fontSize:12,color:'#6b7280',marginBottom:10}}>تاريخ الاستحقاق: {formatDate(task.due_date)}</div>}
                    {task.status !== 'completed' && (
                      <div style={{display:'flex',gap:8}} onClick={e=>e.stopPropagation()}>
                        {task.status === 'pending' && (
                          <button onClick={()=>updateTaskStatus(task.id,'in_progress')}
                            style={{background:'#dbeafe',color:'#1d4ed8',border:'none',borderRadius:6,padding:'6px 14px',cursor:'pointer',fontSize:12,fontWeight:600}}>
                            بدء التنفيذ
                          </button>
                        )}
                        <button onClick={()=>updateTaskStatus(task.id,'completed')}
                          style={{background:'#dcfce7',color:'#15803d',border:'none',borderRadius:6,padding:'6px 14px',cursor:'pointer',fontSize:12,fontWeight:600}}>
                          تحديد كمكتملة
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* تبويب المهام التي أنشأتها */}
      {activeTab === 'created' && canCreateTasks && (
        <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
          <div style={{padding:'14px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <h2 style={{margin:0,fontSize:16,fontWeight:700,color:'#111827'}}>المهام التي أنشأتها</h2>
            <button onClick={()=>setShowForm(!showForm)}
              style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:14,fontWeight:600}}>
              {showForm ? 'إلغاء' : '+ مهمة جديدة'}
            </button>
          </div>

          {showForm && (
            <div style={{padding:'20px',borderBottom:'2px solid #e5e7eb',background:'#f9fafb'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,maxWidth:600}}>
                <div style={{gridColumn:'span 2'}}>
                  <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>عنوان المهمة *</label>
                  <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} style={inputStyle}/>
                </div>
                <div style={{gridColumn:'span 2'}}>
                  <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>التفاصيل</label>
                  <input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={inputStyle}/>
                </div>
                <div>
                  <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>إلى *</label>
                  <select value={form.assigned_to} onChange={e=>setForm({...form,assigned_to:e.target.value})} style={inputStyle}>
                    <option value="">اختر الشخص...</option>
                    {assignableUsers.map(u => <option key={u.id} value={u.id}>{u.displayName} ({roleLabel[u.role]})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>الأولوية</label>
                  <select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})} style={inputStyle}>
                    <option value="normal">عادية</option>
                    <option value="important">مهمة</option>
                    <option value="urgent">عاجلة</option>
                  </select>
                </div>
                <div>
                  <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>تاريخ الاستحقاق (اختياري)</label>
                  <input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} style={inputStyle}/>
                </div>
              </div>
              <button onClick={createTask} disabled={loading}
                style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontSize:14,fontWeight:600}}>
                {loading ? 'جارٍ الإنشاء...' : 'إنشاء المهمة'}
              </button>
            </div>
          )}

          {createdTasks.length === 0 ? (
            <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لم تُنشئ أي مهمة بعد</div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead>
                  <tr style={{background:'#f3f4f6'}}>
                    {['العنوان','إلى','الأولوية','الحالة','تاريخ الاستحقاق','تاريخ الإنشاء',''].map(h=>(
                      <th key={h} style={{padding:'10px 14px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {createdTasks.map(task => {
                    const pInfo = priorityInfo[task.priority]
                    const sInfo = statusInfo[task.status]
                    return (
                      <tr key={task.id} style={{borderBottom:'1px solid #e5e7eb'}}>
                        <td style={{padding:'10px 14px',fontWeight:600,color:'#111827'}}>{task.title}</td>
                        <td style={{padding:'10px 14px',color:'#6b7280'}}>{task.assigned_to_name}</td>
                        <td style={{padding:'10px 14px'}}><span style={{background:pInfo.bg,color:pInfo.color,padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600}}>{pInfo.label}</span></td>
                        <td style={{padding:'10px 14px'}}><span style={{background:sInfo.bg,color:sInfo.color,padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600}}>{sInfo.label}</span></td>
                        <td style={{padding:'10px 14px',color:'#6b7280'}}>{formatDate(task.due_date)}</td>
                        <td style={{padding:'10px 14px',color:'#6b7280',fontSize:12}}>{formatDate(task.created_at)}</td>
                        <td style={{padding:'10px 14px'}}>
                          <button onClick={()=>deleteTask(task.id)}
                            style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:11,fontWeight:600}}>
                            حذف
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* تبويب كل المهام في النظام */}
      {activeTab === 'all' && canSeeAll && (
        <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
          <div style={{padding:'14px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb'}}>
            <h2 style={{margin:0,fontSize:16,fontWeight:700,color:'#111827'}}>كل المهام في النظام ({allTasks.length})</h2>
          </div>
          {allTasks.length === 0 ? (
            <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لا توجد أي مهام في النظام</div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead>
                  <tr style={{background:'#f3f4f6'}}>
                    {['العنوان','من','إلى','الأولوية','الحالة','تاريخ الاستحقاق','تاريخ الإنشاء',''].map(h=>(
                      <th key={h} style={{padding:'10px 14px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allTasks.map(task => {
                    const pInfo = priorityInfo[task.priority]
                    const sInfo = statusInfo[task.status]
                    const overdue = isOverdue(task)
                    return (
                      <tr key={task.id} style={{borderBottom:'1px solid #e5e7eb'}}>
                        <td style={{padding:'10px 14px',fontWeight:600,color:'#111827'}}>{task.title}</td>
                        <td style={{padding:'10px 14px',color:'#6b7280'}}>{task.created_by_name}</td>
                        <td style={{padding:'10px 14px',color:'#6b7280'}}>{task.assigned_to_name}</td>
                        <td style={{padding:'10px 14px'}}><span style={{background:pInfo.bg,color:pInfo.color,padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600}}>{pInfo.label}</span></td>
                        <td style={{padding:'10px 14px'}}>
                          <span style={{background:sInfo.bg,color:sInfo.color,padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600}}>{sInfo.label}</span>
                          {overdue && <span style={{marginRight:6,background:'#fee2e2',color:'#dc2626',padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700}}>متأخرة</span>}
                        </td>
                        <td style={{padding:'10px 14px',color:'#6b7280'}}>{formatDate(task.due_date)}</td>
                        <td style={{padding:'10px 14px',color:'#6b7280',fontSize:12}}>{formatDate(task.created_at)}</td>
                        <td style={{padding:'10px 14px'}}>
                          {task.created_by === currentUserId && (
                            <button onClick={()=>deleteTask(task.id)}
                              style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:11,fontWeight:600}}>
                              حذف
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
