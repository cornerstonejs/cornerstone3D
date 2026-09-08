# Publishing this package

Maintainer notes for `@cornerstonejs/rendering-webgpu-vtkjs`. Not shipped to npm —
`package.json` sets `"files": ["dist"]`, so only `dist`, `README.md`, `LICENSE` and
`package.json` land in the tarball.

This package has **never been published**. Everything below is a one-time step for the
first release that includes it; afterwards it rides the normal release like any other
package. None of it blocks building, testing, reviewing or merging — it is release work,
and it can be done after this merges to `main`, as long as it happens before or during
the first release that would publish the package.

## How it gets published at all

Being listed in `lerna.json` is what puts a package into the release. Three things read
that list:

- `publish-version.mjs` — updates cross-package peer dependency ranges, runs
  `npx lerna version <next> --exact --force-publish ...`, then runs
  `scripts/generate-version.js` for each listed package to regenerate its `src/version.ts`.
- `publish-package.mjs` — runs `npx lerna publish from-package --no-verify-access --yes`
  (with `--dist-tag beta` off `main`).
- `scripts/validate-esm-packaging.mjs` — the `validate:packaging` CI gate.

`pnpm-workspace.yaml` governs installing and building, not publishing. A package listed
only there is built and tested by CI but never versioned or published, which is why this
one is in both.

`--force-publish` means every listed package is bumped to the same version each release,
so this package inherits the repo version rather than tracking its own.

## First-publish checklist

Done in the repo already, listed so it can be verified rather than rediscovered:

- `packages/rendering-webgpu-vtkjs` is in `lerna.json`.
- `publishConfig.access` is `public`. A scoped package that has never been published
  defaults to restricted, and publishing it without this either fails or creates a
  private package. This must stay set.
- `version` matches the rest of the workspace, and `src/version.ts` is generated.

To confirm on the npm side before the first release — this is the part that needs an
`@cornerstonejs` org owner:

1. **The name is free.** `npm view @cornerstonejs/rendering-webgpu-vtkjs` should 404.
   If it resolves, someone has taken it and the package needs renaming.
2. **CI's `NPM_TOKEN` may create a new package in the scope.** The token is injected by
   CircleCI into `~/.npmrc` in the `NPM_PUBLISH` job. Two things can block it:
   - the org's package-creation setting, if creation is restricted to owners/admins;
   - a granular access token scoped to an explicit package list rather than the whole
     `@cornerstonejs` scope — a new name would not be on that list.

   Publishing runs with `--no-verify-access`, so lerna does **not** pre-flight this.
   A permissions problem surfaces as a raw npm 403/404 partway through
   `lerna publish from-package`, after some packages have already gone out.
3. **Publish it once by hand if either check above is uncertain.** Creating the package
   ahead of the release turns an unknown into a no-op, and is cheaper than a half-finished
   release:

   ```sh
   pnpm --filter @cornerstonejs/rendering-webgpu-vtkjs run build
   cd packages/rendering-webgpu-vtkjs
   npm publish --access public
   ```

   The version published this way must match what the release will produce, or bump it
   afterwards; `lerna publish from-package` skips any package whose current version is
   already on the registry.
4. **Grant the publishing team write access** to the new package afterwards, if the org
   uses teams rather than scope-wide permissions.

## Optional: mark it deprecated on npm

The package is deprecated on arrival — see the README and
[#2894](https://github.com/cornerstonejs/cornerstone3D/issues/2894). The `@deprecated`
JSDoc marks it for editors and TypeDoc, but npm shows nothing unless the registry flag is
set, which is a separate command run after a version exists:

```sh
npm deprecate @cornerstonejs/rendering-webgpu-vtkjs \
  "Maintained, not developed. vtk.js WebGPU is not being completed upstream; the supported route to WebGPU is vtk-wasm. See https://github.com/cornerstonejs/cornerstone3D/issues/2894"
```

This is a deliberate call, not a step to run automatically: it prints a warning on every
install, and the point of shipping the package is to let people evaluate WebGPU. Decide
whether the warning helps or just adds noise. It applies per version range, so it needs
re-running as new versions publish, and `npm deprecate <pkg> ""` clears it.
