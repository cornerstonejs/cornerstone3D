import { SCENE_IDS, VIEWPORT_IDS } from '../constants';
import { CONSTANTS } from './../../src/index';
import { setPetTransferFunction } from '../helpers/transferFunctionHelpers';

const { ORIENTATION, VIEWPORT_TYPE } = CONSTANTS;

function setLayout(renderingEngine, canvasContainers) {
  renderingEngine.setViewports([
    // PT Sagittal
    {
      sceneUID: SCENE_IDS.PT,
      viewportUID: VIEWPORT_IDS.PT.SAGITTAL,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      canvas: canvasContainers.PT.SAGITTAL.current,
      defaultOptions: {
        orientation: ORIENTATION.SAGITTAL,
        background: [1, 1, 1],
      },
    },
  ]);
}

function setVolumes(renderingEngine, ptVolumeUID) {
  const ptScene = renderingEngine.getScene(SCENE_IDS.PT);
  ptScene.setVolumes([
    { volumeUID: ptVolumeUID, callback: setPetTransferFunction },
  ]);
}

export default { setLayout, setVolumes };
