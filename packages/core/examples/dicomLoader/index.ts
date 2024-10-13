import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  imageLoader,
  metaData,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  initDemo,
  setTitleAndDescription,
  addSliderToToolbar,
  addToggleButtonToToolbar,
} from '../../../../utils/demo/helpers';
import createCustomImageLoader from './customImageLoader';
import createImageDropArea from './imageDropArea';
import createLogArea from './logArea';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

// ======== Set up page ======== //
setTitleAndDescription(
  'Custom DICOM Image Loaders',
  'Demonstrates how to write a custom Image Loader for DICOMs'
);

const content = document.getElementById('content');

const { area: logArea, addLog } = createLogArea();

const {
  area: imageDropArea,
  setEmit,
  getInstanceBytes,
} = createImageDropArea(addLog);

const toolbar = document.createElement('div');
toolbar.id = 'toolbar';

const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content!.appendChild(logArea);
content!.appendChild(imageDropArea);
content!.appendChild(toolbar);
content!.appendChild(element);

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'STACK';

const { imageLoadFunction, metadataProvider } = createCustomImageLoader(
  addLog,
  getInstanceBytes
);

imageLoader.registerImageLoader(
  'custom',
  imageLoadFunction as unknown as Types.ImageLoaderFn
);

let sliderRemoveFn = () => {};
let renderingEngine: RenderingEngine;

function resetViewports(volume: boolean) {
  const viewportInputArray: Types.PublicViewportInput[] = [];
  if (!volume) {
    viewportInputArray.push({
      viewportId,
      type: ViewportType.STACK,
      element: element,
    });
  } else {
    viewportInputArray.push({
      viewportId,
      type: ViewportType.ORTHOGRAPHIC,
      element: element,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
      },
    });
  }
  renderingEngine.setViewports(viewportInputArray);
  renderImages();
}

let imageIds: string[] = [];

async function renderImages() {
  if (imageIds.length == 0) {
    return;
  }

  const viewport = renderingEngine.getViewport(viewportId) as
    | Types.IStackViewport
    | Types.IVolumeViewport;
  if ('setStack' in viewport) {
    viewport.setStack(imageIds);
  } else if ('setVolumes' in viewport) {
    // TODO: In the current version of Cornerstone, we need to load all
    // individual slices before we can load the volume.
    for (let i = 0; i < imageIds.length; ++i) {
      await imageLoader.loadImage(imageIds[i]);
    }

    const volumeId = `cornerstoneStreamingImageVolume:${imageIds[0]}`;
    const volume = (await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    })) as Types.IStreamingImageVolume;

    // Set the volume to load
    volume.load();

    viewport.setVolumes([{ volumeId }]);
  }

  sliderRemoveFn();
  if (imageIds.length > 1) {
    sliderRemoveFn = addSliderToToolbar({
      title: 'Slice Index',
      range: [0, imageIds.length - 1],
      defaultValue: 0,
      container: toolbar,
      onSelectedValueChange: (value) => {
        const valueAsNumber = Number(value);
        if ('setImageIdIndex' in viewport) {
          viewport.setImageIdIndex(valueAsNumber);
        }
        viewport.render();
      },
    });
  }
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  metaData.addProvider(metadataProvider, 10000);

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  addToggleButtonToToolbar({
    title: 'Toggle volume viewport',
    defaultToggle: false,
    container: toolbar,
    onClick: (toggle) => {
      resetViewports(toggle);
    },
  });

  resetViewports(false);

  // render stack viewport
  setEmit((sopInstanceUids) => {
    imageIds = sopInstanceUids.map((uid) => `custom:${uid}`);
    renderImages();
  });

  // render volume viewports
  renderingEngine.render();
}

run();
