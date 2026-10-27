## Text

````ts
declare const styles: {
/**
 * ```scss
 * .block {
 *   color: #ff0000;
 * 
 *   &__element {
 *     color: green;
 *   }
 * 
 *   &--modifier {
 *     color: blue;
 *   }
 * }
 * ```
 */
readonly block: string

/**
 * ```scss
 *   &__element {
 *     color: green;
 *   }
 * ```
 */
readonly block__element: string

/**
 * ```scss
 *   &--modifier {
 *     color: blue;
 *   }
 * ```
 */
readonly "block--modifier": string
}

export = styles

````

## Mappings

- `block` → `block`
- `&__element` → `block__element`
- `&--modifier` → `"block--modifier"`
