---
id: dynamic-volume
title: '4D or Dynamic Volume'
---



# 4D Or Dynamic Volume

We think this is important enough to have a section for itself

## imageIdsGroups is now imageIdGroups

if you were using splitImageIdsBy4DTags to get the imageIdsGroups now you should expect the return
object to have ImageIdGroups instead of ImageIdsGroups

migration

```js
const { imageIdsGroups } = splitImageIdsBy4DTags(imageIds);
```

should be

```js
const { imageIdGroups } = splitImageIdsBy4DTags(imageIds);
```

## StreamingDynamicImageVolume

### Constructor Changes

The constructor signature has been updated to include `imageIdGroups` instead of separate `scalarData` arrays.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
constructor(
  imageVolumeProperties: Types.ImageVolumeProps & { splittingTag: string },
  streamingProperties: Types.IStreamingVolumeProperties
) {
  // ...
}
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
constructor(
  imageVolumeProperties: ImageVolumeProps & {
    splittingTag: string;
    imageIdGroups: string[][];
  },
  streamingProperties: IStreamingVolumeProperties
) {
  // ...
}
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Update the constructor call to include `imageIdGroups` instead of `scalarData`.
2. Remove any code that previously handled `scalarData` arrays.

### New Methods for ImageId Management

Version 2 introduces new methods for managing image IDs:

- `getCurrentTimePointImageIds()`
- `flatImageIdIndexToTimePointIndex()`
- `flatImageIdIndexToImageIdIndex()`

**Migration Steps:**

1. Use `getCurrentTimePointImageIds()` to get image IDs for the current time point.
2. Utilize `flatImageIdIndexToTimePointIndex()` and `flatImageIdIndexToImageIdIndex()` for converting between flat indices and time point/image indices.

### Removal of getScalarData Method and Using VoxelManager for Dynamic Image Volumes

The `getScalarData()` method has been removed in version 2 in favor of the new voxel Manager

In version 2, the `StreamingDynamicImageVolume` class now uses a `VoxelManager` to handle time point data. This change provides more efficient memory management and easier access to voxel data across different time points. Here's how you can use the `VoxelManager` to access and manipulate data in your dynamic image volumes:

#### Accessing Voxel Data

To access voxel data for the current time point:

```typescript
const voxelValue = volume.voxelManager.get(index);
```

To access voxel data for a specific time point:

```typescript
const voxelValue = volume.voxelManager.getAtIndexAndTimePoint(index, timePoint);
```

#### Getting Scalar Data

To get the complete scalar data array for the current time point:

```typescript
const scalarData = volume.voxelManager.getCurrentTimePointScalarData();
```

To get the scalar data for a specific time point:

```typescript
const scalarData = volume.voxelManager.getTimePointScalarData(timePoint);
```

#### Getting Volume Information

You can access various volume properties through the `VoxelManager`:

```typescript
const scalarDataLength = volume.voxelManager.getScalarDataLength();
const dataType = volume.voxelManager.getConstructor();
const dataRange = volume.voxelManager.getRange();
const middleSliceData = volume.voxelManager.getMiddleSliceData();
```

**Migration Steps:**

1. Replace direct access to `scalarData` arrays with calls to the appropriate `VoxelManager` methods.
2. Update any code that manually managed time points to use the `VoxelManager`'s time point-aware methods.
3. Use `getCurrentTimePointScalarData()` or `getTimePointScalarData(tp)` instead of the removed `getScalarData()` method.
4. If you need to perform operations across all time points, you can iterate through them using the `numTimePoints` property and the `getTimePointScalarData(tp)` method.

By leveraging the `VoxelManager`, you can efficiently work with dynamic image volumes without manually managing multiple scalar data arrays. This approach provides better performance and memory usage, especially for large datasets with many time points.

## Exports Imports

If you were previously using `@cornerstonejs/streaming-image-volume-loader`, you'll need to update your imports and potentially adjust your code to use the new integrated volume loading API in `@cornerstonejs/core`.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```js
import {
  cornerstoneStreamingDynamicImageVolumeLoader,
  StreamingDynamicImageVolume,
  helpers,
  Enums,
} from '@cornerstonejs/streaming-image-volume-loader';

Enums.Events.DYNAMIC_VOLUME_TIME_POINT_INDEX_CHANGED;
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```js
import {
  cornerstoneStreamingDynamicImageVolumeLoader,
  StreamingDynamicImageVolume,
} from '@cornerstonejs/core';

import { getDynamicVolumeInfo } from '@cornerstonejs/core/utilities';
import { Enums } from '@cornerstonejs/core/enums';

Enums.Events.DYNAMIC_VOLUME_TIME_POINT_INDEX_CHANGED;
```

  </TabItem>
</Tabs>

## getDataInTime

The imageCoordinate option is now worldCoordinate, to better reflect that it's a world coordinate and not an image coordinate.

<Tabs>
<TabItem value="Before" label="Before 📦 " default>

```typescript
function getDataInTime(
  dynamicVolume: Types.IDynamicImageVolume,
  options: {
    frameNumbers?;
    maskVolumeId?;
    imageCoordinate?;
  }
): number[] | number[][];
```

</TabItem>
<TabItem value="After" label="After 🚀">

```typescript
function getDataInTime(
  dynamicVolume: Types.IDynamicImageVolume,
  options: {
    frameNumbers?;
    maskVolumeId?;
    worldCoordinate?;
  }
): number[] | number[][];
```

</TabItem>
</Tabs>

### Usage Example

<Tabs>
<TabItem value="Before" label="Before 📦 " default>

```typescript
const result = getDataInTime(dynamicVolume, {
  frameNumbers: [0, 1, 2],
  imageCoordinate: [100, 100, 100],
});
```

</TabItem>
<TabItem value="After" label="After 🚀">

```typescript
const result = getDataInTime(dynamicVolume, {
  frameNumbers: [0, 1, 2],
  worldCoordinate: [100, 100, 100],
});
```

</TabItem>
</Tabs>

## generateImageFromTimeData

<Tabs>
<TabItem value="Before" label="Before 📦 " default>

```typescript
function generateImageFromTimeData(
  dynamicVolume: Types.IDynamicImageVolume,
  operation: string,
  frameNumbers?: number[]
);
```

</TabItem>
<TabItem value="After" label="After 🚀">

```typescript
function generateImageFromTimeData(
  dynamicVolume: Types.IDynamicImageVolume,
  operation: Enums.GenerateImageType,
  options: {
    frameNumbers?: number[];
  }
): Float32Array;
```

</TabItem>
</Tabs>

### Key Changes

1. `operation` now uses `Enums.GenerateImageType` enum.
2. Frame numbers are passed in an options object.
3. Function explicitly returns `Float32Array`.

### Usage Example

<Tabs>
<TabItem value="Before" label="Before 📦 " default>

```typescript
const result = generateImageFromTimeData(dynamicVolume, 'SUM', [0, 1, 2]);
```

</TabItem>
<TabItem value="After" label="After 🚀">

```typescript
const result = generateImageFromTimeData(
  dynamicVolume,
  Enums.GenerateImageType.SUM,
  {
    frameNumbers: [0, 1, 2],
  }
);
```

</TabItem>
</Tabs>

## Summary of Other Changes

- New `updateVolumeFromTimeData` function added for in-place volume updates.
- Both functions now use `voxelManager` for improved performance.
- Enhanced error handling and standardized error messages.
- Operations now use `Enums.GenerateImageType` for better type safety.
