import type { TransformResult } from 'css-modules-content-mapper/protocol'

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { test } from 'node:test'

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
  const messageText =
    "Content mapper 'sass-content-mapper' requires 'sass-embedded' or 'sass' to be installed."
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
