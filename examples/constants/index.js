const renderingEngineUID = 'PETCTRenderingEngine';
const ptVolumeUID = 'cornerstoneStreamingImageVolume:PET_VOLUME';
const ctVolumeUID = 'cornerstoneStreamingImageVolume:CT_VOLUME';

// This file just stores all the IDS used within the demo. In a real application
/// These may associated with different hanging protocols/dynamically generated, etc.

// IDs that unique define each scene used in the demo. A Scene is world space with a set of objects
// In it that could potentially be rendered by multiple viewports.
const SCENE_IDS = {
  CT: 'ctScene',
  PT: 'ptScene',
  FUSION: 'fusionScene',
  PTMIP: 'ptMipScene',
  CTVR: 'ctVRScene',
  CTOBLIQUE: 'ctObliqueScene',
  PT_TYPES_SUV_BW: 'petTypesSuvBW',
  PT_TYPES_SUV_LBM: 'petTypesSuvLBM',
  PT_TYPES_SUV_BSA: 'petTypesSuvBSA',
};

// IDs that define each viewport used in the demos. Here they are grouped by scene for convenience, only.
const VIEWPORT_IDS = {
  CT: {
    AXIAL: 'ctAxial',
    SAGITTAL: 'ctSagittal',
    CORONAL: 'ctCoronal',
  },
  PT: {
    AXIAL: 'ptAxial',
    SAGITTAL: 'ptSagittal',
    CORONAL: 'ptCoronal',
  },
  FUSION: {
    AXIAL: 'fusionAxial',
    SAGITTAL: 'fusionSagittal',
    CORONAL: 'fusionCoronal',
  },
  PTMIP: {
    CORONAL: 'ptMipCoronal',
  },
  CTVR: {
    VR: 'ctVR',
  },
  CTOBLIQUE: {
    OBLIQUE: 'ctOBlique',
  },
  PT_TYPES_SUV_BW: {
    CORONAL: 'ptTypesSuvBWCoronal',
  },
  PT_TYPES_SUV_LBM: {
    CORONAL: 'ptTypesSuvLBMCoronal',
  },
  PT_TYPES_SUV_BSA: {
    CORONAL: 'ptTypesSuvBSACoronal',
  },
};

// IDs for each toolgroup used. We currently use one toolGroup per scene in the demos, but you could have
// Different viewports of the same scene with different toolgroup setups.
const TOOL_GROUP_UIDS = {
  CT: 'ctSceneToolGroup',
  PT: 'ptSceneToolGroup',
  FUSION: 'fusionSceneToolGroup',
  PTMIP: 'ptMipSceneToolGroup',
  CTVR: 'ctVRSceneToolGroup',
  CTOBLIQUE: 'ctObliqueToolGroup',
  PT_TYPES: 'ptTypesToolGroup',
};

// A string helper for the drop down.
const PET_CT_ANNOTATION_TOOLS = [
  'Probe',
  'Crosshairs',
  'Length',
  'Bidirectional',
  'RectangleRoi',
  'EllipticalRoi',
];

// A small simple list of in-built vtk-colormaps, to demonstrate switching transfer function on a volume.
const colormaps = ['hsv', 'Inferno (matplotlib)'];

export {
  renderingEngineUID,
  ptVolumeUID,
  ctVolumeUID,
  SCENE_IDS,
  VIEWPORT_IDS,
  TOOL_GROUP_UIDS,
  colormaps,
  PET_CT_ANNOTATION_TOOLS,
};
