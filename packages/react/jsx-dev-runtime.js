export function jsxDEV(type, props, key) {
  const mergedProps = props ? { ...props } : {}
  if (key !== undefined) mergedProps.key = key
  if (typeof type === 'function') {
    return type(mergedProps)
  }
  return { type, props: mergedProps, key }
}
export const jsx = jsxDEV
export const jsxs = jsxDEV
export const Fragment = 'Fragment'
export default { jsxDEV, jsx, jsxs, Fragment }
