import { Types, cache, getWebWorkerManager } from '@cornerstonejs/core';
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
  const newScalarData = await workerManager.executeTask(
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

  segmentationVolume.imageData
    .getPointData()
    .getScalars()
    .setData(newScalarData);
  segmentationVolume.imageData.modified();

  // update the scalarData in the volume as well
  segmentationVolume.modified();

  return {
    volumeId: segmentationVolume.volumeId,
  };
}

export async function convertSurfaceToStackLabelmap() {}
