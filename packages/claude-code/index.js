/**
 * Bridge implementation of claude-code runtime interfaces for Bun & Node environments.
 */

export function atom(desc, initial) {
  return {
    plugin: desc?.plugin ?? 'default',
    key: desc?.key ?? 'key',
    initial,
  }
}

export async function read($, a) {
  if ($?.state?.get) {
    const val = await $.state.get(a.key)
    return val !== undefined ? val : a.initial
  }
  return a.initial
}

export async function update($, a, fn) {
  if ($?.state?.set) {
    const current = await read($, a)
    const next = typeof fn === 'function' ? fn(current) : fn
    await $.state.set(a.key, next)
    return next
  }
  return undefined
}

export function h(type, props, ...children) {
  return {
    type,
    props: props || {},
    children: children.flat(),
  }
}

export const Fragment = 'Fragment'
