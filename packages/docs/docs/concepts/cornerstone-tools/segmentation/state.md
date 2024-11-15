---
id: state
title: State
---

# State

`SegmentationState` stores all the information regarding the current state of `Segmentation`s and `SegmentationRepresentation`s in the library. In version 2.x, we've decoupled `Segmentation`s from their representations and made the system viewport-specific rather than toolGroup-specific. From a `Segmentation`, various representations can be created (currently supporting Labelmap, Contour, and Surface).

## ColorLUT

`SegmentationState` stores an array of `colorLUT`s used to render segmentation representations. `Cornerstone3DTools` initially adds 255 colors (`[[0,0,0,0], [221, 84, 84, 255], [77, 228, 121, 255], ...]`) as the first index of this array. By default, all segmentation representations use the first colorLUT. However, using the color API in the config, you can add more colors to the global colorLUT and/or change the colorLUT for specific segmentation representations in specific viewports.

## Segmentations

`SegmentationState` stores all segmentations in an array. Each Segmentation Object stores the required information for creating `SegmentationRepresentation`s.

Each segmentation object has the following properties:

```js
{
  segmentationId: 'segmentation1',
  label: 'segmentation1',
  segments: {
    0: {
      segmentIndex: 0,
      label: 'Segment 1',
      active: true,
      locked: false,
      cachedStats: {}
    },
    1: {
      segmentIndex: 1,
      label: 'Segment 2',
      active: false,
      locked: false,
      cachedStats: {}
    }
  },
  representationData: {
    Labelmap: {
      volumeId: 'segmentation1'
    },
    Contour: {
      geometryIds: ['contourSet1', 'contourSet2']
    },
    Surface: {
      geometryId: 'surface1'
    }
  }
}
```

- `segmentationId`: A required field provided by the consumer. This is the unique identifier for the segmentation.
- `label`: The label of the segmentation.
- `segments`: An object containing information about each segment, including its label, active state, locked state, and cached statistics.
- `representationData`: **THE MOST IMPORTANT PART**, this is where the data for creation of each type of `SegmentationRepresentation` is stored. For instance, in `Labelmap` representation, the required information is a cached `volumeId`.

### Adding Segmentations to the State

Since `Segmentation` and `SegmentationRepresentation` are separated, first we need to add the `segmentation` to the state using the top-level API:

```js
import { segmentation, Enums } from '@cornerstonejs/tools';

segmentation.addSegmentations([
  {
    segmentationId,
    representation: {
      type: Enums.SegmentationRepresentations.Labelmap,
      data: {
        imageIds: segmentationImageIds
      }
    }
  }
]);
```

:::note Important
Adding a `Segmentation` to the state WILL NOT render the segmentation. You need to add `SegmentationRepresentation`s to specific viewports where you want to render them.
:::

## Viewports

### Adding a SegmentationRepresentation to a Viewport

To render a segmentation, you need to add its representation to specific viewports. This can be done using the `addSegmentationRepresentation` method:

```js
import { segmentation, Enums } from '@cornerstonejs/tools';

await segmentation.addSegmentationRepresentations(viewportId, [
  {
    segmentationId,
    type: Enums.SegmentationRepresentations.Labelmap
  }
]);
```


### Representation-Specific Methods

Cornerstone3D v2 provides dedicated methods for adding different types of segmentation representations:

```js
// Add labelmap representations
await segmentation.addLabelmapRepresentationToViewport(viewportId, [
  {
    segmentationId,
    config: {}
  }
]);

// Add contour representations
await segmentation.addContourRepresentationToViewport(viewportId, [
  {
    segmentationId,
    config: {}
  }
]);

// Add surface representations
await segmentation.addSurfaceRepresentationToViewport(viewportId, [
  {
    segmentationId,
    config: {}
]);
```

### Multiple Viewport Operations

You can also add representations to multiple viewports simultaneously using the viewport map methods:

```js
const viewportInputMap = {
  viewport1: [
    {
      segmentationId: 'seg1',
      type: Enums.SegmentationRepresentations.Labelmap
    }
  ],
  viewport2: [
    {
      segmentationId: 'seg1',
      type: Enums.SegmentationRepresentations.Labelmap
    }
  ]
};

await segmentation.addLabelmapRepresentationToViewportMap(viewportInputMap);
```
