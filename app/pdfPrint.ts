export function esc(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

interface GeneratePdfOptions {
  contentHtml: string
  signatureHtml: string
  styleCss: string
  headerImageUrl?: string
  headerFallbackHtml?: string
  footerImageUrl?: string
  footerFallbackHtml?: string
  landscape?: boolean
  filename: string
}

export async function generatePdf(options: GeneratePdfOptions) {
  const { filename, ...body } = options
  const res = await fetch('/api/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    alert('خطأ في توليد PDF: ' + (await res.text()))
    return
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
