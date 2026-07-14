import { NextRequest } from 'next/server'
import { imageSize } from 'image-size'

export const runtime = 'nodejs'
export const maxDuration = 30

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
    <body>
      <div id="pdf-content">${contentHtml}</div>
      <div id="pdf-sig-wrap" style="display:flex;flex-direction:column;">
        <div style="flex:1"></div>
        <div id="pdf-sig-block">${signatureHtml}</div>
      </div>
    </body>
    </html>
  `

  const browser = await getBrowser()
  try {
    const page = await browser.newPage()
    // نضبط عرض العرض (viewport) على نفس عرض منطقة الطباعة حتى يطابق قياس الارتفاع الفعلي
    // ما سيحصل عند توليد الـPDF لاحقاً
    await page.setViewport({ width: Math.ceil(contentWidthPx), height: 2000 })
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)

    // نقيس ارتفاع المحتوى الفعلي، ونقرر: هل تلتصق التوقيعات بأسفل الصفحة التي
    // ينتهي فيها المحتوى (سواء كانت الصفحة الوحيدة أو آخر صفحة من جدول متعدد
    // الصفحات)، أم يجب دفعها لصفحة جديدة لأن آخر صفحة يشغلها المحتوى ما فيها
    // مساحة كافية. نحسب "الباقي على آخر صفحة" بباقي القسمة بدل افتراض صفحة واحدة فقط،
    // حتى لا تُدفع التوقيعات لصفحة إضافية فارغة رغم وجود مساحة كافية بآخر صفحة فعلية
    await page.evaluate((availableHeightPx: number) => {
      const contentEl = document.getElementById('pdf-content')
      const sigWrap = document.getElementById('pdf-sig-wrap')
      const sigBlock = document.getElementById('pdf-sig-block')
      if (!contentEl || !sigWrap || !sigBlock) return
      const contentHeight = contentEl.getBoundingClientRect().height
      const sigHeight = sigBlock.getBoundingClientRect().height
      const usedOnLastPage = contentHeight % availableHeightPx
      const remaining = availableHeightPx - (usedOnLastPage === 0 ? 0 : usedOnLastPage)
      if (remaining >= sigHeight + 10) {
        sigWrap.style.minHeight = remaining + 'px'
      } else {
        sigWrap.style.pageBreakBefore = 'always'
        sigWrap.style.minHeight = availableHeightPx + 'px'
      }
    }, availableHeightPx)

    const pdfBuffer = await page.pdf({
      format: 'A4',
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
