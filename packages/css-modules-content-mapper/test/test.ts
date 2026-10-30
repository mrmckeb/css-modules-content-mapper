import assert from 'node:assert/strict'
import { dirname } from 'node:path'
import { after, test } from 'node:test'

import { createContentMapper, transformResultToMarkdown } from 'content-mapper-test-utils'
import { testFixturesDirectory } from 'snapshot-fixtures'

const contentMapper = await createContentMapper(new URL('../package.json', import.meta.url))

after(contentMapper.dispose)

test('initialize', () => {
  assert.deepEqual(contentMapper.initializeResult, {
    positionEncoding: 'utf-16',
    diagnosticSource: 'CSS'
  })
})

testFixturesDirectory({
  directory: new URL('../fixtures', import.meta.url),
  write: false,
  tests: {
    async 'transform.md'(file) {
      const original = String(file)
      await using project = await contentMapper.openProject(dirname(file.path))

      assert.deepEqual(project.openProjectResult, {})

      const transform = await project.transform(file.path, original)

      return transformResultToMarkdown(original, transform)
    }
  }
})
