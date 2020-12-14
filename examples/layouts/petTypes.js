import { SCENE_IDS, VIEWPORT_IDS } from '../constants';
import { CONSTANTS, imageCache, utils } from './../../src/index';

const { ORIENTATION, VIEWPORT_TYPE } = CONSTANTS;

function setLayout(
  renderingEngine,
  canvasContainers,
  { ptTypesSceneToolGroup }
) {
  const viewportInput = [
    // PT Coronal SUV BW
    {
      sceneUID: SCENE_IDS.PT_TYPES_SUV_BW,
      viewportUID: VIEWPORT_IDS.PT_TYPES_SUV_BW.CORONAL,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      canvas: canvasContainers.get(0),
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
        background: [1, 1, 1],
      },
    },
    // PT Coronal SUV LBM
    {
      sceneUID: SCENE_IDS.PT_TYPES_SUV_LBM,
      viewportUID: VIEWPORT_IDS.PT_TYPES_SUV_LBM.CORONAL,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      canvas: canvasContainers.get(1),
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
        background: [1, 1, 1],
      },
    },
    // PT Coronal SUV BSA
    {
      sceneUID: SCENE_IDS.PT_TYPES_SUV_BSA,
      viewportUID: VIEWPORT_IDS.PT_TYPES_SUV_BSA.CORONAL,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      canvas: canvasContainers.get(2),
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
        background: [1, 1, 1],
      },
    },
  ];

  renderingEngine.setViewports(viewportInput);

  const renderingEngineUID = renderingEngine.uid;

  viewportInput.forEach(viewportInputEntry => {
    const { sceneUID, viewportUID } = viewportInputEntry;

    ptTypesSceneToolGroup.addViewports(
      renderingEngineUID,
      sceneUID,
      viewportUID
    );
  });
}

function setPetBWTransferFunction({ volumeActor, volumeUID }) {
  const rgbTransferFunction = volumeActor
    .getProperty()
    .getRGBTransferFunction(0);

  rgbTransferFunction.setRange(0, 5);

  utils.invertRgbTransferFunction(rgbTransferFunction);
}

function setPetLBMTransferFunction({ volumeActor, volumeUID }) {
  const imageVolume = imageCache.getImageVolume(volumeUID);

  // const { SUVbwFactor, SUVlbmFactor } = imageVolume.scaling;

  // const factor = SUVlbmFactor / SUVbwFactor;

  const scalingFactor = 0.9; // TODO
  const max = 5 * scalingFactor;

  const rgbTransferFunction = volumeActor
    .getProperty()
    .getRGBTransferFunction(0);

  rgbTransferFunction.setRange(0, max);

  utils.scaleRgbTransferFunction(rgbTransferFunction, scalingFactor);
  utils.invertRgbTransferFunction(rgbTransferFunction);
}

function setPetBSATransferFunction({ volumeActor, volumeUID }) {
  const imageVolume = imageCache.getImageVolume(volumeUID);

  // const { SUVbwFactor, SUVbsaFactor } = imageVolume.scaling;

  // const factor = SUVbsaFactor / SUVbwFactor;

  const scalingFactor = 1.1; // TODO

  const rgbTransferFunction = volumeActor
    .getProperty()
    .getRGBTransferFunction(0);

  const max = 5 * scalingFactor;

  rgbTransferFunction.setRange(0, max);

  utils.scaleRgbTransferFunction(rgbTransferFunction, scalingFactor);
  utils.invertRgbTransferFunction(rgbTransferFunction);
}

function setVolumes(renderingEngine, ptVolumeUID) {
  const ptBWScene = renderingEngine.getScene(SCENE_IDS.PT_TYPES_SUV_BW);
  const ptLBMScene = renderingEngine.getScene(SCENE_IDS.PT_TYPES_SUV_LBM);
  const ptBSAScene = renderingEngine.getScene(SCENE_IDS.PT_TYPES_SUV_BSA);

  ptBWScene.setVolumes([
    { volumeUID: ptVolumeUID, callback: setPetBWTransferFunction },
  ]);

  ptLBMScene.setVolumes([
    { volumeUID: ptVolumeUID, callback: setPetLBMTransferFunction },
  ]);

  ptBSAScene.setVolumes([
    { volumeUID: ptVolumeUID, callback: setPetBSATransferFunction },
  ]);
}

export default { setLayout, setVolumes };
