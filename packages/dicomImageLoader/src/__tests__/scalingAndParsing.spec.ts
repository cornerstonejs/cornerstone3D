/* eslint-disable @typescript-eslint/no-explicit-any */
// Mock createImage BEFORE importing wadors/loadImage. createImage.ts value-imports
// decodeImageFrame, which pulls in the web worker manager at module load time.
// Mocking createImage as a whole means its transitive imports are never evaluated,
// so wadors/loadImage (and the getTransferSyntaxForContentType helper it exports)
// can be imported safely in a jsdom/jest environment.
jest.mock('../imageLoader/createImage', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import getScalingParameters from '../imageLoader/getScalingParameters';
import imageIdToURI from '../imageLoader/imageIdToURI';
import parseImageId from '../imageLoader/wadouri/parseImageId';
import { getTransferSyntaxForContentType } from '../imageLoader/wadors/loadImage';
import isModalityLUTForDisplay from '../imageLoader/isModalityLutForDisplay';
import isNMReconstructable from '../imageLoader/isNMReconstructable';
import { logging } from '@cornerstonejs/utils';
import getOverlayPlaneModule from '../imageLoader/wadors/metaData/getOverlayPlaneModule';
import { getECGModule } from '../imageLoader/wadors/metaData/ECGHelpers';

// ---------------------------------------------------------------------------
// getScalingParameters
// ---------------------------------------------------------------------------
describe('getScalingParameters', () => {
  function makeMetaData(modules: Record<string, unknown>) {
    return {
      get(module: string) {
        return modules[module];
      },
    };
  }

  it('returns rescale slope/intercept for plain CT rescale', () => {
    const metaData = makeMetaData({
      modalityLutModule: { rescaleSlope: 2, rescaleIntercept: -1024 },
      generalSeriesModule: { modality: 'CT' },
    });

    const result = getScalingParameters(metaData, 'imageId1');

    expect(result).toEqual({
      rescaleSlope: 2,
      rescaleIntercept: -1024,
      modality: 'CT',
    });
  });

  it('applies PT suvbw scaling even when slope/intercept are identity (PET counts)', () => {
    const metaData = makeMetaData({
      modalityLutModule: { rescaleSlope: 1, rescaleIntercept: 0 },
      generalSeriesModule: { modality: 'PT' },
      scalingModule: { suvbw: 12.34 },
    });

    const result = getScalingParameters(metaData, 'imageId2');

    expect(result).toEqual({
      rescaleSlope: 1,
      rescaleIntercept: 0,
      modality: 'PT',
      suvbw: 12.34,
    });
  });

  it('does not apply PT scaling when suvbw is NaN, falling back to identity short-circuit', () => {
    const metaData = makeMetaData({
      modalityLutModule: { rescaleSlope: 1, rescaleIntercept: 0 },
      generalSeriesModule: { modality: 'PT' },
      scalingModule: { suvbw: NaN },
    });

    const result = getScalingParameters(metaData, 'imageId2b');

    expect(result).toBeUndefined();
  });

  it('applies RTDOSE dose-grid scaling even with identity modality LUT', () => {
    const metaData = makeMetaData({
      generalSeriesModule: { modality: 'RTDOSE' },
      scalingModule: { DoseGridScaling: 0.005 },
    });

    const result = getScalingParameters(metaData, 'imageId3');

    expect(result).toEqual({
      rescaleSlope: 1,
      rescaleIntercept: 0,
      modality: 'RTDOSE',
      doseGridScaling: 0.005,
      doseSummation: undefined,
      doseType: undefined,
      doseUnit: undefined,
    });
  });

  it('includes doseSummation/doseType/doseUnit when present alongside DoseGridScaling', () => {
    const metaData = makeMetaData({
      generalSeriesModule: { modality: 'RTDOSE' },
      scalingModule: {
        DoseGridScaling: 0.01,
        DoseSummation: 'PLAN',
        DoseType: 'PHYSICAL',
        DoseUnit: 'GY',
      },
    });

    const result = getScalingParameters(metaData, 'imageId3b');

    expect(result).toEqual({
      rescaleSlope: 1,
      rescaleIntercept: 0,
      modality: 'RTDOSE',
      doseGridScaling: 0.01,
      doseSummation: 'PLAN',
      doseType: 'PHYSICAL',
      doseUnit: 'GY',
    });
  });

  it('returns undefined for identity modality LUT with no PT/RTDOSE scaling', () => {
    const metaData = makeMetaData({
      modalityLutModule: { rescaleSlope: 1, rescaleIntercept: 0 },
      generalSeriesModule: { modality: 'CT' },
    });

    const result = getScalingParameters(metaData, 'imageId4');

    expect(result).toBeUndefined();
  });

  it('returns undefined when all modules are missing (normalizes to identity)', () => {
    const metaData = makeMetaData({});

    const result = getScalingParameters(metaData, 'imageId5');

    expect(result).toBeUndefined();
  });

  it('does not apply RTDOSE scaling when DoseGridScaling is not a number', () => {
    const metaData = makeMetaData({
      generalSeriesModule: { modality: 'RTDOSE' },
      scalingModule: { DoseGridScaling: 'not-a-number' },
    });

    const result = getScalingParameters(metaData, 'imageId6');

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// imageIdToURI
// ---------------------------------------------------------------------------
describe('imageIdToURI', () => {
  it('strips the scheme prefix', () => {
    expect(imageIdToURI('wadouri:http://x/y.dcm')).toBe('http://x/y.dcm');
  });

  it('retains colons that appear later in the URI (e.g. explicit port)', () => {
    expect(
      imageIdToURI('dicomweb:https://server:8080/studies/1/series/2')
    ).toBe('https://server:8080/studies/1/series/2');
  });

  it('retains a frame suffix untouched', () => {
    expect(imageIdToURI('wadouri:http://x/y.dcm?frame=3')).toBe(
      'http://x/y.dcm?frame=3'
    );
  });

  it('returns the entire string when there is no scheme colon', () => {
    expect(imageIdToURI('no-scheme-here')).toBe('no-scheme-here');
  });
});

// ---------------------------------------------------------------------------
// wadouri/parseImageId
// ---------------------------------------------------------------------------
describe('parseImageId', () => {
  it('parses scheme and url with no frame present', () => {
    const result = parseImageId('wadouri:http://x/y.dcm');

    expect(result).toEqual({
      scheme: 'wadouri',
      url: 'http://x/y.dcm',
      frame: undefined,
      pixelDataFrame: undefined,
    });
  });

  it('parses a "?frame=" suffix and adjusts pixelDataFrame by -1', () => {
    const result = parseImageId('wadouri:http://x/y.dcm?frame=3');

    expect(result.scheme).toBe('wadouri');
    expect(result.url).toBe('http://x/y.dcm');
    expect(result.frame).toBe(3);
    expect(result.pixelDataFrame).toBe(2);
  });

  it('parses a "&frame=" suffix (additional query param) the same way', () => {
    const result = parseImageId('wadouri:http://x/y.dcm?a=1&frame=5');

    expect(result.url).toBe('http://x/y.dcm?a=1');
    expect(result.frame).toBe(5);
    expect(result.pixelDataFrame).toBe(4);
  });

  it('treats frame=1 correctly, producing pixelDataFrame 0 (not falsy-skipped)', () => {
    const result = parseImageId('wadouri:http://x/y.dcm?frame=1');

    expect(result.frame).toBe(1);
    expect(result.pixelDataFrame).toBe(0);
  });

  it('parses a dicomweb scheme url with no "frame=" query param unaffected', () => {
    const result = parseImageId(
      'dicomweb:http://x/studies/1/series/2/instances/3/frames/4'
    );

    expect(result).toEqual({
      scheme: 'dicomweb',
      url: 'http://x/studies/1/series/2/instances/3/frames/4',
      frame: undefined,
      pixelDataFrame: undefined,
    });
  });
});

// ---------------------------------------------------------------------------
// wadors/loadImage -> getTransferSyntaxForContentType
// ---------------------------------------------------------------------------
describe('getTransferSyntaxForContentType', () => {
  const DEFAULT_TS = '1.2.840.10008.1.2';

  it('returns the default transfer syntax when contentType is falsy', () => {
    expect(getTransferSyntaxForContentType('')).toBe(DEFAULT_TS);
    expect(
      getTransferSyntaxForContentType(undefined as unknown as string)
    ).toBe(DEFAULT_TS);
  });

  it('prefers an explicit transfer-syntax parameter over the type map', () => {
    const contentType =
      'multipart/related; type="image/jls"; transfer-syntax=1.2.840.10008.1.2.4.80';

    expect(getTransferSyntaxForContentType(contentType)).toBe(
      '1.2.840.10008.1.2.4.80'
    );
  });

  it('strips quotes from a quoted transfer-syntax parameter', () => {
    const contentType =
      'multipart/related; type="application/octet-stream"; transfer-syntax="1.2.840.10008.1.2.4.70"';

    expect(getTransferSyntaxForContentType(contentType)).toBe(
      '1.2.840.10008.1.2.4.70'
    );
  });

  it('falls back to the bare-type map when contentType has no parameters at all', () => {
    expect(getTransferSyntaxForContentType('image/jp2')).toBe(
      '1.2.840.10008.1.2.4.90'
    );
    expect(getTransferSyntaxForContentType('image/jpeg')).toBe(
      '1.2.840.10008.1.2.4.50'
    );
  });

  it('falls back to the "type" parameter map when no transfer-syntax parameter is present', () => {
    expect(
      getTransferSyntaxForContentType('multipart/related; type="image/jls"')
    ).toBe('1.2.840.10008.1.2.4.80');
    expect(
      getTransferSyntaxForContentType('multipart/related; type=image/jp2')
    ).toBe('1.2.840.10008.1.2.4.90');
  });

  it('maps every documented content type to its default transfer syntax', () => {
    const table: Record<string, string> = {
      'image/jpeg': '1.2.840.10008.1.2.4.50',
      'image/x-dicom-rle': '1.2.840.10008.1.2.5',
      'image/x-jls': '1.2.840.10008.1.2.4.80',
      'image/jls': '1.2.840.10008.1.2.4.80',
      'image/jll': '1.2.840.10008.1.2.4.70',
      'image/jp2': '1.2.840.10008.1.2.4.90',
      'image/jpx': '1.2.840.10008.1.2.4.92',
      'image/jphc': '3.2.840.10008.1.2.4.96',
      // PS3.18 Table 8.7.3-5: image/jxl defaults to JPEG XL Lossless. The
      // .140 this used to assert is not a JPEG XL UID at all.
      'image/jxl': '1.2.840.10008.1.2.4.110',
      'application/x-deflate': '1.2.840.10008.1.2.8.1',
    };

    for (const [contentType, transferSyntax] of Object.entries(table)) {
      expect(getTransferSyntaxForContentType(contentType)).toBe(transferSyntax);
    }
  });

  it('falls back to the default transfer syntax for an unrecognized/generic content type', () => {
    expect(getTransferSyntaxForContentType('application/octet-stream')).toBe(
      DEFAULT_TS
    );
    expect(getTransferSyntaxForContentType('foo/bar')).toBe(DEFAULT_TS);
  });
});

// ---------------------------------------------------------------------------
// internal/options (singleton getOptions/setOptions)
// ---------------------------------------------------------------------------
describe('internal/options', () => {
  // The options module holds module-level singleton state that is mutated via
  // Object.assign in setOptions. Use jest.resetModules()+require() to get a
  // fresh, un-mutated instance for every test rather than trying to hand-rebuild
  // the exact default closures.
  let optionsModule: typeof import('../imageLoader/internal/options');

  beforeEach(() => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    optionsModule = require('../imageLoader/internal/options');
  });

  it('returns sane defaults', () => {
    const options = optionsModule.getOptions();

    expect(options.strict).toBe(false);
    expect(typeof options.open).toBe('function');
    expect(typeof options.beforeSend).toBe('function');
    expect(typeof options.beforeProcessing).toBe('function');
    expect(typeof options.imageCreated).toBe('function');
  });

  it('default beforeProcessing resolves with xhr.response untouched', async () => {
    const { beforeProcessing } = optionsModule.getOptions();

    const result = await beforeProcessing({
      response: 'abc',
    } as unknown as XMLHttpRequest);

    expect(result).toBe('abc');
  });

  it('default open calls xhr.open("get", url, true)', () => {
    const { open } = optionsModule.getOptions();
    const xhr = { open: jest.fn() };

    open(xhr as unknown as XMLHttpRequest, 'http://x/y.dcm');

    expect(xhr.open).toHaveBeenCalledWith('get', 'http://x/y.dcm', true);
  });

  it('setOptions merges overrides while preserving unspecified defaults', () => {
    optionsModule.setOptions({ strict: true });

    const options = optionsModule.getOptions();

    expect(options.strict).toBe(true);
    // Unrelated defaults remain intact after a partial override.
    expect(typeof options.open).toBe('function');
    expect(typeof options.imageCreated).toBe('function');
  });

  it('setOptions allows overriding individual callbacks', () => {
    const customOpen = jest.fn();

    optionsModule.setOptions({ open: customOpen });

    expect(optionsModule.getOptions().open).toBe(customOpen);
  });
});

// ---------------------------------------------------------------------------
// isModalityLutForDisplay
// ---------------------------------------------------------------------------
describe('isModalityLUTForDisplay', () => {
  it('returns false for XA SOP Class UID', () => {
    expect(isModalityLUTForDisplay('1.2.840.10008.5.1.4.1.1.12.1')).toBe(false);
  });

  it('returns false for XRF SOP Class UID', () => {
    expect(isModalityLUTForDisplay('1.2.840.10008.5.1.4.1.1.12.2.1')).toBe(
      false
    );
  });

  it('returns true for any other SOP Class UID', () => {
    expect(isModalityLUTForDisplay('1.2.840.10008.5.1.4.1.1.7')).toBe(true);
    expect(isModalityLUTForDisplay('')).toBe(true);
    expect(isModalityLUTForDisplay(undefined as unknown as string)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isNMReconstructable
// ---------------------------------------------------------------------------
describe('isNMReconstructable', () => {
  it('returns true for RECON TOMO', () => {
    expect(isNMReconstructable('RECON TOMO')).toBe(true);
  });

  it('returns true for RECON GATED TOMO', () => {
    expect(isNMReconstructable('RECON GATED TOMO')).toBe(true);
  });

  it('returns false for other/unknown values', () => {
    expect(isNMReconstructable('STATIC')).toBe(false);
    expect(isNMReconstructable(undefined)).toBe(false);
    expect(isNMReconstructable('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// wadors/metaData/getOverlayPlaneModule
// ---------------------------------------------------------------------------
describe('getOverlayPlaneModule (wadors)', () => {
  it('returns an empty overlays array when no overlay group tags are present', () => {
    const result = getOverlayPlaneModule({} as never);

    expect(result).toEqual({ overlays: [] });
  });

  it('extracts overlay group 0 (6000) fields and unpacks bits from InlineBinary', () => {
    const metaData: Record<string, unknown> = {
      '60003000': { vr: 'OW', InlineBinary: 'AQA=' }, // bytes [1, 0]
      '60000010': { vr: 'US', Value: [5] }, // rows
      '60000011': { vr: 'US', Value: [4] }, // columns
      '60000040': { vr: 'CS', Value: ['G'] }, // type
      '60000050': { vr: 'SS', Value: [10, 20] }, // origin (row, col)
      '60000022': { vr: 'LO', Value: ['a description'] },
      '60001500': { vr: 'LO', Value: ['a label'] },
      '60001301': { vr: 'IS', Value: [100] },
      '60001302': { vr: 'DS', Value: [50] },
      '60001303': { vr: 'DS', Value: [5] },
    };

    const result = getOverlayPlaneModule(metaData as never);

    expect(result.overlays.length).toBe(1);
    const overlay = result.overlays[0];

    expect(overlay.rows).toBe(5);
    expect(overlay.columns).toBe(4);
    expect(overlay.type).toBe('G');
    // x = origin column - 1, y = origin row - 1
    expect(overlay.x).toBe(19);
    expect(overlay.y).toBe(9);
    expect(overlay.description).toBe('a description');
    expect(overlay.label).toBe('a label');
    expect(overlay.roiArea).toBe(100);
    expect(overlay.roiMean).toBe(50);
    expect(overlay.roiStandardDeviation).toBe(5);
    // bytes [0b00000001, 0] unpacked LSB-first, 8 bits per byte
    expect(overlay.pixelData).toEqual([
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it('collects multiple overlay groups using uppercase, zero-padded group keys', () => {
    const metaData: Record<string, unknown> = {
      '60003000': { vr: 'OW', InlineBinary: 'AwA=' },
      '60000010': { vr: 'US', Value: [1] },
      '60000011': { vr: 'US', Value: [1] },
      // group 0x1E -> tag prefix 601E
      '601E3000': { vr: 'OW', InlineBinary: 'BQA=' },
      '601E0010': { vr: 'US', Value: [2] },
      '601E0011': { vr: 'US', Value: [2] },
    };

    const result = getOverlayPlaneModule(metaData as never);

    expect(result.overlays.length).toBe(2);
    expect(result.overlays[0].rows).toBe(1);
    expect(result.overlays[1].rows).toBe(2);
  });

  it('does not read dicom-parser style x60xx keys', () => {
    const metaData: Record<string, unknown> = {
      x60003000: { Value: [{ length: 1, dataOffset: 0 }] },
      x60000010: { Value: [1] },
      x60000011: { Value: [1] },
    };

    expect(getOverlayPlaneModule(metaData as never)).toEqual({ overlays: [] });
  });
});

// ---------------------------------------------------------------------------
// wadors/metaData/ECGHelpers -> retrieveBulkData BulkDataURI branch
// ---------------------------------------------------------------------------
describe('ECGHelpers retrieveBulkData BulkDataURI branch', () => {
  const numberOfChannels = 2;
  const numberOfSamples = 5;

  function makeWaveformBuffer(): Uint8Array {
    const buffer = new ArrayBuffer(numberOfChannels * numberOfSamples * 2);
    const view = new Int16Array(buffer);

    for (let i = 0; i < numberOfSamples; i++) {
      view[i * numberOfChannels + 0] = i * 100;
      view[i * numberOfChannels + 1] = -i * 100;
    }

    return new Uint8Array(buffer);
  }

  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function makeMetadata(bulkDataURI: string) {
    return {
      '54000100': {
        Value: [
          {
            '003A0005': { Value: [numberOfChannels] },
            '003A0010': { Value: [numberOfSamples] },
            '003A001A': { Value: [500] },
            '54001004': { Value: [16] },
            '54001006': { Value: ['SS'] },
            '003A0020': { Value: ['ECG'] },
            '003A0200': { Value: [] },
            '54001010': { BulkDataURI: bulkDataURI },
          },
        ],
      },
    };
  }

  it('fetches an absolute BulkDataURI as-is and decodes the response', async () => {
    const bytes = makeWaveformBuffer();
    const fetchMock = jest.fn().mockResolvedValue({
      arrayBuffer: async () => bytes.buffer,
      headers: { get: () => 'application/octet-stream' },
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const metadata = makeMetadata('http://otherserver/bulk/1');
    const ecgModule = getECGModule(metadata, 'http://wadoroot', '1.2.3');

    expect(ecgModule).not.toBeNull();
    const channelArrays = await ecgModule!.waveformData.retrieveBulkData();

    expect(fetchMock).toHaveBeenCalledWith('http://otherserver/bulk/1');
    expect(channelArrays.length).toBe(numberOfChannels);
    expect(channelArrays[0][0]).toBe(0);
    expect(channelArrays[0][1]).toBe(100);
    expect(channelArrays[1][1]).toBe(-100);
  });

  it('builds a wadoRsRoot/studies/{studyUID}/{url} path for a relative BulkDataURI', async () => {
    const bytes = makeWaveformBuffer();
    const fetchMock = jest.fn().mockResolvedValue({
      arrayBuffer: async () => bytes.buffer,
      headers: { get: () => 'application/octet-stream' },
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const metadata = makeMetadata('bulkdata/waveform1');
    const ecgModule = getECGModule(metadata, 'http://wadoroot', '1.2.3.4.5');

    await ecgModule!.waveformData.retrieveBulkData();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://wadoroot/studies/1.2.3.4.5/bulkdata/waveform1'
    );
  });

  it('builds a wadoRsRoot/{url} path when no studyUID is provided', async () => {
    const bytes = makeWaveformBuffer();
    const fetchMock = jest.fn().mockResolvedValue({
      arrayBuffer: async () => bytes.buffer,
      headers: { get: () => 'application/octet-stream' },
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const metadata = makeMetadata('bulkdata/waveform1');
    const ecgModule = getECGModule(metadata, 'http://wadoroot');

    await ecgModule!.waveformData.retrieveBulkData();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://wadoroot/bulkdata/waveform1'
    );
  });
});

// ---------------------------------------------------------------------------
// getInstanceModule
// ---------------------------------------------------------------------------
describe('getInstanceModule', () => {
  // getInstanceModule.ts imports { metaData } from '@cornerstonejs/core' (a
  // value import used only for metaData.toUpperCamelTag) - confirmed safe to
  // import in this jest environment (no web worker manager in its chain).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const {
    getInstanceModule,
    instanceModuleNames,
  } = require('../imageLoader/getInstanceModule');

  it('exposes the expected list of instance module names', () => {
    expect(instanceModuleNames).toEqual(
      expect.arrayContaining([
        'multiframeModule',
        'generalSeriesModule',
        'patientStudyModule',
        'imagePixelModule',
        'modalityLutModule',
        'voiLutModule',
        'sopCommonModule',
        'petIsotopeModule',
        'overlayPlaneModule',
        'transferSyntax',
        'petSeriesModule',
        'petImageModule',
      ])
    );
  });

  it('capitalizes keys returned by the metadata provider and merges across types', () => {
    const provider = jest.fn((type: string) => {
      if (type === 'generalSeriesModule') {
        return { modality: 'CT', seriesInstanceUID: '1.2.3' };
      }
      if (type === 'patientStudyModule') {
        return { patientWeight: 70 };
      }
      return undefined;
    });

    const result = getInstanceModule('imageId1', provider, [
      'generalSeriesModule',
      'patientStudyModule',
      'modalityLutModule',
    ]);

    expect(provider).toHaveBeenCalledTimes(3);
    expect(result).toHaveProperty('Modality', 'CT');
    expect(result).toHaveProperty('SeriesInstanceUID', '1.2.3');
    expect(result).toHaveProperty('PatientWeight', 70);
  });

  it('swallows provider errors for a given type and continues with the rest', () => {
    const loggerErrorSpy = jest
      .spyOn(logging.loaderLog.getLogger('getInstanceModule'), 'error')
      .mockImplementation(() => {});
    const provider = jest.fn((type: string) => {
      if (type === 'badModule') {
        throw new Error('boom');
      }
      return { ok: true };
    });

    const result = getInstanceModule('imageId2', provider, [
      'badModule',
      'goodModule',
    ]);

    expect(result).toEqual({ Ok: true });
    expect(loggerErrorSpy).toHaveBeenCalled();
    loggerErrorSpy.mockRestore();
  });
});
