export type VolumeActor = {
  getProperty: () => any
  getMapper: () => any
}

export type ActorEntry = {
  uid: string
  volumeActor: VolumeActor
  slabThickness?: number
}
