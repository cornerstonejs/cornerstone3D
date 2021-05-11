import { SCENE_IDS, VIEWPORT_IDS } from '../constants';
import { ORIENTATION, VIEWPORT_TYPE } from '@ohif/cornerstone-render';
import {
  setCTWWWC,
  setCTVRTransferFunction,
} from '../helpers/transferFunctionHelpers';

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
      canvas: canvasContainers.get(0),
      defaultOptions: {
        orientation: ORIENTATION.AXIAL,
      },
    },
    {
      sceneUID: SCENE_IDS.CT,
      viewportUID: VIEWPORT_IDS.CT.SAGITTAL,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      canvas: canvasContainers.get(1),
      defaultOptions: {
        orientation: ORIENTATION.SAGITTAL,
      },
    },
    {
      sceneUID: SCENE_IDS.CT,
      viewportUID: VIEWPORT_IDS.CT.CORONAL,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      canvas: canvasContainers.get(2),
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
      },
    },
    {
      sceneUID: SCENE_IDS.CTVR,
      viewportUID: VIEWPORT_IDS.CTVR.VR,
      type: VIEWPORT_TYPE.PERSPECTIVE,
      canvas: canvasContainers.get(3),
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
