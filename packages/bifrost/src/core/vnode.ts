/**
 * The neutral element tree every Bifrost UI is written in.
 *
 * Components return `VNode`s built from eight primitives that every harness can draw. The Claude
 * adapter maps them onto the engine's element table, the agy adapter onto HTML. Nothing here touches
 * a host: it is plain data, so a tree can be inspected in tests.
 */

export type PrimitiveName = 'Box' | 'Text' | 'Button' | 'Input' | 'Select' | 'Markdown' | 'Code' | 'Link'

/** Spacing in cells (TUI) or `em`-ish steps (web); the engine's named steps pass through. */
export type Space = number | 'xs' | 'sm' | 'md' | 'lg' | 'xl'

/** A named color: the TUI draws it as is, the web maps it onto theme variables. */
export type Color = 'cyan' | 'green' | 'red' | 'yellow' | 'blue' | 'magenta' | 'gray' | 'white' | (string & {})

export interface VElement<P extends object = object> {
  readonly $$bf: true
  readonly type: PrimitiveName
  readonly props: P
  readonly children: VNode[]
}

export type VNode = VElement | string | number | boolean | null | undefined | VNode[]

export interface BoxProps {
  key?: string
  flexDirection?: 'row' | 'column'
  flexGrow?: number
  flexShrink?: number
  flexWrap?: 'nowrap' | 'wrap'
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch'
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around'
  gap?: Space
  width?: number | string
  minWidth?: number | string
  margin?: Space
  marginX?: Space
  marginY?: Space
  marginTop?: Space
  marginBottom?: Space
  padding?: Space
  paddingX?: Space
  paddingY?: Space
  borderStyle?: 'round' | 'single' | 'double' | 'bold'
  borderColor?: Color
  borderDimColor?: boolean
  /** Semantic hint for the web (`card` → `<article>`, `toolbar` → `<nav>` ...); the TUI ignores it. */
  kind?: 'card' | 'list' | 'toolbar' | 'header' | 'detail' | 'section'
  children?: VNode
}

export interface TextProps {
  color?: Color
  dimColor?: boolean
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  wrap?: 'wrap' | 'truncate-end'
  children?: VNode
}

export interface ButtonProps {
  key?: string
  label?: string
  hotkey?: string
  variant?: 'primary' | 'secondary'
  onPress: () => unknown
  /** Text only: anything else is flattened to its text, as the TUI requires. */
  children?: VNode
}

export interface InputProps {
  key: string
  label?: string
  placeholder?: string
  value?: string
  submitLabel?: string
  rows?: number
  autoFocus?: boolean
  onInput?: (value: string) => unknown
  onSubmit: (value: string) => unknown
}

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  key: string
  label?: string
  options: readonly SelectOption[]
  value?: string
  onSelect: (value: string) => unknown
}

export interface MarkdownProps {
  key?: string
  text: string
  dimColor?: boolean
}

export interface CodeProps {
  source: string
  language?: string
}

export interface LinkProps {
  href: string
  label?: string
  children?: VNode
}

const make =
  <P extends { children?: VNode }>(type: PrimitiveName) =>
  (props: P): VElement<P> => {
    const { children, ...rest } = props
    return { $$bf: true, type, props: rest as P, children: flatten(children) }
  }

export const Box = make<BoxProps>('Box')
export const Text = make<TextProps>('Text')
export const Button = make<ButtonProps>('Button')
export const Input = make<InputProps & { children?: VNode }>('Input')
export const Select = make<SelectProps & { children?: VNode }>('Select')
export const Markdown = make<MarkdownProps & { children?: VNode }>('Markdown')
export const Code = make<CodeProps & { children?: VNode }>('Code')
export const Link = make<LinkProps>('Link')

export const isElement = (node: unknown): node is VElement =>
  typeof node === 'object' && node !== null && (node as { $$bf?: unknown }).$$bf === true

/** Children as a flat list without the holes JSX leaves (`false`, `null`, nested arrays). */
export function flatten(children: VNode): VNode[] {
  const out: VNode[] = []
  const walk = (n: VNode) => {
    if (n === null || n === undefined || typeof n === 'boolean') return
    if (Array.isArray(n)) for (const c of n) walk(c)
    else out.push(n)
  }
  walk(children)
  return out
}

/** All text under a node, the way a screen reader would read it. */
export function textOf(node: VNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  const p = node.props as { label?: string; text?: string; source?: string }
  if (node.type === 'Markdown') return p.text ?? ''
  if (node.type === 'Code') return p.source ?? ''
  if ((node.type === 'Button' || node.type === 'Link') && p.label !== undefined && node.children.length === 0) return p.label
  return node.children.map(textOf).join('')
}
