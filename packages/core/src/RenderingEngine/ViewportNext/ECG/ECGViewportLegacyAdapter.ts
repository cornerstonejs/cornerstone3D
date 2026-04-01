import type { ECGViewportProperties } from '../../../types';
import ECGViewportNext from './ECGViewportNext';

class ECGViewportLegacyAdapter extends ECGViewportNext {
  async setEcg(imageId: string): Promise<void> {
    await this.setDataList([{ dataId: imageId }]);
  }

  setChannelVisibility(index: number, visible: boolean): void {
    const waveform = this.getWaveformData();
    const dataId = this.getFirstBinding()?.data.id;

    if (!waveform || !dataId) {
      return;
    }

    const current = this.getDataPresentation(dataId) || {};
    const nextVisibleChannels = new Set(
      current.visibleChannels || waveform.channels.map((_channel, i) => i)
    );

    if (visible) {
      nextVisibleChannels.add(index);
    } else {
      nextVisibleChannels.delete(index);
    }

    this.setDataPresentation(dataId, {
      visibleChannels: Array.from(nextVisibleChannels).sort((a, b) => a - b),
    });
  }

  setProperties(props: ECGViewportProperties): void {
    const dataId = this.getFirstBinding()?.data.id;

    if (!dataId) {
      return;
    }

    this.setDataPresentation(dataId, {
      visibleChannels: props.visibleChannels,
    });
  }

  getProperties(): ECGViewportProperties {
    const dataId = this.getFirstBinding()?.data.id;

    return {
      visibleChannels: dataId
        ? this.getDataPresentation(dataId)?.visibleChannels
        : undefined,
    };
  }

  resetProperties(): void {
    const waveform = this.getWaveformData();
    const dataId = this.getFirstBinding()?.data.id;

    if (!waveform || !dataId) {
      return;
    }

    this.setDataPresentation(dataId, {
      visibleChannels: waveform.channels.map((_channel, index) => index),
    });
  }
}

export default ECGViewportLegacyAdapter;
