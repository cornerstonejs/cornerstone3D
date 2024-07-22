import {
  Enums,
  RenderingEngine,
  Types,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  addButtonToToolbar,
  addDropdownToToolbar,
  addSliderToToolbar,
  createImageIdsAndCacheMetaData,
  initDemo,
  setCtTransferFunctionForVolumeActor,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import vtkColorMaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_SAGITTAL_STACK';

// Define unique ids for the volumes
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const ctVolumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const ctVolumeId = `${volumeLoaderScheme}:${ctVolumeName}`; // VolumeId with loader id + volume id

// Define a unique id for the volume
const ptVolumeName = 'PT_VOLUME_ID';
const ptVolumeId = `${volumeLoaderScheme}:${ptVolumeName}`;

// ======== Set up page ======== //
setTitleAndDescription(
  'Change the colormap and adjusting the opacity',
  'Demonstrate how to interact with a fusion viewport, specifically by changing the colormap and adjusting the opacity.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);
// ============================= //

// Buttons

let fused = false;
let opacity = 0;
let renderingEngine;
let viewport;
addButtonToToolbar({
  title: 'toggle PET',
  onClick: async () => {
    if (fused) {
      viewport.removeVolumeActors([ptVolumeId], true);

      fused = false;
    } else {
      await viewport.addVolumes(
        [
          {
            volumeId: ptVolumeId,
          },
        ],
        true
      );

      viewport.setProperties(
        {
          colormap: {
            name: 'hsv',
            opacity: opacity,
          },
          voiRange: {
            upper: 5,
            lower: 0,
          },
        },
        ptVolumeId
      );
      fused = true;
    }
  },
});

addButtonToToolbar({
  title: 'Change Colomap',
  onClick: () => {
    const randomIndex = Math.floor(
      Math.random() * vtkColorMaps.rgbPresetNames.length
    );

    const colormapName = vtkColorMaps.rgbPresetNames[randomIndex];

    // Set the colormap of the fusion viewport by specifying the desired colormap name using the 'name' property inside the 'colormap' object.
    viewport.setProperties(
      {
        colormap: {
          name: colormapName,
        },
      },
      ptVolumeId
    );
    viewport.render();
  },
});
addSliderToToolbar({
  title: 'opacity',
  step: 1,
  range: [0, 255],
  defaultValue: 0,
  onSelectedValueChange: (value) => {
    opacity = Number(value) / 255;

    // Adjust the opacity of the colormap by specifying the desired opacity value and passing it inside the 'colormap' object.
    viewport.setProperties(
      {
        colormap: {
          opacity: opacity,
        },
      },
      ptVolumeId
    );
    viewport.render();
  },
});

addDropdownToToolbar({
  options: {
    values: ['axial', 'sagittal', 'coronal', 'acquisition'],
    defaultValue: 'axial',
  },
  onSelectedValueChange: (selectedValue) => {
    viewport.setOrientation(selectedValue as Enums.OrientationAxis);
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const wadoRsRoot = 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb';
  const StudyInstanceUID =
    '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';

  // Get Cornerstone imageIds and fetch metadata into RAM
  const ctImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot,
  });

  const ptImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
    wadoRsRoot,
  });

  // Instantiate a rendering engine

  // Init Cornerstone and related libraries

  const viewportInput = {
    viewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: Enums.OrientationAxis.AXIAL,
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.enableElement(viewportInput);

  viewport = <Types.IVolumeViewport>renderingEngine.getViewport(viewportId);

  // Define a volume in memory
  const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeId, {
    imageIds: ctImageIds,
  });

  // Set the volume to load
  ctVolume.load();

  // Set the volume on the viewport
  viewport.setVolumes([
    { volumeId: ctVolumeId, callback: setCtTransferFunctionForVolumeActor },
  ]);

  // Render the image
  renderingEngine.render();

  // Load the PT in the background as we know we'll need it

  // Define a volume in memory
  const ptVolume = await volumeLoader.createAndCacheVolume(ptVolumeId, {
    imageIds: ptImageIds,
  });

  // Set the volume to load
  ptVolume.load();

  // Set the volume to load
  ctVolume.load();
}
run();
