---
id: config
title: Config
---


# Configuration

In version 2.x, segmentation configurations are managed through a unified style system that can be applied at different levels of specificity using a specifier object.

## Style System

Styles can be applied at multiple levels:
- Global styles for all segmentations
- Type-specific styles (e.g., all Labelmaps)
- Viewport-specific styles
- Segmentation-specific styles
- Segment-specific styles

The style configuration object structure depends on the representation type:

```js
// Labelmap Style Example
{
  renderFill: true,
  renderOutline: true,
  outlineWidth: 3,
  fillAlpha: 0.7,
  outlineAlpha: 0.9
}

// Contour Style Example
{
  renderFill: true,
  renderOutline: true,
  outlineWidth: 2
}

// Surface Style Example
{
  renderFill: true,
  fillAlpha: 0.7
}
```

## Style API

The new style API uses a specifier object to target specific configurations:

```js
import { segmentation } from '@cornerstonejs/tools';

// Get style for a specific context
const style = segmentation.getStyle({
  viewportId: 'viewport1',            // optional
  segmentationId: 'segmentation1',    // optional
  type: Enums.SegmentationRepresentations.Labelmap,  // required
  segmentIndex: 1                     // optional
});

// Set style for a specific context
segmentation.setStyle(
  {
    viewportId: 'viewport1',
    segmentationId: 'segmentation1',
    type: Enums.SegmentationRepresentations.Labelmap
  },
  {
    renderFill: true,
    renderOutline: true,
    outlineWidth: 3
  }
);

// Reset to global style
segmentation.resetToGlobalStyle();

// Check if a context has custom style
const hasCustomStyle = segmentation.hasCustomStyle({
  viewportId: 'viewport1',
  segmentationId: 'segmentation1',
  type: Enums.SegmentationRepresentations.Labelmap
});
```

### Inactive Segmentations

The rendering of inactive segmentations is now controlled per viewport:

```js
// Set whether to render inactive segmentations in a viewport
segmentation.setRenderInactiveSegmentations('viewport1', true);

// Get whether inactive segmentations are rendered in a viewport
const renderInactive = segmentation.getRenderInactiveSegmentations('viewport1');
```

## Color Management

The color API has been updated to be viewport-specific and use more consistent naming:

```js
import { segmentation } from '@cornerstonejs/tools';

// Add a new color LUT
const colorLUTIndex = segmentation.addColorLUT(colorLUT);

// Set color LUT for a segmentation in a viewport
segmentation.setColorLUT('viewport1', 'segmentation1', colorLUTIndex);

// Get color for a specific segment
const color = segmentation.getSegmentIndexColor(
  'viewport1',
  'segmentation1',
  segmentIndex
);

// Set color for a specific segment
segmentation.setSegmentIndexColor(
  'viewport1',
  'segmentation1',
  segmentIndex,
  [255, 0, 0, 255]  // RGBA color
);
```

### Style Hierarchy

Styles are applied in the following order of precedence (highest to lowest):
1. Segment-specific style (when segmentIndex is provided)
2. Viewport-specific style (when viewportId is provided)
3. Segmentation-specific style (when segmentationId is provided)
4. Type-specific style (when only type is provided)
5. Global style

Example:
```js
// Set global style for all labelmaps
segmentation.setStyle(
  { type: Enums.SegmentationRepresentations.Labelmap },
  { renderOutline: true }
);

// Override style for a specific viewport
segmentation.setStyle(
  {
    viewportId: 'viewport1',
    type: Enums.SegmentationRepresentations.Labelmap
  },
  { renderOutline: false }
);

// Set style for a specific segment
segmentation.setStyle(
  {
    viewportId: 'viewport1',
    segmentationId: 'segmentation1',
    type: Enums.SegmentationRepresentations.Labelmap,
    segmentIndex: 1
  },
  { outlineWidth: 5 }
);
```

:::note Tip
For detailed information about available style options for each representation type, refer to the API documentation.
:::
