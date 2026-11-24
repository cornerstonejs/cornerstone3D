---
id: viewportReferencePresentation
title: Viewport Image Selection Reference and Presentation
summary: System for specifying which image a viewport displays and how it is presented, enabling transfer of views between viewports and navigation to specific images
---

# Viewport Image Selection Reference and Presentation

The reference and presentation information for a viewport specify what image a viewport
is displaying, and the presentation of the image. These are specified in several ways
so that a view can be transfered from one viewport to another, or can be remembered in order
to restore a view later. Getting a reference can be done either for the current image,
or a specific image in the stack, ordered/numbered in the same way that the scrolling positions
are numbered/ordered.

Some specific use cases for this are:

- Referencing a specific image for a tool
  - Uses `ViewReference` to specify an image to apply to
  - Uses `isReferenceViewable` to determine if the tool should be displayed or not
  - Uses `isReferenceViewable` to determine which of a set of viewports is best suited to navigating to an image
  - Uses `setViewReference(viewRef)` to navigate to the specified image
- Restoring an earlier view or showing a stack as a volume or vice-versa
  - Uses `ViewReference` and `ViewPresentation` to store the image information,
    and `getDisplaySetPresentation` to store the VOI, which the view
    presentation does not hold
- Applying interpolation to image sets
  - Uses `getViewReference` with a specific image position to get references to
    images in between or related to nearby annotations to interpolate
- Resizing and sync display presentation
  - Viewports read presentation with
    `viewportProjection.getPresentation(viewport)` and apply the returned
    native view state from `viewportProjection.withPresentation(...)` with
    `viewport.setViewState(...)`

## View Reference

A view reference specifies what image a view contains, typically identified as the referenced
image id, as well as the frame of reference/focal point related information. Specifically, this
allows correct correlation between viewports containing the same images or same frame of reference
but in different orderings, stack image Ids or volumes.

A very important use case for the view reference is as a base for the metadata for annotations
where the annotation metadata specifies which image it applies to. The view reference in that
case is used both to determine if an image is applicable to a given view, as well as to
determine if a viewport could navigate to display the given annotation, either with or without
navigation and/or orientation changes. Then, to navigate to the given reference,
the `viewport.setViewReference` is called to apply the given navigation. This applies
to a planar viewport that shows a stack (stack mode) and to one that shows a volume
(volume mode).

The `ViewReference` contains a number of fields that determine the view, the
important ones being `referencedImageId` for stack views, and `volumeId` combined
with `cameraFocalPoint, viewPlaneNormal, FrameOfReferenceUID` for volumes.
Where possible, a planar viewport populates both sets of information, in stack
mode and in volume mode, in order to allow the view to apply to either image type.

### referencedImageId

The referenced image id allows specifying non-frame of reference based stack type images. This is
a single image typically, and can be used in stack mode to navigate to a specific image.
The value is provided in volume mode when getting a reference to an acquisition
orientation single image, so that those view references are compatible with stack mode.

#### `referencedImageId` and `sliceIndex`

Stack mode uses the sliceIndex and referencedImageId combined to try to quickly
guess the `imageIdIndex` value for a given referencedImageId. If the referencedImageId is
identical to the one at the given sliceIndex then it can directly use the sliceIndex, otherwise it
needs to find the `imageIdIndex`. `sliceIndex` is never required.

For video viewports, the referenced image id will be the video image id, while the slice
index can be either a single frame or it can be an array range

### Frame of reference, focal point and normal

The frame of reference and focal point/normal values can be used in volume mode to
specify other views than the acquisition plane views. The values are provided when available
in stack mode and can be consumed in volume mode.

### `volumeId`, `sliceIndex` and `viewPlaneNormal`

When a planar viewport in volume mode creates a view reference, it includes the volume
id, slice index and view plane normal. This allows for quick identification of
whether a viewport is showing a given reference, as well as navigating quickly to
the given view. This is primarily used in `isReferenceViewable` which can
be called many times on volume views in order to determine annotation tool
views.

Note that stack mode does not provide the `volumeId`, so this optimization
cannot be used for those references.

These values are not required for navigation, but for annotation display detection
they are required to detect the view applicability.

### References in stack mode

A planar viewport in stack mode creates references containing:

- referencedImageId and sliceIndex
- Frame of reference, focal point and normal when available

It can do this for both the currently displayed image, and images referenced by
slice index, where the slice index is the index into the imageIds.

_warning_ do not assume that the slice index for volumes in any way correlates to
slice indices for stacks, or that two stacks displaying the SAME image use corresponding
slice indices, or that the frame number has ANY correlation to slice index or vice-versa.

In stack mode `setViewReference` moves to the image that the reference names,
else to its slice index, else to the image nearest to its focal point (at most
one slice spacing away, in a plane parallel to the reference). A reference that
names an image that the stack does not hold moves nothing.

`isReferenceViewable` in stack mode will additionally use the slice
index for a quick check of whether the image is found at the given location,
but does not rely on the slice index for that, it is just faster that way.

### References in volume mode

A planar viewport in volume mode creates references with:

- referencedImageId appropriate for an acquisition view
- Frame of reference, focal point and normal
- volumeId and slice index for the view in focus.

It will first use any volume id, slice index and normal to determine whether
the reference applies or to navigate to it, and then apply the frame of
reference/focal/normal. A reference with another normal turns the view to that
normal.

Specific additional behaviour for detecting 1d and 2d points maybe added in the
future (to allow lines and points to appear on view other than original).

## View Presentation

The view presentation specifies the pan, zoom, rotation, flips and display
area of a viewport: the camera. `viewportProjection.getPresentation(viewport)`
reads it, and `viewportProjection.withPresentation(viewport, presentation)`
gives the view state that applies it.
The pan and zoom are specified as percentage values relative to the viewport size
and the original display area (which is included if specified). This allows
applying the same view presentation to a variety of viewport sizes that may
or may not display the same image instance.

The view presentation holds no VOI. The VOI (`voiRange`, the lower and upper
values of the window), the VOI LUT function (`voiLUTFunction`), `invert` and
the colormap belong to the presentation of a display set:
`viewport.getDisplaySetPresentation(displaySetId)` reads them and
`viewport.setDisplaySetPresentation(displaySetId, props)` applies them. To show
an image again as it was, keep both (see "Remember a view and show it again"
below).

Some typical uses cases for view presentation are:

- Remembering how an image is presented to allow displaying the same presentation later,
  e.g., when a viewport is used to display another stack and then is returned to
  the original stack.
- Syncing similar but not identical viewports, for example, syncing some or all presentation
  attributes between different CT views.
- Resizing of viewports, used to remember the relative positions so that the
  image remains in the same "relative" position.

## `setViewReference` and View Presentation

The `viewport.setViewReference` API navigates to the specified reference. A
viewport has no member that applies a presentation directly (the
`setViewPresentation` of the 5.x legacy viewports is gone in 6.0); use
`viewportProjection.withPresentation(...)` to translate a presentation patch to
the viewport family's native `ViewState`, then call `viewport.setViewState(...)`.
The VOI is not part of it: apply it with `viewport.setDisplaySetPresentation(...)`.
If both reference and presentation are being applied, then the view reference
must be applied first. A render is required afterwards to complete the view
change since multiple parts of the view may be affected.

Some example code is shown below for various uses. This assumes that
`viewports` is an array of viewports of various types, and that `viewport` is
a specific one to apply a change to. The reference and presentation are
in `viewRef` and `viewPres` respectively.

### Navigate to a given annotation

```javascript
const { metadata } = annotation;
if (viewport.isReferenceViewable(metadata, { withNavigation: true })) {
  viewport.setViewReference(metadata);
} else {
  // throw error indicating view isn't compatible or other behaviour
  // such as changing to a volume or display a different set of images ids etc
}
```

### Finding the best viewport for displaying an annotation

A stack shows its images in their acquisition plane only, so in stack mode
`isReferenceViewable` is false for a reference in another plane, unless the
option `asVolume` asks whether the stack could show it as a volume: then a
reference that names no image is viewable when it is in the frame of
reference of the stack, as on the legacy stack viewport. A reference in
another plane comes from a volume: it names that volume (`volumeId`) and the display set it was made on
(`displaySetId`), and no image, so only a viewport that shows that display set
takes it. To show
such a reference on a stack, choose a stack that shows the images of the
volume, and mount the display set of the reference there. The function then
resolves with the viewport, and `viewport.setViewReference(metadata)` turns it
to the plane of the reference.

```ts
import { cache, PlanarViewport } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { Types as ToolsTypes } from '@cornerstonejs/tools';

async function findViewportForAnnotation(
  annotation: ToolsTypes.Annotation,
  viewports: Types.IViewport[]
): Promise<Types.IViewport | undefined> {
  const { metadata } = annotation;

  // If there is a viewport already displaying this, then just return it.
  const alreadyDisplayingViewport = viewports.find((viewport) =>
    viewport.isReferenceViewable(metadata)
  );
  if (alreadyDisplayingViewport) return alreadyDisplayingViewport;

  // If there is a viewport that just needs navigation, then return it
  const navigateViewport = viewports.find((viewport) =>
    viewport.isReferenceViewable(metadata, { withNavigation: true })
  );
  if (navigateViewport) return navigateViewport;

  // If there is a viewport showing the volume that could show it after a
  // change of orientation and a move to its slice, use it.
  const orientationViewport = viewports.find((viewport) =>
    viewport.isReferenceViewable(metadata, {
      withOrientation: true,
      withNavigation: true,
    })
  );
  if (orientationViewport) return orientationViewport;

  // If there is a viewport showing a stack of the images of the volume of
  // the reference, show the display set of the reference there as a volume.
  const volumeImageIds = metadata.volumeId
    ? cache.getVolume(metadata.volumeId)?.imageIds
    : undefined;

  if (metadata.displaySetId && volumeImageIds) {
    const stackViewport = viewports.find(
      (viewport): viewport is PlanarViewport =>
        viewport instanceof PlanarViewport &&
        viewport.getCurrentMode() === 'stack' &&
        viewport
          .getImageIds()
          .some((imageId) => volumeImageIds.includes(imageId))
    );

    if (stackViewport) {
      await stackViewport.setDisplaySets({
        displaySetId: metadata.displaySetId,
      });
      return stackViewport;
    }
  }

  // Might also look for viewport showing same frame of reference, but different volume

  // Find the set of image ids or volumeId from the metadata and apply that
  // to the viewport at position 0 and display it.
  return undefined;
}
```

### Remember a view and show it again

The view reference keeps the image, the view presentation keeps the camera,
and the presentation of the display set keeps the VOI.

```ts
import { viewportProjection } from '@cornerstonejs/core';
import type { PlanarViewport } from '@cornerstonejs/core';

function rememberView(viewport: PlanarViewport, displaySetId: string) {
  const viewRef = viewport.getViewReference();
  const viewPres = viewportProjection.getPresentation(viewport);
  const displaySetPresentation =
    viewport.getDisplaySetPresentation(displaySetId);

  return function showAgain() {
    viewport.setViewReference(viewRef);

    const nextViewState = viewportProjection.withPresentation(
      viewport,
      viewPres
    );

    if (nextViewState) {
      viewport.setViewState(nextViewState);
    }

    viewport.setDisplaySetPresentation(displaySetId, {
      voiRange: displaySetPresentation?.voiRange,
      voiLUTFunction: displaySetPresentation?.voiLUTFunction,
      invert: displaySetPresentation?.invert,
    });
    viewport.render();
  };
}
```

### Resize the viewport(s)

```javascript
const resizeObserver = new ResizeObserver(() => {
  if (resizeTimeout) {
    return;
  }
  resizeTimeout = setTimeout(resize, 100);
});

function resize() {
  resizeTimeout = null;
  const renderingEngine = getRenderingEngine(renderingEngineId);

  if (renderingEngine) {
    // Store the presentation from before for after.
    const presentations = viewports.map((viewport) =>
      viewportProjection.getPresentation(viewport)
    );

    // Apply the resize
    renderingEngine.resize(true, false);

    // Restore the presentations as this will reset the relative positions
    // rather than resetting to null.
    viewports.forEach((viewport, index) => {
      const nextViewState = viewportProjection.withPresentation(
        viewport,
        presentations[index]
      );

      if (nextViewState) {
        viewport.setViewState(nextViewState);
      }
    });
  }
}

resizeObserver.observe(viewportGrid);
```

The presentation reads and writes stay on the projection service, which works
for every viewport family.
