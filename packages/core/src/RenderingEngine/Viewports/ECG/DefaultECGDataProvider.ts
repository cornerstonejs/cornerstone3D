import type { DataProvider, LoadedData } from '../ViewportArchitectureTypes';
import type { ECGWaveformPayload } from './ECGViewportTypes';
import { loadECGWaveform } from './ecgWaveform';
import {
  displaySetShapeError,
  getDisplaySetImageId,
} from '../displaySetAccess';

export class DefaultECGDataProvider implements DataProvider {
  async load(
    displaySetId: string,
    options?: { multiplexGroupIndex?: number }
  ): Promise<LoadedData<ECGWaveformPayload>> {
    const sourceImageId = getDisplaySetImageId(displaySetId);

    if (!sourceImageId) {
      throw displaySetShapeError('ECGViewport', displaySetId, 'imageId');
    }

    const { waveform } = await loadECGWaveform(sourceImageId, {
      multiplexGroupIndex: options?.multiplexGroupIndex,
    });

    return {
      id: displaySetId,
      type: 'ecg',
      ...(waveform as ECGWaveformPayload),
    };
  }
}
