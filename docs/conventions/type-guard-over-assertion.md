# Type Guard Over Type Assertion

## Rule
- Prefer type guards over type assertions (`as`) by default.
- Validate boundary inputs before use.
  - UI event values
  - API responses
  - URL params
  - localStorage values
  - raw DB strings
- Avoid `as any`, `as unknown as T`, and non-null assertion (`!`).
- If an assertion is unavoidable, add a one-line reason and tracking link.

## Good Example
```ts
import { isValidLanguageCode, type LanguageCode } from "../../constants";

onValueChange={(nextValue) => {
  if (isValidLanguageCode(nextValue)) {
    onChange(nextValue);
  }
}}
```

## Anti-Pattern
```ts
onValueChange={(nextValue) => onChange(nextValue as LanguageCode)}
const payload = data as ApiResponse
const user = maybeUser!
```

## ESLint Guidance
- Enable typed linting in ESLint config.
- Set these rules:
  - `@typescript-eslint/no-unsafe-type-assertion`: `error`
  - `@typescript-eslint/no-unnecessary-type-assertion`: `error`
  - `@typescript-eslint/no-non-null-assertion`: `warn` or `error`

## PR Checklist
- [ ] No new unsafe assertions (`as`, `!`) were introduced.
- [ ] Boundary data is narrowed with a type guard.
- [ ] Any unavoidable assertion has an inline reason and issue link.
