import { describe, it, expect, jest, afterEach } from '@jest/globals';
import * as metaData from '../src/metaData';
import { MetadataModules } from '../src/enums';
import {
  addDicomwebInstance,
  addPart10Instance,
} from '../src/utilities/metadataProvider/addPart10Instance';

describe('naturalized add entrypoints', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps dicomweb payload to dicomwebJson via addTyped', () => {
    const addTypedSpy = jest
      .spyOn(metaData, 'addTyped')
      .mockReturnValue({ value: 'ok' });
    const payload = { '00080060': { vr: 'CS', Value: ['CT'] } };

    const result = addDicomwebInstance('image-6', payload);

    expect(addTypedSpy).toHaveBeenCalledWith(
      MetadataModules.NATURALIZED,
      'image-6',
      { dicomwebJson: payload }
    );
    expect(result).toEqual({ value: 'ok' });
  });

  it('maps part10 payload to part10Buffer via addTyped', async () => {
    const addTypedSpy = jest
      .spyOn(metaData, 'addTyped')
      .mockResolvedValue({ value: 'ok' });
    const payload = new Uint8Array([1, 2, 3]);

    const result = await addPart10Instance('image-7', payload);

    expect(addTypedSpy).toHaveBeenCalledWith(
      MetadataModules.NATURALIZED,
      'image-7',
      { part10Buffer: payload }
    );
    expect(result).toEqual({ value: 'ok' });
  });
});
