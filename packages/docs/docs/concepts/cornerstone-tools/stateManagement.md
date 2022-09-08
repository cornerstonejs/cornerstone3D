---
id: state-management
title: State Management
---

# State Management

We will shift from using an image ID-based default annotations manager to a FrameOfReference annotations manager, where annotations use world coordinates for points. Under the hood, the annotations manager will have a very familiar structure to current cornerstoneTools annotations managers:

```js
const annotations = {
  myFrameOfReferenceUID: {
    myToolID: [
      {
        viewPlaneNormal: [0, 0, 1], // The normal on which the tool was drawn
        toolUID: 'someUniqueIdentifier.1.231.4.12.5', // A unique identifier for this annotations.
        FrameOfReferenceUID: 'myFrameOfReference.1.2.3',
        toolName: 'myToolID', // properties specific to that annotation.
      }, // ... Other annotation entries for myToolID
    ], // Other annotation present on the frameOfReference
  }, //... other FramesOfReference
};
```

Where an individual annotations entry will look something like this:

```js
// Example length annotation entry:

const annotation = {
  viewPlaneNormal: [0, 0, 1], // Drawn on an axial plane.
  uid: 'someUniqueIdentifier.1.231.4.12.5', // A unique identifier for this annotations.
  FrameOfReferenceUID: 'myFrameOfReference.1.2.3', // The FrameOfReferenceUID
  toolName: LengthTool.toolName, // The tool name
  handles: {
    points: [
      // Two points in world space that define the line.
      [23.54, 12.42, -27.6],
      [13.54, 14.42, -27.6],
    ],
  },
};
```

Annotation may have properties specific to their own tools, but must contain viewPlaneNormal, UID and tool. Developers will be able to interact with the annotations manager with the following API:

```js
// Adds annotation
annotationManager.addAnnotation(annotation);

// Remove the annotations given the annotation reference.
annotationManager.removeAnnotation(annotation.annotationUID);

// Returns the full annotations for a given Frame of Reference.
// Optional: If a toolName is given only returns the annotations for that tool.
// Optional: If a annotationUID is given, only that specific annotation is returned.
annotationManager.getAnnotationsByFrameOfReference(
  FrameOfReferenceUID,
  toolName,
  annotationUID
);

// A helper which returns the single annotation entry matching the UID.
// Less efficient than getAnnotationsByFrameOfReference with all arguments, but allows
// you to find the annotation if you don't have all the information.
annotationManager.getAnnotation(annotationUID);

// Deletes the annotation found by the given UID.
// Less efficient than removeAnnotation, but can be called if you have only the UID.
annotationManager.removeAnnotation(annotationUID);
```
