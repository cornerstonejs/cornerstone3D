---
id: streaming
---

# Streaming of Volume data

With the addition of [`Volumes`](../cornerstone-core/volumes.md) to `Cornerstone3D`, we are adding and maintaining `Streaming-volume-image-loader`
which is a progressive loader for volumes.


## Creating Volumes From Images

During the design of `Cornerstone3D` `Streaming-volume-image-loader` we considered the following options for loading image volumes:

1. Loading each image separately, then creating a volume from them
2. Fetching metadata from all images, create a volume before hand, then insert each image inside the volume one by one as they are loaded

We chose option 2. Below we will explain the rationale behind this choice, and the advantages and disadvantages of each option.

<div style={{textAlign: 'center'}}>

![](../../assets/volume-building.png)
</div>


### [Not Implemented]: Option 1

In this scenario, each image needs to be created separately, which means each image needs to be loaded and a
Cornerstone [`Image`](../cornerstone-core/images.md) should be created. This is a costly operation as all the image
objects are loaded in memory and a separate creation of a [`Volume`](../cornerstone-core/volumes.md) is required from
those images.

Advantages:
- Not need for a separate metadata call to fetch the image metadata.

Disadvantages:
- Performance cost
- Cannot progressively load the image data, as it requires creating a new volume for each image change

### [Implemented]: Option2

By pre-fetching the metadata from all images (`imageIds`), we can calculate and pre-cache
the volume dimensions and create a volume object before hand. This way, for each image that is fetched
no image object needs to be created, and the pixelData of the image is directly inserted into the volume
at the correct location.

Advantage:
- Speed
- Progressive Loading of the image data


Disadvantage:
- Requirement to pre-fetch image metadata


## Converting volumes from/to images
`StreamingImageVolume` loads a volume based on a series of fetched images (2D), a `Volume` can implement functions to convert its 3D pixel data to 2D images without re-requesting them over the network. For instance, using `convertToCornerstoneImage`, `StreamingImageVolume` instance takes an imageId and its imageId index and return a Cornerstone Image object (ImageId Index is required since we want to locate the imageId pixelData in the 3D array and copy it over the Cornerstone Image).

This is a process that can be reverted; `Cornerstone3D` can create a volume from a set of `imageIds` if they have properties of a volume (Same FromOfReference, origin, dimension, direction and pixelSpacing).

## Usage
As mentioned before, a pre-cache volume should be created before hand from the image metadata. This can be
done by calling the `createAndCacheVolume`.

```js
const ctVolumeId = "C
const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeId, {
  imageIds: ctImageIds,
})
```
Then the volume can call its `load` method to actually load the pixel data of the images.

```js
await ctVolume.load()
```
