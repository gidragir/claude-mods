/**
 * Neutral tree → Claude Code engine elements, with the TUI's rules applied on the way:
 * `Button` gets text only (anything nested is flattened into its label), handlers never reject into
 * the engine, and elements a surface lacks (`Input` on mobile) are left out.
 */

import type { RenderChildren, RenderElement } from 'claude-code'
import { isElement, textOf, type VElement, type VNode } from '../core/vnode'

// biome-ignore lint/suspicious/noExplicitAny: the engine's tables differ per surface
type Table = Record<string, (props: any) => RenderElement>

/** Runs a handler; a failure is logged, never thrown at the engine. */
export function guard(fn: () => unknown): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(
      () => undefined,
      err => console.error('bifrost handler failed:', err),
    )
}

const drop = (props: Record<string, unknown>, ...keys: string[]) => {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) if (v !== undefined && !keys.includes(k)) out[k] = v
  return out
}

function element(node: VElement, table: Table): RenderChildren {
  const p = node.props as Record<string, unknown>
  const children = () => node.children.map(c => convert(c, table))
  const tag = table[node.type]
  switch (node.type) {
    case 'Box':
      return table.Box!({ ...drop(p, 'kind'), children: children() })
    case 'Text':
      return table.Text!({ ...p, children: children() })
    case 'Button': {
      const onPress = p.onPress as () => unknown
      const label = (p.label as string | undefined) ?? textOf(node.children)
      return table.Button!({ ...drop(p, 'onPress', 'label'), label, onPress: () => guard(onPress) })
    }
    case 'Input': {
      if (!tag) return null
      const { onInput, onSubmit, autoFocus } = p as {
        onInput?: (v: string) => unknown
        onSubmit: (v: string) => unknown
        autoFocus?: boolean
      }
      return tag({
        ...drop(p, 'onInput', 'onSubmit', 'autoFocus'),
        ...(autoFocus ? { autoFocus: true } : {}),
        ...(onInput ? { onInput: (v: string) => guard(() => onInput(v)) } : {}),
        onSubmit: (v: string) => guard(() => onSubmit(v)),
      })
    }
    case 'Select': {
      if (!tag) return null
      const onSelect = p.onSelect as (v: string) => unknown
      return tag({ ...drop(p, 'onSelect'), onSelect: (v: string) => guard(() => onSelect(v)) })
    }
    case 'Link':
      return table.Link!({ href: p.href, label: (p.label as string | undefined) ?? textOf(node.children) })
    default:
      // Markdown, Code: props carry everything
      return tag ? tag(drop(p)) : null
  }
}

function convert(node: VNode, table: Table): RenderChildren {
  if (node === null || node === undefined || typeof node === 'boolean') return null
  if (typeof node === 'string' || typeof node === 'number') return node
  if (Array.isArray(node)) return node.map(c => convert(c, table)) as unknown as RenderChildren
  return isElement(node) ? element(node, table) : null
}

/** The root a `ui.render` hook returns: always one element. */
export function toEngine(tree: VNode, table: Table): RenderElement {
  if (isElement(tree) && tree.type === 'Box') return convert(tree, table) as RenderElement
  return table.Box!({ flexDirection: 'column', children: [convert(tree, table)] })
}
