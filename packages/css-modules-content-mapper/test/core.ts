import type { TransformResult } from '../lib/protocol.js'

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter
} from 'vscode-jsonrpc/node'

const projectHandle = 'test:0'

const script = `
import { startMapper } from './lib/core.js'

startMapper({
  diagnosticSource: 'Test',
  preprocess() {
    throw new Error('Preprocessor exploded')
  }
})
`

test('reports an error thrown by the preprocessor as a diagnostic', async () => {
  using proc = spawn('node', ['--input-type=module', '--eval', script], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: ['pipe', 'pipe', 'inherit']
  })
  const connection = createMessageConnection(
    new StreamMessageReader(proc.stdout),
    new StreamMessageWriter(proc.stdin)
  )

  // Reject pending requests if the mapper exits, instead of waiting forever.
  proc.once('exit', () => connection.dispose())

  connection.listen()

  const initialize = await connection.sendRequest('initialize')
  assert.deepEqual(initialize, { positionEncoding: 'utf-16', diagnosticSource: 'Test' })

  await connection.sendRequest('openProject', { configFileName: '', projectHandle })

  const result = await connection.sendRequest<TransformResult>('transform', {
    content: '.a {}',
    fileName: '/test.css',
    projectHandle
  })
  assert.deepEqual(result, {
    extension: '.cts',
    text: 'declare const styles: {}\n\nexport = styles\n',
    mappings: [],
    diagnostics: [{ messageText: 'Preprocessor exploded', start: 0, length: 0, code: 2000 }]
  })
})
