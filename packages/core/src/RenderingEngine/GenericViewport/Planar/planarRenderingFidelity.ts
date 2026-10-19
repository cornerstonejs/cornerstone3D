import ImageQualityStatus from '../../../enums/ImageQualityStatus';
import type { IImage } from '../../../types';
import type { DataAddOptions } from '../ViewportArchitectureTypes';

/**
 * Whether a planar binding is a segmentation overlay, which the fidelity
 * ignores (FIDELITY-STATE-9). Render paths set `excludeFromFidelity` from it.
 */
export function isSegmentationOverlayData(
  payload: { reference?: { kind?: string } },
  options: DataAddOptions | undefined
): boolean {
  return (
    options?.role === 'overlay' && payload.reference?.kind === 'segmentation'
  );
}

/** The quality of a stack image; an image with no status is full resolution. */
export function imageQualityStatusOf(
  image: IImage | undefined
): ImageQualityStatus | undefined {
  if (!image) {
    return undefined;
  }

  return image.imageQualityStatus ?? ImageQualityStatus.FULL_RESOLUTION;
}
