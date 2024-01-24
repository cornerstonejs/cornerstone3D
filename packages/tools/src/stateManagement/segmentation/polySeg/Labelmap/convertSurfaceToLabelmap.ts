import {
  Types,
  cache,
  getWebWorkerManager,
  volumeLoader,
} from '@cornerstonejs/core';
import { SurfaceSegmentationData } from '../../../../types/SurfaceTypes';

const workerManager = getWebWorkerManager();

export async function convertSurfaceToVolumeLabelmap(
  surfaceRepresentationData: SurfaceSegmentationData,
  segmentationVolume: Types.IImageVolume
) {
  const { geometryIds } = surfaceRepresentationData;
  if (!geometryIds?.size) {
    throw new Error('No geometry IDs found for surface representation');
  }

  const segmentsInfo = new Map() as Map<
    number,
    {
      points: number[];
      polys: number[];
    }
  >;

  geometryIds.forEach((geometryId, segmentIndex) => {
    const geometry = cache.getGeometry(geometryId);
    const geometryData = geometry.data as Types.ISurface;
    const points = geometryData.getPoints();
    const polys = geometryData.getPolys();

    segmentsInfo.set(segmentIndex, {
      points,
      polys,
    });
  });

  const { dimensions, direction, origin, spacing } = segmentationVolume;
  const results = await workerManager.executeTask(
    'polySeg',
    'convertSurfacesToVolumeLabelmap',
    {
      segmentsInfo,
      dimensions,
      spacing,
      direction,
      origin,
    },
    {
      callbacks: [
        (progress) => {
          console.debug('progress', progress);
        },
      ],
    }
  );

  const scalarData = results;
  const volumeId = 'segment1';
  await volumeLoader.createLocalVolume(
    {
      dimensions,
      direction,
      origin,
      metadata: {},
      scalarData,
      spacing,
    },
    volumeId
  );

  return {
    volumeId,
  };
}

export async function convertSurfaceToStackLabelmap() {}
