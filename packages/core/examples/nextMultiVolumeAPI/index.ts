import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  utilities,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addDropdownToToolbar,
  addSliderToToolbar,
  ctVoiRange,
} from '../../../../utils/demo/helpers';
import { getBooleanUrlParam } from '../../../../utils/demo/helpers/exampleParameters';

const {
  PanTool,
  ZoomTool,
  StackScrollTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;
const { MouseBindings } = csToolsEnums;

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_SAGITTAL_STACK_NEXT';
const toolGroupId = 'myToolGroupNext';
const ctDataId = 'multi-volume-api-next:ct';
const ptDataId = 'multi-volume-api-next:pt';
const defaultOrientation = Enums.OrientationAxis.SAGITTAL;
const planarRenderMode = getBooleanUrlParam('cpu')
  ? 'cpuVolume'
  : 'vtkVolumeSlice';

const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const ctVolumeName = 'CT_VOLUME_ID_NEXT';
const ctVolumeId = `${volumeLoaderScheme}:${ctVolumeName}`;
const ptVolumeName = 'PT_VOLUME_ID_NEXT';
const ptVolumeId = `${volumeLoaderScheme}:${ptVolumeName}`;
const PET_DEFAULT_OPACITY = getDefaultPetOpacity();

function getNextExampleBackground(): Types.Point3 {
  return getBooleanUrlParam('cpu') ? [0, 0, 0] : [0, 0.2, 0];
}

function getViewport(): PlanarViewport {
  return getRenderingEngine(renderingEngineId).getViewport(
    viewportId
  ) as PlanarViewport;
}

function updatePetColormap(patch: {
  name?: string;
  opacity?: number;
  threshold?: number;
}) {
  const viewport = getViewport();
  const currentColormap =
    viewport.getDataPresentation(ptDataId)?.colormap || {};

  viewport.setDataPresentation(ptDataId, {
    colormap: {
      ...currentColormap,
      ...patch,
    },
  });
  viewport.render();
}

setTitleAndDescription(
  'Multi Volume ViewportNext API',
  'Demonstrates fused CT/PT rendering using the clean Planar ViewportNext multi-dataset API.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const eventDetailsElement = document.createElement('div');
eventDetailsElement.id = 'event-details';
eventDetailsElement.style.margin = '10px';
eventDetailsElement.style.padding = '10px';
eventDetailsElement.style.border = '1px solid #ccc';
eventDetailsElement.style.backgroundColor = '#f8f8f8';
eventDetailsElement.style.fontFamily = 'monospace';
eventDetailsElement.style.maxHeight = '150px';
eventDetailsElement.style.overflow = 'auto';
eventDetailsElement.innerText = 'Colormap modification events will appear here';

content.appendChild(eventDetailsElement);

addSliderToToolbar({
  title: 'Opacity',
  range: [0, 1],
  step: 0.05,
  defaultValue: PET_DEFAULT_OPACITY,
  onSelectedValueChange: (value) => {
    updatePetColormap({
      opacity: Number(value),
    });
  },
});

addSliderToToolbar({
  title: 'PET Threshold',
  range: [0, 5],
  step: 0.1,
  defaultValue: 0,
  onSelectedValueChange: (value) => {
    const threshold = Number(value);

    updatePetColormap({
      threshold: threshold > 0 ? threshold : undefined,
    });
  },
});

addButtonToToolbar({
  title: 'Set CT VOI Range',
  onClick: () => {
    const viewport = getViewport();

    viewport.setDataPresentation(ctDataId, {
      voiRange: { lower: -1500, upper: 2500 },
    });
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Reset Viewport',
  onClick: () => {
    const viewport = getViewport();

    viewport.resetCamera();
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'toggle PET',
  onClick: () => {
    const viewport = getViewport();
    const visible = viewport.getDataPresentation(ptDataId)?.visible ?? true;

    viewport.setDataPresentation(ptDataId, {
      visible: !visible,
    });
    viewport.render();
  },
});

const orientationOptions = {
  axial: 'axial',
  sagittal: 'sagittal',
  coronal: 'coronal',
  oblique: 'oblique',
};

addDropdownToToolbar({
  options: {
    values: ['axial', 'sagittal', 'coronal', 'oblique'],
    defaultValue: 'sagittal',
  },
  onSelectedValueChange: (selectedValue) => {
    const viewport = getViewport();

    switch (selectedValue) {
      case orientationOptions.axial:
        viewport.setOrientation(Enums.OrientationAxis.AXIAL);
        break;
      case orientationOptions.sagittal:
        viewport.setOrientation(Enums.OrientationAxis.SAGITTAL);
        break;
      case orientationOptions.coronal:
        viewport.setOrientation(Enums.OrientationAxis.CORONAL);
        break;
      case orientationOptions.oblique:
        viewport.setViewState({
          orientation: {
            viewUp: [
              -0.5962687530844388, 0.5453181550345819, -0.5891448751239446,
            ],
            viewPlaneNormal: [
              -0.5962687530844388, 0.5453181550345819, -0.5891448751239446,
            ],
          },
        });
        viewport.resetCamera();
        break;
    }

    viewport.render();
  },
});

function addColormapEventListener() {
  element.addEventListener(Enums.Events.COLORMAP_MODIFIED, function (event) {
    const { volumeId, colormap } = event.detail;

    if (volumeId === ptVolumeId) {
      const opacity = colormap.opacity;
      const threshold = colormap.threshold;
      const opacityToUse = Array.isArray(opacity)
        ? opacity.reduce((max, current) => Math.max(max, current.opacity), 0)
        : opacity;

      const details: Record<string, string> = {
        type: 'Colormap Modified',
        volumeId,
        opacity: opacityToUse.toFixed(2),
        timestamp: new Date().toLocaleTimeString(),
      };

      if (typeof threshold === 'number') {
        details.threshold = threshold.toFixed(2);
      }

      eventDetailsElement.innerText = JSON.stringify(details, null, 2);
    }
  });
}

async function run() {
  await initDemo();

  const wadoRsRoot = 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';
  const StudyInstanceUID =
    '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';

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

  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.PLANAR_NEXT,
    element,
    defaultOptions: {
      orientation: defaultOrientation,
      background: getNextExampleBackground(),
      renderMode: planarRenderMode,
    },
  });

  const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  toolGroup.addViewport(viewportId, renderingEngineId);

  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);

  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      { mouseButton: MouseBindings.Primary },
      { mouseButton: MouseBindings.Wheel },
    ],
  });
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Auxiliary }],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  });

  element.addEventListener('contextmenu', (e) => e.preventDefault());

  addColormapEventListener();

  utilities.viewportNextDataSetMetadataProvider.add(ctDataId, {
    imageIds: ctImageIds,
    kind: 'planar',
    initialImageIdIndex: Math.floor(ctImageIds.length / 2),
    referencedId: ctVolumeId,
    volumeId: ctVolumeId,
  });
  utilities.viewportNextDataSetMetadataProvider.add(ptDataId, {
    imageIds: ptImageIds,
    kind: 'planar',
    initialImageIdIndex: Math.floor(ptImageIds.length / 2),
    referencedId: ptVolumeId,
    volumeId: ptVolumeId,
  });

  await viewport.setDataList([
    {
      dataId: ctDataId,
      options: {
        orientation: defaultOrientation,
        renderMode: planarRenderMode,
      },
    },
    {
      dataId: ptDataId,
      options: {
        orientation: defaultOrientation,
        renderMode: planarRenderMode,
      },
    },
  ]);

  viewport.setDataPresentation(ctDataId, {
    voiRange: ctVoiRange,
  });
  viewport.setDataPresentation(ptDataId, {
    colormap: {
      name: 'hsv',
      opacity: PET_DEFAULT_OPACITY,
    },
  });

  viewport.render();
}

run();

function getDefaultPetOpacity(): number {
  return getBooleanUrlParam('cpu') ? 0.4 : 0.4;
}
