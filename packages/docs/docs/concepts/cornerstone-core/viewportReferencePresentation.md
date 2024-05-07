---
id: viewportReferencePresentation
title: Viewport Image Selection Reference and Presentation
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
  - Uses `isReferenceCompatible` to determine if the tool should be displayed or not
  - Uses `isReferenceCompatible` to determine which of a set of viewports is best suited to navigating to an image
  - Uses `setView(viewRef)` to navigate to the specified image
- Restoring an earlier view or converting from stack to volume or vice-versa
  - Uses `ViewReference` and `ViewPresentation` to store the image information
- Applying interpolation to image sets
  - Uses `getViewReference` with a specific image position to get references to
    images in between or related to nearby annotations to interpolate
- Resizing and sync display presentation
  - Uses `getViewPresentation` to get old presentation information and then
    restores with `setView(null,viewPres)`

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
the `viewport.setView` is called to apply the given navigation. This can apply to
both orthographic and stack viewports.

The `ViewReference` contains a number of fields that determine the view, the
important ones being `referencedImageId` for stack views, and `volumeId` combined
with `cameraFocalPoint, viewPlaneNormal, FrameOfReferenceUID` for volumes.
Where possible, both the stack and volume viewports populate both sets of information
in order to allow the view to apply to either image type.

### referencedImageId

The referenced image id allows specifying non-frame of reference based stack type images. This is
a single image typically, and can be used by both stack viewports to navigate to a specific image.
The value is provided by orthographic viewports when displaying a single stack image.

#### sliceIndex

The stack viewport uses the sliceIndex and referencedImageId combined to try to quickly
guess the `imageIdIndex` value for a given referencedImageId. If the referencedImageId is
identical to the one at the given sliceIndex then it can directly use the sliceIndex, otherwise it
needs to find the `imageIdIndex`

### Frame of reference, focal point and normal

The frame of reference and focal point/normal values can be used by orthographic viewports to
specify other views than the acquisition plane views. The values are provided when available from
the stack viewports and can be consumed by the volume viewport.

### `volumeId`, `sliceIndex` and `viewPlaneNormal`

When a orthographic viewport creates a view reference, it includes the volume
id, slice index and view plane normal. This allows for quick identification of
whether a viewport is showing a given reference, as well as navigating quickly to
the given view. This is primarily used in `isReferenceCompatible` which can
be called many times on orthographic views. Note that a stack viewport will not
provide the `volumeId`, so this optimization cannot be used for those references.

### Mappings

The stack viewport provides:

- referencedImageId and sliceIndex
- Frame of reference, focal point and normal when available

The orthographic viewport provides:

- referencedImageId with a possibly incorrect slice index when displaying acquisition views
- Frame of reference, focal point and normal
- volumeId and sliceIndex

The stack viewport can consume only the referencedImageId, with either a correct or incorrect slice index. When used with an incorrect slice index, the referenced image is still found, but takes longer.

The orthographic viewport can consume the volume id, slice index and normal, OR the frame of reference/focal/normal.

## View Presentation

The view presentation specifies the relative size and position of the image within
the viewport, as well as any LUT transforms to be applied beyond the default transform.
This starts with a display area specifying the basic positioning,
and then uses a percentage zoom and pan to add relative changes to the display area.
The typical use case for a view presentation is to allow remembering how an
image is presented to the user instead of the reference to what image is presented.

Some typical uses cases for view presentation are:

- Remembering how an image is presented to allow displaying the same presentation later,
  e.g., when a viewport is used to display another stack and then is returned to
  the original stack.
- Syncing similar but not identical viewports, for example, syncing some or all presentation
  attributes between different CT views.
- Resizing of viewports, used to remember the relative positions so that the
  image remains in the same "relative" position.

## `setView`

The `viewport.setView` command takes both a reference and a preseentation. This
combination allows setting both what and how something is viewed at once, or
setting them individually by passing null/undefined for the other parameter.
This may reduce the number of events being fired and performs the calculations
in the correct ordering (eg the presentation needs to occur after the reference).

Some example code is shown below for various uses. This assumes that
`viewports` is an array of viewports of various types, and that `viewport` is
a specific one to apply a change to. The reference and presentation are
in `viewRef` and `viewPres` respectively.

### Navigate to a given annotation

```javascript
const { metadata } = annotation;
if (viewport.isReferenceCompatible({ withNavigation: true })) {
  viewport.setView(metadata);
} else {
  // throw error indicating view isn't compatible or other behaviour
  // such as changing to a volume or display a different set of images ids etc
}
```

### Finding the best viewport for displaying an annotation

```javascript
function findViewportForAnnotation(annotation, viewports) {
  const { metadata } = annotation;

  // If there is a viewport already displaying this, then just return it.
  const alreadyDisplayingViewport = viewports.find((viewport) =>
    viewport.isReferenceCompatible(metadata)
  );
  if (alreadyDisplayingViewport) return alreadyDisplayingViewport;

  // If there is a viewport that just needs navigation, then return it
  const navigateViewport = viewports.find((viewport) =>
    viewport.isReferenceCompatible(metadata, { withNavigation: true })
  );
  if (navigateViewport) return navigateViewport;

  // If there is a viewport showing the volume that could have orientation changed, use it
  const orientationViewport = viewports.find((viewport) =>
    viewport.isReferenceCompatible(metadata, { withOrientation: true })
  );
  if (orientationViewport) return orientationViewport;

  // If there is a stack viewport that could be converted to volume to show this, then do so
  const stackToVolumeViewport = viewports.find((viewport) =>
    viewport.isReferenceCompatible(metadata, {
      withOrientation: true,
      asVolume: true,
    })
  );
  if (stackToVolumeViewport) {
    // convert stack to volume viewport here
    return stackToVolumeViewport;
  }

  // Might also look for viewport showing same frame of reference, but different volume

  // Find the set of image ids or volumeId from the metadata and apply that
  // to the viewport at position 0 and display it.
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
    // Store the presentation from before for after
    const presentations = viewports.map((viewport) =>
      viewport.getViewPresentation()
    );

    // Apply the resize
    renderingEngine.resize(true, false);

    // Restore the presentations as this will reset the relative positions
    // rather than resetting to null.
    viewports.forEach((viewport, idx) => {
      viewport.setView(null, presentations[idx]);
    });
  }
}

resizeObserver.observe(viewportGrid);
```
