import Events from '../../../enums/Events';
import eventTarget from '../../../eventTarget';

type VolumeEventDetail = {
  volumeId?: string;
};

export function subscribeToVolumeProgress(
  volumeId: string,
  onProgress: () => void
): () => void {
  const handleProgress = (evt: Event) => {
    const detail = (evt as CustomEvent<VolumeEventDetail>).detail;

    if (detail?.volumeId !== volumeId) {
      return;
    }

    onProgress();
  };

  eventTarget.addEventListener(Events.IMAGE_VOLUME_MODIFIED, handleProgress);
  eventTarget.addEventListener(
    Events.IMAGE_VOLUME_LOADING_COMPLETED,
    handleProgress
  );

  return () => {
    eventTarget.removeEventListener(
      Events.IMAGE_VOLUME_MODIFIED,
      handleProgress
    );
    eventTarget.removeEventListener(
      Events.IMAGE_VOLUME_LOADING_COMPLETED,
      handleProgress
    );
  };
}
