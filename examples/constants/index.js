const renderingEngineUID = 'PETCTRenderingEngine';
const ptVolumeUID = 'PET_VOLUME';
const ctVolumeUID = 'CT_VOLUME';

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

const TOOL_GROUP_UIDS = {
  CT: 'ctSceneToolGroup',
  PT: 'ptSceneToolGroup',
  FUSION: 'fusionSceneToolGroup',
  PTMIP: 'ptMipSceneToolGroup',
  CTVR: 'ctVRSceneToolGroup',
  CTOBLIQUE: 'ctObliqueToolGroup',
  PT_TYPES: 'ptTypesToolGroup',
};

const PET_CT_ANNOTATION_TOOLS = [
  'Probe',
  'Length',
  'Bidirectional',
  'RectangleRoi',
  'EllipticalRoi',
];

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
