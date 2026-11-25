import { SlabTypes } from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper/Constants';
import { RENDERING_DEFAULTS } from '../../../constants';
import BlendModes from '../../../enums/BlendModes';

export function mapBlendModeToSlabType(
  blendMode?: BlendModes
): SlabTypes | undefined {
  switch (blendMode) {
    case BlendModes.MAXIMUM_INTENSITY_BLEND:
      return SlabTypes.MAX;
    case BlendModes.MINIMUM_INTENSITY_BLEND:
      return SlabTypes.MIN;
    case BlendModes.AVERAGE_INTENSITY_BLEND:
    case BlendModes.COMPOSITE:
      return SlabTypes.MEAN;
    case BlendModes.LABELMAP_EDGE_PROJECTION_BLEND:
      return SlabTypes.MAX;
    default:
      return;
  }
}

export function mapSlabTypeToBlendMode(slabType?: SlabTypes): BlendModes {
  switch (slabType) {
    case SlabTypes.MAX:
      return BlendModes.MAXIMUM_INTENSITY_BLEND;
    case SlabTypes.MIN:
      return BlendModes.MINIMUM_INTENSITY_BLEND;
    case SlabTypes.MEAN:
      return BlendModes.AVERAGE_INTENSITY_BLEND;
    default:
      return BlendModes.COMPOSITE;
  }
}

export function resolveSlabThickness(slabThickness?: number): number {
  if (typeof slabThickness !== 'number' || slabThickness <= 0) {
    return 0;
  }

  return Math.max(slabThickness, RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS);
}
