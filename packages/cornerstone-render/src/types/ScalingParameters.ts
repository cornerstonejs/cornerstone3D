type ScalingParameters = {
  rescaleSlope: number
  rescaleIntercept: number
  modality: string
  suvbw?: number
  suvlbm?: number
  suvbsa?: number
}

type PetScaling = {
  suvbwToSuvlbm?: number
  suvbwToSuvbsa?: number
}

type Scaling = {
  PET?: PetScaling
}

export { PetScaling, Scaling, ScalingParameters }
