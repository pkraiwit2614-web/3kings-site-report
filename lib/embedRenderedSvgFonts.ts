/**
 * Make a cloned SVG self-contained before it is rasterized through an Image.
 * next/font/google applies Noto Sans Thai through @font-face rules on the page;
 * those rules are not available inside a standalone SVG image by default.
 */
const normalizedFamily = (name: string) => name.trim().replace(/^["']|["']$/g, '').toLowerCase()

function readFontFamilies(element: Element): string[] {
  return getComputedStyle(element).fontFamily.split(',').map(normalizedFamily)
}

function blobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Font conversion returned no data'))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read font file'))
    reader.readAsDataURL(blob)
  })
}

type FontRule = { cssText: string; baseUrl: string }

export async function embedRenderedSvgFonts(source: SVGSVGElement, clone: SVGSVGElement): Promise<void> {
  await document.fonts.ready

  const fontStack = getComputedStyle(source).fontFamily
  clone.style.fontFamily = fontStack
  clone.querySelectorAll('[font-family="inherit"]').forEach(node => {
    node.setAttribute('font-family', fontStack)
  })

  // Include descendants in case the diagram gains text-specific font styles.
  const usedFamilies = new Set([
    ...readFontFamilies(source),
    ...Array.from(source.querySelectorAll('text')).flatMap(readFontFamilies),
  ])
  const rules: FontRule[] = []
  const visitRules = (cssRules: CSSRuleList, baseUrl: string) => {
    for (const rule of Array.from(cssRules)) {
      if (rule.type === CSSRule.FONT_FACE_RULE) {
        const fontRule = rule as CSSFontFaceRule
        if (usedFamilies.has(normalizedFamily(fontRule.style.fontFamily)) && /url\s*\(/i.test(fontRule.style.src)) {
          rules.push({ cssText: fontRule.cssText, baseUrl })
        }
      } else if (rule.type === CSSRule.IMPORT_RULE) {
        const imported = (rule as CSSImportRule).styleSheet
        if (imported) visitSheet(imported)
      } else if ('cssRules' in rule) {
        // Supports font faces nested within @layer or other grouping rules.
        visitRules((rule as CSSGroupingRule).cssRules, baseUrl)
      }
    }
  }
  const visited = new Set<CSSStyleSheet>()
  const visitSheet = (sheet: CSSStyleSheet) => {
    if (visited.has(sheet)) return
    visited.add(sheet)
    try {
      visitRules(sheet.cssRules, sheet.href || document.baseURI)
    } catch {
      // Cross-origin stylesheets may not expose cssRules. Local next/font CSS does.
    }
  }
  Array.from(document.styleSheets).forEach(sheet => visitSheet(sheet))

  // Generated next/font family names require their actual font bytes, rather
  // than falling back to a different typeface in the exported PNG.
  const primaryFamily = normalizedFamily(fontStack.split(',')[0])
  if (primaryFamily.startsWith('__') && rules.length === 0) {
    throw new Error('The active web font could not be found for PNG export')
  }

  const fontCache = new Map<string, Promise<string>>()
  const embeddedRules = await Promise.all(rules.map(async ({ cssText, baseUrl }) => {
    const matches = Array.from(cssText.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^)]*?))\s*\)/gi))
    const replacements = await Promise.all(matches.map(async match => {
      const rawUrl = (match[1] || match[2] || match[3]).trim()
      if (rawUrl.startsWith('data:')) return match[0]
      const url = new URL(rawUrl, baseUrl).href
      if (!fontCache.has(url)) {
        fontCache.set(url, (async () => {
          const response = await fetch(url)
          if (!response.ok) throw new Error('Unable to load web font for PNG export')
          return blobAsDataUrl(await response.blob())
        })())
      }
      return 'url("' + await fontCache.get(url)! + '")'
    }))
    matches.forEach((match, index) => {
      cssText = cssText.replace(match[0], replacements[index])
    })
    return cssText
  }))

  if (embeddedRules.length) {
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    style.textContent = embeddedRules.join('\n')
    clone.insertBefore(style, clone.firstChild)
  }
}
