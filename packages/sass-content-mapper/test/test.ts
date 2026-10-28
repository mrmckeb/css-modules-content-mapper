import type { TransformResult } from '../lib/protocol.js'

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { testFixturesDirectory } from 'snapshot-fixtures'
import typescript from 'typescript'
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter
} from 'vscode-jsonrpc/node'

import pkg from '../package.json' with { type: 'json' }

/**
 * Get Node.js arguments that make packages fail to resolve, as if they weren’t installed.
 *
 * @param packages
 *   The package names to hide.
 * @returns
 *   The Node.js arguments.
 */
function hidePackages(packages: string[]): string[] {
  if (!packages.length) {
    return []
  }

  const hook = `
    import { registerHooks } from 'node:module'

    const hidden = new Set(${JSON.stringify(packages)})

    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (hidden.has(specifier)) {
          throw Object.assign(new Error(\`Cannot find package '\${specifier}'\`), {
            code: 'ERR_MODULE_NOT_FOUND'
          })
        }
        return nextResolve(specifier, context)
      }
    })
  `

  return ['--import', `data:text/javascript,${encodeURIComponent(hook)}`]
}

/**
 * Create a fixture test that transforms the input with the mapper.
 *
 * @param hidden
 *   Packages to hide from the mapper, to test which Sass implementation it uses.
 * @returns
 *   The fixture test.
 */
function createTransformTest(hidden: string[]) {
  return async (file: { path: string }): Promise<string> => {
    const original = String(file)
    const dir = dirname(file.path)
    const tsconfigFileName = join(dir, 'tsconfig.json')
    const configSourceFile = typescript.readJsonConfigFile(
      tsconfigFileName,
      typescript.sys.readFile
    )
    const { raw } = typescript.parseJsonSourceFileConfigFileContent(
      configSourceFile,
      typescript.sys,
      dir,
      undefined,
      tsconfigFileName
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contentMapper = (raw.contentMappers as any[]).find((cm) => cm.package === pkg.name)

    const [command, ...args] = pkg.typescript.contentMapper.exec
    assert.ok(command)
    using proc = spawn(command, [...hidePackages(hidden), ...args], {
      stdio: ['pipe', 'pipe', 'inherit']
    })
    const connection = createMessageConnection(
      new StreamMessageReader(proc.stdout),
      new StreamMessageWriter(proc.stdin)
    )

    // Reject pending requests if the mapper exits, instead of waiting forever.
    proc.once('exit', () => connection.dispose())

    connection.listen()

    const projectHandle = `${pkg.name}@${pkg.version}:0`

    const initialize = await connection.sendRequest('initialize')
    assert.deepEqual(initialize, { positionEncoding: 'utf-16', diagnosticSource: 'Sass' })

    const openProject = await connection.sendRequest('openProject', {
      configFileName: tsconfigFileName,
      projectHandle,
      options: contentMapper.options
    })
    assert.deepEqual(openProject, {})

    const transform = await connection.sendRequest<TransformResult>('transform', {
      content: original,
      fileName: file.path,
      projectHandle
    })

    const closeProject = await connection.sendRequest('closeProject', { projectHandle })
    assert.deepEqual(closeProject, null)

    return [
      '## Text',
      '',
      '````ts',
      transform.text,
      '````',
      '',
      '## Mappings',
      '',
      ...(transform.mappings?.map(
        ([virtualStart, virtualLength, originalStart, originalLength]) =>
          `- \`${original.slice(
            originalStart,
            originalStart + originalLength
          )}\` → \`${transform.text.slice(virtualStart, virtualStart + virtualLength)}\``
      ) ?? []),
      ...(transform.diagnostics?.length
        ? [
            '',
            '## Diagnostics',
            '',
            ...transform.diagnostics.map(
              ({ length, messageText, start }) =>
                `- ${messageText} at \`${original.slice(start, start + length)}\``
            )
          ]
        : []),
      ''
    ].join('\n')
  }
}

testFixturesDirectory({
  directory: new URL('../fixtures', import.meta.url),
  write: true,
  tests: {
    // Both implementations must produce the same output.
    'sass-embedded': { expected: 'transform.md', generate: createTransformTest([]) },
    sass: { expected: 'transform.md', generate: createTransformTest(['sass-embedded']) }
  }
})

test('reports a diagnostic if neither sass-embedded nor sass is installed', async () => {
  const messageText = "Either 'sass-embedded' or 'sass' must be installed."
  const projectHandle = `${pkg.name}@${pkg.version}:0`

  const [command, ...args] = pkg.typescript.contentMapper.exec
  assert.ok(command)
  using proc = spawn(command, [...hidePackages(['sass-embedded', 'sass']), ...args], {
    stdio: ['pipe', 'pipe', 'inherit']
  })
  const connection = createMessageConnection(
    new StreamMessageReader(proc.stdout),
    new StreamMessageWriter(proc.stdin)
  )

  // Reject pending requests if the mapper exits, instead of waiting forever.
  proc.once('exit', () => connection.dispose())

  connection.listen()

  const openProject = await connection.sendRequest('openProject', {
    configFileName: '',
    projectHandle
  })
  assert.deepEqual(openProject, { optionDiagnostics: [{ path: [], messageText, code: 1003 }] })

  const transform = await connection.sendRequest<TransformResult>('transform', {
    content: '.a {\n  color: red;\n}\n',
    fileName: '/input.scss',
    projectHandle
  })
  assert.deepEqual(transform, {
    extension: '.cts',
    text: 'declare const styles: {}\n\nexport = styles\n',
    mappings: [],
    diagnostics: [{ messageText, start: 0, length: 0, code: 2002 }]
  })
})

test('reports an invalid loadPaths option', async (t) => {
  const projectHandle = `${pkg.name}@${pkg.version}:0`

  const [command, ...args] = pkg.typescript.contentMapper.exec
  assert.ok(command)
  using proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'] })
  const connection = createMessageConnection(
    new StreamMessageReader(proc.stdout),
    new StreamMessageWriter(proc.stdin)
  )

  // Reject pending requests if the mapper exits, instead of waiting forever.
  proc.once('exit', () => connection.dispose())

  connection.listen()

  await t.test('not an array', async () => {
    const openProject = await connection.sendRequest('openProject', {
      configFileName: '',
      projectHandle,
      options: { loadPaths: 'vendor' }
    })
    assert.deepEqual(openProject, {
      optionDiagnostics: [
        {
          path: ['loadPaths'],
          messageText: "Content mapper option 'loadPaths' requires a value of type Array.",
          code: 1002
        }
      ]
    })
  })

  await t.test('an array with values that are not strings', async () => {
    const openProject = await connection.sendRequest('openProject', {
      configFileName: '',
      projectHandle,
      options: { loadPaths: ['vendor', 1, null] }
    })
    assert.deepEqual(openProject, {
      optionDiagnostics: [
        {
          path: ['loadPaths', 1],
          messageText: "Content mapper option 'loadPaths' requires a value of type string.",
          code: 1002
        },
        {
          path: ['loadPaths', 2],
          messageText: "Content mapper option 'loadPaths' requires a value of type string.",
          code: 1002
        }
      ]
    })
  })

  await t.test('uses the valid values', async () => {
    const fixture = fileURLToPath(new URL('../fixtures/load-paths/', import.meta.url))
    const fileName = join(fixture, 'input.scss')

    const openProject = await connection.sendRequest('openProject', {
      configFileName: join(fixture, 'tsconfig.json'),
      projectHandle,
      options: { loadPaths: ['vendor', 1] }
    })
    assert.deepEqual(openProject, {
      optionDiagnostics: [
        {
          path: ['loadPaths', 1],
          messageText: "Content mapper option 'loadPaths' requires a value of type string.",
          code: 1002
        }
      ]
    })

    // `library` can only be resolved through the valid `vendor` load path.
    const transform = await connection.sendRequest<TransformResult>('transform', {
      content: readFileSync(fileName, 'utf8'),
      fileName,
      projectHandle
    })
    assert.equal(transform.diagnostics, undefined)
    assert.match(transform.text, /readonly library: string/)
  })
})
