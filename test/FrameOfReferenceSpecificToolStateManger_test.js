import * as cornerstoneTools3D from '../src/cornerstone-tools-3d/index'

const toolStateManager =
  cornerstoneTools3D.defaultFrameOfReferenceSpecificToolStateManager

const FrameOfReferenceUID = 'MY_FRAME_OF_REFERENCE_UID'

const TOOLNAME_0 = 'toolName_0'
const TOOLNAME_1 = 'toolName_1'

const toolUID0 = 'toolData_000'
const toolUID1 = 'toolData_001'

function addAndReturnToolName0ToolData() {
  const toolData = {
    metadata: {
      viewPlaneNormal: [0, 0, 1],
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
  }

  toolStateManager.addToolState(toolData)

  return toolData
}

function addAndReturnToolName1ToolData() {
  const toolData = {
    metadata: {
      viewPlaneNormal: [0, 0, 1],
      toolUID: toolUID1,
      FrameOfReferenceUID,
      toolName: TOOLNAME_1,
    },
    data: {
      handles: {
        points: [
          [1, 1, 0],
          [1, 2, 0],
        ],
      },
    },
  }

  toolStateManager.addToolState(toolData)

  return toolData
}

describe('FrameOfReferenceSpecificToolStateManager:', () => {
  beforeEach(() => {
    // Reset the toolStateManager
    toolStateManager.restoreToolState({})
  })

  it('should correctly add toolState and delete it', () => {
    const toolData = addAndReturnToolName0ToolData()

    toolStateManager.removeToolState(toolData)

    const undefinedToolData = toolStateManager.getToolStateByToolUID(toolUID0)

    expect(undefinedToolData).toBeUndefined()
  })
  it('should correctly add toolState and get it by its UID using different levels of efficient filtering', () => {
    const toolData = addAndReturnToolName0ToolData()
    const { metadata } = toolData
    const { toolUID, FrameOfReferenceUID, toolName } = metadata

    const toolDataFoundByToolUID = toolStateManager.getToolStateByToolUID(
      toolUID
    )

    const toolDataFoundByToolUIDAndFoR = toolStateManager.getToolStateByToolUID(
      toolUID,
      { FrameOfReferenceUID }
    )

    const toolDataFoundByToolAllFilters = toolStateManager.getToolStateByToolUID(
      toolUID,
      { FrameOfReferenceUID, toolName }
    )

    expect(toolData).toEqual(toolDataFoundByToolUID)
    expect(toolData).toEqual(toolDataFoundByToolUIDAndFoR)
    expect(toolData).toEqual(toolDataFoundByToolAllFilters)
  })
  it('should get various parts of the toolState hierarchy', () => {
    const toolData = addAndReturnToolName0ToolData()
    const { metadata } = toolData
    const { toolUID, FrameOfReferenceUID, toolName } = metadata

    const toolSpecificToolStateForFrameOfReference = toolStateManager.saveToolState(
      FrameOfReferenceUID,
      toolName
    )

    const frameOfReferenceSpecificToolState = toolStateManager.saveToolState(
      FrameOfReferenceUID
    )

    const entireToolState = toolStateManager.saveToolState()

    expect(
      toolSpecificToolStateForFrameOfReference[0].metadata.toolUID
    ).toEqual(toolUID)
    expect(frameOfReferenceSpecificToolState[toolName]).toBeDefined()
    expect(entireToolState[FrameOfReferenceUID]).toBeDefined()
  })
  it('should restore various parts of the toolState to the toolStateManager', () => {
    const toolData_0 = addAndReturnToolName0ToolData()
    const toolData_1 = addAndReturnToolName1ToolData()
    const metadata_0 = toolData_0.metadata
    const metadata_1 = toolData_1.metadata
    //const { toolUID, FrameOfReferenceUID, toolName } = metadata;

    // Make copy of toolState
    const toolState = toolStateManager.saveToolState()

    // Reset toolState.
    toolStateManager.restoreToolState({})

    const toolName1ToolSpecificToolState =
      toolState[FrameOfReferenceUID][metadata_1.toolName]

    const frameOfReferenceSpecificToolState = toolState[FrameOfReferenceUID]

    // Restore tool only specific toolstate for toolstate 1 only.
    toolStateManager.restoreToolState(
      toolName1ToolSpecificToolState,
      FrameOfReferenceUID,
      metadata_1.toolName
    )

    const toolStateWithOnlyTool1 = toolStateManager.saveToolState()

    expect(
      toolStateWithOnlyTool1[FrameOfReferenceUID][metadata_1.toolName]
    ).toBeDefined()
    expect(
      toolStateWithOnlyTool1[FrameOfReferenceUID][metadata_0.toolName]
    ).toBeUndefined()

    // Reset toolState.
    toolStateManager.restoreToolState({})

    // Restore toolState for FrameOfReference
    toolStateManager.restoreToolState(
      frameOfReferenceSpecificToolState,
      FrameOfReferenceUID
    )

    const frameOfReferenceToolState = toolStateManager.saveToolState()

    expect(frameOfReferenceToolState[FrameOfReferenceUID]).toBeDefined()
    expect(
      frameOfReferenceToolState[FrameOfReferenceUID][metadata_1.toolName]
    ).toBeDefined()
    expect(
      frameOfReferenceToolState[FrameOfReferenceUID][metadata_0.toolName]
    ).toBeDefined()

    toolStateManager.restoreToolState({})

    // Restore entire toolState
    toolStateManager.restoreToolState(toolState)

    const newlySavedToolState = toolStateManager.saveToolState()

    expect(newlySavedToolState[FrameOfReferenceUID]).toBeDefined()
    expect(
      newlySavedToolState[FrameOfReferenceUID][metadata_1.toolName]
    ).toBeDefined()
    expect(
      newlySavedToolState[FrameOfReferenceUID][metadata_0.toolName]
    ).toBeDefined()
  })
  it('Should remove toolState by UID using different levels of efficient filtering', () => {
    const toolData = addAndReturnToolName0ToolData()
    const { metadata } = toolData
    const { toolUID, FrameOfReferenceUID, toolName } = metadata

    let undefinedToolData

    const toolStateSnapshot = toolStateManager.saveToolState()

    // Remove toolData by UID, and check it was removed.
    toolStateManager.removeToolStateByToolUID(toolUID)
    undefinedToolData = toolStateManager.getToolStateByToolUID(toolUID)
    expect(undefinedToolData).toBeUndefined()

    // Restore toolState
    toolStateManager.restoreToolState(toolStateSnapshot)

    // Remove toolData by UID and FrameOfReferenceUID, and check it was removed.
    toolStateManager.removeToolStateByToolUID(toolUID, { FrameOfReferenceUID })
    undefinedToolData = toolStateManager.getToolStateByToolUID(toolUID)
    expect(undefinedToolData).toBeUndefined()

    // Restore toolState
    toolStateManager.restoreToolState(toolStateSnapshot)

    // Remove toolData by UID, FrameOfReferenceUID and toolName, and check it was removed.
    toolStateManager.removeToolStateByToolUID(toolUID, {
      FrameOfReferenceUID,
      toolName,
    })
    undefinedToolData = toolStateManager.getToolStateByToolUID(toolUID)
    expect(undefinedToolData).toBeUndefined()
  })
})
