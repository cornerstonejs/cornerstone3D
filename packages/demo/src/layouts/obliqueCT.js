import { SCENE_IDS, VIEWPORT_IDS } from '../constants';
import { Enums, CONSTANTS } from '@cornerstonejs/core';
import {
  setCTWWWC,
  setCTVRTransferFunction,
} from '../helpers/transferFunctionHelpers';

const { ViewportType } = Enums;
const { ORIENTATION } = CONSTANTS;

function setLayout(renderingEngine, canvasContainers, { ctObliqueToolGroup }) {
  const viewportInput = [
    // CT
    {
      sceneUID: SCENE_IDS.CTOBLIQUE,
      viewportId: VIEWPORT_IDS.CTOBLIQUE.OBLIQUE,
      type: ViewportType.ORTHOGRAPHIC,
      canvas: canvasContainers.get(0),
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
      },
    },
  ];

  renderingEngine.setViewports(viewportInput);

  const renderingEngineId = renderingEngine.uid;
  const viewportInputEntry = viewportInput[0];

  const { sceneUID, viewportId } = viewportInputEntry;

  ctObliqueToolGroup.addViewport(viewportId, renderingEngineId);
}

function setVolumes(renderingEngine, ctVolumeId) {
  const ctObliqueScene = renderingEngine.getScene(SCENE_IDS.CTOBLIQUE);

  ctObliqueScene.setVolumes([{ volumeId: ctVolumeId, callback: setCTWWWC }]);
}

export default { setLayout, setVolumes };
