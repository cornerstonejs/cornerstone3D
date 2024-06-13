import {
  RenderingEngine,
  Types,
  Enums,
  utilities,
  setUseCPURendering,
  volumeLoader,
} from '@cornerstonejs/core';
import * as csTools from '@cornerstonejs/tools';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addToggleButtonToToolbar,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';
import addDropDownToToolbar from '../../../../utils/demo/helpers/addDropdownToToolbar';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

// ======== Set up page ======== //
setTitleAndDescription(
  'Render to Canvas',
  'This example uses both viewportAPI and also simple renderToCanvas to render an image. The left viewport is using the viewportAPI and the right viewport is using renderToCanvas.'
);

const pixelSize = 500;
const devicePixelRatio = window.devicePixelRatio || 1;
const size = `${Math.round(pixelSize / devicePixelRatio)}px`;
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');
const volumeId = 'volumeId';
let viewport;
const viewportId = 'viewportId';

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const viewportTypes = new Map();

const element1 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;
element1.style.background = 'green';

const viewportInput = {
  viewportId,
  type: ViewportType.ORTHOGRAPHIC,
  element: element1,
  defaultOptions: {
    background: <Types.Point3>[0.2, 0, 0.2],
  },
};

let viewportType = {
  sliceIndex: null,
  viewportInputArray: [
    {
      ...viewportInput,
      type: ViewportType.STACK,
    },
  ],
};

viewportTypes.set('Stack', viewportType);
viewportTypes.set('Axial', {
  viewportInputArray: [
    {
      ...viewportInput,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0.2, 0.2, 0],
      },
    },
  ],
});
viewportTypes.set('Sagittal', {
  viewportInputArray: [
    {
      ...viewportInput,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ],
});
viewportTypes.set('Sagittal 2', {
  sliceIndex: 200,
  viewportInputArray: [
    {
      ...viewportInput,
      viewportId: 'Axial',
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0, 0, 0.2],
        sliceIndex: 200,
      },
    },
  ],
});
viewportTypes.set('Coronal', {
  viewportInputArray: [
    {
      ...viewportInput,
      viewportId: 'Axial',
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0, 0.2, 0],
      },
    },
  ],
});

const canvas = document.createElement('canvas');

canvas.width = pixelSize;
canvas.height = pixelSize;

viewportGrid.appendChild(element1);
viewportGrid.appendChild(canvas);

content.appendChild(viewportGrid);

// ============================= //
let load;
let useCPURendering = false;

addToggleButtonToToolbar({
  id: 'cpuRendering',
  title: 'CPU Rendering',
  defaultToggle: false,
  onClick: (toggle) => {
    if (toggle) {
      setUseCPURendering(true);
      useCPURendering = true;
    } else {
      setUseCPURendering(false);
      useCPURendering = false;
    }
  },
});

addDropDownToToolbar({
  options: {
    map: viewportTypes,
  },
  onSelectedValueChange: (_key, value) => {
    viewportType = value;
  },
});

addButtonToToolbar({
  id: 'load',
  title: 'Load',
  onClick: () => {
    load();
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Create a stack viewport

  load = async () => {
    if (viewport) {
      renderingEngine.disableElement(viewport.id);
      viewport = null;
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }
    const { viewportInputArray, sliceIndex } = viewportType;
    renderingEngine.setViewports(viewportInputArray as any);

    const [viewportInputData] = viewportInputArray;
    const { viewportId, type } = viewportInputData;
    const isStack = type === ViewportType.STACK;

    if (isStack) {
      const imageId = imageIds[100];

      utilities.loadImageToCanvas({
        canvas,
        imageId,
        useCPURendering,
        renderingEngineId,
      });

      // To simulate a delay in loading the image since the loading
      // mechanisms are different for the two viewports
      setTimeout(async () => {
        // Get the stack viewport that was created
        const viewport = renderingEngine.getViewport(viewportId);
        await (viewport as unknown as Types.IStackViewport).setStack(
          [imageId],
          0
        );
        viewport.resetCamera();
        viewport.render();
      }, 200);
    } else {
      // Get the stack viewport that was created
      const viewport = <Types.IVolumeViewport>(
        renderingEngine.getViewport(viewportId)
      );
      await viewport.setVolumes([{ volumeId }]);
      if (sliceIndex !== undefined) {
        await csTools.utilities.jumpToSlice(viewport.element, {
          imageIndex: sliceIndex,
        });
      }
      volume.load();
      viewport.render();
      setTimeout(() => {
        utilities.loadImageToCanvas({
          canvas,
          imageId: null,
          viewReference: viewport.getViewReference(),
          renderingEngineId,
          viewportOptions: viewportInputData.defaultOptions,
        });
      }, 2000);
    }
  };
}

run();
