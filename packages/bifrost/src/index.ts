/**
 * @gidragir/bifrost — write a plugin once, run it in Claude Code and Google Antigravity (agy).
 *
 * This entry is everything a plugin's own code imports: `definePlugin`, state (`atom`, `useAtom`,
 * `useState`), the host (`useHost`), primitives and components. Harness adapters live in
 * `@gidragir/bifrost/claude` and `@gidragir/bifrost/agy` and are wired by `bifrost build`.
 */

export { type Atom, atom, MemoryStore, type StateStore, type Updater } from './core/atom'
export { boundTraversalByRecency, type FsEntry, type FsLike, type FsStat, findFiles, safeList, safeRead } from './core/fs'
export type { Harness, Host, Selection, Viewport } from './core/host'
export {
  type ClaudeHooks,
  type CommandSpec,
  type ConfigField,
  definePlugin,
  type PaneSpec,
  type Plugin,
  type PluginSpec,
  type PromptSubmitEvent,
  type PromptSubmitResult,
  type Target,
  type TurnCompleteEvent,
} from './core/plugin'
export { type Setter, useAtom, useHost, useState, useValue, useViewport } from './core/render'
export {
  Box,
  type BoxProps,
  Button,
  type ButtonProps,
  Code,
  type CodeProps,
  type Color,
  Input,
  type InputProps,
  Link,
  type LinkProps,
  Markdown,
  type MarkdownProps,
  Select,
  type SelectProps,
  Text,
  type TextProps,
  type VElement,
  type VNode,
} from './core/vnode'
export {
  Card,
  type CardProps,
  Column,
  EmptyState,
  Field,
  type FieldProps,
  Header,
  MasterDetail,
  type MasterDetailProps,
  plural,
  Row,
  SearchInput,
  Toolbar,
  truncate,
} from './ui/components'
