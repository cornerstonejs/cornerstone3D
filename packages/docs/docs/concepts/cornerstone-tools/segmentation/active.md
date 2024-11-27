---
id: active-segmentation
title: Active Segmentation
---


# Active Segmentation

![](../../../assets/active-segmentation.png)


Each viewport can display multiple segmentation representations simultaneously, but only one segmentation can be active per viewport. The active segmentation is the one that will be modified by segmentation tools.

You can have different styles for active and inactive segmentations. For instance, you can configure different fill and outline properties for active versus inactive segmentations in each viewport.


As shown in the image above, you can display multiple labelmap segmentations in the same viewport. By default, active segmentations have a higher outline width to make them more visually distinct from inactive segmentations.

## Viewport-Specific Active Segmentations

An important concept in version 2.x is that active segmentations are viewport-specific. This means:
- Each viewport can have its own active segmentation
- The same segmentation can be active in one viewport and inactive in another
- Segmentation tools will only modify the active segmentation in the viewport they're being used in

## API

The Active Segmentation API provides methods to get and set the active segmentation for each viewport:

```js
import { segmentation } from '@cornerstonejs/tools';

// Get the active segmentation for a viewport
const activeSegmentation = segmentation.getActiveSegmentation(viewportId);

// Set the active segmentation for a viewport
segmentation.setActiveSegmentation(viewportId, segmentationId);
```

### Getting Active Segmentation Data

Once you have the active segmentation, you can access various properties:

```js
const activeSegmentation = segmentation.getActiveSegmentation(viewportId);

```

### Working with Multiple Viewports

Different viewports can have different active segmentations:

```js
// Set different active segmentations for different viewports
segmentation.setActiveSegmentation('viewport1', 'segmentation1');
segmentation.setActiveSegmentation('viewport2', 'segmentation2');

// Check active segmentations
const activeInViewport1 = segmentation.getActiveSegmentation('viewport1');
const activeInViewport2 = segmentation.getActiveSegmentation('viewport2');
```

Remember that tools will respect these viewport-specific active segmentations when performing operations.
