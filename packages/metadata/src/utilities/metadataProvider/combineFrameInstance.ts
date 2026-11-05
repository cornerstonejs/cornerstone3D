import dcmjs from '@dcmjs-org/dcmjs';
import { vec3 } from 'gl-matrix';
import { dicomSplit } from './dicomSplit';
import { addTypedProvider, getMetaData } from '../../metaData';
import { MetadataModules } from '../../enums';
import { isEqual } from '../isEqual';

const { frameDataset } = dcmjs.data;

/** The position of `origin` moved `distance` along the normal of `orientation`. */
function alongNormal(origin, orientation, distance) {
  const row = vec3.fromValues(orientation[0], orientation[1], orientation[2]);
  const col = vec3.fromValues(orientation[3], orientation[4], orientation[5]);
  const normal = vec3.cross(vec3.create(), row, col);
  return Array.from(vec3.scaleAndAdd(vec3.create(), origin, normal, distance));
}

/** RTDOSE: the frame position from GridFrameOffsetVector. */
function rtdosePosition(view, dataset, frameNumber) {
  const origin = view.ImagePositionPatient?.map(Number);
  const orientation = view.ImageOrientationPatient?.map(Number);
  const offsets = dataset.GridFrameOffsetVector;
  const firstOffset = Number(offsets[0]);
  const offset = Number(offsets[frameNumber - 1]);
  if (!origin || !orientation || Number.isNaN(offset)) {
    return;
  }
  const isIdentityAxialOrientation =
    isEqual(orientation[0], 1) &&
    isEqual(orientation[1], 0) &&
    isEqual(orientation[2], 0) &&
    isEqual(orientation[3], 0) &&
    isEqual(orientation[4], 1) &&
    isEqual(orientation[5], 0);
  // RTDOSE GridFrameOffsetVector has two valid encodings:
  // (a) relative offsets where first value is 0
  // (b) absolute patient z positions for axial orientation
  if (isIdentityAxialOrientation && isEqual(firstOffset, origin[2])) {
    return [origin[0], origin[1], offset];
  }
  if (isEqual(firstOffset, 0)) {
    return alongNormal(origin, orientation, offset);
  }
}

/**
 * The computed attributes of a frame view: the split ImageType, and the
 * position and orientation that a modality keeps outside the functional
 * groups.
 *
 * - Enhanced multi-frame (per-frame and shared functional groups), or NM with
 *   a DetectorInformationSequence and no root position or orientation: the
 *   NM orientation comes from the detector when the frame has none. When the
 *   root has no position, the NM position is the detector position moved
 *   `SpacingBetweenSlices * (frameNumber - 1)` along the normal, and it
 *   replaces a per-frame position.
 * - Otherwise RTDOSE: the position from GridFrameOffsetVector.
 * - Any frame that still has no position gets `[0, 0, frameNumber]`, so the
 *   frames of a multi-frame image with no position (US, XA) stay distinct.
 */
function frameAttributes(view, { dataset, frameNumber }) {
  const attributes: Record<string, unknown> = {};
  if (view.ImageType !== undefined) {
    attributes.ImageType = dicomSplit(view.ImageType);
  }
  const detector = dataset.DetectorInformationSequence?.[0];
  const isEnhanced =
    (dataset.PerFrameFunctionalGroupsSequence &&
      dataset.SharedFunctionalGroupsSequence) ||
    (detector &&
      (!dataset.ImagePositionPatient || !dataset.ImageOrientationPatient));

  if (isEnhanced) {
    const rootOrientation =
      dataset.ImageOrientationPatient ?? detector?.ImageOrientationPatient;
    if (!view.ImageOrientationPatient && detector) {
      attributes.ImageOrientationPatient = rootOrientation;
    }
    const spacing = Number(dataset.SpacingBetweenSlices);
    if (
      !dataset.ImagePositionPatient &&
      detector?.ImagePositionPatient &&
      rootOrientation &&
      spacing
    ) {
      attributes.ImagePositionPatient = alongNormal(
        detector.ImagePositionPatient.map(Number),
        rootOrientation.map(Number),
        spacing * (frameNumber - 1)
      );
    }
  } else if (dataset.GridFrameOffsetVector) {
    const position = rtdosePosition(view, dataset, frameNumber);
    if (position) {
      attributes.ImagePositionPatient = position;
    }
  }
  if (!attributes.ImagePositionPatient && !view.ImagePositionPatient) {
    attributes.ImagePositionPatient = [0, 0, frameNumber];
  }
  return attributes;
}

function frameProperties(_view, { frameNumber }) {
  return { frameNumber };
}

const frameOptions = { frameAttributes, frameProperties, privateMacros: true };

/**
 * The view of one frame of a multi-frame naturalized instance, from
 * `dcmjs.data.frameDataset`: per-frame functional groups, then shared
 * functional groups, then the root, plus the modality fallbacks of
 * `frameAttributes`. A private sequence directly in a functional group item
 * (for example Philips `00211001`) is merged too (`privateMacros: true`). The
 * view is cached on the instance, and the instance is not changed. `frameNumber` is a non-enumerable property of the view.
 * An instance with fewer than 2 frames and no functional groups comes back
 * unchanged. An undefined frame is frame 1.
 */
export const combineFrameInstance = (frame, instance) =>
  frameDataset(instance, frame || 1, frameOptions);

export const combineFrameProvider = (next, query, instance, options) => {
  if (!instance) {
    return next(query, instance, options);
  }
  if (!instance.NumberOfFrames) {
    return instance;
  }
  const uriModule = getMetaData(
    MetadataModules.URI_MODULE,
    query,
    options?.frameModule
  );
  const { frameNumber = 1 } = uriModule || {};

  const combined = combineFrameInstance(frameNumber, instance);
  return combined;
};

export function registerCombineFrameProvider() {
  addTypedProvider(MetadataModules.INSTANCE, combineFrameProvider);
}

export default combineFrameInstance;
