import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import type vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import type vtkImageResliceMapper from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper';
import type vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import type { ColormapPublic, VOIRange } from '../../../types';
import { createPlanarRGBTransferFunction } from '../../helpers/planarImageRendering';
import type { PlanarDataPresentation } from './PlanarViewportTypes';
import {
  mapBlendModeToSlabType,
  resolveSlabThickness,
} from './planarVolumeSliceBlendMode';

/**
 * Applies the presentation of a volume slice to its actor. With a
 * vtkImageMapper, which draws a slice that was already cut, the slab and the
 * blend mode are left out: the sampler applies them.
 */
export function applyPlanarVolumePresentation(args: {
  actor: vtkImageSlice;
  mapper: vtkImageResliceMapper | vtkImageMapper;
  defaultVOIRange?: VOIRange;
  props?: PlanarDataPresentation;
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

  if (props?.opacity !== undefined) {
    applyVolumeOpacity({
      actor,
      opacity: props.opacity,
      voiRange,
    });
  }

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

  applyColormapOpacity({
    actor,
    colormap: props?.colormap,
    voiRange,
  });
}

function isResliceMapper(
  mapper: vtkImageResliceMapper | vtkImageMapper
): mapper is vtkImageResliceMapper {
  return (
    typeof (mapper as vtkImageResliceMapper).setSlabThickness === 'function'
  );
}

function applyVolumeOpacity(args: {
  actor: vtkImageSlice;
  opacity: number;
  voiRange?: VOIRange;
}): void {
  const { actor, opacity, voiRange } = args;

  if (getVolumeNumberOfComponents(actor) < 2) {
    actor.getProperty().setOpacity(opacity);
    return;
  }

  const opacityFunction = vtkPiecewiseFunction.newInstance();
  const range = resolveVolumeOpacityRange(actor, voiRange);

  opacityFunction.addPoint(range.lower, opacity);

  if (range.upper > range.lower) {
    opacityFunction.addPoint(range.upper, opacity);
  }

  actor.getProperty().setScalarOpacity(0, opacityFunction);
}

function applyColormapOpacity(args: {
  actor: vtkImageSlice;
  colormap?: ColormapPublic;
  voiRange?: VOIRange;
}): void {
  const { actor, colormap, voiRange } = args;

  if (!colormap) {
    return;
  }

  const opacityMappingPoints = buildOpacityMappingPoints(colormap);

  if (opacityMappingPoints) {
    const opacityFunction = vtkPiecewiseFunction.newInstance();

    opacityMappingPoints.forEach(([value, opacity]) => {
      opacityFunction.addPoint(value, opacity);
    });
    actor.getProperty().setScalarOpacity(0, opacityFunction);

    return;
  }

  if (colormap.opacity === undefined && colormap.threshold === undefined) {
    return;
  }

  // A `threshold` is an ABSOLUTE scalar value (SUV / pixel value) spanning the
  // full voxel data range, matching the legacy volume path
  // (updateOpacityWithThreshold, which clamps to voxelManager.getRange()) and
  // OHIF's ThresholdMenu (slider bounds = voxel range). A single opacity spans
  // the VOI range. Pick the domain accordingly so a threshold of e.g. 15 SUV is
  // not clamped to a narrow VOI upper (which made everything transparent).
  const range =
    colormap.threshold !== undefined
      ? (getActorScalarRange(actor) ??
        resolveVolumeOpacityRange(actor, voiRange))
      : resolveVolumeOpacityRange(actor, voiRange);
  const opacityFunction = vtkPiecewiseFunction.newInstance();
  const points = buildColormapOpacityPoints({
    colormap,
    range,
    fallbackOpacity: getCurrentMaxOpacity(actor),
  });

  points.forEach(([value, opacity]) => {
    opacityFunction.addPoint(value, opacity);
  });

  actor.getProperty().setScalarOpacity(0, opacityFunction);
}

/**
 * The opacity points of a colormap that gives a list of opacities, in
 * `opacity` or in `opacityMapping`, or undefined otherwise. A list in
 * `opacity` is the mapping, as on the legacy volume viewport
 * (`_applyColormapOpacity` and `applyOpacitySpec` in `utilities/colormap` of
 * 5.x): the values of the mapping are values of the data, each opacity is
 * scaled by a numeric `opacity`, and a threshold makes everything below it
 * transparent. The points do not depend on the VOI range, so a window level
 * change keeps them.
 */
function buildOpacityMappingPoints(
  colormap: ColormapPublic
): Array<[number, number]> | undefined {
  const opacityMapping =
    Array.isArray(colormap.opacity) && colormap.opacity.length
      ? colormap.opacity
      : colormap.opacityMapping;

  if (!Array.isArray(opacityMapping) || !opacityMapping.length) {
    return;
  }

  const overall =
    typeof colormap.opacity === 'number' ? clampToUnit(colormap.opacity) : 1;
  const sortedMapping = [...opacityMapping].sort((a, b) => a.value - b.value);
  const scaledPoints = (minimumValue: number): Array<[number, number]> =>
    sortedMapping
      .filter(({ value }) => value >= minimumValue)
      .map(({ value, opacity }) => [value, clampToUnit(opacity * overall)]);

  if (typeof colormap.threshold !== 'number') {
    return scaledPoints(-Infinity);
  }

  const span =
    Math.abs(
      sortedMapping[sortedMapping.length - 1].value - sortedMapping[0].value
    ) || 1;

  return [
    [sortedMapping[0].value, 0],
    [colormap.threshold - span * 0.001, 0],
    ...scaledPoints(colormap.threshold),
  ];
}

function buildColormapOpacityPoints(args: {
  colormap: ColormapPublic;
  range: VOIRange;
  fallbackOpacity: number;
}): Array<[number, number]> {
  const { colormap, range, fallbackOpacity } = args;
  const span = range.upper - range.lower;
  const delta = Math.max(Math.abs(span) * 0.001, 1e-3);
  // `colormap.threshold` is an ABSOLUTE scalar value (SUV / pixel value): the
  // legacy volume path (updateOpacityWithThreshold) clamps it straight to the
  // voxel range, and OHIF's ThresholdMenu emits values in pixel units. So it is
  // clamped to the range directly.
  const threshold =
    colormap.threshold !== undefined
      ? Math.max(range.lower, Math.min(range.upper, colormap.threshold))
      : undefined;
  const opacity =
    colormap.opacity !== undefined
      ? clampToUnit(colormap.opacity as number)
      : clampToUnit(fallbackOpacity);

  if (threshold === undefined) {
    return [
      [range.lower, opacity],
      [range.upper, opacity],
    ];
  }

  if (threshold >= range.upper) {
    return [
      [range.lower, 0],
      [range.upper, 0],
    ];
  }

  return [
    [range.lower, 0],
    [Math.max(range.lower, threshold - delta), 0],
    [threshold, opacity],
    [range.upper, opacity],
  ];
}

function getCurrentMaxOpacity(actor: vtkImageSlice): number {
  const opacityFunction = actor.getProperty().getScalarOpacity(0);
  const opacityValues = opacityFunction?.getDataPointer?.();

  if (!opacityValues?.length) {
    return actor.getProperty().getOpacity?.() ?? 1;
  }

  let maxOpacity = 0;

  for (let i = 1; i < opacityValues.length; i += 2) {
    if (opacityValues[i] > maxOpacity) {
      maxOpacity = opacityValues[i];
    }
  }

  return clampToUnit(maxOpacity || 1);
}

function clampToUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getVolumeNumberOfComponents(actor: vtkImageSlice): number {
  const mapperInputData = actor.getMapper()?.getInputData?.();
  const scalars = mapperInputData?.getPointData?.()?.getScalars?.();
  const imageDataMetadata = mapperInputData?.get?.('numberOfComponents') as
    | { numberOfComponents?: number }
    | undefined;

  return (
    scalars?.getNumberOfComponents?.() ??
    imageDataMetadata?.numberOfComponents ??
    1
  );
}

/**
 * Returns the full voxel data range of the volume behind an actor (the streaming
 * volume's voxelManager range, mirroring the legacy threshold path), falling back
 * to the vtk scalar range. Used as the domain for an absolute opacity threshold,
 * which is expressed in voxel/SUV units rather than the (often narrower) VOI range.
 */
function getActorScalarRange(actor: vtkImageSlice): VOIRange | undefined {
  const mapperInputData = actor.getMapper()?.getInputData?.();
  const voxelManager = (
    mapperInputData?.get?.('voxelManager') as
      | { voxelManager?: { getRange?: () => [number, number] } }
      | undefined
  )?.voxelManager;

  const voxelRange = voxelManager?.getRange?.();

  if (
    voxelRange &&
    Number.isFinite(voxelRange[0]) &&
    Number.isFinite(voxelRange[1]) &&
    voxelRange[1] > voxelRange[0]
  ) {
    return { lower: voxelRange[0], upper: voxelRange[1] };
  }

  const scalarRange = mapperInputData
    ?.getPointData?.()
    ?.getScalars?.()
    ?.getRange?.();

  if (
    scalarRange &&
    Number.isFinite(scalarRange[0]) &&
    Number.isFinite(scalarRange[1]) &&
    scalarRange[1] > scalarRange[0]
  ) {
    return { lower: scalarRange[0], upper: scalarRange[1] };
  }

  return undefined;
}

function resolveVolumeOpacityRange(
  actor: vtkImageSlice,
  voiRange?: VOIRange
): VOIRange {
  if (
    voiRange &&
    Number.isFinite(voiRange.lower) &&
    Number.isFinite(voiRange.upper)
  ) {
    return voiRange;
  }

  const mapperInputData = actor.getMapper()?.getInputData?.();
  const scalarRange = mapperInputData
    ?.getPointData?.()
    ?.getScalars?.()
    ?.getRange?.();

  if (
    scalarRange &&
    Number.isFinite(scalarRange[0]) &&
    Number.isFinite(scalarRange[1])
  ) {
    return {
      lower: scalarRange[0],
      upper: scalarRange[1],
    };
  }

  const transferRange = actor
    .getProperty()
    .getRGBTransferFunction(0)
    ?.getRange?.();

  if (
    transferRange &&
    Number.isFinite(transferRange[0]) &&
    Number.isFinite(transferRange[1])
  ) {
    return {
      lower: transferRange[0],
      upper: transferRange[1],
    };
  }

  return {
    lower: 0,
    upper: 1,
  };
}
