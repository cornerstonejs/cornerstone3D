---
id: imageLoader
title: Image Loaders
---

# Image Loaders

An `ImageLoader` is a JavaScript function that is responsible for taking an [`ImageId`](./imageId.md) and returning
an [`Image Object`](./images.md). Since loading images usually requires a call to a server, the API for image loading needs to be asynchronous. Cornerstone requires that Image Loaders return an Object containing a Promise which Cornerstone will use to receive the Image Object asynchronously, or an Error if one has occurred.

## Image Loader Workflow


1. `ImageLoaders` register themselves using [`registerImageLoader`](/api/core/namespace/imageLoader#registerImageLoader) API with cornerstone to load specific ImageId URL schemes
2. The application requests to load an image using the `loadImage` API for stack or `createAndCacheVolume` API for volume.
3. Cornerstone delegates the request to load the image to the `ImageLoader` registered with the URL scheme of the imageId.
4. The ImageLoader will return an `Image Load Object` containing a Promise which it will resolve with the corresponding Image Object once it has obtained the pixel data. Obtaining the pixel data may require a call to a remote server using `XMLHttpRequest`, decompression of the pixel data (e.g. from JPEG 2000), and conversion of the pixel data into the format that Cornerstone understands (e.g. RGB vs YBR color).
5. The [Image Object](./images.md) passed back by the resolved Promise is then displayed using `renderingEngine` API.

## Register Image Loader

You can use [`registerImageLoader`](/api/core/namespace/imageLoader#registerImageLoader) to make an external image loader available to the
cornerstone library. This function accept a `scheme` which the image loader function (second argument) should act on.

## Available Image Loaders

| Image Loader                                                                                      | Used for                                                                                                                                      |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [Cornerstone DICOM Image Loader](https://github.com/cornerstonejs/cornerstone3D/tree/main/packages/dicomImageLoader)      | DICOM Part 10 images; Supports WADO-URI and WADO-RS; Supports multi-frame DICOM instances; Supports reading DICOM files from the File objects |
| [Cornerstone Web Image Loader](https://github.com/cornerstonejs/cornerstoneWebImageLoader)        | PNG and JPEG                                                                                                                                  |
| [Cornerstone-nifti-image-loader](https://github.com/cornerstonejs/cornerstone3D/tree/main/packages/nifti-volume-loader) | NIFTI                                                                                                                                         |

### CornerstoneDICOMImageLoader

[`CornerstoneDICOMImageLoader`](https://github.com/cornerstonejs/cornerstone3D/tree/main/packages/dicomImageLoader) is a cornerstone image loader that loads DICOM images from a WADO-compliant server. You can install it and initialize to via the following code. Internally, `CornerstoneDICOMImageLoader` registers its `wado-rs` and `wado-uri` imageLoaders to `Cornerstone3D` and uses [`dicomParser`](https://github.com/cornerstonejs/dicomParser) to parse the the metadata and pixel data.

```js
import { init } from '@cornerstonejs/dicom-image-loader';

init({
  maxWebWorkers: navigator.hardwareConcurrency || 1,
});

```

After initialization of the `CornerstoneDICOMImageLoader`, any imageId using the `wado-uri` scheme will be loaded using the `CornerstoneDICOMImageLoader`
`wado-uri` image loader and metadata provider (e.g., imageId = 'wado-uri: https://exampleServer.com/wadoURIEndPoint?requestType=WADO&studyUID=1.2.3&seriesUID=4.5.6&objectUID=7.8.9&contentType=application%2Fdicom'), and likewise for `wado-rs` imageIds which will use
`CornerstoneDICOMImageLoader` `wado-rs` image loader and metadata provider (e.g., imageId = 'wado-rs: https://exampleServer.com/wadoRSEndPoint/studies/1.2.3/series/4.5.6/instances/7.8.9/frames/1').

### CornerstoneWebImageLoader

You can take a look at our sample code example for `CornerstoneWebImageLoader` [here](https://github.com/cornerstonejs/cornerstone3D/tree/main/packages/core/examples/webLoader)
