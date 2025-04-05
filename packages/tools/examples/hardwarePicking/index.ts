/**
 * Hardware Picking Example
 *
 * This example demonstrates how to use hardware picking in a 3D viewport to detect
 * interactions between the cursor and rendered surfaces. It shows how to:
 * 1. Load and display a volume in a 3D viewport
 * 2. Add surface segmentation representations
 * 3. Use hardware picking to detect which surface is under the cursor
 * 4. Display labels for the picked surfaces
 */

import type { Types, VolumeViewport3D } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  utilities,
  CONSTANTS,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  createAndCacheGeometriesFromSurfaces,
} from '../../../../utils/demo/helpers';

import * as cornerstoneTools from '@cornerstonejs/tools';

// Import VTK.js constants for hardware picking
import { FieldAssociations } from '@kitware/vtk.js/Common/DataModel/DataSet/Constants';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  ZoomTool,
  PanTool,
  StackScrollTool,
  TrackballRotateTool,
} = cornerstoneTools;
const { MouseBindings } = csToolsEnums;
const { ViewportType, GeometryType } = Enums;

// Define unique identifiers for the volume, tool group, and segmentation
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const toolGroupId3d = 'MY_TOOLGROUP_ID_3d';
const segmentationId = 'MY_SEGMENTATION_ID';
let coordDiv; // DOM element to display picked surface information

// ======== Set up page ======== //
setTitleAndDescription(
  'Surface Segmentation Representation for Volume Viewports',
  'This example first downloads the surface data. In this demonstration, we will show you how to render surfaces. There is a 3D viewport. When you interact with the images, the intersection between the surfaces and the underlying volume is calculated. Please note that this calculation may be slow during the initial visit, but we have implemented caching to significantly improve speed in subsequent visits. In the future, we plan to enhance the user experience by introducing off-thread pre-calculation of all surfaces.'
);

// Creates or updates a label to display information about the picked surface
function addPickedPositionLabel(x: number, y: number, label: string) {
  // Create the label div if it doesn't exist
  if (!coordDiv) {
    coordDiv = document.createElement('div');
    coordDiv.style.position = 'absolute';
    coordDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    coordDiv.style.color = 'white';
    coordDiv.style.padding = '5px';
    coordDiv.style.borderRadius = '3px';
    coordDiv.style.zIndex = '1000';
    coordDiv.style.pointerEvents = 'none'; // Ensure the div doesn't interfere with mouse events
    element2.appendChild(coordDiv);
  }

  // Update the label position and content
  coordDiv.style.display = 'block'; // Only show the label when a surface is picked
  coordDiv.style.top = `${y + 10}px`; // Position slightly below the cursor
  coordDiv.style.left = `${x + 10}px`; // Position slightly to the right of the cursor
  coordDiv.textContent = `${label}`;
}

// ======== Create DOM elements for the viewport ======== //
const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

// Create the 3D viewport element
const element2 = document.createElement('div');
element2.oncontextmenu = () => false; // Disable right-click menu

element2.style.width = size;
element2.style.height = size;

viewportGrid.appendChild(element2);

content.appendChild(viewportGrid);
let renderingEngine;
const instructions = document.createElement('p');
content.append(instructions);
// ============================= //

// Define viewport ID
const viewportId2 = 'CT_3D';

let surfaces;
async function addSegmentationsToState() {
  // Download the surface data. Please note that this is a large file
  // and may take a while to download
  const geometriesInfo = await createAndCacheGeometriesFromSurfaces();

  // Add the segmentations to state with Surface representation type
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Surface,
        data: {
          geometryIds: geometriesInfo,
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

  // ======== Tool Setup ======== //
  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(TrackballRotateTool);

  const toolGroup3d = ToolGroupManager.createToolGroup(toolGroupId3d);

  toolGroup3d.addTool(ZoomTool.toolName);
  toolGroup3d.addTool(TrackballRotateTool.toolName, {
    configuration: { volumeId },
  });

  toolGroup3d.setToolActive(TrackballRotateTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
      },
    ],
  });

  toolGroup3d.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary,
      },
    ],
  });

  // ======== Data Loading ======== //
  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Add segmentations based on the source data volume
  await addSegmentationsToState();

  // ======== Viewport Setup ======== //
  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Define the viewport configuration
  const viewportInputArray = [
    {
      viewportId: viewportId2,
      type: ViewportType.VOLUME_3D,
      element: element2,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2], // Purple background
      },
    },
  ];

  // Create the viewport
  renderingEngine.setViewports(viewportInputArray);

  // Add the viewport to the tool group
  toolGroup3d.addViewport(viewportId2, renderingEngineId);

  // Load the volume data
  volume.load();

  // Set volumes on the viewports and configure the appearance
  setVolumesForViewports(renderingEngine, [{ volumeId }], [viewportId2]).then(
    () => {
      const viewport3d = renderingEngine.getViewport(viewportId2);
      const volumeActor = viewport3d.getDefaultActor()
        .actor as Types.VolumeActor;
      utilities.applyPreset(
        volumeActor,
        CONSTANTS.VIEWPORT_PRESETS.find(
          (preset) => preset.name === 'CT-Chest-Contrast-Enhanced'
        )
      );

      // Set the camera position and scale
      const renderer = viewport3d.getRenderer();
      renderer.getActiveCamera().elevation(-70);
      viewport3d.setCamera({ parallelScale: 600 });

      volumeActor.setVisibility(false);

      viewport3d.render();
    }
  );

  await segmentation.addSurfaceRepresentationToViewport(viewportId2, [
    {
      segmentationId,
    },
  ]);

  // ======== Hardware Picking Setup ======== //
  // Add mousemove event listener for hardware picking
  element2.addEventListener('mousemove', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();

    // Get the rendering engine and viewport
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport(
      viewportId2
    ) as VolumeViewport3D;

    // Get canvas coordinates relative to the element
    const rect = element2.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;

    // Convert to VTK display coordinates
    const displayCoords = viewport.getVTKDisplayCoords([x, y]);

    // Set up the hardware picker
    const renderer = viewport.getRenderer();
    renderer.setDraw(true);
    const renderWindow = renderer.getRenderWindow();
    const interactor = renderWindow.getInteractor();
    const apiSpecificRenderWindow = interactor.getView();

    // Configure the hardware selector for picking
    const hardwareSelector = apiSpecificRenderWindow.getSelector();
    hardwareSelector.setCaptureZValues(true);

    // TODO: bug in FIELD_ASSOCIATION_POINTS mode
    // hardwareSelector.setFieldAssociation(
    //   FieldAssociations.FIELD_ASSOCIATION_POINTS
    // );

    // Use cell-based picking instead of point-based
    hardwareSelector.setFieldAssociation(
      FieldAssociations.FIELD_ASSOCIATION_CELLS
    );

    // Perform the hardware picking asynchronously
    hardwareSelector
      .getSourceDataAsync(
        renderer,
        displayCoords[0],
        displayCoords[1],
        displayCoords[0],
        displayCoords[1]
      )
      .then((result) => {
        if (result) {
          // Generate selection from the picking result
          const selections = result.generateSelection(
            displayCoords[0],
            displayCoords[1],
            displayCoords[0],
            displayCoords[1]
          );

          if (selections && selections.length > 0) {
            // Get the picked actor property
            const { prop } = selections[0].getProperties();

            // Find the actor entry that matches the picked property
            const actorEntries = viewport.getActors();
            const actorEntry = actorEntries.find(
              (entry) => entry.actor === prop
            );

            // If found, display the label with the actor's UID
            if (actorEntry) {
              addPickedPositionLabel(x, y, actorEntry.uid);
            }
          } else {
            // If no selection, hide the label
            if (coordDiv) {
              coordDiv.style.display = 'none';
            }
          }
        }
      });
  });
}

run();
