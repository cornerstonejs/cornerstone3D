import type { WADORSMetaData } from '../../types';
import imageIdToURI from '../imageIdToURI';
import { combineFrameInstance } from './combineFrameInstance';

let metadataByImageURI = [];
let multiframeMetadataByImageURI = {};

import getValue from './metaData/getValue';

// get metadata information for the first frame
function _retrieveMultiframeMetadataImageURI(imageURI) {
  const lastSlashIdx = imageURI.indexOf('/frames/') + 8;
  // imageid string without frame number
  const imageIdFrameless = imageURI.slice(0, lastSlashIdx);
  // calculating frame number
  const frame = parseInt(imageURI.slice(lastSlashIdx), 10);
  // retrieving the frame 1 that contains multiframe information

  const metadata = metadataByImageURI[`${imageIdFrameless}1`];

  return {
    metadata,
    frame,
  };
}

function retrieveMultiframeMetadataImageId(imageId) {
  const imageURI = imageIdToURI(imageId);

  return _retrieveMultiframeMetadataImageURI(imageURI);
}

/**
 * List based on https://dicom.nema.org/medical/dicom/current/output/chtml/part03/chapter_A.html#sect_A.1.3
 *
 * using 'Multi-frame' or 'Multi-frame Functional Groups' modules
 *
 * IOD list https://dicom.nema.org/medical/dicom/current/output/chtml/part04/sect_b.5.html
 */
const knownMultiframeIODs = {
  '1.2.840.10008.5.1.4.1.1.2.1': 'Enhanced CT Image Storage',
  '1.2.840.10008.5.1.4.1.1.4.1': 'Enhanced MR Image Storage',
  '1.2.840.10008.5.1.4.1.1.4.3': 'Enhanced MR Color Image Storage',
  '1.2.840.10008.5.1.4.1.1.7.1':
    'Multi-frame Single Bit Secondary Capture Image Storage',
  '1.2.840.10008.5.1.4.1.1.7.2':
    'Multi-frame Grayscale Byte Secondary Capture Image Storage',
  '1.2.840.10008.5.1.4.1.1.7.3':
    'Multi-frame Grayscale Word Secondary Capture Image Storage',
  '1.2.840.10008.5.1.4.1.1.7.4':
    'Multi-frame True Color Secondary Capture Image Storage',
  '1.2.840.10008.5.1.4.1.1.20': 'Nuclear Medicine Image Storage',
  '1.2.840.10008.5.1.4.1.1.3.1': 'Ultrasound Multi-frame Image Storage',
  '1.2.840.10008.5.1.4.1.1.6.2': 'Enhanced US Volume Storage',
  '1.2.840.10008.5.1.4.1.1.6.3': 'Photoacoustic Image Storage',
  '1.2.840.10008.5.1.4.1.1.130': 'Enhanced PET Image Storage',
  '1.2.840.10008.5.1.4.1.1.12.1.1': 'Enhanced XA Image Storage',
  '1.2.840.10008.5.1.4.1.1.12.2.1': 'Enhanced XRF Image Storage',
  '1.2.840.10008.5.1.4.1.1.13.1.1': 'X-Ray 3D Angiographic Image Storage',
  '1.2.840.10008.5.1.4.1.1.13.1.2': 'X-Ray 3D Craniofacial Image Storage',
  '1.2.840.10008.5.1.4.1.1.13.1.3': 'Breast Tomosynthesis Image Storage',
  '1.2.840.10008.5.1.4.1.1.13.1.4':
    'Breast Projection X-Ray Image Storage - For Presentation',
  '1.2.840.10008.5.1.4.1.1.13.1.5':
    'Breast Projection X-Ray Image Storage - For Processing',
  '1.2.840.10008.5.1.4.1.1.30': 'Parametric Map Storage',
  '1.2.840.10008.5.1.4.1.1.77.1.6': 'VL Whole Slide Microscopy Image Storage',
  '1.2.840.10008.5.1.4.1.1.77.1.8': 'Confocal Microscopy Image Storage',
  '1.2.840.10008.5.1.4.1.1.77.1.9':
    'Confocal Microscopy Tiled Pyramidal Image Storage',
  '1.2.840.10008.5.1.4.1.1.77.1.1.1': 'Video Endoscopic Image Storage',
  '1.2.840.10008.5.1.4.1.1.77.1.2.1': 'Video Microscopic Image Storage',
  '1.2.840.10008.5.1.4.1.1.77.1.4.1': 'Video Photographic Image Storage',
  '1.2.840.10008.5.1.4.1.1.77.1.5.1':
    'Ophthalmic Photography 8 Bit Image Storage',
  '1.2.840.10008.5.1.4.1.1.77.1.5.2':
    'Ophthalmic Photography 16 Bit Image Storage',
  '1.2.840.10008.5.1.4.1.1.77.1.5.5':
    'Wide Field Ophthalmic Photography Stereographic Projection Image Storage',
  '1.2.840.10008.5.1.4.1.1.77.1.5.6':
    'Wide Field Ophthalmic Photography 3D Coordinates Image Storage',
  '1.2.840.10008.5.1.4.1.1.77.1.5.4': 'Ophthalmic Tomography Image Storage',
  '1.2.840.10008.5.1.4.1.1.77.1.5.8':
    'Ophthalmic Optical Coherence Tomography B-scan Volume Analysis Storage',
  '1.2.840.10008.5.1.4.1.1.14.1':
    'Intravascular Optical Coherence Tomography Image Storage - For Presentation',
  '1.2.840.10008.5.1.4.1.1.14.2':
    'Intravascular Optical Coherence Tomography Image Storage - For Processing',
  '1.2.840.10008.5.1.4.1.1.66.4': 'Segmentation Storage',
  '1.2.840.10008.5.1.4.1.1.4.2': 'MR Spectroscopy Storage',
  '1.2.840.10008.5.1.4.1.1.481.23': 'Enhanced RT Image Storage',
  '1.2.840.10008.5.1.4.1.1.481.24': 'Enhanced Continuous RT Image Storage',
};
const conditionalMultiframeIODs = {
  '1.2.840.10008.5.1.4.1.1.12.1': 'X-Ray Angiographic Image Storage',
  '1.2.840.10008.5.1.4.1.1.12.2': 'X-Ray Radiofluoroscopic Image Storage',
  '1.2.840.10008.5.1.4.1.1.481.1': 'RT Image Storage',
  '1.2.840.10008.5.1.4.1.1.481.2': 'RT Dose Storage',
};

export function isMultiframeIOD(data): boolean | undefined {
  const sopClassUid = getValue<string>(data['00080016']);
  if (sopClassUid) {
    if (knownMultiframeIODs[sopClassUid.trim()] !== undefined) {
      // This is a known multiframe IOD
      return true;
    }
  }
  if (conditionalMultiframeIODs[sopClassUid] !== undefined) {
    // TODO
  }
  return undefined;
}

function isMultiframe(metadata) {
  if (isMultiframeIOD(metadata)) {
    return true;
  }
  // Checks if dicomTag NumberOf Frames exists and it is greater than one
  const numberOfFrames = getValue<number>(metadata['00280008']);

  return numberOfFrames && numberOfFrames > 1;
}

function add(imageId: string, metadata: WADORSMetaData) {
  const imageURI = imageIdToURI(imageId);

  Object.defineProperty(metadata, 'isMultiframe', {
    value: isMultiframe(metadata),
    enumerable: false,
  });

  metadataByImageURI[imageURI] = metadata;
}

// multiframes images will have only one imageId returned by the dicomweb
// client and registered in metadataByImageURI for all the n frames. If an
// imageId does not have metadata, or it does not have at all, or the imageID
// belongs to a frame, not registered in metadataByImageURI
function get(imageId: string): WADORSMetaData {
  const imageURI = imageIdToURI(imageId);

  // Check if the metadata is already available
  const metadata = metadataByImageURI[imageURI];

  if (metadata && !metadata?.isMultiframe) {
    // Return the metadata for single-frame images
    return metadata;
  }

  const cachedMetadata = multiframeMetadataByImageURI[imageURI];

  if (cachedMetadata) {
    return cachedMetadata;
  }

  // Try to get the metadata for a specific frame of a multiframe image
  const retrievedMetadata = _retrieveMultiframeMetadataImageURI(imageURI);

  if (!retrievedMetadata || !retrievedMetadata.metadata) {
    return;
  }

  const { metadata: firstFrameMetadata, frame } = retrievedMetadata;

  if (firstFrameMetadata) {
    // Combine the metadata from the first frame with the metadata from the specified frame
    const combined = combineFrameInstance(frame, firstFrameMetadata);

    multiframeMetadataByImageURI[imageURI] = combined;

    return combined;
  }
}

function remove(imageId) {
  const imageURI = imageIdToURI(imageId);

  metadataByImageURI[imageURI] = undefined;

  multiframeMetadataByImageURI[imageURI] = undefined;
}

function purge() {
  metadataByImageURI = [];
  multiframeMetadataByImageURI = {};
}

export { metadataByImageURI, isMultiframe, retrieveMultiframeMetadataImageId };

export default {
  add,
  get,
  remove,
  purge,
};
