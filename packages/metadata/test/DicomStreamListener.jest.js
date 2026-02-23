import { NaturalTagListener } from '../src/utilities/dicomStream/NaturalTagListener';
import { Tags } from '../src/utilities/Tags';

import { describe, beforeEach, it } from '@jest/globals';

const abList = ['a', 'b'];
describe('NaturalTagListener', () => {
  let listener;

  describe('standalone listener', () => {
    beforeEach(() => {
      listener = new NaturalTagListener();
    });

    it('accepts simple values', () => {
      listener.startObject();

      listener.addTag('abList1');
      listener.values(abList);
      // values internally pops

      listener.addTag('abList2');
      abList.forEach((item) => listener.value(item));
      listener.pop();

      listener.addTag(Tags.SOPClassUID.tag, { vr: 'UI' });
      listener.values(['1.2.3']);

      const instance = listener.pop();

      expect(instance.abList1).toEqual(abList);
      expect(instance.abList2).toEqual(abList);
      expect(instance.SOPClassUID).toEqual('1.2.3');
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
      // Ends the value array
      listener.pop();

      // Ends the start object
      listener.pop();

      // Ends the sequence object
      listener.pop();

      // Gets the final result
      const instance = listener.pop();

      expect(instance.sequence[0].abList).toEqual(abList);
      expect(instance.sequence[1].abList).toEqual(abList);
    });
  });
});
