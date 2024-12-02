---
id: voxelManager
title: Voxel Manager
---

# VoxelManager Documentation

The VoxelManager is a key component of the Cornerstone library’s new architecture for handling voxel data and volume management. This updated design streamlines data flow and enhances performance, providing a single source of truth for image caching and data access, with a focus on reducing memory usage and improving performance in handling large image datasets.

## Overview

With the integration of VoxelManager, voxel data handling shifts from relying on large scalar arrays to using individual images and targeted voxel data access methods. VoxelManager serves as an adapter for tools and functions that interact with voxel data, providing efficient methods for accessing, modifying, and streaming voxel information.

### Key Features

- **Single Source of Truth**: Only the image cache is used, eliminating the need for separate volume caches and reducing synchronization issues.
- **Efficient Volume Streaming**: Loads image by image, caching only what’s necessary and streaming data directly to the GPU.
- **Optimized Caching**: Data is stored in its native format and converted only as needed, minimizing memory and processing overhead.
- **Simplified Web Worker Implementation**: Removed `SharedArrayBuffer` dependencies, simplifying security and worker requirements.

## VoxelManager API

The VoxelManager API replaces direct scalar data access with methods that provide precise control over voxel data without generating large data arrays. Here are the primary methods and usage patterns:

### Accessing Voxel Data

- **`getScalarData()`**: Returns the scalar data array for individual images (applicable only to `IImage`).
- **`getScalarDataLength()`**: Provides the total voxel count, replacing `scalarData.length`.
- **`getAtIndex(index)`**: Retrieves the voxel value at a specific linear index.
- **`setAtIndex(index, value)`**: Sets the voxel value at a specific linear index.
- **`getAtIJK(i, j, k)`**: Gets the voxel value at IJK coordinates.
- **`setAtIJK(i, j, k, value)`**: Sets the voxel value at IJK coordinates.
- **`getArrayOfModifiedSlices()`**: Lists modified slice indices.

### Data Manipulation

- **`forEach(callback, options)`**: Iterates over voxels with a callback for processing or modifying data.
- **`toIndex(ijk)`**: Converts IJK coordinates to a linear index.
- **`toIJK(index)`**: Converts a linear index back to IJK coordinates.

### Volume Information

- **`getConstructor()`**: Returns the scalar data type constructor.
- **`getBoundsIJK()`**: Fetches the volume bounds in IJK coordinates.

### Specialized Methods

- **`setTimePoint(timePoint)`**: For 4D datasets, sets the current time point.
- **`getAtIndexAndTimePoint(index, timePoint)`**: Retrieves the voxel value at a specified index and time point.

### Example: Migrating Data Access and Manipulation

Instead of accessing `scalarData` directly, use VoxelManager for data manipulation. Here’s a migration example:

#### Before

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

#### After

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

## Handling Image Volume Construction

When creating volumes, `scalarData` is no longer required. Instead, use `VoxelManager` internally:

#### Before

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

#### After

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

## Best Practices

- **Data Access Optimization**: Use `getAtIndex` and `setAtIndex` for bulk operations due to their efficiency. Use `forEach` for large-volume iteration.
- **Memory Management**: Avoid `getCompleteScalarDataArray()` as it rebuilds large data arrays and can degrade performance.
- **Handling RGB Data**: `getAtIndex` and `getAtIJK` return `[r, g, b]` arrays for RGB volumes.

## Conclusion

The VoxelManager is central to Cornerstone’s new volume management strategy, offering a flexible, efficient API for voxel data access and manipulation. This migration to VoxelManager allows for more efficient memory usage, faster performance, and improved compatibility with large datasets, ensuring a smoother workflow for developers working with complex medical imaging data.
