# [Cornerstone.js](https://cornerstonejs.org/) &middot; ![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)

Cornerstone is a set of JavaScript libraries that can be used to build web-based medical imaging applications. It provides a framework to build radiology applications such as the [OHIF Viewer](https://ohif.org/).

- **Fast:** Cornerstone leverages WebGL to provide high-performance image rendering and WebAssembly for fast image decompression.
- **Flexible:** Cornerstone provides APIs for defining custom image, volume, and metadata loading schemes, allowing developers to easily connect with proprietary image archives.
- **Community Driven:** Cornerstone is supported by the [Open Health Imaging Foundation](https://ohif.org/). We publish our roadmap and welcome contributions and collaboration.
- **Standards Compliant:** Cornerstone's core focus is Radiology, so it provides DICOMweb compatibility out-of-the-box.

[Learn how to use Cornerstone3D in your project](https://www.cornerstonejs.org/docs/getting-started/overview).

## Release tarballs for integration (e.g. OHIF)

Before publishing to npm, this repo can build **npm tarballs** (`.tgz`) of all publishable packages and attach them to **GitHub Releases**. That lets consumers like [OHIF](https://ohif.org/) install and test unreleased builds (e.g. `yarn add https://github.com/cornerstonejs/cornerstone3D/releases/download/cs3d-pr-123-abc1234/cornerstonejs-core-4.18.5.tgz` or via the Releases API).

- **How tarballs are created**  
  CI runs `bun run build` then `scripts/create-release-tarballs.js`, which runs `npm pack` for each package in `lerna.json` and writes `.tgz` files into a release directory. You can run the same locally: after `bun install` and `bun run build`, run `RELEASE_TARBALLS_DIR=release-tarballs node scripts/create-release-tarballs.js`.

- **When they are published**  
  - **PR builds:** Add the **`ohif-integration`** label to a PR; the workflow builds at the PR head, creates a prerelease tag `cs3d-pr-<number>-<short-sha>`, uploads the tarballs as release assets, and optionally dispatches to the OHIF repo.  
  - **Post-merge:** On push to `main`, a prerelease `cs3d-merged-v<version>` is created with the same tarballs and a dispatch to OHIF.

- **How OHIF (or others) use them**  
  OHIF receives a `repository_dispatch` event (`cs3d-integration`) with `release_tag` and `source_repository`. It can then fetch the release assets from this repo’s Releases (e.g. via GitHub API or `gh release download`) and install the `.tgz` packages for integration tests or a staging build.

For setup, secrets, and step-by-step instructions, see **[RELEASE_INTEGRATION.md](./RELEASE_INTEGRATION.md)**.

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

### License

Cornerstone is [MIT licensed](./LICENSE).
