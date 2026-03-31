import type { Types } from '@cornerstonejs/core';
import {
  Enums,
  RenderingEngine,
  imageLoader,
  setVolumesForViewports,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  addBrushSizeSlider,
  addDropdownToToolbar,
  addToggleButtonToToolbar,
  createImageIdsAndCacheMetaData,
  getExampleBackground,
  initDemo,
  setTitleAndDescription,
  setCtTransferFunctionForVolumeActor,
  setPetTransferFunctionForVolumeActor,
} from '../../../../utils/demo/helpers';
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

const renderingEngineId = 'petCtOverlapRenderingEngine';
const toolGroupId = 'PET_CT_OVERLAP_TOOLGROUP';
const segmentationId = 'PET_CT_OVERLAP_SEGMENTATION';

const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const ctVolumeId = `${volumeLoaderScheme}:CT_VOLUME`;
const ptVolumeId = `${volumeLoaderScheme}:PT_VOLUME`;

const wadoRsRoot = 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';
const StudyInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';

const viewportIds = {
  CT_AXIAL: 'CT_AXIAL',
  CT_SAGITTAL: 'CT_SAGITTAL',
  CT_CORONAL: 'CT_CORONAL',
  PT_AXIAL: 'PT_AXIAL',
  PT_SAGITTAL: 'PT_SAGITTAL',
  PT_CORONAL: 'PT_CORONAL',
} as const;

const brushInstanceNames = {
  CircularBrush: 'PetCtCircularBrush',
  SphereBrush: 'PetCtSphereBrush',
  CircularEraser: 'PetCtCircularEraser',
  SphereEraser: 'PetCtSphereEraser',
};

const brushStrategies = {
  [brushInstanceNames.CircularBrush]: 'FILL_INSIDE_CIRCLE',
  [brushInstanceNames.SphereBrush]: 'FILL_INSIDE_SPHERE',
  [brushInstanceNames.CircularEraser]: 'ERASE_INSIDE_CIRCLE',
  [brushInstanceNames.SphereEraser]: 'ERASE_INSIDE_SPHERE',
};

const content = document.getElementById('content');

setTitleAndDescription(
  'Labelmap Overlap PET-CT',
  'Segmentation drawn on CT (top row) is also displayed on PET (bottom row). Paint on either row and the labelmap updates on both.'
);

const instructions = document.createElement('p');
instructions.innerText = `
  Left Click: selected brush
  Middle Click: pan
  Right Click: zoom
  Mouse wheel or Alt + Left Drag: scroll
`;
content.append(instructions);

const viewportContainer = document.createElement('div');
viewportContainer.style.display = 'flex';
viewportContainer.style.flexDirection = 'column';
viewportContainer.style.gap = '4px';

function createLabel(text: string) {
  const label = document.createElement('div');
  label.innerText = text;
  label.style.fontWeight = 'bold';
  label.style.padding = '4px 0';
  return label;
}

function createRow() {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.flexDirection = 'row';
  row.style.gap = '4px';
  return row;
}

function createViewportElement(width: string, height: string) {
  const el = document.createElement('div');
  el.style.width = width;
  el.style.height = height;
  el.oncontextmenu = (evt) => evt.preventDefault();
  return el;
}

const size = '400px';

viewportContainer.appendChild(createLabel('CT'));
const ctRow = createRow();
const ctAxialEl = createViewportElement(size, size);
const ctSagittalEl = createViewportElement(size, size);
const ctCoronalEl = createViewportElement(size, size);
ctRow.appendChild(ctAxialEl);
ctRow.appendChild(ctSagittalEl);
ctRow.appendChild(ctCoronalEl);
viewportContainer.appendChild(ctRow);

viewportContainer.appendChild(createLabel('PET'));
const ptRow = createRow();
const ptAxialEl = createViewportElement(size, size);
const ptSagittalEl = createViewportElement(size, size);
const ptCoronalEl = createViewportElement(size, size);
ptRow.appendChild(ptAxialEl);
ptRow.appendChild(ptSagittalEl);
ptRow.appendChild(ptCoronalEl);
viewportContainer.appendChild(ptRow);

content.appendChild(viewportContainer);

// --- Toolbar ---

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
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    if (!toolGroup) {
      return;
    }
    const current = toolGroup.getActivePrimaryMouseButtonTool();
    if (current && current !== toolName) {
      toolGroup.setToolPassive(current);
    }
    toolGroup.setToolActive(String(toolName), {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  },
});

addDropdownToToolbar({
  labelText: 'Segment',
  options: {
    values: ['1', '2', '3'],
    defaultValue: '1',
  },
  onSelectedValueChange: (segmentIndex) => {
    segmentation.segmentIndex.setActiveSegmentIndex(
      segmentationId,
      Number(segmentIndex)
    );
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
    const config = getToolsConfig();
    setToolsConfig({
      ...config,
      segmentation: {
        ...config.segmentation,
        overwriteMode: toggle ? 'none' : 'all',
      },
    });
  },
});

// --- Main ---

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

  Object.entries(brushStrategies).forEach(([instanceName, strategy]) => {
    toolGroup.addToolInstance(instanceName, BrushTool.toolName, {
      activeStrategy: strategy,
    });
  });

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
      { mouseButton: MouseBindings.Wheel },
      { mouseButton: MouseBindings.Primary, modifierKey: KeyboardBindings.Alt },
    ],
  });

  // Load CT and PET image IDs
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

  // Create and load volumes
  const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeId, {
    imageIds: ctImageIds,
  });
  const ptVolume = await volumeLoader.createAndCacheVolume(ptVolumeId, {
    imageIds: ptImageIds,
  });

  ctVolume.load();
  ptVolume.load();

  // Create segmentation from CT image IDs
  const labelmapImages = imageLoader.createAndCacheDerivedImages(ctImageIds);

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIds: labelmapImages.map((img) => img.imageId),
          referencedVolumeId: ctVolumeId,
          referencedImageIds: ctImageIds,
        },
      },
      config: {
        label: 'PET-CT Segmentation',
        segmentOrder: [1, 2, 3],
        segments: {
          1: { label: 'Segment 1' },
          2: { label: 'Segment 2' },
          3: { label: 'Segment 3' },
        },
      },
    },
  ]);

  // Create rendering engine and viewports
  const renderingEngine = new RenderingEngine(renderingEngineId);
  const background = getExampleBackground() as Types.Point3;

  renderingEngine.setViewports([
    {
      viewportId: viewportIds.CT_AXIAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: ctAxialEl,
      defaultOptions: { orientation: Enums.OrientationAxis.AXIAL, background },
    },
    {
      viewportId: viewportIds.CT_SAGITTAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: ctSagittalEl,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background,
      },
    },
    {
      viewportId: viewportIds.CT_CORONAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: ctCoronalEl,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background,
      },
    },
    {
      viewportId: viewportIds.PT_AXIAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: ptAxialEl,
      defaultOptions: { orientation: Enums.OrientationAxis.AXIAL, background },
    },
    {
      viewportId: viewportIds.PT_SAGITTAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: ptSagittalEl,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background,
      },
    },
    {
      viewportId: viewportIds.PT_CORONAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: ptCoronalEl,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background,
      },
    },
  ]);

  // Add all viewports to the tool group
  Object.values(viewportIds).forEach((vpId) => {
    toolGroup.addViewport(vpId, renderingEngineId);
  });

  // CT row: CT volume only
  const ctViewportIds = [
    viewportIds.CT_AXIAL,
    viewportIds.CT_SAGITTAL,
    viewportIds.CT_CORONAL,
  ];
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId: ctVolumeId, callback: setCtTransferFunctionForVolumeActor }],
    ctViewportIds
  );

  // PET row: PET volume only
  const ptViewportIds = [
    viewportIds.PT_AXIAL,
    viewportIds.PT_SAGITTAL,
    viewportIds.PT_CORONAL,
  ];
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId: ptVolumeId, callback: setPetTransferFunctionForVolumeActor }],
    ptViewportIds
  );

  // Add segmentation to all viewports (CT and PET)
  const allViewportIds = [...ctViewportIds, ...ptViewportIds];
  const segRepMap: Record<string, any[]> = {};
  allViewportIds.forEach((vpId) => {
    segRepMap[vpId] = [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        config: {
          useImageMapper: true,
        },
      },
    ];
  });

  await segmentation.addLabelmapRepresentationToViewportMap(segRepMap);

  segmentation.config.style.setStyle(
    { type: csToolsEnums.SegmentationRepresentations.Labelmap },
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
