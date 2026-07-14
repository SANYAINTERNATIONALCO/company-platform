import { NextRequest } from 'next/server'
import { imageSize } from 'image-size'
import { PDFDocument } from 'pdf-lib'

export const runtime = 'nodejs'
export const maxDuration = 30

// خط Cairo يُجلب من Google Fonts عادةً عبر رابط شبكة — هذا يسبب اختلاف توقيت
// تحميل بسيط بين طلب وآخر، وقد يجعل النص يُقاس بخط بديل مؤقت قبل اكتمال Cairo رغم
// انتظار document.fonts.ready، مما يُنتج عدد صفحات مختلف لنفس المحتوى بين مرتين.
// نجلب ملفات الخط مرة واحدة ونضمّنها مباشرة بالـHTML (بدون أي طلب شبكة عند التوليد)
// لضمان نتيجة متطابقة دائماً، ونخزّنها مؤقتاً بذاكرة العملية لإعادة الاستخدام
let cachedFontCss: string | null = null
async function getInlineFontCss(): Promise<string> {
  if (cachedFontCss) return cachedFontCss
  try {
    const cssRes = await fetch('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    })
    let css = await cssRes.text()
    const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1])
    for (const url of [...new Set(urls)]) {
      const fontRes = await fetch(url)
      const buffer = Buffer.from(await fontRes.arrayBuffer())
      const dataUri = `data:font/woff2;base64,${buffer.toString('base64')}`
      css = css.split(url).join(dataUri)
    }
    cachedFontCss = css
    return css
  } catch {
    return ''
  }
}

interface PdfRequestBody {
  contentHtml: string
  signatureHtml: string
  styleCss: string
  headerImageUrl?: string
  headerFallbackHtml?: string
  footerImageUrl?: string
  footerFallbackHtml?: string
  landscape?: boolean
}

const SIDE_MARGIN_MM = 10
const HEADER_GAP_MM = 12
const FOOTER_GAP_MM = 6
const PX_PER_MM = 96 / 25.4

interface ImageBlock {
  html: string
  heightMM: number
}

// يحسب عرض/ارتفاع الترويسة ديناميكياً من الأبعاد الفعلية للصورة، بدل قيم ثابتة،
// حتى تمتد على كامل عرض الصفحة القابل للطباعة بنفس النسبة الأصلية دون تشويه أو تراكب.
// maxHeightMM حماية فقط لحالة صورة بنسبة غير معتادة (شبه مربعة/عمودية) — بشعار
// أو ترويسة عرضية طبيعية هذا السقف لا يتفعّل أصلاً والصورة تمتد بعرض الصفحة كاملاً
async function buildImageBlock(url: string | undefined, pageWidthMM: number, maxHeightMM: number): Promise<ImageBlock | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || 'image/png'
    const buffer = Buffer.from(await res.arrayBuffer())
    const imgWidthMM = pageWidthMM - 2 * SIDE_MARGIN_MM
    let heightMM = 20
    try {
      const dims = imageSize(new Uint8Array(buffer))
      if (dims.width && dims.height) heightMM = imgWidthMM * (dims.height / dims.width)
    } catch {
      // إذا فشل قراءة الأبعاد، تُستخدم قيمة احتياطية معقولة (20mm) بدل تعطيل الترويسة
    }
    heightMM = Math.min(heightMM, maxHeightMM)
    const dataUri = `data:${contentType};base64,${buffer.toString('base64')}`
    const html = `<div style="width:100%;padding:0 ${SIDE_MARGIN_MM}mm;box-sizing:border-box;"><img src="${dataUri}" style="width:100%;max-height:${heightMM}mm;object-fit:contain;display:block;"/></div>`
    return { html, heightMM }
  } catch {
    return null
  }
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

function buildDoc(bodyInner: string, styleCss: string, fontCss: string): string {
  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <style>
        ${fontCss}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Cairo', Arial, sans-serif; direction: rtl; color: #111; }
        ${styleCss}
      </style>
    </head>
    <body>${bodyInner}</body>
    </html>
  `
}

async function countPages(buffer: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(buffer)
  return doc.getPageCount()
}

export async function POST(req: NextRequest) {
  const body: PdfRequestBody = await req.json()
  const { contentHtml, signatureHtml, styleCss, landscape } = body

  const pageWidthMM = landscape ? 297 : 210
  const pageHeightMM = landscape ? 210 : 297

  const [headerImg, footerImg] = await Promise.all([
    buildImageBlock(body.headerImageUrl, pageWidthMM, 40),
    buildImageBlock(body.footerImageUrl, pageWidthMM, 30)
  ])

  const headerHtml = headerImg ? headerImg.html : (body.headerFallbackHtml || '')
  const footerHtml = footerImg ? footerImg.html : (body.footerFallbackHtml || '')

  // بداية المحتوى تُحسب من نهاية الترويسة الفعلية + فراغ ثابت، وليس رقماً تقديرياً
  const marginTopMM = headerImg ? headerImg.heightMM + HEADER_GAP_MM : (headerHtml ? 20 : 10)
  const marginBottomMM = footerImg ? footerImg.heightMM + FOOTER_GAP_MM : (footerHtml ? 16 : 10)
  const availableHeightMM = pageHeightMM - marginTopMM - marginBottomMM
  const availableHeightPx = availableHeightMM * PX_PER_MM
  const contentWidthPx = (pageWidthMM - 2 * SIDE_MARGIN_MM) * PX_PER_MM

  const pdfOptions = {
    format: 'A4' as const,
    landscape: !!landscape,
    printBackground: true,
    displayHeaderFooter: !!(headerHtml || footerHtml),
    headerTemplate: headerHtml || '<span></span>',
    footerTemplate: footerHtml || '<span></span>',
    margin: {
      top: `${marginTopMM}mm`,
      bottom: `${marginBottomMM}mm`,
      left: `${SIDE_MARGIN_MM}mm`,
      right: `${SIDE_MARGIN_MM}mm`
    }
  }

  const fontCss = await getInlineFontCss()
  const browser = await getBrowser()
  try {
    async function renderPdf(htmlDoc: string): Promise<Uint8Array> {
      const page = await browser.newPage()
      try {
        await page.setViewport({ width: Math.ceil(contentWidthPx), height: 2000 })
        await page.setContent(htmlDoc, { waitUntil: 'load' })
        await page.evaluate(() => document.fonts.ready)
        return new Uint8Array(await page.pdf(pdfOptions))
      } finally {
        await page.close()
      }
    }

    // الجدول لوحده أولاً، لمعرفة عدد الصفحات الحقيقي الذي يحتاجه فعلياً (بدل تقدير حسابي
    // قد يختلف عن تقسيم الصفحات الحقيقي بمحرك الطباعة، خصوصاً مع تكرار رأس الجدول بكل صفحة)
    const tableOnlyPages = await countPages(await renderPdf(
      buildDoc(`<div id="pdf-content">${contentHtml}</div>`, styleCss, fontCss)
    ))

    if (tableOnlyPages <= 1) {
      // صفحة واحدة: نقيس المساحة المتبقية بدقة وندفع التوقيع لأسفلها مباشرة
      const page = await browser.newPage()
      try {
        await page.setViewport({ width: Math.ceil(contentWidthPx), height: 2000 })
        await page.setContent(buildDoc(`
          <div id="pdf-content">${contentHtml}</div>
          <div id="pdf-sig-wrap" style="display:flex;flex-direction:column;">
            <div style="flex:1"></div>
            <div id="pdf-sig-block">${signatureHtml}</div>
          </div>
        `, styleCss, fontCss), { waitUntil: 'load' })
        await page.evaluate(() => document.fonts.ready)
        await page.evaluate((availableHeightPx: number) => {
          const contentEl = document.getElementById('pdf-content')
          const sigWrap = document.getElementById('pdf-sig-wrap')
          const sigBlock = document.getElementById('pdf-sig-block')
          if (!contentEl || !sigWrap || !sigBlock) return
          const remaining = availableHeightPx - contentEl.getBoundingClientRect().height
          const sigHeight = sigBlock.getBoundingClientRect().height
          if (remaining >= sigHeight + 10) {
            sigWrap.style.minHeight = remaining + 'px'
          } else {
            sigWrap.style.pageBreakBefore = 'always'
            sigWrap.style.minHeight = availableHeightPx + 'px'
          }
        }, availableHeightPx)
        const pdfBuffer = await page.pdf(pdfOptions)
        return new Response(new Uint8Array(pdfBuffer), {
          headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="report.pdf"' }
        })
      } finally {
        await page.close()
      }
    }

    // متعدد الصفحات: نجرّب التدفق الطبيعي أولاً (بدون أي دفع أو تثبيت قسري) ونقارن
    // عدد صفحاته الفعلي بعدد صفحات الجدول لوحده — هذه المقارنة حقيقة مقاسة من محرك
    // الطباعة نفسه، وليست تقديراً، فتكتشف بدقة هل التوقيع اتسع بآخر صفحة أم لا
    const naturalBuffer = await renderPdf(buildDoc(`
      <div id="pdf-content">${contentHtml}</div>
      <div id="pdf-sig-block">${signatureHtml}</div>
    `, styleCss, fontCss))
    const naturalPages = await countPages(naturalBuffer)

    if (naturalPages <= tableOnlyPages) {
      // التوقيع اتسع طبيعياً بنفس عدد صفحات الجدول — لا داعي لأي تدخل إضافي
      return new Response(new Uint8Array(naturalBuffer), {
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="report.pdf"' }
      })
    }

    // التوقيع فعلاً يحتاج صفحة إضافية: ندفعه لصفحة جديدة كاملة ونثبته بأسفلها
    const forcedBuffer = await renderPdf(buildDoc(`
      <div id="pdf-content">${contentHtml}</div>
      <div id="pdf-sig-wrap" style="display:flex;flex-direction:column;page-break-before:always;min-height:${availableHeightPx}px;">
        <div style="flex:1"></div>
        <div id="pdf-sig-block">${signatureHtml}</div>
      </div>
    `, styleCss, fontCss))
    return new Response(new Uint8Array(forcedBuffer), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="report.pdf"' }
    })
  } finally {
    await browser.close()
  }
}
