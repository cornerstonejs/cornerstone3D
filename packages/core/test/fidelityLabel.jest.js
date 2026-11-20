import { describe, it, expect } from '@jest/globals';
import { fidelityLabelOf } from '../src/RenderingEngine/helpers/fidelityIndicator/fidelityLabel';

describe('fidelityLabelOf', () => {
  it('hides the label when there is no data or full fidelity', () => {
    expect(fidelityLabelOf('hidden')).toBeNull();
    expect(fidelityLabelOf('done')).toBeNull();
  });

  it('uses Transient Low Fidelity for loading and lod', () => {
    expect(fidelityLabelOf('loading')).toBe('Transient Low Fidelity');
    expect(fidelityLabelOf('lod')).toBe('Transient Low Fidelity');
  });

  it('uses Low Fidelity for a standing reduction', () => {
    expect(fidelityLabelOf('lossy')).toBe('Low Fidelity');
  });
});
