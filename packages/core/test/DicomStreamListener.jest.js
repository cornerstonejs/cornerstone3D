import { DicomStreamListener } from '../src/utilities/dicomStream/DicomStreamListener';
import { Tags } from '../src/utilities/Tags';

import { describe, beforeEach, it, test } from '@jest/globals';

const abList = ['a', 'b'];
describe('DicomStreamListener', () => {
  let listener;

  describe('metadata listener', () => {
    beforeEach(() => {
      // Default listener should create metadata instances
      listener = new DicomStreamListener();
    });

    it('accepts simple values', () => {
      listener.startObject();

      listener.addTag(Tags.InstanceNumber.tag);
      listener.values(abList);
      // values internally pops

      listener.addTag(Tags.Units.tag);
      abList.forEach((item) => listener.value(item));
      listener.pop();

      const instance = listener.pop();

      expect(instance[Tags.InstanceNumber.tag].Value).toEqual(abList);
      expect(instance[Tags.Units.tag].Value).toEqual(abList);
    });

    it('accepts sequences', () => {
      listener.startObject();

      listener.addTag('sequence', { vr: 'SQ' });
      listener.startObject();

      listener.addTag('abList');
      listener.values(abList);
      // Ends the start object
      listener.pop();

      listener.startObject();
      listener.addTag('abList');
      abList.forEach((item) => listener.value(item));
      listener.pop();
      // Ends the start object
      listener.pop();

      // Ends the sequence object
      listener.pop();

      // Gets the final result
      const instance = listener.pop();

      expect(instance.sequence.Value[0].abList.Value).toEqual(abList);
      expect(instance.sequence.Value[1].abList.Value).toEqual(abList);
    });
  });
});
