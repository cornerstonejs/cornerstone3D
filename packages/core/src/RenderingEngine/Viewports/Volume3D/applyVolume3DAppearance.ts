import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import type { BlendMode } from '@kitware/vtk.js/Rendering/Core/VolumeMapper/Constants';
import { VIEWPORT_PRESETS } from '../../../constants';
import { BlendModes, VOILUTFunctionType } from '../../../enums';
import type {
  AppearanceColormap,
  VOIRange,
  ViewportPreset,
  VolumeActor,
} from '../../../types';
import applyPreset from '../../../utilities/applyPreset';
import {
  resolveColormap,
  updateOpacity,
  updateOpacityMapping,
  updateThreshold,
} from '../../../utilities/colormap';
import createLinearRGBTransferFunction from '../../../utilities/createLinearRGBTransferFunction';
import createSigmoidRGBTransferFunction from '../../../utilities/createSigmoidRGBTransferFunction';
import getVoiFromSigmoidRGBTransferFunction from '../../../utilities/getVoiFromSigmoidRGBTransferFunction';
import invertRgbTransferFunction from '../../../utilities/invertRgbTransferFunction';
import {
  idleSampleDistanceMultiplierOf,
  sampleDistanceOf,
  setIdleSampleDistanceMultiplier,
} from '../../helpers/createVolumeMapper';
import { isInvalidNumber } from '../../helpers/isInvalidNumber';
import type {
  Volume3DDisplaySetAppearance,
  Volume3DVolumeRendering,
} from './viewport3DTypes';

/**
 * The lighting of a volume property that a preset sets. A reset of the
 * appearance puts back the values that the actor had at its mount.
 */
interface Volume3DLook {
  ambient: number;
  diffuse: number;
  shade: boolean;
  specular: number;
  specularPower: number;
  useGradientOpacity: boolean;
}

const mountedLooks = new WeakMap<VolumeActor, Volume3DLook>();

/**
 * Applies an appearance to the volume of a 3D rendering, as the legacy
 * `setProperties` applies it. The first appearance, and the first after a
 * reset (`appliedAppearance` undefined), builds the transfer functions: a
 * grey ramp over the VOI range (or the default VOI range), inverted when
 * asked, a flat opacity, then the colormap and the preset. A later
 * appearance changes only what differs from the one before, the way the
 * legacy viewport does: a VOI range rescales the colour function that is
 * there, invert inverts it, and an opacity scales the opacity function. So
 * a preset or a colormap keeps its colours. The interpolation type, the
 * sample distance and the blend mode are applied with or without a VOI range.
 */
export function applyVolume3DAppearance(
  rendering: Volume3DVolumeRendering,
  props: Volume3DDisplaySetAppearance = {}
): void {
  const { actor, mapper } = rendering;
  const property = actor.getProperty();
  const previous = rendering.appliedAppearance;

  actor.setVisibility(props.visible !== false);

  if (previous) {
    applyAppearanceChanges(rendering, props, previous);
  } else {
    buildTransferFunctions(rendering, props);
  }

  if (props.interpolationType !== undefined) {
    property.setInterpolationType(
      props.interpolationType as Parameters<
        typeof property.setInterpolationType
      >[0]
    );
  }

  if (props.sampleDistanceMultiplier !== undefined) {
    applySampleDistanceMultiplier(rendering, props.sampleDistanceMultiplier);
  }

  if (!previous || previous.blendMode !== props.blendMode) {
    mapper.setBlendMode(
      (props.blendMode ?? BlendModes.COMPOSITE) as unknown as BlendMode
    );
  }

  rendering.appliedAppearance = { ...props };
}

/**
 * The preset of a name or of a preset object; undefined for an unknown name.
 */
export function resolveVolume3DPreset(
  preset: string | ViewportPreset | undefined
): ViewportPreset | undefined {
  if (typeof preset !== 'string') {
    return preset;
  }

  return VIEWPORT_PRESETS.find((entry) => entry.name === preset);
}

/**
 * The first appearance: transfer functions built from the appearance
 * alone, with the lighting of the mount.
 */
function buildTransferFunctions(
  rendering: Volume3DVolumeRendering,
  props: Volume3DDisplaySetAppearance
): void {
  const { actor, defaultVOIRange } = rendering;
  const property = actor.getProperty();
  const voiRange = props.voiRange ?? defaultVOIRange;
  const mountedLook = mountedLooks.get(actor);

  if (mountedLook) {
    property.setAmbient(mountedLook.ambient);
    property.setDiffuse(mountedLook.diffuse);
    property.setShade(mountedLook.shade);
    property.setSpecular(mountedLook.specular);
    property.setSpecularPower(mountedLook.specularPower);
    property.setUseGradientOpacity(0, mountedLook.useGradientOpacity);
  } else {
    mountedLooks.set(actor, {
      ambient: property.getAmbient(),
      diffuse: property.getDiffuse(),
      shade: property.getShade(),
      specular: property.getSpecular(),
      specularPower: property.getSpecularPower(),
      useGradientOpacity: property.getUseGradientOpacity(0),
    });
  }

  if (voiRange) {
    const transferFunction =
      props.voiLUTFunction === VOILUTFunctionType.SAMPLED_SIGMOID
        ? createSigmoidRGBTransferFunction(voiRange)
        : createLinearRGBTransferFunction(voiRange);

    if (props.invert) {
      invertRgbTransferFunction(transferFunction);
    }

    property.setRGBTransferFunction(0, transferFunction);
  }

  updateOpacityMapping(actor, undefined, props.opacity ?? 1);
  updateThreshold(actor, null);
  applyColormap(actor, props.colormap, undefined);
  applyPresetOf(actor, props.preset);
}

/** A later appearance: only what differs from the one before. */
function applyAppearanceChanges(
  rendering: Volume3DVolumeRendering,
  props: Volume3DDisplaySetAppearance,
  previous: Volume3DDisplaySetAppearance
): void {
  const { actor } = rendering;
  const transferFunction = actor.getProperty().getRGBTransferFunction(0);

  if (Boolean(props.invert) !== Boolean(previous.invert)) {
    invertRgbTransferFunction(transferFunction);
  }

  applyColormap(actor, props.colormap, previous.colormap);

  if (
    props.voiRange !== previous.voiRange ||
    props.voiLUTFunction !== previous.voiLUTFunction
  ) {
    applyVOIRange(
      actor,
      props.voiRange ?? currentVOIRange(transferFunction, previous),
      props.voiLUTFunction,
      props.voiLUTFunction !== previous.voiLUTFunction
    );
  }

  if (props.preset !== previous.preset) {
    applyPresetOf(actor, props.preset);
  }

  if (props.opacity !== undefined && props.opacity !== previous.opacity) {
    updateOpacity(actor, props.opacity);
  }
}

/**
 * Sets the VOI range as the legacy `setVOI`: a sigmoid function for
 * SAMPLED_SIGMOID, else the colour function that is there rescaled to the
 * range. A change of the function to LINEAR builds a grey ramp.
 */
function applyVOIRange(
  actor: VolumeActor,
  voiRange: VOIRange | undefined,
  voiLUTFunction: VOILUTFunctionType | undefined,
  functionChanged: boolean
): void {
  if (!voiRange || [voiRange.lower, voiRange.upper].some(isInvalidNumber)) {
    return;
  }

  const property = actor.getProperty();

  if (voiLUTFunction === VOILUTFunctionType.SAMPLED_SIGMOID) {
    property.setRGBTransferFunction(
      0,
      createSigmoidRGBTransferFunction(voiRange)
    );

    return;
  }

  if (functionChanged) {
    property.setRGBTransferFunction(
      0,
      createLinearRGBTransferFunction(voiRange)
    );

    return;
  }

  property
    .getRGBTransferFunction(0)
    .setMappingRange(voiRange.lower, voiRange.upper);
}

/** The VOI range that the colour function shows now. */
function currentVOIRange(
  transferFunction: vtkColorTransferFunction,
  previous: Volume3DDisplaySetAppearance
): VOIRange {
  const [lower, upper] =
    previous.voiLUTFunction === VOILUTFunctionType.SAMPLED_SIGMOID
      ? getVoiFromSigmoidRGBTransferFunction(transferFunction)
      : transferFunction.getRange();

  return { lower, upper };
}

/**
 * Applies the fields of a colormap that differ from the colormap before, as
 * the legacy `setColormap` and `setThreshold` apply them: the name, the
 * opacity mapping, which the opacity of the appearance scales, and the
 * threshold, which null clears.
 */
function applyColormap(
  actor: VolumeActor,
  colormap: AppearanceColormap | undefined,
  previous: AppearanceColormap | undefined
): void {
  if (!colormap || colormap === previous) {
    return;
  }

  if (colormap.name && colormap.name !== previous?.name) {
    const registration = resolveColormap(colormap.name);

    if (!registration) {
      throw new Error(`Colormap ${colormap.name} not found`);
    }

    const property = actor.getProperty();
    const range = property.getRGBTransferFunction(0).getRange();
    const transferFunction = vtkColorTransferFunction.newInstance();

    transferFunction.applyColorMap(registration);
    transferFunction.setMappingRange(range[0], range[1]);
    property.setRGBTransferFunction(0, transferFunction);
  }

  if (colormap.opacityMapping !== previous?.opacityMapping) {
    updateOpacityMapping(actor, colormap.opacityMapping);
  }

  if (colormap.threshold !== previous?.threshold) {
    updateThreshold(actor, colormap.threshold ?? null);
  }
}

/**
 * Applies a preset with `utilities.applyPreset`, as the legacy viewport, and
 * keeps the opacity of the preset as the opacity mapping of the actor, so
 * that a later opacity scales it and does not flatten it.
 */
function applyPresetOf(
  actor: VolumeActor,
  presetNameOrObject: string | ViewportPreset | undefined
): void {
  const preset = resolveVolume3DPreset(presetNameOrObject);

  if (!preset) {
    return;
  }

  applyPreset(actor, preset);

  const points = actor.getProperty().getScalarOpacity(0).getDataPointer();
  const mapping = [];

  for (let index = 0; index < points.length; index += 2) {
    mapping.push({ value: points[index], opacity: points[index + 1] });
  }

  updateOpacityMapping(actor, mapping);
}

function applySampleDistanceMultiplier(
  rendering: Volume3DVolumeRendering,
  multiplier: number
): void {
  const { mapper } = rendering;
  const imageData = mapper.getInputData?.();

  if (!imageData) {
    return;
  }

  setIdleSampleDistanceMultiplier(mapper, multiplier);

  const texture = (
    mapper as unknown as { getScalarTexture?: () => unknown }
  ).getScalarTexture?.();

  mapper.setSampleDistance(
    sampleDistanceOf(imageData, texture, idleSampleDistanceMultiplierOf(mapper))
  );
}
