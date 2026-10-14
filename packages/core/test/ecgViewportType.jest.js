import { getViewportClassForInput } from '../src/RenderingEngine/helpers/viewportTypeToViewportClass';
import ViewportType from '../src/enums/ViewportType';
import LegacyECGViewport from '../src/RenderingEngine/ECGViewport';
import ECGViewportLegacyAdapter from '../src/RenderingEngine/GenericViewport/ECG/ECGViewportLegacyAdapter';

describe('ECG viewport types', () => {
  it.each([ViewportType.ECG, ViewportType.ECG_NEXT])(
    'gives the Generic Viewport ECG family for %s',
    (type) => {
      expect(getViewportClassForInput({ type, requestedType: type })).toBe(
        ECGViewportLegacyAdapter
      );
    }
  );

  it('gives the deprecated class for ecgLegacy', () => {
    expect(
      getViewportClassForInput({
        type: ViewportType.ECG_LEGACY,
        requestedType: ViewportType.ECG_LEGACY,
      })
    ).toBe(LegacyECGViewport);
  });
});
