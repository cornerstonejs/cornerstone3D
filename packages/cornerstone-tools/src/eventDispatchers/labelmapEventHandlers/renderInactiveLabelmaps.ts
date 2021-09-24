import { Scene } from '@ohif/cornerstone-render'
import state from '../../store/SegmentationModule/state'

export default function renderInactiveLabelmaps(
  scene: Scene,
  viewportUID: string
): void {
  // Render all associated render maps
  const labelmapUIDsToRender = state.volumeViewports[viewportUID].labelmaps.map(
    (labelmapState) => labelmapState.volumeUID
  )

  const actorEntries = scene.getVolumeActors()

  actorEntries.forEach(({ uid, volumeActor }) => {
    if (labelmapUIDsToRender.includes(uid)) {
      volumeActor.setVisibility(true)
    }
  })

  scene.render()
}
