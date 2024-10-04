---
id: segmentation-display
title: Segmentation Display
---

# Segmentation Display Tool

The `SegmentationDisplayTool` is a `Tool` inside `Cornerstone3DTools`.
Similar to other tools it should be added first via `addTools` and then
to a ToolGroup that is going to use it for displaying the segmentations.

## Usage

Below we show you how to use the `SegmentationDisplayTool` to display
a labelmap segmentation representation for a toolGroup.

```js
import {
  addTool,
  segmentation,
  SegmentationDisplayTool,
  ToolGroupManager,
} from '@cornerstonejs/tools';

const segmentationId = 'segmentationId';
const toolGroupId = 'segmentation-display-tool-group';
const viewportId = 'segmentation-display-viewport';

// Adding it to internal state of cs3DTools
addTool(SegmentationDisplayTool);

const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

// adding viewports to the toolGroup
toolGroup.addViewport(viewportId);

// adding tool to the toolGroup
toolGroup.addTool(SegmentationDisplayTool.toolName);

// setting tool to enabled in order to be show the segmentations
toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);

// adding the segmentation to cornerstone3DTools segmentation state
segmentation.addSegmentations([
  {
    segmentationId,
    representation: {
      type: Enums.SegmentationRepresentations.Labelmap,
      data: {
        volumeId: segmentationId,
      },
    },
  },
]);

// create a labelmap representation of the segmentation and add it to the toolGroup
await segmentation.addSegmentationRepresentations(
  toolGroupId,
  [
    {
      segmentationId,
      type: Enums.SegmentationRepresentations.Labelmap,
    },
  ],
  toolGroupSpecificRepresentationConfig
);
```
