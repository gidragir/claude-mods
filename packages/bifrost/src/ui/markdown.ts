/**
 * Zero-dependency server-side Markdown to HTML renderer for Antigravity Sidecars.
 * Converts markdown text to clean, sanitized HTML with syntax styling and artifact tagging.
 */

function escapeHtml(text: string): string {
  if (typeof text !== 'string') return ''
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function renderInline(text: string): string {
  if (!text) return ''

  // Inline code: `code`
  let out = text.replace(/`([^`]+)`/g, (_match, code) => `<code>${code}</code>`)

  // Bold & Italic: ***text***
  out = out.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')

  // Bold: **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>')

  // Italic: *text*
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  out = out.replace(/_([^_]+)_/g, '<em>$1</em>')

  // Strikethrough: ~~text~~
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>')

  // Links: [label](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
    const safeUrl = /^(https?:\/\/|file:\/\/|\/|#)/i.test(url) ? url : '#'
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`
  })

  // Artifact ID badges: e.g. RV-1, FB-2, T-3, ADR-4, AC-5, US-6, DBG-7
  out = out.replace(/\b([A-Z]{1,5}-\d+(?:-[A-Za-z0-9]+)?)\b/g, '<mark class="badge accent">$1</mark>')

  return out
}

export function renderMarkdown(rawMd: string): string {
  if (!rawMd || typeof rawMd !== 'string') return ''

  // Pre-process: escape HTML to prevent XSS
  const escaped = escapeHtml(rawMd.replace(/\r\n/g, '\n'))

  // 1. Extract fenced code blocks so they are not parsed as inline markdown
  const codeBlocks: string[] = []
  const placeholderPrefix = '@@CODEBLOCK_'
  const withPlaceholders = escaped.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const idx = codeBlocks.length
    const cleanLang = lang.trim()
    const langClass = cleanLang ? ` class="language-${cleanLang}"` : ''
    codeBlocks.push(`<pre><code${langClass}>${code.replace(/^\n+|\n+$/g, '')}</code></pre>`)
    return `${placeholderPrefix}${idx}@@`
  })

  const lines = withPlaceholders.split('\n')
  const htmlBlocks: string[] = []

  let inList = false
  let listType: 'ul' | 'ol' | null = null
  let inBlockquote = false
  let blockquoteLines: string[] = []
  let inTable = false
  let tableRows: string[] = []

  function closeList() {
    if (inList) {
      htmlBlocks.push(`</${listType}>`)
      inList = false
      listType = null
    }
  }

  function closeBlockquote() {
    if (inBlockquote) {
      htmlBlocks.push(`<blockquote><p>${blockquoteLines.map(renderInline).join('<br/>')}</p></blockquote>`)
      inBlockquote = false
      blockquoteLines = []
    }
  }

  function closeTable() {
    if (inTable) {
      if (tableRows.length > 0) {
        let tableHtml = '<div class="table-wrapper"><table>'
        const hasHeader = tableRows.length >= 2 && /^\|?(\s*:?-+:?\s*\|)+\s*$/.test(tableRows[1] ?? '')
        if (hasHeader) {
          const headerCells = (tableRows[0] ?? '')
            .split('|')
            .filter((_, i, a) => i > 0 && i < a.length - 1)
            .map(c => `<th>${renderInline(c.trim())}</th>`)
            .join('')
          tableHtml += `<thead><tr>${headerCells}</tr></thead>`

          const bodyRows = tableRows.slice(2)
          if (bodyRows.length > 0) {
            tableHtml += '<tbody>'
            for (const row of bodyRows) {
              const cells = row
                .split('|')
                .filter((_, i, a) => i > 0 && i < a.length - 1)
                .map(c => `<td>${renderInline(c.trim())}</td>`)
                .join('')
              tableHtml += `<tr>${cells}</tr>`
            }
            tableHtml += '</tbody>'
          }
        } else {
          tableHtml += '<tbody>'
          for (const row of tableRows) {
            const cells = row
              .split('|')
              .filter((_, i, a) => i > 0 && i < a.length - 1)
              .map(c => `<td>${renderInline(c.trim())}</td>`)
              .join('')
            tableHtml += `<tr>${cells}</tr>`
          }
          tableHtml += '</tbody>'
        }
        tableHtml += '</table></div>'
        htmlBlocks.push(tableHtml)
      }
      inTable = false
      tableRows = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? ''
    const trimmed = rawLine.trim()

    // Empty line: close blocks
    if (!trimmed) {
      closeList()
      closeBlockquote()
      closeTable()
      continue
    }

    // Code block placeholder
    const cbMatch = trimmed.match(/^@@CODEBLOCK_(\d+)@@$/)
    if (cbMatch) {
      closeList()
      closeBlockquote()
      closeTable()
      const idx = Number.parseInt(cbMatch[1] ?? '0', 10)
      htmlBlocks.push(codeBlocks[idx] ?? '')
      continue
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      closeList()
      closeBlockquote()
      closeTable()
      const level = (headingMatch[1] ?? '#').length
      const targetLevel = Math.min(level + 1, 6)
      const text = headingMatch[2] ?? ''
      htmlBlocks.push(`<h${targetLevel}>${renderInline(text)}</h${targetLevel}>`)
      continue
    }

    // Blockquote
    const bqMatch = trimmed.match(/^(&gt;|>)\s?(.*)$/)
    if (bqMatch) {
      closeList()
      closeTable()
      inBlockquote = true
      blockquoteLines.push(bqMatch[2] ?? '')
      continue
    }
    if (inBlockquote) {
      closeBlockquote()
    }

    // Table rows
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      closeList()
      inTable = true
      tableRows.push(trimmed)
      continue
    }
    if (inTable) {
      closeTable()
    }

    // Unordered list
    const ulMatch = trimmed.match(/^[-*+]\s+(.*)$/)
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        closeList()
        inList = true
        listType = 'ul'
        htmlBlocks.push('<ul>')
      }
      htmlBlocks.push(`<li>${renderInline(ulMatch[1] ?? '')}</li>`)
      continue
    }

    // Ordered list
    const olMatch = trimmed.match(/^\d+\.\s+(.*)$/)
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        closeList()
        inList = true
        listType = 'ol'
        htmlBlocks.push('<ol>')
      }
      htmlBlocks.push(`<li>${renderInline(olMatch[1] ?? '')}</li>`)
      continue
    }

    // Normal paragraph
    closeList()
    closeBlockquote()
    closeTable()
    htmlBlocks.push(`<p>${renderInline(trimmed)}</p>`)
  }

  closeList()
  closeBlockquote()
  closeTable()

  return htmlBlocks.join('\n')
}
