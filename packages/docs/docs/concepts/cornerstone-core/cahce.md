---
id: cache
title: Cache
---

# Cache

The Cache API’s role is to keep track of created volumes, manage memory usage, and alert the host application when trying to allocate data that would exceed application defined limits.

This module deals with Caching of images and volumes

The cache has two main components: a volatile portion for images and a non-volatile portion for volumes. We will have a shared block of memory allocated for the entire cache, e.g. 1GB which will be shared for images and volumes.

- Individual 2D images are volatile and will be replaced by new images hitting the cache.
- When you allocate volumes, it tags the images used by the volume as non-volatile unless you release the volume.

## Utilities for the cache

There are various utility functions you can use to manage the cache.

- **isCacheable**: One of the many utility functions that the `Cache` API provides is `isCacheable` which you can use to check if there is enough free space before initiating the fetch for the volume or image.
- **purgeCache**: Deletes all the images and volumes inside the cache.
- **decacheIfNecessaryUntilBytesAvailable**: It purges the cache if necessary based on the requested number of bytes.

## Cache Optimizations

All data in the cache is actually `image` objects. When you request a volume, we pass the images necessary for the volume to the GPU on demand, and at no point do we store the voxel data of the volume in the cache. If you need to access the voxel data of a volume, you can do so by using the `VoxelManager` class.

If you ever actually need the full voxel data of a volume, you can use the `VoxelManager` class method `.getCompleteScalarDataArray()` to get the full voxel data.

This new change that was introduced in `Cornerstone3D` 2.x is part of the new image-based approach that aims to improve performance, reduce memory usage, and provide more efficient data access, especially for large datasets.

Here are other benefits of the new approach:
1. Single Source of Truth

   - Previously: Data existed in both image cache and volume cache, leading to synchronization issues.
   - Now: Only one source of truth - the image cache.
   - Benefits: Improved syncing between stack and volume segmentations.

2. New Volume Creation Approach

   - Everything now loads as images.
   - Volume streaming is performed image by image.
   - Only images are cached in the image cache.
   - For volume rendering, data goes directly from image cache to GPU, bypassing CPU scalar data.
   - Benefits: Eliminated need for scalar data in CPU, reduced memory usage, improved performance.

3. VoxelManager for Tools

   - Acts as an intermediary between indexes and scalar data.
   - Provides mappers from IJK to indexes.
   - Retrieves information without creating scalar data.
   - Processes each image individually.
   - Benefits: Efficient handling of tools requiring pixel data in CPU.

4. Handling Non-Image Volumes

   - Volumes without images (e.g., NIFTI) are chopped and converted to stack format.
   - Makes non-image volumes compatible with the new image-based approach.

5. Optimized Caching Mechanism

   - Data stored in native format instead of always caching as float32.
   - On-the-fly conversion to required format when updating GPU textures.
   - Benefits: Reduced memory usage, eliminated unnecessary data type conversions.

6. Elimination of SharedArrayBuffer
   - Removed dependency on SharedArrayBuffer.
   - Each decoded image goes directly to the GPU 3D texture at the correct size and position.
   - Benefits: Reduced security constraints, simplified web worker implementation.
