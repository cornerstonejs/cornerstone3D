import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  getRenderingEngine,
  getRenderingEngines,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  createInfoSection,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
// Import contour utilities for examples
const { findContourHoles, supersamplePolyline2D, findIslands } =
  cornerstoneTools.utilities.contours;
const { decimate } = cornerstoneTools.utilities.math.polyline;

const { convertContourPolylineToCanvasSpace, convertContourPolylineToWorld } =
  cornerstoneTools.utilities.contourSegmentation;
// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PlanarFreehandROITool,
  PanTool,
  StackScrollTool,
  ZoomTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  annotation: csToolsAnnotation,
} = cornerstoneTools;

function getViewportDisplayingAnnotation(annotation) {
  const getAllViewports = () => {
    const renderingEngine = getRenderingEngines();
    return renderingEngine.flatMap((renderingEngine) =>
      renderingEngine.getViewports()
    );
  };
  const viewports = getAllViewports();
  return viewports.find(
    (viewport) =>
      viewport.getCurrentImageId() === annotation?.metadata?.referencedImageId
  );
}

function getAnnotationPolyline(annotation) {
  if (annotation?.data?.contour?.polyline) {
    const viewport = getViewportDisplayingAnnotation(annotation);
    if (!viewport) {
      return;
    }
    const polyline = convertContourPolylineToCanvasSpace(
      annotation.data.contour.polyline,
      viewport
    );
    if (annotation.data.contour.closed) {
      polyline.push(polyline[0]);
    }
    return polyline;
  }
}

let shouldCalculateStats = false;
const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const renderingEngineId = 'myRenderingEngine';

const viewportIds = ['CT_STACK', 'CT_VOLUME_SAGITTAL'];

// ======== Set up page ======== //
setTitleAndDescription(
  'Planar Freehand Annotation Tool',
  'Here we demonstrate how to use the Planar Freehand Annotation Tool to draw 2D open and closed ROIs'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;

// Disable right click context menu so we can have right click tool
element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);

content.appendChild(viewportGrid);

createInfoSection(content, { title: 'Drawing' })
  .addInstruction('Left click and drag to draw a contour')
  .openNestedSection()
  .addInstruction(
    'If you join the contour together it will be closed, otherwise releasing the mouse will create an open contour (freehand line)'
  );

createInfoSection(content, { title: 'Editing' })
  .addInstruction(
    'Left click and drag on the line of an existing contour to edit it'
  )
  .openNestedSection()
  .addInstruction('Closed Contours')
  .openNestedSection()
  .addInstruction(
    'Drag the line and a preview of the edit will be displayed. Release the mouse to complete the edit. You can cross the original contour multiple times in one drag to do a complicated edit in one movement.'
  )
  .closeNestedSection();

createInfoSection(content, { title: 'Contour Utilities' })
  .addInstruction(
    'Find Contour Holes: Analyzes contours to detect holes within them. Results are logged to console.'
  )
  .addInstruction(
    'Supersample Polylines: Adds interpolated points between existing points to achieve smoother contours with target spacing of 1.0 units.'
  )
  .addInstruction(
    'Remove Small Islands: Filters out closed contours smaller than area threshold (100 square units). Only affects closed contours, preserves open polylines.'
  )
  .addInstruction(
    'Decimate Polylines: Simplifies polylines by removing points using Ramer-Douglas-Peucker algorithm with epsilon tolerance of 2.0 units. Shows reduction percentage.'
  );

addButtonToToolbar({
  title: 'Find Contour Holes',
  onClick: () => {
    const annotations = cornerstoneTools.annotation.state.getAllAnnotations();

    if (annotations.length === 0) {
      console.log('No annotations found. Please draw some contours first.');
      return;
    }

    // Collect all polylines from all annotations
    const allPolylines = [];
    const annotationPolylineMap = new Map();

    annotations.forEach((annotation, index) => {
      if (annotation?.data?.contour?.polyline) {
        const polyline = getAnnotationPolyline(annotation);
        allPolylines.push(polyline);
        annotationPolylineMap.set(polyline, annotation);
        console.log(`Annotation ${index + 1}:`);
        console.log('Original polyline points:', polyline.length);
      }
    });

    if (allPolylines.length === 0) {
      console.log('No valid polylines found.');
      return;
    }

    try {
      // Find holes in all contours
      const holesResult = findContourHoles(allPolylines);
      console.log('Holes found:', holesResult);

      // Check if any holes were found and change annotation color to red
      if (holesResult && holesResult.length > 0) {
        console.log('Holes detected! Changing annotation colors to red.');
        holesResult.forEach((holeResult) => {
          holeResult.holeIndexes.forEach((holeIndex) => {
            const polyline = allPolylines[holeIndex];
            const annotation = annotationPolylineMap.get(polyline);
            if (annotation) {
              // Set annotation style to red
              const styles = {
                color: 'rgb(255, 0, 0)', // Red color
              };

              csToolsAnnotation.config.style.setAnnotationStyles(
                annotation.annotationUID,
                styles
              );
            }
          });
          // select the polyline with holes
          const polyline = allPolylines[holeResult.contourIndex];
          const annotation = annotationPolylineMap.get(polyline);
          if (annotation) {
            csToolsAnnotation.selection.setAnnotationSelected(
              annotation.annotationUID
            );
          }
        });

        // Re-render to show the color changes
        const renderingEngine = getRenderingEngine(renderingEngineId);
        renderingEngine.render();
      }
    } catch (error) {
      console.error('Error finding contour holes:', error);
    }
  },
});

addButtonToToolbar({
  title: 'Supersample Polylines',
  onClick: () => {
    const annotations = cornerstoneTools.annotation.state.getAllAnnotations();

    if (annotations.length === 0) {
      console.log('No annotations found. Please draw some contours first.');
      return;
    }

    const renderingEngine = getRenderingEngine(renderingEngineId);

    annotations.forEach((annotation, index) => {
      if (annotation?.data?.contour?.polyline) {
        const viewport = getViewportDisplayingAnnotation(annotation);
        if (!viewport) {
          return;
        }
        const originalPolyline = convertContourPolylineToCanvasSpace(
          annotation.data.contour.polyline,
          viewport
        );

        console.log(`Annotation ${index + 1}:`);
        console.log('Original polyline points:', originalPolyline.length);

        try {
          // Supersample the polyline with target spacing of 1.0
          const supersampledPolyline = supersamplePolyline2D(
            originalPolyline,
            0.1
          );
          console.log(
            'Supersampled polyline points:',
            supersampledPolyline.length
          );

          // Update the annotation with the supersampled polyline
          annotation.data.contour.polyline = convertContourPolylineToWorld(
            supersampledPolyline,
            viewport
          );
        } catch (error) {
          console.error('Error supersampling polyline:', error);
        }
      }
    });

    // Re-render to show the updated polylines
    renderingEngine.renderViewports(viewportIds);
  },
});

addButtonToToolbar({
  title: 'Remove Small Islands',
  onClick: () => {
    const annotations = cornerstoneTools.annotation.state.getAllAnnotations();

    if (annotations.length === 0) {
      console.log('No annotations found. Please draw some contours first.');
      return;
    }

    // Collect all polylines
    const polylines = [];
    const annotationMap = new Map();

    annotations.forEach((annotation) => {
      if (annotation?.data?.contour?.polyline) {
        const polyline = getAnnotationPolyline(annotation);
        polylines.push(polyline);
        annotationMap.set(polyline, annotation);
      }
    });

    if (polylines.length === 0) {
      console.log('No valid polylines found.');
      return;
    }

    console.log('Original polylines count:', polylines.length);

    try {
      // Remove islands smaller than area threshold of 300
      const islandPolylines = findIslands(polylines, 300);
      console.log('Island polylines count:', islandPolylines.length);

      // Remove annotations that were filtered out
      islandPolylines.forEach((islandIndex) => {
        const polyline = polylines[islandIndex];
        const annotation = annotationMap.get(polyline);
        if (annotation) {
          csToolsAnnotation.state.removeAnnotation(annotation.annotationUID);
        }
      });

      // Re-render to show the updated annotations
      const renderingEngine = getRenderingEngine(renderingEngineId);
      renderingEngine.renderViewports(viewportIds);
    } catch (error) {
      console.error('Error removing islands:', error);
    }
  },
});

addButtonToToolbar({
  title: 'Decimate Polylines',
  onClick: () => {
    const annotations = cornerstoneTools.annotation.state.getAllAnnotations();

    if (annotations.length === 0) {
      console.log('No annotations found. Please draw some contours first.');
      return;
    }

    const renderingEngine = getRenderingEngine(renderingEngineId);

    annotations.forEach((annotation, index) => {
      if (annotation?.data?.contour?.polyline) {
        const viewport = getViewportDisplayingAnnotation(annotation);
        if (!viewport) {
          return;
        }
        const originalPolyline = convertContourPolylineToCanvasSpace(
          annotation.data.contour.polyline,
          viewport
        );
        console.log(`Annotation ${index + 1}:`);
        console.log('Original polyline points:', originalPolyline.length);

        try {
          // Decimate the polyline with epsilon of 2.0 (tolerance for simplification)
          const decimatedPolyline = decimate(originalPolyline, 2.0);
          console.log('Decimated polyline points:', decimatedPolyline.length);
          console.log(
            'Reduction:',
            (
              ((originalPolyline.length - decimatedPolyline.length) /
                originalPolyline.length) *
              100
            ).toFixed(1) + '%'
          );

          // Update the annotation with the decimated polyline
          annotation.data.contour.polyline = convertContourPolylineToWorld(
            decimatedPolyline,
            viewport
          );
        } catch (error) {
          console.error('Error decimating polyline:', error);
        }
      }
    });

    // Re-render to show the updated polylines
    renderingEngine.renderViewports(viewportIds);
  },
});

function addToggleCalculateStatsButton(toolGroup) {
  addButtonToToolbar({
    title: 'Toggle calculate stats',
    onClick: () => {
      shouldCalculateStats = !shouldCalculateStats;

      toolGroup.setToolConfiguration(PlanarFreehandROITool.toolName, {
        calculateStats: shouldCalculateStats,
      });
    },
  });
}
// ============================= //

const toolGroupId = 'STACK_TOOL_GROUP_ID';

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PlanarFreehandROITool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(ZoomTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(PlanarFreehandROITool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);

  // Set the initial state of the tools.
  toolGroup.setToolActive(PlanarFreehandROITool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary, // Middle Click
      },
    ],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Right Click
      },
    ],
  });
  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

  // set up toggle calculate stats tool button.
  addToggleCalculateStatsButton(toolGroup);

  toolGroup.setToolConfiguration(PlanarFreehandROITool.toolName, {
    calculateStats: shouldCalculateStats,
    allowOpenContours: false,
  });

  // Get Cornerstone imageIds and fetch metadata into RAM
  const stackImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Define a stack containing a single image
  const smallStackImageIds = [stackImageIds[0], stackImageIds[1]];

  const volumeImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Create a stack and a volume viewport
  const viewportInputArray = [
    {
      viewportId: viewportIds[0],
      type: ViewportType.STACK,
      element: element1,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[1],
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.setViewports(viewportInputArray);

  // Set the tool group on the viewport
  viewportIds.forEach((viewportId) =>
    toolGroup.addViewport(viewportId, renderingEngineId)
  );

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds: volumeImageIds,
  });

  // Get the viewports that were just created
  const stackViewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportIds[0])
  );
  const volumeViewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportIds[1])
  );

  // Set the stack on the viewport
  stackViewport.setStack(smallStackImageIds);

  // Set the volume to load
  volume.load();

  // Set the volume on the viewport
  volumeViewport.setVolumes([{ volumeId }]);

  // Render the image
  renderingEngine.renderViewports(viewportIds);
}

run();
