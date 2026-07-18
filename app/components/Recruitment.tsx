'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { logActivity } from '../logActivity'
import { Button, Input, Badge, Card, Table } from '../ui'

const supabase = createClient(
  'https://idsedrnuopflzepasmvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2Vkcm51b3BmbHplcGFzbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg2NDQsImV4cCI6MjA5NjQxNDY0NH0.KXxBQzHEkRJNrEL22T-Om_mO1Va_y5zN7sZ4kNXrwqQ'
)

interface JobOpening {
  id: string
  title: string
  department: string
  opened_date: string
  status: string
  closed_date: string | null
  created_at: string
}

interface Applicant {
  id: string
  job_id: string
  full_name: string
  phone: string
  email: string | null
  source: string
  referral_by: string | null
  years_experience: number | null
  languages: string | null
  location: string | null
  nationality: string | null
  expected_salary: number | null
  offered_salary: number | null
  status: string
  rejection_reason: string | null
  in_talent_pool: boolean
  hired_employee_id: string | null
  created_at: string
}

interface ApplicantScores {
  experience: number
  language: number
  personality: number
  fit: number
}

interface ApplicantNote {
  id: string
  applicant_id: string
  note_type: string
  content: string
  scores: ApplicantScores | null
  interviewer_name: string | null
  created_at: string
}

interface ApplicantFile {
  id: string
  applicant_id: string
  file_name: string
  file_url: string
  file_type: string
  uploaded_at: string
}

const statusFlow = ['applied', 'shortlist', 'interview_1', 'interview_2', 'offer', 'hired']
const statusLabels: Record<string, string> = {
  applied: 'متقدم', shortlist: 'قائمة مختصرة', interview_1: 'مقابلة 1', interview_2: 'مقابلة 2',
  offer: 'عرض', hired: 'معيّن', rejected: 'مرفوض', on_hold: 'معلّق', stage_change: 'تغيير حالة',
}
const statusTone: Record<string, 'neutral' | 'accent' | 'success' | 'danger' | 'warning' | 'info' | 'tertiary'> = {
  applied: 'neutral', shortlist: 'info', interview_1: 'accent', interview_2: 'accent',
  offer: 'warning', hired: 'success', rejected: 'danger', on_hold: 'tertiary',
}
const rejectionReasons = ['راتب متوقع عالٍ', 'خبرة غير كافية', 'لم يحضر', 'فشل المقابلة', 'شُغلت الوظيفة', 'أخرى']
const sourceOptions = [
  { key: 'facebook', label: 'فيسبوك' },
  { key: 'ad', label: 'إعلان' },
  { key: 'referral', label: 'ترشيح موظف' },
  { key: 'network', label: 'معارف' },
  { key: 'other', label: 'أخرى' },
]
const sourceLabel = (key: string) => sourceOptions.find(s => s.key === key)?.label || key
const noteTypeOptions = [
  { key: 'note', label: 'ملاحظة' },
  { key: 'call', label: 'اتصال' },
  { key: 'interview_1', label: 'مقابلة أولى' },
  { key: 'interview_2', label: 'مقابلة ثانية' },
]
const fileTypeOptions = [
  { key: 'cv', label: 'السيرة الذاتية', icon: '📄' },
  { key: 'certificate', label: 'شهادة', icon: '🎓' },
  { key: 'other', label: 'أخرى', icon: '📎' },
]
const scoreCriteria: { key: keyof ApplicantScores; label: string }[] = [
  { key: 'experience', label: 'الخبرة' },
  { key: 'language', label: 'اللغة' },
  { key: 'personality', label: 'الشخصية' },
  { key: 'fit', label: 'الملاءمة' },
]

function today() { return new Date().toISOString().split('T')[0] }
function fmtDate(d: string | null) { return d ? new Date(d).toLocaleDateString('ar-IQ') : '—' }
function waLink(phone: string) {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = '964' + digits.slice(1)
  return `https://wa.me/${digits}`
}

export default function Recruitment({ readOnly = false }: { readOnly?: boolean }) {
  const [topTab, setTopTab] = useState<'jobs' | 'pool'>('jobs')
  const [jobsTab, setJobsTab] = useState<'open' | 'closed'>('open')
  const [jobs, setJobs] = useState<JobOpening[]>([])
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [loading, setLoading] = useState(false)

  const [selectedJob, setSelectedJob] = useState<JobOpening | null>(null)
  const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null)
  const [returnTo, setReturnTo] = useState<'job' | 'pool'>('job')

  const [showJobForm, setShowJobForm] = useState(false)
  const [jobForm, setJobForm] = useState({ title: '', department: '', opened_date: today() })
  const [savingJob, setSavingJob] = useState(false)

  const [candidateStatusFilter, setCandidateStatusFilter] = useState<string>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showCompare, setShowCompare] = useState(false)
  const [compareScores, setCompareScores] = useState<Record<string, number | null>>({})

  const [showApplicantForm, setShowApplicantForm] = useState(false)
  const [applicantForm, setApplicantForm] = useState({
    name: '', phone: '', email: '', source: 'facebook', referral_by: '',
    years_experience: '', languages: '', location: '', nationality: '', expected_salary: '',
  })
  const [phoneWarning, setPhoneWarning] = useState<string | null>(null)
  const [savingApplicant, setSavingApplicant] = useState(false)

  const [notes, setNotes] = useState<ApplicantNote[]>([])
  const [files, setFiles] = useState<ApplicantFile[]>([])
  const [uploadingType, setUploadingType] = useState<string | null>(null)
  const [showEditInfo, setShowEditInfo] = useState(false)
  const [editForm, setEditForm] = useState({
    years_experience: '', languages: '', location: '', expected_salary: '',
    email: '', nationality: '', offered_salary: '',
  })

  const [newNoteType, setNewNoteType] = useState('note')
  const [newNoteContent, setNewNoteContent] = useState('')
  const [newNoteInterviewer, setNewNoteInterviewer] = useState('')
  const [newNoteScores, setNewNoteScores] = useState<ApplicantScores>({ experience: 3, language: 3, personality: 3, fit: 3 })

  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [addToPoolChecked, setAddToPoolChecked] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)

  const [poolSearch, setPoolSearch] = useState('')

  useEffect(() => { loadJobs(); loadApplicants() }, [])

  async function loadJobs() {
    setLoading(true)
    const { data } = await supabase.from('job_openings').select('*').order('created_at', { ascending: false })
    setJobs((data as JobOpening[]) || [])
    setLoading(false)
  }

  async function loadApplicants() {
    const { data } = await supabase.from('applicants').select('*').order('created_at', { ascending: false })
    setApplicants((data as Applicant[]) || [])
  }

  async function loadNotes(applicantId: string) {
    const { data } = await supabase.from('applicant_notes').select('*').eq('applicant_id', applicantId).order('created_at', { ascending: false })
    setNotes((data as ApplicantNote[]) || [])
  }

  async function loadFiles(applicantId: string) {
    const { data } = await supabase.from('applicant_files').select('*').eq('applicant_id', applicantId).order('uploaded_at', { ascending: false })
    setFiles((data as ApplicantFile[]) || [])
  }

  const jobTitleFor = (id: string) => jobs.find(j => j.id === id)?.title || '—'

  const jobCounts = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    applicants.forEach(a => {
      if (!map[a.job_id]) map[a.job_id] = {}
      map[a.job_id][a.status] = (map[a.job_id][a.status] || 0) + 1
    })
    return map
  }, [applicants])

  const filteredJobs = useMemo(() => jobs.filter(j => j.status === jobsTab), [jobs, jobsTab])

  const jobApplicants = useMemo(() => {
    if (!selectedJob) return []
    let list = applicants.filter(a => a.job_id === selectedJob.id)
    if (candidateStatusFilter !== 'all') list = list.filter(a => a.status === candidateStatusFilter)
    return list
  }, [applicants, selectedJob, candidateStatusFilter])

  const poolApplicants = useMemo(() => {
    let list = applicants.filter(a => a.in_talent_pool)
    if (poolSearch.trim()) {
      const term = poolSearch.trim().toLowerCase()
      list = list.filter(a =>
        a.full_name.toLowerCase().includes(term) ||
        (a.phone || '').toLowerCase().includes(term) ||
        (a.languages || '').toLowerCase().includes(term) ||
        (a.location || '').toLowerCase().includes(term)
      )
    }
    return list
  }, [applicants, poolSearch])

  // --- الوظائف ---
  async function addJob() {
    if (!jobForm.title.trim() || !jobForm.department.trim()) { alert('يرجى تعبئة عنوان الوظيفة والقسم'); return }
    setSavingJob(true)
    const { error } = await supabase.from('job_openings').insert([{
      title: jobForm.title.trim(), department: jobForm.department.trim(),
      opened_date: jobForm.opened_date, status: 'open',
    }])
    if (error) alert('خطأ: ' + error.message)
    else {
      await logActivity('إنشاء وظيفة', 'recruitment', `إنشاء وظيفة: ${jobForm.title}`)
      setJobForm({ title: '', department: '', opened_date: today() })
      setShowJobForm(false)
      await loadJobs()
    }
    setSavingJob(false)
  }

  async function closeJob(job: JobOpening) {
    if (!confirm(`تأكيد إغلاق وظيفة "${job.title}"؟`)) return
    await supabase.from('job_openings').update({ status: 'closed', closed_date: today() }).eq('id', job.id)
    await logActivity('إغلاق وظيفة', 'recruitment', `إغلاق وظيفة: ${job.title}`)
    await loadJobs()
  }

  async function deleteJob(job: JobOpening) {
    const jobApplicantIds = applicants.filter(a => a.job_id === job.id).map(a => a.id)
    const msg = jobApplicantIds.length > 0
      ? `تأكيد حذف الوظيفة "${job.title}" نهائياً؟ سيتم حذف جميع مرشحيها (${jobApplicantIds.length}) وملاحظاتهم وملفاتهم بشكل نهائي ولا يمكن التراجع عن هذا.`
      : `تأكيد حذف الوظيفة "${job.title}" نهائياً؟`
    if (!confirm(msg)) return
    if (jobApplicantIds.length > 0) {
      const { data: filesData } = await supabase.from('applicant_files').select('*').in('applicant_id', jobApplicantIds)
      for (const f of ((filesData as ApplicantFile[]) || [])) {
        const path = f.file_url.split('/').pop()
        if (path) await supabase.storage.from('applicant-files').remove([path])
      }
      await supabase.from('applicant_files').delete().in('applicant_id', jobApplicantIds)
      await supabase.from('applicant_notes').delete().in('applicant_id', jobApplicantIds)
      await supabase.from('applicants').delete().in('id', jobApplicantIds)
    }
    await supabase.from('job_openings').delete().eq('id', job.id)
    await logActivity('حذف وظيفة', 'recruitment', `حذف الوظيفة "${job.title}" و${jobApplicantIds.length} مرشح مرتبط بها`)
    setApplicants(prev => prev.filter(a => a.job_id !== job.id))
    setJobs(prev => prev.filter(j => j.id !== job.id))
  }

  // --- المرشحون ---
  async function checkPhoneDuplicate(phone: string) {
    if (!phone.trim()) { setPhoneWarning(null); return }
    const { data } = await supabase.from('applicants').select('id,full_name,job_id').eq('phone', phone.trim()).limit(1)
    if (data && data.length > 0) {
      setPhoneWarning(`هذا الرقم مسجل سابقاً للمرشح ${data[0].full_name} في وظيفة ${jobTitleFor(data[0].job_id)}`)
    } else setPhoneWarning(null)
  }

  async function addApplicant() {
    if (!selectedJob || !applicantForm.name.trim() || !applicantForm.phone.trim()) { alert('يرجى تعبئة الاسم والهاتف'); return }
    setSavingApplicant(true)
    const { error } = await supabase.from('applicants').insert([{
      job_id: selectedJob.id,
      full_name: applicantForm.name.trim(),
      phone: applicantForm.phone.trim(),
      email: applicantForm.email.trim() || null,
      source: applicantForm.source,
      referral_by: applicantForm.source === 'referral' ? (applicantForm.referral_by.trim() || null) : null,
      years_experience: applicantForm.years_experience ? parseFloat(applicantForm.years_experience) : null,
      languages: applicantForm.languages || null,
      location: applicantForm.location || null,
      nationality: applicantForm.nationality || null,
      expected_salary: applicantForm.expected_salary ? parseFloat(applicantForm.expected_salary) : null,
      status: 'applied',
      in_talent_pool: false,
    }])
    if (error) alert('خطأ: ' + error.message)
    else {
      setApplicantForm({ name: '', phone: '', email: '', source: 'facebook', referral_by: '', years_experience: '', languages: '', location: '', nationality: '', expected_salary: '' })
      setPhoneWarning(null)
      setShowApplicantForm(false)
      await loadApplicants()
    }
    setSavingApplicant(false)
  }

  function openCandidate(a: Applicant, from: 'job' | 'pool') {
    setSelectedApplicant(a)
    setReturnTo(from)
    setEditForm({
      years_experience: a.years_experience?.toString() || '', languages: a.languages || '',
      location: a.location || '', expected_salary: a.expected_salary?.toString() || '',
      email: a.email || '', nationality: a.nationality || '', offered_salary: a.offered_salary?.toString() || '',
    })
    setShowEditInfo(false)
    setShowRejectForm(false)
    loadNotes(a.id)
    loadFiles(a.id)
  }

  function backFromCandidate() {
    setSelectedApplicant(null)
    if (returnTo === 'pool') setSelectedJob(null)
  }

  async function applyStatusChange(newStatus: string, extra?: { rejection_reason?: string; in_talent_pool?: boolean }) {
    if (!selectedApplicant) return
    const oldLabel = statusLabels[selectedApplicant.status] || selectedApplicant.status
    const newLabel = statusLabels[newStatus] || newStatus
    setSavingStatus(true)
    const updatePayload: Record<string, unknown> = { status: newStatus }
    if (extra?.rejection_reason) updatePayload.rejection_reason = extra.rejection_reason
    if (extra?.in_talent_pool) updatePayload.in_talent_pool = true
    const { error } = await supabase.from('applicants').update(updatePayload).eq('id', selectedApplicant.id)
    if (error) { alert('خطأ: ' + error.message); setSavingStatus(false); return }
    await supabase.from('applicant_notes').insert([{
      applicant_id: selectedApplicant.id, note_type: 'stage_change',
      content: `تغيير الحالة من ${oldLabel} إلى ${newLabel}`,
    }])
    await logActivity(newStatus === 'rejected' ? 'رفض مرشح' : 'تغيير حالة مرشح', 'recruitment', `${selectedApplicant.full_name}: ${oldLabel} ← ${newLabel}`)
    const updated = { ...selectedApplicant, ...updatePayload } as Applicant
    setSelectedApplicant(updated)
    setApplicants(prev => prev.map(a => a.id === updated.id ? updated : a))
    await loadNotes(selectedApplicant.id)
    setShowRejectForm(false)
    setRejectReason('')
    setAddToPoolChecked(false)
    setSavingStatus(false)
  }

  function handleStatusButtonClick(newStatus: string) {
    if (newStatus === 'rejected') { setShowRejectForm(true); return }
    const label = statusLabels[newStatus] || newStatus
    if (!confirm(`تأكيد تغيير حالة المرشح إلى "${label}"؟`)) return
    applyStatusChange(newStatus)
  }

  function confirmReject() {
    if (!rejectReason) { alert('يرجى اختيار سبب الرفض'); return }
    applyStatusChange('rejected', { rejection_reason: rejectReason, in_talent_pool: addToPoolChecked })
  }

  async function convertToEmployee() {
    if (!selectedApplicant) return
    if (!confirm(`تحويل "${selectedApplicant.full_name}" إلى موظف رسمي؟`)) return
    const { data, error } = await supabase.from('employees').insert([{
      name: selectedApplicant.full_name,
      job_title: jobTitleFor(selectedApplicant.job_id),
      hire_date: today(),
      status: 'active',
    }]).select().single()
    if (error) { alert('خطأ: ' + error.message); return }
    await supabase.from('applicants').update({ hired_employee_id: data.id }).eq('id', selectedApplicant.id)
    await logActivity('تحويل مرشح إلى موظف', 'recruitment', `${selectedApplicant.full_name} أصبح موظفاً`)
    const updated = { ...selectedApplicant, hired_employee_id: data.id }
    setSelectedApplicant(updated)
    setApplicants(prev => prev.map(a => a.id === updated.id ? updated : a))
    alert('تم تحويل المرشح إلى موظف بنجاح')
  }

  async function saveEditInfo() {
    if (!selectedApplicant) return
    const payload = {
      years_experience: editForm.years_experience ? parseFloat(editForm.years_experience) : null,
      languages: editForm.languages || null,
      location: editForm.location || null,
      expected_salary: editForm.expected_salary ? parseFloat(editForm.expected_salary) : null,
      email: editForm.email || null,
      nationality: editForm.nationality || null,
      offered_salary: editForm.offered_salary ? parseFloat(editForm.offered_salary) : null,
    }
    await supabase.from('applicants').update(payload).eq('id', selectedApplicant.id)
    const updated = { ...selectedApplicant, ...payload }
    setSelectedApplicant(updated)
    setApplicants(prev => prev.map(a => a.id === updated.id ? updated : a))
    setShowEditInfo(false)
  }

  async function handleFileUpload(fileType: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedApplicant) return
    setUploadingType(fileType)
    const fileName = `${selectedApplicant.id}_${fileType}_${Date.now()}_${file.name}`
    const { data, error } = await supabase.storage.from('applicant-files').upload(fileName, file)
    if (error) alert('خطأ في رفع الملف: ' + error.message)
    else {
      const { data: urlData } = supabase.storage.from('applicant-files').getPublicUrl(data.path)
      await supabase.from('applicant_files').insert([{
        applicant_id: selectedApplicant.id, file_name: file.name, file_url: urlData.publicUrl, file_type: fileType,
      }])
      await loadFiles(selectedApplicant.id)
    }
    setUploadingType(null)
    e.target.value = ''
  }

  async function deleteFile(f: ApplicantFile) {
    if (!confirm('هل أنت متأكد من حذف هذا الملف؟')) return
    await supabase.from('applicant_files').delete().eq('id', f.id)
    const path = f.file_url.split('/').pop()
    if (path) await supabase.storage.from('applicant-files').remove([path])
    await logActivity('حذف ملف مرشح', 'recruitment', `حذف ملف لـ ${selectedApplicant?.full_name}`)
    if (selectedApplicant) await loadFiles(selectedApplicant.id)
  }

  async function addNote() {
    if (!selectedApplicant) return
    const isInterview = newNoteType === 'interview_1' || newNoteType === 'interview_2'
    if (!isInterview && !newNoteContent.trim()) { alert('يرجى كتابة نص الملاحظة'); return }
    if (newNoteType === 'interview_2' && !newNoteInterviewer.trim()) { alert('يرجى إدخال اسم المُقابِل'); return }
    const payload: Record<string, unknown> = {
      applicant_id: selectedApplicant.id, note_type: newNoteType, content: newNoteContent.trim(),
    }
    if (isInterview) {
      payload.scores = newNoteScores
      payload.interviewer_name = newNoteInterviewer.trim() || null
    }
    await supabase.from('applicant_notes').insert([payload])
    setNewNoteContent('')
    setNewNoteInterviewer('')
    setNewNoteScores({ experience: 3, language: 3, personality: 3, fit: 3 })
    setNewNoteType('note')
    await loadNotes(selectedApplicant.id)
  }

  async function deleteNote(n: ApplicantNote) {
    if (!confirm('هل أنت متأكد من حذف هذه الملاحظة؟')) return
    await supabase.from('applicant_notes').delete().eq('id', n.id)
    await logActivity('حذف ملاحظة مرشح', 'recruitment', `حذف ملاحظة لـ ${selectedApplicant?.full_name}`)
    if (selectedApplicant) await loadNotes(selectedApplicant.id)
  }

  async function deleteApplicant(a: Applicant) {
    if (!confirm(`هل أنت متأكد من حذف المرشح "${a.full_name}" نهائياً؟`)) return
    const { data: filesData } = await supabase.from('applicant_files').select('*').eq('applicant_id', a.id)
    for (const f of ((filesData as ApplicantFile[]) || [])) {
      const path = f.file_url.split('/').pop()
      if (path) await supabase.storage.from('applicant-files').remove([path])
    }
    await supabase.from('applicant_files').delete().eq('applicant_id', a.id)
    await supabase.from('applicant_notes').delete().eq('applicant_id', a.id)
    await supabase.from('applicants').delete().eq('id', a.id)
    await logActivity('حذف مرشح', 'recruitment', `حذف المرشح ${a.full_name}`)
    setApplicants(prev => prev.filter(x => x.id !== a.id))
    if (selectedApplicant?.id === a.id) backFromCandidate()
  }

  // --- المقارنة ---
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function openCompare() {
    const ids = Array.from(selectedIds)
    if (ids.length < 2) return
    const { data } = await supabase.from('applicant_notes').select('applicant_id, scores').in('applicant_id', ids).in('note_type', ['interview_1', 'interview_2'])
    const grouped: Record<string, number[]> = {}
    ;(data || []).forEach((n: { applicant_id: string; scores: ApplicantScores | null }) => {
      if (!n.scores) return
      const vals = Object.values(n.scores).filter((v): v is number => typeof v === 'number')
      if (vals.length === 0) return
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length
      if (!grouped[n.applicant_id]) grouped[n.applicant_id] = []
      grouped[n.applicant_id].push(avg)
    })
    const result: Record<string, number | null> = {}
    ids.forEach(id => {
      const arr = grouped[id]
      result[id] = arr && arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null
    })
    setCompareScores(result)
    setShowCompare(true)
  }

  // --- أنماط مساعدة (نفس أسلوب Custody.tsx) ---
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
  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', fontSize: 'var(--text-base)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 'var(--weight-semibold)',
    background: active ? 'var(--color-surface)' : 'transparent', color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
    boxShadow: active ? 'var(--shadow-xs)' : 'none',
  })

  // ================================================================= JSX
  return (
    <div style={{ margin: '24px', fontFamily: 'var(--font-sans)', direction: 'rtl' }}>

      {!selectedJob && !selectedApplicant && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', background: 'var(--color-border)', padding: 'var(--space-1)', borderRadius: 'var(--radius-lg)', width: 'fit-content' }}>
          <button onClick={() => setTopTab('jobs')} style={tabBtnStyle(topTab === 'jobs')}>الوظائف</button>
          <button onClick={() => setTopTab('pool')} style={tabBtnStyle(topTab === 'pool')}>بنك المرشحين ({applicants.filter(a => a.in_talent_pool).length})</button>
        </div>
      )}

      {/* ========================== لوحة الوظائف ========================== */}
      {topTab === 'jobs' && !selectedJob && !selectedApplicant && (
        <div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', alignItems: 'center' }}>
            <button onClick={() => setJobsTab('open')} style={tabBtnStyle(jobsTab === 'open')}>الوظائف المفتوحة ({jobs.filter(j => j.status === 'open').length})</button>
            <button onClick={() => setJobsTab('closed')} style={tabBtnStyle(jobsTab === 'closed')}>الوظائف المغلقة ({jobs.filter(j => j.status === 'closed').length})</button>
            {!readOnly && (
              <Button variant="primary" size="md" onClick={() => setShowJobForm(!showJobForm)} style={{ marginInlineStart: 'auto' }}>
                {showJobForm ? 'إلغاء' : '+ وظيفة جديدة'}
              </Button>
            )}
          </div>

          {showJobForm && !readOnly && (
            <Card style={{ marginBottom: 'var(--space-4)' }}>
              <div style={{ padding: 'var(--space-5)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)', maxWidth: 800 }}>
                  <Input label="عنوان الوظيفة *" value={jobForm.title} onChange={e => setJobForm({ ...jobForm, title: e.target.value })} placeholder="مثال: محاسب" />
                  <Input label="القسم *" value={jobForm.department} onChange={e => setJobForm({ ...jobForm, department: e.target.value })} placeholder="مثال: المالية" />
                  <Input label="تاريخ الفتح" type="date" value={jobForm.opened_date} onChange={e => setJobForm({ ...jobForm, opened_date: e.target.value })} />
                </div>
                <Button variant="success" size="md" onClick={addJob} disabled={savingJob} style={{ marginTop: 'var(--space-2)' }}>
                  {savingJob ? 'جارٍ الحفظ...' : 'إنشاء الوظيفة'}
                </Button>
              </div>
            </Card>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>جارٍ التحميل...</div>
          ) : filteredJobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-faint)' }}>
              {jobsTab === 'open' ? 'لا توجد وظائف مفتوحة' : 'لا توجد وظائف مغلقة'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 'var(--space-4)' }}>
              {filteredJobs.map(job => {
                const counts = jobCounts[job.id] || {}
                return (
                  <Card key={job.id}>
                    <div style={{ padding: 'var(--space-5)', cursor: 'pointer' }} onClick={() => setSelectedJob(job)}>
                      <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text)', marginBottom: 4 }}>{job.title}</div>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 10 }}>{job.department} — فُتحت {fmtDate(job.opened_date)}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {statusFlow.concat(['rejected', 'on_hold']).filter(s => counts[s]).map(s => (
                          <Badge key={s} tone={statusTone[s]} size="sm">{statusLabels[s]}: {counts[s]}</Badge>
                        ))}
                        {Object.keys(counts).length === 0 && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)' }}>لا يوجد مرشحون بعد</span>}
                      </div>
                    </div>
                    {jobsTab === 'open' && !readOnly && (
                      <div style={{ padding: '0 var(--space-5) var(--space-4)' }}>
                        <Button variant="secondary" size="sm" onClick={() => closeJob(job)}>إغلاق الوظيفة</Button>
                      </div>
                    )}
                    {jobsTab === 'closed' && !readOnly && (
                      <div style={{ padding: '0 var(--space-5) var(--space-4)' }}>
                        <Button variant="danger" size="sm" onClick={() => deleteJob(job)}>حذف الوظيفة نهائياً</Button>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================== بنك المرشحين ========================== */}
      {topTab === 'pool' && !selectedJob && !selectedApplicant && (
        <Card>
          <div className="ui-card__header">
            <h2 className="ui-card__title" style={{ fontSize: 'var(--text-md)' }}>بنك المرشحين</h2>
            <Input placeholder="بحث بالاسم أو الهاتف أو اللغات أو الموقع..." value={poolSearch} onChange={e => setPoolSearch(e.target.value)} size="sm" style={{ minWidth: 260, width: 'auto' }} />
          </div>
          {poolApplicants.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-faint)' }}>لا يوجد مرشحون في البنك</div>
          ) : (
            <Table>
              <thead>
                <tr>{['الاسم', 'الهاتف', 'الوظيفة السابقة', 'اللغات', 'الموقع', 'سبب الرفض', ''].map((h, i) => <Table.Th key={i}>{h}</Table.Th>)}</tr>
              </thead>
              <tbody>
                {poolApplicants.map(a => (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => openCandidate(a, 'pool')}>
                    <Table.Td style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)' }}>{a.full_name}</Table.Td>
                    <Table.Td style={{ direction: 'ltr', textAlign: 'right' }}>{a.phone}</Table.Td>
                    <Table.Td>{jobTitleFor(a.job_id)}</Table.Td>
                    <Table.Td>{a.languages || '—'}</Table.Td>
                    <Table.Td>{a.location || '—'}</Table.Td>
                    <Table.Td style={{ fontSize: 'var(--text-xs)' }}>{a.rejection_reason || '—'}</Table.Td>
                    <Table.Td style={{ color: 'var(--color-accent)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)' }}>فتح الملف ←</Table.Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {/* ========================== صفحة الوظيفة ========================== */}
      {selectedJob && !selectedApplicant && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
            <Button variant="secondary" size="sm" onClick={() => { setSelectedJob(null); setSelectedIds(new Set()); setCandidateStatusFilter('all') }}>← رجوع</Button>
            <div>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text)' }}>{selectedJob.title}</div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{selectedJob.department}</div>
            </div>
            <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 'var(--space-2)' }}>
              {selectedIds.size >= 2 && <Button variant="accent-soft" size="md" onClick={openCompare}>مقارنة ({selectedIds.size})</Button>}
              {!readOnly && (
                <Button variant="primary" size="md" onClick={() => setShowApplicantForm(!showApplicantForm)}>
                  {showApplicantForm ? 'إلغاء' : '+ مرشح جديد'}
                </Button>
              )}
            </div>
          </div>

          {showCompare && selectedIds.size >= 2 && (
            <Card style={{ marginBottom: 'var(--space-4)' }}>
              <div className="ui-card__header">
                <h3 className="ui-card__title" style={{ fontSize: 'var(--text-md)' }}>مقارنة المرشحين</h3>
                <Button variant="ghost" size="sm" onClick={() => setShowCompare(false)}>إغلاق ✕</Button>
              </div>
              <Table>
                <thead>
                  <tr>{['الاسم', 'الخبرة', 'اللغات', 'الموقع', 'الراتب المتوقع', 'متوسط درجات المقابلات'].map((h, i) => <Table.Th key={i}>{h}</Table.Th>)}</tr>
                </thead>
                <tbody>
                  {applicants.filter(a => selectedIds.has(a.id)).map(a => (
                    <tr key={a.id}>
                      <Table.Td style={{ fontWeight: 'var(--weight-semibold)' }}>{a.full_name}</Table.Td>
                      <Table.Td>{a.years_experience != null ? `${a.years_experience} سنة` : '—'}</Table.Td>
                      <Table.Td>{a.languages || '—'}</Table.Td>
                      <Table.Td>{a.location || '—'}</Table.Td>
                      <Table.Td className="ui-table__numeric">{a.expected_salary ? a.expected_salary.toLocaleString('ar-IQ') : '—'}</Table.Td>
                      <Table.Td className="ui-table__numeric">{compareScores[a.id] != null ? `${compareScores[a.id]} / 5` : '—'}</Table.Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}

          {showApplicantForm && !readOnly && (
            <Card style={{ marginBottom: 'var(--space-4)' }}>
              <div style={{ padding: 'var(--space-5)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)', maxWidth: 900 }}>
                  <Input label="الاسم *" value={applicantForm.name} onChange={e => setApplicantForm({ ...applicantForm, name: e.target.value })} />
                  <div>
                    <Input label="الهاتف *" value={applicantForm.phone}
                      onChange={e => setApplicantForm({ ...applicantForm, phone: e.target.value })}
                      onBlur={e => checkPhoneDuplicate(e.target.value)} style={{ direction: 'ltr' }} />
                    {phoneWarning && <div style={{ marginTop: 4, fontSize: 'var(--text-2xs)', color: 'var(--color-warning)' }}>{phoneWarning}</div>}
                  </div>
                  <Input label="البريد الإلكتروني" value={applicantForm.email} onChange={e => setApplicantForm({ ...applicantForm, email: e.target.value })} style={{ direction: 'ltr' }} />
                  <div>
                    <label style={formLabelStyle}>المصدر</label>
                    <select value={applicantForm.source} onChange={e => setApplicantForm({ ...applicantForm, source: e.target.value })} style={formSelectStyle}>
                      {sourceOptions.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </div>
                  {applicantForm.source === 'referral' && (
                    <Input label="اسم المرشِّح" value={applicantForm.referral_by} onChange={e => setApplicantForm({ ...applicantForm, referral_by: e.target.value })} />
                  )}
                  <Input label="سنوات الخبرة" type="number" value={applicantForm.years_experience} onChange={e => setApplicantForm({ ...applicantForm, years_experience: e.target.value })} />
                  <Input label="اللغات" value={applicantForm.languages} onChange={e => setApplicantForm({ ...applicantForm, languages: e.target.value })} placeholder="عربي، إنجليزي..." />
                  <Input label="الموقع" value={applicantForm.location} onChange={e => setApplicantForm({ ...applicantForm, location: e.target.value })} />
                  <Input label="الجنسية" value={applicantForm.nationality} onChange={e => setApplicantForm({ ...applicantForm, nationality: e.target.value })} />
                  <Input label="الراتب المتوقع" type="number" value={applicantForm.expected_salary} onChange={e => setApplicantForm({ ...applicantForm, expected_salary: e.target.value })} />
                </div>
                <Button variant="success" size="md" onClick={addApplicant} disabled={savingApplicant} style={{ marginTop: 'var(--space-2)' }}>
                  {savingApplicant ? 'جارٍ الحفظ...' : 'حفظ المرشح'}
                </Button>
              </div>
            </Card>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 'var(--space-3)' }}>
            <button onClick={() => setCandidateStatusFilter('all')} style={{ ...selectStyle, cursor: 'pointer', fontWeight: candidateStatusFilter === 'all' ? 700 : 400 }}>الكل ({applicants.filter(a => a.job_id === selectedJob.id).length})</button>
            {statusFlow.concat(['rejected', 'on_hold']).map(s => {
              const c = jobCounts[selectedJob.id]?.[s] || 0
              if (!c) return null
              return (
                <button key={s} onClick={() => setCandidateStatusFilter(s)} style={{ ...selectStyle, cursor: 'pointer', fontWeight: candidateStatusFilter === s ? 700 : 400 }}>
                  {statusLabels[s]} ({c})
                </button>
              )
            })}
          </div>

          <Card>
            {jobApplicants.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-faint)' }}>لا يوجد مرشحون في هذه الحالة</div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Table.Th></Table.Th>
                    {['الاسم', 'الهاتف', 'الحالة', 'تاريخ التقديم', ''].map((h, i) => <Table.Th key={i}>{h}</Table.Th>)}
                  </tr>
                </thead>
                <tbody>
                  {jobApplicants.map(a => (
                    <tr key={a.id}>
                      <Table.Td onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => toggleSelect(a.id)} />
                      </Table.Td>
                      <Table.Td style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)', cursor: 'pointer' }} onClick={() => openCandidate(a, 'job')}>{a.full_name}</Table.Td>
                      <Table.Td style={{ direction: 'ltr', textAlign: 'right' }}>
                        <a href={waLink(a.phone)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: 'var(--color-success)', textDecoration: 'none', fontWeight: 600 }}>
                          {a.phone} 💬
                        </a>
                      </Table.Td>
                      <Table.Td onClick={() => openCandidate(a, 'job')} style={{ cursor: 'pointer' }}><Badge tone={statusTone[a.status]}>{statusLabels[a.status] || a.status}</Badge></Table.Td>
                      <Table.Td onClick={() => openCandidate(a, 'job')} style={{ cursor: 'pointer' }}>{fmtDate(a.created_at)}</Table.Td>
                      <Table.Td>
                        {!readOnly && <Button variant="danger" size="sm" onClick={() => deleteApplicant(a)}>حذف</Button>}
                      </Table.Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      )}

      {/* ========================== ملف المرشح ========================== */}
      {selectedApplicant && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
            <Button variant="secondary" size="sm" onClick={backFromCandidate}>← رجوع</Button>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text)' }}>{selectedApplicant.full_name}</span>
                <Badge tone={statusTone[selectedApplicant.status]}>{statusLabels[selectedApplicant.status] || selectedApplicant.status}</Badge>
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 2 }}>
                {jobTitleFor(selectedApplicant.job_id)} — المصدر: {sourceLabel(selectedApplicant.source)}
                {selectedApplicant.referral_by && ` (${selectedApplicant.referral_by})`}
              </div>
            </div>
            <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 'var(--space-2)' }}>
              <Button variant="success-soft" size="md" onClick={() => window.open(waLink(selectedApplicant.phone), '_blank')}>💬 واتساب</Button>
              {selectedApplicant.status === 'hired' && !selectedApplicant.hired_employee_id && !readOnly && (
                <Button variant="success" size="md" onClick={convertToEmployee}>تحويل إلى موظف</Button>
              )}
            </div>
          </div>

          {!readOnly && (
            <Card style={{ marginBottom: 'var(--space-4)' }}>
              <div style={{ padding: 'var(--space-4) var(--space-5)' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-secondary)', marginBottom: 8 }}>تغيير الحالة</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {statusFlow.filter(s => s !== selectedApplicant.status).map(s => (
                    <Button key={s} variant="accent-soft" size="sm" disabled={savingStatus} onClick={() => handleStatusButtonClick(s)}>{statusLabels[s]}</Button>
                  ))}
                  {selectedApplicant.status !== 'on_hold' && <Button variant="warning-soft" size="sm" disabled={savingStatus} onClick={() => handleStatusButtonClick('on_hold')}>تعليق</Button>}
                  {selectedApplicant.status !== 'rejected' && <Button variant="danger" size="sm" disabled={savingStatus} onClick={() => handleStatusButtonClick('rejected')}>رفض</Button>}
                </div>

                {showRejectForm && (
                  <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-4)', background: 'var(--color-surface-sunken)', borderRadius: 'var(--radius-md)', maxWidth: 500 }}>
                    <label style={formLabelStyle}>سبب الرفض *</label>
                    <select value={rejectReason} onChange={e => setRejectReason(e.target.value)} style={formSelectStyle}>
                      <option value="">اختر السبب...</option>
                      {rejectionReasons.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={addToPoolChecked} onChange={e => setAddToPoolChecked(e.target.checked)} />
                      إضافة لبنك المرشحين
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button variant="danger" size="sm" disabled={savingStatus} onClick={confirmReject}>تأكيد الرفض</Button>
                      <Button variant="secondary" size="sm" onClick={() => setShowRejectForm(false)}>إلغاء</Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card style={{ marginBottom: 'var(--space-4)' }}>
            <div className="ui-card__header">
              <h3 className="ui-card__title" style={{ fontSize: 'var(--text-md)' }}>البيانات الأساسية</h3>
              {!readOnly && <Button variant="secondary" size="sm" onClick={() => setShowEditInfo(!showEditInfo)}>{showEditInfo ? 'إلغاء' : 'تعديل'}</Button>}
            </div>
            {showEditInfo ? (
              <div style={{ padding: 'var(--space-5)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', maxWidth: 600 }}>
                  <Input label="البريد الإلكتروني" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} style={{ direction: 'ltr' }} />
                  <Input label="سنوات الخبرة" type="number" value={editForm.years_experience} onChange={e => setEditForm({ ...editForm, years_experience: e.target.value })} />
                  <Input label="اللغات" value={editForm.languages} onChange={e => setEditForm({ ...editForm, languages: e.target.value })} />
                  <Input label="الموقع" value={editForm.location} onChange={e => setEditForm({ ...editForm, location: e.target.value })} />
                  <Input label="الجنسية" value={editForm.nationality} onChange={e => setEditForm({ ...editForm, nationality: e.target.value })} />
                  <Input label="الراتب المتوقع" type="number" value={editForm.expected_salary} onChange={e => setEditForm({ ...editForm, expected_salary: e.target.value })} />
                  <Input label="الراتب المعروض" type="number" value={editForm.offered_salary} onChange={e => setEditForm({ ...editForm, offered_salary: e.target.value })} />
                </div>
                <Button variant="success" size="sm" onClick={saveEditInfo} style={{ marginTop: 'var(--space-2)' }}>حفظ</Button>
              </div>
            ) : (
              <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
                {[
                  { label: 'البريد الإلكتروني', value: selectedApplicant.email },
                  { label: 'الخبرة', value: selectedApplicant.years_experience != null ? `${selectedApplicant.years_experience} سنة` : null },
                  { label: 'اللغات', value: selectedApplicant.languages },
                  { label: 'الموقع', value: selectedApplicant.location },
                  { label: 'الجنسية', value: selectedApplicant.nationality },
                  { label: 'الراتب المتوقع', value: selectedApplicant.expected_salary ? selectedApplicant.expected_salary.toLocaleString('ar-IQ') : null },
                  { label: 'الراتب المعروض', value: selectedApplicant.offered_salary ? selectedApplicant.offered_salary.toLocaleString('ar-IQ') : null },
                ].map(item => (
                  <div key={item.label} style={{ background: 'var(--color-surface-sunken)', borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>{item.value || '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card style={{ marginBottom: 'var(--space-4)' }}>
            <div className="ui-card__header"><h3 className="ui-card__title" style={{ fontSize: 'var(--text-md)' }}>الملفات</h3></div>
            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
              {fileTypeOptions.map(ft => (
                <div key={ft.key} style={{ border: 'var(--border-width-thin) solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 8 }}>{ft.icon} {ft.label}</div>
                  {files.filter(f => f.file_type === ft.key).length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginBottom: 8 }}>لا توجد ملفات</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                      {files.filter(f => f.file_type === ft.key).map(f => (
                        <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-surface-sunken)', borderRadius: 6, padding: '4px 8px' }}>
                          <a href={f.file_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--color-accent)', textDecoration: 'none', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>📄 {f.file_name}</a>
                          {!readOnly && <button onClick={() => deleteFile(f)} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: 13, padding: '0 4px' }}>✕</button>}
                        </div>
                      ))}
                    </div>
                  )}
                  {!readOnly && (
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--color-accent-surface)', color: 'var(--color-accent-hover)', border: 'var(--border-width-thin) dashed var(--color-border-strong)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>
                      {uploadingType === ft.key ? '⏳...' : '📎 رفع'}
                      <input type="file" style={{ display: 'none' }} onChange={e => handleFileUpload(ft.key, e)} disabled={uploadingType !== null} />
                    </label>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="ui-card__header"><h3 className="ui-card__title" style={{ fontSize: 'var(--text-md)' }}>سجل الملاحظات</h3></div>
            <div style={{ padding: '16px 20px' }}>
              {!readOnly && (
                <div style={{ marginBottom: 16, padding: 'var(--space-4)', background: 'var(--color-surface-sunken)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <select value={newNoteType} onChange={e => setNewNoteType(e.target.value)} style={{ ...selectStyle, minWidth: 140 }}>
                      {noteTypeOptions.map(n => <option key={n.key} value={n.key}>{n.label}</option>)}
                    </select>
                    <input value={newNoteContent} onChange={e => setNewNoteContent(e.target.value)} placeholder="نص الملاحظة..."
                      style={{ flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 'var(--radius-md)', border: 'var(--border-width-default) solid var(--color-border-strong)', fontSize: 'var(--text-sm)', color: 'var(--color-text)' }} />
                  </div>

                  {(newNoteType === 'interview_1' || newNoteType === 'interview_2') && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 8 }}>
                        {scoreCriteria.map(c => (
                          <div key={c.key}>
                            <label style={formLabelStyle}>{c.label}</label>
                            <select value={newNoteScores[c.key]} onChange={e => setNewNoteScores({ ...newNoteScores, [c.key]: Number(e.target.value) })} style={selectStyle}>
                              {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </div>
                        ))}
                      </div>
                      {newNoteType === 'interview_2' && (
                        <Input label="اسم المُقابِل *" value={newNoteInterviewer} onChange={e => setNewNoteInterviewer(e.target.value)} style={{ maxWidth: 300 }} />
                      )}
                    </div>
                  )}
                  <Button variant="primary" size="sm" onClick={addNote}>إضافة</Button>
                </div>
              )}

              {notes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-faint)' }}>لا توجد ملاحظات</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {notes.map(n => (
                    <div key={n.id} style={{ background: 'var(--color-surface-sunken)', borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <Badge tone={n.note_type === 'stage_change' ? 'tertiary' : n.note_type.startsWith('interview') ? 'accent' : 'neutral'} size="sm">{statusLabels[n.note_type] || noteTypeOptions.find(t => t.key === n.note_type)?.label || n.note_type}</Badge>
                            <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>{new Date(n.created_at).toLocaleString('ar-IQ')}</span>
                          </div>
                          {n.content && <div style={{ fontSize: 14, color: 'var(--color-text)' }}>{n.content}</div>}
                          {n.scores && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                              {scoreCriteria.map(c => (
                                <span key={c.key} style={{ fontSize: 11, background: 'var(--color-surface)', border: 'var(--border-width-thin) solid var(--color-border)', borderRadius: 12, padding: '2px 8px', color: 'var(--color-text-secondary)' }}>
                                  {c.label}: {n.scores![c.key]}/5
                                </span>
                              ))}
                              {n.interviewer_name && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>المُقابِل: {n.interviewer_name}</span>}
                            </div>
                          )}
                        </div>
                        {!readOnly && n.note_type !== 'stage_change' && (
                          <button onClick={() => deleteNote(n)} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>✕</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
