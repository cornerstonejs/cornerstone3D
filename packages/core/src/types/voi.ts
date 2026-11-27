interface VOI {
  /** Window Width for display */
  windowWidth: number;
  /** Window Center for display */
  windowCenter: number;
  /**
   * VOI LUT Function (0028,1056) of the window. The function controls how the
   * window becomes a range, so it must stay with the window.
   */
  voiLUTFunction?: string;
}

interface VOIRange {
  /** upper value for display */
  upper: number;
  /** lower value for display */
  lower: number;
}

export type { VOI, VOIRange };
