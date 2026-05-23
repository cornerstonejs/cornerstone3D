# Cornerstone3D v5 Migration

Runs all available Cornerstone3D v5 migration codemods in the recommended
order.

## Usage

```sh
npx codemod cornerstone3d/5
```

To preview changes before writing files:

```sh
npx codemod cornerstone3d/5 --dry-run
```

## Included Migrations

- `cornerstone3d/5/generic-viewport`: replaces removed RenderingEngine viewport
  accessor APIs with Cornerstone3D v5 compatible viewport APIs.

## Publishing

Publish child migration packages before publishing this aggregate package. The
workflow resolves `cornerstone3d/5/generic-viewport` from the Codemod registry at
runtime.
