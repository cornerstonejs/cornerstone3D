---
id: streaming
---

# Streaming of Volume data

You don't need to wait for all of the volume to load to have an initial view. Below, you can see
    streaming of two volumes that are simultaneously loaded into the scenes for a 3x3 PET/CT fusion layout with a MIP view on the right.


## Creating Volumes From Images

During the design of `Cornerstone3D` we considered the following options for loading image volumes:

1. Loading each image separately, then creating a volume from them
2. Fetching metadata from all images, create a volume before hand, then insert each image inside the volume one by one as they are loaded

We chose option 2. Below we will explain the rationale behind this choice, and the advantages and disadvantages of each option.

### [Not Implemented]: Option 1


### [Implemented]: Option2




## Converting volumes from/to images

As we created a volume based on a series of fetched images (2D), a Volume can implement functions to convert its 3D pixel data to 2D images without re-requesting them over the network. For instance, our `StreamingImageVolume` implements `convertToCornerstoneImage` which takes an imageId and its imageId index and return a Cornerstone Image object (ImageId Index is required since we want to locate the imageId pixelData in the 3D array and copy it over the Cornerstone Image).

This is a process that can be reverted; `Cornerstone3D` can create a volume from a set of imageIds if they have properties of a volume (Same FromOfReference, origin, dimension, direction and pixelSpacing).

You can read more about decaching volume into a set of images in the `Cache` section.



To load a volume via the `Cornerstone-image-loader-streaming-volume` library, we need to create a volume, and specify
the imageIds that we want to load into the volume. Similar to `imageId`, a `volumeId` has
the schema for loading as the first part of its Id. For instance, since `Cornerstone-image-loader-streaming-volume`
registers

```js
const ctVolumeId = "C
const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeId, {
  imageIds: ctImageIds,
})
```
