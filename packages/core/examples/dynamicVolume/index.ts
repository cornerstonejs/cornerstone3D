import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
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
    const viewport = renderingEngine.getViewport(
      viewportId
    ) as Types.IVolumeViewport;

    viewport.setOrientation(selectedValue as Enums.OrientationAxis);
    viewport.render();
  },
});

function addFrameSlider(volume) {
  addSliderToToolbar({
    title: 'Frame Number',
    range: [1, volume.numFrames],
    defaultValue: 1,
    onSelectedValueChange: (value) => {
      const frameNumber = Number(value);
      volume.frameNumber = frameNumber;
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
    StudyInstanceUID: '2.25.79767489559005369769092179787138169587',
    SeriesInstanceUID: '2.25.87977716979310885152986847054790859463',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
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
      background: [0.2, 0, 0.2] as Types.Point3,
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the volume viewport that was created
  const viewport = renderingEngine.getViewport(
    viewportId
  ) as Types.IVolumeViewport;

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

  addFrameSlider(volume);

  // Set the volume on the viewport
  viewport.setVolumes([{ volumeId }]);

  // Render the image
  viewport.render();
}

run();
