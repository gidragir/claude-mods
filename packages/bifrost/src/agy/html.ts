/**
 * Neutral tree → HTML for the agy webview, plus the table of handlers the page's events call back.
 *
 * Every interactive element gets a `data-bf-id` (its `key` when it has one, so ids stay stable across
 * renders); the client posts that id back and the server runs the handler from the latest render.
 */

import { isElement, textOf, type VElement, type VNode } from '../core/vnode'
import { renderMarkdown } from './markdown'

export interface ElementHandlers {
  press?: () => unknown
  input?: (value: string) => unknown
  submit?: (value: string) => unknown
  select?: (value: string) => unknown
}

export interface HtmlRender {
  html: string
  handlers: Map<string, ElementHandlers>
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, c => ESC[c]!)

const SPACE: Record<string, number> = { xs: 0.25, sm: 0.5, md: 1, lg: 1.5, xl: 2 }
const space = (v: unknown): string | undefined =>
  v === undefined
    ? undefined
    : typeof v === 'number'
      ? `${v * 0.5}em`
      : SPACE[String(v)] !== undefined
        ? `${SPACE[String(v)]}em`
        : undefined
const size = (v: unknown): string | undefined => (v === undefined ? undefined : typeof v === 'number' ? `${v}ch` : String(v))
const color = (c: unknown): string | undefined =>
  typeof c === 'string' ? `var(--bf-${c.replace(/[^\w-]/g, '')}, ${c.replace(/[^\w#-]/g, '')})` : undefined
const safeHref = (href: string) => (/^(https?:\/\/|file:\/\/|\/|#)/i.test(href) ? href : '#')

const KIND_TAG: Record<string, string> = {
  card: 'article',
  list: 'section',
  toolbar: 'nav',
  header: 'header',
  detail: 'article',
  section: 'section',
}

function style(entries: Record<string, string | number | undefined>): string {
  const css = Object.entries(entries)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
  return css === '' ? '' : ` style="${escapeHtml(css)}"`
}

const attr = (name: string, value: string | undefined) => (value === undefined ? '' : ` ${name}="${escapeHtml(value)}"`)

export function renderHtml(tree: VNode): HtmlRender {
  const handlers = new Map<string, ElementHandlers>()
  let auto = 0
  const idFor = (key: unknown): string => {
    let id = typeof key === 'string' && key !== '' ? key : `_${auto++}`
    while (handlers.has(id)) id = `${id}~`
    handlers.set(id, {})
    return id
  }

  const children = (n: VElement, inText: boolean) => n.children.map(c => node(c, inText)).join('')

  function box(n: VElement): string {
    const p = n.props as Record<string, unknown>
    const tag = KIND_TAG[String(p.kind)] ?? 'div'
    const cls = [
      'bf-box',
      p.flexDirection === 'row' ? 'bf-row' : 'bf-col',
      p.borderStyle ? 'bf-frame' : '',
      p.borderDimColor ? 'bf-frame-dim' : '',
      p.kind ? `bf-${p.kind}` : '',
    ]
      .filter(Boolean)
      .join(' ')
    const css = style({
      'flex-direction': p.flexDirection === 'row' ? 'row' : 'column',
      'flex-grow': p.flexGrow as number | undefined,
      'flex-shrink': p.flexShrink as number | undefined,
      'flex-wrap': p.flexWrap as string | undefined,
      'align-items': p.alignItems as string | undefined,
      'justify-content': p.justifyContent as string | undefined,
      gap: space(p.gap),
      width: size(p.width),
      'min-width': size(p.minWidth),
      margin: space(p.margin),
      'margin-inline': space(p.marginX),
      'margin-block': space(p.marginY),
      'margin-top': space(p.marginTop),
      'margin-bottom': space(p.marginBottom),
      padding: space(p.padding),
      'padding-inline': space(p.paddingX),
      'padding-block': space(p.paddingY),
      'border-color': p.borderColor ? color(p.borderColor) : undefined,
    })
    return `<${tag} class="${cls}"${css}>${children(n, false)}</${tag}>`
  }

  function text(n: VElement, inText: boolean): string {
    const p = n.props as Record<string, unknown>
    const tag = inText ? 'span' : 'div'
    const cls = ['bf-text', p.dimColor ? 'bf-dim' : '', p.wrap === 'truncate-end' ? 'bf-truncate' : ''].filter(Boolean).join(' ')
    const deco = [p.underline ? 'underline' : '', p.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ')
    const css = style({
      color: p.color ? color(p.color) : undefined,
      'font-weight': p.bold ? 600 : undefined,
      'font-style': p.italic ? 'italic' : undefined,
      'text-decoration': deco || undefined,
    })
    return `<${tag} class="${cls}"${css}>${children(n, true)}</${tag}>`
  }

  function element(n: VElement, inText: boolean): string {
    const p = n.props as Record<string, unknown>
    switch (n.type) {
      case 'Box':
        return box(n)
      case 'Text':
        return text(n, inText)
      case 'Button': {
        const id = idFor(p.key)
        handlers.get(id)!.press = p.onPress as () => unknown
        const label = (p.label as string | undefined) ?? textOf(n.children)
        const cls = p.variant === 'primary' ? 'bf-btn bf-primary' : 'bf-btn'
        return `<button type="button" class="${cls}" data-bf-id="${escapeHtml(id)}"${attr('data-bf-hotkey', p.hotkey as string | undefined)}>${escapeHtml(label)}</button>`
      }
      case 'Input': {
        const id = idFor(p.key)
        const h = handlers.get(id)!
        h.input = p.onInput as ElementHandlers['input']
        h.submit = p.onSubmit as ElementHandlers['submit']
        const common = `class="bf-input" data-bf-id="${escapeHtml(id)}" data-bf-key="${escapeHtml(String(p.key))}"${attr('placeholder', p.placeholder as string | undefined)}${attr('aria-label', p.label as string | undefined)}${p.autoFocus ? ' autofocus' : ''}`
        const value = (p.value as string | undefined) ?? ''
        const field =
          typeof p.rows === 'number' && p.rows > 1
            ? `<textarea ${common} rows="${p.rows}">${escapeHtml(value)}</textarea>`
            : `<input type="text" ${common} value="${escapeHtml(value)}">`
        return p.label ? `<label class="bf-label">${escapeHtml(String(p.label))}${field}</label>` : field
      }
      case 'Select': {
        const id = idFor(p.key)
        handlers.get(id)!.select = p.onSelect as ElementHandlers['select']
        const options = (p.options as { value: string; label: string }[])
          .map(o => `<option value="${escapeHtml(o.value)}"${o.value === p.value ? ' selected' : ''}>${escapeHtml(o.label)}</option>`)
          .join('')
        return `<select class="bf-select" data-bf-id="${escapeHtml(id)}"${attr('aria-label', p.label as string | undefined)}>${options}</select>`
      }
      case 'Markdown':
        return `<div class="bf-md${p.dimColor ? ' bf-dim' : ''}">${renderMarkdown(String(p.text ?? ''))}</div>`
      case 'Code': {
        const lang = typeof p.language === 'string' ? ` class="language-${escapeHtml(p.language)}"` : ''
        return `<pre class="bf-code"><code${lang}>${escapeHtml(String(p.source ?? ''))}</code></pre>`
      }
      case 'Link': {
        const label = (p.label as string | undefined) ?? textOf(n.children)
        return `<a href="${escapeHtml(safeHref(String(p.href)))}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
      }
    }
  }

  function node(n: VNode, inText: boolean): string {
    if (n === null || n === undefined || typeof n === 'boolean') return ''
    if (typeof n === 'string' || typeof n === 'number') return escapeHtml(String(n))
    if (Array.isArray(n)) return n.map(c => node(c, inText)).join('')
    return isElement(n) ? element(n, inText) : ''
  }

  return { html: node(tree, false), handlers }
}
