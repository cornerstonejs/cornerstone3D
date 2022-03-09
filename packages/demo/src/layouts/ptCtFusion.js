import {
  ORIENTATION,
  VIEWPORT_TYPE,
  getVolume,
  setVolumesOnViewports,
} from '@precisionmetrics/cornerstone-render'
import { BlendModes } from '@precisionmetrics/cornerstone-tools'
import { SCENE_IDS, VIEWPORT_IDS } from '../constants'
import {
  setCTWWWC,
  setPetTransferFunction,
  getSetPetColorMapTransferFunction,
} from '../helpers/transferFunctionHelpers'

function setLayout(
  renderingEngine,
  elementContainers,
  {
    ctSceneToolGroup,
    ptSceneToolGroup,
    fusionSceneToolGroup,
    ptMipSceneToolGroup,
  },
  {
    axialSynchronizers = [],
    sagittalSynchronizers = [],
    coronalSynchronizers = [],
    ptThresholdSynchronizer,
    ctWLSynchronizer,
  }
) {
  const viewportInput = [
    // CT
    {
      viewportUID: VIEWPORT_IDS.CT.AXIAL,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      element: elementContainers.get(0),
      defaultOptions: {
        orientation: ORIENTATION.AXIAL,
      },
    },
    {
      viewportUID: VIEWPORT_IDS.CT.SAGITTAL,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      element: elementContainers.get(1),
      defaultOptions: {
        orientation: ORIENTATION.SAGITTAL,
      },
    },
    {
      viewportUID: VIEWPORT_IDS.CT.CORONAL,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      element: elementContainers.get(2),
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
      },
    },

    // PT

    {
      viewportUID: VIEWPORT_IDS.PT.AXIAL,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      element: elementContainers.get(3),
      defaultOptions: {
        orientation: ORIENTATION.AXIAL,
        background: [1, 1, 1],
      },
    },
    {
      viewportUID: VIEWPORT_IDS.PT.SAGITTAL,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      element: elementContainers.get(4),
      defaultOptions: {
        orientation: ORIENTATION.SAGITTAL,
        background: [1, 1, 1],
      },
    },
    {
      viewportUID: VIEWPORT_IDS.PT.CORONAL,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      element: elementContainers.get(5),
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
        background: [1, 1, 1],
      },
    },

    // Fusion

    {
      viewportUID: VIEWPORT_IDS.FUSION.AXIAL,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      element: elementContainers.get(6),
      defaultOptions: {
        orientation: ORIENTATION.AXIAL,
      },
    },
    {
      viewportUID: VIEWPORT_IDS.FUSION.SAGITTAL,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      element: elementContainers.get(7),
      defaultOptions: {
        orientation: ORIENTATION.SAGITTAL,
      },
    },
    {
      viewportUID: VIEWPORT_IDS.FUSION.CORONAL,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      element: elementContainers.get(8),
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
      },
    },

    // PET MIP
    {
      viewportUID: VIEWPORT_IDS.PTMIP.CORONAL,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      element: elementContainers.get(9),
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
        background: [1, 1, 1],
      },
    },
  ]

  renderingEngine.setViewports(viewportInput)

  // Add tools
  const renderingEngineUID = renderingEngine.uid

  // CT tool groups
  viewportInput.slice(0, 3).forEach(({ viewportUID }, index) => {
    ctSceneToolGroup.addViewports(renderingEngineUID, viewportUID)
  })

  // PT tool groups
  viewportInput.slice(3, 6).forEach(({ viewportUID }, index) => {
    ptSceneToolGroup.addViewports(renderingEngineUID, viewportUID)
  })

  // Fusion tool groups
  viewportInput.slice(6, 9).forEach(({ viewportUID }, index) => {
    fusionSceneToolGroup.addViewports(renderingEngineUID, viewportUID)
  })

  // PET MIP tool groups
  viewportInput.slice(9, 10).forEach(({ viewportUID }, index) => {
    ptMipSceneToolGroup.addViewports(renderingEngineUID, viewportUID)
  })

  const axialViewports = [0, 3, 6]
  axialSynchronizers.forEach((sync) => {
    axialViewports.forEach((axialIndex) => {
      const { viewportUID } = viewportInput[axialIndex]
      sync.add({ renderingEngineUID, viewportUID })
    })
  })

  const sagittalViewports = [1, 4, 7]
  sagittalSynchronizers.forEach((sync) => {
    sagittalViewports.forEach((sagittalIndex) => {
      const { viewportUID } = viewportInput[sagittalIndex]
      sync.add({ renderingEngineUID, viewportUID })
    })
  })

  const coronalViewports = [2, 5, 8]
  coronalSynchronizers.forEach((sync) => {
    coronalViewports.forEach((coronalIndex) => {
      const { viewportUID } = viewportInput[coronalIndex]
      sync.add({ renderingEngineUID, viewportUID })
    })
  })

  const ctViewports = [0, 1, 2]
  const petViewports = [3, 4, 5]
  const fusionViewports = [6, 7, 8]
  const petMipViewports = [9]

  // CT WL Synchronization
  ctViewports.forEach((ctIndex) => {
    const { viewportUID } = viewportInput[ctIndex]
    ctWLSynchronizer.add({ renderingEngineUID, viewportUID })
  })

  fusionViewports.forEach((fusionIndex) => {
    const { viewportUID } = viewportInput[fusionIndex]
    ctWLSynchronizer.addTarget({ renderingEngineUID, viewportUID })
  })

  // PT Threshold Synchronization
  petViewports.forEach((ptIndex) => {
    const { viewportUID } = viewportInput[ptIndex]
    // add as both source and target
    ptThresholdSynchronizer.add({
      renderingEngineUID,
      viewportUID,
    })
  })

  fusionViewports.forEach((fusionIndex) => {
    const { viewportUID } = viewportInput[fusionIndex]
    // add as both source and target
    ptThresholdSynchronizer.add({
      renderingEngineUID,
      viewportUID,
    })
  })

  petMipViewports.forEach((ptMipIndex) => {
    const { viewportUID } = viewportInput[ptMipIndex]
    ptThresholdSynchronizer.add({
      renderingEngineUID,
      viewportUID,
    })
  })

  // Render backgrounds
  renderingEngine.render()
}

async function setVolumes(
  renderingEngine,
  ctVolumeUID,
  ptVolumeUID,
  petColorMap
) {
  await setVolumesOnViewports(
    renderingEngine,
    [
      {
        volumeUID: ctVolumeUID,
        callback: setCTWWWC,
        blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
      },
    ],
    [VIEWPORT_IDS.CT.AXIAL, VIEWPORT_IDS.CT.SAGITTAL, VIEWPORT_IDS.CT.CORONAL]
  )

  await setVolumesOnViewports(
    renderingEngine,
    [
      {
        volumeUID: ptVolumeUID,
        callback: setPetTransferFunction,
        blendMode: BlendModes.COMPOSITE,
      },
    ],
    [VIEWPORT_IDS.PT.AXIAL, VIEWPORT_IDS.PT.SAGITTAL, VIEWPORT_IDS.PT.CORONAL]
  )

  await setVolumesOnViewports(
    renderingEngine,
    [
      {
        volumeUID: ctVolumeUID,
        callback: setCTWWWC,
        blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
      },
      {
        volumeUID: ptVolumeUID,
        callback: getSetPetColorMapTransferFunction(petColorMap),
        blendMode: BlendModes.COMPOSITE,
      },
    ],
    [
      VIEWPORT_IDS.FUSION.AXIAL,
      VIEWPORT_IDS.FUSION.SAGITTAL,
      VIEWPORT_IDS.FUSION.CORONAL,
    ]
  )

  /*
   * set the blendMode in the mapper of a volume. The blend mode is a property of
   * a scene connected to the volume. So it has to be set here.
   *
   * NOTE1: there is a 1:1 correspondence between Volume/Actor/Mapper/ImageData
   *        and they are all shared in a scene.
   * NOTE2: there is a 1:1 correspondence between a viewport/camera/slabThickness
   * NOTE3: in a viewport you can have different volumes with different blend
   *        modes. But all the volumes have to use the slabThickness of the
   *        camera of that viewport. If there is a volume with composite blending
   *        (i.e. no blending), then, just for that volume, the shader will
   *        ignore the slab thickness. Check the vtkSlabCamera for more info.
   */

  const ptVolume = getVolume(ptVolumeUID)
  const ptVolumeDimensions = ptVolume.dimensions

  // Only make the MIP as large as it needs to be.
  const slabThickness = Math.sqrt(
    ptVolumeDimensions[0] * ptVolumeDimensions[0] +
      ptVolumeDimensions[1] * ptVolumeDimensions[1] +
      ptVolumeDimensions[2] * ptVolumeDimensions[2]
  )

  await setVolumesOnViewports(
    renderingEngine,
    [
      {
        volumeUID: ptVolumeUID,
        callback: setPetTransferFunction,
        blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
        slabThickness,
      },
    ],
    [VIEWPORT_IDS.PTMIP.CORONAL]
  )

  initializeCameraSync(renderingEngine)
}

function initializeCameraSync(ctScene, ptScene, fusionScene) {
  // The fusion scene is the target as it is scaled to both volumes.
  // TODO -> We should have a more generic way to do this,
  // So that when all data is added we can synchronize zoom/position before interaction.

  const axialCtViewport = renderingEngine.getViewport(VIEWPORT_IDS.CT.AXIAL)
  const sagittalCtViewport = renderingEngine.getViewport(
    VIEWPORT_IDS.CT.SAGITTAL
  )
  const coronalCtViewport = renderingEngine.getViewport(VIEWPORT_IDS.CT.CORONAL)

  const axialPtViewport = renderingEngine.getViewport(VIEWPORT_IDS.PT.AXIAL)
  const sagittalPtViewport = renderingEngine.getViewport(
    VIEWPORT_IDS.PT.SAGITTAL
  )
  const coronalPtViewport = renderingEngine.getViewport(VIEWPORT_IDS.PT.CORONAL)

  const axialFusionViewport = renderingEngine.getViewport(
    VIEWPORT_IDS.FUSION.AXIAL
  )
  const sagittalFusionViewport = renderingEngine.getViewport(
    VIEWPORT_IDS.FUSION.SAGITTAL
  )
  const coronalFusionViewport = renderingEngine.getViewport(
    VIEWPORT_IDS.FUSION.CORONAL
  )

  initCameraSynchronization(axialFusionViewport, axialCtViewport)
  initCameraSynchronization(axialFusionViewport, axialPtViewport)

  initCameraSynchronization(sagittalFusionViewport, sagittalCtViewport)
  initCameraSynchronization(sagittalFusionViewport, sagittalPtViewport)

  initCameraSynchronization(coronalFusionViewport, coronalCtViewport)
  initCameraSynchronization(coronalFusionViewport, coronalPtViewport)

  renderingEngine.render()
}

function initCameraSynchronization(sViewport, tViewport) {
  // Initialise the sync as they viewports will have
  // Different inital zoom levels for viewports of different sizes.

  const camera = sViewport.getCamera()

  tViewport.setCamera(camera)
}

export default { setLayout, setVolumes }
