const ToolManager = {
  // TODO
};

export default ToolManager;

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

// exampleToolData entry:
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

/*

// Returns the full toolState for a specific viewport, by fetching that viewport and finding its frameOfReference.
// Optional: If a toolName is given only returns the toolState for that tool.
toolStateManager.getToolStateByViewportUID(viewportUID, toolName);

// Returns the full toolState for a given Frame Of Reference.
// If a toolName is given only returns the toolState for that tool.
toolStateManager.getToolStateByFrameOfReference(FrameOfReferenceUID, [
  toolName,
]);
// Returns the single toolData entry matching the UID.
// Optional: More efficient searches if any of the data in the second optional object are given.
toolStateManager.getToolStateByToolUID(toolUID, {
  toolName,
  FrameOfReferenceUID,
  viewportUID,
});

// Adds toolData
toolStateManager.addToolState(toolData);

// Remove the toolstate given the toolData reference.
tooleStateManager.removeToolState(toolData);

// Deletes the tool data found by the given UID.
// Optional: More efficient searches if any of the data in the second optional object are given
tooleStateManager.removeToolStateByToolUID(toolUID, {
  toolName,
  FrameOfReferenceUID,
  viewportUID,
});

*/
