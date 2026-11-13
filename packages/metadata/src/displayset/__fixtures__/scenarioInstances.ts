import type { NaturalizedInstance } from '../types';

/**
 * Instances shaped like the output of dcmjs `naturalizeDataset` for the series
 * of the scenario tests: a multi-valued attribute is an array, a sequence is an
 * array of items, a number VR is a number, and a private tag that has no
 * keyword is under its 8-digit hex key.
 */

const SOP_CLASS = {
  CT: '1.2.840.10008.5.1.4.1.1.2',
  MR: '1.2.840.10008.5.1.4.1.1.4',
  US: '1.2.840.10008.5.1.4.1.1.6.1',
  USMultiFrame: '1.2.840.10008.5.1.4.1.1.3.1',
  MGForPresentation: '1.2.840.10008.5.1.4.1.1.1.2',
};

const EXPLICIT_VR_LITTLE_ENDIAN = '1.2.840.10008.1.2.1';
const JPEG_BASELINE = '1.2.840.10008.1.2.4.50';
const STUDY_UID = '1.2.826.0.1.3680043.8.498.10274110315161201';

const AXIAL = [1, 0, 0, 0, 1, 0];
const CORONAL = [1, 0, 0, 0, 0, -1];
const SAGITTAL = [0, 1, 0, 0, 0, -1];

let uidCounter = 0;

function uid(seriesUid: string): string {
  uidCounter += 1;
  return `${seriesUid}.${uidCounter}`;
}

function common(
  seriesUid: string,
  fields: Record<string, unknown>
): NaturalizedInstance {
  return {
    StudyInstanceUID: STUDY_UID,
    SeriesInstanceUID: seriesUid,
    SOPInstanceUID: uid(seriesUid),
    TransferSyntaxUID: EXPLICIT_VR_LITTLE_ENDIAN,
    ...fields,
  };
}

/**
 * A GE diffusion series: 32 slice positions, each with a b=0 frame and a
 * b=1000 frame, 64 instances in all. GE writes the b-value only in the private
 * tag (0043,1039) "Slop_int_6...9", as four integer strings; the first one is
 * the b-value. DiffusionBValue (0018,9087) is absent.
 */
export function geDiffusionSeries(): NaturalizedInstance[] {
  const seriesUid = '1.2.840.113619.2.312.4120.14306937.11001';
  const instances: NaturalizedInstance[] = [];
  for (let position = 0; position < 32; position++) {
    const z = -60 + position * 4;
    for (const bValue of ['0', '1000']) {
      instances.push(
        common(seriesUid, {
          SOPClassUID: SOP_CLASS.MR,
          Modality: 'MR',
          Manufacturer: 'GE MEDICAL SYSTEMS',
          SeriesDescription: 'DWI ASSET',
          SeriesNumber: 5,
          InstanceNumber: instances.length + 1,
          ImageType: ['ORIGINAL', 'PRIMARY', 'AXIAL'],
          ScanningSequence: 'EP',
          SequenceVariant: ['SK', 'SS'],
          Rows: 256,
          Columns: 256,
          PixelSpacing: [0.9375, 0.9375],
          SliceThickness: 4,
          ImageOrientationPatient: AXIAL,
          ImagePositionPatient: [-120, -128.3, z],
          SliceLocation: z,
          EchoTime: 81.4,
          RepetitionTime: 6000,
          '00431039': [bValue, '8', '0', '0'],
        })
      );
    }
  }
  return instances;
}

/**
 * An axial T2 series of 24 slices from a scanner that writes
 * DiffusionBValue = 0 into each MR image, also when the sequence has no
 * diffusion weighting.
 */
export function t2SeriesWithZeroBValue(): NaturalizedInstance[] {
  const seriesUid = '1.3.12.2.1107.5.2.43.66012.2026031510214587340112';
  return Array.from({ length: 24 }, (_, index) => {
    const z = -46 + index * 4;
    return common(seriesUid, {
      SOPClassUID: SOP_CLASS.MR,
      Modality: 'MR',
      SeriesDescription: 'AX T2 TSE',
      SeriesNumber: 3,
      InstanceNumber: index + 1,
      ImageType: ['ORIGINAL', 'PRIMARY', 'M', 'NORM', 'DIS2D'],
      ScanningSequence: 'SE',
      Rows: 320,
      Columns: 320,
      PixelSpacing: [0.6875, 0.6875],
      SliceThickness: 4,
      ImageOrientationPatient: AXIAL,
      ImagePositionPatient: [-110, -125.5, z],
      SliceLocation: z,
      DiffusionBValue: 0,
    });
  });
}

function ctImage(
  seriesUid: string,
  fields: Record<string, unknown>
): NaturalizedInstance {
  return common(seriesUid, {
    SOPClassUID: SOP_CLASS.CT,
    Modality: 'CT',
    SeriesDescription: 'CHEST W/O',
    SeriesNumber: 2,
    Rows: 512,
    Columns: 512,
    KVP: 120,
    ...fields,
  });
}

/** The AP and the lateral localizer of a CT exam, as instances 1 and 2. */
export function ctLocalizers(seriesUid: string): NaturalizedInstance[] {
  return [CORONAL, SAGITTAL].map((orientation, index) =>
    ctImage(seriesUid, {
      InstanceNumber: index + 1,
      ImageType: ['ORIGINAL', 'PRIMARY', 'LOCALIZER'],
      PixelSpacing: [0.976, 0.7],
      ImageOrientationPatient: orientation,
      ImagePositionPatient: [-250, 0, 120],
    })
  );
}

/**
 * A CT series that holds its two localizers (instances 1 and 2) and then 40
 * axial slices of 5 mm, as some scanners store them.
 */
export function ctSeriesWithScouts(): NaturalizedInstance[] {
  const seriesUid = '1.2.392.200036.9116.2.6.1.48.1214833767.1612345678.112233';
  const axial = Array.from({ length: 40 }, (_, index) => {
    const z = 100 - index * 5;
    return ctImage(seriesUid, {
      InstanceNumber: index + 3,
      ImageType: ['ORIGINAL', 'PRIMARY', 'AXIAL'],
      PixelSpacing: [0.703, 0.703],
      SliceThickness: 5,
      ImageOrientationPatient: AXIAL,
      ImagePositionPatient: [-180, -180, z],
      SliceLocation: z,
    });
  });
  return [...ctLocalizers(seriesUid), ...axial];
}

function usImage(
  seriesUid: string,
  time: string,
  fields: Record<string, unknown>
): NaturalizedInstance {
  return common(seriesUid, {
    Modality: 'US',
    SeriesDescription: 'US ABDOMEN',
    SeriesNumber: 1,
    Rows: 600,
    Columns: 800,
    SamplesPerPixel: 3,
    PhotometricInterpretation: 'YBR_FULL_422',
    TransferSyntaxUID: JPEG_BASELINE,
    AcquisitionDateTime: `20260315${time}.000000`,
    SequenceOfUltrasoundRegions: [
      {
        RegionSpatialFormat: 1,
        RegionDataType: 1,
        PhysicalUnitsXDirection: 3,
        PhysicalUnitsYDirection: 3,
        PhysicalDeltaX: 0.0213,
        PhysicalDeltaY: 0.0213,
      },
    ],
    ...fields,
  });
}

/**
 * An ultrasound series in acquisition order: a sweep of 5 single images
 * (10:15:00 to 10:15:08), a cine clip at 10:15:40, a sweep of 4 single images
 * (10:16:30 to 10:16:36), and a cine clip at 10:17:20. Each gap between the
 * parts is longer than 20 seconds. The clips carry no SliceLocation, as US
 * clips usually do not.
 */
export function usSweepsAndClips(): {
  instances: NaturalizedInstance[];
  sweeps: NaturalizedInstance[][];
  clips: NaturalizedInstance[];
} {
  const seriesUid = '1.2.840.113663.1500.1.460388269.2.1.20260315.101500.123';
  let instanceNumber = 0;
  const still = (time: string) =>
    usImage(seriesUid, time, {
      SOPClassUID: SOP_CLASS.US,
      InstanceNumber: ++instanceNumber,
      ImageType: ['ORIGINAL', 'PRIMARY', 'ABDOMINAL', '0001'],
    });
  const clip = (time: string) =>
    usImage(seriesUid, time, {
      SOPClassUID: SOP_CLASS.USMultiFrame,
      InstanceNumber: ++instanceNumber,
      ImageType: ['ORIGINAL', 'PRIMARY', 'ABDOMINAL', '0011'],
      NumberOfFrames: 120,
      FrameTime: 33.33,
      CineRate: 30,
      FrameIncrementPointer: 0x00181063,
    });

  const sweep1 = ['101500', '101502', '101504', '101506', '101508'].map(still);
  const clip1 = clip('101540');
  const sweep2 = ['101630', '101632', '101634', '101636'].map(still);
  const clip2 = clip('101720');
  return {
    instances: [...sweep1, clip1, ...sweep2, clip2],
    sweeps: [sweep1, sweep2],
    clips: [clip1, clip2],
  };
}

const MAMMO_VIEW_CODES = {
  CC: {
    CodeValue: 'R-10242',
    CodingSchemeDesignator: 'SRT',
    CodeMeaning: 'cranio-caudal',
  },
  MLO: {
    CodeValue: 'R-10226',
    CodingSchemeDesignator: 'SRT',
    CodeMeaning: 'medio-lateral oblique',
  },
};

/**
 * The four views of a screening mammogram in one series: RCC, LCC, RMLO and
 * LMLO, all of one image size. The vendor sends ViewCodeSequence,
 * ImageLaterality and PatientOrientation, and no ViewPosition.
 */
export function fourViewMammogram(): NaturalizedInstance[] {
  const seriesUid = '1.2.840.113681.2863050711.1599.3770412345.71';
  const views: [string, 'CC' | 'MLO', string[]][] = [
    ['R', 'CC', ['P', 'L']],
    ['L', 'CC', ['A', 'R']],
    ['R', 'MLO', ['P', 'FL']],
    ['L', 'MLO', ['A', 'FR']],
  ];
  return views.map(([laterality, view, orientation], index) =>
    common(seriesUid, {
      SOPClassUID: SOP_CLASS.MGForPresentation,
      Modality: 'MG',
      SeriesDescription: 'Screening Mammography',
      SeriesNumber: 71,
      InstanceNumber: index + 1,
      ImageType: ['ORIGINAL', 'PRIMARY'],
      PresentationIntentType: 'FOR PRESENTATION',
      Rows: 4096,
      Columns: 3328,
      ImagerPixelSpacing: [0.07, 0.07],
      ImageLaterality: laterality,
      PatientOrientation: orientation,
      ViewCodeSequence: [
        { ...MAMMO_VIEW_CODES[view], ViewModifierCodeSequence: [] },
      ],
    })
  );
}

/** The SOPInstanceUID of each instance, in order. */
export function uidsOf(instances: readonly NaturalizedInstance[]): unknown[] {
  return instances.map((instance) => instance.SOPInstanceUID);
}
