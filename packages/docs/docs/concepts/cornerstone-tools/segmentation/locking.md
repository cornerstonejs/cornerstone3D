---
id: locking
title: Segment Locking
---

# Segment Locking

You can lock a segment index in a segmentation, so that it cannot be changed by any tools.

To give an example consider the following image with an overlaid labelmap.
The left image shows `segment index 1`, the middle image shows the result when `segment index 2`
is drawn on top of `segment index 1`, and the right image shows the result when `segment index 1`
is locked and `segment index 2` is drawn on top of `segment index 1`.
As you see in the locked scenario (right image), the segment index 1 cannot be changed by the new drwaing.

![](../../../assets/segment-locking.png)

## API

```js
import { segmentation } from '@cornerstonejs/tools';

// For locking a segment index on a segmentation
segmentation.locking.setSegmentIndexLocked(
  segmentationId,
  segmentIndex,
  locked
);

// Getting all the locked segments for a segmentation
segmentation.locking.getLockedSegments(segmentationId);

// Check if the segment index in the segmentation is locked
segmentation.locking.isSegmentIndexLocked(
  segmentationId,
  segmentIndex
);
```
