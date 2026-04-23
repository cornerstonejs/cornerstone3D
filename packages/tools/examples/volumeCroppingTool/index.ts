import type { Types, VolumeViewport3D } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  setVolumesForViewports,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setCtTransferFunctionForVolumeActor,
  addDropdownToToolbar,
  getLocalUrl,
  addToggleButtonToToolbar,
  addSliderToToolbar,
} from '../../../../utils/demo/helpers';

import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  VolumeCroppingTool,
  VolumeCroppingControlTool,
  TrackballRotateTool,
  ZoomTool,
  PanTool,
  OrientationMarkerTool,
  OrientationControllerTool,
  StackScrollTool,
  CrosshairsTool,
} = cornerstoneTools;

const { MouseBindings, KeyboardBindings } = csToolsEnums;
const { ViewportType } = Enums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const toolGroupId = 'MY_TOOLGROUP_ID';
const toolGroupIdVRT = 'MY_TOOLGROUP_VRT_ID';

const viewportId1 = 'CT_AXIAL';
const viewportId2 = 'CT_CORONAL';
const viewportId3 = 'CT_SAGITTAL';
const viewportId4 = 'CT_3D_VOLUME'; // New 3D volume viewport
const viewportIds = [viewportId1, viewportId2, viewportId3, viewportId4];

// Set up toolbar with three rows: viewports, planes, control
const toolbar = document.getElementById('demo-toolbar');
if (toolbar) {
  toolbar.style.display = 'flex';
  toolbar.style.flexDirection = 'column';
  toolbar.style.gap = '8px';
}

const viewportsRow = document.createElement('div');
viewportsRow.style.display = 'flex';
viewportsRow.style.gap = '10px';
viewportsRow.style.alignItems = 'center';

const planesRow = document.createElement('div');
planesRow.style.display = 'flex';
planesRow.style.gap = '10px';
planesRow.style.alignItems = 'center';

const controlRow = document.createElement('div');
controlRow.style.display = 'flex';
controlRow.style.gap = '10px';
controlRow.style.alignItems = 'center';

if (toolbar) {
  toolbar.appendChild(viewportsRow);
  toolbar.appendChild(planesRow);
  toolbar.appendChild(controlRow);
}

// Add dropdown to toolbar to select number of orthographic viewports (reloads page with URL param)
addDropdownToToolbar({
  labelText: 'Number of Orthographic Viewports:',
  options: {
    values: [1, 2, 3],
    defaultValue: getNumViewportsFromUrl(),
  },
  container: viewportsRow,
  onSelectedValueChange: (selectedValue) => {
    const url = new URL(window.location.href);
    url.searchParams.set('numViewports', String(selectedValue));
    window.location.href = url.toString();
  },
});
const renderingEngineId = 'myRenderingEngine';

/////////////////////////////////////////
// ======== Set up page ======== //
setTitleAndDescription(
  'Volume Cropping and Orientation Controller',
  'Demonstrates the volume cropping and the orientation controller tools in a volume3d viewport along with the volume cropping control tool in 1 to 3 orthographic viewports.'
);

const size = '400px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';
viewportGrid.style.width = '100%';
viewportGrid.style.height = '800px';

// Create elements for the viewports
const element1 = document.createElement('div'); // Axial
const element2 = document.createElement('div'); // Sagittal
const element3 = document.createElement('div'); // Coronal
const element4 = document.createElement('div'); // 3D Volume

// Create a container for the right side viewports
const rightViewportsContainer = document.createElement('div');
rightViewportsContainer.style.display = 'flex';
rightViewportsContainer.style.flexDirection = 'column';
rightViewportsContainer.style.width = '25%';
rightViewportsContainer.style.height = '100%';

// Set styles for the 2D viewports (stacked vertically on the right)
element1.style.width = '100%';
element1.style.height = '33.33%';
element1.style.minHeight = '200px';

element2.style.width = '100%';
element2.style.height = '33.33%';
element2.style.minHeight = '200px';

element3.style.width = '100%';
element3.style.height = '33.33%';
element3.style.minHeight = '200px';

// Set styles for the 3D viewport (on the left)
element4.style.width = '75%';
element4.style.height = '100%';
element4.style.minHeight = '600px';
element4.style.position = 'relative';

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();
element3.oncontextmenu = (e) => e.preventDefault();
element4.oncontextmenu = (e) => e.preventDefault();

// Add elements to the viewport grid
// First add the 3D viewport on the left
viewportGrid.appendChild(element4);

// Add the 2D viewports stacked vertically on the right
rightViewportsContainer.appendChild(element1);
rightViewportsContainer.appendChild(element2);
rightViewportsContainer.appendChild(element3);
viewportGrid.appendChild(rightViewportsContainer);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  Basic controls:
  - Click/Drag the spheres in 3D or reference lines in the orthographic viewports.
  - Rotate, pan or zoom the 3D viewport using the mouse.
  - Use the scroll wheel to scroll through the slices in the orthographic viewports.
  - Toggle the clipping planes, handles, and rotate clipping planes on drag.
  - Click on the faces/edges/corners of the beveled cube orientation widget to change the orientation.
  URL params: numViewports=1|2|3
  `;

content.append(instructions);

const rotateHintOverlay = document.createElement('div');
rotateHintOverlay.textContent = 'Use SHIFT-drag to rotate the clipping planes.';
rotateHintOverlay.style.position = 'absolute';
rotateHintOverlay.style.top = '10px';
rotateHintOverlay.style.left = '50%';
rotateHintOverlay.style.transform = 'translateX(-50%)';
rotateHintOverlay.style.padding = '4px 8px';
rotateHintOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.55)';
rotateHintOverlay.style.color = 'white';
rotateHintOverlay.style.fontSize = '12px';
rotateHintOverlay.style.borderRadius = '4px';
rotateHintOverlay.style.pointerEvents = 'none';
rotateHintOverlay.style.zIndex = '2';
rotateHintOverlay.style.display = 'none';
element4.appendChild(rotateHintOverlay);

const updateRotateHintVisibility = () => {
  const toolGroupVRT =
    cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupIdVRT);
  const croppingTool = toolGroupVRT?.getToolInstance('VolumeCropping');
  const isCroppingActive =
    !!croppingTool &&
    typeof croppingTool.getClippingPlanesVisible === 'function' &&
    croppingTool.getClippingPlanesVisible();

  rotateHintOverlay.style.display = isCroppingActive ? 'block' : 'none';
};

const croppingLabel = document.createElement('span');
croppingLabel.textContent = 'Cropping:';
croppingLabel.style.marginRight = '4px';
planesRow.appendChild(croppingLabel);

addToggleButtonToToolbar({
  title: 'Toggle Clipping Planes',
  defaultToggle: false,
  container: planesRow,
  onClick: (toggle) => {
    const toolGroupVRT =
      cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupIdVRT);
    const croppingTool = toolGroupVRT.getToolInstance('VolumeCropping');
    if (
      croppingTool &&
      typeof croppingTool.setClippingPlanesVisible === 'function'
    ) {
      croppingTool.setClippingPlanesVisible(
        !croppingTool.getClippingPlanesVisible()
      );
      updateRotateHintVisibility();
    }
  },
});

addToggleButtonToToolbar({
  title: 'Toggle Handles',
  defaultToggle: false,
  container: planesRow,
  onClick: (toggle) => {
    const toolGroupVRT =
      cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupIdVRT);
    const croppingTool = toolGroupVRT.getToolInstance('VolumeCropping');
    if (croppingTool && typeof croppingTool.setHandlesVisible === 'function') {
      croppingTool.setHandlesVisible(!croppingTool.getHandlesVisible());
    }
  },
});

addToggleButtonToToolbar({
  title: 'Toggle Rotate Clipping Planes on drag (without shift)',
  defaultToggle: false,
  container: planesRow,
  onClick: (toggle) => {
    const toolGroupVRT =
      cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupIdVRT);
    const croppingTool = toolGroupVRT.getToolInstance('VolumeCropping');
    if (
      croppingTool &&
      typeof croppingTool.setRotatePlanesOnDrag === 'function' &&
      typeof croppingTool.getRotatePlanesOnDrag === 'function'
    ) {
      const currentState = croppingTool.getRotatePlanesOnDrag();
      croppingTool.setRotatePlanesOnDrag(!currentState);
    }
  },
});

const viewportColors = {
  [viewportId1]: 'rgb(200, 0, 0)',
  [viewportId2]: 'rgb(0, 200, 0)',
  [viewportId3]: 'rgb(200, 200, 0)',
  [viewportId4]: 'rgb(0, 200, 200)',
};

function getReferenceLineColor(viewportId) {
  return viewportColors[viewportId];
}

const viewportReferenceLineControllable = [
  viewportId1,
  viewportId2,
  viewportId3,
];

type OrientationAppearancePreset = {
  edgeColor: [number, number, number];
  cornerColor: [number, number, number];
  highlightColor: [number, number, number];
  restingAmbient: number;
  hoverAmbient: number;
};

const orientationAppearancePresets: Record<
  string,
  OrientationAppearancePreset
> = {
  default: {
    edgeColor: [200, 200, 200],
    cornerColor: [150, 150, 150],
    highlightColor: [255, 255, 255],
    restingAmbient: 1.0,
    hoverAmbient: 1.0,
  },
  themed: {
    edgeColor: [66, 111, 176],
    cornerColor: [41, 73, 124],
    highlightColor: [91, 163, 255],
    restingAmbient: 0.55,
    hoverAmbient: 1.0,
  },
};

/**
 * Get the number of orthographic viewports from the URL (?numViewports=1|2|3)
 */
function getNumViewportsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get('numViewports');
  const num = Number(value);
  if ([1, 2, 3].includes(num)) {
    return num;
  }
  return 3; // default
}

/**
 * Runs the demo with a configurable number of orthographic viewports
 */
async function run(numViewports = getNumViewportsFromUrl()) {
  await initDemo();

  cornerstoneTools.addTool(VolumeCroppingTool);
  cornerstoneTools.addTool(VolumeCroppingControlTool);
  cornerstoneTools.addTool(TrackballRotateTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(OrientationMarkerTool);
  cornerstoneTools.addTool(OrientationControllerTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(CrosshairsTool);

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot:
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Only include the requested number of orthographic viewports
  const orthographicViewports = [
    {
      viewportId: viewportId1,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId3,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
  ].slice(0, numViewports);

  // Show/hide orthographic viewport elements based on numViewports
  [element1, element2, element3].forEach((el, idx) => {
    if (idx < numViewports) {
      el.style.display = 'block';
      el.style.height = `${100 / numViewports}%`;
    } else {
      el.style.display = 'none';
    }
  });

  // Always set viewport4 (3D viewport) orientation to CORONAL
  const viewportInputArray = [
    ...orthographicViewports,
    {
      viewportId: viewportId4,
      type: ViewportType.VOLUME_3D,
      element: element4,
      defaultOptions: {
        background: <Types.Point3>[0, 0, 0],
        orientation: Enums.OrientationAxis.CORONAL,
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  await volume.load();

  // Only set volumes for the active viewport IDs
  const activeViewportIds = [
    ...orthographicViewports.map((vp) => vp.viewportId),
    viewportId4,
  ];
  await setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId,
        callback: setCtTransferFunctionForVolumeActor,
      },
    ],
    activeViewportIds
  );

  // Tool group for orthographic viewports
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  orthographicViewports.forEach((vp) => {
    toolGroup.addViewport(vp.viewportId, renderingEngineId);
  });

  toolGroup.addTool(VolumeCroppingControlTool.toolName, {
    getReferenceLineColor,
    viewportIndicators: true,
  });
  toolGroup.setToolActive(VolumeCroppingControlTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
      },
    ],
  });
  toolGroup.addTool(StackScrollTool.toolName, {
    viewportIndicators: true,
  });
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel,
      },
      {
        mouseButton: MouseBindings.Secondary,
      },
    ],
  });

  const colorScheme: 'rgy' | 'gray' | 'marker' = 'rgy';
  const keepOrientationUp = true;
  const letterColorScheme: 'mixed' | 'white' | 'black' = 'mixed';
  const appearancePreset = 'default';

  // Tool group for 3D viewport
  const toolGroupVRT = ToolGroupManager.createToolGroup(toolGroupIdVRT);
  toolGroupVRT.addTool(ZoomTool.toolName);
  toolGroupVRT.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        // scroll wheel for zoom
        mouseButton: MouseBindings.Wheel,
      },
    ],
  });
  toolGroupVRT.addTool(PanTool.toolName);
  toolGroupVRT.setToolActive(PanTool.toolName, {
    bindings: [
      {
        //updated to right mouse button for pan
        mouseButton: MouseBindings.Secondary,
      },
    ],
  });

  // Disable tool if it already exists to ensure fresh configuration
  if (toolGroupVRT.hasTool(OrientationControllerTool.toolName)) {
    toolGroupVRT.setToolDisabled(OrientationControllerTool.toolName);
  }

  // Add OrientationControllerTool - colors resolved from colorScheme/letterColorScheme maps
  toolGroupVRT.addTool(OrientationControllerTool.toolName, {
    colorScheme,
    keepOrientationUp,
    letterColorScheme,
    ...orientationAppearancePresets[appearancePreset],
  });
  // Enable OrientationControllerTool after viewport is added and volume is loaded
  toolGroupVRT.setToolEnabled(OrientationControllerTool.toolName);

  // Add dropdown for orientation control colors
  const colorSchemeValues: string[] = ['rgy', 'gray', 'marker'];
  const colorSchemeLabels = ['RGY', 'Gray', 'Marker'];

  addDropdownToToolbar({
    labelText: 'Orientation Control: Colors',
    options: {
      values: colorSchemeValues,
      defaultValue: colorScheme,
      labels: colorSchemeLabels,
    },
    container: controlRow,
    onSelectedValueChange: (selectedValue) => {
      const toolGroupVRT =
        cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupIdVRT);
      const orientationControllerTool = toolGroupVRT.getToolInstance(
        OrientationControllerTool.toolName
      );

      if (orientationControllerTool) {
        orientationControllerTool.configuration.colorScheme = selectedValue;
        orientationControllerTool.onSetToolDisabled();
        orientationControllerTool.onSetToolEnabled();
      }
    },
  });

  // Add dropdown for letter color scheme
  const letterColorSchemeValues: string[] = ['mixed', 'white', 'black'];
  const letterColorSchemeLabels = ['Mixed', 'White', 'Black'];

  addDropdownToToolbar({
    labelText: 'Letter Colors',
    options: {
      values: letterColorSchemeValues,
      defaultValue: letterColorScheme,
      labels: letterColorSchemeLabels,
    },
    container: controlRow,
    onSelectedValueChange: (selectedValue) => {
      const toolGroupVRT =
        cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupIdVRT);
      const orientationControllerTool = toolGroupVRT.getToolInstance(
        OrientationControllerTool.toolName
      );

      if (orientationControllerTool) {
        orientationControllerTool.configuration.letterColorScheme =
          selectedValue;
        orientationControllerTool.onSetToolDisabled();
        orientationControllerTool.onSetToolEnabled();
      }
    },
  });

  // Add dropdown for "Keep orientation up"
  const keepOrientationUpValues: string[] = ['true', 'false'];
  const keepOrientationUpLabels = ['True', 'False'];

  addDropdownToToolbar({
    labelText: 'Keep Orientation Up',
    options: {
      values: keepOrientationUpValues,
      defaultValue: String(keepOrientationUp),
      labels: keepOrientationUpLabels,
    },
    container: controlRow,
    onSelectedValueChange: (selectedValue) => {
      const newValue = selectedValue === 'true';

      // Get the tool group for the 3D viewport
      const toolGroupVRT =
        cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupIdVRT);
      // Get the OrientationControllerTool instance from the tool group
      const orientationControllerTool = toolGroupVRT.getToolInstance(
        OrientationControllerTool.toolName
      );
      if (orientationControllerTool) {
        // Update configuration
        orientationControllerTool.configuration.keepOrientationUp = newValue;
        // Reinitialize viewports to apply the change
        orientationControllerTool.onSetToolDisabled();
        orientationControllerTool.onSetToolEnabled();
      }
    },
  });

  const orientationAppearanceValues = ['default', 'themed'];
  const orientationAppearanceLabels = [
    'Default bevel/hover',
    'Themed bevel/hover',
  ];

  addDropdownToToolbar({
    labelText: 'Bevel + Hover Theme',
    options: {
      values: orientationAppearanceValues,
      defaultValue: appearancePreset,
      labels: orientationAppearanceLabels,
    },
    container: controlRow,
    onSelectedValueChange: (selectedValue) => {
      const toolGroupVRT =
        cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupIdVRT);
      const orientationControllerTool = toolGroupVRT.getToolInstance(
        OrientationControllerTool.toolName
      );

      if (orientationControllerTool) {
        const preset = orientationAppearancePresets[selectedValue];
        if (!preset) {
          return;
        }

        orientationControllerTool.configuration.edgeColor = preset.edgeColor;
        orientationControllerTool.configuration.cornerColor =
          preset.cornerColor;
        orientationControllerTool.configuration.highlightColor =
          preset.highlightColor;
        orientationControllerTool.configuration.restingAmbient =
          preset.restingAmbient;
        orientationControllerTool.configuration.hoverAmbient =
          preset.hoverAmbient;
        orientationControllerTool.onSetToolDisabled();
        orientationControllerTool.onSetToolEnabled();
      }
    },
  });

  addSliderToToolbar({
    title: 'Marker size',
    range: [0.01, 0.05],
    defaultValue: 0.04,
    step: 0.01,
    container: controlRow,
    onSelectedValueChange: (value) => {
      const size = Number(value);
      const toolGroupVRT =
        cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupIdVRT);
      const orientationControllerTool = toolGroupVRT.getToolInstance(
        OrientationControllerTool.toolName
      );
      if (orientationControllerTool) {
        orientationControllerTool.configuration.size = size;
        orientationControllerTool.onSetToolDisabled();
        orientationControllerTool.onSetToolEnabled();
      }
    },
    updateLabelOnChange: (value, label) => {
      label.textContent = `Orientation marker size: ${value}`;
    },
  });

  addSliderToToolbar({
    title: 'Handles size',
    range: [2, 20],
    defaultValue: 7,
    step: 1,
    container: planesRow,
    onSelectedValueChange: (value) => {
      const sphereRadius = Number(value);
      const toolGroupVRT =
        cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupIdVRT);
      const croppingTool = toolGroupVRT.getToolInstance(
        VolumeCroppingTool.toolName
      );

      if (!croppingTool) {
        return;
      }

      croppingTool.setHandleRadius(sphereRadius);
    },
    updateLabelOnChange: (value, label) => {
      label.textContent = `Handles size: ${value}`;
    },
  });

  const viewport = renderingEngine.getViewport(viewportId4) as VolumeViewport3D;

  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId }],
    [viewportId4],
    true
  );

  viewport.setProperties({
    preset: 'CT-Bone',
  });

  toolGroupVRT.addViewport(viewportId4, renderingEngineId);

  viewport.resetCamera();
  viewport.setZoom(1.2);

  // Force VTK pipeline to size and render (workaround for volume not showing until interaction)
  renderingEngine.resize(true, true);

  // Now add and activate the cropping tool (start with clipping off so volume gets first render)
  toolGroupVRT.addTool(VolumeCroppingTool.toolName, {
    showHandles: false,
    showClippingPlanes: false,
    sphereRadius: 7,
    sphereColors: {
      x: [1, 1, 0],
      y: [0, 1, 0],
      z: [1, 0, 0],
      corners: [0, 0, 1],
    },
    showCornerSpheres: true,
    initialCropFactor: 0.2,
  });
  toolGroupVRT.setToolActive(VolumeCroppingTool.toolName, {
    bindings: [
      { mouseButton: MouseBindings.Primary },
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.Shift,
      },
    ],
  });

  // Hide 3D handles by default (same as toggle button does)
  const croppingTool = toolGroupVRT.getToolInstance('VolumeCropping');
  if (croppingTool && typeof croppingTool.setHandlesVisible === 'function') {
    croppingTool.setHandlesVisible(false);
  }
  updateRotateHintVisibility();
  // Clipping off on load; user enables via Toggle Clipping Planes button
  renderingEngine.renderViewports(activeViewportIds);
}

run();
