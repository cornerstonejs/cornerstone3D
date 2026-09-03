/**
 * A viewport-family-agnostic snapshot of the modality scaling state of a single
 * rendered target (image or volume).
 *
 * It answers the two questions prescaling-aware tooling repeatedly needs - "what
 * modality is this?" and "are the voxels already pre-scaled into modality units
 * (e.g. SUV)?" - without each caller having to branch on the viewport family or
 * reach for the StackViewport-only `.modality` / `.preScale` surface that the
 * native (PLANAR_NEXT) viewport does not expose.
 */
interface ScalingDescriptor {
  /**
   * Modality of the target, e.g. `'CT' | 'PT' | 'RTDOSE'`. Undefined when it
   * cannot be resolved (e.g. a generic viewport whose actor has no metadata).
   */
  modality?: string;
  /**
   * True when the voxel values backing the target are already pre-scaled into
   * modality units (HU / SUV / ...), so tooling reads modality values straight
   * off the voxels rather than re-applying the modality LUT.
   */
  isPreScaled: boolean;
}

export type { ScalingDescriptor };
