import { metaData } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

/**
 * It creates a metadata object for a volume given the imageIds that compose it.
 * It uses the first imageId to get the metadata.
 *
 * @param imageIds - array of imageIds
 * @returns The volume metadata
 */
export default function makeVolumeMetadata(
  imageIds: Array<string>
): Types.Metadata {
  const imageId0 = imageIds[0];

  const {
    pixelRepresentation,
    bitsAllocated,
    bitsStored,
    highBit,
    photometricInterpretation,
    samplesPerPixel,
  } = metaData.get('imagePixelModule', imageId0);

  // Add list of VOIs stored on the DICOM.
  const voiLut = [];

  const voiLutModule = metaData.get('voiLutModule', imageId0);

  // voiLutModule is not always present
  let voiLUTFunction;
  if (voiLutModule) {
    const { windowWidth, windowCenter } = voiLutModule;
    voiLUTFunction = voiLutModule?.voiLUTFunction;

    if (Array.isArray(windowWidth)) {
      for (let i = 0; i < windowWidth.length; i++) {
        voiLut.push({
          windowWidth: windowWidth[i],
          windowCenter: windowCenter[i],
        });
      }
    } else {
      voiLut.push({
        windowWidth: windowWidth,
        windowCenter: windowCenter,
      });
    }
  } else {
    voiLut.push({
      windowWidth: undefined,
      windowCenter: undefined,
    });
  }

  const { modality, seriesInstanceUID } = metaData.get(
    'generalSeriesModule',
    imageId0
  );

  const {
    imageOrientationPatient,
    pixelSpacing,
    frameOfReferenceUID,
    columns,
    rows,
  } = metaData.get('imagePlaneModule', imageId0);

  // Map to dcmjs-style keywords. This is becoming the standard and makes it
  // Easier to swap out cornerstoneWADOImageLoader at a later date.
  return {
    BitsAllocated: bitsAllocated,
    BitsStored: bitsStored,
    SamplesPerPixel: samplesPerPixel,
    HighBit: highBit,
    PhotometricInterpretation: photometricInterpretation,
    PixelRepresentation: pixelRepresentation,
    Modality: modality,
    ImageOrientationPatient: imageOrientationPatient,
    PixelSpacing: pixelSpacing,
    FrameOfReferenceUID: frameOfReferenceUID,
    Columns: columns,
    Rows: rows,
    // This is a reshaped object and not a dicom tag:
    voiLut,
    VOILUTFunction: voiLUTFunction,
    SeriesInstanceUID: seriesInstanceUID,
  };
}
