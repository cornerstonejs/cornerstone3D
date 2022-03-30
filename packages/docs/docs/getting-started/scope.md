---
id: scope
---

# Scope of Project

## Scope

`Cornerstone3D` is a javascript library that enables 3D rendering of medical images
using purely web standards. The library employs WebGL for GPU accelerated rendering
whenever possible. `cornerstone3DTools` is a peer library to `Cornerstone3D` and
contains a number manipulation and annotations tools that are used to interact with
the 3D rendering.

The `Cornerstone3D` scope **DOES NOT** encompass dealing with image/volume loading
and metadata parsing. The `Cornerstone3D` scope **DOES** include image rendering.
Proper image loaders should be registered **TO** the cornerstone3D using `imageLoader.registerImageLoader`
and `volumeLoader.registerVolumeLoader`. Examples of such image loaders are `wadors` loader
using `cornerstoneWADOImageLoader` for DICOM P10 instances over `dicomweb` and `wadouri` for
the DICOM P10 instances over HTTP. With `Cornerstone3D` we are releasing our first `volumeLoader`,
`streaming-image-volume-loader`, that will be able to stream images of a volume one by one.

In addition, `Cornerstone3D` has a metadata registration mechanism that allows
metadata parsers to be registered **TO** the `Cornerstone3D` using `metaData.addProvider`.
Using `cornerstoneWADOImageLoader`, its image loaders and metadata providers self-register
with the `Cornerstone3D`. You can always checkout the example helpers to see how an
end-to-end example from metadata parsing to image loading and image rendering can be achieved.

## Typescript

Since `Cornerstone3D` and `cornerstone3DTools` are written in Typescript, they provide
a type-safe API. This means that you can use the library in a TypeScript environment
and using type information, you can be assured that the parameters being passed to any method
match what is expected.

## Browser Support

`Cornerstone3D` uses the HTML5 canvas element to render images which is supported by all modern browsers such
as Chrome, MS Edge, and Firefox.
We have optimized the memory consumption of the `core` library to share
the same GPU texture across multiple viewports and to avoid re-loading the same image data into the GPU. This way
you can render the same image in multiple viewports in any orientation without having to re-load the image data.
We use [`vtk.js`](https://kitware.github.io/vtk-js/index.html) as the engine of our rendering pipeline which uses
WebGL 2.0 for GPU accelerated image rendering. To use WebGL 2.0 you need a compliant browser (most modern browsers
as mentioned above) with a supported graphics card (either integrated or discrete).

If you are using an older browser, or don't have any graphics care, your device might not be able to
render volumetric images with `Cornerstone3D`. However, you can still render stack images using the
CPU fallback that we have implemented in `Cornerstone3D` for such scenarios.

## Mobile Support

## Monorepo hierarchy

`Cornerstone3D` is a monorepo that contains the following packages:

- `/packages/core`: The core library responsible for rendering images.
- `/packages/tools`: The tool library for manipulation, annotation and segmentation.
- `/packages/streaming-image-volume-loader`: For streaming the volumes into the viewport and progressively loading them.
- `/packages/docs`: Documentation for all the packages including guides, examples, and API reference.

There are other `cornerstone` affiliated packages (such as `cornerstone-wado-image-loader`) that are not included in this monorepo. In long term we are working to add them to this monorepo to have a single location for all packages.
Having a monorepo helps us to:

- Share validation and linting rules
- Keep dependencies synced across all packages
- Easier linking between packages which is often required for bug fixing and testing
