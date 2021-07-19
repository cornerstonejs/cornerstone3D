---
id: state-management
title: State Management
---


## State Management

We will shift from using an image ID-based default tool state manager to a FrameOfReference tool state manager, where measurements use world coordinates for points. Under the hood, the tool state manager will have a very familiar structure to current cornerstoneTools toolState managers:

```js
const toolState = {
 myFrameOfReferenceUID: {
   myToolID: [
     {
       sliceNormal: [0, 0, 1], // The normal on which the tool was drawn
       toolUID: 'someUniqueIdentifier.1.231.4.12.5', // A unique identifier for this tool state.
       FrameOfReferenceUID: 'myFrameOfReference.1.2.3',
       toolName: 'myToolID',
       // properties specific to that toolData.
     },
     // ... Other toolData entries for myToolID
   ],
   // Other toolData present on the frameOfReference
 },
 //... other FramesOfReference
};
```


Where an individual toolState entry will look something like this:

```js
// Example length toolData entry:

const toolData = {
 sliceNormal: [0, 0, 1], // Drawn on an axial plane.
 uid: 'someUniqueIdentifier.1.231.4.12.5', // A unique identifier for this tool state.
 FrameOfReferenceUID: 'myFrameOfReference.1.2.3', // The FrameOfReferenceUID
 toolName: 'length', // The tool name
 handles: {
   points: [
     // Two points in world space that define the line.
     [23.54, 12.42, -27.6],
     [13.54, 14.42, -27.6],
   ],
 },
};
```

Tool data may have properties specific to their own tools, but must contain sliceNormal, UID and tool. Developers will be able to interact with the toolState manager with the following API:


```js
// Adds toolData
toolStateManager.addToolState(toolData);

// Remove the toolstate given the toolData reference.
toolStateManager.removeToolState(toolData);

// Returns the full toolState for a given Frame of Reference.
// Optional: If a toolName is given only returns the toolState for that tool.
// Optional: If a toolDataUID is given, only that specific toolData is returned.
toolStateManager.getToolStateByFrameOfReference(FrameOfReferenceUID,
 toolName,
 toolDataUID
);

// A helper which returns the single toolData entry matching the UID.
// Less efficient than getToolStateByFrameOfReference with all arguments, but allows
// you to find the annotation if you don't have all the information.
toolStateManager.getToolStateByToolDataUID(toolDataUID);

// Deletes the tool data found by the given UID.
// Less efficient than removeToolState, but can be called if you have only the UID.
toolStateManager.removeToolStateByToolDataUID(toolDataUID);
```
