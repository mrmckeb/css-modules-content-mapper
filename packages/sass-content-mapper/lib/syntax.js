/**
 * @import { Syntax } from 'css-modules-content-mapper/core'
 */

// These rules are heuristics. They handle selectors, nesting, interpolation, line comments, and
// statements such as `@include`, which covers how classes are written in practice. They don’t
// tokenize Sass, so a class name inside a block comment or a string followed by `{` can be
// mistaken for a selector.

/**
 * Matches a selector token that may generate a class, such as `&-suffix` or `#{interpolation}`.
 */
const generatedToken = /(?:#{[^}]*}|[^\s()+,.:>[\]{}~])+/y

/**
 * Find the end of a selector token.
 *
 * @param {string} content
 *   The Sass source.
 * @param {number} offset
 *   The start offset of the token.
 * @returns {number}
 *   The offset where the token ends, or the start offset if there is no token.
 */
function findTokenEnd(content, offset) {
  const match = new RegExp(generatedToken.source, 'y')
  match.lastIndex = offset
  return match.test(content) ? match.lastIndex : offset
}

/**
 * Find the end of a selector.
 *
 * @param {string} content
 *   The Sass source.
 * @param {number} offset
 *   The start offset of the selector.
 * @param {boolean} indented
 *   Whether the source uses the indented syntax.
 * @returns {number}
 *   The offset where the selector ends.
 */
function findSelectorEnd(content, offset, indented) {
  for (let index = offset; index < content.length; index += 1) {
    const char = content[index]
    if (char === '#' && content[index + 1] === '{') {
      index = content.indexOf('}', index)
      if (index === -1) {
        break
      }
    } else if (char === '{' || char === ';' || char === '}' || (indented && char === '\n')) {
      return index
    }
  }
  return content.length
}

/**
 * Find the end of a rule.
 *
 * @param {string} content
 *   The Sass source.
 * @param {number} offset
 *   The start offset of the rule.
 * @param {boolean} indented
 *   Whether the source uses the indented syntax.
 * @returns {number}
 *   The offset where the rule ends.
 */
function findRuleEnd(content, offset, indented) {
  if (indented) {
    const lineStart = content.lastIndexOf('\n', offset - 1) + 1
    const indent = offset - lineStart
    let end = content.indexOf('\n', offset)
    if (end === -1) {
      return content.length
    }
    let next = end + 1
    while (next < content.length) {
      let lineEnd = content.indexOf('\n', next)
      if (lineEnd === -1) {
        lineEnd = content.length
      }
      const line = content.slice(next, lineEnd)
      if (line.trim()) {
        if (line.length - line.trimStart().length <= indent) {
          break
        }
        end = lineEnd
      }
      next = lineEnd + 1
    }
    return end
  }

  let depth = 0
  for (let index = offset; index < content.length; index += 1) {
    const char = content[index]
    if (char === '#' && content[index + 1] === '{') {
      index = content.indexOf('}', index)
      if (index === -1) {
        break
      }
    } else if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return index + 1
      }
    }
  }
  return content.length
}

/**
 * Check whether an offset is part of a selector.
 *
 * This rules out matches in line comments and in statements such as `@include mixins.name;`.
 *
 * @param {string} content
 *   The Sass source.
 * @param {number} offset
 *   The offset to check.
 * @param {boolean} indented
 *   Whether the source uses the indented syntax.
 * @returns {boolean}
 *   Whether the offset is part of a selector.
 */
function isSelector(content, offset, indented) {
  const lineStart = content.lastIndexOf('\n', offset - 1) + 1
  if (content.slice(lineStart, offset).includes('//')) {
    return false
  }

  if (indented) {
    return !/^\s*[$+=@]/.test(content.slice(lineStart, offset + 1))
  }

  return content[findSelectorEnd(content, offset, false)] === '{'
}

/**
 * Create the syntax rules for SCSS or the indented syntax.
 *
 * @param {boolean} indented
 *   Whether to create rules for the indented syntax.
 * @returns {Syntax}
 *   The syntax rules.
 */
function createSyntax(indented) {
  return {
    findSelectorEnd: (content, offset) => findSelectorEnd(content, offset, indented),
    findRuleEnd: (content, offset) => findRuleEnd(content, offset, indented),
    isSelector: (content, offset) => isSelector(content, offset, indented),
    findTokenEnd
  }
}

export const scssSyntax = createSyntax(false)

export const indentedSyntax = createSyntax(true)
