/**
 * Automatic JSX runtime (`"jsxImportSource": "@gidragir/bifrost"`).
 *
 * There are no intrinsic tags: every tag is a function (a primitive such as `Box`, or a component),
 * called right away with its props. `key` is handed over as a prop so primitives keep it.
 */

import { flatten, type VNode } from './core/vnode'

// biome-ignore lint/suspicious/noExplicitAny: a tag is any function from props to a node
type Tag = (props: any) => VNode

export function jsx(type: Tag | typeof Fragment, props: Record<string, unknown>, key?: string | number): VNode {
  if (type === Fragment) return flatten(props.children as VNode)
  return type(key === undefined ? props : { ...props, key: String(key) })
}

export const jsxs = jsx
export const jsxDEV = jsx

export function Fragment(props: { children?: VNode }): VNode {
  return flatten(props.children)
}

export declare namespace JSX {
  type Element = VNode
  // biome-ignore lint/complexity/noBannedTypes: no intrinsic elements on purpose
  type IntrinsicElements = {}
  interface ElementChildrenAttribute {
    // biome-ignore lint/complexity/noBannedTypes: marker shape required by TypeScript
    children: {}
  }
  interface IntrinsicAttributes {
    key?: string | number
  }
}
