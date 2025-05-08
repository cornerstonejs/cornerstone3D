---
id: threshold-tools
title: 'Labelmap Thresholding Tools'
summary: Changes to labelmap thresholding tools when upgrading to Cornerstone3D 3.x
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

## Key Changes:

* The nested `strategySpecificConfiguration` object has been removed completely
* Configuration properties have been moved to the root level of the configuration object
* Threshold configuration has been restructured:
  * `threshold` array is now a `range` property inside a `threshold` object
  * Additional threshold properties (`isDynamic`, `dynamicRadius`) are part of the same object
* `setBrushThresholdForToolGroup()` function signature has changed to accept a structured threshold object
* Strategy-specific properties like `useCenterSegmentIndex` have been moved to the root configuration level
* `activeStrategy` is now a standalone property in tool operations data, no longer inside a nested configuration

## Migration Steps:

### 1. Replace strategySpecificConfiguration with direct properties

**Before:**
```diff
- configuration: {
-   activeStrategy: 'THRESHOLD_INSIDE_SPHERE_WITH_ISLAND_REMOVAL',
-   strategySpecificConfiguration: {
-     THRESHOLD: {
-       threshold: [-150, -70],
-       // other threshold properties
-     },
-     useCenterSegmentIndex: true,
-   },
- }
```

**After:**
```diff
+ configuration: {
+   activeStrategy: 'THRESHOLD_INSIDE_SPHERE_WITH_ISLAND_REMOVAL',
+   threshold: {
+     range: [-150, -70],
+     isDynamic: false,
+     // other threshold properties directly here
+   },
+   useCenterSegmentIndex: true,
+ }
```

### 2. Update threshold configuration structure

**Before:**
```diff
- strategySpecificConfiguration: {
-   THRESHOLD: {
-     threshold: [-150, -70], // Previous threshold array format
-     isDynamic: false,
-     dynamicRadius: 5
-   }
- }
```

**After:**
```diff
+ threshold: {
+   range: [-150, -70], // New 'range' property replaces 'threshold'
+   isDynamic: false,
+   dynamicRadius: 5
+ }
```

### 3. Update setBrushThresholdForToolGroup calls

**Before:**
```diff
- segmentationUtils.setBrushThresholdForToolGroup(
-   toolGroupId,
-   thresholdArgs.threshold,
-   thresholdArgs
- );
```

**After:**
```diff
+ segmentationUtils.setBrushThresholdForToolGroup(
+   toolGroupId,
+   fullThresholdArgs
+ );
```

Note that `thresholdArgs` should now be an object with the structure:
```javascript
{
  range: [min, max], // Previously 'threshold'
  isDynamic: boolean,
  dynamicRadius: number
}
```
