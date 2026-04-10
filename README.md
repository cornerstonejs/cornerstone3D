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

The repository ships with two shell wrappers for browser-based tests:

#### [`scripts/run-karma.sh`](./scripts/run-karma.sh)

This wraps `npx karma start --single-run`, captures the console log, and writes a timestamped HTML image report under `reports/`.

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
./scripts/run-karma.sh
./scripts/run-karma.sh --compat
./scripts/run-karma.sh --compat --browsers Chrome --no-single-run
KARMA_GREP="flip a stack viewport vertically" ./scripts/run-karma.sh --browsers Chrome --no-single-run
KARMA_PACKAGE=core ./scripts/run-karma.sh
```

#### [`scripts/run-playright.sh`](./scripts/run-playright.sh)

This wraps `npx playwright test`, auto-selects the test files to run, and writes logs, Playwright artifacts, and an HTML report under `reports/`.

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
./scripts/run-playright.sh
./scripts/run-playright.sh --compat
./scripts/run-playright.sh --project chromium --headed
./scripts/run-playright.sh -g "stack viewport"
PLAYWRIGHT_REUSE_EXISTING_SERVER=true ./scripts/run-playright.sh --project chromium
./scripts/run-playright.sh --next
```

### License

Cornerstone is [MIT licensed](./LICENSE).
