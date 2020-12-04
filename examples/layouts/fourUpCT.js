import { SCENE_IDS, VIEWPORT_IDS } from '../constants';
import { CONSTANTS } from './../../src/index';
import {
  setCTWWWC,
  setCTVRTransferFunction,
} from '../helpers/transferFunctionHelpers';

const { ORIENTATION, VIEWPORT_TYPE } = CONSTANTS;

function setLayout(
  renderingEngine,
  canvasContainers,
  { ctSceneToolGroup, ctVRSceneToolGroup }
) {
  const viewportInput = [
    // CT
    {
      sceneUID: SCENE_IDS.CT,
      viewportUID: VIEWPORT_IDS.CT.AXIAL,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      canvas: canvasContainers.CT.AXIAL.current,
      defaultOptions: {
        orientation: ORIENTATION.AXIAL,
      },
    },
    {
      sceneUID: SCENE_IDS.CT,
      viewportUID: VIEWPORT_IDS.CT.SAGITTAL,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      canvas: canvasContainers.CT.SAGITTAL.current,
      defaultOptions: {
        orientation: ORIENTATION.SAGITTAL,
      },
    },
    {
      sceneUID: SCENE_IDS.CT,
      viewportUID: VIEWPORT_IDS.CT.CORONAL,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      canvas: canvasContainers.CT.CORONAL.current,
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
      },
    },
    {
      sceneUID: SCENE_IDS.CTVR,
      viewportUID: VIEWPORT_IDS.CTVR.VR,
      type: VIEWPORT_TYPE.PERSPECTIVE,
      canvas: canvasContainers.CTVR.VR.current,
      defaultOptions: {
        orientation: {
          // Some arbitrary rotation so you can tell its 3D
          sliceNormal: [-0.50000000827545, 0.8660253990066052, 0],
          viewUp: [0, 0, 1],
        },
      },
    },
  ];

  renderingEngine.setViewports(viewportInput);

  const renderingEngineUID = renderingEngine.uid;

  viewportInput.forEach(viewportInputEntry => {
    const { sceneUID, viewportUID } = viewportInputEntry;

    if (sceneUID === SCENE_IDS.CT) {
      console.log(`adding ${viewportUID} to CT toolgroup`);
      ctSceneToolGroup.addViewports(renderingEngineUID, sceneUID, viewportUID);
    } else if (sceneUID === SCENE_IDS.CTVR) {
      console.log(`adding ${viewportUID} to CTVR toolgroup`);
      ctVRSceneToolGroup.addViewports(
        renderingEngineUID,
        sceneUID,
        viewportUID
      );
    }
  });
}

function setVolumes(renderingEngine, ctVolumeUID) {
  const ctScene = renderingEngine.getScene(SCENE_IDS.CT);
  const ctVRScene = renderingEngine.getScene(SCENE_IDS.CTVR);

  ctScene.setVolumes([{ volumeUID: ctVolumeUID, callback: setCTWWWC }]);

  ctVRScene.setVolumes([
    { volumeUID: ctVolumeUID, callback: setCTVRTransferFunction },
  ]);
}

export default { setLayout, setVolumes };
