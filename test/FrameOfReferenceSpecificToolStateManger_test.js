import cornerstoneTools3D from '../src/cornerstone-tools-3d';

const toolStateManager =
  cornerstoneTools3D.defaultFrameOfReferenceSpecificToolStateManager;

const FrameOfReferenceUID = 'MY_FRAME_OF_REFERENCE_UID';

const TOOLNAME_0 = 'toolName_0';
const TOOLNAME_1 = 'toolName_1';

const toolUID0 = 'toolData_000';

function addAndReturnToolName0ToolData() {
  const toolData = {
    metadata: {
      sliceNormal: [0, 0, 1],
      toolUID: toolUID0,
      FrameOfReferenceUID,
      toolName: TOOLNAME_0,
    },
    data: {
      handles: {
        points: [
          [0, 0, 0],
          [0, 0, 1],
        ],
      },
    },
  };

  toolStateManager.addToolState(toolData);

  return toolData;
}

describe('FrameOfReferenceSpecificToolStateManager:', () => {
  beforeEach(() => {
    // Reset the toolStateManager
    toolStateManager.saveToolState({});
  });

  it('should correctly add toolState and delete it', () => {
    const toolData = addAndReturnToolName0ToolData();

    toolStateManager.removeToolState(toolData);

    const undefinedToolData = toolStateManager.getToolStateByToolUID(toolUID0);

    expect(undefinedToolData).toBeUndefined();
  });
  it('should correctly add toolState and get it by its UID using different levels of efficient filtering', () => {
    const toolData = addAndReturnToolName0ToolData();

    const { toolUID, FrameOfReferenceUID, toolName } = toolData;

    const toolDataFoundByToolUID = toolStateManager.getToolStateByToolUID(
      toolUID
    );

    const toolDataFoundByToolUIDAndFoR = toolStateManager.getToolStateByToolUID(
      toolUID,
      { FrameOfReferenceUID }
    );

    const toolDataFoundByToolAllFilters = toolStateManager.getToolStateByToolUID(
      toolUID,
      { FrameOfReferenceUID, toolName }
    );

    expect(toolData).toEqual(toolDataFoundByToolUID);
    expect(toolData).toEqual(toolDataFoundByToolUIDAndFoR);
    expect(toolData).toEqual(toolDataFoundByToolAllFilters);
  });
  it('should get various parts of the toolState hierarchy', () => {});
  it('should restore various parts of the toolState to the toolStateManager', () => {});
  it('Should remove toolState by UID using different levels of efficient filtering', () => {});
});
