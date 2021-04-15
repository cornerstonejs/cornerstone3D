export type VolumeActor = {
  getProperty: () => any
}

export type ActorEntry = {
  uid: string
  volumeActor: VolumeActor
  slabThickness?: number
}
