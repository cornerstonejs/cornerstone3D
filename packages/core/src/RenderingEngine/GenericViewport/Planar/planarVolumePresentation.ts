import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import type vtkImageResliceMapper from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper';
import type vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import type { ColormapPublic, VOIRange } from '../../../types';
import { createPlanarRGBTransferFunction } from '../../helpers/planarImageRendering';
import type { PlanarDataPresentation } from './PlanarViewportTypes';
import {
  mapBlendModeToSlabType,
  resolveSlabThickness,
} from './planarVolumeSliceBlendMode';

export function applyPlanarVolumePresentation(args: {
  actor: vtkImageSlice;
  mapper: vtkImageResliceMapper;
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

  if (props?.blendMode !== undefined) {
    const slabType = mapBlendModeToSlabType(props.blendMode);

    if (slabType !== undefined) {
      mapper.setSlabType(slabType);
    }
  }

  mapper.setSlabThickness(resolveSlabThickness(props?.slabThickness));

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
  });

  property.setUseLookupTableScalarRange(true);
  property.setRGBTransferFunction(0, transferFunction);

  applyColormapOpacity({
    actor,
    colormap: props?.colormap,
    voiRange,
  });
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

  if (colormap.opacity === undefined && colormap.threshold === undefined) {
    return;
  }

  const range = resolveVolumeOpacityRange(actor, voiRange);
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

function buildColormapOpacityPoints(args: {
  colormap: ColormapPublic;
  range: VOIRange;
  fallbackOpacity: number;
}): Array<[number, number]> {
  const { colormap, range, fallbackOpacity } = args;
  const delta = Math.max(Math.abs(range.upper - range.lower) * 0.001, 1e-3);
  const threshold =
    colormap.threshold !== undefined
      ? Math.max(range.lower, Math.min(range.upper, colormap.threshold))
      : undefined;

  if (Array.isArray(colormap.opacity) && colormap.opacity.length) {
    const sortedPoints = colormap.opacity
      .map(({ opacity, value }) => ({
        opacity: clampToUnit(opacity),
        value,
      }))
      .sort((a, b) => a.value - b.value);

    if (threshold === undefined) {
      return dedupeOpacityPoints(
        sortedPoints.map(({ value, opacity }) => [value, opacity])
      );
    }

    const thresholdOpacity = resolvePointOpacityAtValue(
      threshold,
      sortedPoints,
      fallbackOpacity
    );
    const points: Array<[number, number]> = [
      [range.lower, 0],
      [Math.max(range.lower, threshold - delta), 0],
      [threshold, thresholdOpacity],
    ];

    sortedPoints.forEach(({ value, opacity }) => {
      if (value > threshold) {
        points.push([value, opacity]);
      }
    });

    if (threshold < range.upper) {
      const lastOpacity = points[points.length - 1][1];

      if (points[points.length - 1][0] < range.upper) {
        points.push([range.upper, lastOpacity]);
      }
    }

    return dedupeOpacityPoints(points);
  }

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

function resolvePointOpacityAtValue(
  scalarValue: number,
  opacityPoints: Array<{ value: number; opacity: number }>,
  fallbackOpacity: number
): number {
  if (!opacityPoints.length) {
    return clampToUnit(fallbackOpacity);
  }

  if (scalarValue <= opacityPoints[0].value) {
    return opacityPoints[0].opacity;
  }

  for (let i = 1; i < opacityPoints.length; i++) {
    const previous = opacityPoints[i - 1];
    const current = opacityPoints[i];

    if (scalarValue <= current.value) {
      const pointRange = current.value - previous.value;
      const t =
        pointRange > 0 ? (scalarValue - previous.value) / pointRange : 0;

      return clampToUnit(
        previous.opacity + (current.opacity - previous.opacity) * t
      );
    }
  }

  return opacityPoints[opacityPoints.length - 1].opacity;
}

function dedupeOpacityPoints(
  points: Array<[number, number]>
): Array<[number, number]> {
  const deduped: Array<[number, number]> = [];

  points.forEach(([value, opacity]) => {
    const lastPoint = deduped[deduped.length - 1];

    if (lastPoint && lastPoint[0] === value) {
      lastPoint[1] = opacity;
      return;
    }

    deduped.push([value, opacity]);
  });

  return deduped;
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
