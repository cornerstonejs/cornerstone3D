import { NaturalTagListener } from '../src/utilities/dicomStream/NaturalTagListener';
import { Tags } from '../src/utilities/Tags';

import { describe, beforeEach, it } from '@jest/globals';

const abList = ['a', 'b'];
describe('NaturalTagListener', () => {
  let listener;

  describe('as DicomMetadataListener filter', () => {
    beforeEach(() => {
      listener = NaturalTagListener.createMetadataListener();
    });

    it('accepts simple values', () => {
      listener.startObject();

      listener.addTag('abList1');
      abList.forEach((item) => listener.value(item));
      listener.pop();

      listener.addTag('abList2');
      abList.forEach((item) => listener.value(item));
      listener.pop();

      listener.addTag(Tags.SOPClassUID.tag, { vr: 'UI' });
      listener.value('1.2.3');
      listener.pop();

      const instance = listener.pop();

      expect(instance.abList1).toEqual(abList);
      expect(instance.abList2).toEqual(abList);
      expect(instance.SOPClassUID).toEqual('1.2.3');
    });

    it('accepts sequences', () => {
      const root = {};
      listener.startObject(root);

      listener.addTag('sequence', { vr: 'SQ' });
      listener.startObject();

      listener.addTag('abList');
      abList.forEach((item) => listener.value(item));
      listener.pop(); // pop abList -> at item1
      listener.pop(); // pop item1 -> at sequence

      listener.startObject();
      listener.addTag('abList');
      abList.forEach((item) => listener.value(item));
      listener.pop();

      // Ends the second item (startObject) -> back to sequence tag
      listener.pop();

      // Ends the sequence tag -> back to root
      listener.pop();

      // Gets the root (same object we passed to startObject)
      const instance = listener.pop();

      expect(instance).toBe(root);
      expect(root.sequence).toBeDefined();
      expect(Array.isArray(root.sequence)).toBe(true);
      expect(root.sequence.length).toBe(2);
      expect(root.sequence[0].abList).toEqual(abList);
      expect(root.sequence[1].abList).toEqual(abList);
    });
  });
});
