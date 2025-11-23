export const NO_IMAGE_ID = 'none';

export const CS3D_DESIGNATOR = '99CS3D';

export const TEXT_ANNOTATION_POSITION = {
  schemeDesignator: CS3D_DESIGNATOR,
  meaning: 'Text Annotation Position',
  value: 'TextPosition',
};

export const COMMENT_CODE = {
  schemeDesignator: 'DCM',
  meaning: 'Comment',
  value: '121106',
};

export const fileMetaInformationVersionArray1 = new Uint8Array(2);
fileMetaInformationVersionArray1[1] = 1;

export const fileMetaInformationVersionArray2 = new Uint8Array(2);
fileMetaInformationVersionArray2[1] = 2;

// UUID with 1.0.1 being type 1 (annotation) and version 0.1
export const ImplementationClassUidSRAnnotation =
  '2.25.2470123695996825859949881583571202391.1.0.1';

export const ImplementationClassRtssContours =
  '2.25.2470123695996825859949881583571202391.2.0.1';

export const ImplementationVersionName = {
  Value: ['cs3d-4.8.4'],
  vr: 'SH',
};

const fileMetaInformationVersionArray = new Uint8Array(2);
fileMetaInformationVersionArray[1] = 1;

export const metaSRAnnotation = {
  FileMetaInformationVersion: {
    Value: [fileMetaInformationVersionArray2.buffer],
    vr: 'OB',
  },
  //MediaStorageSOPClassUID
  //MediaStorageSOPInstanceUID: sopCommonModule.sopInstanceUID,
  TransferSyntaxUID: {
    Value: ['1.2.840.10008.1.2'],
    vr: 'UI',
  },
  ImplementationClassUID: {
    Value: [ImplementationClassUidSRAnnotation],
    vr: 'UI',
  },
  ImplementationVersionName: {
    Value: ['cs3d-4.8.4'],
    vr: 'SH',
  },
};

export const metaRTSSContour = {
  ...metaSRAnnotation,
  ImplementationClassUID: {
    Value: [ImplementationClassRtssContours],
    vr: 'UI',
  },
};
