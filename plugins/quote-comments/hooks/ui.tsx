/**
 * Clean, lightweight UI patterns for Claude Code TUI panes.
 * Built directly on top of Claude Code's native Flexbox element model.
 */

import type { RenderNode } from 'claude-code'

// biome-ignore lint/suspicious/noExplicitAny: Required for JSX constructor compatibility
export type ElementConstructor = (props: any, ...children: any[]) => RenderNode

/**
 * Truncates a string to fit within terminal column width,
 * collapsing whitespace/newlines and appending an ellipsis.
 */
export function truncate(text: string, maxWidth: number): string {
  const clean = text.replace(/[\r\n\t]+/g, ' ').trim()
  if (clean.length <= maxWidth) return clean
  if (maxWidth <= 3) return clean.slice(0, Math.max(0, maxWidth))
  return `${clean.slice(0, maxWidth - 1)}…`
}

/**
 * Renders a standardized empty state banner.
 */
export function renderEmptyState(els: { Box: ElementConstructor; Text: ElementConstructor }, message: string, hint?: string): RenderNode {
  const { Box, Text } = els
  return (
    <Box flexDirection="column">
      <Text dimColor>{message}</Text>
      {hint !== undefined && hint !== '' && <Text dimColor>{hint}</Text>}
    </Box>
  )
}

export interface MasterDetailOptions<T extends { id: string | number }> {
  elements: { Box: ElementConstructor; Text: ElementConstructor; Button: ElementConstructor }
  items: T[]
  selectedId: (string | number) | null | undefined
  renderItem: (item: T, isSelected: boolean) => RenderNode
  renderDetail: (item: T) => RenderNode
  onSelect: (id: string | number) => void
  onBack: () => void
  emptyMessage?: string
  emptyHint?: string
}

/**
 * Master-Detail list and drill-down navigation pattern.
 */
export function renderMasterDetail<T extends { id: string | number }>(options: MasterDetailOptions<T>): RenderNode {
  const { elements, items, selectedId, renderItem, renderDetail, onSelect, onBack, emptyMessage, emptyHint } = options
  const { Box, Button } = elements

  if (items.length === 0) {
    return renderEmptyState(elements, emptyMessage ?? 'No items to display.', emptyHint)
  }

  const current = items.find(x => x.id === selectedId)
  if (current === undefined) {
    // Master view (overview list)
    return (
      <Box flexDirection="column">
        {items.map(item => (
          <Box key={`item-${String(item.id)}`} flexDirection="column">
            {renderItem(item, false)}
          </Box>
        ))}
      </Box>
    )
  }

  // Detail view with back button and quick switcher
  return (
    <Box flexDirection="column">
      <Box flexWrap="wrap">
        <Button key="back" onPress={onBack}>
          ← Back
        </Button>
        {items.map(item => (
          <Button
            key={`nav-${String(item.id)}`}
            variant={item.id === current.id ? 'primary' : 'secondary'}
            onPress={() => onSelect(item.id)}
          >
            {String(item.id)}
          </Button>
        ))}
      </Box>
      {renderDetail(current)}
    </Box>
  )
}

export interface CardOptions {
  elements: { Box: ElementConstructor }
  key?: string
  isSelected?: boolean
  borderColor?: string
  children: RenderNode | RenderNode[]
}

/**
 * Standard card with rounded borders and optional selection highlight.
 */
export function renderCard(options: CardOptions): RenderNode {
  const { elements, key, isSelected, borderColor = 'cyan', children } = options
  const { Box } = elements
  return (
    <Box
      key={key}
      borderStyle="round"
      borderColor={isSelected ? borderColor : undefined}
      borderDimColor={!isSelected}
      paddingX={1}
      flexDirection="column"
    >
      {children}
    </Box>
  )
}

export interface SplitViewOptions<T extends { id: string | number }> {
  elements: { Box: ElementConstructor; Text: ElementConstructor }
  items: T[]
  selectedId: (string | number) | null | undefined
  sidebarWidth?: number
  renderItem: (item: T, isSelected: boolean) => RenderNode
  renderDetail: (item: T) => RenderNode
  renderEmptyDetail?: () => RenderNode
  emptyMessage?: string
  emptyHint?: string
}

/**
 * Two-column split view (sidebar list + detail pane).
 */
export function renderSplitView<T extends { id: string | number }>(options: SplitViewOptions<T>): RenderNode {
  const { elements, items, selectedId, sidebarWidth = 36, renderItem, renderDetail, renderEmptyDetail, emptyMessage, emptyHint } = options
  const { Box, Text } = elements

  if (items.length === 0) {
    return renderEmptyState(elements, emptyMessage ?? 'No items to display.', emptyHint)
  }

  const current = items.find(x => x.id === selectedId) ?? items[0]

  return (
    <Box flexDirection="row" gap={1}>
      <Box width={sidebarWidth} flexDirection="column">
        {items.map(item => (
          <Box key={`split-item-${String(item.id)}`} flexDirection="column">
            {renderItem(item, item.id === current?.id)}
          </Box>
        ))}
      </Box>
      <Box flexGrow={1} flexDirection="column">
        {current ? (
          renderDetail(current)
        ) : renderEmptyDetail ? (
          renderEmptyDetail()
        ) : (
          <Box borderStyle="round" borderDimColor paddingX={1}>
            <Text dimColor>Select an item to view details.</Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}
