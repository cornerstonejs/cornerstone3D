import vtkConstants from '@kitware/vtk.js/Rendering/Core/VolumeMapper/Constants';

const { BlendMode } = vtkConstants;

/**
 * Enums for blendModes for viewport images based on vtk.js
 *
 * It should be noted that if crosshairs are enabled and can modify the slab thickness,
 * then it will not show any difference unless MAXIMUM_INTENSITY_BLEND is set on the viewport
 * as the blend.
 */
enum BlendModes {
  /** composite blending - suitable for compositing multiple images */
  COMPOSITE = BlendMode.COMPOSITE_BLEND,
  /** maximum intensity projection */
  MAXIMUM_INTENSITY_BLEND = BlendMode.MAXIMUM_INTENSITY_BLEND,
  /** minimum intensity projection */
  MINIMUM_INTENSITY_BLEND = BlendMode.MINIMUM_INTENSITY_BLEND,
  /** average intensity projection */
  AVERAGE_INTENSITY_BLEND = BlendMode.AVERAGE_INTENSITY_BLEND,
}

export default BlendModes;
