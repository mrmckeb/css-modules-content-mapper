## Text

````ts
declare const styles: {
/**
 *
 * Comment for `a`.
 * ```scss
 * .a {
 *   color: #ff0000;
 *   .b {
 *     color: green;
 *   }
 * }
 * ```
 */
readonly a: string

/**
 * `b` comment
 * ```scss
 *   .b {
 *     color: green;
 *   }
 * ```
 */
readonly b: string
}

export = styles

````

## Mappings

- `a` → `a`
- `b` → `b`
