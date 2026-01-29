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

const { MouseBindings } = csToolsEnums;
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

// Set up toolbar with left and right containers
const toolbar = document.getElementById('demo-toolbar');
if (toolbar) {
  toolbar.style.display = 'flex';
  toolbar.style.justifyContent = 'space-between';
  toolbar.style.alignItems = 'center';
}

const leftToolbarContainer = document.createElement('div');
leftToolbarContainer.style.display = 'flex';
leftToolbarContainer.style.gap = '0';
leftToolbarContainer.style.alignItems = 'center';

const rightToolbarContainer = document.createElement('div');
rightToolbarContainer.style.display = 'flex';
rightToolbarContainer.style.gap = '10px';
rightToolbarContainer.style.alignItems = 'center';

// Add left container to toolbar first
if (toolbar) {
  toolbar.appendChild(leftToolbarContainer);
}

// Add dropdown to toolbar to select number of orthographic viewports (reloads page with URL param)
addDropdownToToolbar({
  labelText: 'Number of Orthographic Viewports',
  options: {
    values: [1, 2, 3],
    defaultValue: getNumViewportsFromUrl(),
  },
  container: leftToolbarContainer,
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
  'Volume Cropping with Orientation Controller',
  'Here we demonstrate how to crop a 3D  volume with 6 clipping planes aligned on the x,y and z axes and an orientation controller.'
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
  - Click/Drag the spheres in VRT or reference lines in the orthographic viewports.
  - Rotate , pan or zoom the 3D viewport using the mouse.
  - Use the scroll wheel to scroll through the slices in the orthographic viewports.
  `;

content.append(instructions);

addToggleButtonToToolbar({
  title: 'Toggle 3D handles',
  defaultToggle: false,
  container: leftToolbarContainer,
  onClick: (toggle) => {
    // Get the tool group for the 3D viewport
    const toolGroupVRT =
      cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupIdVRT);
    // Get the VolumeCroppingTool instance from the tool group
    const croppingTool = toolGroupVRT.getToolInstance('VolumeCropping');
    // Call setHandlesVisible on the tool instance
    if (croppingTool && typeof croppingTool.setHandlesVisible === 'function') {
      croppingTool.setHandlesVisible(!croppingTool.getHandlesVisible());
    }
  },
});

addToggleButtonToToolbar({
  title: 'Toggle Cropping Planes',
  defaultToggle: false,
  container: leftToolbarContainer,
  onClick: (toggle) => {
    // Get the tool group for the 3D viewport
    const toolGroupVRT =
      cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupIdVRT);
    // Get the VolumeCroppingTool instance from the tool group
    const croppingTool = toolGroupVRT.getToolInstance('VolumeCropping');
    // Call setClippingPlanesVisible on the tool instance
    if (
      croppingTool &&
      typeof croppingTool.setClippingPlanesVisible === 'function'
    ) {
      croppingTool.setClippingPlanesVisible(
        !croppingTool.getClippingPlanesVisible()
      );
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
 * Get the color scheme from the URL (?colorScheme=gray|rgy|marker)
 */
function getColorSchemeFromUrl(): 'gray' | 'rgy' | 'marker' {
  const params = new URLSearchParams(window.location.search);
  const value = params.get('colorScheme');
  if (value === 'gray' || value === 'rgy' || value === 'marker') {
    return value;
  }
  // Check for legacy grayColors parameter for backward compatibility
  const grayColors = params.get('grayColors');
  if (grayColors === 'true') {
    return 'gray';
  }
  return 'marker'; // default - matches OrientationMarkerTool colors
}

/**
 * Get the keepOrientationUp value from the URL (?keepOrientationUp=true|false)
 */
function getKeepOrientationUpFromUrl(): boolean {
  const params = new URLSearchParams(window.location.search);
  const value = params.get('keepOrientationUp');
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return true; // default
}

/**
 * Get the letter color scheme from the URL (?letterColorScheme=mixed|all-white|all-black)
 */
function getLetterColorSchemeFromUrl(): 'mixed' | 'all-white' | 'all-black' {
  const params = new URLSearchParams(window.location.search);
  const value = params.get('letterColorScheme');
  if (value === 'mixed' || value === 'all-white' || value === 'all-black') {
    return value;
  }
  return 'mixed'; // default
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

  // Tool group for 3D viewport
  const toolGroupVRT = ToolGroupManager.createToolGroup(toolGroupIdVRT);
  toolGroupVRT.addTool(ZoomTool.toolName);
  toolGroupVRT.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary,
      },
    ],
  });
  toolGroupVRT.addTool(PanTool.toolName);
  toolGroupVRT.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary,
      },
    ],
  });
  // toolGroupVRT.addTool(OrientationMarkerTool.toolName, {
  //   overlayMarkerType:
  //     OrientationMarkerTool.OVERLAY_MARKER_TYPES.ANNOTATED_CUBE,
  //   orientationWidget: {
  //       viewportCorner: 2, // 3 = BOTTOM_RIGHT
  //     },
  // });
  // toolGroupVRT.setToolActive(OrientationMarkerTool.toolName);

  // Get color scheme from URL
  const colorScheme = getColorSchemeFromUrl();

  // Get keepOrientationUp from URL
  const keepOrientationUp = getKeepOrientationUpFromUrl();

  // Get letter color scheme from URL
  const letterColorScheme = getLetterColorSchemeFromUrl();

  // Configure faceColors based on URL parameter
  let faceColors;
  if (colorScheme === 'gray') {
    faceColors = {
      topBottom: [180, 180, 180],
      frontBack: [180, 180, 180],
      leftRight: [180, 180, 180],
      corners: [180, 180, 180],
      edges: [180, 180, 180],
    };
  } else if (colorScheme === 'marker') {
    // OrientationMarkerTool colors matching exact hex values:
    // X axis (left/right): Yellow #ffff00 - both xPlus (L) and xMinus (R)
    // Y axis (posterior/anterior): Cyan #00ffff - both yPlus (P) and yMinus (A)
    // Z axis (superior/inferior): Blue #0000ff - from defaultStyle.faceColor
    faceColors = {
      topBottom: [0, 0, 255], // Blue #0000ff - Z axis (superior/inferior)
      frontBack: [0, 255, 255], // Cyan #00ffff - Y axis (posterior/anterior)
      leftRight: [255, 255, 0], // Yellow #ffff00 - X axis (left/right)
      corners: [0, 0, 255], // Blue #0000ff - same as Z axis
      edges: [128, 128, 128], // Grey - edges
    };
  } else {
    // RGY scheme (red, green, yellow)
    faceColors = {
      topBottom: [255, 0, 0], // Red - faces 0-1 (top/bottom)
      frontBack: [0, 255, 0], // Green - faces 2-3 (front/back)
      leftRight: [255, 255, 0], // Yellow - faces 4-5 (left/right)
      corners: [0, 0, 255], // Blue - faces 6-13 (corner triangles)
      edges: [128, 128, 128], // Grey - faces 14-25 (edge rectangles)
    };
  }

  // Disable tool if it already exists to ensure fresh configuration
  if (toolGroupVRT.hasTool(OrientationControllerTool.toolName)) {
    toolGroupVRT.setToolDisabled(OrientationControllerTool.toolName);
  }

  // Add OrientationControllerTool with faceColors, keepOrientationUp, and letterColorScheme from URL
  toolGroupVRT.addTool(OrientationControllerTool.toolName, {
    colorScheme,
    faceColors,
    keepOrientationUp,
    letterColorScheme,
  });
  // Enable OrientationControllerTool after viewport is added and volume is loaded
  toolGroupVRT.setToolEnabled(OrientationControllerTool.toolName);

  // Add dropdown for orientation control colors (reloads page with URL param)
  const colorSchemeValues: string[] = ['rgy', 'gray', 'marker'];
  const colorSchemeLabels = ['RGY', 'Gray', 'Marker'];
  // Ensure colorScheme is valid, default to 'marker' if not
  const validColorScheme = colorSchemeValues.includes(colorScheme)
    ? colorScheme
    : 'marker';

  addDropdownToToolbar({
    labelText: 'Orientation Control Colors',
    options: {
      values: colorSchemeValues,
      defaultValue: validColorScheme,
      labels: colorSchemeLabels,
    },
    container: rightToolbarContainer,
    onSelectedValueChange: (selectedValue) => {
      const url = new URL(window.location.href);
      url.searchParams.set('colorScheme', String(selectedValue));
      // Remove legacy parameter if present
      url.searchParams.delete('grayColors');
      window.location.href = url.toString();
    },
  });

  // Add dropdown for letter color scheme (reloads page with URL param)
  const letterColorSchemeValues: string[] = ['mixed', 'all-white', 'all-black'];
  const letterColorSchemeLabels = ['Mixed', 'All White', 'All Black'];
  const validLetterColorScheme = letterColorSchemeValues.includes(
    letterColorScheme
  )
    ? letterColorScheme
    : 'mixed';

  addDropdownToToolbar({
    labelText: 'Letter Colors',
    options: {
      values: letterColorSchemeValues,
      defaultValue: validLetterColorScheme,
      labels: letterColorSchemeLabels,
    },
    container: rightToolbarContainer,
    onSelectedValueChange: (selectedValue) => {
      const url = new URL(window.location.href);
      url.searchParams.set('letterColorScheme', String(selectedValue));
      window.location.href = url.toString();
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
    container: rightToolbarContainer,
    onSelectedValueChange: (selectedValue) => {
      const newValue = selectedValue === 'true';
      // Update URL parameter
      const url = new URL(window.location.href);
      url.searchParams.set('keepOrientationUp', String(newValue));
      window.history.replaceState({}, '', url);

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

  addSliderToToolbar({
    title: 'Orientation marker size',
    range: [0.01, 0.05],
    defaultValue: 0.04,
    step: 0.01,
    container: rightToolbarContainer,
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

  // Append the right container to the toolbar
  if (toolbar) {
    toolbar.appendChild(rightToolbarContainer);
  }

  const isMobile = window.matchMedia('(any-pointer:coarse)').matches;
  const viewport = renderingEngine.getViewport(viewportId4) as VolumeViewport3D;

  await setVolumesForViewports(renderingEngine, [{ volumeId }], [viewportId4]);

  viewport.setProperties({
    preset: 'CT-Bone',
  });

  toolGroupVRT.addViewport(viewportId4, renderingEngineId);

  // First render the viewport BEFORE adding cropping tool
  viewport.resetCamera();
  viewport.setZoom(1.2);

  // Manually trigger camera modified to initialize VTK rendering state
  const camera = viewport.getCamera();
  const { position, focalPoint, viewUp } = camera;
  viewport.setCamera({
    position: [...position],
    focalPoint: [...focalPoint],
    viewUp: [...viewUp],
  });

  viewport.render();

  // Now add and activate the cropping tool
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
      {
        mouseButton: MouseBindings.Primary,
      },
    ],
  });

  // Hide 3D handles by default (same as toggle button does)
  const croppingTool = toolGroupVRT.getToolInstance('VolumeCropping');
  if (croppingTool && typeof croppingTool.setHandlesVisible === 'function') {
    croppingTool.setHandlesVisible(false);
  }

  // Render again after cropping tool is initialized
  viewport.render();
  renderingEngine.renderViewports(activeViewportIds);

  // Force another render after a brief moment to ensure everything is visible
  setTimeout(() => {
    renderingEngine.render();
  }, 100);
}

run();
