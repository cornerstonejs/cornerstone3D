import { getViewportClassForInput } from '../src/RenderingEngine/helpers/viewportTypeToViewportClass';
import ViewportType from '../src/enums/ViewportType';
import LegacyECGViewport from '../src/RenderingEngine/ECGViewport';
import ECGViewport from '../src/RenderingEngine/GenericViewport/ECG/ECGViewport';
import ECGViewportLegacyAdapter from '../src/RenderingEngine/GenericViewport/ECG/ECGViewportLegacyAdapter';

const classFor = (type) =>
  getViewportClassForInput({ type, requestedType: type });

describe('ECG viewport types', () => {
  it('gives the legacy adapter of the Generic Viewport family for ecg', () => {
    expect(classFor(ViewportType.ECG)).toBe(ECGViewportLegacyAdapter);
  });

  it('gives the clean ECG class for ecgNext (GENVIEW-API-8)', () => {
    expect(classFor(ViewportType.ECG_NEXT)).toBe(ECGViewport);
  });

  it('gives the deprecated class for ecgLegacy', () => {
    expect(classFor(ViewportType.ECG_LEGACY)).toBe(LegacyECGViewport);
  });
});
