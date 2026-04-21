import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  Enums,
  RenderingEngine,
  imageLoader,
  utilities,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  addBrushSizeSlider,
  addDropdownToToolbar,
  addToggleButtonToToolbar,
  createImageIdsAndCacheMetaData,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import { getBooleanUrlParam } from '../../../../utils/demo/helpers/exampleParameters';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  getConfig as getToolsConfig,
  setConfig as setToolsConfig,
} from '../../src/config';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  BrushTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
  segmentation,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { MouseBindings, KeyboardBindings } = csToolsEnums;
const { ViewportType } = Enums;

const renderingEngineId = 'labelmapOverlapPlaygroundRenderingEngine';
const toolGroupId = 'LABELMAP_OVERLAP_PLAYGROUND_TOOLGROUP';
const segmentationId = 'LABELMAP_OVERLAP_PLAYGROUND_SEGMENTATION';
const volumeName = 'LABELMAP_OVERLAP_PLAYGROUND_VOLUME';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const volumeId = `${volumeLoaderScheme}:${volumeName}`;
const stackDataId = 'labelmap-overlap-next:stack';
const volumeDataId = 'labelmap-overlap-next:volume';
const stackRenderMode = getBooleanUrlParam('cpu') ? 'cpuImage' : 'vtkImage';
const volumeRenderMode = getBooleanUrlParam('cpu')
  ? 'cpuVolume'
  : 'vtkVolumeSlice';

const viewportIds = {
  STACK: 'OVERLAP_STACK',
  AXIAL: 'OVERLAP_AXIAL',
  SAGITTAL: 'OVERLAP_SAGITTAL',
  CORONAL: 'OVERLAP_CORONAL',
} as const;

const brushInstanceNames = {
  CircularBrush: 'OverlapCircularBrush',
  SphereBrush: 'OverlapSphereBrush',
  CircularEraser: 'OverlapCircularEraser',
  SphereEraser: 'OverlapSphereEraser',
};

const brushStrategies = {
  [brushInstanceNames.CircularBrush]: 'FILL_INSIDE_CIRCLE',
  [brushInstanceNames.SphereBrush]: 'FILL_INSIDE_SPHERE',
  [brushInstanceNames.CircularEraser]: 'ERASE_INSIDE_CIRCLE',
  [brushInstanceNames.SphereEraser]: 'ERASE_INSIDE_SPHERE',
};

function getNextExampleBackground(): Types.Point3 {
  return getBooleanUrlParam('cpu') ? [0, 0, 0] : [0, 0.2, 0];
}

const content = document.getElementById('content');

setTitleAndDescription(
  'Labelmap Overlap Playground',
  'Minimal overlap demo with a stack viewport on top and axial, sagittal, and coronal orthographic viewports below. Paint with segments 1-3 and toggle Allow Overlap to switch between overwrite-all and overlap editing.'
);

const instructions = document.createElement('p');
instructions.innerText = `
  URL options:
  - default: GPU rendering
  - ?cpu=true: CPU rendering

  Left Click: selected brush
  Middle Click: pan
  Right Click: zoom
  Mouse wheel or Alt + Left Drag: scroll

  Overlap editing defers segmentation writes until mouse up.
`;
content.append(instructions);

const viewportContainer = document.createElement('div');
viewportContainer.style.display = 'flex';
viewportContainer.style.flexDirection = 'column';
viewportContainer.style.gap = '12px';

const topRow = document.createElement('div');
topRow.style.display = 'flex';
topRow.style.flexDirection = 'row';
topRow.style.gap = '12px';

const bottomRow = document.createElement('div');
bottomRow.style.display = 'flex';
bottomRow.style.flexDirection = 'row';
bottomRow.style.gap = '12px';

function createViewportElement(width: string, height: string) {
  const viewportElement = document.createElement('div');
  viewportElement.style.width = width;
  viewportElement.style.height = height;
  viewportElement.oncontextmenu = (evt) => evt.preventDefault();
  return viewportElement;
}

const stackElement = createViewportElement('640px', '640px');
const axialElement = createViewportElement('420px', '420px');
const sagittalElement = createViewportElement('420px', '420px');
const coronalElement = createViewportElement('420px', '420px');

topRow.appendChild(stackElement);
bottomRow.appendChild(axialElement);
bottomRow.appendChild(sagittalElement);
bottomRow.appendChild(coronalElement);

viewportContainer.appendChild(topRow);
viewportContainer.appendChild(bottomRow);
content.appendChild(viewportContainer);

function setAllowOverlap(allowOverlap: boolean): void {
  const config = getToolsConfig();

  setToolsConfig({
    ...config,
    segmentation: {
      ...config.segmentation,
      overwriteMode: allowOverlap ? 'none' : 'all',
    },
  });
}

function setActiveBrush(toolName: string): void {
  const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

  if (!toolGroup) {
    return;
  }

  const currentTool = toolGroup.getActivePrimaryMouseButtonTool();
  if (currentTool && currentTool !== toolName) {
    toolGroup.setToolPassive(currentTool);
  }

  toolGroup.setToolActive(toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
}

async function addSegmentationToState(imageIds: string[]) {
  const labelmapImages = imageLoader.createAndCacheDerivedImages(imageIds);

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIds: labelmapImages.map((image) => image.imageId),
          referencedVolumeId: volumeId,
          referencedImageIds: imageIds,
        },
      },
      config: {
        label: 'Overlap Playground',
        segmentOrder: [1, 2, 3],
        segments: {
          1: { label: 'Segment 1' },
          2: { label: 'Segment 2' },
          3: { label: 'Segment 3' },
        },
      },
    },
  ]);
}

addDropdownToToolbar({
  labelText: 'Brush',
  options: {
    values: [
      brushInstanceNames.CircularBrush,
      brushInstanceNames.SphereBrush,
      brushInstanceNames.CircularEraser,
      brushInstanceNames.SphereEraser,
    ],
    labels: [
      'Circular Brush',
      'Sphere Brush',
      'Circular Eraser',
      'Sphere Eraser',
    ],
    defaultValue: brushInstanceNames.CircularBrush,
  },
  onSelectedValueChange: (toolName) => {
    setActiveBrush(String(toolName));
  },
});

addDropdownToToolbar({
  labelText: 'Segment',
  options: {
    values: ['1', '2', '3'],
    defaultValue: '1',
  },
  onSelectedValueChange: (segmentIndex) => {
    const value = Number(segmentIndex);
    segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, value);
  },
});

addBrushSizeSlider({
  toolGroupId,
  defaultValue: 25,
  range: [5, 60],
});

addToggleButtonToToolbar({
  title: 'Allow Overlap',
  defaultToggle: false,
  onClick: (toggle) => {
    setAllowOverlap(toggle);
  },
});

async function run() {
  await initDemo({
    tools: {
      segmentation: {
        overwriteMode: 'all',
      },
    },
  });

  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(BrushTool);

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addToolInstance(
    brushInstanceNames.CircularBrush,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies[brushInstanceNames.CircularBrush],
    }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.SphereBrush,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies[brushInstanceNames.SphereBrush],
    }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.CircularEraser,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies[brushInstanceNames.CircularEraser],
    }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.SphereEraser,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies[brushInstanceNames.SphereEraser],
    }
  );

  toolGroup.setToolActive(brushInstanceNames.CircularBrush, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary,
      },
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.Ctrl,
      },
    ],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary,
      },
    ],
  });
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel,
      },
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.Alt,
      },
    ],
  });

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  await volume.load();
  await addSegmentationToState(imageIds);

  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.setViewports([
    {
      viewportId: viewportIds.STACK,
      type: ViewportType.PLANAR_V2,
      element: stackElement,
      defaultOptions: {
        background: getNextExampleBackground(),
        renderMode: stackRenderMode,
      },
    },
    {
      viewportId: viewportIds.AXIAL,
      type: ViewportType.PLANAR_V2,
      element: axialElement,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: getNextExampleBackground(),
        renderMode: volumeRenderMode,
      },
    },
    {
      viewportId: viewportIds.SAGITTAL,
      type: ViewportType.PLANAR_V2,
      element: sagittalElement,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: getNextExampleBackground(),
        renderMode: volumeRenderMode,
      },
    },
    {
      viewportId: viewportIds.CORONAL,
      type: ViewportType.PLANAR_V2,
      element: coronalElement,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: getNextExampleBackground(),
        renderMode: volumeRenderMode,
      },
    },
  ]);

  Object.values(viewportIds).forEach((viewportId) => {
    toolGroup.addViewport(viewportId, renderingEngineId);
  });

  utilities.viewportNextDataSetMetadataProvider.add(stackDataId, {
    kind: 'planar',
    imageIds,
    initialImageIdIndex: Math.floor(imageIds.length / 2),
  });
  utilities.viewportNextDataSetMetadataProvider.add(volumeDataId, {
    kind: 'planar',
    imageIds,
    initialImageIdIndex: Math.floor(imageIds.length / 2),
    referencedId: volumeId,
    volumeId,
  });

  const stackViewport = renderingEngine.getViewport(
    viewportIds.STACK
  ) as PlanarViewport;
  await stackViewport.setDataList([
    {
      dataId: stackDataId,
      options: {
        renderMode: stackRenderMode,
      },
    },
  ]);

  const volumeViewportInputs = [
    {
      viewportId: viewportIds.AXIAL,
      orientation: Enums.OrientationAxis.AXIAL,
    },
    {
      viewportId: viewportIds.SAGITTAL,
      orientation: Enums.OrientationAxis.SAGITTAL,
    },
    {
      viewportId: viewportIds.CORONAL,
      orientation: Enums.OrientationAxis.CORONAL,
    },
  ];

  await Promise.all(
    volumeViewportInputs.map(async ({ viewportId, orientation }) => {
      const viewport = renderingEngine.getViewport(
        viewportId
      ) as PlanarViewport;

      await viewport.setDataList([
        {
          dataId: volumeDataId,
          options: {
            orientation,
            renderMode: volumeRenderMode,
          },
        },
      ]);
    })
  );

  await segmentation.addLabelmapRepresentationToViewportMap({
    [viewportIds.STACK]: [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        config: {
          useSliceRendering: true,
        },
      },
    ],
    [viewportIds.AXIAL]: [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        config: {
          useSliceRendering: true,
        },
      },
    ],
    [viewportIds.SAGITTAL]: [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        config: {
          useSliceRendering: true,
        },
      },
    ],
    [viewportIds.CORONAL]: [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        config: {
          useSliceRendering: true,
        },
      },
    ],
  });

  segmentation.config.style.setStyle(
    {
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
    {
      fillAlpha: 0.45,
      fillAlphaInactive: 0.45,
      renderFill: true,
      renderFillInactive: true,
      renderOutline: true,
      renderOutlineInactive: true,
      activeSegmentOutlineWidthDelta: 2,
    }
  );

  segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 1);
  renderingEngine.render();
}

run();
