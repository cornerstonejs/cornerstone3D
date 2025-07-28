import type {
  Types,
  VolumeViewport,
  VolumeViewport3D,
} from '@cornerstonejs/core';
import {
  cache,
  Enums,
  geometryLoader,
  getRenderingEngine,
  RenderingEngine,
  setVolumesForViewports,
  volumeLoader,
  eventTarget,
  CONSTANTS,
  metaData,
  utilities,
} from '@cornerstonejs/core';

import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  addButtonToToolbar,
  addDropdownToToolbar,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import readDicomRTStructData from './readDicomRTStructData';
import type { Point3, VolumeActor } from 'core/src/types';
import { createImageIdsAndCacheMetaData2 } from '../../../../utils/demo/helpers/createImageIdsAndCacheMetaData';
import { adjustVolumeDataAfterLoadForSeries } from './adjustVolumeAfterLoad';
import applyPreset from '../../../core/src/utilities/applyPreset';
import { VIEWPORT_PRESETS } from 'core/src/constants';
import addDropDownToToolbar from '../../../../utils/demo/helpers/addDropdownToToolbar';
import {
  convertToWindowRange,
  getHistogramTemplate,
  HistogramTemplate,
  templateDictionary,
} from './histogramTemplate';

// This is for debugging purposes
console.debug(
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
  PlanarFreehandContourSegmentationTool,
  OrientationMarkerTool,
} = cornerstoneTools;
const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const segmentationId = 'MY_SEGMENTATION_ID';
const toolGroupId = 'MY_TOOLGROUP_ID';
const toolGroupId3d = 'MY_3DTOOLGROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Contour Segmentation Configuration',
  'Here we demonstrate how to configure the contour rendering. This example downloads the contour data.'
);

const size = '400px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

// Use CSS grid for 2x2 layout
viewportGrid.style.display = 'grid';
viewportGrid.style.gridTemplateColumns = `${size} ${size}`;
viewportGrid.style.gridTemplateRows = `${size} ${size}`;
viewportGrid.style.gap = '0px'; // No spacing between viewports
viewportGrid.style.width = `calc(2 * ${size})`;
viewportGrid.style.height = `calc(2 * ${size})`;

// Create each viewport element
const element1 = document.createElement('div');
element1.oncontextmenu = () => false;
element1.style.width = size;
element1.style.height = size;
const element2 = document.createElement('div');
element2.oncontextmenu = () => false;
element2.style.width = size;
element2.style.height = size;
const element3 = document.createElement('div');
element3.oncontextmenu = () => false;
element3.style.width = size;
element3.style.height = size;
const element4 = document.createElement('div');
element4.oncontextmenu = () => false;
element4.style.width = size;
element4.style.height = size;
// Add to the grid in order
viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);
viewportGrid.appendChild(element4);

// Add to page
content.appendChild(viewportGrid);

SetPolySegEventListener(LoadContourOnRemainViewports);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
content.append(instructions);

const viewportIds = ['CT_AXIAL', 'CT_SAGITTAL', 'CT_CORONAL', 'CT_3D'];
let geometryIds;
let assumedSurfaceIds;
const renderingEngineId = 'myRenderingEngine';
let renderingEngine: RenderingEngine;
let resizeObserver: ResizeObserver;
let roiColors;
// ============================= //
addDropdownToToolbar({
  options: {
    values: [
      HistogramTemplate.DEFAULT,
      HistogramTemplate.CT_Abdomen,
      HistogramTemplate.CT_Angio,
      HistogramTemplate.CT_Bone,
      HistogramTemplate.Brain,
      HistogramTemplate.CT_Chest,
      HistogramTemplate.CT_Lung,
    ],
    defaultValue: HistogramTemplate.DEFAULT,
  },
  onSelectedValueChange: (value) => {
    const histogram = getHistogramTemplate(value);
    const { lower, upper } = convertToWindowRange(
      histogram.windowWidth,
      histogram.windowLevel
    );
    [viewportIds[0], viewportIds[1], viewportIds[2]].forEach((vpId) => {
      const viewport = renderingEngine.getViewport(vpId) as VolumeViewport;
      viewport.setProperties({
        voiRange: { lower, upper },
      });
      viewport.render();
    });
  },
});
addButtonToToolbar({
  title: 'test2',
  onClick: async () => {
    const viewport = renderingEngine.getViewport(viewportIds[3]);
  },
});
addButtonToToolbar({
  title: 'Remove Study and Contour',
  onClick: async () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    viewportIds.map((viewportId) => {
      const viewport = renderingEngine.getViewport(viewportId);
      viewport.removeAllActors();
    });
    geometryIds.forEach((geometryId) => {
      cache.removeGeometryLoadObject(geometryId);
    });
    assumedSurfaceIds.forEach((surfaceId) => {
      cache.removeGeometryLoadObject(surfaceId);
    });

    segmentation.removeAllSegmentationRepresentations();
    segmentation.removeAllSegmentations();
    // Add this line
    cornerstoneTools.annotation.state.removeAllAnnotations();
    cornerstoneTools.contourDisplay.clearContourDisplayCache();
    cache.removeVolumeLoadObject(volumeId);
    cache.purgeCache();
    // SetToolGroup();
  },
});
addButtonToToolbar({
  title: 'Load Study 1',
  onClick: async () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const metadata = await createImageIdsAndCacheMetaData2({
      StudyInstanceUID: '1.2.840.113729.1.7009.2692.2024.11.12.3.22.40.49.3584',
      SeriesInstanceUID:
        '1.2.840.113729.1.7009.2692.2024.11.12.3.22.50.772.9228',
      wadoRsRoot: 'http://localhost:800/dicom-web',
    });
    const imageIds = metadata.imageIds;
    const volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    });
    volume.load((evt) => {
      if (evt.success && evt.complete) {
        setTimeout(async () => {
          await adjustVolumeDataAfterLoadForSeries({
            ctInfo: {
              volumeId: volumeId,
              gaps: metadata.gaps,
            },
            renderingEngineId: renderingEngineId,
            ctViewportIds: viewportIds,
          });
        }, 50);
      }
    });
    await setVolumesForViewports(renderingEngine, [{ volumeId }], viewportIds);
    (
      renderingEngine.getViewport(viewportIds[3]) as VolumeViewport3D
    ).setProperties({
      preset: 'CT-Bone',
    });

    // Render the image
    renderingEngine.render();
  },
});
addButtonToToolbar({
  title: 'Load Contour 1',
  onClick: async () => {
    const contourData = await readDicomRTStructData({
      StudyInstanceUID: '1.2.840.113729.1.7009.2692.2024.11.12.3.22.40.49.3584',
      SeriesInstanceUID:
        '1.2.840.113729.1.7009.2692.2024.11.12.3.22.50.952.9528',
      wadoRsRoot: 'http://localhost:800/dicom-web',
    });
    roiColors = contourData.contourSets.map((cs) => cs.color);
    const data = await createAndCacheGeometriesFromContours(
      contourData,
      segmentationId
    );
    geometryIds = data.geometryIds;
    assumedSurfaceIds = data.assumedSurfaceIds;
    segmentation.segmentationStyle.setStyle(
      { type: csToolsEnums.SegmentationRepresentations.Contour },
      {
        renderOutline: true,
        renderFill: false,
        renderFillInactive: true,
      }
    );
    // Add the segmentations to state
    await segmentation.addSegmentations([
      {
        segmentationId,
        representation: {
          type: csToolsEnums.SegmentationRepresentations.Contour,
          data: {
            geometryIds: geometryIds,
          },
        },
      },
    ]);
    // Add the segmentation representation to the viewport
    await segmentation.addContourRepresentationToViewportMap({
      [viewportIds[0]]: [
        { segmentationId, config: { colorLUTOrIndex: roiColors } },
      ],
      [viewportIds[1]]: [
        { segmentationId, config: { colorLUTOrIndex: roiColors } },
      ],
    });
  },
});

addButtonToToolbar({
  title: 'Load Study 2',
  onClick: async () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const metadata = await createImageIdsAndCacheMetaData2({
      StudyInstanceUID: '1.2.156.112736.1.2.2.1097583607.12296.1695818166.610',
      SeriesInstanceUID:
        '1.2.840.113729.1.4237.9996.2023.9.15.17.48.36.250.10076',
      wadoRsRoot: 'http://localhost:800/dicom-web',
    });
    const imageIds = metadata.imageIds;
    const volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    });
    await setVolumesForViewports(renderingEngine, [{ volumeId }], viewportIds);
    (
      renderingEngine.getViewport(viewportIds[3]) as VolumeViewport3D
    ).setProperties({
      preset: 'CT-Bone',
    });
    volume.load(async (evt) => {
      if (evt.success && evt.complete) {
        requestAnimationFrame(async () => {
          await adjustVolumeDataAfterLoadForSeries({
            ctInfo: {
              volumeId: volumeId,
              gaps: metadata.gaps,
            },
            renderingEngineId: renderingEngineId,
            ctViewportIds: viewportIds,
          });
        });
      }
    });
    renderingEngine.render();
  },
});
addButtonToToolbar({
  title: 'Load Contour 2',
  onClick: async () => {
    const contourData = await readDicomRTStructData({
      StudyInstanceUID: '1.2.156.112736.1.2.2.1097583607.12296.1695818166.610',
      SeriesInstanceUID:
        '1.2.840.113729.1.4237.9996.2023.9.15.17.48.36.516.10466',
      wadoRsRoot: 'http://localhost:800/dicom-web',
    });
    roiColors = contourData.contourSets.map((cs) => cs.color);
    const data = await createAndCacheGeometriesFromContours(
      contourData,
      segmentationId
    );

    geometryIds = data.geometryIds;
    assumedSurfaceIds = data.assumedSurfaceIds;
    segmentation.addSegmentations([
      {
        segmentationId,
        representation: {
          type: csToolsEnums.SegmentationRepresentations.Contour,
          data: {
            geometryIds: geometryIds,
          },
        },
      },
    ]);
    await segmentation.addContourRepresentationToViewportMap({
      [viewportIds[0]]: [
        {
          segmentationId: segmentationId,
          config: { colorLUTOrIndex: roiColors },
        },
      ],
      [viewportIds[1]]: [
        {
          segmentationId: segmentationId,
          config: { colorLUTOrIndex: roiColors },
        },
      ],
    });
  },
});

addButtonToToolbar({
  title: 'Load Study 3',
  onClick: async () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const metadata = await createImageIdsAndCacheMetaData2({
      StudyInstanceUID:
        '1.3.6.1.4.1.5962.99.1.2968617883.1314880426.1493322302363.3.0',
      SeriesInstanceUID:
        '1.3.6.1.4.1.5962.99.1.2968617883.1314880426.1493322302363.4.0',
      wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
    });
    const imageIds = metadata.imageIds;
    const volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    });
    await setVolumesForViewports(renderingEngine, [{ volumeId }], viewportIds);
    (
      renderingEngine.getViewport(viewportIds[3]) as VolumeViewport3D
    ).setProperties({
      preset: 'CT-Bone',
    });
    volume.load(async (evt) => {
      if (evt.success && evt.complete) {
        requestAnimationFrame(async () => {
          await adjustVolumeDataAfterLoadForSeries({
            ctInfo: {
              volumeId: volumeId,
              gaps: metadata.gaps,
            },
            renderingEngineId: renderingEngineId,
            ctViewportIds: viewportIds,
          });
        });
      }
    });
    renderingEngine.render();
  },
});
addButtonToToolbar({
  title: 'Load Contour 3',
  onClick: async () => {
    const contourData = await readDicomRTStructData({
      StudyInstanceUID:
        '1.3.6.1.4.1.5962.99.1.2968617883.1314880426.1493322302363.3.0',
      SeriesInstanceUID:
        '1.3.6.1.4.1.5962.99.1.2968617883.1314880426.1493322302363.268.0',
      wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
    });
    roiColors = contourData.contourSets.map((cs) => cs.color);
    const data = await createAndCacheGeometriesFromContours(
      contourData,
      segmentationId
    );

    geometryIds = data.geometryIds;
    assumedSurfaceIds = data.assumedSurfaceIds;
    segmentation.addSegmentations([
      {
        segmentationId,
        representation: {
          type: csToolsEnums.SegmentationRepresentations.Contour,
          data: {
            geometryIds: geometryIds,
          },
        },
      },
    ]);
    await segmentation.addContourRepresentationToViewportMap({
      [viewportIds[0]]: [
        {
          segmentationId: segmentationId,
          config: { colorLUTOrIndex: roiColors },
        },
      ],
      [viewportIds[1]]: [
        {
          segmentationId: segmentationId,
          config: { colorLUTOrIndex: roiColors },
        },
      ],
    });
  },
});

addButtonToToolbar({
  title: 'Load Study 4',
  onClick: async () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const metadata = await createImageIdsAndCacheMetaData2({
      StudyInstanceUID: '1.2.156.112736.1.2.2.3622857922.12836.1746688702.428',
      SeriesInstanceUID: '1.2.156.112736.1.3.2.3622857922.12836.1746688748.433',
      wadoRsRoot: 'http://localhost:800/dicom-web',
    });
    const imageIds = metadata.imageIds;
    const volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    });
    await setVolumesForViewports(renderingEngine, [{ volumeId }], viewportIds);
    (
      renderingEngine.getViewport(viewportIds[3]) as VolumeViewport3D
    ).setProperties({
      preset: 'CT-Bone',
    });
    volume.load(async (evt) => {
      if (evt.success && evt.complete) {
        requestAnimationFrame(async () => {
          await adjustVolumeDataAfterLoadForSeries({
            ctInfo: {
              volumeId: volumeId,
              gaps: metadata.gaps,
            },
            renderingEngineId: renderingEngineId,
            ctViewportIds: viewportIds,
          });
        });
      }
    });
    renderingEngine.render();
  },
});
addButtonToToolbar({
  title: 'Load Contour 4',
  onClick: async () => {
    const contourData = await readDicomRTStructData({
      StudyInstanceUID: '1.2.156.112736.1.2.2.3622857922.12836.1746688702.428',
      SeriesInstanceUID:
        '1.2.840.113729.1.49390.29332.2025.5.8.7.19.26.490.36701',
      wadoRsRoot: 'http://localhost:800/dicom-web',
    });
    roiColors = contourData.contourSets.map((cs) => cs.color);
    const data = await createAndCacheGeometriesFromContours(
      contourData,
      segmentationId
    );

    geometryIds = data.geometryIds;
    assumedSurfaceIds = data.assumedSurfaceIds;
    segmentation.addSegmentations([
      {
        segmentationId,
        representation: {
          type: csToolsEnums.SegmentationRepresentations.Contour,
          data: {
            geometryIds: geometryIds,
          },
        },
      },
    ]);
    await segmentation.addContourRepresentationToViewportMap({
      [viewportIds[0]]: [
        {
          segmentationId: segmentationId,
          config: { colorLUTOrIndex: roiColors },
        },
      ],
      [viewportIds[1]]: [
        {
          segmentationId: segmentationId,
          config: { colorLUTOrIndex: roiColors },
        },
      ],
    });
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();
  renderingEngine = new RenderingEngine(renderingEngineId);
  resizeObserver = new ResizeObserver(() => {
    renderingEngine = getRenderingEngine(renderingEngineId);
    if (renderingEngine) {
      renderingEngine.resize(true, false);
    }
  });
  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(TrackballRotateTool);
  cornerstoneTools.addTool(PlanarFreehandContourSegmentationTool);
  cornerstoneTools.addTool(OrientationMarkerTool);

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM

  // Define a volume in memory

  // Instantiate a rendering engine

  // Create the viewports

  const viewportInputArray = [
    {
      viewportId: viewportIds[0],
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
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
    {
      viewportId: viewportIds[2],
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[3],
      type: ViewportType.VOLUME_3D,
      element: element4,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: CONSTANTS.BACKGROUND_COLORS.slicer3D as Point3,
      },
    },
  ];
  [element1, element2, element3, element4].forEach((element) => {
    resizeObserver.observe(element);
  });
  renderingEngine.setViewports(viewportInputArray);
  const temp = renderingEngine.getViewport(viewportIds[3]) as VolumeViewport3D;
  segmentation.removeAllSegmentationRepresentations();
  segmentation.state.removeAllSegmentationRepresentations();
  temp.setProperties({
    preset: 'CT-Bone',
  });
  SetToolGroup();
  // segmentation.segmentationStyle.setStyle(
  //   { type: csToolsEnums.SegmentationRepresentations.Contour },
  //   {
  //     renderOutline: true,
  //     renderFill: false,
  //     renderFillInactive: true,
  //   }
  // );
}

run();

async function createAndCacheGeometriesFromContours(
  contourData,
  segmentationId
): Promise<{ geometryIds: string[]; assumedSurfaceIds: string[] }> {
  const geometryIds: string[] = [];
  const assumedSurfaceIds: string[] = [];

  const promises = contourData.contourSets.map((contourSet, index) => {
    if (contourSet.data.length > 0) {
      const geometryId = contourSet.id;
      const surfaceId = `segmentation_${segmentationId}_surface_${index + 1}`;
      geometryIds.push(geometryId);
      assumedSurfaceIds.push(surfaceId);
      return geometryLoader.createAndCacheGeometry(geometryId, {
        type: Enums.GeometryType.CONTOUR,
        geometryData: contourSet,
      });
    }

    return Promise.resolve(); // Fill empty slot with a resolved promise
  });

  await Promise.all(promises);

  return { geometryIds, assumedSurfaceIds };
}

function SetToolGroup() {
  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  const threeDToolGroup = ToolGroupManager.createToolGroup(toolGroupId3d);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(PlanarFreehandContourSegmentationTool.toolName);
  toolGroup.addTool(OrientationMarkerTool.toolName);
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

  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel,
      },
    ],
  });
  toolGroup.setToolActive(PlanarFreehandContourSegmentationTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Fifth_Button,
      },
    ],
  });
  toolGroup.setToolActive(OrientationMarkerTool.toolName);
  toolGroup.addViewport(viewportIds[0], renderingEngineId);
  toolGroup.addViewport(viewportIds[1], renderingEngineId);
  toolGroup.addViewport(viewportIds[2], renderingEngineId);
  threeDToolGroup.addTool(PanTool.toolName);
  threeDToolGroup.addTool(ZoomTool.toolName);
  threeDToolGroup.addTool(StackScrollTool.toolName);
  // threeDToolGRoup.addTool(SegmentationDisplayTool.toolName);
  threeDToolGroup.addTool(TrackballRotateTool.toolName);

  // threeDToolGRoup.setToolActive(ScaleOverlayTool.toolName);
  threeDToolGroup.setToolActive(TrackballRotateTool.toolName, {
    bindings: [
      {
        mouseButton: csToolsEnums.MouseBindings.Primary,
      },
    ],
  });
  threeDToolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: csToolsEnums.MouseBindings.Auxiliary, // Middle Click
      },
    ],
  });
  threeDToolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: csToolsEnums.MouseBindings.Secondary, // Right Click
      },
    ],
  });
  threeDToolGroup.setToolEnabled(OrientationMarkerTool.toolName);
  threeDToolGroup.addViewport(viewportIds[3], renderingEngineId);
}

function SetPolySegEventListener(onComplete?: () => void) {
  const activeProgress = new Map<string, number>();
  eventTarget.reset();
  eventTarget.addEventListener(Enums.Events.WEB_WORKER_PROGRESS, (evt) => {
    const { progress, type } = evt.detail;
    if (type === 'Converting Contour to Surface') {
      if (progress === 0 && !activeProgress.has(type)) {
        console.log('Converting Contour to Surface In Progress...');
        activeProgress.set(type, performance.now());
      }

      if (progress === -1 && activeProgress.has(type)) {
        console.log(
          `Converting Contour to Surface Completed. Took: ${(
            performance.now() - activeProgress.get(type)
          ).toFixed(2)} ms`
        );
        activeProgress.delete(type);
        if (onComplete) {
          onComplete();
        }
      }
    }
    if (type === 'Clipping Surfaces') {
      if (progress === 0 && !activeProgress.has(type)) {
        console.log('Clipping Surfaces In Progress...');
        activeProgress.set(type, performance.now());
      }

      if (progress === 100 && activeProgress.has(type)) {
        console.log(
          `Clipping Surfaces Completed. Took: ${(
            performance.now() - activeProgress.get(type)
          ).toFixed(2)} ms`
        );
        activeProgress.delete(type);
      }
    }
  });
}

function LoadContourOnRemainViewports() {
  segmentation.addContourRepresentationToViewportMap({
    // [viewportIds[0]]: [{ segmentationId }],
    // [viewportIds[1]]: [{ segmentationId }],
    [viewportIds[2]]: [
      {
        segmentationId: segmentationId,
        config: { colorLUTOrIndex: roiColors },
      },
    ],
  });

  segmentation.addSurfaceRepresentationToViewport(viewportIds[3], [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Surface,
      config: { colorLUTOrIndex: roiColors },
    },
  ]);
}
