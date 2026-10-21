// Pure logic: no `$`, easy to unit-test. Keep hooks in register.tsx thin.

export function greeting(args: string): string {
  const who = args.trim()
  return who === '' ? 'Hello from __MOD_NAME__.' : `Hello, ${who}!`
}
