import type {
  DataProvider,
  LogicalDataObject,
} from '../ViewportArchitectureTypes';
import type { ECGWaveformPayload } from './ECGViewportV2Types';
import { loadECGWaveform } from '../../../utilities/ECGUtilities';
import * as metaData from '../../../metaData';
import viewportV2DataSetMetadataProvider from '../../../utilities/viewportV2DataSetMetadataProvider';

export class DefaultECGDataProvider implements DataProvider {
  async load(dataId: string): Promise<LogicalDataObject> {
    const sourceDataId = this.getSourceDataId(dataId);
    const { waveform, calibration } = await loadECGWaveform(sourceDataId);

    return {
      id: dataId,
      type: 'ecg',
      metadata: {
        calibration,
      },
      payload: waveform as ECGWaveformPayload,
    };
  }

  private getSourceDataId(dataId: string): string {
    const registered = metaData.get(
      viewportV2DataSetMetadataProvider.VIEWPORT_V2_DATA_SET,
      dataId
    );

    if (typeof registered === 'string') {
      return registered;
    }

    if (Array.isArray(registered) && registered[0]) {
      return registered[0];
    }

    return dataId;
  }
}
