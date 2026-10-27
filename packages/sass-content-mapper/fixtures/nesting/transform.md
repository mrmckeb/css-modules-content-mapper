## Text

````ts
declare const styles: {
/**
 * ```scss
 * .a {
 *   color: #ff0000;
 * 
 *   .b {
 *     color: green;
 *   }
 * 
 *   @media print {
 *     color: black;
 *   }
 * }
 * ```
 */
readonly a: string

/**
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
