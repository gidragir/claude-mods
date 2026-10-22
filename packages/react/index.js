export function createElement(type, props, ...children) {
  return { type, props: props || {}, children: children.flat() }
}
export const Fragment = 'Fragment'
export default { createElement, Fragment }
