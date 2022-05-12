type PlayClipOptions = {
  framesPerSecond?: number;
  frameTimeVector?: number[];
  reverse?: boolean;
  loop?: boolean;
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
}

export type { PlayClipOptions, ToolData };
