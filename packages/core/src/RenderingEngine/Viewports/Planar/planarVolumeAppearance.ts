import type vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import type vtkImageResliceMapper from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper';
import type vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import type { VOIRange } from '../../../types';
import {
  applyPlanarOpacityRamp,
  createPlanarRGBTransferFunction,
} from '../../helpers/planarImageRendering';
import type { PlanarDisplaySetAppearance } from './PlanarViewportTypes';
import {
  mapBlendModeToSlabType,
  resolveSlabThickness,
} from './planarVolumeSliceBlendMode';

/**
 * Applies the appearance of a volume slice to its actor. With a
 * vtkImageMapper, which draws a slice that was already cut, the slab and the
 * blend mode are left out: the sampler applies them.
 *
 * The alpha of a pixel is `opacity * ramp(value)`, 0 below the threshold of
 * the colormap, as on every render path: the opacity of the appearance goes
 * on the property and the ramp of the colormap in the opacity function
 * (`applyPlanarOpacityRamp`), which the vtk.js mappers multiply for a volume
 * of one component. A volume of three or four components has no value per
 * pixel for a ramp: its alpha is the opacity.
 */
export function applyPlanarVolumeAppearance(args: {
  actor: vtkImageSlice;
  mapper: vtkImageResliceMapper | vtkImageMapper;
  defaultVOIRange?: VOIRange;
  props?: PlanarDisplaySetAppearance;
}): void {
  const { actor, defaultVOIRange, mapper, props } = args;
  const property = actor.getProperty();
  const voiRange = props?.voiRange ?? defaultVOIRange;

  actor.setVisibility(props?.visible === false ? false : true);

  if (props?.interpolationType !== undefined) {
    property.setInterpolationType(
      props.interpolationType as Parameters<
        typeof property.setInterpolationType
      >[0]
    );
  }

  if (isResliceMapper(mapper)) {
    if (props?.blendMode !== undefined) {
      const slabType = mapBlendModeToSlabType(props.blendMode);

      if (slabType !== undefined) {
        mapper.setSlabType(slabType);
      }
    }

    mapper.setSlabThickness(resolveSlabThickness(props?.slabThickness));
  }

  property.setOpacity(props?.opacity ?? 1);

  if (!voiRange) {
    return;
  }

  const transferFunction = createPlanarRGBTransferFunction({
    colormap: props?.colormap,
    invert: props?.invert,
    voiRange,
    voiLUTFunction: props?.voiLUTFunction,
  });

  property.setUseLookupTableScalarRange(true);
  property.setRGBTransferFunction(0, transferFunction);
  applyPlanarOpacityRamp(actor, props?.colormap);
}

function isResliceMapper(
  mapper: vtkImageResliceMapper | vtkImageMapper
): mapper is vtkImageResliceMapper {
  return (
    typeof (mapper as vtkImageResliceMapper).setSlabThickness === 'function'
  );
}
