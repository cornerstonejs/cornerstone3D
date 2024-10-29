---
id: core
title: '@cornerstonejs/core'
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';



# @cornerstonejs/core

## Initialization

### Removal of `detect-gpu` and `detectGPUConfig`

Cornerstone3D 2.x has removed the dependency on `detect-gpu`. This change addresses issues reported by users working in environments where internet access is restricted, as `detect-gpu` relied on internet connectivity to determine GPU models.

#### Key Changes:

1. **Default GPU Tier**: We now use a default GPU tier of 2 (medium tier).
2. **No Internet Dependency**: The library no longer requires internet access for GPU detection.
3. **Configurable GPU Tier**: You can still configure your own GPU tier if needed.

#### How to Migrate:

If you were previously relying on `detect-gpu` for GPU tier detection, you'll need to update your initialization code. Here's an example of how to initialize Cornerstone3D with a custom GPU tier:

```js
cornerstone3D.init({ gpuTier: 3 });
```

### removal of `use16BitDataType`

This flag requested 16-bit data type from the web worker. Now, we always use the native data type for cache storage and convert it for rendering when necessary.

### removal of `enableCacheOptimization`

It is no longer needed since we automatically optimize cache for you.

## Volume Viewports Actor UID, ReferenceId, and VolumeId

### Previous Behavior

When adding a volume to volume viewports, the logic used to determine the actor's UID was as follows:

```js
const uid = actorUID || volumeId;
volumeActors.push({
  uid,
  actor,
  slabThickness,
  referenceId: volumeId,
});
```

In this setup, the actor UID and `referenceId` were both set to the `volumeId`. This was problematic because it created actors with identical UIDs, even when they should have been unique. Throughout the codebase, we relied on `actor.uid` to retrieve volumes from the cache, which added further confusion.

### Updated Behavior

We’ve made the following changes to improve clarity and functionality. The actor UID is now distinct, using this logic:

```js
const uid = actorUID || uuidv4();
volumeActors.push({
  uid,
  actor,
  slabThickness,
  referencedId: volumeId,
});
```

### Key Changes

1. **Unique Actor UID**: The actor UID is now always a unique identifier (`uuidv4()`), while the `referencedId` is set to the `volumeId`. If your code relied on `actor.uid` to retrieve volumes, you should now use `referencedId` or the new `viewport.getVolumeId()` method to get the `volumeId`—which is the preferred approach.

2. **Renaming `referenceId` to `referencedId`**: To improve clarity, `referenceId` has been renamed to `referencedId`. This change aligns with our library’s naming conventions, such as `referencedImageId` and `referencedVolumeId`. Since an actor can be derived from either a volume or an image, using the term `referencedId` provides a more accurate description of its role.

These changes should make the logic easier to follow and prevent issues with duplicate UIDs.

### Migrations

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```js
const defaultActor = viewport.getDefaultActor();
const volumeId = defaultActor.uid;
const volume = cache.getVolume(volumeId);
```

or

```js
volumeId = viewport.getDefaultActor()?.uid;
cache.getVolume(volumeId)?.metadata.Modality;
```

or

```js
const { uid: volumeId } = viewport.getDefaultActor();
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```js
const volume = cache.getVolume(viewport.getVolumeId());
```

  </TabItem>
</Tabs>

## Viewport APIs

### ImageDataMetaData

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```js
interface ImageDataMetaData {
  // ... other properties
  numComps: number;
  // ... other properties
}
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```js
export interface ImageDataMetaData {
  // ... other properties
  numberOfComponents: number;
  // ... other properties
}
```

  </TabItem>
</Tabs>

### Reset Camera

Previously, we had a `resetCamera` method that took positional arguments. Now it takes an object argument.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```js
viewport.resetCamera(false, true, false);
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```js
viewport.resetCamera({
  resetZoom: true,
  resetPan: false,
  resetToCenter: false,
});
```

  </TabItem>
</Tabs>

### Rotation

The `rotation` property has been removed from `getProperties` and `setProperties`, and has moved to `getViewPresentation` and `setViewPresentation` or `getCamera` and `setCamera`.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```js
viewport.getProperties().rotation;
viewport.setProperties({ rotation: 10 });
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```js
const { rotation } = viewport.getViewPresentation();

// or

const { rotation } = viewport.getCamera();

viewport.setViewPresentation({ rotation: 10 });

// or

viewport.setCamera({ rotation: 10 });
```

  </TabItem>
</Tabs>

<details>
<summary>Why?</summary>

`rotation` is not a property of the viewport but rather a view prop. You can now access it through `getViewPresentation`.

</details>

### getReferenceId

`getReferenceId` is now `getViewReferenceId`

```js
viewport.getReferenceId() -- > viewport.getViewReferenceId();
```

<details>
<summary>Why?</summary>

It is more accurate to use `getViewReferenceId` to reflect the actual function of the method since it returns view-specific information, and not about the actor reference.

</details>

## New PixelData Model and VoxelManager

The Cornerstone library has undergone significant changes in how it handles image volumes and texture management. These changes aim to improve performance, reduce memory usage, and provide more efficient data access, especially for large datasets.

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

**Results**

- Streamlined data flow from image cache directly to GPU.
- Improved memory usage and performance.
- Enhanced compatibility with various volume formats.
- Optimized overall system architecture for image and volume handling.
- Simplified web worker implementation (ArrayBuffer is now sufficient).

### Introduction of VoxelManager

A new `VoxelManager` class has been introduced to handle voxel data more efficiently. This change eliminates the need for allocating large scalar data arrays for volumes, instead relying on individual images and an adapter called VoxelManager.

**Migration Steps:**

1. Replace direct scalar data access with `VoxelManager` methods:

   Instead of accessing `volume.getScalarData()`, use `volume.voxelManager` to interact with the data.

2. Scalar Data length:

   Use `voxelManager.getScalarDataLength()` instead of `scalarData.length`.

3. Scalar Data Manipulation:

   a. Use `getAtIndex(index)` and `setAtIndex(index, value)` for accessing and modifying voxel data.

   b. For 3D coordinates, use `getAtIJK(i, j, k)` and `setAtIJK(i, j, k, value)`.

4. Available VoxelManager Methods:

   - `getScalarData()`: Returns the entire scalar data array (only for IImage, not for volumes).
   - `getScalarDataLength()`: Returns the total number of voxels.
   - `getAtIndex(index)`: Gets the value at a specific index.
   - `setAtIndex(index, value)`: Sets the value at a specific index.
   - `getAtIJK(i, j, k)`: Gets the value at specific IJK coordinates.
   - `setAtIJK(i, j, k, value)`: Sets the value at specific IJK coordinates.
   - `getArrayOfModifiedSlices()`: Returns an array of modified slice indices.
   - `forEach(callback, options)`: Iterates over voxels with a callback function.
   - `getConstructor()`: Returns the constructor for the scalar data type.
   - `getBoundsIJK()`: Returns the bounds of the volume in IJK coordinates.
   - `toIndex(ijk)`: Converts IJK coordinates to a linear index.
   - `toIJK(index)`: Converts a linear index to IJK coordinates.

5. Handling modified slices:

   Use `voxelManager.getArrayOfModifiedSlices()` to get the list of modified slices.

6. Iterating over voxels:

   Use the `forEach` method for efficient iteration:

   ```javascript
   voxelManager.forEach(
     ({ value, index, pointIJK, pointLPS }) => {
       // Manipulate or process voxel data
     },
     {
       boundsIJK: optionalBounds,
       imageData: optionalImageData, // for LPS calculations
     }
   );
   ```

7. Getting volume information:

   - Dimensions: `volume.dimensions`
   - Spacing: `volume.spacing`
   - Direction: `volume.direction`
   - Origin: `volume.origin`

8. For RGB data:

   If dealing with RGB data, the `getAtIndex` and `getAtIJK` methods will return an array `[r, g, b]`.

9. Performance considerations:

   - Use `getAtIndex` and `setAtIndex` for bulk operations when possible, as they're generally faster than `getAtIJK` and `setAtIJK`.
   - When iterating over a large portion of the volume, consider using `forEach` for optimized performance.

10. Dynamic Volumes:

    For 4D datasets, additional methods are available:

    - `setTimePoint(timePoint)`: Sets the current time point.
    - `getAtIndexAndTimePoint(index, timePoint)`: Gets a value for a specific index and time point.

Example of migrating a simple volume processing function:

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```javascript
function processVolume(volume) {
  const scalarData = volume.getScalarData();
  for (let i = 0; i < scalarData.length; i++) {
    if (scalarData[i] > 100) {
      scalarData[i] = 100;
    }
  }
}
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```javascript
function processVolume(volume) {
  const voxelManager = volume.voxelManager;
  const length = voxelManager.getScalarDataLength();
  for (let i = 0; i < length; i++) {
    const value = voxelManager.getAtIndex(i);
    if (value > 100) {
      voxelManager.setAtIndex(i, 100);
    }
  }
}
```

  </TabItem>
</Tabs>

By following these expanded migration steps and utilizing the full capabilities of the VoxelManager, you can efficiently work with volume data while benefiting from the improved performance and reduced memory usage of the new system.

**Migration Steps For Volumes (IImageVolume):**

1. When processing volume data, search your custom codebase for `getScalarData` or `scalarData`. Instead, use `voxelManager` to access the scalar data API.

:::info
If you can't use the atomic data API through `getAtIndex` and `getAtIJK`, you can fall back to `voxelManager.getCompleteScalarDataArray()` to rebuild the full scalar data array like cornerstone3D 1.0. However, this is not recommended due to performance and memory concerns. Use it only as a last resort.

Also you can do `.setCompleteScalarDataArray` as well.
:::

**Migration Steps For Stack Images (IImage):**

1. there is not much changed here for stack images, you can still use `image.getPixelData()` OR access the scalarData array from the `voxelManager` with `image.voxelManager.getScalarData()`.

:::info
ONLY For volumes, there is no direct `scalarData` array. Instead, use `voxelManager` to access the scalar data at index or ijk. Manipulation of scalar data for single images remains unchanged.
:::

### Image Volume Construction

The construction of image volumes has been updated to use `VoxelManager` and new properties, eliminating the need for large scalar data arrays.

:::info
As mentioned, there is no scalarData array in the volume object, and imageIds is sufficient to describe the volume.
:::

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
const streamingImageVolume = new StreamingImageVolume({
  volumeId,
  metadata,
  dimensions,
  spacing,
  origin,
  direction,
  scalarData,
  sizeInBytes,
  imageIds,
});
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
const streamingImageVolume = new StreamingImageVolume({
  volumeId,
  metadata,
  dimensions,
  spacing,
  origin,
  direction,
  imageIds,
  dataType,
  numberOfComponents,
});
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Remove `scalarData` and `sizeInBytes` from the constructor parameters.
2. Add `dataType` and `numberOfComponents` to the constructor parameters.
3. The `VoxelManager` will be created internally based on these parameters.

**Explanation:**
This change reflects the shift from using large scalar data arrays to using the VoxelManager for data management. It allows for more efficient memory usage and better handling of streaming data.

#### Accessing Volume Properties

Some volume properties are now accessed differently due to the `VoxelManager` integration. The reason is we don't create the vtkScalarData fully for volume so you can't access it like before.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
const numberOfComponents = imageData
  .getPointData()
  .getScalars()
  .getNumberOfComponents();
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
const { numberOfComponents } = imageData.get('numberOfComponents');
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Replace `getPointData().getScalars().getNumberOfComponents()` with `get('numberOfComponents')`.
2. Use the destructuring syntax to extract the `numberOfComponents` property.

::info
These changes represent a significant update to the Cornerstone library's handling of image volumes and textures. The introduction of the VoxelManager and the elimination of large scalar data arrays for volumes provide several benefits:

1. Reduced memory usage: By relying on individual images instead of a large array buffer, memory usage is significantly reduced, especially for large datasets.
2. Improved performance: The VoxelManager allows for more efficient data access and manipulation, leading to better overall performance.
3. Better streaming support: The new approach is better suited for streaming large datasets, as it doesn't require loading the entire volume into memory at once.
4. More flexible data management: The VoxelManager provides a unified interface for accessing and modifying voxel data, regardless of the underlying data structure.

Developers will need to update their code to use the new VoxelManager API and adjust how they interact with volume data and textures. While these changes may require significant updates to existing code, they provide a more efficient and flexible foundation for working with large medical imaging datasets.
:::

We have applied this new design to both volume and stack viewports.

## Image Loader

## VolumeLoader

The volume loading and caching functionality has undergone significant changes in version 2. The main updates include simplification of the API, removal of certain utility functions, and changes in the way volumes are created and cached.

### Changes in Volume Creation Functions

The `createLocalVolume` function has been updated to take `volumeId` as the first parameter and options as the second parameter.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
function createLocalVolume(
  options: LocalVolumeOptions,
  volumeId: string,
  preventCache = false
): IImageVolume {
  // ...
}
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
function createLocalVolume(
  volumeId: string,
  options = {} as LocalVolumeOptions
): IImageVolume {
  // ...
}
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Update all calls to `createLocalVolume` by moving the `volumeId` parameter to the first position.
2. Remove the `preventCache` parameter and handle caching separately if needed.

### Changes in Derived Volume Creation

The `createAndCacheDerivedVolume` function now returns synchronously instead of returning a Promise.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
async function createAndCacheDerivedVolume(
  referencedVolumeId: string,
  options: DerivedVolumeOptions
): Promise<IImageVolume> {
  // ...
}
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
function createAndCacheDerivedVolume(
  referencedVolumeId: string,
  options: DerivedVolumeOptions
): IImageVolume {
  // ...
}
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Remove `await` keywords when calling `createAndCacheDerivedVolume`.
2. Update any code that expects a Promise to handle the synchronous return value.

### Renamed Functions

Some functions have been renamed for clarity:

- `createAndCacheDerivedSegmentationVolume` is now `createAndCacheDerivedLabelmapVolume`
- `createLocalSegmentationVolume` is now `createLocalLabelmapVolume`

**Migration Steps:**

1. Update all calls to these functions with their new names.
2. Ensure that any code referencing these functions is updated accordingly.

### Target Buffer Type Migration

The `targetBufferType` option has been replaced with a `targetBuffer` object throughout the library. This change affects multiple functions and interfaces.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
interface DerivedImageOptions {
  targetBufferType?: PixelDataTypedArrayString;
  // ...
}

function createAndCacheDerivedImage(
  referencedImageId: string,
  options: DerivedImageOptions = {
    targetBufferType: 'Uint8Array',
  }
): Promise<IImage> {
  // ...
}

function createAndCacheDerivedImages(
  referencedImageIds: Array<string>,
  options: DerivedImageOptions & {
    targetBufferType?: PixelDataTypedArrayString;
  } = {}
): DerivedImages {
  // ...
}
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
interface DerivedImageOptions {
  targetBuffer?: {
    type: PixelDataTypedArrayString;
  };
  // ...
}

function createAndCacheDerivedImage(
  referencedImageId: string,
  options: DerivedImageOptions = {}
): IImage {
  // ...
}

function createAndCacheDerivedImages(
  referencedImageIds: string[],
  options: DerivedImageOptions & {
    targetBuffer?: {
      type: PixelDataTypedArrayString;
    };
  } = {}
): IImage[] {
  // ...
}
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Update all interfaces and function signatures that use `targetBufferType` to use `targetBuffer` instead.
2. Change all occurrences of `targetBufferType: 'SomeType'` to `targetBuffer: { type: 'SomeType' }`.
3. Update all function calls that previously used `targetBufferType` to use the new `targetBuffer` object structure.
4. Review and update any code that relies on the `targetBufferType` property, ensuring it now uses `targetBuffer.type`.

### Changes in `createAndCacheDerivedImage` Function

The `createAndCacheDerivedImage` function now returns an `IImage` object directly instead of a Promise.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
export function createAndCacheDerivedImage(
  referencedImageId: string,
  options: DerivedImageOptions = {},
  preventCache = false
): Promise<IImage> {
  // ...
  return imageLoadObject.promise;
}
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
export function createAndCacheDerivedImage(
  referencedImageId: string,
  options: DerivedImageOptions = {}
): IImage {
  // ...
  return localImage;
}
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Update any code that expects a Promise from `createAndCacheDerivedImage` to work with the directly returned `IImage` object.
2. Remove the `preventCache` parameter from function calls, as it's no longer used.

### Derived Image Creation

The `createAndCacheDerivedImage` function has been updated to return an `IImage` object directly instead of a Promise.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
function createAndCacheDerivedImage(
  referencedImageId: string,
  options: DerivedImageOptions = {}
): Promise<IImage> {
  // ...
}
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
function createAndCacheDerivedImage(
  referencedImageId: string,
  options: DerivedImageOptions = {}
): IImage {
  // ...
}
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Remove any `await` or `.then()` calls when using `createAndCacheDerivedImage`.
2. Update error handling to catch synchronous errors instead of Promise rejections.

### Image Loading Options

The `targetBufferType` option has been replaced with a `targetBuffer` object.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
const options: DerivedImageOptions = {
  targetBufferType: 'Uint8Array',
};
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
const options: DerivedImageOptions = {
  targetBuffer: { type: 'Uint8Array' },
};
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Replace `targetBufferType` with `targetBuffer` in all option objects.
2. Update the value to be an object with a `type` property.

### Segmentation Image Helpers

The segmentation image helper functions have been renamed and updated.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
function createAndCacheDerivedSegmentationImages(
  referencedImageIds: Array<string>,
  options: DerivedImageOptions = {
    targetBufferType: 'Uint8Array',
  }
): DerivedImages {
  // ...
}

function createAndCacheDerivedSegmentationImage(
  referencedImageId: string,
  options: DerivedImageOptions = {
    targetBufferType: 'Uint8Array',
  }
): Promise<IImage> {
  // ...
}
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
function createAndCacheDerivedLabelmapImages(
  referencedImageIds: string[],
  options = {} as DerivedImageOptions
): IImage[] {
  return createAndCacheDerivedImages(referencedImageIds, {
    ...options,
    targetBuffer: { type: 'Uint8Array' },
  });
}

function createAndCacheDerivedLabelmapImage(
  referencedImageId: string,
  options = {} as DerivedImageOptions
): IImage {
  return createAndCacheDerivedImage(referencedImageId, {
    ...options,
    targetBuffer: { type: 'Uint8Array' },
  });
}
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Rename `createAndCacheDerivedSegmentationImages` to `createAndCacheDerivedLabelmapImages`.
2. Rename `createAndCacheDerivedSegmentationImage` to `createAndCacheDerivedLabelmapImage`.
3. Update function calls to use the new names and parameter structure.
4. Remove any `await` or `.then()` calls when using `createAndCacheDerivedLabelmapImage`.

## Cache Class

The `Cache` class has undergone significant changes in version 2. Here are the main updates and breaking changes:

### Removal of Volume-specific Cache Size

The separate volume cache size has been removed, simplifying the cache management, since we only rely on the image cache solely.

**Migration Steps**:

1. Remove any references to `_volumeCacheSize` if you had

### isCacheable Method Update

The `isCacheable` method has been updated to consider shared cache keys. Which means since we have moved to the image cache only, we need to be careful
on which images can be decached so we don't remove the volume that is still referenced by the view.

### New putImageSync and putVolumeSync Methods

A new `putImageSync` method has been added to directly put an image into the cache synchronously.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
// Method did not exist
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
public putImageSync(imageId: string, image: IImage): void {
  // ... (validation code)
```

public putVolumeSync(volumeId: string, volume: IImageVolume): void {
// ... (validation code)
}

  </TabItem>
</Tabs>

**Migration Steps**:

1. Use the new `putImageSync` and `putVolumeSync` methods when you need to add an image or volume to the cache synchronously.

## Renaming and Nomenclature

### Enums

#### Removal of SharedArrayBufferModes

As we no longer use SharedArrayBuffer, this Enum has been removed.

The following methods have also been removed from @cornerstonejs/core:

- getShouldUseSharedArrayBuffer
- setUseSharedArrayBuffer
- resetUseSharedArrayBuffer

#### ViewportType.WholeSlide -> ViewportType.WHOLE_SLIDE

to match the rest of the library

before

```js
const viewportInput = {
    viewportId,
    type: ViewportType.WholeSlide,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput);

```

after

```js
const viewportInput = {
    viewportId,
    type: ViewportType.WHOLE_SLIDE,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput);

```

### Events and Event Details

#### VOLUME_SCROLL_OUT_OF_BOUNDS -> VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS

is now `VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS`

#### STACK_VIEWPORT_NEW_STACK -> VIEWPORT_NEW_IMAGE_SET

is now VIEWPORT_NEW_IMAGE_SET adn we will gradually bring all viewports to use this event instead

in addition the event is now occurring on the element not the eventTarget

```js
eventTarget.addEventListener(Events.VIEWPORT_NEW_IMAGE_SET, newStackHandler);

// should be now

element.addEventListener(Events.VIEWPORT_NEW_IMAGE_SET, newStackHandler);
```

<details>
<summary>Why?</summary>

We made this change to maintain consistency, as all other events like VOLUME_NEW_IMAGE were occurring on the element. This modification makes more sense because when the viewport has a new stack, it should trigger an event on the viewport element itself.

</details>

#### CameraModifiedEventDetail

Does not publish the `rotation` anymore, and it has moved to ICamera which is published in the event

```js
type CameraModifiedEventDetail = {
  previousCamera: ICamera,
  camera: ICamera,
  element: HTMLDivElement,
  viewportId: string,
  renderingEngineId: string,
};
```

access the rotation from the camera object which previously was in the event detail root.

#### ImageVolumeModifiedEventDetail

The `imageVolume` is no longer available in the event detail. Instead, only the `volumeId` is displayed in the event details to maintain consistency with other library entries. This change ensures a uniform approach across all library content.

If you need the imageVolume you can get it from the `cache.getVolume` method

---
