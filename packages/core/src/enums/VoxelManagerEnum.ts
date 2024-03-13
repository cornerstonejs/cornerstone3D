/**
 * The voxel manager enum is used to select from various voxel managers.
 * This allows different representations of the underlying imaging data for
 * a volume or image slice.  Some representations are better for some types of
 * operations, or are required to support specific sizes of operation data.
 */
enum VoxelManagerEnum {
  /**
   * The RLE Voxel manager defines rows within a volume as a set of Run Length
   * encoded values, where all the values between successive i indices on the
   * same row/slice have the given value.
   * This is very efficient when there are long runs on i values all having the
   * same value, as is typical in many segmentations.
   * It is also allows for multi-valued segmentations, for example, having
   * segments 1 and 3 for a single run.  Note that such segmentations need to
   * be converted to simple segmentations for actual display.
   */
  RleVoxelManager = 'rleVoxelManager',

  /**
   * The volume voxel manager represents data in a TypeArray that is pixel selection first,
   * column second, row third, and finally slice number.  This is the same representation
   * as Image data used in ITK and VTK.
   * This requires a full pixel data TypedArray instance.
   */
  VolumeVoxelManager = 'volumeVoxelManager',
}

export default VoxelManagerEnum;
