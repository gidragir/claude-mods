/**
 * Ready-made components on top of the primitives. Each takes data and callbacks and handles the
 * host's rules itself: `Input` only where the surface draws one, text-only `Button` children, the
 * 90-column split between a sidebar and a detail view.
 */

import { useViewport } from '../core/render'
import { Box, Button, type Color, Input, Text, type VNode } from '../core/vnode'

/** One line of text cut to `max` cells with an ellipsis; whitespace folded. */
export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  if (max <= 1) return clean.slice(0, Math.max(0, max))
  return `${clean.slice(0, max - 1)}…`
}

/** `1 ref`, `3 refs`. */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

export interface StackProps {
  key?: string
  gap?: number
  align?: 'flex-start' | 'center' | 'flex-end' | 'stretch'
  justify?: 'flex-start' | 'center' | 'flex-end' | 'space-between'
  wrap?: boolean
  marginBottom?: number
  children?: VNode
}

export function Row({ key, gap = 1, align = 'center', justify, wrap, marginBottom, children }: StackProps): VNode {
  return (
    <Box
      key={key}
      flexDirection="row"
      gap={gap}
      alignItems={align}
      justifyContent={justify}
      flexWrap={wrap ? 'wrap' : undefined}
      marginBottom={marginBottom}
    >
      {children}
    </Box>
  )
}

export function Column({ key, gap, align, justify, marginBottom, children }: StackProps): VNode {
  return (
    <Box key={key} flexDirection="column" gap={gap} alignItems={align} justifyContent={justify} marginBottom={marginBottom}>
      {children}
    </Box>
  )
}

export interface CardProps {
  key?: string
  selected?: boolean
  accent?: Color
  grow?: boolean
  children?: VNode
}

/** A rounded frame; the selected one is drawn in the accent color. */
export function Card({ key, selected = false, accent = 'cyan', grow, children }: CardProps): VNode {
  return (
    <Box
      key={key}
      kind="card"
      borderStyle="round"
      borderColor={selected ? accent : undefined}
      borderDimColor={!selected}
      paddingX={1}
      flexDirection="column"
      flexGrow={grow ? 1 : undefined}
    >
      {children}
    </Box>
  )
}

export interface HeaderProps {
  title: string
  subtitle?: string
  actions?: VNode
}

/** A title row: bold title, dim subtitle, actions on the right. */
export function Header({ title, subtitle, actions }: HeaderProps): VNode {
  return (
    <Box kind="header" flexDirection="row" justifyContent="space-between" alignItems="center" marginBottom={1}>
      <Row>
        <Text bold color="cyan">
          {title}
        </Text>
        {subtitle !== undefined && subtitle !== '' ? <Text dimColor>{subtitle}</Text> : null}
      </Row>
      {actions ?? null}
    </Box>
  )
}

/** A wrapping row of buttons. */
export function Toolbar({ children, marginBottom }: { children?: VNode; marginBottom?: number }): VNode {
  return (
    <Box kind="toolbar" flexDirection="row" flexWrap="wrap" gap={1} marginBottom={marginBottom}>
      {children}
    </Box>
  )
}

export interface EmptyStateProps {
  message: string
  hint?: string
  framed?: boolean
}

export function EmptyState({ message, hint, framed = false }: EmptyStateProps): VNode {
  const body = [<Text dimColor>{message}</Text>, hint !== undefined && hint !== '' ? <Text dimColor>{hint}</Text> : null]
  return framed ? <Card>{body}</Card> : <Column>{body}</Column>
}

export interface FieldProps {
  key: string
  value?: string
  placeholder?: string
  label?: string
  rows?: number
  autoFocus?: boolean
  submitLabel?: string
  onInput?: (value: string) => unknown
  onSubmit: (value: string) => unknown
  /** Shown instead where the surface draws no input (Claude Code mobile). */
  fallback?: string
}

/** A text input, or a dim note where the surface takes no input. */
export function Field({ fallback = 'This surface takes no input.', ...props }: FieldProps): VNode {
  if (!useViewport().canInput) return fallback === '' ? null : <Text dimColor>{fallback}</Text>
  return <Input {...props} />
}

export interface SearchInputProps {
  key?: string
  value: string
  placeholder?: string
  onInput: (value: string) => unknown
  onSubmit?: (value: string) => unknown
}

/** A filter box; nothing where the surface takes no input. */
export function SearchInput({ key = 'search', value, placeholder = 'Filter…', onInput, onSubmit }: SearchInputProps): VNode {
  return <Field key={key} value={value} placeholder={placeholder} onInput={onInput} onSubmit={onSubmit ?? onInput} fallback="" />
}

export interface MasterDetailProps<T> {
  items: readonly T[]
  selectedId: string | null
  onSelect: (id: string | null) => unknown
  getId: (item: T) => string
  /** The item's button text; its id by default. */
  label?: (item: T) => string
  /** Dim text beside the button. */
  meta?: (item: T) => string
  /** The card body under the button; `width` is the room left in the card. */
  preview?: (item: T, width: number) => VNode
  detail: (item: T) => VNode
  /** Extra buttons in the detail toolbar. */
  actions?: (item: T) => VNode
  sidebarWidth?: number
}

/**
 * A list beside a detail view. From 90 columns: sidebar of cards and the selected item's detail.
 * Narrower: the list alone, and a drill-down detail with `← Overview (b)` and a button per item.
 * `p`/`n` walk the items.
 */
export function MasterDetail<T>(props: MasterDetailProps<T>): VNode {
  const { items, selectedId, onSelect, getId, label = getId, meta, preview, detail, actions, sidebarWidth = 36 } = props
  const { wide, columns } = useViewport()
  if (items.length === 0) return null

  const card = (item: T, selected: boolean, width: number) => {
    const id = getId(item)
    return (
      <Card key={`card-${id}`} selected={selected}>
        <Row justify="space-between">
          <Button key={`pick-${id}`} variant={selected ? 'primary' : 'secondary'} onPress={() => onSelect(id)}>
            {label(item)}
          </Button>
          {meta ? (
            <Text dimColor wrap="truncate-end">
              {meta(item)}
            </Text>
          ) : null}
        </Row>
        {preview ? preview(item, width) : null}
      </Card>
    )
  }

  const walk = (item: T) => {
    const at = items.findIndex(x => getId(x) === getId(item))
    const prev = items[(at - 1 + items.length) % items.length]!
    const next = items[(at + 1) % items.length]!
    return [
      <Button key="prev" hotkey="p" onPress={() => onSelect(getId(prev))}>
        ← (p)
      </Button>,
      <Button key="next" hotkey="n" onPress={() => onSelect(getId(next))}>
        (n) →
      </Button>,
    ]
  }

  const detailCard = (item: T) => (
    <Box
      key={`detail-${getId(item)}`}
      kind="detail"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      flexDirection="column"
      flexGrow={1}
    >
      <Row justify="space-between" marginBottom={1}>
        <Row>
          <Text bold color="cyan">{`[${label(item)}]`}</Text>
          {meta ? (
            <Text dimColor wrap="truncate-end">
              {meta(item)}
            </Text>
          ) : null}
        </Row>
        {wide ? (
          <Row>
            {actions ? actions(item) : null}
            {walk(item)}
          </Row>
        ) : null}
      </Row>
      {detail(item)}
    </Box>
  )

  if (wide) {
    const active = items.find(x => getId(x) === selectedId) ?? items[0]!
    return (
      <Row align="flex-start">
        <Box kind="list" width={sidebarWidth} flexDirection="column">
          {items.map(x => card(x, getId(x) === getId(active), sidebarWidth - 4))}
        </Box>
        {detailCard(active)}
      </Row>
    )
  }

  const current = items.find(x => getId(x) === selectedId)
  if (current === undefined)
    return (
      <Box kind="list" flexDirection="column">
        {items.map(x => card(x, false, columns - 4))}
      </Box>
    )
  return (
    <Column>
      <Toolbar marginBottom={1}>
        <Button key="back" hotkey="b" onPress={() => onSelect(null)}>
          ← Overview (b)
        </Button>
        {actions ? actions(current) : null}
        {walk(current)}
      </Toolbar>
      <Toolbar marginBottom={1}>
        {items.map(x => (
          <Button key={`pick-${getId(x)}`} variant={x === current ? 'primary' : 'secondary'} onPress={() => onSelect(getId(x))}>
            {label(x)}
          </Button>
        ))}
      </Toolbar>
      {detailCard(current)}
    </Column>
  )
}
