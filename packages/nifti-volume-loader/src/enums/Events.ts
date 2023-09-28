/**
 * Cornerstone Nifti volume loader events
 */
enum Events {
  /**
   * Event fired when a Nifti volume is loaded completely
   *
   */
  NIFTI_VOLUME_LOADED = 'CORNERSTONE_NIFTI_VOLUME_LOADED',
  /**
   * Event fired when a Nifti volume has some progress in loading
   */
  NIFTI_VOLUME_PROGRESS = 'CORNERSTONE_NIFTI_VOLUME_PROGRESS',
}

export default Events;
