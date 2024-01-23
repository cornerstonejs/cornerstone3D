import { Types, cache } from '@cornerstonejs/core';
import { getWebWorkerManager } from '@cornerstonejs/core';
import { LabelmapSegmentationDataVolume } from '../../../../types/LabelmapTypes';

const workerManager = getWebWorkerManager();

export async function convertVolumeLabelmapToSurface(
  labelmapRepresentationData: LabelmapSegmentationDataVolume,
  segmentIndex: number
): Promise<Types.SurfaceData> {
  const volumeId = labelmapRepresentationData.volumeId;

  const volume = cache.getVolume(volumeId);

  const scalarData = volume.getScalarData();
  const { dimensions, spacing, origin, direction } = volume;

  const results = await workerManager.executeTask(
    'polySeg',
    'convertLabelmapToSurface',
    {
      scalarData,
      dimensions,
      spacing,
      origin,
      direction,
      segmentIndex,
    },
    {
      callbacks: [
        (progress) => {
          console.debug('progress', progress);
        },
      ],
    }
  );

  return results;
}

export async function convertStackLabelmapToSurface(
  labelmapRepresentationData: LabelmapSegmentationDataVolume,
  segmentIndex: number
): Types.SurfaceData {
  const volumeId = labelmapRepresentationData.volumeId;

  const volume = cache.getVolume(volumeId);

  const scalarData = volume.getScalarData();
  const { dimensions, spacing, origin, direction } = volume;

  const results = await workerManager.executeTask(
    'polySeg-contour-to-surface',
    'compute',
    {
      scalarData,
      dimensions,
      spacing,
      origin,
      direction,
      segmentIndex,
    },
    {
      callbacks: [
        (progress) => {
          console.debug('progress', progress);
        },
      ],
    }
  );

  return results;
}
