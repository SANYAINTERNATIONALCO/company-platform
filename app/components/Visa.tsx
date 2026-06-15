'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

interface VisaStat {
  id: string
  category: string
  nationality: string
  count: number
}

interface VisaFile {
  id: string
  category: string
  nationality: string
  file_name: string
  file_url: string
  uploaded_at: string
}

interface TouristVisa {
  id: string
  full_name: string
  nationality: string
  entry_date: string
  visa_duration: number
  expiry_date: string
  status: string
  notes: string
}

const categories = [
  { key: 'total', label: 'إجمالي الأجانب', icon: '👥', color: '#1e40af', bg: '#dbeafe' },
  { key: 'multiple_visa', label: 'حاصلون على فيزا متعددة', icon: '✅', color: '#15803d', bg: '#dcfce7' },
  { key: 'applied_multiple', label: 'مقدمون على فيزا متعددة', icon: '📋', color: '#b45309', bg: '#fef9c3' },
  { key: 'violators', label: 'مخالفون', icon: '⚠️', color: '#dc2626', bg: '#fee2e2' },
]

const nationalities = [
  { key: 'chinese', label: 'صينيين', flag: '🇨🇳' },
  { key: 'pakistani', label: 'باكستانيين', flag: '🇵🇰' },
]

export default function Visa({ readOnly = false }: { readOnly?: boolean }) {
  const [activeTab, setActiveTab] = useState<'stats' | 'tourist'>('stats')
  const [stats, setStats] = useState<VisaStat[]>([])
  const [files, setFiles] = useState<VisaFile[]>([])
  const [loading, setLoading] = useState(false)
  const [editMode, setEditMode] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, number>>({})
  const [uploading, setUploading] = useState<string | null>(null)

  // Tourist visa states
  const [touristVisas, setTouristVisas] = useState<TouristVisa[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [touristForm, setTouristForm] = useState({ full_name: '', nationality: '', entry_date: '', visa_duration: '30' })
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [todayStr, setTodayStr] = useState('')

  useEffect(() => {
    const t = new Date().toISOString().split('T')[0]
    setTodayStr(t)
    loadStats()
    loadFiles()
    loadTouristVisas()
  }, [])

  async function loadStats() {
    setLoading(true)
    const { data } = await supabase.from('visa_stats').select('*')
    setStats((data as VisaStat[]) || [])
    setLoading(false)
  }

  async function loadFiles() {
    const { data } = await supabase.from('visa_files').select('*').order('uploaded_at', { ascending: false })
    setFiles((data as VisaFile[]) || [])
  }

  async function loadTouristVisas() {
    const { data } = await supabase.from('tourist_visas').select('*').order('expiry_date', { ascending: true })
    const visas = (data as TouristVisa[]) || []
    // تحديث الحالة تلقائياً
    const today = new Date()
    today.setHours(0,0,0,0)
    for (const visa of visas) {
      const expiry = new Date(visa.expiry_date)
      expiry.setHours(0,0,0,0)
      const shouldBeViolator = expiry < today
      if (shouldBeViolator && visa.status !== 'violated') {
        await supabase.from('tourist_visas').update({ status: 'violated' }).eq('id', visa.id)
      }
    }
    const { data: updated } = await supabase.from('tourist_visas').select('*').order('expiry_date', { ascending: true })
    setTouristVisas((updated as TouristVisa[]) || [])
  }

  function getDaysRemaining(expiryDate: string): number {
    const today = new Date()
    today.setHours(0,0,0,0)
    const expiry = new Date(expiryDate)
    expiry.setHours(0,0,0,0)
    return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  function getVisaStatus(visa: TouristVisa) {
    if (visa.status === 'violated') return { label: 'مخالف', bg: '#fee2e2', color: '#dc2626', icon: '🚨' }
    const days = getDaysRemaining(visa.expiry_date)
    if (days <= 0) return { label: 'منتهية', bg: '#fee2e2', color: '#dc2626', icon: '🚨' }
    if (days <= 7) return { label: `${days} أيام ⚠️`, bg: '#fef9c3', color: '#b45309', icon: '⚠️' }
    return { label: `${days} يوم`, bg: '#dcfce7', color: '#15803d', icon: '✅' }
  }

  const violatedCount = touristVisas.filter(v => v.status === 'violated' || getDaysRemaining(v.expiry_date) <= 0).length
  const warningCount = touristVisas.filter(v => v.status !== 'violated' && getDaysRemaining(v.expiry_date) > 0 && getDaysRemaining(v.expiry_date) <= 7).length

  async function addTouristVisa() {
    if (!touristForm.full_name || !touristForm.entry_date) { alert('يرجى تعبئة الاسم وتاريخ الدخول'); return }
    setLoading(true)
    const { error } = await supabase.from('tourist_visas').insert([{
      full_name: touristForm.full_name,
      nationality: touristForm.nationality,
      entry_date: touristForm.entry_date,
      visa_duration: parseInt(touristForm.visa_duration),
      status: 'active'
    }])
    if (error) alert('خطأ: ' + error.message)
    else {
      setTouristForm({ full_name: '', nationality: '', entry_date: '', visa_duration: '30' })
      setShowAddForm(false)
      loadTouristVisas()
    }
    setLoading(false)
  }

  async function deleteTouristVisa(id: string) {
    if (!confirm('هل أنت متأكد من الحذف؟')) return
    await supabase.from('tourist_visas').delete().eq('id', id)
    loadTouristVisas()
  }

  async function saveNote(id: string) {
    await supabase.from('tourist_visas').update({ notes: noteText }).eq('id', id)
    setEditingNote(null)
    setNoteText('')
    loadTouristVisas()
  }

  function getCount(category: string, nationality: string): number {
    const stat = stats.find(s => s.category === category && s.nationality === nationality)
    return stat?.count || 0
  }

  function getTotal(category: string): number {
    return getCount(category, 'chinese') + getCount(category, 'pakistani')
  }

  function startEdit(category: string) {
    const vals: Record<string, number> = {}
    nationalities.forEach(n => { vals[n.key] = getCount(category, n.key) })
    setEditValues(vals)
    setEditMode(category)
  }

  async function saveEdit(category: string) {
    setLoading(true)
    for (const nat of nationalities) {
      await supabase.from('visa_stats').upsert({
        category, nationality: nat.key, count: editValues[nat.key] || 0, updated_at: new Date().toISOString()
      }, { onConflict: 'category,nationality' })
    }
    await loadStats()
    setEditMode(null)
    setLoading(false)
  }

  async function handleFileUpload(category: string, nationality: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const key = category + '_' + nationality
    setUploading(key)
    const fileName = `${category}_${nationality}_${Date.now()}_${file.name}`
    const { data, error } = await supabase.storage.from('visa-files').upload(fileName, file)
    if (error) {
      await supabase.from('visa_files').insert([{ category, nationality, file_name: file.name, file_url: '' }])
    } else {
      const { data: urlData } = supabase.storage.from('visa-files').getPublicUrl(data.path)
      await supabase.from('visa_files').insert([{ category, nationality, file_name: file.name, file_url: urlData.publicUrl }])
    }
    await loadFiles()
    setUploading(null)
    e.target.value = ''
  }

  async function deleteFile(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذا الملف؟')) return
    await supabase.from('visa_files').delete().eq('id', id)
    loadFiles()
  }

  function getFiles(category: string, nationality: string): VisaFile[] {
    return files.filter(f => f.category === category && f.nationality === nationality)
  }

  const grandTotal = getTotal('total')
  const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, border:'2px solid #d1d5db', fontSize:13, boxSizing:'border-box' as const, color:'#111827', background:'#fff', marginBottom:10 }

  return (
    <div style={{margin:'24px',fontFamily:'system-ui',direction:'rtl'}}>

      {/* تبويبات */}
      <div style={{display:'flex',gap:6,marginBottom:16,background:'#e5e7eb',padding:4,borderRadius:10,width:'fit-content'}}>
        <button onClick={()=>setActiveTab('stats')}
          style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
            background:activeTab==='stats'?'#fff':'transparent',color:activeTab==='stats'?'#1e40af':'#6b7280',
            boxShadow:activeTab==='stats'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
          🪪 إحصائيات الأجانب
        </button>
        <button onClick={()=>setActiveTab('tourist')}
          style={{padding:'8px 20px',fontSize:14,border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,
            background:activeTab==='tourist'?'#fff':'transparent',color:activeTab==='tourist'?'#1e40af':'#6b7280',
            boxShadow:activeTab==='tourist'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
          ✈️ التأشيرات السياحية
          {(violatedCount > 0 || warningCount > 0) && (
            <span style={{marginRight:6,background:'#dc2626',color:'#fff',borderRadius:20,padding:'1px 7px',fontSize:11,fontWeight:700}}>
              {violatedCount + warningCount}
            </span>
          )}
        </button>
      </div>

      {/* قسم الإحصائيات */}
      {activeTab === 'stats' && (
        <div>
          <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden',marginBottom:20}}>
            <div style={{padding:'16px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <h2 style={{margin:0,fontSize:17,fontWeight:700,color:'#111827'}}>🪪 إحصائيات الأجانب والتأشيرات</h2>
              {readOnly && <span style={{fontSize:12,background:'#fef9c3',color:'#b45309',padding:'3px 10px',borderRadius:20,fontWeight:600}}>👁️ قراءة فقط</span>}
            </div>
            <div style={{padding:'20px'}}>
              <div style={{background:'linear-gradient(135deg, #1e40af, #3b82f6)',borderRadius:12,padding:'20px 24px',color:'#fff',textAlign:'center',marginBottom:20}}>
                <div style={{fontSize:13,opacity:0.85,marginBottom:6}}>إجمالي الأجانب في الشركة</div>
                <div style={{fontSize:48,fontWeight:700,marginBottom:4}}>{grandTotal}</div>
                <div style={{fontSize:13,opacity:0.75}}>🇨🇳 صينيين: {getCount('total','chinese')} &nbsp;|&nbsp; 🇵🇰 باكستانيين: {getCount('total','pakistani')}</div>
              </div>
            </div>
          </div>

          {categories.map(cat => (
            <div key={cat.key} style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden',marginBottom:16}}>
              <div style={{padding:'14px 20px',background:cat.bg,borderBottom:`2px solid ${cat.color}22`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:20}}>{cat.icon}</span>
                  <div>
                    <div style={{fontSize:15,fontWeight:700,color:cat.color}}>{cat.label}</div>
                    <div style={{fontSize:13,color:'#6b7280',marginTop:2}}>المجموع: <strong style={{color:cat.color}}>{getTotal(cat.key)}</strong></div>
                  </div>
                </div>
                {!readOnly && (
                  editMode === cat.key ? (
                    <div style={{display:'flex',gap:8}}>
                      <button onClick={()=>saveEdit(cat.key)} disabled={loading}
                        style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'7px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                        {loading ? '...' : 'حفظ'}
                      </button>
                      <button onClick={()=>setEditMode(null)}
                        style={{background:'#e5e7eb',color:'#374151',border:'none',borderRadius:8,padding:'7px 14px',cursor:'pointer',fontSize:13}}>
                        إلغاء
                      </button>
                    </div>
                  ) : (
                    <button onClick={()=>startEdit(cat.key)}
                      style={{background:'#fff',color:cat.color,border:`1px solid ${cat.color}`,borderRadius:8,padding:'7px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                      ✏️ تعديل
                    </button>
                  )
                )}
              </div>

              <div style={{padding:'16px 20px'}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  {nationalities.map(nat => (
                    <div key={nat.key} style={{background:'#f9fafb',borderRadius:10,padding:'14px 16px',border:'1px solid #e5e7eb'}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                        <div style={{fontSize:14,fontWeight:600,color:'#374151'}}>{nat.flag} {nat.label}</div>
                        {editMode === cat.key ? (
                          <input type="number" min="0" value={editValues[nat.key] || 0}
                            onChange={e=>setEditValues({...editValues,[nat.key]:parseInt(e.target.value)||0})}
                            style={{width:80,padding:'6px 10px',borderRadius:8,border:'2px solid #d1d5db',fontSize:16,fontWeight:700,textAlign:'center',color:'#111827'}}/>
                        ) : (
                          <div style={{fontSize:28,fontWeight:700,color:cat.color}}>{getCount(cat.key, nat.key)}</div>
                        )}
                      </div>
                      <div style={{borderTop:'1px solid #e5e7eb',paddingTop:10,marginTop:4}}>
                        <div style={{fontSize:12,color:'#6b7280',marginBottom:6,fontWeight:500}}>الملفات المرفوعة:</div>
                        {getFiles(cat.key, nat.key).length === 0 ? (
                          <div style={{fontSize:12,color:'#9ca3af'}}>لا توجد ملفات</div>
                        ) : (
                          <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:8}}>
                            {getFiles(cat.key, nat.key).map(f => (
                              <div key={f.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'#fff',borderRadius:6,padding:'5px 8px',border:'1px solid #e5e7eb'}}>
                                <div style={{display:'flex',alignItems:'center',gap:6}}>
                                  <span style={{fontSize:16}}>📄</span>
                                  {f.file_url ? (
                                    <a href={f.file_url} target="_blank" rel="noreferrer"
                                      style={{fontSize:12,color:'#1d4ed8',textDecoration:'none',fontWeight:500}}>{f.file_name}</a>
                                  ) : (
                                    <span style={{fontSize:12,color:'#374151'}}>{f.file_name}</span>
                                  )}
                                </div>
                                {!readOnly && (
                                  <button onClick={()=>deleteFile(f.id)}
                                    style={{background:'none',border:'none',color:'#dc2626',cursor:'pointer',fontSize:14,padding:'0 4px'}}>✕</button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {!readOnly && (
                          <label style={{display:'inline-flex',alignItems:'center',gap:6,background:'#eff6ff',color:'#1d4ed8',border:'1px dashed #93c5fd',borderRadius:8,padding:'6px 12px',cursor:'pointer',fontSize:12,fontWeight:500}}>
                            {uploading === cat.key+'_'+nat.key ? '⏳ جارٍ الرفع...' : '📎 رفع ملف Excel'}
                            <input type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}}
                              onChange={e=>handleFileUpload(cat.key, nat.key, e)} disabled={uploading !== null}/>
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* قسم التأشيرات السياحية */}
      {activeTab === 'tourist' && (
        <div>
          {/* تنبيهات */}
          {violatedCount > 0 && (
            <div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:10,padding:'12px 16px',marginBottom:12,display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:20}}>🚨</span>
              <span style={{fontSize:14,fontWeight:600,color:'#dc2626'}}>{violatedCount} شخص منتهية تأشيرته ويعتبر مخالفاً</span>
            </div>
          )}
          {warningCount > 0 && (
            <div style={{background:'#fef9c3',border:'1px solid #fcd34d',borderRadius:10,padding:'12px 16px',marginBottom:12,display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:20}}>⚠️</span>
              <span style={{fontSize:14,fontWeight:600,color:'#b45309'}}>{warningCount} شخص تأشيرته تنتهي خلال 7 أيام</span>
            </div>
          )}

          {/* إحصائيات سريعة */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
            <div style={{background:'#fff',borderRadius:10,padding:'14px 16px',boxShadow:'0 1px 4px rgba(0,0,0,0.06)',textAlign:'center'}}>
              <div style={{fontSize:12,color:'#6b7280',fontWeight:600,marginBottom:4}}>إجمالي</div>
              <div style={{fontSize:28,fontWeight:700,color:'#1e40af'}}>{touristVisas.length}</div>
            </div>
            <div style={{background:'#fee2e2',borderRadius:10,padding:'14px 16px',textAlign:'center'}}>
              <div style={{fontSize:12,color:'#dc2626',fontWeight:600,marginBottom:4}}>مخالفون</div>
              <div style={{fontSize:28,fontWeight:700,color:'#dc2626'}}>{violatedCount}</div>
            </div>
            <div style={{background:'#dcfce7',borderRadius:10,padding:'14px 16px',textAlign:'center'}}>
              <div style={{fontSize:12,color:'#15803d',fontWeight:600,marginBottom:4}}>سارية</div>
              <div style={{fontSize:28,fontWeight:700,color:'#15803d'}}>{touristVisas.length - violatedCount}</div>
            </div>
          </div>

          <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden'}}>
            <div style={{padding:'16px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <h2 style={{margin:0,fontSize:17,fontWeight:700,color:'#111827'}}>✈️ التأشيرات السياحية</h2>
              {!readOnly && (
                <button onClick={()=>setShowAddForm(!showAddForm)}
                  style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:14,fontWeight:600}}>
                  {showAddForm ? 'إلغاء' : '+ إضافة شخص'}
                </button>
              )}
            </div>

            {/* نموذج الإضافة */}
            {!readOnly && showAddForm && (
              <div style={{padding:'20px',borderBottom:'2px solid #e5e7eb',background:'#f9fafb'}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,maxWidth:600}}>
                  <div>
                    <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>الاسم الكامل *</label>
                    <input value={touristForm.full_name} onChange={e=>setTouristForm({...touristForm,full_name:e.target.value})} placeholder="اسم الشخص" style={inputStyle}/>
                  </div>
                  <div>
                    <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>الجنسية</label>
                    <input value={touristForm.nationality} onChange={e=>setTouristForm({...touristForm,nationality:e.target.value})} placeholder="مثال: صيني" style={inputStyle}/>
                  </div>
                  <div>
                    <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>تاريخ الدخول *</label>
                    <input type="date" value={touristForm.entry_date} onChange={e=>setTouristForm({...touristForm,entry_date:e.target.value})} style={inputStyle}/>
                  </div>
                  <div>
                    <label style={{display:'block',marginBottom:4,fontSize:12,fontWeight:600,color:'#374151'}}>مدة الفيزا</label>
                    <select value={touristForm.visa_duration} onChange={e=>setTouristForm({...touristForm,visa_duration:e.target.value})} style={inputStyle}>
                      <option value="30">30 يوم</option>
                      <option value="60">60 يوم</option>
                    </select>
                  </div>
                </div>
                <button onClick={addTouristVisa} disabled={loading}
                  style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontSize:14,fontWeight:600}}>
                  {loading ? 'جارٍ الحفظ...' : 'حفظ'}
                </button>
              </div>
            )}

            {/* جدول التأشيرات */}
            {touristVisas.length === 0 ? (
              <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لا توجد تأشيرات سياحية — اضغط إضافة شخص</div>
            ) : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}>
                  <thead>
                    <tr style={{background:'#f3f4f6'}}>
                      {['#','الاسم','الجنسية','تاريخ الدخول','المدة','تاريخ الانتهاء','الحالة','ملاحظات',''].map(h=>(
                        <th key={h} style={{padding:'12px 16px',textAlign:'right',color:'#374151',fontWeight:700,borderBottom:'2px solid #e5e7eb',whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {touristVisas.map((visa,idx)=>{
                      const vs = getVisaStatus(visa)
                      return (
                        <tr key={visa.id} style={{borderBottom:'1px solid #e5e7eb',background:visa.status==='violated'?'#fff5f5':'#fff'}}>
                          <td style={{padding:'12px 16px',color:'#9ca3af'}}>{idx+1}</td>
                          <td style={{padding:'12px 16px',fontWeight:600,color:'#111827'}}>{visa.full_name}</td>
                          <td style={{padding:'12px 16px',color:'#6b7280'}}>{visa.nationality || '—'}</td>
                          <td style={{padding:'12px 16px',color:'#6b7280'}}>{visa.entry_date}</td>
                          <td style={{padding:'12px 16px',textAlign:'center'}}>
                            <span style={{background:'#dbeafe',color:'#1d4ed8',padding:'3px 10px',borderRadius:20,fontSize:12,fontWeight:600}}>{visa.visa_duration} يوم</span>
                          </td>
                          <td style={{padding:'12px 16px',color:'#374151',fontWeight:500}}>{visa.expiry_date}</td>
                          <td style={{padding:'12px 16px'}}>
                            <span style={{background:vs.bg,color:vs.color,padding:'4px 12px',borderRadius:20,fontSize:12,fontWeight:700}}>{vs.label}</span>
                          </td>
                          <td style={{padding:'12px 16px',maxWidth:200}}>
                            {editingNote === visa.id ? (
                              <div style={{display:'flex',gap:6}}>
                                <input value={noteText} onChange={e=>setNoteText(e.target.value)}
                                  style={{flex:1,padding:'5px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12,color:'#111827'}}/>
                                <button onClick={()=>saveNote(visa.id)}
                                  style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:12}}>حفظ</button>
                                <button onClick={()=>setEditingNote(null)}
                                  style={{background:'#e5e7eb',color:'#374151',border:'none',borderRadius:6,padding:'5px 8px',cursor:'pointer',fontSize:12}}>✕</button>
                              </div>
                            ) : (
                              <div style={{display:'flex',alignItems:'center',gap:6}}>
                                <span style={{fontSize:12,color:'#6b7280'}}>{visa.notes || '—'}</span>
                                {!readOnly && (
                                  <button onClick={()=>{ setEditingNote(visa.id); setNoteText(visa.notes||'') }}
                                    style={{background:'none',border:'none',color:'#1d4ed8',cursor:'pointer',fontSize:12,padding:'2px 6px'}}>✏️</button>
                                )}
                              </div>
                            )}
                          </td>
                          <td style={{padding:'12px 16px'}}>
                            {!readOnly && (
                              <button onClick={()=>deleteTouristVisa(visa.id)}
                                style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:12,fontWeight:600}}>
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
        </div>
      )}
    </div>
  )
}
