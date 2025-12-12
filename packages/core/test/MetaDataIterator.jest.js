import { DicomStreamListener } from '../src/utilities/dicomStream/DicomStreamListener';
import { NaturalTagListener } from '../src/utilities/dicomStream/NaturalTagListener';
import { Tags } from '../src/utilities/Tags';
import { tags } from '../../dicomImageLoader/testImages/CTImage.dcm_BigEndianExplicitTransferSyntax_1.2.840.10008.1.2.2.wado-rs-tags';

import { describe, beforeEach, it, test } from '@jest/globals';
import { instanceFromListener } from '../src/utilities';
import { MetaDataIterator } from '../src/utilities/dicomStream';

describe('MetaDataIterator', () => {
  it('creates natural CTImage_BigEndianExplicit from metadata', () => {
    const data = new MetaDataIterator(tags);
    const listener = NaturalTagListener.newNaturalStreamListener();
    listener.startObject();
    data.syncIterator(listener);
    const instance = listener.pop();
    expect(instance).toBeTruthy();
    expect(instance.Rows).toBe(512);
    expect(instance.StudyTime).toBe('083501');
    expect(instance.PixelSpacing).toEqual([0.675781, 0.675781]);
  });
});
