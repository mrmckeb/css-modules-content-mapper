## Text

````ts
declare const styles: {
/**
 * ```scss
 *   &--modifier {
 *     color: #ff0000;
 *   }
 * ```
 */
readonly "hyphenated-class--modifier": string

/**
 * ```scss
 *   &--modifier {
 *     color: #ff0000;
 *   }
 * ```
 */
readonly hyphenatedClassModifier: string
}

export = styles

````

## Mappings

- `&--modifier` → `"hyphenated-class--modifier"`
- `&--modifier` → `hyphenatedClassModifier`
