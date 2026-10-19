import type {
  IImageVolume,
  VoxelGrid,
  VoxelQualityRecord,
  VoxelStatistic,
} from '../../types';
import type { DataAddOptions } from './ViewportArchitectureTypes';

/** The grid and the statistic of the base texture that a mapper holds. */
export type BoundGrid = { grid: VoxelGrid; statistic: VoxelStatistic };

/**
 * Whether a binding is a segmentation overlay, which the fidelity ignores
 * (FIDELITY-STATE-9). Render paths set `excludeFromFidelity` from it.
 */
export function isSegmentationOverlayData(
  payload: { reference?: { kind?: string } },
  options: DataAddOptions | undefined
): boolean {
  return (
    options?.role === 'overlay' && payload.reference?.kind === 'segmentation'
  );
}

/**
 * The record of the grid that the mapper holds, not of the strategy that the
 * texture set offers now: an evicted set offers no binding while the mapper
 * still draws its texture. A reduced texture fills by box average from the
 * source, so its grid needs no representation of its own. With no bound grid,
 * the render reads the composite at full resolution.
 */
export function readBoundQuality(
  imageVolume: IImageVolume,
  boundGrid: BoundGrid | undefined
): VoxelQualityRecord | undefined {
  return boundGrid
    ? imageVolume.getGridQuality(boundGrid.grid, boundGrid.statistic)
    : imageVolume.getVoxelQuality();
}
