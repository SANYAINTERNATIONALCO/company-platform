'use client'
import { useState, useEffect, useMemo } from 'react'
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
  passport_number: string
  entry_date: string
  visa_duration: number
  expiry_date: string
  status: string
  notes: string
  created_at: string
}

interface AnnualVisa {
  id: string
  full_name: string
  nationality: string
  passport_number: string
  entry_date: string
  expiry_date: string
  status: string
  notes: string
  created_at: string
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
  const [activeTab, setActiveTab] = useState<'stats' | 'tourist' | 'annual'>('stats')
  const [stats, setStats] = useState<VisaStat[]>([])
  const [files, setFiles] = useState<VisaFile[]>([])
  const [loading, setLoading] = useState(false)
  const [editMode, setEditMode] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, number>>({})
  const [uploading, setUploading] = useState<string | null>(null)

  // Tourist visa states
  const [touristVisas, setTouristVisas] = useState<TouristVisa[]>([])
  const [showTouristForm, setShowTouristForm] = useState(false)
  const [touristForm, setTouristForm] = useState({ full_name: '', nationality: '', passport_number: '', entry_date: '', visa_duration: '30' })
  const [touristSearch, setTouristSearch] = useState('')
  const [touristSelected, setTouristSelected] = useState<string[]>([])

  // Annual visa states
  const [annualVisas, setAnnualVisas] = useState<AnnualVisa[]>([])
  const [showAnnualForm, setShowAnnualForm] = useState(false)
  const [annualForm, setAnnualForm] = useState({ full_name: '', nationality: '', passport_number: '', entry_date: '' })
  const [annualSearch, setAnnualSearch] = useState('')
  const [annualSelected, setAnnualSelected] = useState<string[]>([])

  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [todayStr, setTodayStr] = useState('')

  useEffect(() => {
    const t = new Date().toISOString().split('T')[0]
    setTodayStr(t)
    loadStats()
    loadFiles()
    loadTouristVisas()
    loadAnnualVisas()
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
    const { data } = await supabase.from('tourist_visas').select('*').order('created_at', { ascending: false })
    const visas = (data as TouristVisa[]) || []
    const today = new Date(); today.setHours(0,0,0,0)
    for (const visa of visas) {
      const expiry = new Date(visa.expiry_date); expiry.setHours(0,0,0,0)
      if (expiry < today && visa.status !== 'violated') {
        await supabase.from('tourist_visas').update({ status: 'violated' }).eq('id', visa.id)
      }
    }
    const { data: updated } = await supabase.from('tourist_visas').select('*').order('created_at', { ascending: false })
    setTouristVisas((updated as TouristVisa[]) || [])
  }

  async function loadAnnualVisas() {
    const { data } = await supabase.from('annual_visas').select('*').order('created_at', { ascending: false })
    const visas = (data as AnnualVisa[]) || []
    const today = new Date(); today.setHours(0,0,0,0)
    for (const visa of visas) {
      const expiry = new Date(visa.expiry_date); expiry.setHours(0,0,0,0)
      if (expiry < today && visa.status !== 'violated') {
        await supabase.from('annual_visas').update({ status: 'violated' }).eq('id', visa.id)
      }
    }
    const { data: updated } = await supabase.from('annual_visas').select('*').order('created_at', { ascending: false })
    setAnnualVisas((updated as AnnualVisa[]) || [])
  }

  function getDaysRemaining(expiryDate: string): number {
    const today = new Date(); today.setHours(0,0,0,0)
    const expiry = new Date(expiryDate); expiry.setHours(0,0,0,0)
    return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  function getTouristStatus(visa: TouristVisa) {
    if (visa.status === 'violated') return { label: 'مخالف', bg: '#fee2e2', color: '#dc2626' }
    const days = getDaysRemaining(visa.expiry_date)
    if (days <= 0) return { label: 'منتهية', bg: '#fee2e2', color: '#dc2626' }
    if (days <= 7) return { label: days + ' أيام', bg: '#fef9c3', color: '#b45309' }
    return { label: days + ' يوم', bg: '#dcfce7', color: '#15803d' }
  }

  function getAnnualStatus(visa: AnnualVisa) {
    if (visa.status === 'violated') return { label: 'مخالف', bg: '#fee2e2', color: '#dc2626' }
    const days = getDaysRemaining(visa.expiry_date)
    const fourMonthsDays = 120
    if (days <= 0) return { label: 'منتهية', bg: '#fee2e2', color: '#dc2626' }
    if (days <= fourMonthsDays) return { label: days + ' يوم', bg: '#fef9c3', color: '#b45309' }
    return { label: days + ' يوم', bg: '#dcfce7', color: '#15803d' }
  }

  const touristViolated = touristVisas.filter(v => v.status === 'violated' || getDaysRemaining(v.expiry_date) <= 0).length
  const touristWarning = touristVisas.filter(v => v.status !== 'violated' && getDaysRemaining(v.expiry_date) > 0 && getDaysRemaining(v.expiry_date) <= 7).length
  const annualViolated = annualVisas.filter(v => v.status === 'violated' || getDaysRemaining(v.expiry_date) <= 0).length
  const annualWarning = annualVisas.filter(v => v.status !== 'violated' && getDaysRemaining(v.expiry_date) > 0 && getDaysRemaining(v.expiry_date) <= 120).length

  async function addTouristVisa() {
    if (!touristForm.full_name || !touristForm.entry_date) { alert('يرجى تعبئة الاسم وتاريخ الدخول'); return }
    setLoading(true)
    const { error } = await supabase.from('tourist_visas').insert([{
      full_name: touristForm.full_name,
      nationality: touristForm.nationality,
      passport_number: touristForm.passport_number,
      entry_date: touristForm.entry_date,
      visa_duration: parseInt(touristForm.visa_duration),
      status: 'active'
    }])
    if (error) alert('خطأ: ' + error.message)
    else {
      setTouristForm({ full_name: '', nationality: '', passport_number: '', entry_date: '', visa_duration: '30' })
      setShowTouristForm(false)
      loadTouristVisas()
    }
    setLoading(false)
  }

  async function addAnnualVisa() {
    if (!annualForm.full_name || !annualForm.entry_date) { alert('يرجى تعبئة الاسم وتاريخ الدخول'); return }
    setLoading(true)
    const { error } = await supabase.from('annual_visas').insert([{
      full_name: annualForm.full_name,
      nationality: annualForm.nationality,
      passport_number: annualForm.passport_number,
      entry_date: annualForm.entry_date,
      status: 'active'
    }])
    if (error) alert('خطأ: ' + error.message)
    else {
      setAnnualForm({ full_name: '', nationality: '', passport_number: '', entry_date: '' })
      setShowAnnualForm(false)
      loadAnnualVisas()
    }
    setLoading(false)
  }

  async function deleteTouristVisa(id: string) {
    if (!confirm('هل أنت متأكد من الحذف؟')) return
    await supabase.from('tourist_visas').delete().eq('id', id)
    loadTouristVisas()
  }

  async function deleteAnnualVisa(id: string) {
    if (!confirm('هل أنت متأكد من الحذف؟')) return
    await supabase.from('annual_visas').delete().eq('id', id)
    loadAnnualVisas()
  }

  async function deleteSelectedTourist() {
    if (touristSelected.length === 0) return
    if (!confirm('هل أنت متأكد من حذف ' + touristSelected.length + ' شخص محدد؟')) return
    await supabase.from('tourist_visas').delete().in('id', touristSelected)
    setTouristSelected([])
    loadTouristVisas()
  }

  async function deleteSelectedAnnual() {
    if (annualSelected.length === 0) return
    if (!confirm('هل أنت متأكد من حذف ' + annualSelected.length + ' شخص محدد؟')) return
    await supabase.from('annual_visas').delete().in('id', annualSelected)
    setAnnualSelected([])
    loadAnnualVisas()
  }

  async function saveTouristNote(id: string) {
    await supabase.from('tourist_visas').update({ notes: noteText }).eq('id', id)
    setEditingNote(null); setNoteText('')
    loadTouristVisas()
  }

  async function saveAnnualNote(id: string) {
    await supabase.from('annual_visas').update({ notes: noteText }).eq('id', id)
    setEditingNote(null); setNoteText('')
    loadAnnualVisas()
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
