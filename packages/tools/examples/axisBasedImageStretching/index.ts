import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  ProgressiveRetrieveImages,
  utilities,
  getRenderingEngine,
  getEffectiveRenderBackend,
  setRenderBackend,
  viewportProjection,
  displaySetRegistry,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
  addSliderToToolbar,
  addButtonToToolbar,
  addManipulationBindings,
  annotationTools,
  contourTools,
  labelmapTools,
  addCheckboxToToolbar,
} from '../../../../utils/demo/helpers';
import { ctPresentation } from '../../../../utils/demo/helpers/volumePresentationRecipes';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  utilities: cstUtils,
  CrosshairsTool,
  PlanarRotateTool,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;
const { segmentation: segmentationUtils } = cstUtils;

// Combined tool map: annotationTools first, then labelmapTools, then contourTools
const toolMap = new Map(annotationTools);
for (const [key, value] of labelmapTools.toolMap) {
  toolMap.set(key, value);
}
for (const [key, value] of contourTools.toolMap) {
  toolMap.set(key, value);
}
toolMap.set(PlanarRotateTool.toolName, { tool: PlanarRotateTool });

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const segmentationId = 'MY_SEGMENTATION_ID';
const stackToolGroupId = 'STACK_TOOLGROUP_ID';
const volumeToolGroupId = 'VOLUME_TOOLGROUP_ID';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`;
const stackDisplaySetId = 'axisBasedImageStretching:stack';
const volumeDisplaySetId = 'axisBasedImageStretching:volume';
const renderingEngineId = 'myRenderingEngine';
const stackViewportId = 'CT_STACK';
const axialViewportId = 'CT_AXIAL';
const sagittalViewportId = 'CT_SAGITTAL';
const coronalViewportId = 'CT_CORONAL';
const volumeViewportIds = [
  axialViewportId,
  sagittalViewportId,
  coronalViewportId,
];
const allViewportIds = [stackViewportId, ...volumeViewportIds];
const params = new URLSearchParams(window.location.search);
const useCpu = params.get('useCpu') === 'true';
const activeViewportIds = useCpu ? [stackViewportId] : allViewportIds;
const activeToolGroupIds = useCpu
  ? [stackToolGroupId]
  : [stackToolGroupId, volumeToolGroupId];

// ======== Set up page ======== //
setTitleAndDescription(
  'Axis-based Image Stretching',
  'Here we demonstrate axis based stretching with annotation and segmentation tools'
);

const size = '49%';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';
viewportGrid.style.flexWrap = 'wrap';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
const element3 = document.createElement('div');
const element4 = document.createElement('div');
element1.style.width = size;
element1.style.height = '500px';
element2.style.width = size;
element2.style.height = '500px';
element3.style.width = size;
element3.style.height = '500px';
element4.style.width = size;
element4.style.height = '500px';

if (useCpu) {
  element1.style.width = '100%';
  element2.style.display = 'none';
  element3.style.display = 'none';
  element4.style.display = 'none';
}

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();
element3.oncontextmenu = (e) => e.preventDefault();
element4.oncontextmenu = (e) => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);
viewportGrid.appendChild(element4);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  Left Click: Use selected Tool.
  Ctrl + Left Click (MPR only, GPU mode): Crosshairs
  Middle Click: Pan
  Right Click: Zoom
  Mouse wheel: Scroll Stack
  Shift Left Click: Zoom
  Alt Left Click: Stack Scroll
  CPU mode hides MPR viewports and defaults to Length.
  GPU mode enables MPR + segmentation + crosshairs.
  `;

content.append(instructions);

if (useCpu) {
  for (const [key] of labelmapTools.toolMap) {
    toolMap.delete(key);
  }
  for (const [key] of contourTools.toolMap) {
    toolMap.delete(key);
  }
}

const defaultTool = useCpu ? 'Length' : 'CircularBrush';
const renderModes = ['GPU Rendering', 'CPU Rendering'];

// ============================= //
addDropdownToToolbar({
  id: 'renderingPipeline',
  labelText: 'Rendering',
  options: {
    values: renderModes,
    defaultValue: useCpu ? renderModes[1] : renderModes[0],
  },
  onSelectedValueChange: (selectedValue) => {
    const shouldUseCPU = selectedValue === renderModes[1];

    if (shouldUseCPU === (getEffectiveRenderBackend() === 'cpu')) {
      return;
    }

    params.set('useCpu', String(shouldUseCPU));
    window.location.search = params.toString();
  },
});

addDropdownToToolbar({
  options: { map: toolMap, defaultValue: defaultTool },
  onSelectedValueChange: (newSelectedToolName) => {
    activeToolGroupIds.forEach((toolGroupId) => {
      const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
      if (!toolGroup || !toolGroup.hasTool(newSelectedToolName as string)) {
        return;
      }

      const selectedToolName = toolGroup.getActivePrimaryMouseButtonTool();
      if (selectedToolName && selectedToolName !== CrosshairsTool.toolName) {
        toolGroup.setToolPassive(selectedToolName);
      }

      toolGroup.setToolActive(newSelectedToolName as string, {
        bindings: [{ mouseButton: MouseBindings.Primary }],
      });
    });
  },
});

const thresholdOptions = new Map<string, any>();
thresholdOptions.set('CT Fat: (-150, -70)', {
  threshold: [-150, -70],
});
thresholdOptions.set('CT Bone: (200, 1000)', {
  threshold: [200, 1000],
});

addDropdownToToolbar({
  options: {
    values: Array.from(thresholdOptions.keys()),
    defaultValue: Array.from(thresholdOptions.keys())[0],
  },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const name = String(nameAsStringOrNumber);

    const thresholdArgs = thresholdOptions.get(name);

    activeToolGroupIds.forEach((toolGroupId) =>
      segmentationUtils.setBrushThresholdForToolGroup(toolGroupId, {
        range: thresholdArgs.threshold,
        isDynamic: false,
        dynamicRadius: null,
      })
    );
  },
});

addSliderToToolbar({
  title: 'Brush Size',
  range: [5, 50],
  defaultValue: 25,
  onSelectedValueChange: (valueAsStringOrNumber) => {
    const value = Number(valueAsStringOrNumber);
    activeToolGroupIds.forEach((toolGroupId) =>
      segmentationUtils.setBrushSizeForToolGroup(toolGroupId, value)
    );
  },
});

let isFitViewportAfterStretch = true;
addCheckboxToToolbar({
  title: 'Fit to Viewport after stretch',
  checked: isFitViewportAfterStretch,
  onChange: (checked: boolean) => {
    isFitViewportAfterStretch = checked;
  },
});

/**
 * The aspect ratio `[widthRatio, heightRatio]` that the example set last. A
 * next viewport holds the stretch as a pair of scales, not as this pair, so
 * the example keeps it.
 */
let aspectRatio: Types.Point2 = [1, 1];

/**
 * Stretches one viewport, and fits the stretched image if the user asks.
 * Without the fit the horizontal scale stays.
 */
const applyAspectRatio = (vp: PlanarViewport, aspect: Types.Point2) => {
  const stretch = aspect[0] / aspect[1];

  aspectRatio = aspect;

  if (isFitViewportAfterStretch) {
    vp.setViewState({ scale: [stretch, 1], scaleMode: 'fitAspect' });
  } else {
    const [scaleX] = viewportProjection.getFraming(vp, {
      selector: { scale: true },
    })?.scale ?? [1, 1];

    vp.setViewState({ scale: [scaleX, scaleX / stretch], scaleMode: 'fit' });
  }

  vp.render();
};

let stretchAxis = ['Stretch X', 'Stretch Y'];
let selectedAxis = stretchAxis[0];

const setStretch = (value) => {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  const viewportIdForStretch = useCpu ? stackViewportId : axialViewportId;
  const viewport = renderingEngine.getViewport(viewportIdForStretch);
  if (!viewport) {
    return;
  }
  let [sx, sy] = aspectRatio;
  if (selectedAxis === 'Stretch X') {
    [sx, sy] = [value, aspectRatio[1]];
  } else {
    [sx, sy] = [aspectRatio[0], value];
  }
  activeViewportIds.forEach((id) => {
    const vp = renderingEngine.getViewport<PlanarViewport>(id);
    if (!vp) {
      return;
    }
    applyAspectRatio(vp, [sx, sy]);
  });
};

const aspects = ['1:1', '1:2', '2:1', '0.5:1', '1:0.5', '3:17'];
addDropdownToToolbar({
  id: 'aspect',
  options: {
    values: aspects,
    defaultValue: aspects[0],
  },
  onSelectedValueChange: (value) => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const aspect = (value as string)
      .split(':')
      .map((it) => Number(it)) as Types.Point2;

    activeViewportIds.forEach((id) => {
      const vp = renderingEngine.getViewport<PlanarViewport>(id);
      if (!vp) {
        return;
      }
      applyAspectRatio(vp, aspect);
    });
  },
});

addDropdownToToolbar({
  options: {
    values: stretchAxis,
    defaultValue: selectedAxis,
  },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const name = String(nameAsStringOrNumber);
    setStretch(1);
    selectedAxis = name;
  },
});

addSliderToToolbar({
  id: 'stretchSlider',
  title: 'Stretch Value',
  range: [1, 10],
  defaultValue: 1,
  onSelectedValueChange: (valueAsStringOrNumber) => {
    const value = Number(valueAsStringOrNumber);
    console.log(value);
    setStretch(value);
  },
});

const rotationValues = [0, 10, 20, 30, 40, 45, 60, 90, 120, 180];
addDropdownToToolbar({
  id: 'rotation',
  labelText: 'Rotation',
  options: {
    values: rotationValues.map(String),
    defaultValue: '0',
  },
  onSelectedValueChange: (valueAsStringOrNumber) => {
    const rotation = Number(valueAsStringOrNumber);
    const renderingEngine = getRenderingEngine(renderingEngineId);
    volumeViewportIds.forEach((id) => {
      const vp = renderingEngine.getViewport<PlanarViewport>(id);
      const viewState = viewportProjection.withFraming(vp, { rotation });

      if (viewState) {
        vp.setViewState(viewState);
      }

      vp.render();
    });
  },
});

addButtonToToolbar({
  title: 'Flip',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    volumeViewportIds.forEach((id) => {
      const vp = renderingEngine.getViewport<PlanarViewport>(id);
      const { flipHorizontal = false, flipVertical = false } =
        vp.getViewState();
      vp.setViewState({
        flipHorizontal: !flipHorizontal,
        flipVertical: !flipVertical,
      });
      vp.render();
    });
  },
});

// ============================= //

async function addSegmentationsToState() {
  // Create a segmentation of the same resolution as the source data
  volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: segmentationId,
  });

  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        // The actual segmentation data, in the case of labelmap this is a
        // reference to the source volume of the segmentation.
        data: {
          volumeId: segmentationId,
        },
      },
    },
  ]);
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  setRenderBackend(useCpu ? 'cpu' : 'auto');

  // This is not necessary, but makes the images appear faster
  utilities.imageRetrieveMetadataProvider.add(
    'volume',
    ProgressiveRetrieveImages.interleavedRetrieveStages
  );

  // Define tool groups: stack tools and MPR tools are configured separately.
  const stackToolGroup = ToolGroupManager.createToolGroup(stackToolGroupId);
  const volumeToolGroup = useCpu
    ? null
    : ToolGroupManager.createToolGroup(volumeToolGroupId);
  addManipulationBindings(stackToolGroup, {
    toolMap,
    enableShiftClickZoom: true,
  });
  if (volumeToolGroup) {
    addManipulationBindings(volumeToolGroup, {
      toolMap,
      enableShiftClickZoom: true,
    });
  }

  // Keep brush editing on default left click in both groups.
  stackToolGroup.setToolActive(defaultTool, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
  if (volumeToolGroup) {
    volumeToolGroup.setToolActive(defaultTool, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  }

  // Crosshairs are only supported on orthographic volume viewports.
  if (volumeToolGroup) {
    try {
      cornerstoneTools.addTool(CrosshairsTool);
    } catch {
      // Tool might already be registered by another example session.
    }
    volumeToolGroup.addTool(CrosshairsTool.toolName);
    volumeToolGroup.setToolActive(CrosshairsTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
          modifierKey: csToolsEnums.KeyboardBindings.Ctrl,
        },
      ],
    });
  }

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = useCpu
    ? [
        {
          viewportId: stackViewportId,
          type: ViewportType.PLANAR,
          element: element1,
          defaultOptions: {
            background: <Types.Point3>[0.2, 0.0, 0.0],
          },
        },
      ]
    : [
        {
          viewportId: stackViewportId,
          type: ViewportType.PLANAR,
          element: element1,
          defaultOptions: {
            background: <Types.Point3>[0.2, 0.0, 0.0],
          },
        },
        {
          viewportId: axialViewportId,
          type: ViewportType.PLANAR,
          element: element2,
          defaultOptions: {
            orientation: Enums.OrientationAxis.AXIAL,
            background: <Types.Point3>[0.0, 0.2, 0.0],
          },
        },
        {
          viewportId: sagittalViewportId,
          type: ViewportType.PLANAR,
          element: element3,
          defaultOptions: {
            orientation: Enums.OrientationAxis.SAGITTAL,
            background: <Types.Point3>[0.0, 0.0, 0.2],
          },
        },
        {
          viewportId: coronalViewportId,
          type: ViewportType.PLANAR,
          element: element4,
          defaultOptions: {
            orientation: Enums.OrientationAxis.CORONAL,
            background: <Types.Point3>[0.2, 0.2, 0.0],
          },
        },
      ];

  renderingEngine.setViewports(viewportInputArray);

  stackToolGroup.addViewport(stackViewportId, renderingEngineId);
  if (volumeToolGroup) {
    volumeViewportIds.forEach((viewportId) => {
      volumeToolGroup.addViewport(viewportId, renderingEngineId);
    });
  }

  displaySetRegistry.add(stackDisplaySetId, {
    imageIds,
  });

  await renderingEngine
    .getViewport<PlanarViewport>(stackViewportId)
    .setDisplaySets({ displaySetId: stackDisplaySetId });
  if (!useCpu) {
    // Define a volume in memory and load segmentations only for GPU mode.
    const volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    });
    volume.load();
    await addSegmentationsToState();

    displaySetRegistry.add(volumeDisplaySetId, { imageIds, volumeId });

    await Promise.all(
      volumeViewportIds.map(async (viewportId) => {
        const viewport =
          renderingEngine.getViewport<PlanarViewport>(viewportId);

        await viewport.setDisplaySets({
          displaySetId: volumeDisplaySetId,
          options: { mode: 'volume' },
        });
        viewport.setDisplaySetAppearance(volumeDisplaySetId, ctPresentation());
      })
    );

    const segmentationRepresentation = {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    };

    await segmentation.addLabelmapRepresentationToViewportMap({
      [stackViewportId]: [segmentationRepresentation],
      [axialViewportId]: [segmentationRepresentation],
      [sagittalViewportId]: [segmentationRepresentation],
      [coronalViewportId]: [segmentationRepresentation],
    });
  }

  // Render the image
  renderingEngine.render();
}

run();
