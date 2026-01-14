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
  OrientationControlTool,
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

// Add dropdown to toolbar to select number of orthographic viewports (reloads page with URL param)
addDropdownToToolbar({
  labelText: 'Number of Orthographic Viewports',
  options: {
    values: [1, 2, 3],
    defaultValue: getNumViewportsFromUrl(),
  },
  onSelectedValueChange: (selectedValue) => {
    const url = new URL(window.location.href);
    url.searchParams.set('numViewports', selectedValue);
    window.location.href = url.toString();
  },
});
const renderingEngineId = 'myRenderingEngine';

/////////////////////////////////////////
// ======== Set up page ======== //
setTitleAndDescription(
  'Volume Cropping',
  'Here we demonstrate how to crop a 3D  volume with 6 clipping planes aligned on the x,y and z axes.'
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
rightViewportsContainer.style.width = '20%';
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
 * Get the gray colors state from the URL (?grayColors=true|false)
 */
function getGrayColorsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get('grayColors');
  return value === 'true';
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
  cornerstoneTools.addTool(OrientationControlTool);
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

  volume.load();

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
  toolGroupVRT.addTool(OrientationMarkerTool.toolName, {
    overlayMarkerType:
      OrientationMarkerTool.OVERLAY_MARKER_TYPES.ANNOTATED_CUBE,
  });
  toolGroupVRT.setToolActive(OrientationMarkerTool.toolName);

  // Get gray colors state from URL
  const isGrayColors = getGrayColorsFromUrl();

  // Configure face colors based on URL parameter
  const faceColors = isGrayColors
    ? {
        // All gray
        topBottom: [180, 180, 180],
        frontBack: [180, 180, 180],
        leftRight: [180, 180, 180],
        corners: [180, 180, 180],
        edges: [180, 180, 180],
      }
    : {
        // Default colors
        topBottom: [255, 0, 0], // Red
        frontBack: [0, 255, 0], // Green
        leftRight: [255, 255, 0], // Yellow
        corners: [0, 0, 255], // Blue
        edges: [128, 128, 128], // Grey
      };

  // Add OrientationControlTool with color configuration from URL
  toolGroupVRT.addTool(OrientationControlTool.toolName, {
    faceColors,
  });
  // Enable OrientationControlTool after viewport is added and volume is loaded
  toolGroupVRT.setToolEnabled(OrientationControlTool.toolName);

  // Add toggle button for orientation control colors (reloads page with URL param)
  addToggleButtonToToolbar({
    title: 'Toggle Orientation Control Colors',
    defaultToggle: isGrayColors,
    onClick: (toggle) => {
      const url = new URL(window.location.href);
      url.searchParams.set('grayColors', toggle.toString());
      window.location.href = url.toString();
    },
  });

  const isMobile = window.matchMedia('(any-pointer:coarse)').matches;
  const viewport = renderingEngine.getViewport(viewportId4) as VolumeViewport3D;
  renderingEngine.renderViewports(activeViewportIds);
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId }],
    [viewportId4]
  ).then(() => {
    viewport.setProperties({
      preset: 'CT-Bone',
    });
    toolGroupVRT.addViewport(viewportId4, renderingEngineId);
    toolGroupVRT.addTool(VolumeCroppingTool.toolName, {
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

    viewport.setZoom(1.2);
    viewport.render();
  });
}

run();
