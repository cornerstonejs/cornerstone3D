const renderingEngineUID = 'PETCTRenderingEngine'
const ptVolumeUID = 'cornerstoneStreamingImageVolume:PET_VOLUME'
const ctVolumeUID = 'cornerstoneStreamingImageVolume:CT_VOLUME'
const prostateVolumeUID = 'cornerstoneStreamingImageVolume:PROSTATE_VOLUME'
const ctVolumeTestUID = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
const ptVolumeTestUID = 'fakeVolumeLoader:volumeURI_100_100_4_1_1_1_0'
const ctStackUID = 'CT_Stack'
const petStackUID = 'PET_Stack'

// This file just stores all the IDS used within the demo. In a real application
/// These may associated with different hanging protocols/dynamically generated, etc.

// IDs that unique define each scene used in the demo. A Scene is world space with a set of objects
// In it that could potentially be rendered by multiple viewports.
const SCENE_IDS = {
  STACK: 'stackScene',
  CT: 'ctScene',
  PT: 'ptScene',
  PROSTATE: 'prostateScene',
  FUSION: 'fusionScene',
  PTMIP: 'ptMipScene',
  CTVR: 'ctVRScene',
  CTOBLIQUE: 'ctObliqueScene',
  PT_TYPES_SUV_BW: 'petTypesSuvBW',
  PT_TYPES_SUV_LBM: 'petTypesSuvLBM',
  PT_TYPES_SUV_BSA: 'petTypesSuvBSA',
}

// IDs that define each viewport used in the demos. Here they are grouped by scene for convenience, only.
const VIEWPORT_IDS = {
  STACK: {
    CT: 'ctStack',
    PT: 'ptStack',
    DX: 'dxStack',
  },
  CT: {
    AXIAL: 'ctAxial',
    SAGITTAL: 'ctSagittal',
    CORONAL: 'ctCoronal',
  },
  PROSTATE: {
    AXIAL: 'prostateAxial',
    SAGITTAL: 'prostateSagittal',
    CORONAL: 'prostateCoronal',
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
}

// IDs for each toolgroup used. We currently use one toolGroup per scene in the demos, but you could have
// Different viewports of the same scene with different toolgroup setups.
const TOOL_GROUP_UIDS = {
  STACK_CT: 'stackCTToolGroup',
  STACK_PT: 'stackPTToolGroup',
  STACK_DX: 'stackDXToolGroup',
  CT: 'ctSceneToolGroup',
  PT: 'ptSceneToolGroup',
  PROSTATE: 'prostateSceneToolGroup',
  FUSION: 'fusionSceneToolGroup',
  PTMIP: 'ptMipSceneToolGroup',
  CTVR: 'ctVRSceneToolGroup',
  CTOBLIQUE: 'ctObliqueToolGroup',
  PT_TYPES: 'ptTypesToolGroup',
  COLOR: 'colorToolGroup',
}

// A string helper for the drop down.
const ANNOTATION_TOOLS = [
  'Probe',
  'Crosshairs',
  'Length',
  'Bidirectional',
  'RectangleRoi',
  'EllipticalRoi',
  'ptSUVPeak',
]

// A string helper for the drop down.
const SEGMENTATION_TOOLS = [
  'RectangleScissors',
  'CircleScissors',
  'SphereScissors',
  'RectangleRoiThreshold',
  'RectangleRoiThresholdManual',
]

// A small simple list of in-built vtk-colormaps, to demonstrate switching transfer function on a volume.
const colormaps = ['hsv', 'Inferno (matplotlib)']

export {
  renderingEngineUID,
  ptVolumeUID,
  ctVolumeUID,
  prostateVolumeUID,
  ctStackUID,
  ctVolumeTestUID,
  ptVolumeTestUID,
  petStackUID,
  SCENE_IDS,
  VIEWPORT_IDS,
  TOOL_GROUP_UIDS,
  colormaps,
  ANNOTATION_TOOLS,
  SEGMENTATION_TOOLS
}
