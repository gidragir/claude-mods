#!/usr/bin/env bun
import { runCli } from './index'

runCli().then(
  code => process.exit(code),
  err => {
    console.error('bifrost:', err instanceof Error ? err.message : err)
    process.exit(1)
  },
)
