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
of the 2D images (`imageIds`) into a 3D volume.

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

## Volume Creation
As seen above, since the `cornerstoneStreamingImageVolumeLoader` is registered with the scheme `cornerstoneStreamingImageVolume`,
we can load a volume with the scheme `cornerstoneStreamingImageVolume` by passing the `volumeId` as shown below:

```js
const volumeId = 'cornerstoneStreamingImageVolume:myVolumeId';

const volume = await volumeLoader.createAndCacheVolume(volumeId, {
  imageIds: imageIds,
});
```

### ImageIds used for Volume Loading
imageIds used for volume loading should have the correct imageLoader already registered. For instance, if you are using `cornerstoneWADOImageLoader` for loading your images through `wadors` then you should register the wadors image loader before loading the volume.

### streaming-wadors
`wadors` imageLoader by default will create the [imageObject](./images.md) for each
image and will cache it. This is not ideal for streaming volumes since we want to
load the images INTO the sharedArrayBuffer of the volume and there is no need for creation of that image object and allocating a new arrayBuffer. Therefore, we have created a new imageLoader called `streaming-wadors` [imageLoader](/api/streaming-image-volume-loader/function/sharedArrayBufferImageLoader) which is basically the same as `wadors` but it does not create the imageObject.

So in order to gain the performance benefits of streaming volumes, you should rename your imageIds to use `streaming-wadors` instead of `wadors` and register the `streaming-wadors` imageLoader before loading the volume.

## Volume Load
Finally, we can load the volume by calling the `load` method on the volume instance. This was a design decision to separate the creation of the volume from the loading of the volume. This is because we want to be able to create a volume and then load it later on. This is useful for example when the loading order of the volume images should be modified (interleave images, top to bottom, etc.).

```js
volume.load()
```



## Default unknown volume loader

By default if no `volumeLoader` is found for the scheme, the `unknownVolumeLoader` is used. `cornerstoneStreamingImageVolumeLoader`
is the default unknown volume loader.
