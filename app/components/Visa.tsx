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
  const [stats, setStats] = useState<VisaStat[]>([])
  const [files, setFiles] = useState<VisaFile[]>([])
  const [loading, setLoading] = useState(false)
  const [editMode, setEditMode] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, number>>({})
  const [uploading, setUploading] = useState<string | null>(null)

  useEffect(() => {
    loadStats()
    loadFiles()
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

  function getCount(category: string, nationality: string): number {
    const stat = stats.find(s => s.category === category && s.nationality === nationality)
    return stat?.count || 0
  }

  function getTotal(category: string): number {
    return getCount(category, 'chinese') + getCount(category, 'pakistani')
  }

  function startEdit(category: string) {
    const vals: Record<string, number> = {}
    nationalities.forEach(n => {
      vals[n.key] = getCount(category, n.key)
    })
    setEditValues(vals)
    setEditMode(category)
  }

  async function saveEdit(category: string) {
    setLoading(true)
    for (const nat of nationalities) {
      await supabase.from('visa_stats').upsert({
        category,
        nationality: nat.key,
        count: editValues[nat.key] || 0,
        updated_at: new Date().toISOString()
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

    // رفع الملف إلى Supabase Storage
    const fileName = `${category}_${nationality}_${Date.now()}_${file.name}`
    const { data, error } = await supabase.storage.from('visa-files').upload(fileName, file)

    if (error) {
      // إذا لم يكن الـ bucket موجوداً، نحفظ اسم الملف فقط
      await supabase.from('visa_files').insert([{
        category,
        nationality,
        file_name: file.name,
        file_url: ''
      }])
    } else {
      const { data: urlData } = supabase.storage.from('visa-files').getPublicUrl(data.path)
      await supabase.from('visa_files').insert([{
        category,
        nationality,
        file_name: file.name,
        file_url: urlData.publicUrl
      }])
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

  const grandTotal = categories[0] ? getTotal('total') : 0

  return (
    <div style={{margin:'24px',fontFamily:'system-ui',direction:'rtl'}}>

      {/* رأس الصفحة */}
      <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden',marginBottom:20}}>
        <div style={{padding:'16px 20px',background:'#f9fafb',borderBottom:'2px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <h2 style={{margin:0,fontSize:17,fontWeight:700,color:'#111827'}}>🪪 إحصائيات الأجانب والتأشيرات</h2>
          {readOnly && <span style={{fontSize:12,background:'#fef9c3',color:'#b45309',padding:'3px 10px',borderRadius:20,fontWeight:600}}>👁️ قراءة فقط</span>}
        </div>

        {/* بطاقة الإجمالي الكلي */}
        <div style={{padding:'20px'}}>
          <div style={{background:'linear-gradient(135deg, #1e40af, #3b82f6)',borderRadius:12,padding:'20px 24px',color:'#fff',textAlign:'center',marginBottom:20}}>
            <div style={{fontSize:13,opacity:0.85,marginBottom:6}}>إجمالي الأجانب في الشركة</div>
            <div style={{fontSize:48,fontWeight:700,marginBottom:4}}>{grandTotal}</div>
            <div style={{fontSize:13,opacity:0.75}}>
              🇨🇳 صينيين: {getCount('total','chinese')} &nbsp;|&nbsp; 🇵🇰 باكستانيين: {getCount('total','pakistani')}
            </div>
          </div>
        </div>
      </div>

      {/* الأقسام */}
      {categories.map(cat => (
        <div key={cat.key} style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)',overflow:'hidden',marginBottom:16}}>
          {/* رأس القسم */}
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

          {/* محتوى القسم */}
          <div style={{padding:'16px 20px'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
              {nationalities.map(nat => (
                <div key={nat.key} style={{background:'#f9fafb',borderRadius:10,padding:'14px 16px',border:'1px solid #e5e7eb'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                    <div style={{fontSize:14,fontWeight:600,color:'#374151'}}>{nat.flag} {nat.label}</div>
                    {editMode === cat.key ? (
                      <input type="number" min="0"
                        value={editValues[nat.key] || 0}
                        onChange={e=>setEditValues({...editValues,[nat.key]:parseInt(e.target.value)||0})}
                        style={{width:80,padding:'6px 10px',borderRadius:8,border:'2px solid #d1d5db',fontSize:16,fontWeight:700,textAlign:'center',color:'#111827'}}/>
                    ) : (
                      <div style={{fontSize:28,fontWeight:700,color:cat.color}}>{getCount(cat.key, nat.key)}</div>
                    )}
                  </div>

                  {/* الملفات */}
                  <div style={{borderTop:'1px solid #e5e7eb',paddingTop:10,marginTop:4}}>
                    <div style={{fontSize:12,color:'#6b7280',marginBottom:6,fontWeight:500}}>الملفات المرفوعة:</div>
                    {getFiles(cat.key, nat.key).length === 0 ? (
                      <div style={{fontSize:12,color:'#9ca3af'}}>لا توجد ملفات</div>
                    ) : (
                      <div style={{display:'flex',flexDirection:'column',gap:4}}>
                        {getFiles(cat.key, nat.key).map(f => (
                          <div key={f.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'#fff',borderRadius:6,padding:'5px 8px',border:'1px solid #e5e7eb'}}>
                            <div style={{display:'flex',alignItems:'center',gap:6}}>
                              <span style={{fontSize:16}}>📄</span>
                              {f.file_url ? (
                                <a href={f.file_url} target="_blank" rel="noreferrer"
                                  style={{fontSize:12,color:'#1d4ed8',textDecoration:'none',fontWeight:500}}>
                                  {f.file_name}
                                </a>
                              ) : (
                                <span style={{fontSize:12,color:'#374151'}}>{f.file_name}</span>
                              )}
                            </div>
                            {!readOnly && (
                              <button onClick={()=>deleteFile(f.id)}
                                style={{background:'none',border:'none',color:'#dc2626',cursor:'pointer',fontSize:14,padding:'0 4px'}}>
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {!readOnly && (
                      <div style={{marginTop:8}}>
                        <label style={{display:'inline-flex',alignItems:'center',gap:6,background:'#eff6ff',color:'#1d4ed8',border:'1px dashed #93c5fd',borderRadius:8,padding:'6px 12px',cursor:'pointer',fontSize:12,fontWeight:500}}>
                          {uploading === cat.key+'_'+nat.key ? '⏳ جارٍ الرفع...' : '📎 رفع ملف Excel'}
                          <input type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}}
                            onChange={e=>handleFileUpload(cat.key, nat.key, e)}
                            disabled={uploading !== null}/>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
