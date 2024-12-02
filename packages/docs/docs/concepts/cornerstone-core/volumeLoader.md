---
id: volumeLoader
title: Volume Loaders
---

# Volume Loaders

Similar to the [`Image Loaders`](./imageLoader.md), a volume loader takes a `volumeId` and other information
that is required to load a volume and returns a `Promise` that resolves into a `Volume`.
This `Volume` can be a constructed from a set of 2D images (e.g., `imageIds`) or
can be from one 3D array object (such as `NIFTI` format).

We have added [`cornerstoneStreamingImageVolumeLoader`](/docs/concepts/streaming-image-volume/streaming) library to support streaming
of the 2D images (`imageIds`) into a 3D volume and it is the default volume loader for streaming volumes.

## Register Volume Loaders

You can use [`registerVolumeLoader`](/api/core/namespace/volumeLoader#registerVolumeLoader) to define a volume loader which should be called on a particular `scheme`.
Below you can see a simplified code for our `cornerstoneStreamingImageVolumeLoader` in which:

1. Based on a set of imageIds, we compute volume metadata such as: spacing, origin, direction, etc.
2. Instantiate a new [`StreamingImageVolume`](/api/streaming-image-volume-loader/class/StreamingImageVolume)

   - `StreamingImageVolume` implements methods for loading (`.load`)
   - It implements load via using `imageLoadPoolManager`
   - Each loaded frame (imageId) is put at the correct slice in the 3D volume

3. Return a `Volume Load Object` which has a promise that resolves to the `Volume`.

```js
function cornerstoneStreamingImageVolumeLoader(
  volumeId: string,
  options: {
    imageIds: Array<string>,
  }
) {
  // Compute Volume metadata based on imageIds
  const volumeMetadata = makeVolumeMetadata(imageIds);
  const streamingImageVolume = new StreamingImageVolume(
    // ImageVolume properties
    {
      volumeId,
      metadata: volumeMetadata,
      dimensions,
      spacing,
      origin,
      direction,
      scalarData,
      sizeInBytes,
    },
    // Streaming properties
    {
      imageIds: sortedImageIds,
      loadStatus: {
        loaded: false,
        loading: false,
        cachedFrames: [],
        callbacks: [],
      },
    }
  );

  return {
    promise: Promise.resolve(streamingImageVolume),
    cancel: () => {
      streamingImageVolume.cancelLoading();
    },
  };
}

registerVolumeLoader(
  'cornerstoneStreamingImageVolume',
  cornerstoneStreamingImageVolumeLoader
);

// Used for any volume that its scheme is not provided
registerUnknownVolumeLoader(cornerstoneStreamingImageVolumeLoader);
```

As seen above, since the `cornerstoneStreamingImageVolumeLoader` is registered with the scheme `cornerstoneStreamingImageVolume`,
we can load a volume with the scheme `cornerstoneStreamingImageVolume` by passing the `volumeId` as shown below:

```js
const volumeId = 'cornerstoneStreamingImageVolume:myVolumeId';

const volume = await volumeLoader.createAndCacheVolume(volumeId, {
  imageIds: imageIds,
});
```

## Default unknown volume loader

By default if no `volumeLoader` is found for the scheme, the `unknownVolumeLoader` is used. `cornerstoneStreamingImageVolumeLoader`
is the default unknown volume loader.


:::info
Even if you don't provide the scheme, the `cornerstoneStreamingImageVolumeLoader` will be used by default.

So the following code will work as well:

```js
const volumeId = 'myVolumeId';
const volume = await volumeLoader.createAndCacheVolume(volumeId, {
  imageIds: imageIds,
});
```
