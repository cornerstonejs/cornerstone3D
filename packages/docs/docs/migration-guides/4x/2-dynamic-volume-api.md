# Dynamic Volume API Changes

## What Changed

In version 4.x, the deprecated timepoint-based API for dynamic volumes has been removed in favor of the dimension group-based API.

### Removed APIs

The following deprecated properties and methods have been removed:

#### IDynamicImageVolume Interface

- `timePointIndex` getter/setter
- `numTimePoints` property

#### StreamingDynamicImageVolume Class

- `timePointIndex` getter/setter
- `numTimePoints` property
- `getCurrentTimePointImageIds()` method
- `flatImageIdIndexToTimePointIndex()` method
- `isTimePointLoaded()` method
- `checkTimePointCompletion()` method

#### Events

- `DYNAMIC_VOLUME_TIME_POINT_INDEX_CHANGED`
- `DYNAMIC_VOLUME_TIME_POINT_LOADED`

## Migration Guide

No migration is needed if you're already using the dimension group-based API. If you're still using the deprecated timepoint API, update your code as follows:

### Property Updates

```javascript
// Before (3.x)
volume.timePointIndex = 2; // Zero-based
const index = volume.timePointIndex;
const count = volume.numTimePoints;

// After (4.x)
volume.dimensionGroupNumber = 3; // One-based (2 + 1)
const groupNumber = volume.dimensionGroupNumber;
const count = volume.numDimensionGroups;
```

### Method Updates

```javascript
// Before (3.x)
const imageIds = volume.getCurrentTimePointImageIds();
const tpIndex = volume.flatImageIdIndexToTimePointIndex(flatIndex);
const isLoaded = volume.isTimePointLoaded(timePointIndex);

// After (4.x)
const imageIds = volume.getCurrentDimensionGroupImageIds();
const groupNumber = volume.flatImageIdIndexToDimensionGroupNumber(flatIndex);
const isLoaded = volume.isDimensionGroupLoaded(groupNumber);
```

### Event Updates

```javascript
// Before (3.x)
eventTarget.addEventListener(
  Events.DYNAMIC_VOLUME_TIME_POINT_INDEX_CHANGED,
  handler
);
eventTarget.addEventListener(Events.DYNAMIC_VOLUME_TIME_POINT_LOADED, handler);

// After (4.x)
eventTarget.addEventListener(
  Events.DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED,
  handler
);
eventTarget.addEventListener(
  Events.DYNAMIC_VOLUME_DIMENSION_GROUP_LOADED,
  handler
);
```

## Important Notes

- Dimension group numbers are **1-based** (starting from 1)
- The old timePointIndex was **0-based** (starting from 0)
- When converting, add 1 to timePointIndex to get dimensionGroupNumber

## Why We Changed This

The dimension group terminology better reflects the actual data structure and aligns with DICOM standards, making the API more intuitive and consistent.
