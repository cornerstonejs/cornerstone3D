/**
 * ViewportType enum for cornerstone-render which defines the type of viewport.
 * It can be either STACK, PERSPECTIVE, ORTHOGRAPHIC.
 */
enum ViewportType {
  /**
   * - Suitable for rendering a stack of images, that might or might not belong to the same image.
   * - Stack can include 2D images of different shapes, size and direction
   */
  STACK = 'stack',
  /**
   * - Suitable for rendering a volumetric data which is considered as one 3D image.
   * - Having a VolumeViewport enables Multi-planar reformation or reconstruction (MPR) by design, in which you can visualize the volume from various different orientations without addition of performance costs.
   */
  ORTHOGRAPHIC = 'orthographic',
  /** Perspective Viewport: Not Implemented yet */
  PERSPECTIVE = 'perspective',
  VOLUME_3D = 'volume3d',
}

export default ViewportType;
