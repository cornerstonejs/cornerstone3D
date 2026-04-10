# [Cornerstone.js](https://cornerstonejs.org/) &middot; ![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)

Cornerstone is a set of JavaScript libraries that can be used to build web-based medical imaging applications. It provides a framework to build radiology applications such as the [OHIF Viewer](https://ohif.org/).

- **Fast:** Cornerstone leverages WebGL to provide high-performance image rendering and WebAssembly for fast image decompression.
- **Flexible:** Cornerstone provides APIs for defining custom image, volume, and metadata loading schemes, allowing developers to easily connect with proprietary image archives.
- **Community Driven:** Cornerstone is supported by the [Open Health Imaging Foundation](https://ohif.org/). We publish our roadmap and welcome contributions and collaboration.
- **Standards Compliant:** Cornerstone's core focus is Radiology, so it provides DICOMweb compatibility out-of-the-box.

[Learn how to use Cornerstone3D in your project](https://www.cornerstonejs.org/docs/getting-started/overview).

## Documentation

You can find the Cornerstone documentation [on the website](https://cornerstonejs.org/).

The documentation is divided into several sections

- [Tutorial](https://cornerstonejs.org/docs/category/tutorials)
- [Main Concepts](https://cornerstonejs.org/docs/category/concepts)
- [Live Examples](https://www.cornerstonejs.org/docs/examples)
- [API Reference](https://cornerstonejs.org/api)
- [How-to Guides](https://cornerstonejs.org/docs/category/how-to-guides)
- [FAQ](https://cornerstonejs.org/docs/faq)
- [How-to Contribute](https://cornerstonejs.org/docs/category/contributing)

## Support

Users can post questions and issues on the [Open Health Imaging Foundation (OHIF) Community Forum](https://community.ohif.org/). Developer issues or bugs can be reported as [Github Issues](https://github.com/cornerstonejs/cornerstone3D/issues).

The [OHIF Resources page](https://v3-docs.ohif.org/resources) may be of interest to Cornerstone users, as it includes presentations and demonstrations of OHIF and Cornerstone.

## Contributing

### [Code of Conduct](./CODE_OF_CONDUCT.md)

Cornerstone has adopted a [Code of Conduct](./CODE_OF_CONDUCT.md) that we expect project participants to adhere to.

### [Contributing Guide](https://cornerstonejs.org/docs/category/contributing)

Read our guide on [How-to Contribute](https://cornerstonejs.org/docs/category/contributing) and about our [Issue Triage process](https://v3-docs.ohif.org/development/our-process).

### Test Wrappers

The repository ships with two shell wrappers for browser-based tests, plus a dedicated Vitest browser-mode setup:

#### [`scripts/run-karma.sh`](./scripts/run-karma.sh)

This wraps `npx karma start --single-run`, captures the console log, and writes a timestamped HTML image report under `reports/`.

- How it works:
  - `./scripts/run-karma.sh` runs the full Karma suite once in legacy mode.
  - `./scripts/run-karma.sh --next` runs two full-suite passes back-to-back: `--compat`, then `--compat --cpu`.
  - Legacy image comparisons use committed ground-truth PNGs in `packages/core/test/groundTruth/` and `packages/tools/test/groundTruth/`.
  - Compatibility-mode image comparisons use generated PNGs in `karma-baselines/<mode>/`.
- Wrapper flags:
  - `--compat`: force compatibility mode for the Karma run.
  - `--cpu`: force CPU rendering for the Karma run.
  - `--next`: convenience mode that runs two passes back-to-back: `--compat`, then `--compat --cpu`.
- Pass-through arguments:
  - Any other arguments are forwarded to `karma start`.
  - Examples: `--browsers Chrome`, `--no-single-run`, `--reporters spec`.
- Useful environment variables:
  - `KARMA_GREP="<pattern>"`: filter specs via Karma client args.
  - `KARMA_PACKAGE=core|tools`: load only the selected package's Karma tests.
  - `FORCE_COMPAT=true` and `FORCE_CPU_RENDERING=true`: direct overrides if you run `karma start` yourself.

Examples:

```bash
# Run the full Karma suite once in legacy mode
./scripts/run-karma.sh

# Run the full Karma suite once in compat mode
./scripts/run-karma.sh --compat

# Run the full Karma suite twice: compat GPU, then compat CPU
./scripts/run-karma.sh --next

# Run a filtered subset in an interactive browser session
./scripts/run-karma.sh --compat --browsers Chrome --no-single-run

# Filter tests via KARMA_GREP
KARMA_GREP="flip a stack viewport vertically" ./scripts/run-karma.sh --browsers Chrome --no-single-run

# Load only one package's Karma tests
KARMA_PACKAGE=core ./scripts/run-karma.sh
```

Screenshot baseline updates for Karma:

- Legacy ground-truth images live in `packages/core/test/groundTruth/` and `packages/tools/test/groundTruth/`.
- To refresh those committed PNGs, run:

```bash
node utils/updateGroundTruth.js
```

- Compatibility-mode baselines live in `karma-baselines/<mode>/`.
- Missing compatibility baselines are created automatically by `./scripts/run-karma.sh` after the run finishes.
- After a new compatibility baseline is created, rerun the same command to compare against it.
- If you intentionally need to replace an existing compatibility baseline, remove or overwrite that PNG in `karma-baselines/` and rerun the wrapper.

#### [`scripts/run-playright.sh`](./scripts/run-playright.sh)

This wraps `npx playwright test`, auto-selects the test files to run, and writes logs, Playwright artifacts, and an HTML report under `reports/`.

- How it works:
  - `./scripts/run-playright.sh` runs all Playwright specs under `tests/**/*.spec.ts`, except `tests/nextViewport/**/*.spec.ts`.
  - `./scripts/run-playright.sh --next` runs only `tests/nextViewport/**/*.spec.ts`.
  - Browser projects, snapshot paths, and the local example server come from [`playwright.config.ts`](./playwright.config.ts).
  - By default Playwright serves the built examples at `http://localhost:3333` via its configured `webServer`.
- Wrapper flags:
  - `--compat`: open example pages with `?type=next`.
  - `--cpu`: open example pages with `?cpu=1`.
  - `--next`: run only `tests/nextViewport/**/*.spec.ts`.
- Important difference from Karma:
  - `--next` on Playwright selects the Next viewport test suite.
  - `--next` on Karma runs compatibility and CPU passes.
- Pass-through arguments:
  - Any other arguments are forwarded to `playwright test`.
  - Examples: `--project chromium`, `--headed`, `-g "pattern"`, `--workers 1`, `--update-snapshots`.
- Useful environment variables:
  - `PLAYWRIGHT_REUSE_EXISTING_SERVER=true|false`: control reuse of the configured local example server.
  - The wrapper sets `PLAYWRIGHT_FORCE_COMPAT`, `PLAYWRIGHT_FORCE_CPU_RENDERING`, `PLAYWRIGHT_HTML_OUTPUT_DIR`, and `PLAYWRIGHT_HTML_OPEN=never` internally.

Examples:

```bash
# Run all non-next Playwright specs across the configured projects
./scripts/run-playright.sh

# Run only the Next viewport Playwright suite
./scripts/run-playright.sh --next

# Run all non-next Playwright specs in compat mode
./scripts/run-playright.sh --compat

# Run a single Playwright project headed
./scripts/run-playright.sh --project chromium --headed

# Filter by test title
./scripts/run-playright.sh -g "stack viewport"

# Reuse an already-running local example server
PLAYWRIGHT_REUSE_EXISTING_SERVER=true ./scripts/run-playright.sh --project chromium

# Rewrite Playwright screenshot baselines
./scripts/run-playright.sh --update-snapshots
```

Screenshot baseline updates for Playwright:

- Snapshot files are stored using the template from [`playwright.config.ts`](./playwright.config.ts): `tests/screenshots/<project>/<spec>/<name>.png`.
- Normal runs compare against those committed screenshots.
- To rewrite them, pass Playwright's native snapshot flag through the wrapper:

```bash
./scripts/run-playright.sh --update-snapshots
./scripts/run-playright.sh --next --update-snapshots
./scripts/run-playright.sh --project chromium --update-snapshots
```

#### Vitest Browser Mode

This repo also has a dedicated Vitest Browser Mode setup for direct browser-level rendering tests without going through the examples app.

- Config:
  - [`vitest.browser.config.ts`](./vitest.browser.config.ts)
  - Test glob: `tests/vitest-browser/**/*.browser.test.ts`
- Current provider:
  - `@vitest/browser-playwright`
  - Chromium in headless mode by default through the package scripts
- How it works:
  - Vitest opens a real browser page.
  - The test imports Cornerstone source directly from `packages/core/src`.
  - The test creates DOM elements itself, registers fake image loaders/metadata providers, forces `useViewportNext`, renders a viewport, and snapshots the canvas.
  - This is intended for low-level viewport/rendering assertions, especially cases that used to live only in Karma.

Run all browser-mode Vitest tests:

```bash
yarn test:vitest:browser
```

That runs every file matched by `tests/vitest-browser/**/*.browser.test.ts`.

Update screenshot baselines for all browser-mode Vitest tests:

```bash
yarn test:vitest:browser:update
```

That reruns the same suite with Vitest's `--update` flag and rewrites the stored baseline PNGs.

Open the interactive browser-mode runner:

```bash
yarn test:vitest:browser:ui
```

Run a single file:

```bash
npx vitest --config vitest.browser.config.ts --browser --run --browser.headless tests/vitest-browser/nextStackApi.browser.test.ts
```

Vitest browser-mode screenshot baselines are currently written into the same core Karma ground-truth folder so they can reuse the same image inventory style. For the current Next stack example, the baseline is:

```bash
packages/core/test/groundTruth/next_imageURI_64_64_20_5_1_1_0_nearest.png
```

Normal runs compare against the committed screenshot baseline. The `:update` script rewrites those baseline images with the latest rendered output.

### License

Cornerstone is [MIT licensed](./LICENSE).
