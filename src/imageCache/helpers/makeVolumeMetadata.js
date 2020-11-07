import cornerstone from 'cornerstone-core';

export default function makeVolumeMetadata(imageIds) {
  const imageId0 = imageIds[0];

  const {
    pixelRepresentation,
    bitsAllocated,
    bitsStored,
    highBit,
    photometricInterpretation,
    samplesPerPixel,
  } = cornerstone.metaData.get('imagePixelModule', imageId0);

  let { windowWidth, windowCenter } = cornerstone.metaData.get(
    'voiLutModule',
    imageId0
  );

  // Add list of VOIs stored on the DICOM.
  const voiLut = [];

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

  const { modality } = cornerstone.metaData.get(
    'generalSeriesModule',
    imageId0
  );

  const {
    imageOrientationPatient,
    pixelSpacing,
    frameOfReferenceUID,
    columns,
    rows,
  } = cornerstone.metaData.get('imagePlaneModule', imageId0);

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
  };
}
