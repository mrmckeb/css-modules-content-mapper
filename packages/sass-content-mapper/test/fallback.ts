import type { TransformResult } from 'content-mapper-test-utils'

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { dirname } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter
} from 'vscode-jsonrpc/node'

import pkg from '../package.json' with { type: 'json' }

const fileName = fileURLToPath(new URL('../fixtures/fallback.scss', import.meta.url))
const projectHandle = `${pkg.name}@${pkg.version}:0`

const valid = '.valid {\n  color: red;\n}\n'
const broken = '.valid {\n  color: red;\n}\n\n.broken {\n  color: $undefined-variable;\n}\n'

test('keeps the last successful result when compilation fails', async () => {
  const [command, ...args] = pkg.typescript.contentMapper.exec
  assert.ok(command)
  using proc = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'inherit'],
    cwd: dirname(import.meta.dirname)
  })
  const connection = createMessageConnection(
    new StreamMessageReader(proc.stdout),
    new StreamMessageWriter(proc.stdin)
  )

  // Reject pending requests if the mapper exits, instead of waiting forever.
  proc.once('exit', () => connection.dispose())

  connection.listen()

  await connection.sendRequest('initialize')
  await connection.sendRequest('openProject', { configFileName: '', projectHandle })

  const good = await connection.sendRequest<TransformResult>('transform', {
    content: valid,
    fileName,
    projectHandle
  })
  assert.match(good.text, /readonly valid: string/)
  assert.ok(good.mappings?.length)
  assert.equal(good.diagnostics, undefined)

  const bad = await connection.sendRequest<TransformResult>('transform', {
    content: broken,
    fileName,
    projectHandle
  })
  assert.equal(bad.text, good.text)
  assert.deepEqual(bad.mappings, [])
  assert.equal(bad.diagnostics?.length, 1)
  const [diagnostic] = bad.diagnostics
  assert.equal(diagnostic?.messageText, 'Undefined variable.')
  assert.equal(
    broken.slice(diagnostic.start, diagnostic.start + diagnostic.length),
    '$undefined-variable'
  )

  const recovered = await connection.sendRequest<TransformResult>('transform', {
    content: valid,
    fileName,
    projectHandle
  })
  assert.deepEqual(recovered, good)

  await connection.sendRequest('closeProject', { projectHandle })
  await connection.sendRequest('openProject', { configFileName: '', projectHandle })

  const afterReopen = await connection.sendRequest<TransformResult>('transform', {
    content: broken,
    fileName,
    projectHandle
  })
  assert.equal(afterReopen.text, 'declare const styles: {}\n\nexport = styles\n')
})
