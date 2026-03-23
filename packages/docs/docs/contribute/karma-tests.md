---
id: karma-tests
title: Writing Karma Tests
summary: Instructions for writing and running Karma tests for Cornerstone3D rendering and tools, including visual inspection of test results
---

# Writing Karma Tests

To make sure our rendering and tools don't break upon future modifications, we have
written tests for them. Rendering tests includes comparing the rendered images
with the expected images. Tools tests includes comparing the output of the tools
with the expected output.

### Running Karma Tests Locally

You can run `yarn run test` to run all tests locally.
By default, `karma.conf.js` will run the tests in a headless chrome browser to make
sure our tests can run in any servers. Therefore, you cannot visualize it by default. In order
to run the tests and visually inspect the results, you can run the tests by changing the
`karma.conf.js` file to have `browsers: ['Chrome']` instead of `browsers: ['ChromeHeadless']`.

![renderingTests](../assets/tests.gif)

### Generating HTML Review Reports

For local review, use the generic Karma runner instead of reading terminal output only:

```bash
./scripts/run-karma.sh
./scripts/run-karma.sh --viewport-v2
./scripts/run-karma.sh --cpu
```

This defaults to `all` and generates:

- `reports/all-legacy-karma/<timestamp>/all-legacy-karma.log`
- `reports/all-legacy-karma/<timestamp>/html-report/index.html`

You can also scope the run:

```bash
./scripts/run-karma.sh core
./scripts/run-karma.sh core --viewport-v2
./scripts/run-karma.sh core --cpu
./scripts/run-karma.sh tools
./scripts/run-karma.sh all
```

These generate matching scoped outputs such as:

- `reports/core-legacy-karma/<timestamp>/core-legacy-karma.log`
- `reports/core-legacy-karma/<timestamp>/html-report/index.html`
- `reports/tools-legacy-karma/<timestamp>/tools-legacy-karma.log`
- `reports/tools-legacy-karma/<timestamp>/html-report/index.html`

Each run gets its own timestamped subfolder, so new runs do not overwrite older reports.
When `--viewport-v2` is used, the folder name changes accordingly, for example:

- `reports/core-viewport-v2-karma/<timestamp>/core-viewport-v2-karma.log`
- `reports/core-viewport-v2-karma/<timestamp>/html-report/index.html`
- `reports/core-viewport-v2-cpu-karma/<timestamp>/core-viewport-v2-cpu-karma.log`
- `reports/core-viewport-v2-cpu-karma/<timestamp>/html-report/index.html`

To run both Karma and Playwright sequentially for the same package scope, use:

```bash
./scripts/run-tests.sh
./scripts/run-tests.sh core
./scripts/run-tests.sh tools
./scripts/run-tests.sh core --viewport-v2
```

Passing `--viewport-v2` forces the test harness to enable `rendering.useViewportV2` for the run, so legacy
viewport type inputs are remapped to the V2 implementations during Karma execution.

Passing `--cpu` forces CPU rendering in the Karma test harness, so shared setup paths initialize viewports with
`useCPURendering` enabled instead of relying only on per-test calls.

### Reviewing Image Comparisons

When Karma tests use `compareImages()`, the HTML report includes persisted image artifacts for review.
This now applies to passing and failing image comparisons, not only failures.

For each comparison artifact, the report shows:

- `Expected`
- `Actual`
- `Compare`
- `Diff Mask`

The `Compare` panel overlays expected and actual with a slider, and each tile includes direct open links
so you can inspect the raw generated images in a separate tab.

The HTML report also supports filtering by status, and failed tests are rendered first in the report.

### Running Only One Karma Test Locally

You can use `karma` specifiers such as `describe` instead of (`describe`) and `fit` instead
of (`it`) to run only one test.
