import * as metaData from '../metaData';
import { toFiniteNumber } from './toNumber';

// TODO: Test remaining implemented tags
// Supported 4D Tags
//   (0018,1060) Trigger Time                   [Implemented, not tested]
//   (0018,0081) Echo Time                      [Implemented, not tested]
//   (0018,0086) Echo Number                    [Implemented, not tested]
//   (0020,0100) Temporal Position Identifier   [OK]
//   (0054,1300) FrameReferenceTime             [OK]
//   (0018,9087) Diffusion B Value              [OK]
//   (2001,1003) Philips Diffusion B-factor     [OK]
//   (0019,100c) Siemens Diffusion B Value      [Implemented, not tested]
//   (0043,1039) GE Diffusion B Value           [OK]
//
// Multiframe 4D Support (NM Multi-frame Module):
//   (0054,0070) TimeSlotVector                 [OK]
//   (0054,0080) SliceVector                    [Used for ordering within time slots]

interface MappedIPP {
  imageId: string;
  imagePositionPatient;
}

interface MultiframeSplitResult {
  imageIdGroups: string[][];
  splittingTag: string;
}

/**
 * Generates frame-specific imageIds for a multiframe image.
 * Replaces the frame number in the imageId with the specified frame number (1-based).
 *
 * @param baseImageId - The base imageId that must contain a "/frames/" pattern followed by a digit.
 *   Expected format: e.g., "wadouri:http://example.com/image/frames/1" or "wadors:/path/to/image.dcm/frames/1".
 *   The pattern "/frames/\d+" will be replaced with "/frames/" + frameNumber.
 * @param frameNumber - The frame number to use (1-based)
 * @returns The imageId with the frame number replaced
 * @throws {Error} If baseImageId does not contain the required "/frames/" pattern, throws an error
 *   with a clear message indicating the expected format.
 */
function generateFrameImageId(
  baseImageId: string,
  frameNumber: number
): string {
  const framePattern = /\/frames\/\d+/;

  if (!framePattern.test(baseImageId)) {
    throw new Error(
      `generateFrameImageId: baseImageId must contain a "/frames/" pattern followed by a digit. ` +
        `Expected format: e.g., "wadouri:http://example.com/image/frames/1" or "wadors:/path/to/image.dcm/frames/1". ` +
        `Received: ${baseImageId}`
    );
  }

  return baseImageId.replace(framePattern, `/frames/${frameNumber}`);
}

/**
 * Handles multiframe 4D splitting using TimeSlotVector (0054,0070).
 * For NM Multi-frame images where frames are indexed by time slot and slice.
 *
 * @param imageIds - Array containing the base imageId (typically just one for multiframe).
 *   The base imageId must contain a "/frames/" pattern (e.g., "wadouri:http://example.com/image/frames/1").
 *   See generateFrameImageId for format requirements.
 * @returns Split result if multiframe 4D is detected, null otherwise
 */
function handleMultiframe4D(imageIds: string[]): MultiframeSplitResult | null {
  if (!imageIds || imageIds.length === 0) {
    return null;
  }

  const baseImageId = imageIds[0];
  const instance = metaData.get('instance', baseImageId);

  if (!instance) {
    return null;
  }

  const numberOfFrames = instance.NumberOfFrames;
  if (!numberOfFrames || numberOfFrames <= 1) {
    return null;
  }

  const timeSlotVector = instance.TimeSlotVector;
  if (!timeSlotVector || !Array.isArray(timeSlotVector)) {
    return null;
  }

  const sliceVector = instance.SliceVector;
  const numberOfSlices = instance.NumberOfSlices;

  if (timeSlotVector.length !== numberOfFrames) {
    console.warn(
      'TimeSlotVector length does not match NumberOfFrames:',
      timeSlotVector.length,
      'vs',
      numberOfFrames
    );
    return null;
  }

  if (sliceVector) {
    if (!Array.isArray(sliceVector)) {
      console.warn(
        'SliceVector exists but is not an array. Expected length:',
        numberOfFrames
      );
      return null;
    }

    if (
      sliceVector.length !== numberOfFrames ||
      sliceVector.some((val) => val === undefined)
    ) {
      console.warn(
        'SliceVector exists but has invalid length or undefined entries. Expected length:',
        numberOfFrames,
        'Actual length:',
        sliceVector.length
      );
      return null;
    }
  }

  const timeSlotGroups: Map<
    number,
    Array<{ frameIndex: number; sliceIndex: number }>
  > = new Map();

  for (let frameIndex = 0; frameIndex < numberOfFrames; frameIndex++) {
    const timeSlot = timeSlotVector[frameIndex];
    const sliceIndex = sliceVector?.[frameIndex] ?? frameIndex;

    if (!timeSlotGroups.has(timeSlot)) {
      timeSlotGroups.set(timeSlot, []);
    }

    timeSlotGroups.get(timeSlot).push({ frameIndex, sliceIndex });
  }

  const sortedTimeSlots = Array.from(timeSlotGroups.keys()).sort(
    (a, b) => a - b
  );

  const imageIdGroups: string[][] = sortedTimeSlots.map((timeSlot) => {
    const frames = timeSlotGroups.get(timeSlot);

    frames.sort((a, b) => a.sliceIndex - b.sliceIndex);

    return frames.map((frame) =>
      generateFrameImageId(baseImageId, frame.frameIndex + 1)
    );
  });

  const expectedSlicesPerTimeSlot = numberOfSlices || imageIdGroups[0]?.length;
  const allGroupsHaveSameLength = imageIdGroups.every(
    (group) => group.length === expectedSlicesPerTimeSlot
  );

  if (!allGroupsHaveSameLength) {
    console.warn(
      'Multiframe 4D split resulted in uneven time slot groups. Expected',
      expectedSlicesPerTimeSlot,
      'slices per time slot.'
    );
  }

  return {
    imageIdGroups,
    splittingTag: 'TimeSlotVector',
  };
}

function handleCardiac4D(imageIds: string[]): MultiframeSplitResult | null {
  if (!imageIds || imageIds.length === 0) {
    return null;
  }

  const cardiacNumberOfImages = getFiniteValue(
    imageIds[0],
    'CardiacNumberOfImages'
  );

  // Check if CardiacNumberOfImages exists as a detection flag for cardiac 4D data
  if (cardiacNumberOfImages === undefined) {
    return null;
  }

  const stacks: Map<
    string,
    Map<number, Array<{ imageId: string; triggerTime: number }>>
  > = new Map();

  for (const imageId of imageIds) {
    const stackId = metaData.get('StackID', imageId);
    const inStackPositionNumber = getFiniteValue(
      imageId,
      'InStackPositionNumber'
    );
    const triggerTime = getFiniteValue(imageId, 'TriggerTime');

    if (
      stackId === undefined ||
      inStackPositionNumber === undefined ||
      triggerTime === undefined
    ) {
      return null;
    }

    const stackKey = String(stackId);
    if (!stacks.has(stackKey)) {
      stacks.set(stackKey, new Map());
    }

    const positions = stacks.get(stackKey);
    if (!positions.has(inStackPositionNumber)) {
      positions.set(inStackPositionNumber, []);
    }

    positions.get(inStackPositionNumber).push({ imageId, triggerTime });
  }

  const sortedStackIds = Array.from(stacks.keys()).sort(
    (a, b) => Number(a) - Number(b)
  );
  if (sortedStackIds.length === 0) {
    return null;
  }

  const preparedStacks: Array<{
    stackId: string;
    positions: number[];
    framesByPosition: Map<
      number,
      Array<{ imageId: string; triggerTime: number }>
    >;
  }> = [];

  let timeCount: number | undefined;

  for (const stackId of sortedStackIds) {
    const positions = stacks.get(stackId);
    const sortedPositions = Array.from(positions.keys()).sort((a, b) => a - b);

    for (const position of sortedPositions) {
      const frames = positions.get(position);
      frames.sort((a, b) => a.triggerTime - b.triggerTime);

      if (timeCount === undefined) {
        timeCount = frames.length;
      } else if (frames.length !== timeCount) {
        return null;
      }
    }

    preparedStacks.push({
      stackId,
      positions: sortedPositions,
      framesByPosition: positions,
    });
  }

  if (!timeCount) {
    return null;
  }

  const imageIdGroups: string[][] = [];
  for (let timeIndex = 0; timeIndex < timeCount; timeIndex++) {
    const group: string[] = [];
    for (const stack of preparedStacks) {
      for (const position of stack.positions) {
        const frames = stack.framesByPosition.get(position);
        group.push(frames[timeIndex].imageId);
      }
    }
    imageIdGroups.push(group);
  }

  return {
    imageIdGroups,
    splittingTag: 'CardiacTriggerTime',
  };
}

const groupBy = (array, key) => {
  return array.reduce((rv, x) => {
    (rv[x[key]] = rv[x[key]] || []).push(x);
    return rv;
  }, {});
};

function getIPPGroups(imageIds: string[]): { [id: string]: Array<MappedIPP> } {
  const ippMetadata: Array<MappedIPP> = imageIds.map((imageId) => {
    const { imagePositionPatient } =
      metaData.get('imagePlaneModule', imageId) || {};
    return { imageId, imagePositionPatient };
  });

  if (!ippMetadata.every((item) => item.imagePositionPatient)) {
    // Fail if any instances don't provide a position
    return null;
  }

  const positionGroups = groupBy(ippMetadata, 'imagePositionPatient');
  const positions = Object.keys(positionGroups);
  const frame_count = positionGroups[positions[0]].length;
  if (frame_count === 1) {
    // Single frame indicates 3D volume
    return null;
  }
  const frame_count_equal = positions.every(
    (k) => positionGroups[k].length === frame_count
  );
  if (!frame_count_equal) {
    // Differences in number of frames per position group --> not a valid MV
    return null;
  }
  return positionGroups;
}

function test4DTag(
  IPPGroups: { [id: string]: Array<MappedIPP> },
  value_getter: (imageId: string) => number
) {
  const frame_groups = {};
  let first_frame_value_set: number[] = [];

  const positions = Object.keys(IPPGroups);
  for (let i = 0; i < positions.length; i++) {
    const frame_value_set: Set<number> = new Set<number>();
    const frames = IPPGroups[positions[i]];

    for (let j = 0; j < frames.length; j++) {
      const frame_value = value_getter(frames[j].imageId) || 0;

      frame_groups[frame_value] = frame_groups[frame_value] || [];
      frame_groups[frame_value].push({ imageId: frames[j].imageId });

      frame_value_set.add(frame_value);
      if (frame_value_set.size - 1 < j) {
        return undefined;
      }
    }

    if (i == 0) {
      first_frame_value_set = Array.from(frame_value_set);
    } else if (!setEquals(first_frame_value_set, frame_value_set)) {
      return undefined;
    }
  }
  return frame_groups;
}

function getTagValue(imageId: string, tag: string): number | undefined {
  const value = metaData.get(tag, imageId);
  try {
    return parseFloat(value);
  } catch {
    return undefined;
  }
}

function getFiniteValue(imageId: string, tag: string): number | undefined {
  return toFiniteNumber(getTagValue(imageId, tag));
}

function getPhilipsPrivateBValue(imageId: string) {
  // Philips Private Diffusion B-factor tag (2001, 1003)
  // Private creator: Philips Imaging DD 001, VR=FL, VM=1
  const value = metaData.get('20011003', imageId);
  try {
    const { InlineBinary } = value;
    if (InlineBinary) {
      const value_bytes = atob(InlineBinary);
      const ary_buf = new ArrayBuffer(value_bytes.length);
      const dv = new DataView(ary_buf);
      for (let i = 0; i < value_bytes.length; i++) {
        dv.setUint8(i, value_bytes.charCodeAt(i));
      }
      //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
      // For WebGL Buffers, can skip Float32Array,
      // just return ArrayBuffer is all that's needed.
      return new Float32Array(ary_buf)[0];
    }

    return parseFloat(value);
  } catch {
    return undefined;
  }
}

function getSiemensPrivateBValue(imageId: string) {
  // Siemens Private Diffusion B-factor tag (0019, 100c)
  // Private creator: SIEMENS MR HEADER, VR=IS, VM=1
  let value =
    metaData.get('0019100c', imageId) || metaData.get('0019100C', imageId);

  try {
    const { InlineBinary } = value;
    if (InlineBinary) {
      value = atob(InlineBinary);
    }
    return parseFloat(value);
  } catch {
    return undefined;
  }
}

function getGEPrivateBValue(imageId: string) {
  // GE Private Diffusion B-factor tag (0043, 1039)
  // Private creator: GEMS_PARM_01, VR=IS, VM=4
  let value = metaData.get('00431039', imageId);

  try {
    const { InlineBinary } = value;
    if (InlineBinary) {
      value = atob(InlineBinary).split('//');
    }
    return parseFloat(value[0]) % 100000;
  } catch {
    return undefined;
  }
}

function setEquals(set_a: number[], set_b: Set<number>): boolean {
  if (set_a.length != set_b.size) {
    return false;
  }
  for (let i = 0; i < set_a.length; i++) {
    if (!set_b.has(set_a[i])) {
      return false;
    }
  }
  return true;
}

function getPetFrameReferenceTime(imageId) {
  const moduleInfo = metaData.get('petImageModule', imageId);
  return moduleInfo ? moduleInfo['frameReferenceTime'] : 0;
}

/**
 * Split the imageIds array by 4D tags into groups. Each group must have the
 * same number of imageIds or the same imageIds array passed in is returned.
 *
 * For multiframe images (NumberOfFrames > 1), this function checks for
 * TimeSlotVector (0054,0070) which is common in NM (Nuclear Medicine) gated
 * SPECT/PET images. The TimeSlotVector indicates which time slot each frame
 * belongs to, and SliceVector (0054,0080) indicates the slice position.
 *
 * @param imageIds - array of imageIds
 * @returns imageIds grouped by 4D tags
 */
function splitImageIdsBy4DTags(imageIds: string[]): {
  imageIdGroups: string[][];
  splittingTag: string | null;
} {
  const multiframeResult = handleMultiframe4D(imageIds);
  if (multiframeResult) {
    return multiframeResult;
  }

  const cardiacResult = handleCardiac4D(imageIds);
  if (cardiacResult) {
    return cardiacResult;
  }

  const positionGroups = getIPPGroups(imageIds);
  if (!positionGroups) {
    return { imageIdGroups: [imageIds], splittingTag: null };
  }

  const tags = [
    'TemporalPositionIdentifier',
    'DiffusionBValue',
    'TriggerTime',
    'EchoTime',
    'EchoNumber',
    'PhilipsPrivateBValue',
    'SiemensPrivateBValue',
    'GEPrivateBValue',
    'PetFrameReferenceTime',
  ];

  const fncList2 = [
    (imageId) => getTagValue(imageId, tags[0]),
    (imageId) => getTagValue(imageId, tags[1]),
    (imageId) => getTagValue(imageId, tags[2]),
    (imageId) => getTagValue(imageId, tags[3]),
    (imageId) => getTagValue(imageId, tags[4]),
    getPhilipsPrivateBValue,
    getSiemensPrivateBValue,
    getGEPrivateBValue,
    getPetFrameReferenceTime,
  ];

  for (let i = 0; i < fncList2.length; i++) {
    const frame_groups = test4DTag(positionGroups, fncList2[i]);
    if (frame_groups) {
      const sortedKeys = Object.keys(frame_groups)
        .map(Number.parseFloat)
        .sort((a, b) => a - b);

      const imageIdGroups = sortedKeys.map((key) =>
        frame_groups[key].map((item) => item.imageId)
      );
      return { imageIdGroups, splittingTag: tags[i] };
    }
  }

  // Return the same imagesIds for non-4D volumes and indicate no tag was used
  return { imageIdGroups: [imageIds], splittingTag: null };
}

export default splitImageIdsBy4DTags;
export { handleMultiframe4D, generateFrameImageId };
