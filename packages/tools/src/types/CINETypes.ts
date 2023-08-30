import { Types } from '@cornerstonejs/core';

type PlayClipOptions = {
  framesPerSecond?: number;
  frameTimeVector?: number[];
  reverse?: boolean;
  loop?: boolean;
  dynamicCineEnabled?: boolean;
  frameTimeVectorSpeedMultiplier?: number;
};

interface ToolData {
  intervalId: number | undefined;
  framesPerSecond: number;
  lastFrameTimeStamp: number | undefined;
  frameTimeVector: number[] | undefined;
  ignoreFrameTimeVector: boolean;
  usingFrameTimeVector: boolean;
  speed: number;
  reverse: boolean;
  loop: boolean;
  dynamicCineEnabled?: boolean;
}

type CinePlayContext = {
  get numScrollSteps(): number;
  get currentStepIndex(): number;
  get frameTimeVectorEnabled(): boolean;
  scroll(delta: number): void;
};

export type { PlayClipOptions, ToolData, CinePlayContext };
