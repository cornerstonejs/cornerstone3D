---
id: adapters
title: 'Adapters API'
summary: Guide for using the new adapters API in Cornerstone3D 3.x
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

## Key Changes:

- MeasurementsReport has two maps instead of objects for setting the
  adapter classes, mapping the tool type to adapter class and the
  tracking id to adapter class.
- A new register additional tracking id method exists to allow adding
  custom adapter methods.
- Adapter implementations now have a base class to handle some of the
  definition. This allows calling into the base class to handle some of the
  definition such as the is tracking handling.
- The MeasurementsReport class is now extensible to create a new class with
  completely different default handling. To do this, the two map attributes
  need to be redeclared, and the new instance registered for the handlers.
- There is now an init method to create tracking identifiers and register a new
  handler.
- The annotation changed event no longer requires the viewport id/rendering id
  - This change is done so that measurements can be updated when not visible
- The measurement report no longer takes the image to/from world coords as this
  is provided as a method exported from `@cornerstonejs/core/utilities`
- The adapters can hydrate world coordinates, eg for MPR reconstruction

## Migration Steps:

### 1. Replace MeasurementsReports.CORNERSTONE_TOOL_CLASSES_BY_UTILITY_TYPE

**Before:**

```diff
- const toolClass = MeasurementReports.CORNERSTONE_TOOL_CLASSES_BY_UTILITY_TYPE[toolType];
```

**After:**

```diff
- const toolClass = MeasurementReports.measurementAdapterByToolType.get(toolType);
```

### 2. Replace Tool instance adapter registration which is identical to existing registration

**Before:**

```diff
- class MyNewToolAdapter { ... identical to eg Probe Adapter }
```

**After:**

```diff
- const MyNewToolAdapter = Probe.initCopy('MyNewTool');
```

### 3. Replace old tool registration with registerTrackingIdentifier

**Before:**

```diff
- class OldToolAdapter { ... identical to eg Length v1.0 except has :v1.0 at end of tracking identifier }
```

**After:**

```diff
- MeasurementReport.registerTrackingIdentifier(Length, `${Length.trackingIdentifierTextValue}:v1.0`);
```

### 4. Remove image to/from world coords in use of MeasurementReport

**Before:**

```
  // Use cs3d adapters to generate toolState.
  let storedMeasurementByAnnotationType = MeasurementReport.generateToolState(
    datasetToUse,
    // NOTE: we need to pass in the imageIds to dcmjs since the we use them
    // for the imageToWorld transformation. The following assumes that the order
    // that measurements were added to the display set are the same order as
    // the measurementGroups in the instance.
    sopInstanceUIDToImageId,
    metaData,
    csUtilities.imageToWorldCoords
  );
```

**After:**

```
  // Use cs3d adapters to generate toolState.
  let storedMeasurementByAnnotationType = MeasurementReport.generateToolState(
    datasetToUse,
    // NOTE: we need to pass in the imageIds to dcmjs since the we use them
    // for the imageToWorld transformation. The following assumes that the order
    // that measurements were added to the display set are the same order as
    // the measurementGroups in the instance.
    sopInstanceUIDToImageId,
    metaData
  );
```
