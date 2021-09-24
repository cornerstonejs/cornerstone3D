import { Scene } from '@ohif/cornerstone-render'
import state from '../../store/SegmentationModule/state'

export default function renderActiveLabelmaps(
  scene: Scene,
  viewportUID: string,
  activeLabelmapIndex: number
) {
  // Render only active labelmaps from the viewport state
  const viewportLabelmaps = state.volumeViewports[viewportUID].labelmaps
  const { volumeUID } = viewportLabelmaps[activeLabelmapIndex]
  const allLabelmapUIDs = viewportLabelmaps.map((state) => state.volumeUID)

  const actorEntries = scene.getVolumeActors()

  actorEntries.forEach(({ uid, volumeActor }) => {
    // Only set invisible for labelmaps that are not active
    if (allLabelmapUIDs.includes(uid) && uid !== volumeUID) {
      volumeActor.setVisibility(false)
    }
  })

  scene.render()
}
