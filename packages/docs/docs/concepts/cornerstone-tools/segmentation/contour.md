---
id: segmentation-contour
title: Contour Representation
summary: Segmentation representation composed of hierarchical contour sets, where each set contains multiple contours representing distinct anatomical structures
---

# Contour Segmentation Representation

A Contour Segmentation Representation is a collection of Contour Sets. Each Contour Set is a collection of Contours. Each Contour is a collection of Points. Each Point is a collection of 3D coordinates.

![](../../../assets/contourSet.png)

## Contour Set

Since usually a segmentation is a collection of multiple structures, each Contour Set represents a single structure. For example, a segmentation can have multiple Contour Sets, each representing a different structure. Each Contour Set has a unique ID, and a name. The name is used to display the structure name in the UI.

## Contour

A Contour includes the information about the points that make up the contour. Each Contour has data, type (closed or open), and a color.

## Loading Contour as Segmentation Representation

```js
// load each contour set and cache the geometry
const promises = contourSets.map((contourSet) => {
  return geometryLoader.createAndCacheGeometry(contourSet.id, {
    type: GeometryType.CONTOUR,
    geometryData: contourSet as Types.PublicContourSetData,
  });
});

await Promise.all(promises);

// Add the segmentations to state
segmentation.addSegmentations([
  {
    segmentationId,
    representation: {
      // The type of segmentation
      type: csToolsEnums.SegmentationRepresentations.Contour,
      // The actual segmentation data, in the case of contour geometry
      // this is a reference to the geometry data
      data: {
        geometryIds: contourSets.map((contourSet) => contourSet.id),
      },
    },
  },
]);

// Add contour representation to a specific viewport
await segmentation.addContourRepresentationToViewport(viewportId, [
  {
    segmentationId,
    type: Enums.SegmentationRepresentations.Contour,
  },
]);

```

## Contours on a viewport of another plane

A contour set usually lies in one plane orientation, as the axial contours of
an RTSTRUCT. A planar viewport of that orientation draws the contours as they
are. A planar viewport of another plane (the sagittal or coronal pane of an
MPR, an oblique plane, a stack whose images lie in another plane) draws the cut
of each structure by the slice on display: the contours of the structure are
made into a surface once, the surface is cut by every slice of the viewport in
a web worker, and a scroll shows the cut of the next slice. Each structure is
cut and shown as soon as its surface is made, the structures on the slice on
display and the small ones first, so the viewport fills in structure by
structure. The viewport cuts again when its plane changes and when the
contours change.

This needs the polySeg add-on, which converts in two web workers by default
(one less than the logical processors of the machine when that is fewer);
`init` of the add-on sets another number before its first conversion:

```js
import * as polySeg from '@cornerstonejs/polymorphic-segmentation';

polySeg.init({ maxWorkerInstances: 1 });
cornerstoneTools.init({ addons: { polySeg } });
```

A structure whose contours lie on planes that are not parallel, or whose
conversion to a surface fails, is not cut, and a warning names the
segmentation, the structure and the reason.
