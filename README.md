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

### Testing

The repository has three browser-level test paths:

- [`scripts/run-karma.sh`](./scripts/run-karma.sh) for legacy and compatibility rendering/tool tests.
- [`scripts/run-playright.sh`](./scripts/run-playright.sh) for end-to-end example coverage, including the Next viewport suite.
- [`vitest.browser.config.ts`](./vitest.browser.config.ts) for low-level browser-mode rendering tests.

Start with:

```bash
./scripts/run-karma.sh
./scripts/run-playright.sh
yarn test:vitest:browser
```

Detailed usage, wrapper flags, report output, and baseline management live in the contributor docs:

- [Writing Karma Tests](https://www.cornerstonejs.org/docs/contribute/karma-tests)
- [Writing Playwright Tests](https://www.cornerstonejs.org/docs/contribute/playwright-tests)

Vitest browser-mode tests currently live only in-repo. Use `yarn test:vitest:browser`, `yarn test:vitest:browser:update`, and `yarn test:vitest:browser:ui`. The test files are matched from `tests/vitest-browser/**/*.browser.test.ts`.

### License

Cornerstone is [MIT licensed](./LICENSE).
