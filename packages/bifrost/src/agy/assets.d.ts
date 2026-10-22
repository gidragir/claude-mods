// Text imports (`with { type: 'text' }`): inlined by esbuild into the agy bundle, read by Bun in tests.
declare module '*.css' {
  const text: string
  export default text
}
declare module '*/client.js' {
  const text: string
  export default text
}
