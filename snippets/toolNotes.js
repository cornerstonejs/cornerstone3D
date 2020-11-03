// Showing 2 RTs on same volume:
// Would be two scenes with sceneSpecificToolData.

// PET 3x3:
// You want all tools to show on all: store as frameOfReferenceSpecificToolData

// Internal synchronizer for tools -> rerender where needed based on

const rtStructGroup = {
  UID: 'rtStructToolGroup',
  tools: [
    {
      toolName: 'rtStruct',
      options: {},
    },
  ],
};
