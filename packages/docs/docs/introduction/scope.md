---
id: scope
---

# Scope of Project

`cornerstone3D` is a javascript library


## Browser Support

`cornerstone3D` uses the HTML5 canvas element to render images which is supported by all modern browsers such
as Chrome, MS Edge, and Firefox.
We have optimized the memory consumption of the `core` library to share
the same GPU texture across multiple viewports and to avoid re-loading the same image data into the GPU. This way
you can render the same image in multiple viewports in any orientation without having to re-load the image data.
We use [`vtk.js`](https://kitware.github.io/vtk-js/index.html) as the engine of our rendering pipeline which uses
WebGL 2.0 for GPU accelerated image rendering. To use WebGL 2.0 you need a compliant browser (most modern browsers
as mentioned above) with a supported graphics card (either integrated or discrete).

If you are using an older browser, or don't have any graphics care, your device might not be able to
render volumetric images with `cornerstone3D`. However, you can still render stack images using the
CPU fallback that we have implemented in `cornerstone3D` for such scenarios.


## Mobile Support


## Monorepo hierarchy


`cornerstone3D` is a monorepo that contains the following packages:

- `/packages/core`: The core library responsible for rendering images.
- `/packages/tools`: The tool library for manipulation, annotation and segmentation.
- `/packages/streaming-image-volume-loader`: For streaming the volumes into the viewport and progressively loading them.
- `/packages/docs`: Documentation for all the packages including guides, examples, and API reference.

There are other `cornerstone` affiliated packages (such as `cornerstone-wado-image-loader`) that are not included in this monorepo. In long term we are working to add them to this monorepo to have a single location for all packages.
Having a monorepo helps us to:

- Share validation and linting rules
- Keep dependencies synced across all packages
- Easier linking between packages which is often required for bug fixing and testing
