import type { VolumeViewport, Types } from '@cornerstonejs/core';
import {
  getRenderingEngine,
  cache,
  volumeLoader,
  Enums,
} from '@cornerstonejs/core';
import vtkMatrixBuilder from '@kitware/vtk.js/Common/Core/MatrixBuilder';
import vtkTransform from '@kitware/vtk.js/Common/Transform/Transform';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import type { mat4 } from 'gl-matrix';

function fillGapAndReplaceCachedVolume(
  volumeId: string,
  gaps?: [number, number][]
) {
  const start = performance.now();
  // If there is a gap, then it will need to construct a new volume with filled gap, and replace the cached volume
  if (gaps && gaps.length !== 0) {
    const volume = cache.getVolume(volumeId);
    const voxelManager = volume.voxelManager;
    const metadata = volume.metadata;
    const direction = volume.direction;
    const origin = volume.origin;
    const [x, y, originalZ] = volume.dimensions;
    const [sx, sy, sz] = volume.spacing;
    const pixelData = voxelManager.getCompleteScalarDataArray();
    const scalarType = voxelManager.getConstructor() as
      | Float32ArrayConstructor
      | Uint16ArrayConstructor
      | Int16ArrayConstructor;
    const sliceSize = x * y;
    const fillValue = -1000;
    const totalGapSlices = gaps.reduce(
      (acc, [start, end]) => acc + (end - start + 1),
      0
    );
    const finalZ = originalZ + totalGapSlices;
    let newPixelData = pixelData as InstanceType<typeof scalarType>;
    for (const [startIndex, endIndex] of gaps) {
      const sliceCount = endIndex - startIndex + 1;
      const before = newPixelData.slice(0, sliceSize * startIndex);
      const after = newPixelData.slice(sliceSize * startIndex);
      const prevSlice = newPixelData.slice(
        sliceSize * (startIndex - 1),
        sliceSize * startIndex
      );
      const nextSlice = newPixelData.slice(
        sliceSize * startIndex,
        sliceSize * (endIndex + 1)
      );
      // const filler = new scalarType(sliceCount * sliceSize).fill(-1000); // fillValue = -1000
      const filler = new scalarType(sliceCount * sliceSize);
      for (let i = 0; i < sliceCount; i++) {
        const alpha = (i + 1) / (sliceCount + 1);
        for (let j = 0; j < sliceSize; j++) {
          filler[i * sliceSize + j] =
            (1 - alpha) * prevSlice[j] + alpha * nextSlice[j];
        }
      }
      const combined = new scalarType(
        before.length + filler.length + after.length
      );
      combined.set(before, 0);
      combined.set(filler, before.length);
      combined.set(after, before.length + filler.length);
      newPixelData = combined;
    }
    const newSz = adjustZSpacingAfterGapFill(sz, originalZ, gaps);
    const newSpacing = [sx, sy, newSz] as Types.Point3;
    const newDimensions = [x, y, finalZ] as Types.Point3;
    volume.destroy();
    volume.removeFromCache();
    volumeLoader.createLocalVolume(volumeId, {
      metadata: metadata,
      dimensions: newDimensions,
      origin: origin,
      direction: direction,
      scalarData: newPixelData,
      spacing: newSpacing,
    });
  }

  const end = performance.now();
  console.log(`Elapsed time: ${(end - start).toFixed(2)} ms`);
}
export async function adjustVolumeDataAfterLoadForSeries(param: {
  ctInfo: {
    volumeId: string;
    gaps: [number, number][];
    matrix?: mat4;
  };
  renderingEngineId: string;
  ctViewportIds?: string[];
}) {
  fillGapAndReplaceCachedVolume(param.ctInfo.volumeId, param.ctInfo.gaps);
  if (
    param.ctViewportIds &&
    param.ctViewportIds.length !== 0 &&
    param.ctInfo.gaps.length !== 0
  ) {
    await replaceVolumeInViewports(
      param.renderingEngineId,
      param.ctViewportIds,
      param.ctInfo.volumeId
    );
  }
}
export async function adjustVolumeDataAfterLoad(param: {
  ctInfo: {
    volumeId: string;
    gaps: [number, number][];
    matrix?: mat4;
  };
  ptInfo: {
    volumeId: string;
    gaps: [number, number][];
    matrix?: mat4;
  };
  renderingEngineId: string;
  ctViewportIds?: string[];
  ptViewportIds?: string[];
  fusionViewportIds?: string[];
  threeDViewportIds?: string[];
}) {
  fillGapAndReplaceCachedVolume(param.ctInfo.volumeId, param.ctInfo.gaps);
  fillGapAndReplaceCachedVolume(param.ptInfo.volumeId, param.ptInfo.gaps);
  if (
    param.ctViewportIds &&
    param.ctViewportIds.length !== 0 &&
    param.ctInfo.gaps.length !== 0
  ) {
    await replaceVolumeInViewports(
      param.renderingEngineId,
      param.ctViewportIds,
      param.ctInfo.volumeId
    );
  }
  if (
    param.ptViewportIds &&
    param.ptViewportIds.length !== 0 &&
    param.ptInfo.gaps.length !== 0
  ) {
    await replaceVolumeInViewports(
      param.renderingEngineId,
      param.ptViewportIds,
      param.ptInfo.volumeId
    );
  }
  if (
    param.fusionViewportIds &&
    param.fusionViewportIds.length !== 0 &&
    (param.ptInfo.gaps.length !== 0 || param.ctInfo.gaps.length !== 0)
  ) {
    await replaceVolumeInFusionViewports(
      param.renderingEngineId,
      param.fusionViewportIds,
      param.ctInfo.volumeId,
      param.ptInfo.volumeId
    );
  }
  if (
    param.threeDViewportIds &&
    param.threeDViewportIds.length !== 0 &&
    param.ctInfo.gaps.length !== 0
  ) {
    await replaceVolumeInViewports(
      param.renderingEngineId,
      param.threeDViewportIds,
      param.ctInfo.volumeId
    );
  }
  if (param.ptInfo.matrix) {
    applyRegistration(
      param.ptInfo.matrix,
      param.ptInfo.volumeId,
      param.renderingEngineId,
      [...param.ptViewportIds, ...param.fusionViewportIds]
    );
  }
}
function adjustZSpacingAfterGapFill(
  originalSz: number,
  originalZ: number,
  gaps: [number, number][]
): number {
  // Slices that start at 1 are considered outside spacing calc
  const insertedSlicesAffectingSpacing = gaps
    .filter(([start, _]) => start > 1)
    .reduce((acc, [start, end]) => acc + (end - start + 1), 0);

  const totalZDistance = originalSz * (originalZ - 1);

  // Only adjust spacing if gap slices were added *within* the original measurement range
  const newZ = originalZ + insertedSlicesAffectingSpacing;

  return newZ === originalZ ? originalSz : totalZDistance / (newZ - 1);
}
async function replaceVolumeInViewports(
  renderingEngineId: string,
  viewportIds: string[],
  volumeId: string,
  immediateRender = false,
  suppressEvents = false
): Promise<void> {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  const updateTasks = viewportIds.map(async (viewportId) => {
    const viewport = renderingEngine.getViewport(viewportId) as VolumeViewport;
    const originalProps = viewport.getProperties();
    const actorUIDsToRemove = viewport
      .getActors()
      .filter((actor) => actor.referencedId === volumeId)
      .map((actor) => actor.uid);
    if (actorUIDsToRemove.length) {
      viewport.removeVolumeActors(actorUIDsToRemove);
    }
    await viewport.setVolumes(
      [{ volumeId: volumeId }],
      immediateRender,
      suppressEvents
    );
    viewport.setProperties(originalProps);
    viewport.render();
  });
  await Promise.all(updateTasks);
}
async function replaceVolumeInFusionViewports(
  renderingEngineId: string,
  viewportIds: string[],
  ctVolumeId: string,
  ptVolumeId: string,

  immediateRender = true,
  suppressEvents = false
): Promise<void> {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  const updateTasks = viewportIds.map(async (viewportId) => {
    const viewport = renderingEngine.getViewport(viewportId) as VolumeViewport;
    const ctProperties = viewport.getProperties(ctVolumeId);
    const ptProperties = viewport.getProperties(ptVolumeId);

    const actorUIDsToRemove = viewport
      .getActors()
      .filter(
        (actor) =>
          actor.referencedId === ctVolumeId || actor.referencedId === ptVolumeId
      )
      .map((actor) => actor.uid);
    if (actorUIDsToRemove.length) {
      viewport.removeVolumeActors(actorUIDsToRemove);
    }
    await viewport.setVolumes(
      [
        { volumeId: ctVolumeId },
        {
          volumeId: ptVolumeId,
          blendMode: Enums.BlendModes.AVERAGE_INTENSITY_BLEND,
        },
      ],
      immediateRender,
      suppressEvents
    );
    viewport.setProperties(ctProperties, ctVolumeId);
    viewport.setProperties(ptProperties, ptVolumeId);
    viewport.render();
  });
  await Promise.all(updateTasks);
}
async function applyRegistration(
  matrix: mat4,
  volumeId: string,
  renderingEngineId: string,
  viewportIds: string[]
) {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  const updateTasks = viewportIds.map(async (viewportId) => {
    const viewport = renderingEngine.getViewport(viewportId) as VolumeViewport;
    const actorEntry = viewport
      .getActors()
      .find((actor) => actor.referencedId === volumeId);
    if (actorEntry) {
      (actorEntry.actor as vtkVolume).setUserMatrix(matrix);
    }
  });
  await Promise.all(updateTasks);
}
