import type { PlanarViewport, Types } from '@cornerstonejs/core';
import { RenderingEngine, Enums, utilities } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  addDropdownToToolbar,
  createImageIdsAndCacheMetaData,
  ctVoiRange,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

const {
  CircleROITool,
  PanTool,
  RectangleROITool,
  StackScrollTool,
  ToolGroupManager,
  ZoomTool,
  Enums: csToolsEnums,
  measurementTargetFilters,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

const renderingEngineId = 'GENERIC_MULTI_VOLUME_MEASUREMENTS_ENGINE';
const toolGroupId = 'GENERIC_MULTI_VOLUME_MEASUREMENTS_TOOL_GROUP';
const viewportIds = {
  ct: 'GENERIC_MEASUREMENTS_CT',
  pt: 'GENERIC_MEASUREMENTS_PT',
  fusion: 'GENERIC_MEASUREMENTS_FUSION',
};
const ctDataId = 'generic-measurements:ct';
const ptDataId = 'generic-measurements:pt';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const ctVolumeId = `${volumeLoaderScheme}:GENERIC_MEASUREMENTS_CT_VOLUME`;
const ptVolumeId = `${volumeLoaderScheme}:GENERIC_MEASUREMENTS_PT_VOLUME`;
const orientation = Enums.OrientationAxis.AXIAL;
const roiToolNames = [RectangleROITool.toolName, CircleROITool.toolName];

let toolGroup;

setTitleAndDescription(
  'Generic Multi-Volume Measurements',
  'Three Planar GenericViewports show the same CT/PT study as CT-only, PT-only, and fused PT/CT. Draw an ROI in any viewport: single-volume viewports display one result, while the fused viewport computes and displays both HU and SUV statistics.'
);

const content = document.getElementById('content');
const viewportGrid = document.createElement('div');
viewportGrid.style.display = 'grid';
viewportGrid.style.gridTemplateColumns = 'repeat(3, minmax(300px, 1fr))';
viewportGrid.style.gap = '12px';
viewportGrid.style.width = '95vw';
viewportGrid.style.maxWidth = '1320px';

function createViewportPanel(
  title: string,
  viewportId: string
): HTMLDivElement {
  const panel = document.createElement('div');
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.gap = '4px';

  const heading = document.createElement('strong');
  heading.innerText = title;
  heading.style.textAlign = 'center';
  panel.appendChild(heading);

  const element = document.createElement('div');
  element.id = viewportId;
  element.style.width = '100%';
  element.style.height = '400px';
  element.style.background = '#000';
  element.oncontextmenu = () => false;
  panel.appendChild(element);

  return panel;
}

const panels = {
  ct: createViewportPanel('CT only — HU', viewportIds.ct),
  pt: createViewportPanel('PT only — SUV', viewportIds.pt),
  fusion: createViewportPanel('PT/CT fusion — HU + SUV', viewportIds.fusion),
};

viewportGrid.appendChild(panels.ct);
viewportGrid.appendChild(panels.pt);
viewportGrid.appendChild(panels.fusion);
content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText =
  'Left drag: draw ROI · Mouse wheel: scroll · Middle drag: pan · Right drag: zoom';
content.appendChild(instructions);

addDropdownToToolbar({
  options: {
    values: roiToolNames,
    defaultValue: RectangleROITool.toolName,
  },
  onSelectedValueChange: (selectedValue) => {
    setActiveROITool(String(selectedValue));
  },
});

function setActiveROITool(toolName: string): void {
  if (!toolGroup) {
    return;
  }

  roiToolNames.forEach((roiToolName) => {
    toolGroup.setToolPassive(roiToolName);
  });
  toolGroup.setToolActive(toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
}

async function run(): Promise<void> {
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

  utilities.genericViewportDisplaySetMetadataProvider.add(ctDataId, {
    imageIds: ctImageIds,
    initialImageIdIndex: Math.floor(ctImageIds.length / 2),
    kind: 'planar',
    volumeId: ctVolumeId,
  });
  utilities.genericViewportDisplaySetMetadataProvider.add(ptDataId, {
    imageIds: ptImageIds,
    initialImageIdIndex: Math.floor(ptImageIds.length / 2),
    kind: 'planar',
    volumeId: ptVolumeId,
  });

  const renderingEngine = new RenderingEngine(renderingEngineId);
  const viewportElements = {
    ct: panels.ct.querySelector(`#${viewportIds.ct}`) as HTMLDivElement,
    pt: panels.pt.querySelector(`#${viewportIds.pt}`) as HTMLDivElement,
    fusion: panels.fusion.querySelector(
      `#${viewportIds.fusion}`
    ) as HTMLDivElement,
  };

  renderingEngine.setViewports(
    Object.entries(viewportIds).map(([key, viewportId]) => ({
      viewportId,
      type: ViewportType.PLANAR_NEXT,
      element: viewportElements[key],
      defaultOptions: {
        orientation,
        background: [0.05, 0.05, 0.05] as Types.Point3,
      },
    }))
  );

  cornerstoneTools.addTool(RectangleROITool);
  cornerstoneTools.addTool(CircleROITool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);

  toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  Object.values(viewportIds).forEach((viewportId) => {
    toolGroup.addViewport(viewportId, renderingEngineId);
  });

  // The same configuration produces one target on CT/PT-only viewports and
  // two targets on the fused viewport because it selects every displayed
  // pixel-data volume.
  toolGroup.addTool(RectangleROITool.toolName, {
    targetsFilter: measurementTargetFilters.allPixelData,
  });
  toolGroup.addTool(CircleROITool.toolName, {
    targetsFilter: measurementTargetFilters.allPixelData,
  });
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);

  setActiveROITool(RectangleROITool.toolName);
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Auxiliary }],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  });

  const ctViewport = renderingEngine.getViewport<PlanarViewport>(
    viewportIds.ct
  );
  const ptViewport = renderingEngine.getViewport<PlanarViewport>(
    viewportIds.pt
  );
  const fusionViewport = renderingEngine.getViewport<PlanarViewport>(
    viewportIds.fusion
  );

  // Load single-volume viewports first so the fused viewport reuses the same
  // cached CT/PT volumes when it mounts both display sets.
  await ctViewport.setDisplaySets({
    displaySetId: ctDataId,
    options: { orientation },
  });
  await ptViewport.setDisplaySets({
    displaySetId: ptDataId,
    options: { orientation },
  });
  await fusionViewport.setDisplaySets(
    {
      displaySetId: ctDataId,
      options: { orientation },
    },
    {
      displaySetId: ptDataId,
      options: { orientation },
    }
  );

  ctViewport.setDisplaySetPresentation(ctDataId, { voiRange: ctVoiRange });
  ptViewport.setDisplaySetPresentation(ptDataId, {
    colormap: { name: 'hsv', opacity: 1 },
  });
  fusionViewport.setDisplaySetPresentation(ctDataId, {
    voiRange: ctVoiRange,
  });
  fusionViewport.setDisplaySetPresentation(ptDataId, {
    colormap: { name: 'hsv', opacity: 0.5 },
  });

  renderingEngine.renderViewports(Object.values(viewportIds));
}

run();
