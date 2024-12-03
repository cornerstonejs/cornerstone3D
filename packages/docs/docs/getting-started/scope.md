---
id: scope
---

# Scope of Project

## Scope

`Cornerstone3D` is a javascript library that enables 3D rendering of medical images
using purely web standards. The library employs WebGL for GPU accelerated rendering
whenever possible. `Cornerstone3DTools` is a peer library to `Cornerstone3D` and
contains a number manipulation and annotations tools that are used to interact with
the images.

The `Cornerstone3D` scope **DOES NOT** encompass dealing with image/volume loading
and metadata parsing. The `Cornerstone3D` scope **DOES** include image rendering and caching.
Proper image loaders should be registered **TO** the cornerstone3D using `imageLoader.registerImageLoader`
and `volumeLoader.registerVolumeLoader`. Examples of such image loaders are `wadors` loader
using `cornerstoneDICOMImageLoader` for DICOM P10 instances over `dicomweb` and `wadouri` for
the DICOM P10 instances over HTTP.

In addition, `Cornerstone3D` has a metadata registration mechanism that allows
metadata parsers to be registered **TO** the `Cornerstone3D` using `metaData.addProvider`.
Using `cornerstoneDICOMImageLoader`, its image loaders and metadata providers self-register
with the `Cornerstone3D`. You can always checkout the example helpers to see how an
end-to-end example from metadata parsing to image loading and image rendering can be achieved.

## Typescript

Since all libraries in the `Cornerstone3D` monorepo are written in Typescript, they provide
a type-safe API. This means that you can use the library in a TypeScript environment
and using type information, you can be assured that the parameters being passed to any method
match what is expected.

## Browser Support

`Cornerstone3D` uses the HTML5 canvas element and WebGL 2.0 GPU rendering to render images which is supported by all modern browsers.
Our advanced volume rendering has recently been revamped to allow for better performance and memory management and without the
requirement of using sharedArrayBuffer which previously was a requirement for rendering volumes.

- Chrome > 68
- Firefox > 79
- Edge > 79

If you are using an older browser, or don't have any graphics cards, your device might not be able to
render volumetric images with `Cornerstone3D`. However, you can still render stack images using the
CPU fallback that we have implemented in `Cornerstone3D` for such scenarios.

## Monorepo hierarchy

`Cornerstone3D` is a monorepo that contains the following packages:

- `/packages/core`: The core library responsible for rendering images and volumesand caching.
- `/packages/tools`: The tool library for manipulation, annotation and segmentation rendering and tools.
- `/packages/dicom-image-loader`: The image loader for `wadors` and `wadouri` DICOM P10 instances over HTTP.
- `/packages/nifti-volume-loader`: The image loader for NIfTI files.
- `/packages/docs`: Documentation for all the packages including guides, examples, and API reference.
