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

## OHIF Downstream Validation

The Cornerstone3D build includes an OHIF checkout and test linked to the current
branch of CS3D in order to test compatibility with the checked out version.
This ensures that CS3D changes do not break the OHIF Viewer before they are
published.

Additionally, the OHIF pipeline can build and deploy a **preview release**
against a CS3D branch for manual testing. This pipeline does not re-test the
CS3D side but is intended for manual validation of changes in the full viewer.

Some tests in OHIF may need additional wait time built in to enable them to pass on slower servers

### How it works

The downstream validation is defined in
[`.github/workflows/ohif-downstream.yml`](.github/workflows/ohif-downstream.yml).
It runs on every CS3D pull request and `workflow_dispatch`:

1. Checks out the CS3D PR branch and builds it (`bun run build:esm`).
2. Checks out the OHIF Viewer at the ref specified by the `OHIF_REF` env
   variable (defaults to `master`).
3. Installs OHIF dependencies, then symlinks the locally built CS3D packages
   into OHIF's `node_modules` via
   `scripts/link-ohif-cornerstone-node-modules.mjs`.
4. Runs OHIF unit tests and Playwright e2e tests against the linked build.

### Testing against an OHIF branch other than master

By default the workflow checks out `master` of the OHIF Viewer. To test against
a different OHIF branch (e.g. when a feature requires coordinated changes in
both repos):

1. Open `.github/workflows/ohif-downstream.yml`.
2. Change the `OHIF_REF` environment variable (line 19) from `master` to the
   target branch:
   ```yaml
   env:
     OHIF_REF: feat/my-ohif-feature   # was: master
   ```
3. Commit and push. The downstream job will now clone and test against that
   OHIF branch instead.
4. **Remember to set `OHIF_REF` back to `master` before merging your CS3D PR.**

> **Tip:** This pairs with the OHIF side of the integration. While `OHIF_REF`
> lets a CS3D PR test against an OHIF branch, the OHIF repo has a symmetric
> mechanism — the `ohif-integration` label and `CS3D_REF` in the PR body —
> that lets an OHIF PR test against a CS3D branch. Together these allow both
> sides to run the full test suite against unpublished code. See the
> [OHIF Viewer README — Cornerstone3D Integration Testing](https://github.com/OHIF/Viewers#cornerstone3d-integration-testing)
> for details on the OHIF side.

## Local Development: Linking & Unlinking

Two scripts are provided for linking a local CS3D build into an OHIF checkout
so you can iterate without publishing:

### Link

From the **CS3D repo root**, after building (`bun run build:esm`):

```bash
node scripts/link-ohif-cornerstone-node-modules.mjs /path/to/ohif
```

This replaces the installed `@cornerstonejs/*` packages inside OHIF's
`node_modules` with symlinks pointing to the local CS3D build output. The
following packages are linked:

| Package | Local path |
|---------|-----------|
| `@cornerstonejs/adapters` | `packages/adapters` |
| `@cornerstonejs/ai` | `packages/ai` |
| `@cornerstonejs/core` | `packages/core` |
| `@cornerstonejs/dicom-image-loader` | `packages/dicomImageLoader` |
| `@cornerstonejs/labelmap-interpolation` | `packages/labelmap-interpolation` |
| `@cornerstonejs/nifti-volume-loader` | `packages/nifti-volume-loader` |
| `@cornerstonejs/polymorphic-segmentation` | `packages/polymorphic-segmentation` |
| `@cornerstonejs/tools` | `packages/tools` |

After linking, start OHIF's dev server (`yarn dev` or `bun run dev`) and any
changes you make in CS3D (after rebuilding) will be reflected immediately.

### Unlink

To restore the registry-installed packages:

```bash
node scripts/unlink-ohif-cornerstone-node-modules.mjs /path/to/ohif
```

This removes the symlinks and runs `yarn install --frozen-lockfile` in the OHIF
directory to restore the original packages.

### Typical workflow

```bash
# 1. Build CS3D
cd /path/to/cornerstone3D
bun install --frozen-lockfile
bun run build:esm

# 2. Link into OHIF
node scripts/link-ohif-cornerstone-node-modules.mjs /path/to/ohif

# 3. Start OHIF
cd /path/to/ohif
yarn dev

# 4. Iterate — rebuild CS3D after changes:
cd /path/to/cornerstone3D
bun run build:esm
# OHIF dev server picks up changes automatically

# 5. When done, unlink
node scripts/unlink-ohif-cornerstone-node-modules.mjs /path/to/ohif
```

> **Tip:** For the `yarn link` based approach (useful when working on a single
> package rather than the full set), see the
> [Linking Cornerstone Libraries](packages/docs/docs/contribute/linking.md) doc.

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
