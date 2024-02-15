import {
  Enums,
  Types,
  cache,
  eventTarget,
  getWebWorkerManager,
  triggerEvent,
} from '@cornerstonejs/core';
import { SurfaceSegmentationData } from '../../../../types/SurfaceTypes';
import { WorkerTypes } from '../../../../enums';

const workerManager = getWebWorkerManager();

const triggerWorkerProgress = (eventTarget, progress) => {
  triggerEvent(eventTarget, Enums.Events.WEB_WORKER_PROGRESS, {
    progress,
    type: WorkerTypes.POLYSEG_SURFACE_TO_LABELMAP,
  });
};

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

  triggerWorkerProgress(eventTarget, 0);

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
          triggerWorkerProgress(eventTarget, progress);
        },
      ],
    }
  );

  triggerWorkerProgress(eventTarget, 1);

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

export async function convertSurfaceToStackLabelmap() {
  // TODO
}
