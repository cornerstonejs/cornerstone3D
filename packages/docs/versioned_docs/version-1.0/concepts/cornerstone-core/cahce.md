---
id: cache
title: Cache
---

# Cache

The Cache API’s role is to keep track of created volumes, manage memory usage, and alert the host application when trying to allocate data that would exceed application defined limits.

This module deals with Caching of images and volumes

The cache has two main components: a volatile portion for images and a non-volatile portion for volumes. We will have a shared block of memory allocated for the entire cache, e.g. 1GB which will be shared for images and volumes.

- Individual 2D images are volatile and will be replaced by new images hitting the cache.
- When you allocate volumes, these are non-volatile and reserve a block of memory from the cache. Volumes must be released manually.

## Utilities for the cache

There are various utility functions you can use to manage the cache.

- **isCacheable**: One of the many utility functions that the `Cache` API provides is `isCacheable` which you can use to check if there is enough free space before initiating the fetch for the volume or image.
- **purgeCache**: Deletes all the images and volumes inside the cache.
- **decacheIfNecessaryUntilBytesAvailable**: It purges the cache if necessary based on the requested number of bytes.

## Cache Optimizations

`Cornerstone3D` supports various cache optimizations for loading images and volumes.

### Loading an image

When requesting for a new image with `imageLoaders`, `Cornerstone3D` checks if there is an already cached `Volume` inside the `volumeCache` containing the same imageId; if found, no network request is fired for the image, and the pixelData is copied over from the volume.

Detailed steps for loading an images are:

We check if there is enough unallocated + volatile space for the single image

1. if so:

   - We allocate the image in image cache, and if necessary oldest images are decached to match the maximumCacheSize criteria
   - If a volume contains that imageId, copy it over using TypedArray's set method.
   - If no volumes contain the imageId, the image is fetched by image loaders

2. If not (cache is mostly/completely full with volumes)
   - Throw that the cache does not have enough working space to allocate the image

### Loading a volume

Also, requesting a volume with a set of imageIds will trigger a search inside the `imageCache`. If the image has already been requested and cached, its pixelData is used and it is inserted at the correct position inside the volume.

Detailed steps for loading a volume with set of images is:

Check if there is enough unallocated + volatile space to allocate the volume:

1. If so:

   - Decache oldest images which won't be included in this volume until we have enough free space for the volume
   - If not enough space from previous space, decache images that will be included in the volume until we have enough free space (These will need to be re-fetched, but we must do this not to straddle over the given memory limit, even for a short time, as this may crash the app)
   - At this point, if any of the frames (indexed by imageId) are present in the volatile image cache, copy these over to the volume now

2. If not (cache is mostly/completely full with volumes)
   - Throw that the cache does not have enough working space to allocate the volume.
