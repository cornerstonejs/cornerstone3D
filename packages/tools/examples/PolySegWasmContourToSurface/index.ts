import ICRPolySeg from '@icr/polyseg-wasm';
import {
  cache,
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  utilities,
  geometryLoader,
  CONSTANTS,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';
import assetsURL from '../../../../utils/assets/assetsURL.json';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  SegmentationDisplayTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  ZoomTool,
  PanTool,
  StackScrollMouseWheelTool,
  TrackballRotateTool,
} = cornerstoneTools;
const { MouseBindings } = csToolsEnums;
const { ViewportType, GeometryType } = Enums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const segmentationId = 'MY_SEGMENTATION_ID';
const toolGroupId = 'MY_TOOLGROUP_ID';
const toolGroupId3d = 'MY_TOOLGROUP_ID_3d';
const geometryIds = [];
let polySeg = undefined;

addButtonToToolbar({
  title: 'Convert contour to closed surface',
  onClick: async () => {
    if (!polySeg) {
      return;
    }
    const geometry = cache.getGeometry(geometryIds[0]);
    const contourSet = geometry.data;

    const pointsArray = contourSet.getNumberOfPointsArray();
    const flatPoints = [];
    contourSet.contours.forEach((contour) => {
      const contourFlatPoints = contour.getFlatPointsArray();
      flatPoints.push(...contourFlatPoints);
    });

    const flatPointsWasm = new Float32Array(flatPoints);
    const pointsArrayWasm = new Float32Array(pointsArray);
    const result = polySeg.instance.convertContourRoiToSurface(
      flatPointsWasm,
      pointsArrayWasm
    );

    const closedSurface = {
      id: 'closedSurface',
      color: contourSet.getColor(),
      frameOfReferenceUID: 'test-frameOfReferenceUID',
      data: {
        points: result.points,
        polys: result.polys,
      },
    };
    const geometryId = closedSurface.id;
    const segmentationId = geometryId;
    geometryLoader.createAndCacheGeometry(geometryId, {
      type: GeometryType.SURFACE,
      geometryData: closedSurface as Types.PublicSurfaceData,
    });

    // Add the segmentations to state
    await segmentation.addSegmentations([
      {
        segmentationId,
        representation: {
          // The type of segmentation
          type: csToolsEnums.SegmentationRepresentations.Surface,
          // The actual segmentation data, in the case of contour geometry
          // this is a reference to the geometry data
          data: {
            geometryId,
          },
        },
      },
    ]);
    await segmentation.addSegmentationRepresentations(toolGroupId, [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Surface,
      },
    ]);
  },
});

// ======== Set up page ======== //
setTitleAndDescription(
  'PolySEG: converting Contour to surface for segmentation',
  'Here we demonstrate how to convert a contour to a closed surface for segmentation. Note that this example downloads the contour data from the server, but the surface conversion is done in the browser using WebAssembly.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
element1.oncontextmenu = () => false;
element2.oncontextmenu = () => false;

element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
content.append(instructions);
// ============================= //

async function addSegmentationsToState() {
  const contour = await fetch(assetsURL.SampleContour).then((res) =>
    res.json()
  );

  // load the contour data
  const promises = contour.contourSets.map((contourSet) => {
    const geometryId = contourSet.id;
    geometryIds.push(geometryId);
    return geometryLoader.createAndCacheGeometry(geometryId, {
      type: GeometryType.CONTOUR,
      geometryData: contourSet as Types.PublicContourSetData,
    });
  });

  await Promise.all(promises);

  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Contour,
        // The actual segmentation data, in the case of contour geometry
        // this is a reference to the geometry data
        data: {
          geometryIds,
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

  polySeg = await new ICRPolySeg();
  polySeg.initialize(/*{ updateProgress: updateProgressThrottled }*/);
  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(SegmentationDisplayTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(TrackballRotateTool);

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  const toolGroup3d = ToolGroupManager.createToolGroup(toolGroupId3d);

  const tools = [
    SegmentationDisplayTool.toolName,
    PanTool.toolName,
    ZoomTool.toolName,
    StackScrollMouseWheelTool.toolName,
    TrackballRotateTool.toolName,
  ];

  const bindings = [
    {
      mouseButton: MouseBindings.Primary,
    },
  ];

  const bindingsRightClick = [
    {
      mouseButton: MouseBindings.Secondary, // Right Click
    },
  ];

  tools.forEach((tool) => {
    toolGroup.addTool(tool);
    toolGroup3d.addTool(tool);
  });

  toolGroup3d.addTool(TrackballRotateTool.toolName, {
    configuration: { volumeId },
  });

  toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);
  toolGroup3d.setToolEnabled(SegmentationDisplayTool.toolName);

  toolGroup.setToolActive(TrackballRotateTool.toolName, { bindings });
  toolGroup.setToolActive(ZoomTool.toolName, { bindings: bindingsRightClick });
  toolGroup3d.setToolActive(TrackballRotateTool.toolName, { bindings });
  toolGroup3d.setToolActive(ZoomTool.toolName, {
    bindings: bindingsRightClick,
  });

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Add some segmentations based on the source data volume
  await addSegmentationsToState();

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportId1 = 'CT_3D_1';
  const viewportId2 = 'CT_3D';

  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.VOLUME_3D,
      element: element2,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0.6, 0.2],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.VOLUME_3D,
      element: element1,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  toolGroup.addViewport(viewportId1, renderingEngineId);
  toolGroup3d.addViewport(viewportId2, renderingEngineId);

  // Set the volume to load
  volume.load();

  const presets = ['CT-Bone', 'CT-Cardiac'];
  // Set volumes on the viewports
  setVolumesForViewports(
    renderingEngine,
    [{ volumeId }],
    [viewportId1, viewportId2]
  ).then(() => {
    [viewportId1, viewportId2].forEach((viewportId, index) => {
      const viewport = renderingEngine.getViewport(viewportId);
      const volumeActor = viewport.getDefaultActor().actor as Types.VolumeActor;
      utilities.applyPreset(
        volumeActor,
        CONSTANTS.VIEWPORT_PRESETS.find(
          (preset) => preset.name === presets[index]
        )
      );

      const renderer = viewport.getRenderer();
      renderer.getActiveCamera().elevation(-70);
      viewport.setCamera({ parallelScale: 600 });

      viewport.render();
    });
  });

  // // Add the segmentation representation to the toolgroup
  await segmentation.addSegmentationRepresentations(toolGroupId3d, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Contour,
    },
  ]);

  // Render the image
  renderingEngine.render();
}

run();
