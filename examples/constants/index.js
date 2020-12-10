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
};

const TOOL_GROUP_UIDS = {
  CT: 'ctSceneToolGroup',
  PT: 'ptSceneToolGroup',
  FUSION: 'fusionSceneToolGroup',
  PTMIP: 'ptMipSceneToolGroup',
  CTVR: 'ctVRSceneToolGroup',
  CTOBLIQUE: 'ctObliqueToolGroup',
};

const PET_CT_ANNOTATION_TOOLS = ['Probe', 'RectangleRoi'];

const colormaps = ['hsv', 'Inferno (matplotlib)']; //'RED-PURPLE'];

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
