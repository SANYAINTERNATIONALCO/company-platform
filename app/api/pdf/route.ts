import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

interface PdfRequestBody {
  bodyHtml: string
  styleCss: string
  headerHtml?: string
  footerHtml?: string
  landscape?: boolean
  marginTop?: string
  marginBottom?: string
}

// Puppeteer's header/footer templates don't wait for external resources to
// load before the PDF is captured, so <img src="https://..."> silently
// fails to render (and can drop the rest of the template with it). Inlining
// the image as a base64 data URI makes it available synchronously.
async function inlineImages(html: string): Promise<string> {
  const urls = [...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].map(m => m[1])
  let result = html
  for (const url of [...new Set(urls)]) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const contentType = res.headers.get('content-type') || 'image/png'
      const buffer = Buffer.from(await res.arrayBuffer())
      const dataUri = `data:${contentType};base64,${buffer.toString('base64')}`
      result = result.split(url).join(dataUri)
    } catch {
      // إذا فشل تحميل الصورة، تُترك الرابط الأصلي (سيظهر فارغاً بدل تعطيل الترويسة بالكامل)
    }
  }
  return result
}

async function getBrowser() {
  const isLocal = !process.env.VERCEL_ENV
  if (isLocal) {
    const puppeteer = await import('puppeteer')
    return puppeteer.launch({ headless: true })
  }
  const chromium = (await import('@sparticuz/chromium')).default
  const puppeteerCore = await import('puppeteer-core')
  const executablePath = await chromium.executablePath()
  return puppeteerCore.launch({
    args: chromium.args,
    executablePath,
    headless: true
  })
}

export async function POST(req: NextRequest) {
  const body: PdfRequestBody = await req.json()
  const { bodyHtml, styleCss, landscape, marginTop, marginBottom } = body
  const [headerHtml, footerHtml] = await Promise.all([
    body.headerHtml ? inlineImages(body.headerHtml) : Promise.resolve(body.headerHtml),
    body.footerHtml ? inlineImages(body.footerHtml) : Promise.resolve(body.footerHtml)
  ])

  const html = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Cairo', Arial, sans-serif; direction: rtl; color: #111; }
        ${styleCss}
      </style>
    </head>
    <body>${bodyHtml}</body>
    </html>
  `

  const browser = await getBrowser()
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: !!landscape,
      printBackground: true,
      displayHeaderFooter: !!(headerHtml || footerHtml),
      headerTemplate: headerHtml || '<span></span>',
      footerTemplate: footerHtml || '<span></span>',
      margin: {
        top: marginTop || (headerHtml ? '25mm' : '10mm'),
        bottom: marginBottom || (footerHtml ? '20mm' : '10mm'),
        left: '10mm',
        right: '10mm'
      }
    })
    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="report.pdf"'
      }
    })
  } finally {
    await browser.close()
  }
}
