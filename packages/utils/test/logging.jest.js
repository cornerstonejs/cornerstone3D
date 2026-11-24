import dcmjs from '@dcmjs-org/dcmjs';
import { log, cs3dLog } from '../src/utilities/logging';
import { describe, it, expect } from '@jest/globals';

describe('logging', () => {
  it('shares one loglevel root with dcmjs 1.0', () => {
    expect(log).toBe(dcmjs.log);
    expect(dcmjs.log.getLogger('cs3d')).toBe(cs3dLog);
  });
});
