interface ScalingParameters {
  /** m in m*p+b which specifies the linear transformation from stored pixels to memory value  */
  rescaleSlope: number;
  /** b in m*p+b which specifies the offset of the transformation */
  rescaleIntercept: number;
  /** modality */
  modality: string;
  /** SUV body weight */
  suvbw?: number;
  /** SUV lean body mass */
  suvlbm?: number;
  /** SUV body surface area */
  suvbsa?: number;
}

interface PTScaling {
  /** suv body weight to suv lean body mass */
  suvbwToSuvlbm?: number;
  /** suv body weight to suv body surface area */
  suvbwToSuvbsa?: number;
  /** SUV body weight */
  suvbw?: number;
  /** SUV lean body mass */
  suvlbm?: number;
  /** SUV body surface area */
  suvbsa?: number;
}

interface Scaling {
  PT?: PTScaling;
}

export type { PTScaling, Scaling, ScalingParameters };
