import type { Types } from '@cornerstonejs/core';
import {
  Enums,
  RenderingEngine,
  setVolumesForViewports,
  volumeLoader,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  addDropdownToToolbar,
  createImageIdsAndCacheMetaData,
  initDemo,
  setCtTransferFunctionForVolumeActor,
  setPetColorMapTransferFunctionForVolumeActor,
  setPetTransferFunctionForVolumeActor,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

const {
  CircleROITool,
  Enums: csToolsEnums,
  PanTool,
  RectangleROITool,
  StackScrollTool,
  ToolGroupManager,
  ZoomTool,
  measurementTargetFilters,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

const renderingEngineId = 'LEGACY_MULTI_VOLUME_MEASUREMENTS_ENGINE';
const singleVolumeToolGroupId =
  'LEGACY_MULTI_VOLUME_MEASUREMENTS_SINGLE_VOLUME_TOOL_GROUP';
const fusionToolGroupId = 'LEGACY_MULTI_VOLUME_MEASUREMENTS_FUSION_TOOL_GROUP';
const viewportIds = {
  ct: 'LEGACY_MEASUREMENTS_CT',
  pt: 'LEGACY_MEASUREMENTS_PT',
  fusion: 'LEGACY_MEASUREMENTS_FUSION',
};
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const ctVolumeId = `${volumeLoaderScheme}:LEGACY_MEASUREMENTS_CT_VOLUME`;
const ptVolumeId = `${volumeLoaderScheme}:LEGACY_MEASUREMENTS_PT_VOLUME`;
const orientation = Enums.OrientationAxis.AXIAL;
const roiToolNames = [RectangleROITool.toolName, CircleROITool.toolName];
const measurementTargetFilterOptions = {
  all: measurementTargetFilters.allPixelData,
  ct: measurementTargetFilters.forModality('CT'),
  pt: measurementTargetFilters.forModality('PT'),
};

let singleVolumeToolGroup;
let fusionToolGroup;

setTitleAndDescription(
  'Legacy Multi-Volume Measurements',
  'Three legacy VolumeViewports show the same CT/PT study as CT-only, PT-only, and fused PT/CT. The measurement-target dropdown changes only the fusion viewport, where an ROI can report HU, SUV, or both.'
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
  pt: createViewportPanel('PT only — SUV (inverted gray)', viewportIds.pt),
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
  id: 'roi-tool-select',
  labelText: 'ROI tool',
  options: {
    values: roiToolNames,
    defaultValue: RectangleROITool.toolName,
  },
  onSelectedValueChange: (selectedValue) => {
    setActiveROITool(String(selectedValue));
  },
});

addDropdownToToolbar({
  id: 'measurement-target-select',
  labelText: 'Fusion measurement targets',
  options: {
    values: Object.keys(measurementTargetFilterOptions),
    labels: ['All pixel data', 'CT only', 'PT only'],
    defaultValue: 'all',
  },
  onSelectedValueChange: (selectedValue) => {
    setMeasurementTargetFilter(String(selectedValue));
  },
});

function setActiveROITool(toolName: string): void {
  const toolGroups = [singleVolumeToolGroup, fusionToolGroup].filter(Boolean);
  if (!toolGroups.length) {
    return;
  }

  toolGroups.forEach((toolGroup) => {
    roiToolNames.forEach((roiToolName) => {
      toolGroup.setToolPassive(roiToolName);
    });
    toolGroup.setToolActive(toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  });
}

function setMeasurementTargetFilter(filterName: string): void {
  if (!fusionToolGroup) {
    return;
  }

  const targetsFilter =
    measurementTargetFilterOptions[
      filterName as keyof typeof measurementTargetFilterOptions
    ];
  if (!targetsFilter) {
    return;
  }

  roiToolNames.forEach((toolName) => {
    fusionToolGroup.setToolConfiguration(toolName, { targetsFilter });
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
      type: ViewportType.ORTHOGRAPHIC,
      element: viewportElements[key],
      defaultOptions: {
        orientation,
        background: (key === 'pt'
          ? [1, 1, 1]
          : [0.05, 0.05, 0.05]) as Types.Point3,
      },
    }))
  );

  cornerstoneTools.addTool(RectangleROITool);
  cornerstoneTools.addTool(CircleROITool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);

  singleVolumeToolGroup = ToolGroupManager.createToolGroup(
    singleVolumeToolGroupId
  );
  fusionToolGroup = ToolGroupManager.createToolGroup(fusionToolGroupId);

  [viewportIds.ct, viewportIds.pt].forEach((viewportId) => {
    singleVolumeToolGroup.addViewport(viewportId, renderingEngineId);
  });
  fusionToolGroup.addViewport(viewportIds.fusion, renderingEngineId);

  [singleVolumeToolGroup, fusionToolGroup].forEach((toolGroup) => {
    // The single-volume viewports always measure their displayed volume. The
    // dropdown changes only the fusion group's target filter.
    toolGroup.addTool(RectangleROITool.toolName, {
      targetsFilter: measurementTargetFilters.allPixelData,
    });
    toolGroup.addTool(CircleROITool.toolName, {
      targetsFilter: measurementTargetFilters.allPixelData,
    });
    toolGroup.addTool(StackScrollTool.toolName);
    toolGroup.addTool(PanTool.toolName);
    toolGroup.addTool(ZoomTool.toolName);

    toolGroup.setToolActive(StackScrollTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Wheel }],
    });
    toolGroup.setToolActive(PanTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Auxiliary }],
    });
    toolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Secondary }],
    });
  });

  setActiveROITool(RectangleROITool.toolName);

  const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeId, {
    imageIds: ctImageIds,
  });
  const ptVolume = await volumeLoader.createAndCacheVolume(ptVolumeId, {
    imageIds: ptImageIds,
  });
  ctVolume.load();
  ptVolume.load();

  await setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId: ctVolumeId,
        callback: setCtTransferFunctionForVolumeActor,
      },
    ],
    [viewportIds.ct]
  );
  await setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId: ptVolumeId,
        callback: setPetTransferFunctionForVolumeActor,
      },
    ],
    [viewportIds.pt]
  );
  await setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId: ctVolumeId,
        callback: setCtTransferFunctionForVolumeActor,
      },
      {
        volumeId: ptVolumeId,
        callback: setPetColorMapTransferFunctionForVolumeActor,
      },
    ],
    [viewportIds.fusion]
  );

  renderingEngine.renderViewports(Object.values(viewportIds));
}

run();
