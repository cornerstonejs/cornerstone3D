import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  utilities,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
  addSliderToToolbar,
  ctVoiRange,
} from '../../../../utils/demo/helpers';
import { getBooleanUrlParam } from '../../../../utils/demo/helpers/exampleParameters';
import * as cornerstoneTools from '@cornerstonejs/tools';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  BrushTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
} = cornerstoneTools;

const { MouseBindings, KeyboardBindings } = csToolsEnums;
const { ViewportType } = Enums;

const volumeName = 'CT_VOLUME_ID';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const volumeId = `${volumeLoaderScheme}:${volumeName}`;
const segmentationId = 'MY_SEGMENTATION_ID';
const toolGroupId = 'MY_TOOLGROUP_ID';
const dataId = 'labelmap-slice-rendering-tools-next:source';
const volumeRenderMode = getBooleanUrlParam('cpu')
  ? 'cpuVolume'
  : 'vtkVolumeSlice';

function getNextExampleBackground(): Types.Point3 {
  return getBooleanUrlParam('cpu') ? [0, 0, 0] : [0, 0.2, 0];
}

setTitleAndDescription(
  'Labelmap Slice Rendering Tools (useSliceRendering)',
  'Demonstrates sphere brush painting with useSliceRendering enabled.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
const element3 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;
element3.style.width = size;
element3.style.height = size;

element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();
element3.oncontextmenu = (e) => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  Left Click: Use selected Segmentation Tool.
  Middle Click: Pan
  Right Click: Zoom
  Mouse wheel: Scroll Stack
  `;

content.append(instructions);

const brushInstanceNames = {
  CircularBrush: 'CircularBrush',
  SphereBrush: 'SphereBrush',
};

const brushStrategies = {
  [brushInstanceNames.CircularBrush]: 'FILL_INSIDE_CIRCLE',
  [brushInstanceNames.SphereBrush]: 'FILL_INSIDE_SPHERE',
};

addDropdownToToolbar({
  options: {
    values: [brushInstanceNames.CircularBrush, brushInstanceNames.SphereBrush],
    defaultValue: brushInstanceNames.CircularBrush,
  },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const name = String(nameAsStringOrNumber);
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    const toolName = toolGroup.getActivePrimaryMouseButtonTool();

    if (toolName) {
      toolGroup.setToolDisabled(toolName);
    }

    toolGroup.setToolActive(name, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  },
});

addSliderToToolbar({
  title: 'Brush Size',
  range: [5, 50],
  defaultValue: 25,
  onSelectedValueChange: (valueAsStringOrNumber) => {
    const value = Number(valueAsStringOrNumber);
    cornerstoneTools.utilities.segmentation.setBrushSizeForToolGroup(
      toolGroupId,
      value
    );
  },
});

async function run() {
  await initDemo();

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
    { activeStrategy: brushStrategies.CircularBrush }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.SphereBrush,
    BrushTool.toolName,
    { activeStrategy: brushStrategies.SphereBrush }
  );

  toolGroup.setToolActive(brushInstanceNames.CircularBrush, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      { mouseButton: MouseBindings.Auxiliary },
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.Ctrl,
      },
    ],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  });
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
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

  volume.load();

  volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: segmentationId,
  });

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          volumeId: segmentationId,
        },
      },
    },
  ]);

  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);
  const viewportInputs = [
    {
      viewportId: 'CT_AXIAL',
      orientation: Enums.OrientationAxis.AXIAL,
      element: element1,
    },
    {
      viewportId: 'CT_SAGITTAL',
      orientation: Enums.OrientationAxis.SAGITTAL,
      element: element2,
    },
    {
      viewportId: 'CT_CORONAL',
      orientation: Enums.OrientationAxis.CORONAL,
      element: element3,
    },
  ];

  renderingEngine.setViewports(
    viewportInputs.map(({ viewportId, orientation, element }) => ({
      viewportId,
      type: ViewportType.PLANAR_V2,
      element,
      defaultOptions: {
        orientation,
        background: getNextExampleBackground(),
        renderMode: volumeRenderMode,
      },
    }))
  );

  viewportInputs.forEach(({ viewportId }) => {
    toolGroup.addViewport(viewportId, renderingEngineId);
  });

  utilities.viewportNextDataSetMetadataProvider.add(dataId, {
    kind: 'planar',
    imageIds,
    initialImageIdIndex: Math.floor(imageIds.length / 2),
    referencedId: volumeId,
    volumeId,
  });

  await Promise.all(
    viewportInputs.map(async ({ viewportId, orientation }) => {
      const viewport = renderingEngine.getViewport(
        viewportId
      ) as PlanarViewport;

      await viewport.setDataList([
        {
          dataId,
          options: {
            orientation,
            renderMode: volumeRenderMode,
          },
        },
      ]);
      viewport.setDataPresentation(dataId, { voiRange: ctVoiRange });
    })
  );

  const segmentationRepresentation = {
    segmentationId,
    type: csToolsEnums.SegmentationRepresentations.Labelmap,
    config: {
      useSliceRendering: true,
    },
  };

  await segmentation.addLabelmapRepresentationToViewportMap({
    CT_AXIAL: [segmentationRepresentation],
    CT_SAGITTAL: [segmentationRepresentation],
    CT_CORONAL: [segmentationRepresentation],
  });

  renderingEngine.render();
}

run();
