/**
 * @import { OptionDiagnostic } from 'css-modules-content-mapper/protocol'
 * @import * as Sass from 'sass'
 */

import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { startMapper } from 'css-modules-content-mapper/core'

import { indentedSyntax, scssSyntax } from './syntax.js'

/**
 * @typedef LoadedSass
 * @property {typeof Sass} sass
 *   The Sass API.
 * @property {Pick<typeof Sass, 'compileString'>} compiler
 *   The compiler to use.
 * @property {() => void} [dispose]
 *   Stop the compiler, if it runs in a separate process.
 */

/**
 * Load the installed Sass implementation. Like build tools such as Vite and sass-loader, prefer
 * `sass-embedded`, because it’s faster. Both packages implement the same API.
 *
 * @returns {Promise<LoadedSass | undefined>}
 *   The Sass API and the compiler to use, or undefined if neither package is installed.
 */
async function loadSass() {
  try {
    // The types of `sass-embedded` are a copy of those of `sass`, but differ slightly.
    const embedded = /** @type {typeof Sass} */ (
      /** @type {unknown} */ (await import('sass-embedded'))
    )
    // `sass-embedded` runs Sass in a separate process. Starting one for every compilation is
    // slow, so keep a single compiler running.
    const embeddedCompiler = embedded.initCompiler()
    return {
      sass: embedded,
      compiler: embeddedCompiler,
      dispose: () => embeddedCompiler.dispose()
    }
  } catch {
    // `sass-embedded` isn’t installed, or its compiler isn’t available for this platform.
  }

  try {
    const js = await import('sass')
    return { sass: js, compiler: js }
  } catch {
    // `sass` isn’t installed either.
  }
}

const { compiler, dispose, sass } = (await loadSass()) ?? {}

const missingSassMessage =
  "Content mapper 'sass-content-mapper' requires 'sass-embedded' or 'sass' to be installed."

startMapper({
  diagnosticSource: 'Sass',

  dispose() {
    dispose?.()
  },

  validateOptions({ loadPaths }) {
    /** @type {OptionDiagnostic[]} */
    const diagnostics = []

    if (!sass) {
      diagnostics.push({ path: [], messageText: missingSassMessage, code: 1003 })
    }

    if (
      loadPaths != null &&
      !(Array.isArray(loadPaths) && loadPaths.every((path) => typeof path === 'string'))
    ) {
      diagnostics.push({
        path: ['loadPaths'],
        messageText: "Content mapper option 'loadPaths' must be an array of strings.",
        code: 1002
      })
    }

    return diagnostics
  },

  preprocess({ configFileName, content, fileName, options }) {
    if (!sass || !compiler) {
      return { diagnostics: [{ messageText: missingSassMessage, start: 0, length: 0, code: 2002 }] }
    }

    const projectDirectory = configFileName ? dirname(configFileName) : dirname(fileName)
    const loadPaths = /** @type {string[] | undefined} */ (options.loadPaths) ?? []
    const url = pathToFileURL(fileName)
    const indented = fileName.endsWith('.sass')

    try {
      const result = compiler.compileString(content, {
        importers: [new sass.NodePackageImporter(projectDirectory)],
        loadPaths: [
          resolve(projectDirectory, 'node_modules'),
          ...loadPaths.map((path) => resolve(projectDirectory, path))
        ],
        logger: sass.Logger.silent,
        sourceMap: true,
        syntax: indented ? 'indented' : 'scss',
        url
      })

      const { css, sourceMap } = result
      if (!sourceMap) {
        throw new Error('Sass did not return a source map.')
      }

      return { css, map: sourceMap, syntax: indented ? indentedSyntax : scssSyntax }
    } catch (error) {
      if (!(error instanceof sass.Exception)) {
        throw error
      }

      const { sassMessage, span } = error
      const inFile = span.url?.href === url.href
      const start = inFile ? span.start.offset : 0
      const length = inFile ? span.end.offset - start : 0

      return {
        diagnostics: [{ messageText: sassMessage, start, length, code: 2001 }]
      }
    }
  }
})
