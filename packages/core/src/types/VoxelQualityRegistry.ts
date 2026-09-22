export interface CoreVoxelReductionRegistry {
  none: 'none';
  boxAverage: 'boxAverage';
  decimation: 'decimation';
}

export interface CoreVoxelReductionConstants {
  readonly None: 'none';
  readonly BoxAverage: 'boxAverage';
  readonly Decimation: 'decimation';
}

/**
 * Extensions can augment this interface to add additional kinds of a reduction,
 * e.g. `interface VoxelReductionRegistry { 'myOrg:wavelet': 'myOrg:wavelet' }`.
 */
export interface VoxelReductionRegistry extends CoreVoxelReductionRegistry {}

/**
 * Extensions augment this interface to add names on `Enums.VoxelReductions`.
 * `VoxelReductionsMap` and the runtime `Enums.VoxelReductions` object are typed
 * from this interface — update it once, e.g.:
 *
 * `interface VoxelReductionConstants { readonly WAVELET: 'myOrg:wavelet' }`
 */
export interface VoxelReductionConstants extends CoreVoxelReductionConstants {}

/**
 * HOW the data of a representation reached its spacing.
 *
 * The kind of the reduction is not the source of the data, and the two answer
 * different questions. A box average and a decimation at one spacing have a
 * DIFFERENT LOSS: a decimation keeps the high spatial frequencies and folds
 * them into the signal as an alias, so a decimation is lossy at every display
 * resolution, and a box average is lossless at a display resolution that is
 * coarser than its spacing.
 */
export type VoxelReduction =
  VoxelReductionRegistry[keyof VoxelReductionRegistry];

export interface CoreVoxelDataSourceRegistry {
  serverLevel: 'serverLevel';
  clientDerived: 'clientDerived';
  decoderSubResolution: 'decoderSubResolution';
  directLoad: 'directLoad';
}

export interface CoreVoxelDataSourceConstants {
  readonly ServerLevel: 'serverLevel';
  readonly ClientDerived: 'clientDerived';
  readonly DecoderSubResolution: 'decoderSubResolution';
  readonly DirectLoad: 'directLoad';
}

/**
 * Extensions can augment this interface to add additional sources of the data,
 * e.g. `interface VoxelDataSourceRegistry { 'myOrg:proxy': 'myOrg:proxy' }`.
 */
export interface VoxelDataSourceRegistry extends CoreVoxelDataSourceRegistry {}

/**
 * Extensions augment this interface to add names on `Enums.VoxelDataSources`.
 */
export interface VoxelDataSourceConstants
  extends CoreVoxelDataSourceConstants {}

/**
 * WHERE the data of a representation came from.
 *
 * The source states who produced the data, and the kind of the reduction states
 * what the production did to the signal. A level of a server brick store, a
 * reduction that this client computed, and a sub-resolution decode of an HTJ2K
 * frame can each carry one box average at one spacing, and a reader that
 * reports the fidelity to a user names the source.
 */
export type VoxelDataSource =
  VoxelDataSourceRegistry[keyof VoxelDataSourceRegistry];
