import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  utilities,
  volumeLoader,
} from '@cornerstonejs/core';
import * as cornerstone from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import { getBooleanUrlParam } from '../../../../utils/demo/helpers/exampleParameters';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { fillVolumeLabelmapWithMockData } from '../../../../utils/test/testUtils';
import { SegmentationRepresentations } from '../../src/enums';
import { triggerSegmentationDataModified } from '../../src/stateManagement/segmentation/triggerSegmentationEvents';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ToolGroupManager, segmentation } = cornerstoneTools;

const { ViewportType } = Enums;

const volumeName = 'CT_VOLUME_ID';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const volumeId = `${volumeLoaderScheme}:${volumeName}`;
const segmentationId = 'MY_SEGMENTATION_ID';
const toolGroupId = 'MY_TOOLGROUP_ID';
const dataId = 'labelmap-rendering-next:source';

function getNextExampleBackground(): Types.Point3 {
  return getBooleanUrlParam('cpu') ? [0, 0, 0] : [0, 0.2, 0];
}

setTitleAndDescription(
  'Labelmap Rendering over source data',
  'Here we demonstrate rendering of a mock ellipsoid labelmap over source data'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
const element3 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;
element3.style.width = size;
element3.style.height = size;

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);

content.appendChild(viewportGrid);

async function run() {
  const config = (window as any).IS_TILED
    ? { core: { renderingEngineMode: 'tiled' } }
    : {};
  await initDemo(config);

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportId1 = 'CT_AXIAL';
  const viewportId2 = 'CT_SAGITTAL';
  const viewportId3 = 'CT_CORONAL';
  const viewportIds = [viewportId1, viewportId2, viewportId3];
  const viewportInputs = [
    {
      viewportId: viewportId1,
      orientation: Enums.OrientationAxis.AXIAL,
      element: element1,
    },
    {
      viewportId: viewportId2,
      orientation: Enums.OrientationAxis.SAGITTAL,
      element: element2,
    },
    {
      viewportId: viewportId3,
      orientation: Enums.OrientationAxis.CORONAL,
      element: element3,
    },
  ];

  renderingEngine.setViewports(
    viewportInputs.map(({ viewportId, orientation, element }) => ({
      viewportId,
      type: ViewportType.PLANAR_NEXT,
      element,
      defaultOptions: {
        orientation,
        background: getNextExampleBackground(),
      },
    }))
  );

  toolGroup.addViewport(viewportId1, renderingEngineId);
  toolGroup.addViewport(viewportId2, renderingEngineId);
  toolGroup.addViewport(viewportId3, renderingEngineId);

  volume.load();

  utilities.viewportNextDataSetMetadataProvider.add(dataId, {
    kind: 'planar',
    imageIds,
    initialImageIdIndex: Math.floor(imageIds.length / 2),
    volumeId,
  });

  await Promise.all(
    viewportInputs.map(async ({ viewportId, orientation }) => {
      const viewport = renderingEngine.getViewport(
        viewportId
      ) as PlanarViewport;

      await viewport.setDataList([
        {
          dataId,
          options: {
            orientation,
          },
        },
      ]);
    })
  );

  renderingEngine.renderViewports(viewportIds);

  volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: segmentationId,
  });

  fillVolumeLabelmapWithMockData({
    volumeId: segmentationId,
    cornerstone,
  });

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: SegmentationRepresentations.Labelmap,
        data: {
          volumeId: segmentationId,
        },
      },
    },
  ]);

  const segmentationRepresentation = {
    segmentationId,
  };

  await segmentation.addLabelmapRepresentationToViewportMap({
    [viewportIds[0]]: [segmentationRepresentation],
    [viewportIds[1]]: [segmentationRepresentation],
    [viewportIds[2]]: [segmentationRepresentation],
  });

  triggerSegmentationDataModified(segmentationId);
}

run();
