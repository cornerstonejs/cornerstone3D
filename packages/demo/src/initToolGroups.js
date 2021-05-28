import * as csTools3d from '@ohif/cornerstone-tools'
import {
  TOOL_GROUP_UIDS,
  ptVolumeUID,
  ctVolumeUID,
  ctStackUID,
  VIEWPORT_IDS,
} from './constants'
const {
  PanTool,
  WindowLevelTool,
  PetThresholdTool,
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
 * TO DO: would be ideal to hoister these configurations to a tool state manager
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

function setReferenceLineControllable(viewportUID, controllable) {
  const index = viewportReferenceLineControllable.indexOf(viewportUID)
  if (controllable) {
    index === -1
      ? array.push(viewportUID)
      : console.log('viewport is already controllable')
  } else {
    index > -1
      ? array.splice(index, 1)
      : console.log('viewport not found in controllable ones')
  }
}

window.settReferenceLineControllable = setReferenceLineControllable

function getReferenceLineControllable(viewportUID) {
  const index = viewportReferenceLineControllable.indexOf(viewportUID)
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

function setReferenceLineDraggableRotatable(viewportUID, controllable) {
  const index = viewportReferenceLineDraggableRotatable.indexOf(viewportUID)
  if (controllable) {
    index === -1
      ? array.push(viewportUID)
      : console.log('viewport is already draggable')
  } else {
    index > -1
      ? array.splice(index, 1)
      : console.log('viewport not found in draggable ones')
  }
}

window.setReferenceLineDraggableRotatable = setReferenceLineDraggableRotatable

function getReferenceLineDraggableRotatable(viewportUID) {
  const index = viewportReferenceLineDraggableRotatable.indexOf(viewportUID)
  return index !== -1 ? true : false
}

window.getReferenceLineDraggableRotatable = getReferenceLineDraggableRotatable

let viewportReferenceLineSlabThicknessControlsOn = [
  VIEWPORT_IDS.CT.AXIAL,
  VIEWPORT_IDS.CT.SAGITTAL,
  VIEWPORT_IDS.CT.CORONAL,
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

function setReferenceLineSlabThicknessControlsOn(viewportUID, controllable) {
  const index =
    viewportReferenceLineSlabThicknessControlsOn.indexOf(viewportUID)
  if (controllable) {
    index === -1
      ? array.push(viewportUID)
      : console.log('viewport has already the slabThickness controls on')
  } else {
    index > -1
      ? array.splice(index, 1)
      : console.log('viewport not found in the slabThickness controls on')
  }
}

window.setReferenceLineSlabThicknessControlsOn =
  setReferenceLineSlabThicknessControlsOn

function getReferenceLineSlabThicknessControlsOn(viewportUID) {
  const index =
    viewportReferenceLineSlabThicknessControlsOn.indexOf(viewportUID)
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

viewportColors[VIEWPORT_IDS.FUSION.AXIAL] = 'rgb(200, 0, 0)'
viewportColors[VIEWPORT_IDS.FUSION.SAGITTAL] = 'rgb(200, 200, 0)'
viewportColors[VIEWPORT_IDS.FUSION.CORONAL] = 'rgb(0, 200, 0)'

viewportColors[VIEWPORT_IDS.PTMIP.CORONAL] = 'rgb(0, 200, 0)'

viewportColors[VIEWPORT_IDS.CTVR.VR] = 'rgb(200, 200, 200)'

viewportColors[VIEWPORT_IDS.CTOBLIQUE.OBLIQUE] = 'rgb(200, 200, 200)'

viewportColors[VIEWPORT_IDS.PT_TYPES_SUV_BW.CORONAL] = 'rgb(0, 200, 0)'
viewportColors[VIEWPORT_IDS.PT_TYPES_SUV_LBM.CORONAL] = 'rgb(0, 200, 0)'
viewportColors[VIEWPORT_IDS.PT_TYPES_SUV_BSA.CORONAL] = 'rgb(0, 200, 0)'

function setReferenceLineColor(viewportUID, color) {
  viewportColors[viewportUID] = color
}

window.setReferenceLineColor = setReferenceLineColor

function getReferenceLineColor(viewportUID) {
  return viewportColors[viewportUID]
}

window.getReferenceLineColor = getReferenceLineColor

function initToolGroups(toolConfiguration = {}) {
  // TODO: Can we delete tool groups?
  // These need to be in lifecycle so we can undo on page death
  csTools3d.addTool(PanTool, toolConfiguration)
  // @TODO: This kills the volumeUID and tool configuration
  csTools3d.addTool(WindowLevelTool, toolConfiguration)
  csTools3d.addTool(PetThresholdTool, toolConfiguration)
  csTools3d.addTool(StackScrollMouseWheelTool, toolConfiguration)
  csTools3d.addTool(StackScrollTool, toolConfiguration)
  csTools3d.addTool(ZoomTool, toolConfiguration)
  csTools3d.addTool(VolumeRotateMouseWheelTool, toolConfiguration)
  csTools3d.addTool(MIPJumpToClickTool, toolConfiguration)
  csTools3d.addTool(LengthTool, toolConfiguration)
  csTools3d.addTool(ProbeTool, toolConfiguration)
  csTools3d.addTool(RectangleRoiTool, toolConfiguration)
  csTools3d.addTool(EllipticalRoiTool, toolConfiguration)
  csTools3d.addTool(BidirectionalTool, toolConfiguration)
  csTools3d.addTool(CrosshairsTool, toolConfiguration)

  const stackCTViewportToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_UIDS.STACK_CT
  )
  const stackPTViewportToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_UIDS.STACK_PT
  )
  const stackDXViewportToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_UIDS.STACK_DX
  )
  const ctSceneToolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_UIDS.CT)
  const ptSceneToolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_UIDS.PT)
  const fusionSceneToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_UIDS.FUSION
  )
  const ptMipSceneToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_UIDS.PTMIP
  )
  const ctVRSceneToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_UIDS.CTVR
  )
  const ctObliqueToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_UIDS.OBLIQUE
  )

  const ptTypesSceneToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_UIDS.PT_TYPES
  )

  // Set up stack Scene tools

  stackPTViewportToolGroup.addTool('PetThreshold', {
    configuration: { stackUID: '' },
  })
  stackPTViewportToolGroup.setToolActive('PetThreshold', {
    bindings: [ToolBindings.Mouse.Primary],
  })
  stackPTViewportToolGroup.addTool('Length', {})
  stackPTViewportToolGroup.addTool('Pan', {})
  stackPTViewportToolGroup.addTool('Zoom', {})
  stackPTViewportToolGroup.addTool('StackScrollMouseWheel', {})
  stackPTViewportToolGroup.addTool('Bidirectional', {
    configuration: { stackUID: ctStackUID },
  })
  stackPTViewportToolGroup.addTool('Length', {
    configuration: { stackUID: ctStackUID },
  })
  stackPTViewportToolGroup.addTool('Probe', {
    configuration: { stackUID: ctStackUID },
  })
  stackPTViewportToolGroup.addTool('RectangleRoi', {
    configuration: { stackUID: ctStackUID },
  })
  stackPTViewportToolGroup.addTool('EllipticalRoi', {
    configuration: { stackUID: ctStackUID },
  })

  stackPTViewportToolGroup.setToolPassive('Bidirectional')
  stackPTViewportToolGroup.setToolPassive('Length')
  stackPTViewportToolGroup.setToolPassive('Probe')
  stackPTViewportToolGroup.setToolPassive('RectangleRoi')
  stackPTViewportToolGroup.setToolPassive('EllipticalRoi')
  stackPTViewportToolGroup.setToolPassive('Crosshairs')

  stackPTViewportToolGroup.setToolActive('StackScrollMouseWheel')
  stackPTViewportToolGroup.setToolActive('WindowLevel', {
    bindings: [ToolBindings.Mouse.Primary],
  })
  stackPTViewportToolGroup.setToolActive('Pan', {
    bindings: [ToolBindings.Mouse.Auxiliary],
  })
  stackPTViewportToolGroup.setToolActive('Zoom', {
    bindings: [ToolBindings.Mouse.Secondary],
  })

  stackCTViewportToolGroup.addTool('WindowLevel', {
    configuration: { stackUID: '' },
  })
  stackCTViewportToolGroup.addTool('Length', {})
  stackCTViewportToolGroup.addTool('Pan', {})
  stackCTViewportToolGroup.addTool('Zoom', {})
  stackCTViewportToolGroup.addTool('StackScrollMouseWheel', {})
  stackCTViewportToolGroup.addTool('Bidirectional', {
    configuration: { stackUID: ctStackUID },
  })
  stackCTViewportToolGroup.addTool('Length', {
    configuration: { stackUID: ctStackUID },
  })
  stackCTViewportToolGroup.addTool('Probe', {
    configuration: { stackUID: ctStackUID },
  })
  stackCTViewportToolGroup.addTool('RectangleRoi', {
    configuration: { stackUID: ctStackUID },
  })
  stackCTViewportToolGroup.addTool('EllipticalRoi', {
    configuration: { stackUID: ctStackUID },
  })

  stackCTViewportToolGroup.setToolActive('WindowLevel', {
    bindings: [ToolBindings.Mouse.Primary],
  })
  stackCTViewportToolGroup.setToolPassive('Bidirectional')
  stackCTViewportToolGroup.setToolPassive('Length')
  stackCTViewportToolGroup.setToolPassive('Probe')
  stackCTViewportToolGroup.setToolPassive('RectangleRoi')
  stackCTViewportToolGroup.setToolPassive('EllipticalRoi')
  stackCTViewportToolGroup.setToolPassive('Crosshairs')

  stackCTViewportToolGroup.setToolActive('StackScrollMouseWheel')
  stackCTViewportToolGroup.setToolActive('WindowLevel', {
    bindings: [ToolBindings.Mouse.Primary],
  })
  stackCTViewportToolGroup.setToolActive('Pan', {
    bindings: [ToolBindings.Mouse.Auxiliary],
  })
  stackCTViewportToolGroup.setToolActive('Zoom', {
    bindings: [ToolBindings.Mouse.Secondary],
  })

  stackDXViewportToolGroup.addTool('WindowLevel', {
    configuration: { stackUID: '' },
  })
  stackDXViewportToolGroup.addTool('Length', {})
  stackDXViewportToolGroup.addTool('Pan', {})
  stackDXViewportToolGroup.addTool('Zoom', {})
  stackDXViewportToolGroup.addTool('StackScrollMouseWheel', {})
  stackDXViewportToolGroup.addTool('Bidirectional', {
    configuration: { stackUID: ctStackUID },
  })
  stackDXViewportToolGroup.addTool('Length', {
    configuration: { stackUID: ctStackUID },
  })
  stackDXViewportToolGroup.addTool('Probe', {
    configuration: { stackUID: ctStackUID },
  })
  stackDXViewportToolGroup.addTool('RectangleRoi', {
    configuration: { stackUID: ctStackUID },
  })
  stackDXViewportToolGroup.addTool('EllipticalRoi', {
    configuration: { stackUID: ctStackUID },
  })

  stackDXViewportToolGroup.setToolActive('WindowLevel', {
    bindings: [ToolBindings.Mouse.Primary],
  })
  stackDXViewportToolGroup.setToolPassive('Bidirectional')
  stackDXViewportToolGroup.setToolPassive('Length')
  stackDXViewportToolGroup.setToolPassive('Probe')
  stackDXViewportToolGroup.setToolPassive('RectangleRoi')
  stackDXViewportToolGroup.setToolPassive('EllipticalRoi')
  stackDXViewportToolGroup.setToolPassive('Crosshairs')

  stackDXViewportToolGroup.setToolActive('StackScrollMouseWheel')
  stackDXViewportToolGroup.setToolActive('WindowLevel', {
    bindings: [ToolBindings.Mouse.Primary],
  })
  stackDXViewportToolGroup.setToolActive('Pan', {
    bindings: [ToolBindings.Mouse.Auxiliary],
  })
  stackDXViewportToolGroup.setToolActive('Zoom', {
    bindings: [ToolBindings.Mouse.Secondary],
  })

  // Set up CT Scene tools

  // @TODO: This kills the volumeUID and tool configuration
  ctSceneToolGroup.addTool('WindowLevel', {
    configuration: { volumeUID: ctVolumeUID },
  })
  ctSceneToolGroup.addTool('Length', {})
  ctSceneToolGroup.addTool('Pan', {})
  ctSceneToolGroup.addTool('Zoom', {})
  ctSceneToolGroup.addTool('StackScrollMouseWheel', {})
  ctSceneToolGroup.addTool('Bidirectional', {
    configuration: { volumeUID: ctVolumeUID },
  })
  ctSceneToolGroup.addTool('Length', {
    configuration: { volumeUID: ctVolumeUID },
  })
  ctSceneToolGroup.addTool('Probe', {
    configuration: { volumeUID: ctVolumeUID },
  })
  ctSceneToolGroup.addTool('RectangleRoi', {
    configuration: { volumeUID: ctVolumeUID },
  })
  ctSceneToolGroup.addTool('EllipticalRoi', {
    configuration: { volumeUID: ctVolumeUID },
  })
  ctSceneToolGroup.addTool('Crosshairs', {
    configuration: {
      getReferenceLineColor,
      getReferenceLineControllable,
      getReferenceLineDraggableRotatable,
      getReferenceLineSlabThicknessControlsOn,
    },
  })

  ctSceneToolGroup.setToolPassive('Bidirectional')
  ctSceneToolGroup.setToolPassive('Length')
  ctSceneToolGroup.setToolPassive('Probe')
  ctSceneToolGroup.setToolPassive('RectangleRoi')
  ctSceneToolGroup.setToolPassive('EllipticalRoi')
  ctSceneToolGroup.setToolPassive('Crosshairs')

  ctSceneToolGroup.setToolActive('StackScrollMouseWheel')
  ctSceneToolGroup.setToolActive('WindowLevel', {
    bindings: [ToolBindings.Mouse.Primary],
  })
  ctSceneToolGroup.setToolActive('Pan', {
    bindings: [ToolBindings.Mouse.Auxiliary],
  })
  ctSceneToolGroup.setToolActive('Zoom', {
    bindings: [ToolBindings.Mouse.Secondary],
  })

  // Set up PT Scene tools
  ptSceneToolGroup.addTool('Bidirectional', {
    configuration: { volumeUID: ptVolumeUID },
  })
  ptSceneToolGroup.addTool('Length', {
    configuration: { volumeUID: ptVolumeUID },
  })
  ptSceneToolGroup.addTool('PetThreshold', {
    configuration: { volumeUID: ptVolumeUID },
  })
  ptSceneToolGroup.addTool('Probe', {
    configuration: { volumeUID: ptVolumeUID },
  })
  ptSceneToolGroup.addTool('RectangleRoi', {
    configuration: { volumeUID: ptVolumeUID },
  })
  ptSceneToolGroup.addTool('EllipticalRoi', {
    configuration: { volumeUID: ptVolumeUID },
  })
  ptSceneToolGroup.addTool('Crosshairs', {
    configuration: {
      getReferenceLineColor,
      getReferenceLineControllable,
      getReferenceLineDraggableRotatable,
      getReferenceLineSlabThicknessControlsOn,
    },
  })

  ptSceneToolGroup.addTool('Pan', {})
  ptSceneToolGroup.addTool('Zoom', {})
  ptSceneToolGroup.addTool('StackScrollMouseWheel', {})
  ptSceneToolGroup.setToolPassive('Probe')
  ptSceneToolGroup.setToolPassive('Length')
  ptSceneToolGroup.setToolPassive('RectangleRoi')
  ptSceneToolGroup.setToolPassive('EllipticalRoi')
  ptSceneToolGroup.setToolPassive('Bidirectional')
  ptSceneToolGroup.setToolPassive('Crosshairs')

  ptSceneToolGroup.setToolActive('StackScrollMouseWheel')
  ptSceneToolGroup.setToolActive('PetThreshold', {
    bindings: [ToolBindings.Mouse.Primary],
  })
  ptSceneToolGroup.setToolActive('Pan', {
    bindings: [ToolBindings.Mouse.Auxiliary],
  })
  ptSceneToolGroup.setToolActive('Zoom', {
    bindings: [ToolBindings.Mouse.Secondary],
  })

  // Set up Fusion Scene tools
  fusionSceneToolGroup.addTool('Pan', {})
  fusionSceneToolGroup.addTool('StackScrollMouseWheel', {})
  fusionSceneToolGroup.addTool('Bidirectional', {
    configuration: { volumeUID: ptVolumeUID },
  })
  fusionSceneToolGroup.addTool('Length', {
    configuration: { volumeUID: ptVolumeUID },
  })
  fusionSceneToolGroup.addTool('Probe', {
    configuration: { volumeUID: ptVolumeUID },
  })
  fusionSceneToolGroup.addTool('RectangleRoi', {
    configuration: { volumeUID: ptVolumeUID },
  })
  fusionSceneToolGroup.addTool('EllipticalRoi', {
    configuration: { volumeUID: ptVolumeUID },
  })
  fusionSceneToolGroup.addTool('Zoom', {})

  fusionSceneToolGroup.addTool('PetThreshold', {
    configuration: { volumeUID: ptVolumeUID },
  })
  fusionSceneToolGroup.addTool('Crosshairs', {
    configuration: {
      getReferenceLineColor,
      getReferenceLineControllable,
      getReferenceLineDraggableRotatable,
      getReferenceLineSlabThicknessControlsOn,
    },
  })

  fusionSceneToolGroup.setToolPassive('Bidirectional')
  fusionSceneToolGroup.setToolPassive('Length')
  fusionSceneToolGroup.setToolPassive('Probe')
  fusionSceneToolGroup.setToolPassive('RectangleRoi')
  fusionSceneToolGroup.setToolPassive('EllipticalRoi')
  fusionSceneToolGroup.setToolPassive('Crosshairs')

  fusionSceneToolGroup.setToolActive('StackScrollMouseWheel')
  fusionSceneToolGroup.setToolActive('PetThreshold', {
    bindings: [ToolBindings.Mouse.Primary],
  })
  fusionSceneToolGroup.setToolActive('Pan', {
    bindings: [ToolBindings.Mouse.Auxiliary],
  })
  fusionSceneToolGroup.setToolActive('Zoom', {
    bindings: [ToolBindings.Mouse.Secondary],
  })

  ptMipSceneToolGroup.addTool('VolumeRotateMouseWheel', {})
  ptMipSceneToolGroup.addTool('MIPJumpToClickTool', {})
  ptMipSceneToolGroup.addTool('PetThreshold', {
    configuration: { volumeUID: ptVolumeUID },
  })
  ptMipSceneToolGroup.setToolActive('VolumeRotateMouseWheel')
  ptMipSceneToolGroup.setToolActive('MIPJumpToClickTool')
  ptMipSceneToolGroup.setToolActive('PetThreshold', {
    bindings: [ToolBindings.Mouse.Primary],
  })

  // Set up CTVR Scene tools
  ctVRSceneToolGroup.addTool('Pan', {})
  ctVRSceneToolGroup.addTool('Zoom', {})
  ctVRSceneToolGroup.setToolActive('Pan', {
    bindings: [ToolBindings.Mouse.Auxiliary],
  })
  ctVRSceneToolGroup.setToolActive('Zoom', {
    bindings: [ToolBindings.Mouse.Secondary],
  })

  // Set up CTOBLIQUE Scene tools
  ctObliqueToolGroup.addTool('VolumeRotateMouseWheel', {})
  ctObliqueToolGroup.addTool('StackScroll', {})
  ctObliqueToolGroup.setToolActive('VolumeRotateMouseWheel')
  ctObliqueToolGroup.setToolActive('StackScroll', {
    bindings: [ToolBindings.Mouse.Primary],
  })

  ptTypesSceneToolGroup.addTool('PetThreshold', {
    configuration: { volumeUID: ptVolumeUID },
  })
  ptTypesSceneToolGroup.addTool('Pan', {})
  ptTypesSceneToolGroup.addTool('Zoom', {})
  ptTypesSceneToolGroup.addTool('StackScrollMouseWheel', {})
  ptTypesSceneToolGroup.setToolActive('PetThreshold', {
    bindings: [ToolBindings.Mouse.Primary],
  })

  ptTypesSceneToolGroup.setToolActive('Pan', {
    bindings: [ToolBindings.Mouse.Auxiliary],
  })
  ptTypesSceneToolGroup.setToolActive('Zoom', {
    bindings: [ToolBindings.Mouse.Secondary],
  })
  ptTypesSceneToolGroup.setToolActive('StackScrollMouseWheel')

  return {
    stackCTViewportToolGroup,
    stackPTViewportToolGroup,
    stackDXViewportToolGroup,
    ctSceneToolGroup,
    ptSceneToolGroup,
    fusionSceneToolGroup,
    ptMipSceneToolGroup,
    ctVRSceneToolGroup,
    ctObliqueToolGroup,
    ptTypesSceneToolGroup,
  }
}

function destroyToolGroups(toolGroupUIDs) {
  // TODO
}

export { initToolGroups, destroyToolGroups }
