import {
  RenderingEngine,
  Types,
  Enums,
  volumeLoader,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setPetTransferFunctionForVolumeActor,
  addSliderToToolbar,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'PT_4D_VOLUME';
const orientations = [
  Enums.OrientationAxis.AXIAL,
  Enums.OrientationAxis.SAGITTAL,
  Enums.OrientationAxis.CORONAL,
];

const description = [
  'Displays a 4D DICOM series in a Volume viewport.',
  'DataSet: PET 255 x 255 images / 40 time points / 235 images per time point / 9,400 images total',
].join('\n');

// ======== Set up page ======== //
setTitleAndDescription('Volume 4D', description);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);
// ============================= //

addDropdownToToolbar({
  options: {
    values: orientations,
    defaultValue: orientations[0],
  },
  onSelectedValueChange: (selectedValue) => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the volume viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );

    viewport.setOrientation(<Enums.OrientationAxis>selectedValue);
    viewport.render();
  },
});

function addTimePointSlider(volume) {
  addSliderToToolbar({
    title: 'Time Point',
    range: [0, volume.numTimePoints - 1],
    defaultValue: 0,
    onSelectedValueChange: (value) => {
      const timePointIndex = Number(value);
      volume.timePointIndex = timePointIndex;
    },
  });
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.12842.1.1.14.3.20220915.105557.468.2963630849',
    SeriesInstanceUID:
      '1.3.6.1.4.1.12842.1.1.22.4.20220915.124758.560.4125514885',
    wadoRsRoot: 'https://d28o5kq0jsoob5.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportInput = {
    viewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: Enums.OrientationAxis.ACQUISITION,
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the volume viewport that was created
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId)
  );

  // Define a unique id for the volume
  const volumeName = 'PT_VOLUME_ID'; // Id of the volume less loader prefix
  const volumeLoaderScheme = 'cornerstoneStreamingDynamicImageVolume'; // Loader id which defines which volume loader to use
  const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Set the volume to load
  volume.load();

  addTimePointSlider(volume);

  // Set the volume on the viewport
  viewport.setVolumes([
    { volumeId, callback: setPetTransferFunctionForVolumeActor },
  ]);

  // Render the image
  viewport.render();
}

run();
