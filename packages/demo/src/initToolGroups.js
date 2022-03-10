import * as csTools3d from '@cornerstonejs/tools'

const { MouseBindings } = csTools3d.Enums

import {
  TOOL_GROUP_IDS,
  ptVolumeId,
  ctVolumeId,
  ctStackUID,
  ctVolumeTestUID,
  ptVolumeTestUID,
  VIEWPORT_IDS,
  prostateVolumeUID,
} from './constants'
const {
  PanTool,
  WindowLevelTool,
  StackScrollTool,
  StackScrollMouseWheelTool,
  ZoomTool,
  ToolGroupManager,
  ToolBindings,
  VolumeRotateMouseWheelTool,
  MIPJumpToClickTool,
  LengthTool,
  ProbeTool,
  RectangleRoiTool,
  EllipticalRoiTool,
  BidirectionalTool,
  CrosshairsTool,
  RectangleScissorsTool,
  CircleScissorsTool,
  BrushTool,
  SphereScissorsTool,
  RectangleRoiThresholdTool,
  RectangleRoiStartEndThresholdTool,
  SegmentationDisplayTool,
} = csTools3d

/* Configuration arrays and get/set functions for setting the crosshair interactions:
 * - viewportReferenceLineControllable
 * - viewportReferenceLineDraggableRotatable
 * - viewportReferenceLineSlabThicknessControlsOn
 * NOTE: rotate/translate are enabled/disabled together as one option
 * in future we may separate them, but only if rotation rotates only 1 reference
 * line at time, i.e. the interacting one. At the moment, rotating a reference
 * line, will also rotate all the other active/intersecting ones of the same
 * angle.
 *
 * TO DO: would be ideal to hoister these configurations to a annotations manager
 * that is a level higher than frame of reference (or a module, when/if we port
 * the concept from csTools2d)
 */

let viewportReferenceLineControllable = [
  VIEWPORT_IDS.CT.AXIAL,
  VIEWPORT_IDS.CT.SAGITTAL,
  VIEWPORT_IDS.CT.CORONAL,
  VIEWPORT_IDS.PT.AXIAL,
  VIEWPORT_IDS.PT.SAGITTAL,
  VIEWPORT_IDS.PT.CORONAL,
  VIEWPORT_IDS.PROSTATE.AXIAL,
  VIEWPORT_IDS.PROSTATE.SAGITTAL,
  VIEWPORT_IDS.PROSTATE.CORONAL,
  VIEWPORT_IDS.FUSION.AXIAL,
  VIEWPORT_IDS.FUSION.SAGITTAL,
  VIEWPORT_IDS.FUSION.CORONAL,
  VIEWPORT_IDS.PTMIP.CORONAL,
  VIEWPORT_IDS.CTVR.VR,
  VIEWPORT_IDS.CTOBLIQUE.OBLIQUE,
  VIEWPORT_IDS.PT_TYPES_SUV_BW.CORONAL,
  VIEWPORT_IDS.PT_TYPES_SUV_LBM.CORONAL,
  VIEWPORT_IDS.PT_TYPES_SUV_BSA.CORONAL,
]

function setReferenceLineControllable(viewportId, controllable) {
  const index = viewportReferenceLineControllable.indexOf(viewportId)
  if (controllable) {
    index === -1
      ? array.push(viewportId)
      : console.log('viewport is already controllable')
  } else {
    index > -1
      ? array.splice(index, 1)
      : console.log('viewport not found in controllable ones')
  }
}

window.settReferenceLineControllable = setReferenceLineControllable

function getReferenceLineControllable(viewportId) {
  const index = viewportReferenceLineControllable.indexOf(viewportId)
  return index !== -1 ? true : false
}

window.getReferenceLineControllable = getReferenceLineControllable

let viewportReferenceLineDraggableRotatable = [
  VIEWPORT_IDS.CT.AXIAL,
  VIEWPORT_IDS.CT.SAGITTAL,
  VIEWPORT_IDS.CT.CORONAL,
  VIEWPORT_IDS.PT.AXIAL,
  VIEWPORT_IDS.PT.SAGITTAL,
  VIEWPORT_IDS.PT.CORONAL,
  VIEWPORT_IDS.PROSTATE.AXIAL,
  VIEWPORT_IDS.PROSTATE.SAGITTAL,
  VIEWPORT_IDS.PROSTATE.CORONAL,
  VIEWPORT_IDS.FUSION.AXIAL,
  VIEWPORT_IDS.FUSION.SAGITTAL,
  VIEWPORT_IDS.FUSION.CORONAL,
  VIEWPORT_IDS.PTMIP.CORONAL,
  VIEWPORT_IDS.CTVR.VR,
  VIEWPORT_IDS.CTOBLIQUE.OBLIQUE,
  VIEWPORT_IDS.PT_TYPES_SUV_BW.CORONAL,
  VIEWPORT_IDS.PT_TYPES_SUV_LBM.CORONAL,
  VIEWPORT_IDS.PT_TYPES_SUV_BSA.CORONAL,
]

function setReferenceLineDraggableRotatable(viewportId, controllable) {
  const index = viewportReferenceLineDraggableRotatable.indexOf(viewportId)
  if (controllable) {
    index === -1
      ? array.push(viewportId)
      : console.log('viewport is already draggable')
  } else {
    index > -1
      ? array.splice(index, 1)
      : console.log('viewport not found in draggable ones')
  }
}

window.setReferenceLineDraggableRotatable = setReferenceLineDraggableRotatable

function getReferenceLineDraggableRotatable(viewportId) {
  const index = viewportReferenceLineDraggableRotatable.indexOf(viewportId)
  return index !== -1 ? true : false
}

window.getReferenceLineDraggableRotatable = getReferenceLineDraggableRotatable

let viewportReferenceLineSlabThicknessControlsOn = [
  VIEWPORT_IDS.CT.AXIAL,
  VIEWPORT_IDS.CT.SAGITTAL,
  VIEWPORT_IDS.CT.CORONAL,
  VIEWPORT_IDS.PROSTATE.AXIAL,
  VIEWPORT_IDS.PROSTATE.SAGITTAL,
  VIEWPORT_IDS.PROSTATE.CORONAL,
  /*VIEWPORT_IDS.PT.AXIAL,
  VIEWPORT_IDS.PT.SAGITTAL,
  VIEWPORT_IDS.PT.CORONAL,*/
  VIEWPORT_IDS.FUSION.AXIAL,
  VIEWPORT_IDS.FUSION.SAGITTAL,
  VIEWPORT_IDS.FUSION.CORONAL,
  VIEWPORT_IDS.PTMIP.CORONAL,
  VIEWPORT_IDS.CTVR.VR,
  VIEWPORT_IDS.CTOBLIQUE.OBLIQUE,
  VIEWPORT_IDS.PT_TYPES_SUV_BW.CORONAL,
  VIEWPORT_IDS.PT_TYPES_SUV_LBM.CORONAL,
  VIEWPORT_IDS.PT_TYPES_SUV_BSA.CORONAL,
]

function setReferenceLineSlabThicknessControlsOn(viewportId, controllable) {
  const index = viewportReferenceLineSlabThicknessControlsOn.indexOf(viewportId)
  if (controllable) {
    index === -1
      ? array.push(viewportId)
      : console.log('viewport has already the slabThickness controls on')
  } else {
    index > -1
      ? array.splice(index, 1)
      : console.log('viewport not found in the slabThickness controls on')
  }
}

window.setReferenceLineSlabThicknessControlsOn =
  setReferenceLineSlabThicknessControlsOn

function getReferenceLineSlabThicknessControlsOn(viewportId) {
  const index = viewportReferenceLineSlabThicknessControlsOn.indexOf(viewportId)
  return index !== -1 ? true : false
}

window.getReferenceLineSlabThicknessControlsOn =
  getReferenceLineSlabThicknessControlsOn

let viewportColors = {}
viewportColors[VIEWPORT_IDS.CT.AXIAL] = 'rgb(200, 0, 0)'
viewportColors[VIEWPORT_IDS.CT.SAGITTAL] = 'rgb(200, 200, 0)'
viewportColors[VIEWPORT_IDS.CT.CORONAL] = 'rgb(0, 200, 0)'

viewportColors[VIEWPORT_IDS.PT.AXIAL] = 'rgb(200, 0, 0)'
viewportColors[VIEWPORT_IDS.PT.SAGITTAL] = 'rgb(200, 200, 0)'
viewportColors[VIEWPORT_IDS.PT.CORONAL] = 'rgb(0, 200, 0)'

viewportColors[VIEWPORT_IDS.PROSTATE.AXIAL] = 'rgb(200, 0, 0)'
viewportColors[VIEWPORT_IDS.PROSTATE.SAGITTAL] = 'rgb(200, 200, 0)'
viewportColors[VIEWPORT_IDS.PROSTATE.CORONAL] = 'rgb(0, 200, 0)'

viewportColors[VIEWPORT_IDS.FUSION.AXIAL] = 'rgb(200, 0, 0)'
viewportColors[VIEWPORT_IDS.FUSION.SAGITTAL] = 'rgb(200, 200, 0)'
viewportColors[VIEWPORT_IDS.FUSION.CORONAL] = 'rgb(0, 200, 0)'

viewportColors[VIEWPORT_IDS.PTMIP.CORONAL] = 'rgb(0, 200, 0)'

viewportColors[VIEWPORT_IDS.CTVR.VR] = 'rgb(200, 200, 200)'

viewportColors[VIEWPORT_IDS.CTOBLIQUE.OBLIQUE] = 'rgb(200, 200, 200)'

viewportColors[VIEWPORT_IDS.PT_TYPES_SUV_BW.CORONAL] = 'rgb(0, 200, 0)'
viewportColors[VIEWPORT_IDS.PT_TYPES_SUV_LBM.CORONAL] = 'rgb(0, 200, 0)'
viewportColors[VIEWPORT_IDS.PT_TYPES_SUV_BSA.CORONAL] = 'rgb(0, 200, 0)'

function setReferenceLineColor(viewportId, color) {
  viewportColors[viewportId] = color
}

window.setReferenceLineColor = setReferenceLineColor

function getReferenceLineColor(viewportId) {
  return viewportColors[viewportId]
}

window.getReferenceLineColor = getReferenceLineColor

function initToolGroups() {
  // TODO: Can we delete tool groups?
  // These need to be in lifecycle so we can undo on page death
  csTools3d.addTool(PanTool)
  // @TODO: This kills the volumeId and tool configuration
  csTools3d.addTool(WindowLevelTool)
  csTools3d.addTool(StackScrollMouseWheelTool)
  csTools3d.addTool(StackScrollTool)
  csTools3d.addTool(ZoomTool)
  csTools3d.addTool(VolumeRotateMouseWheelTool)
  csTools3d.addTool(MIPJumpToClickTool)
  csTools3d.addTool(LengthTool)
  csTools3d.addTool(ProbeTool)
  csTools3d.addTool(RectangleRoiTool)
  csTools3d.addTool(EllipticalRoiTool)
  csTools3d.addTool(BidirectionalTool)
  csTools3d.addTool(CrosshairsTool)
  // Segmentation
  csTools3d.addTool(RectangleScissorsTool)
  csTools3d.addTool(CircleScissorsTool)
  csTools3d.addTool(BrushTool)
  csTools3d.addTool(SphereScissorsTool)
  csTools3d.addTool(RectangleRoiThresholdTool)
  csTools3d.addTool(RectangleRoiStartEndThresholdTool)
  csTools3d.addTool(SegmentationDisplayTool)

  const stackCTViewportToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_IDS.STACK_CT
  )
  const stackPTViewportToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_IDS.STACK_PT
  )
  const stackDXViewportToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_IDS.STACK_DX
  )
  const ctSceneToolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_IDS.CT)
  const ptSceneToolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_IDS.PT)
  const colorSceneToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_IDS.COLOR
  )
  const prostateSceneToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_IDS.PROSTATE
  )
  const fusionSceneToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_IDS.FUSION
  )
  const ptMipSceneToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_IDS.PTMIP
  )
  const ctVRSceneToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_IDS.CTVR
  )
  const ctObliqueToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_IDS.CTOBLIQUE
  )

  const ptTypesSceneToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_IDS.PT_TYPES
  )

  const ctTestSceneToolGroup = ToolGroupManager.createToolGroup('ctTestVolume')

  const ptTestSceneToolGroup = ToolGroupManager.createToolGroup('ptTestVolume')

  return {
    stackCTViewportToolGroup,
    stackPTViewportToolGroup,
    stackDXViewportToolGroup,
    ctSceneToolGroup,
    prostateSceneToolGroup,
    ptSceneToolGroup,
    fusionSceneToolGroup,
    ptMipSceneToolGroup,
    ctVRSceneToolGroup,
    ctObliqueToolGroup,
    ptTypesSceneToolGroup,
    colorSceneToolGroup,
    ctTestSceneToolGroup,
    ptTestSceneToolGroup,
  }
}

function addToolsToToolGroups({
  stackCTViewportToolGroup,
  stackPTViewportToolGroup,
  stackDXViewportToolGroup,
  prostateSceneToolGroup,
  ctSceneToolGroup,
  ptSceneToolGroup,
  fusionSceneToolGroup,
  ptMipSceneToolGroup,
  ctVRSceneToolGroup,
  ctObliqueToolGroup,
  ptTypesSceneToolGroup,
  ctTestSceneToolGroup,
  ptTestSceneToolGroup,
}) {
  // Set up stack Scene tools

  if (stackPTViewportToolGroup) {
    stackPTViewportToolGroup.addTool(WindowLevelTool.toolName)
    stackPTViewportToolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    })
    stackPTViewportToolGroup.addTool(LengthTool.toolName)
    stackPTViewportToolGroup.addTool(PanTool.toolName)
    stackPTViewportToolGroup.addTool(ZoomTool.toolName)
    stackPTViewportToolGroup.addTool(StackScrollMouseWheelTool.toolName)
    stackPTViewportToolGroup.addTool(BidirectionalTool.toolName)
    stackPTViewportToolGroup.addTool(LengthTool.toolName)
    stackPTViewportToolGroup.addTool(ProbeTool.toolName)
    stackPTViewportToolGroup.addTool(RectangleRoiTool.toolName)
    stackPTViewportToolGroup.addTool(EllipticalRoiTool.toolName)

    stackPTViewportToolGroup.setToolPassive(BidirectionalTool.toolName)
    stackPTViewportToolGroup.setToolPassive(LengthTool.toolName)
    stackPTViewportToolGroup.setToolPassive(ProbeTool.toolName)
    stackPTViewportToolGroup.setToolPassive(RectangleRoiTool.toolName)
    stackPTViewportToolGroup.setToolPassive(EllipticalRoiTool.toolName)
    stackPTViewportToolGroup.setToolDisabled(CrosshairsTool.toolName)

    stackPTViewportToolGroup.setToolActive(StackScrollMouseWheelTool.toolName)
    stackPTViewportToolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    })
    stackPTViewportToolGroup.setToolActive(PanTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Auxiliary,
        },
      ],
    })
    stackPTViewportToolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Secondary,
        },
      ],
    })
  }

  if (stackCTViewportToolGroup) {
    stackCTViewportToolGroup.addTool(StackScrollTool.toolName)
    stackCTViewportToolGroup.addTool(WindowLevelTool.toolName)
    stackCTViewportToolGroup.addTool(LengthTool.toolName)
    stackCTViewportToolGroup.addTool(PanTool.toolName)
    stackCTViewportToolGroup.addTool(ZoomTool.toolName)
    stackCTViewportToolGroup.addTool(StackScrollMouseWheelTool.toolName)
    stackCTViewportToolGroup.addTool(BidirectionalTool.toolName)
    stackCTViewportToolGroup.addTool(LengthTool.toolName)
    stackCTViewportToolGroup.addTool(ProbeTool.toolName)
    stackCTViewportToolGroup.addTool(RectangleRoiTool.toolName)
    stackCTViewportToolGroup.addTool(EllipticalRoiTool.toolName)

    stackCTViewportToolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    })
    stackCTViewportToolGroup.setToolPassive(BidirectionalTool.toolName)
    stackCTViewportToolGroup.setToolPassive(ProbeTool.toolName)
    stackCTViewportToolGroup.setToolPassive(RectangleRoiTool.toolName)
    stackCTViewportToolGroup.setToolPassive(EllipticalRoiTool.toolName)
    stackCTViewportToolGroup.setToolDisabled(CrosshairsTool.toolName)

    stackCTViewportToolGroup.setToolPassive(LengthTool.toolName)
    stackCTViewportToolGroup.setToolActive(StackScrollMouseWheelTool.toolName)
    stackCTViewportToolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    })
    stackCTViewportToolGroup.setToolActive(PanTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Auxiliary,
        },
      ],
    })
    stackCTViewportToolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Secondary,
        },
      ],
    })
  }

  if (stackDXViewportToolGroup) {
    stackDXViewportToolGroup.addTool(WindowLevelTool.toolName)
    stackDXViewportToolGroup.addTool(LengthTool.toolName)
    stackDXViewportToolGroup.addTool(PanTool.toolName)
    stackDXViewportToolGroup.addTool(ZoomTool.toolName)
    stackDXViewportToolGroup.addTool(StackScrollMouseWheelTool.toolName)
    stackDXViewportToolGroup.addTool(BidirectionalTool.toolName)
    stackDXViewportToolGroup.addTool(LengthTool.toolName)
    stackDXViewportToolGroup.addTool(ProbeTool.toolName)
    stackDXViewportToolGroup.addTool(RectangleRoiTool.toolName)
    stackDXViewportToolGroup.addTool(EllipticalRoiTool.toolName)

    stackDXViewportToolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    })
    stackDXViewportToolGroup.setToolPassive(BidirectionalTool.toolName)
    stackDXViewportToolGroup.setToolPassive(LengthTool.toolName)
    stackDXViewportToolGroup.setToolPassive(ProbeTool.toolName)
    stackDXViewportToolGroup.setToolPassive(RectangleRoiTool.toolName)
    stackDXViewportToolGroup.setToolPassive(EllipticalRoiTool.toolName)
    stackDXViewportToolGroup.setToolDisabled(CrosshairsTool.toolName)

    stackDXViewportToolGroup.setToolActive(StackScrollMouseWheelTool.toolName)
    stackDXViewportToolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    })
    stackDXViewportToolGroup.setToolActive(PanTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Auxiliary,
        },
      ],
    })
    stackDXViewportToolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Secondary,
        },
      ],
    })
  }

  if (ctSceneToolGroup) {
    // Set up CT Scene tools

    // @TODO: This kills the volumeId and tool configuration
    ctSceneToolGroup.addTool(StackScrollTool.toolName)
    ctSceneToolGroup.addTool(RectangleScissorsTool.toolName)
    ctSceneToolGroup.addTool(RectangleRoiThresholdTool.toolName)
    ctSceneToolGroup.addTool(SegmentationDisplayTool.toolName)
    ctSceneToolGroup.setToolEnabled(SegmentationDisplayTool.toolName)
    ctSceneToolGroup.addTool(RectangleRoiStartEndThresholdTool.toolName)
    ctSceneToolGroup.addTool(CircleScissorsTool.toolName)
    ctSceneToolGroup.addTool(SphereScissorsTool.toolName)
    ctSceneToolGroup.addTool(WindowLevelTool.toolName)
    ctSceneToolGroup.addTool(BrushTool.toolName)

    ctSceneToolGroup.addTool(LengthTool.toolName)
    ctSceneToolGroup.addTool(PanTool.toolName)
    ctSceneToolGroup.addTool(ZoomTool.toolName)
    ctSceneToolGroup.addTool(StackScrollMouseWheelTool.toolName)
    ctSceneToolGroup.addTool(BidirectionalTool.toolName)
    ctSceneToolGroup.addTool(LengthTool.toolName)
    ctSceneToolGroup.addTool(ProbeTool.toolName)
    ctSceneToolGroup.addTool(RectangleRoiTool.toolName)
    ctSceneToolGroup.addTool(EllipticalRoiTool.toolName)
    ctSceneToolGroup.addTool(CrosshairsTool.toolName, {
      getReferenceLineColor,
      getReferenceLineControllable,
      getReferenceLineDraggableRotatable,
      getReferenceLineSlabThicknessControlsOn,
    })

    ctSceneToolGroup.setToolPassive(BidirectionalTool.toolName)
    ctSceneToolGroup.setToolPassive(LengthTool.toolName)
    ctSceneToolGroup.setToolPassive(ProbeTool.toolName)
    ctSceneToolGroup.setToolPassive(RectangleRoiTool.toolName)
    ctSceneToolGroup.setToolPassive(EllipticalRoiTool.toolName)
    ctSceneToolGroup.setToolDisabled(CrosshairsTool.toolName)

    ctSceneToolGroup.setToolActive(StackScrollMouseWheelTool.toolName)
    ctSceneToolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    })
    ctSceneToolGroup.setToolActive(PanTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Auxiliary,
        },
      ],
    })
    ctSceneToolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Secondary,
        },
      ],
    })
  }

  if (prostateSceneToolGroup) {
    // Set up CT Scene tools

    // @TODO: This kills the volumeId and tool configuration
    prostateSceneToolGroup.addTool(WindowLevelTool.toolName)
    prostateSceneToolGroup.addTool(LengthTool.toolName)
    prostateSceneToolGroup.addTool(PanTool.toolName)

    prostateSceneToolGroup.addTool(ZoomTool.toolName)
    prostateSceneToolGroup.addTool(StackScrollMouseWheelTool.toolName)
    prostateSceneToolGroup.addTool(BidirectionalTool.toolName)
    prostateSceneToolGroup.addTool(LengthTool.toolName)
    prostateSceneToolGroup.addTool(ProbeTool.toolName)
    prostateSceneToolGroup.addTool(RectangleRoiTool.toolName)
    prostateSceneToolGroup.addTool(EllipticalRoiTool.toolName)
    prostateSceneToolGroup.addTool(CrosshairsTool.toolName, {
      getReferenceLineColor,
      getReferenceLineControllable,
      getReferenceLineDraggableRotatable,
      getReferenceLineSlabThicknessControlsOn,
    })

    prostateSceneToolGroup.setToolPassive(BidirectionalTool.toolName)
    prostateSceneToolGroup.setToolPassive(LengthTool.toolName)
    prostateSceneToolGroup.setToolPassive(ProbeTool.toolName)
    prostateSceneToolGroup.setToolPassive(RectangleRoiTool.toolName)
    prostateSceneToolGroup.setToolPassive(EllipticalRoiTool.toolName)
    prostateSceneToolGroup.setToolDisabled(CrosshairsTool.toolName)

    prostateSceneToolGroup.setToolActive(StackScrollMouseWheelTool.toolName)
    prostateSceneToolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    })
    prostateSceneToolGroup.setToolActive(PanTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Auxiliary,
        },
      ],
    })
    prostateSceneToolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Secondary,
        },
      ],
    })
  }

  if (ptSceneToolGroup) {
    // Set up PT Scene tools
    ptSceneToolGroup.addTool(RectangleScissorsTool.toolName)
    ptSceneToolGroup.addTool(RectangleRoiThresholdTool.toolName)
    ptSceneToolGroup.addTool(BrushTool.toolName)
    ptSceneToolGroup.addTool(SegmentationDisplayTool.toolName)
    ptSceneToolGroup.setToolEnabled(SegmentationDisplayTool.toolName)
    ptSceneToolGroup.addTool(RectangleRoiStartEndThresholdTool.toolName)
    ptSceneToolGroup.addTool(CircleScissorsTool.toolName)
    ptSceneToolGroup.addTool(SphereScissorsTool.toolName)
    ptSceneToolGroup.addTool(BidirectionalTool.toolName)
    ptSceneToolGroup.addTool(LengthTool.toolName)
    ptSceneToolGroup.addTool(WindowLevelTool.toolName)
    ptSceneToolGroup.addTool(ProbeTool.toolName)
    ptSceneToolGroup.addTool(RectangleRoiTool.toolName)
    ptSceneToolGroup.addTool(EllipticalRoiTool.toolName)
    ptSceneToolGroup.addTool(CrosshairsTool.toolName, {
      getReferenceLineColor,
      getReferenceLineControllable,
      getReferenceLineDraggableRotatable,
      getReferenceLineSlabThicknessControlsOn,
    })

    ptSceneToolGroup.addTool(PanTool.toolName)
    ptSceneToolGroup.addTool(ZoomTool.toolName)
    ptSceneToolGroup.addTool(StackScrollMouseWheelTool.toolName)
    ptSceneToolGroup.setToolPassive(ProbeTool.toolName)
    ptSceneToolGroup.setToolPassive(LengthTool.toolName)
    ptSceneToolGroup.setToolPassive(RectangleRoiTool.toolName)
    ptSceneToolGroup.setToolPassive(EllipticalRoiTool.toolName)
    ptSceneToolGroup.setToolPassive(BidirectionalTool.toolName)
    ptSceneToolGroup.setToolDisabled(CrosshairsTool.toolName)

    ptSceneToolGroup.setToolActive(StackScrollMouseWheelTool.toolName)
    ptSceneToolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    })
    ptSceneToolGroup.setToolActive(PanTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Auxiliary,
        },
      ],
    })
    ptSceneToolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Secondary,
        },
      ],
    })
  }

  if (fusionSceneToolGroup) {
    // Set up Fusion Scene tools
    fusionSceneToolGroup.addTool(PanTool.toolName)
    fusionSceneToolGroup.addTool(StackScrollMouseWheelTool.toolName)
    fusionSceneToolGroup.addTool(BidirectionalTool.toolName, {
      volumeId: ptVolumeId,
    })
    fusionSceneToolGroup.addTool(LengthTool.toolName, {
      volumeId: ptVolumeId,
    })
    fusionSceneToolGroup.addTool(ProbeTool.toolName, { volumeId: ptVolumeId })
    fusionSceneToolGroup.addTool(RectangleRoiTool.toolName, {
      volumeId: ptVolumeId,
    })
    fusionSceneToolGroup.addTool(EllipticalRoiTool.toolName, {
      volumeId: ptVolumeId,
    })
    fusionSceneToolGroup.addTool(ZoomTool.toolName)

    fusionSceneToolGroup.addTool(WindowLevelTool.toolName, {
      volumeId: ptVolumeId,
    })
    fusionSceneToolGroup.addTool(CrosshairsTool.toolName, {
      getReferenceLineColor,
      getReferenceLineControllable,
      getReferenceLineDraggableRotatable,
      getReferenceLineSlabThicknessControlsOn,
    })

    fusionSceneToolGroup.setToolPassive(BidirectionalTool.toolName)
    fusionSceneToolGroup.setToolPassive(LengthTool.toolName)
    fusionSceneToolGroup.setToolPassive(ProbeTool.toolName)
    fusionSceneToolGroup.setToolPassive(RectangleRoiTool.toolName)
    fusionSceneToolGroup.setToolPassive(EllipticalRoiTool.toolName)
    fusionSceneToolGroup.setToolDisabled(CrosshairsTool.toolName)

    fusionSceneToolGroup.setToolActive(StackScrollMouseWheelTool.toolName)
    fusionSceneToolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    })
    fusionSceneToolGroup.setToolActive(PanTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Auxiliary,
        },
      ],
    })
    fusionSceneToolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Secondary,
        },
      ],
    })
  }

  if (ptMipSceneToolGroup) {
    ptMipSceneToolGroup.addTool(VolumeRotateMouseWheelTool.toolName)
    ptMipSceneToolGroup.addTool(MIPJumpToClickTool.toolName, {
      // Just as an example to see it is capable of jumping in different viewports
      targetViewportIds: [
        VIEWPORT_IDS.CT.AXIAL,
        VIEWPORT_IDS.PT.SAGITTAL,
        VIEWPORT_IDS.FUSION.CORONAL,
      ],
    })
    ptMipSceneToolGroup.addTool(WindowLevelTool.toolName, {
      volumeId: ptVolumeId,
    })
    ptMipSceneToolGroup.setToolActive(VolumeRotateMouseWheelTool.toolName)
    ptMipSceneToolGroup.setToolActive(MIPJumpToClickTool.toolName)
    ptMipSceneToolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    })
  }

  if (ctVRSceneToolGroup) {
    // Set up CTVR Scene tools
    ctVRSceneToolGroup.addTool(PanTool.toolName)
    ctVRSceneToolGroup.addTool(ZoomTool.toolName)
    ctVRSceneToolGroup.setToolActive(PanTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Auxiliary,
        },
      ],
    })
    ctVRSceneToolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Secondary,
        },
      ],
    })
  }

  if (ctObliqueToolGroup) {
    // Set up CTOBLIQUE Scene tools
    ctObliqueToolGroup.addTool(VolumeRotateMouseWheelTool.toolName)
    ctObliqueToolGroup.addTool(StackScrollTool.toolName)
    ctObliqueToolGroup.setToolActive(VolumeRotateMouseWheelTool.toolName)
    ctObliqueToolGroup.setToolActive(StackScrollTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    })
  }

  if (ctTestSceneToolGroup) {
    // Set up CTOBLIQUE Scene tools
    ctTestSceneToolGroup.addTool(CrosshairsTool.toolName)
    ctTestSceneToolGroup.addTool(WindowLevelTool.toolName)
    ctTestSceneToolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    })
    ctTestSceneToolGroup.setToolPassive(CrosshairsTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    })
  }

  if (ptTestSceneToolGroup) {
    // Set up CTOBLIQUE Scene tools
    ptTestSceneToolGroup.addTool(CrosshairsTool.toolName, {
      getReferenceLineColor,
      getReferenceLineControllable,
      getReferenceLineDraggableRotatable,
      getReferenceLineSlabThicknessControlsOn,
    })
    ptTestSceneToolGroup.addTool(WindowLevelTool.toolName)
    ptTestSceneToolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    })
    ptTestSceneToolGroup.setToolPassive(CrosshairsTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    })
  }

  if (ptTypesSceneToolGroup) {
    ptTypesSceneToolGroup.addTool(WindowLevelTool.toolName, {
      volumeId: ptVolumeId,
    })
    ptTypesSceneToolGroup.addTool(PanTool.toolName)
    ptTypesSceneToolGroup.addTool(ZoomTool.toolName)
    ptTypesSceneToolGroup.addTool(StackScrollMouseWheelTool.toolName)
    ptTypesSceneToolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    })

    ptTypesSceneToolGroup.setToolActive(PanTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Auxiliary,
        },
      ],
    })
    ptTypesSceneToolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Secondary,
        },
      ],
    })
    ptTypesSceneToolGroup.setToolActive(StackScrollMouseWheelTool.toolName)
  }
}

export { initToolGroups, addToolsToToolGroups }
