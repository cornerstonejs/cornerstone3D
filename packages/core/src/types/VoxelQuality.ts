import type ImageQualityStatus from '../enums/ImageQualityStatus';
import type BoundsIJK from './BoundsIJK';
import type Point3 from './Point3';
import type { VoxelGrid } from './VoxelGrid';
import type { VoxelDataSource, VoxelReduction } from './VoxelQualityRegistry';

/** One delivery of a loader, and the quality of the data that it carried. */
export type DeliveredRegion = {
  /**
   * The region that the delivery covered, in the index space of the
   * representation that holds it, as `[[minI, maxI], [minJ, maxJ], [minK,
   * maxK]]`.
   */
  bounds: BoundsIJK;
  /** The quality of the data of that region. */
  quality: ImageQualityStatus;
};

/** The definition of one kind of a reduction. */
export interface VoxelReductionDefinition {
  /** The identifier of the kind. */
  reduction: VoxelReduction;
  /**
   * WHETHER THIS KIND OF A REDUCTION ALIASES. A reduction that aliases folds
   * the high spatial frequencies into the signal, and no display resolution
   * removes that error, so a verdict reports a view of such data as lossy at
   * every magnification. A reduction that does not alias is lossless at a
   * display resolution that its spacing can carry.
   */
  aliases: boolean;
  /** A short description, for a user interface and for a log. */
  description?: string;
}

/**
 * WHAT A REGION OF ONE REPRESENTATION HOLDS, as an ABSOLUTE RECORD.
 *
 * THE RECORD STATES NO VERDICT. It says which data exists, at which spacing,
 * with which loss, and how much is missing. A reader compares the record
 * against its own requirement with `compareVoxelQuality`, and two viewports
 * over one volume can therefore reach a different answer from one record.
 *
 * The record is a fact about the data, so a caller can cache a record. A
 * verdict belongs to a pair — the data, and the reader that uses the data — so
 * a caller must not cache a verdict.
 */
export type VoxelQualityRecord = {
  /** The grid that this record describes, whose spacing the verdict reads. */
  grid: VoxelGrid;
  /** HOW the data reached this spacing. */
  reduction: VoxelReduction;
  /** WHERE the data came from. */
  source: VoxelDataSource;
  /** The lowest quality among the deliveries that meet the region. */
  lowest: ImageQualityStatus;
  /** The highest quality among the deliveries that meet the region. */
  highest: ImageQualityStatus;
  /** The number of voxels of this representation that the region covers. */
  voxels: number;
  /** The number of those voxels that no delivery has covered yet. */
  missing: number;
  /** The number of deliveries that meet the region. */
  deliveries: number;
  /**
   * Whether `missing` is exact. A record that is not exact NEVER STATES LESS
   * THAN WHAT IS MISSING, so a reader that trusts the record errs towards "the
   * data is not complete", and never towards a wrong statement of completeness.
   */
  exact: boolean;
  /**
   * The comparable summary of this record, which the code derives from the
   * record. Every existing `minQuality` floor and every existing guard against
   * a regression of the quality reads this value, and those call sites
   * therefore keep working.
   */
  status: ImageQualityStatus;
};

/** What one reader needs of the data. */
export type VoxelQualityRequirement = {
  /**
   * The distance in world units that ONE DISPLAY PIXEL covers, on each axis of
   * the grid. A viewport that shows one voxel of 1 mm on 4 display pixels needs
   * 0.25 mm, and a viewport at a low magnification needs more than the spacing
   * of the data.
   *
   * A reader that states nothing here asks for the data at its own spacing, and
   * the resolution then never makes a view lossy.
   */
  displaySpacing?: Point3;
  /**
   * How many voxels of the region the reader accepts as missing. The default is
   * 0, so any missing data makes a view lossy.
   */
  missingAllowed?: number;
  /**
   * The lowest comparable summary that the reader accepts. A reader that states
   * nothing here accepts every summary, and the other fields decide.
   */
  minStatus?: ImageQualityStatus;
};

/** Why a view of the data is not lossless. */
export type VoxelQualityCause =
  /** The spacing of the data is coarser than one display pixel. */
  | 'resolution'
  /** The reduction that produced the data aliases, so a display cannot undo it. */
  | 'aliasing'
  /** Some of the data of the region has not arrived. */
  | 'missingData'
  /** The comparable summary is below what the reader accepts. */
  | 'quality';

/**
 * WHAT ONE READER GETS FROM ONE RECORD.
 *
 * A verdict belongs to the pair of the data and the reader. Two viewports over
 * one volume can hold one record and a different verdict at one moment, and
 * both verdicts are correct.
 */
export type VoxelQualityVerdict = {
  /** Whether this reader sees everything that the full resolution would show. */
  lossless: boolean;
  /** Every reason that the view is not lossless, and an empty list when it is. */
  causes: VoxelQualityCause[];
  /**
   * How much coarser the data is than one display pixel, on the axis where the
   * difference is largest. A value of 1 or below states that the spacing of the
   * data carries the display, and a value of 4 states that one voxel covers
   * four display pixels on that axis.
   */
  magnitude: number;
  /** The record that produced this verdict. */
  record: VoxelQualityRecord;
};
