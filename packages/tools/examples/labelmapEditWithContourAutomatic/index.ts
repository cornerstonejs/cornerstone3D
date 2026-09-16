import type { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  setVolumesForViewports,
  volumeLoader,
  getEnabledElement,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
  addSliderToToolbar,
  getLocalUrl,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { fillVolumeLabelmapWithMockData } from '../../../../utils/test/fillVolumeLabelmapWithMockData';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const segmentationId = 'MY_SEGMENTATION_ID';
const toolGroupId = 'MY_TOOLGROUP_ID';
const renderingEngineId = 'myRenderingEngine';
const viewportId1 = 'CT_AXIAL';
const viewportId2 = 'CT_SAGITTAL';
const viewportId3 = 'CT_CORONAL';

// ======== Set up page ======== //
setTitleAndDescription(
  'Labelmap Edit With Contour',
  'Here we demonstrate editing of a labelmap with contour tools.  Start inside the ' +
    'labelmap area to extend it, and have the contour extend outside.  The tool then ' +
    'converts the contour to labelmap data.  The "Axial Oblique Angle" slider tilts the ' +
    'axial plane of the first viewport by an exact angle, so that you can test the ' +
    'conversion on an oblique plane.'
);

const size = '32vw';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
const element3 = document.createElement('div');
const elements = [element1, element2, element3];
for (const el of elements) {
  el.style.width = size;
  el.style.height = '50vh';
  el.oncontextmenu = (e) => e.preventDefault();
  viewportGrid.appendChild(el);
}

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  Left drag to draw a closed contour. The tool converts the contour to labelmap
  data as soon as you close the contour.
  Press Escape to cancel the contour that you draw.
  Set "Axial Oblique Angle" above 0 to tilt the first viewport, then draw a
  contour on that oblique plane.
  `;

content.append(instructions);

// ============================= //
addDropdownToToolbar({
  options: { values: ['1', '2', '3'], defaultValue: '1' },
  labelText: 'Segment',
  onSelectedValueChange: (segmentIndex) => {
    segmentation.segmentIndex.setActiveSegmentIndex(
      segmentationId,
      Number(segmentIndex)
    );
  },
});

addButtonToToolbar({
  title: 'Reject Preview',
  onClick: () => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    const activeName = toolGroup.getActivePrimaryMouseButtonTool();
    const brush = toolGroup.getToolInstance(activeName);
    brush.rejectPreview?.(element1);
  },
});

// The camera of the axial viewport before the example applies an oblique angle.
let axialBaseCamera: {
  viewPlaneNormal: Types.Point3;
  viewUp: Types.Point3;
  focalPoint: Types.Point3;
  distance: number;
};

/**
 * Rotates the axial viewport about the world X axis by an exact angle. An
 * oblique plane has no shared X, Y or Z value across the contour points, and
 * that is the condition that this example tests.
 *
 * The rotation keeps the focal point of the first camera, so the plane always
 * turns about the centre of the volume. `setCamera` must also get the new
 * position, because `viewPlaneNormal` alone turns the camera about its
 * position, and that moves the focal point out of the volume.
 */
function setAxialObliqueAngle(degrees: number) {
  const viewport = getRenderingEngine(renderingEngineId)?.getViewport(
    viewportId1
  ) as Types.IVolumeViewport;

  if (!viewport || !axialBaseCamera) {
    return;
  }

  const { focalPoint, distance } = axialBaseCamera;
  const radians = (degrees * Math.PI) / 180;
  const origin: Types.Point3 = [0, 0, 0];
  const viewPlaneNormal = vec3.create();
  const viewUp = vec3.create();

  vec3.rotateX(
    viewPlaneNormal,
    axialBaseCamera.viewPlaneNormal,
    origin,
    radians
  );
  vec3.rotateX(viewUp, axialBaseCamera.viewUp, origin, radians);

  // The view plane normal points from the focal point towards the camera.
  const position = vec3.scaleAndAdd(
    vec3.create(),
    focalPoint as vec3,
    viewPlaneNormal,
    distance
  );

  viewport.setCamera({
    focalPoint,
    position: Array.from(position) as Types.Point3,
    viewPlaneNormal: Array.from(viewPlaneNormal) as Types.Point3,
    viewUp: Array.from(viewUp) as Types.Point3,
  });

  // The focal point above is the centre of the volume, and the centre does not
  // sit on the grid of slice positions of the new normal. `scroll(0)` moves no
  // slice, and it rounds the focal point onto the nearest slice position.
  viewport.scroll(0);
  viewport.render();
}

addSliderToToolbar({
  title: 'Axial Oblique Angle',
  range: [0, 60],
  step: 1,
  defaultValue: 0,
  onSelectedValueChange: (value) => {
    setAxialObliqueAngle(Number(value));
  },
});

// ============================= //

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  cornerstoneTools.addTool(cornerstoneTools.LabelMapEditWithContourTool);

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(cornerstoneTools.LabelMapEditWithContourTool.toolName);

  toolGroup.setToolActive(
    cornerstoneTools.LabelMapEditWithContourTool.toolName,
    {
      bindings: [
        {
          mouseButton: MouseBindings.Primary, // Left Click
        },
      ],
    }
  );

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot:
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Add some segmentations based on the source data volume
  // Create a segmentation of the same resolution as the source data
  await volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: segmentationId,
  });

  fillVolumeLabelmapWithMockData({
    volumeId: segmentationId,
    cornerstone,
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

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInputArray = [
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
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId3,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  toolGroup.addViewport(viewportId1, renderingEngineId);
  toolGroup.addViewport(viewportId2, renderingEngineId);
  toolGroup.addViewport(viewportId3, renderingEngineId);

  // Set the volume to load
  volume.load();

  // Set volumes on the viewports
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId }],
    [viewportId1, viewportId2, viewportId3]
  );

  const segMap = (segmentationId: string) => ({
    [viewportId1]: [
      {
        segmentationId,
      },
    ],
    [viewportId2]: [
      {
        segmentationId,
      },
    ],
    [viewportId3]: [
      {
        segmentationId,
      },
    ],
  });

  await segmentation.addLabelmapRepresentationToViewportMap(
    segMap(segmentationId)
  );

  // Render the image
  renderingEngine.render();

  // The slider rotates this camera, so read it after the volume sets the camera.
  const { viewPlaneNormal, viewUp, focalPoint, position } = (
    renderingEngine.getViewport(viewportId1) as Types.IVolumeViewport
  ).getCamera();

  axialBaseCamera = {
    viewPlaneNormal,
    viewUp,
    focalPoint,
    distance: vec3.distance(position, focalPoint),
  };

  elements.forEach((element) =>
    element.addEventListener(csToolsEnums.Events.KEY_DOWN, (evt) => {
      const { key, element } = evt.detail;
      if (key === 'Escape') {
        console.warn('Hello reject current bindings');
        cornerstoneTools.cancelActiveManipulations(element);
      } else if (key === 'Enter') {
        const { viewport } = getEnabledElement(element);
        cornerstoneTools.BrushTool.viewportContoursToLabelmap(viewport);
      }
    })
  );
}

run();
