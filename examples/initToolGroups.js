import * as csTools3d from './../src/cornerstone-tools-3d/index';
import { TOOL_GROUP_UIDS, ptVolumeUID, ctVolumeUID, VIEWPORT_IDS } from './constants';
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
  LengthTool,
  ProbeTool,
  RectangleRoiTool,
  EllipticalRoiTool,
  BidirectionalTool,
  CrosshairsTool,
} = csTools3d;

// TODO: for the slab thickness switch to two independent options and one parent option:
// - viewportControllableByReferenceLines true/false
// - viewportReferenceLineDraggable/Rotable true/false
// - viewportReferenceLineSlabThicknessControlsOn true/false
// NOTE: rotate/translate are enabled/disabled together as one option
// in future we may separate them, but only if rotation rotates only the 1 reference line at time
// (at the moment, rotating a reference line, will also rotate all the other active/intersecting ones of the same angle).
let viewportControllable = {};
viewportControllable[VIEWPORT_IDS.CT.AXIAL] = true;
viewportControllable[VIEWPORT_IDS.CT.SAGITTAL] = true;
viewportControllable[VIEWPORT_IDS.CT.CORONAL] = true;

viewportControllable[VIEWPORT_IDS.PT.AXIAL] = true;
viewportControllable[VIEWPORT_IDS.PT.SAGITTAL] = true;
viewportControllable[VIEWPORT_IDS.PT.CORONAL] = true;

viewportControllable[VIEWPORT_IDS.FUSION.AXIAL] = true;
viewportControllable[VIEWPORT_IDS.FUSION.SAGITTAL] = true;
viewportControllable[VIEWPORT_IDS.FUSION.CORONAL] = true;

viewportControllable[VIEWPORT_IDS.PTMIP.CORONAL] = true;

viewportControllable[VIEWPORT_IDS.CTVR.VR] = true;

viewportControllable[VIEWPORT_IDS.CTOBLIQUE.OBLIQUE] = true;

viewportControllable[VIEWPORT_IDS.PT_TYPES_SUV_BW.CORONAL] = true;
viewportControllable[VIEWPORT_IDS.PT_TYPES_SUV_LBM.CORONAL] = true;
viewportControllable[VIEWPORT_IDS.PT_TYPES_SUV_BSA.CORONAL] = true;

function setReferenceLineControllable(viewportUID, controllable) {
  viewportControllable[viewportUID] = controllable;
}

window.setReferenceLineControllable = setReferenceLineControllable;

function getReferenceLineControllable(viewportUID) {
  return viewportControllable[viewportUID];
}

let viewportColors = {};
viewportColors[VIEWPORT_IDS.CT.AXIAL] = 'rgb(200, 0, 0)';
viewportColors[VIEWPORT_IDS.CT.SAGITTAL] = 'rgb(200, 200, 0)';
viewportColors[VIEWPORT_IDS.CT.CORONAL] = 'rgb(0, 200, 0)';

viewportColors[VIEWPORT_IDS.PT.AXIAL] = 'rgb(200, 0, 0)';
viewportColors[VIEWPORT_IDS.PT.SAGITTAL] = 'rgb(200, 200, 0)';
viewportColors[VIEWPORT_IDS.PT.CORONAL] = 'rgb(0, 200, 0)';

viewportColors[VIEWPORT_IDS.FUSION.AXIAL] = 'rgb(200, 0, 0)';
viewportColors[VIEWPORT_IDS.FUSION.SAGITTAL] = 'rgb(200, 200, 0)';
viewportColors[VIEWPORT_IDS.FUSION.CORONAL] = 'rgb(0, 200, 0)';

viewportColors[VIEWPORT_IDS.PTMIP.CORONAL] = 'rgb(0, 200, 0)';

viewportColors[VIEWPORT_IDS.CTVR.VR] = 'rgb(200, 200, 200)';

viewportColors[VIEWPORT_IDS.CTOBLIQUE.OBLIQUE] = 'rgb(200, 200, 200)';

viewportColors[VIEWPORT_IDS.PT_TYPES_SUV_BW.CORONAL] = 'rgb(0, 200, 0)';
viewportColors[VIEWPORT_IDS.PT_TYPES_SUV_LBM.CORONAL] = 'rgb(0, 200, 0)';
viewportColors[VIEWPORT_IDS.PT_TYPES_SUV_BSA.CORONAL] = 'rgb(0, 200, 0)';

function setReferenceLineColor(viewportUID, color) {
  viewportColors[viewportUID] = color;
}

window.setReferenceLineColor = setReferenceLineColor;

function getReferenceLineColor(viewportUID) {
  return viewportColors[viewportUID];
}

function initToolGroups() {
  // TODO: Can we delete tool groups?
  // These need to be in lifecylce so we can undo on page death
  csTools3d.addTool(PanTool, {});
  // @TODO: This kills the volumeUID and tool configuration
  csTools3d.addTool(WindowLevelTool, {});
  csTools3d.addTool(PetThresholdTool, {});
  csTools3d.addTool(StackScrollMouseWheelTool, {});
  csTools3d.addTool(StackScrollTool, {});
  csTools3d.addTool(ZoomTool, {});
  csTools3d.addTool(VolumeRotateMouseWheelTool, {});
  csTools3d.addTool(LengthTool, {});
  csTools3d.addTool(ProbeTool, {});
  csTools3d.addTool(RectangleRoiTool, {});
  csTools3d.addTool(EllipticalRoiTool, {});
  csTools3d.addTool(BidirectionalTool, {});
  csTools3d.addTool(CrosshairsTool, {});

  const ctSceneToolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_UIDS.CT);
  const ptSceneToolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_UIDS.PT);
  const fusionSceneToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_UIDS.FUSION
  );
  const ptMipSceneToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_UIDS.PTMIP
  );
  const ctVRSceneToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_UIDS.CTVR
  );
  const ctObliqueToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_UIDS.OBLIQUE
  );

  const ptTypesSceneToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_UIDS.PT_TYPES
  );

  // Set up CT Scene tools

  // @TODO: This kills the volumeUID and tool configuration
  ctSceneToolGroup.addTool('WindowLevel', {
    configuration: { volumeUID: ctVolumeUID },
  });
  ctSceneToolGroup.addTool('Pan', {});
  ctSceneToolGroup.addTool('Zoom', {});
  ctSceneToolGroup.addTool('StackScrollMouseWheel', {});
  // @TODO: We need an alternative to config that ties volume to an ID
  // TODO ^ What does this mean? I don't think we do. The target volume could be changed for the same tool,
  // its also optional for most of these.
  ctSceneToolGroup.addTool('Bidirectional', {
    configuration: { volumeUID: ctVolumeUID },
  });
  ctSceneToolGroup.addTool('Length', {
    configuration: { volumeUID: ctVolumeUID },
  });
  ctSceneToolGroup.addTool('Probe', {
    configuration: { volumeUID: ctVolumeUID },
  });
  ctSceneToolGroup.addTool('RectangleRoi', {
    configuration: { volumeUID: ctVolumeUID },
  });
  ctSceneToolGroup.addTool('EllipticalRoi', {
    configuration: { volumeUID: ctVolumeUID },
  });
  ctSceneToolGroup.addTool('Crosshairs', {
    configuration: {
      getReferenceLineColor,
      getReferenceLineControllable,
    },
  });

  ctSceneToolGroup.setToolPassive('Bidirectional');
  ctSceneToolGroup.setToolPassive('Length');
  ctSceneToolGroup.setToolPassive('Probe');
  ctSceneToolGroup.setToolPassive('RectangleRoi');
  ctSceneToolGroup.setToolPassive('EllipticalRoi');
  ctSceneToolGroup.setToolPassive('Crosshairs');

  ctSceneToolGroup.setToolActive('StackScrollMouseWheel');
  ctSceneToolGroup.setToolActive('WindowLevel', {
    bindings: [ToolBindings.Mouse.Primary],
  });
  ctSceneToolGroup.setToolActive('Pan', {
    bindings: [ToolBindings.Mouse.Auxiliary],
  });
  ctSceneToolGroup.setToolActive('Zoom', {
    bindings: [ToolBindings.Mouse.Secondary],
  });

  // Set up PT Scene tools
  ptSceneToolGroup.addTool('Bidirectional', {
    configuration: { volumeUID: ptVolumeUID },
  });
  ptSceneToolGroup.addTool('Length', {
    configuration: { volumeUID: ptVolumeUID },
  });
  ptSceneToolGroup.addTool('PetThreshold', {
    configuration: { volumeUID: ptVolumeUID },
  });
  ptSceneToolGroup.addTool('Probe', {
    configuration: { volumeUID: ptVolumeUID },
  });
  ptSceneToolGroup.addTool('RectangleRoi', {
    configuration: { volumeUID: ptVolumeUID },
  });
  ptSceneToolGroup.addTool('EllipticalRoi', {
    configuration: { volumeUID: ptVolumeUID },
  });
  ptSceneToolGroup.addTool('Crosshairs', {
    configuration: {
      getReferenceLineColor,
      getReferenceLineControllable,
    },
  });

  ptSceneToolGroup.addTool('Pan', {});
  ptSceneToolGroup.addTool('Zoom', {});
  ptSceneToolGroup.addTool('StackScrollMouseWheel', {});
  ptSceneToolGroup.setToolPassive('Probe');
  ptSceneToolGroup.setToolPassive('Length');
  ptSceneToolGroup.setToolPassive('RectangleRoi');
  ptSceneToolGroup.setToolPassive('EllipticalRoi');
  ptSceneToolGroup.setToolPassive('Bidirectional');
  ptSceneToolGroup.setToolPassive('Crosshairs');

  ptSceneToolGroup.setToolActive('StackScrollMouseWheel');
  ptSceneToolGroup.setToolActive('PetThreshold', {
    bindings: [ToolBindings.Mouse.Primary],
  });
  ptSceneToolGroup.setToolActive('Pan', {
    bindings: [ToolBindings.Mouse.Auxiliary],
  });
  ptSceneToolGroup.setToolActive('Zoom', {
    bindings: [ToolBindings.Mouse.Secondary],
  });

  // Set up Fusion Scene tools
  fusionSceneToolGroup.addTool('Pan', {});
  fusionSceneToolGroup.addTool('StackScrollMouseWheel', {});
  fusionSceneToolGroup.addTool('Bidirectional', {
    configuration: { volumeUID: ptVolumeUID },
  });
  fusionSceneToolGroup.addTool('Length', {
    configuration: { volumeUID: ptVolumeUID },
  });
  fusionSceneToolGroup.addTool('Probe', {
    configuration: { volumeUID: ptVolumeUID },
  });
  fusionSceneToolGroup.addTool('RectangleRoi', {
    configuration: { volumeUID: ptVolumeUID },
  });
  fusionSceneToolGroup.addTool('EllipticalRoi', {
    configuration: { volumeUID: ptVolumeUID },
  });
  fusionSceneToolGroup.addTool('Zoom', {});

  fusionSceneToolGroup.addTool('PetThreshold', {
    configuration: { volumeUID: ptVolumeUID },
  });
  fusionSceneToolGroup.addTool('Crosshairs', {
    configuration: {
      getReferenceLineColor,
      getReferenceLineControllable,
    },
  });

  fusionSceneToolGroup.setToolPassive('Bidirectional');
  fusionSceneToolGroup.setToolPassive('Length');
  fusionSceneToolGroup.setToolPassive('Probe');
  fusionSceneToolGroup.setToolPassive('RectangleRoi');
  fusionSceneToolGroup.setToolPassive('EllipticalRoi')
  fusionSceneToolGroup.setToolPassive('Crosshairs');

  fusionSceneToolGroup.setToolActive('StackScrollMouseWheel');
  fusionSceneToolGroup.setToolActive('PetThreshold', {
    bindings: [ToolBindings.Mouse.Primary],
  });
  fusionSceneToolGroup.setToolActive('Pan', {
    bindings: [ToolBindings.Mouse.Auxiliary],
  });
  fusionSceneToolGroup.setToolActive('Zoom', {
    bindings: [ToolBindings.Mouse.Secondary],
  });

  ptMipSceneToolGroup.addTool('VolumeRotateMouseWheel', {});
  ptMipSceneToolGroup.addTool('PetThreshold', {
    configuration: { volumeUID: ptVolumeUID },
  });
  ptMipSceneToolGroup.setToolActive('VolumeRotateMouseWheel');
  ptMipSceneToolGroup.setToolActive('PetThreshold', {
    bindings: [ToolBindings.Mouse.Primary],
  });

  // Set up CTVR Scene tools
  ctVRSceneToolGroup.addTool('Pan', {});
  ctVRSceneToolGroup.addTool('Zoom', {});
  ctVRSceneToolGroup.setToolActive('Pan', {
    bindings: [ToolBindings.Mouse.Auxiliary],
  });
  ctVRSceneToolGroup.setToolActive('Zoom', {
    bindings: [ToolBindings.Mouse.Secondary],
  });

  // Set up CTOBLIQUE Scene tools
  ctObliqueToolGroup.addTool('VolumeRotateMouseWheel', {});
  ctObliqueToolGroup.addTool('StackScroll', {});
  ctObliqueToolGroup.setToolActive('VolumeRotateMouseWheel');
  ctObliqueToolGroup.setToolActive('StackScroll', {
    bindings: [ToolBindings.Mouse.Primary],
  });

  ptTypesSceneToolGroup.addTool('PetThreshold', {
    configuration: { volumeUID: ptVolumeUID },
  });
  ptTypesSceneToolGroup.addTool('Pan', {});
  ptTypesSceneToolGroup.addTool('Zoom', {});
  ptTypesSceneToolGroup.addTool('StackScrollMouseWheel', {});
  ptTypesSceneToolGroup.setToolActive('PetThreshold', {
    bindings: [ToolBindings.Mouse.Primary],
  });

  ptTypesSceneToolGroup.setToolActive('Pan', {
    bindings: [ToolBindings.Mouse.Auxiliary],
  });
  ptTypesSceneToolGroup.setToolActive('Zoom', {
    bindings: [ToolBindings.Mouse.Secondary],
  });
  ptTypesSceneToolGroup.setToolActive('StackScrollMouseWheel');

  return {
    ctSceneToolGroup,
    ptSceneToolGroup,
    fusionSceneToolGroup,
    ptMipSceneToolGroup,
    ctVRSceneToolGroup,
    ctObliqueToolGroup,
    ptTypesSceneToolGroup,
  };
}

function destroyToolGroups(toolGroupUIDs) {
  // TODO
}

export { initToolGroups, destroyToolGroups };
