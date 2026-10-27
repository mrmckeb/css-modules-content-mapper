## Text

````ts
declare const styles: {
/**
 * ```sass
 * .a
 *   color: #ff0000
 * 
 *   .b
 *     color: green
 * 
 *   &--c
 *     color: blue
 * ```
 */
readonly a: string

/**
 * ```sass
 *   .b
 *     color: green
 * ```
 */
readonly b: string

/**
 * ```sass
 *   &--c
 *     color: blue
 * ```
 */
readonly "a--c": string
}

export = styles

````

## Mappings

- `a` → `a`
- `b` → `b`
- `&--c` → `"a--c"`
