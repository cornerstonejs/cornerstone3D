import vtkConstants from 'vtk.js/Sources/Rendering/Core/VolumeMapper/Constants'

const { BlendMode } = vtkConstants

/**
 * Enums for blendModes for viewport images based on vtk.js
 * NONE: no blending
 * COMPOSITE: composite blending - suitable for compositing multiple images
 * MAXIMUM_INTENSITY_BLEND: maximum intensity projection - suitable for MIP
 *
 * It should be noted that if crosshairs are enabled and can modify the slab thickness,
 * then it will not show any difference unless MAXIMUM_INTENSITY_BLEND is set on the viewport
 * as the blend.
 */
enum BlendModes {
  NONE = BlendMode.NONE,
  COMPOSITE = BlendMode.COMPOSITE,
  MAXIMUM_INTENSITY_BLEND = BlendMode.MAXIMUM_INTENSITY_BLEND,
  MINIMUM_INTENSITY_BLEND = BlendMode.MINIMUM_INTENSITY_BLEND,
  AVERAGE_INTENSITY_BLEND = BlendMode.AVERAGE_INTENSITY_BLEND,
}

export default BlendModes
