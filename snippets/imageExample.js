import { VTKLayout, imageCache } from 'vtk-viewport';

const ctUID = imageCache.makeAndCacheVolume(ctImageIds);
const ptUID = imageCache.makeAndCacheVolume(ptImageIds);

// Pre fetch volumes (we could delay this until data is added to the layout in a more complex example)

const containerElement = document.getElementById('myCanvas');
const layout = new VTKLayout(containerElement, 'monitor1');

function setCTWWWC(volumeActor) {
  // Something
}

function setPetTransferFunction(volumeActor) {
  // Something
}

const axialViewportID = 'axial';
const sagittalViewportID = 'sagittal';
const fusionSceneID = 'fusionScene';

// This will generate all the renderers and initialise them (cameras and such).
// It will not render anything though, untill we call layout.render();
layout.setLayout([
  {
    sceneUID: fusionSceneID,
    viewportUID: axialViewportID,
    type: 'orthogonal',
    position: [0, 0.5, 0, 1],
  },
  {
    sceneUID: fusionSceneID,
    viewportUID: sagittalViewportID,
    type: 'perspective',
    position: [0.5, 1, 0, 1],
  },
]);

const fusionScene = layout.getScene(fusionSceneID);

fusionScene.setVolumes([
  { volumeUID: ctUID, callback: setCTWWWC },
  { volumeUID: ptUID, callback: setPetTransferFunction },
]);

function throttledRenderScene() {
  fusionScene.render(); // Throttled render on image load
}

imageCache.loadVolume(ctUID, throttledRenderScene);
imageCache.loadVolume(ptUID, throttledRenderScene);
