---
id: custom-image-loader
---

# Custom Image Loader

In this how-to guide we will show you how to create a custom image loader. You should be familiar with
the following core concepts:

- [Image Loaders](../concepts/cornerstone-core/imageLoader.md)
- [Image Objects](../concepts/cornerstone-core/images.md)
- [Metadata Providers](../concepts/cornerstone-core/metadataProvider.md)

## Introduction

Cornerstone **DOES NOT** deal with image loading. It delegates image loading to [Image Loaders](../concepts/cornerstone-core/imageLoader.md).
Cornerstone team have developed commonly used image loaders (`CornerstoneDICOMImageLoader` for loading images from wado-compliant dicom servers
using `wado-rs` or `wado-uri`, `CornerstoneWebImageLoader` to load web images such as PNG and JPEG and `cornerstone-nifti-image-loader` for loading NIFTI images).
However, you might ask yourself:

:::note How

How can I build a custom image loader?

:::

## Implementation

Let's implement an `imageLoader` that fetches pixel data using `XMLHttpRequest` and return an Image Load Object containing a Promise that
resolves to a Cornerstone [`image`](../concepts/cornerstone-core/images.md).

### Step 1: Create an Image Loader

Below, we create an `imageLoader` which accepts an `imageId` and returns an `imageLoadObject` as a Promise.

```js
function loadImage(imageId) {
  // Parse the imageId and return a usable URL (logic omitted)
  const url = parseImageId(imageId);

  // Create a new Promise
  const promise = new Promise((resolve, reject) => {
    // Inside the Promise Constructor, make
    // the request for the image data
    const oReq = new XMLHttpRequest();
    oReq.open('get', url, true);
    oReq.responseType = 'arraybuffer';
    oReq.onreadystatechange = function (oEvent) {
      if (oReq.readyState === 4) {
        if (oReq.status == 200) {
          // Request succeeded, Create an image object (logic omitted)
          // This may require decoding the image into raw pixel data, determining
          // rows/cols, pixel spacing, etc.
          const image = createImageObject(oReq.response);

          // Return the image object by resolving the Promise
          resolve(image);
        } else {
          // An error occurred, return an object containing the error by
          // rejecting the Promise
          reject(new Error(oReq.statusText));
        }
      }
    };

    oReq.send();
  });

  // Return an object containing the Promise to cornerstone so it can setup callbacks to be
  // invoked asynchronously for the success/resolve and failure/reject scenarios.
  return {
    promise,
  };
}
```

### Step 2: Ensure Image metadata is also available

Our image loader returns an `imageLoadObject` containing pixel data and related
information, but Cornerstone may also need [additional
metadata](../concepts/cornerstone-core/metadataProvider.md) in order to display
the image. See the [custom metadata provider](custom-metadata-provider.md) documentation
for how to do this.

### Step 3: Registration of Image Loader

After you implement your image loader, you need to register it with Cornerstone. First
you need to decide which URL scheme your image loader supports. Let's say your image loader
wants to support the `custom1` scheme, then any imageId that starts with `custom1://` will be
handled by your image loader.

```js
// registration
cornerstone.imageLoader.registerImageLoader('custom1', loadImage);
```

## Usage

```js
// Images loaded as follows will be passed to our loadImage function:
stackViewport.setStack(['custom1://example.com/image.dcm']);
```

<details>
<summary>
Use Viewport API to load an image
</summary>

In previous versions of Cornerstone, you could use `loadImage` or `loadAndCacheImage` to load an image. However,
in `Cornerstone3D`, this task can be achieved using `Viewports` APIs.

</details>
