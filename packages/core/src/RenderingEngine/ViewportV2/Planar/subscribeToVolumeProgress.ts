import Events from '../../../enums/Events';
import eventTarget from '../../../eventTarget';

type VolumeEventDetail = {
  volumeId?: string;
};

type VolumeProgressOptions = {
  repeatRequestAnimationFrames?: number;
  trailingTimeoutMs?: number[];
};

export function subscribeToVolumeProgress(
  volumeId: string,
  onProgress: () => void,
  options: VolumeProgressOptions = {}
): () => void {
  const { repeatRequestAnimationFrames = 0, trailingTimeoutMs = [] } = options;
  let burstToken = 0;
  let animationFrameIds: number[] = [];
  let timeoutIds: number[] = [];

  const clearScheduled = () => {
    animationFrameIds.forEach((id) => window.cancelAnimationFrame(id));
    timeoutIds.forEach((id) => window.clearTimeout(id));
    animationFrameIds = [];
    timeoutIds = [];
  };

  const scheduleRepeatedProgress = () => {
    burstToken += 1;
    const token = burstToken;

    clearScheduled();

    let remainingFrames = repeatRequestAnimationFrames;

    const scheduleFrame = () => {
      if (remainingFrames <= 0) {
        return;
      }

      const frameId = window.requestAnimationFrame(() => {
        animationFrameIds = animationFrameIds.filter((id) => id !== frameId);

        if (token !== burstToken) {
          return;
        }

        onProgress();
        remainingFrames -= 1;
        scheduleFrame();
      });

      animationFrameIds.push(frameId);
    };

    scheduleFrame();

    trailingTimeoutMs.forEach((delay) => {
      const timeoutId = window.setTimeout(() => {
        timeoutIds = timeoutIds.filter((id) => id !== timeoutId);

        if (token !== burstToken) {
          return;
        }

        onProgress();
      }, delay);

      timeoutIds.push(timeoutId);
    });
  };

  const handleProgress = (evt: Event) => {
    const detail = (evt as CustomEvent<VolumeEventDetail>).detail;

    if (detail?.volumeId !== volumeId) {
      return;
    }

    onProgress();
    scheduleRepeatedProgress();
  };

  eventTarget.addEventListener(Events.IMAGE_VOLUME_MODIFIED, handleProgress);
  eventTarget.addEventListener(
    Events.IMAGE_VOLUME_LOADING_COMPLETED,
    handleProgress
  );

  return () => {
    burstToken += 1;
    clearScheduled();
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
