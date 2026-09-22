import type {
  CoreVoxelReductionConstants,
  VoxelReductionConstants,
} from '../types/VoxelQualityRegistry';

/**
 * Shape of `Enums.VoxelReductions`. Augment {@link VoxelReductionConstants} in
 * your extension `.d.ts`; property types on `Enums.VoxelReductions` follow that
 * interface.
 */
export type VoxelReductionsMap = VoxelReductionConstants;

const builtInVoxelReductions: CoreVoxelReductionConstants = {
  None: 'none',
  BoxAverage: 'boxAverage',
  Decimation: 'decimation',
};

/**
 * Runtime constants for the kind of a reduction: how the data of a
 * representation reached its spacing.
 *
 * The three built-in kinds are available immediately. Extension kinds are added
 * when you call
 * `registerVoxelReduction({ name: 'WAVELET', reduction: 'myOrg:wavelet', aliases: false })`.
 */
const VoxelReductions = builtInVoxelReductions as VoxelReductionsMap;

export function registerVoxelReductionsConstant<
  Name extends keyof VoxelReductionConstants,
>(name: Name, reduction: VoxelReductionConstants[Name]): void {
  if (Object.prototype.hasOwnProperty.call(VoxelReductions, name)) {
    throw new Error(
      `Voxel reduction constant "${String(name)}" already exists`
    );
  }

  (VoxelReductions as Record<keyof VoxelReductionConstants, string>)[name] =
    reduction;
}

export default VoxelReductions;
