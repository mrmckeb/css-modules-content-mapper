## Text

````ts
declare const styles: {
/**
 * ```scss
 *   .text-#{$color} {
 *     color: $color;
 *   }
 * ```
 */
readonly "text-red": string

/**
 * ```scss
 *   .text-#{$color} {
 *     color: $color;
 *   }
 * ```
 */
readonly "text-green": string
}

export = styles

````

## Mappings

- `text-#{$color}` → `"text-red"`
- `text-#{$color}` → `"text-green"`
