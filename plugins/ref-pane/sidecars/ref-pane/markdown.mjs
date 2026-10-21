/**
 * Zero-dependency server-side Markdown to HTML renderer for Antigravity Sidecars.
 * Converts markdown text to clean, sanitized HTML with syntax styling and artifact tagging.
 */

function escapeHtml(text) {
  if (typeof text !== 'string') return ''
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function renderInline(text) {
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

  // Artifact ID badges: e.g. RV-1, FB-2, T-3, ADR-4, AC-5
  out = out.replace(/\b([A-Z]{1,4}-\d+(?:-[A-Za-z0-9]+)?)\b/g, '<span class="artifact-badge">$1</span>')

  return out
}

export function renderMarkdown(rawMd) {
  if (!rawMd || typeof rawMd !== 'string') return ''

  // Pre-process: escape HTML to prevent XSS
  const escaped = escapeHtml(rawMd.replace(/\r\n/g, '\n'))

  // 1. Extract fenced code blocks so they are not parsed as inline markdown
  const codeBlocks = []
  const placeholderPrefix = '@@CODEBLOCK_'
  const withPlaceholders = escaped.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const idx = codeBlocks.length
    const cleanLang = lang.trim()
    const langClass = cleanLang ? ` class="language-${cleanLang}"` : ''
    codeBlocks.push(`<pre class="code-block"><code${langClass}>${code.replace(/^\n+|\n+$/g, '')}</code></pre>`)
    return `${placeholderPrefix}${idx}@@`
  })

  const lines = withPlaceholders.split('\n')
  const htmlBlocks = []

  let inList = false
  let listType = null // 'ul' | 'ol'
  let inBlockquote = false
  let blockquoteLines = []
  let inTable = false
  let tableRows = []

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
        // First row is header if second row is divider
        const hasHeader = tableRows.length >= 2 && /^\|?(\s*:?-+:?\s*\|)+\s*$/.test(tableRows[1])
        if (hasHeader) {
          const headerCells = tableRows[0]
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
    const line = lines[i].trimEnd()
    const trimmed = line.trim()

    // Code block placeholder
    if (trimmed.startsWith(placeholderPrefix) && trimmed.endsWith('@@')) {
      closeList()
      closeBlockquote()
      closeTable()
      const match = trimmed.match(/@@CODEBLOCK_(\d+)@@/)
      if (match) {
        const idx = parseInt(match[1], 10)
        htmlBlocks.push(codeBlocks[idx])
      }
      continue
    }

    // Empty line
    if (!trimmed) {
      closeList()
      closeBlockquote()
      closeTable()
      continue
    }

    // Table row
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      closeList()
      closeBlockquote()
      inTable = true
      tableRows.push(trimmed)
      continue
    } else {
      closeTable()
    }

    // Blockquote
    if (trimmed.startsWith('&gt;') || trimmed.startsWith('>')) {
      closeList()
      inBlockquote = true
      const content = trimmed.replace(/^(&gt;|>)\s?/, '')
      blockquoteLines.push(content)
      continue
    } else {
      closeBlockquote()
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      closeList()
      const level = headingMatch[1].length
      // Offset levels nicely for the auxiliary pane (h2->h3, h1->h2, etc.)
      const targetLevel = Math.min(level + 1, 6)
      htmlBlocks.push(`<h${targetLevel}>${renderInline(headingMatch[2])}</h${targetLevel}>`)
      continue
    }

    // Unordered List (- or *)
    const ulMatch = trimmed.match(/^[-*+]\s+(.*)$/)
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        closeList()
        inList = true
        listType = 'ul'
        htmlBlocks.push('<ul>')
      }
      htmlBlocks.push(`<li>${renderInline(ulMatch[1])}</li>`)
      continue
    }

    // Ordered List (1. 2.)
    const olMatch = trimmed.match(/^\d+\.\s+(.*)$/)
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        closeList()
        inList = true
        listType = 'ol'
        htmlBlocks.push('<ol>')
      }
      htmlBlocks.push(`<li>${renderInline(olMatch[1])}</li>`)
      continue
    }

    // Regular paragraph line
    closeList()
    htmlBlocks.push(`<p>${renderInline(trimmed)}</p>`)
  }

  closeList()
  closeBlockquote()
  closeTable()

  return htmlBlocks.join('\n')
}
