import type {
  CoreVoxelDataSourceConstants,
  VoxelDataSourceConstants,
} from '../types/VoxelQualityRegistry';

/**
 * Shape of `Enums.VoxelDataSources`. Augment {@link VoxelDataSourceConstants}
 * in your extension `.d.ts`; property types on `Enums.VoxelDataSources` follow
 * that interface.
 */
export type VoxelDataSourcesMap = VoxelDataSourceConstants;

const builtInVoxelDataSources: CoreVoxelDataSourceConstants = {
  /** A level that the server stores, for example a level of a brick store. */
  ServerLevel: 'serverLevel',
  /** A reduction that this client computed from a higher resolution. */
  ClientDerived: 'clientDerived',
  /** A sub-resolution decode of a frame, for example an HTJ2K byte range. */
  DecoderSubResolution: 'decoderSubResolution',
  /** A load of the data at the spacing of the representation. */
  DirectLoad: 'directLoad',
};

/**
 * Runtime constants for the source of the data: where the data of a
 * representation came from.
 *
 * The source carries no rule of its own. A reader that reports the fidelity to
 * a user names the source, and the kind of the reduction states what the
 * production did to the signal.
 */
const VoxelDataSources = builtInVoxelDataSources as VoxelDataSourcesMap;

export function registerVoxelDataSourcesConstant<
  Name extends keyof VoxelDataSourceConstants,
>(name: Name, source: VoxelDataSourceConstants[Name]): void {
  if (Object.prototype.hasOwnProperty.call(VoxelDataSources, name)) {
    throw new Error(
      `Voxel data source constant "${String(name)}" already exists`
    );
  }

  (VoxelDataSources as Record<keyof VoxelDataSourceConstants, string>)[name] =
    source;
}

export default VoxelDataSources;
