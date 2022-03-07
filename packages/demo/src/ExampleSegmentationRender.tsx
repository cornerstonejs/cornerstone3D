import React, { Component } from 'react'

import { vec3 } from 'gl-matrix'

import {
  cache,
  RenderingEngine,
  createAndCacheVolume,
  createAndCacheDerivedVolume,
  init as cs3dInit,
  eventTarget,
} from '@precisionmetrics/cornerstone-render'
import {
  // Segmentation
  synchronizers,
  ToolBindings,
  ToolModes,
  CornerstoneTools3DEvents,
  toolDataSelection,
  Utilities as csToolsUtils,
  // segs
  SegmentationModule,
  SegmentationState,
  SegmentationRepresentations,
  addSegmentationsForToolGroup,
  removeSegmentationsForToolGroup,
} from '@precisionmetrics/cornerstone-tools'
import * as csTools3d from '@precisionmetrics/cornerstone-tools'

import getImageIds from './helpers/getImageIds'
import ViewportGrid from './components/ViewportGrid'
import { initToolGroups, addToolsToToolGroups } from './initToolGroups'
import './ExampleVTKMPR.css'
import {
  renderingEngineUID,
  ptVolumeUID,
  ctVolumeUID,
  colormaps,
  ANNOTATION_TOOLS,
  SEGMENTATION_TOOLS,
  VIEWPORT_IDS,
} from './constants'
import LAYOUTS, { ptCtFusion } from './layouts'
import config from './config/default'

import sortImageIdsByIPP from './helpers/sortImageIdsByIPP'
import limitImageIds from './helpers/limitImageIds'

const VOLUME = 'volume'

let ctSceneToolGroup,
  ptSceneToolGroup,
  fusionSceneToolGroup,
  ptMipSceneToolGroup,
  ctVRSceneToolGroup,
  ctObliqueToolGroup,
  ptTypesSceneToolGroup,
  ptCtLayoutTools,
  ctAxialSagittalSegmentationToolGroup,
  ptCoronalSegmentationToolGroup,
  axialPTCTSegmentationToolGroup

const { createCameraPositionSynchronizer, createVOISynchronizer } =
  synchronizers

const toolsToUse = [
  'WindowLevel',
  'Pan',
  'Zoom',
  ...ANNOTATION_TOOLS,
  ...SEGMENTATION_TOOLS,
]
const labelmap1UID = 'boneAndSoftTissue'
const labelmap2UID = 'fatTissue'
const RECTANGLE_ROI_THRESHOLD = 'RectangleRoiThreshold'
const RECTANGLE_ROI_THRESHOLD_MANUAL = 'RectangleRoiStartEndThreshold'

class SegmentationExample extends Component {
  _elementNodes = null
  _viewportGridRef = null
  _offScreenRef = null
  ctVolumeImageIds = null
  petVolumeImageIds = null
  ptThresholdSync = null
  axialSync = null
  sagittalSync = null
  coronalSync = null
  ctWLSync = null
  renderingEngine = null
  viewportGridResizeObserver = null
  ctVolumeUID = null
  ptVolumeUID = null

  state = {
    progressText: 'fetching metadata...',
    metadataLoaded: false,
    petColorMapIndex: 0,
    layoutIndex: 0,
    destroyed: false,
    // segmentation state
    renderOutlineGlobal: true,
    renderOutlineToolGroup: true,
    renderInactiveSegmentationsGlobal: true,
    renderInactiveSegmentationsToolGroup: true,
    //
    viewportGrid: {
      numCols: 4,
      numRows: 3,
      viewports: [
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {
          cellStyle: {
            gridRow: '1 / span 3',
            gridColumn: '4',
          },
        },
      ],
    },
    ptCtLeftClickTool: 'WindowLevel',
    ctWindowLevelDisplay: { ww: 0, wc: 0 },
    ptThresholdDisplay: 5,
    // Segmentation
    segmentationStatus: '',
    segmentationToolActive: false,
    selectedsegmentationUID: '',
    availableSegmentations: [],
    fillAlphaGlobal: 0.9,
    fillAlphaToolGroup: 0.9,
    fillAlphaInactiveGlobal: 0.8,
    fillAlphaInactiveToolGroup: 0.8,
    segmentLocked: false,
    thresholdMin: 0,
    thresholdMax: 100,
    numSlicesForThreshold: 1,
    chosenToolStrategy: '',
    // toolGroup
    toolGroups: {},
    selectedToolGroupName: '',
    selectedToolGroupSegmentationDataUIDs: [],
    // all segmentations
    allSegmentationUIDs: [],
    selectedSegmentationUIDFromAll: '',
    tmtv: null,
  }

  constructor(props) {
    super(props)

    csTools3d.init()
    this._offScreenRef = React.createRef()

    ptCtLayoutTools = ['Levels'].concat(toolsToUse)

    this._elementNodes = new Map()
    this._viewportGridRef = React.createRef()
    const { limitFrames } = config

    const callback = (imageIds) => {
      if (limitFrames !== undefined && typeof limitFrames === 'number') {
        const NewImageIds = sortImageIdsByIPP(imageIds)
        return limitImageIds(NewImageIds, limitFrames)
      }
      return imageIds
    }

    this.petVolumeImageIds = getImageIds('pt1', VOLUME, callback)
    this.ctVolumeImageIds = getImageIds('ct1', VOLUME, callback)

    Promise.all([this.petVolumeImageIds, this.ctVolumeImageIds]).then(() =>
      this.setState({ progressText: 'Loading data...' })
    )

    this.viewportGridResizeObserver = new ResizeObserver((entries) => {
      // ThrottleFn? May not be needed. This is lightning fast.
      // Set in mount
      if (this.renderingEngine) {
        this.renderingEngine.resize()
        this.renderingEngine.render()
      }
    })
  }

  /**
   * LIFECYCLE
   */
  async componentDidMount() {
    await cs3dInit()
    this.axialSync = createCameraPositionSynchronizer('axialSync')
    this.sagittalSync = createCameraPositionSynchronizer('sagittalSync')
    this.coronalSync = createCameraPositionSynchronizer('coronalSync')
    this.ctWLSync = createVOISynchronizer('ctWLSync')
    this.ptThresholdSync = createVOISynchronizer('ptThresholdSync')
    ;({
      ctSceneToolGroup,
      ptSceneToolGroup,
      fusionSceneToolGroup,
      ptMipSceneToolGroup,
    } = initToolGroups())

    this.ctVolumeUID = ctVolumeUID
    this.ptVolumeUID = ptVolumeUID

    const renderingEngine = new RenderingEngine(renderingEngineUID)

    this.renderingEngine = renderingEngine

    window.renderingEngine = renderingEngine

    ptCtFusion.setLayout(
      renderingEngine,
      this._elementNodes,
      {
        ctSceneToolGroup,
        ptSceneToolGroup,
        fusionSceneToolGroup,
        ptMipSceneToolGroup,
      },
      {
        axialSynchronizers: [],
        sagittalSynchronizers: [],
        coronalSynchronizers: [],
        ptThresholdSynchronizer: this.ptThresholdSync,
        ctWLSynchronizer: this.ctWLSync,
      }
    )

    addToolsToToolGroups({
      ctSceneToolGroup,
      ptSceneToolGroup,
      fusionSceneToolGroup,
      ptMipSceneToolGroup,
    })

    // Create volumes
    const ptImageIds = await this.petVolumeImageIds
    const ctVolumeImageIds = await this.ctVolumeImageIds

    // This only creates the volumes, it does not actually load all
    // of the pixel data (yet)
    const ptVolume = await createAndCacheVolume(ptVolumeUID, {
      imageIds: ptImageIds,
    })
    const ctVolume = await createAndCacheVolume(ctVolumeUID, {
      imageIds: ctVolumeImageIds,
    })

    // Initialize all CT values to -1024 so we don't get a grey box?
    const { scalarData } = ctVolume
    const ctLength = scalarData.length

    for (let i = 0; i < ctLength; i++) {
      scalarData[i] = -1024
    }

    const onLoadCT = (evt) => {
      if (evt.framesProcessed === evt.numFrames) {
        this.setState({ progressText: 'Loaded.' })
      }
    }

    ptVolume.load()
    ctVolume.load(onLoadCT)

    ptCtFusion.setVolumes(
      renderingEngine,
      ctVolumeUID,
      ptVolumeUID,
      colormaps[this.state.petColorMapIndex]
    )

    // Set initial CT levels in UI
    const { windowWidth, windowCenter } = ctVolume.metadata.voiLut[0]

    this.setState({
      metadataLoaded: true,
      ctWindowLevelDisplay: { ww: windowWidth, wc: windowCenter },
      toolGroups: {
        ctSceneToolGroup,
        ptSceneToolGroup,
      },
      selectedToolGroupName: 'ctSceneToolGroup',
    })

    // This will initialize volumes in GPU memory
    renderingEngine.render()
    // Start listening for resiz
    this.viewportGridResizeObserver.observe(this._viewportGridRef.current)
  }

  componentDidUpdate(prevProps, prevState) {
    const { layoutIndex } = this.state
    this._removeEventListeners()
    this._addEventListeners()
  }

  _removeEventListeners() {
    eventTarget.removeEventListener(
      CornerstoneTools3DEvents.SEGMENTATION_STATE_MODIFIED,
      this.onSegmentationStateModified
    )

    eventTarget.removeEventListener(
      CornerstoneTools3DEvents.SEGMENTATION_GLOBAL_STATE_MODIFIED,
      this.onGlobalSegmentationStateUpdated
    )

    eventTarget.removeEventListener(
      CornerstoneTools3DEvents.SEGMENTATION_REMOVED,
      this.onSegmentationRemoved
    )
  }

  _addEventListeners() {
    eventTarget.addEventListener(
      CornerstoneTools3DEvents.SEGMENTATION_STATE_MODIFIED,
      this.onSegmentationStateModified
    )

    eventTarget.addEventListener(
      CornerstoneTools3DEvents.SEGMENTATION_GLOBAL_STATE_MODIFIED,
      this.onGlobalSegmentationStateUpdated
    )

    eventTarget.addEventListener(
      CornerstoneTools3DEvents.SEGMENTATION_REMOVED,
      this.onSegmentationRemoved
    )
  }

  componentWillUnmount() {
    // Stop listening for resize
    if (this.viewportGridResizeObserver) {
      this.viewportGridResizeObserver.disconnect()
    }

    cache.purgeCache()
    csTools3d.destroy()
    this.renderingEngine.destroy()
  }

  onGlobalSegmentationStateUpdated = (evt) => {
    const { segmentationUIDs } = evt.detail
    const allSegmentationUIDs =
      SegmentationState.getGlobalSegmentationState().map(
        ({ volumeUID }) => volumeUID
      )

    let newSelectedSegmentationUID = this.state.selectedSegmentationUIDFromAll
    if (newSelectedSegmentationUID === '') {
      newSelectedSegmentationUID = allSegmentationUIDs[0]
    }

    this.setState({
      allSegmentationUIDs: allSegmentationUIDs,
      selectedSegmentationUIDFromAll: newSelectedSegmentationUID,
    })
  }

  onSegmentationStateModified = (evt) => {
    const { toolGroupUID } = evt.detail

    if (toolGroupUID !== this.state.selectedToolGroupName) {
      return
    }

    const activeSegmentationInfo =
      SegmentationModule.activeSegmentationController.getActiveSegmentationInfo(
        toolGroupUID
      )

    let selectedsegmentationUID, segmentLocked, activeSegmentIndex

    if (activeSegmentationInfo) {
      activeSegmentIndex = activeSegmentationInfo.activeSegmentIndex
      selectedsegmentationUID = activeSegmentationInfo.segmentationDataUID

      segmentLocked =
        SegmentationModule.lockedSegmentController.getSegmentIndexLockedStatusForSegmentation(
          activeSegmentationInfo.volumeUID,
          activeSegmentIndex
        )
    }

    const toolGroupSegmentations =
      SegmentationState.getSegmentationState(toolGroupUID)

    let segmentationDataUIDs

    if (toolGroupSegmentations) {
      segmentationDataUIDs = toolGroupSegmentations.map(
        (segData) => segData.segmentationDataUID
      )
    }

    this.setState({
      selectedToolGroupSegmentationDataUIDs: segmentationDataUIDs,
      selectedsegmentationUID: selectedsegmentationUID,
      selectedViewportActiveSegmentIndex: activeSegmentIndex ?? 1,
      segmentLocked: segmentLocked ?? false,
    })
  }

  onSegmentationRemoved = (evt) => {
    const { element } = evt.detail

    const segmentationUIDs =
      SegmentationModule.getsegmentationUIDsForElement(element)
    const activesegmentationUID =
      SegmentationModule.activeSegmentationController.getActivesegmentationUID(
        element
      )
    this.setState({
      availableSegmentations: segmentationUIDs,
      selectedsegmentationUID: activesegmentationUID,
    })
  }

  createNewLabelmapForScissors = async () => {
    const toolGroup = this.state.toolGroups[this.state.selectedToolGroupName]

    const { viewportsInfo } = toolGroup
    const { viewportUID, renderingEngineUID } = viewportsInfo[0]
    const viewport = this.renderingEngine.getViewport(viewportUID)

    SegmentationModule.createNewSegmentationForViewport(viewport).then(
      (segmentationUID) => {
        addSegmentationsForToolGroup(this.state.selectedToolGroupName, [
          {
            volumeUID: segmentationUID,
            // default representation which is labelmap
          },
        ])
      }
    )
  }

  setToolMode = (toolMode) => {
    const toolName = this.state.ptCtLeftClickTool

    const toolGroups = this.state.toolGroups

    if (SEGMENTATION_TOOLS.includes(toolName)) {
      this.setState({ segmentationToolActive: true })
    }
    const toolGroup = toolGroups[this.state.selectedToolGroupName]
    if (toolMode === ToolModes.Active) {
      const activeTool = toolGroup.getActivePrimaryButtonTools()
      if (activeTool) {
        toolGroup.setToolPassive(activeTool)
      }

      toolGroup.setToolActive(toolName, {
        bindings: [{ mouseButton: ToolBindings.Mouse.Primary }],
      })
    } else if (toolMode === ToolModes.Passive) {
      toolGroup.setToolPassive(toolName)
    } else if (toolMode === ToolModes.Enabled) {
      toolGroup.setToolEnabled(toolName)
    } else if (toolMode === ToolModes.Disabled) {
      toolGroup.setToolDisabled(toolName)
    }
  }

  fillBlobForThreshold = (
    imageData,
    backgroundImageData,
    segments = ['bone', 'softTissue', 'fatTissue']
  ) => {
    const dims = imageData.getDimensions()
    const values = imageData.getPointData().getScalars().getData()

    const backgroundValues = backgroundImageData
      .getPointData()
      .getScalars()
      .getData()
    const size = dims[0] * dims[1] * dims[2]

    // Bone
    const boneThreshold = [226, 3071]
    const softTissueThreshold = [-700, 255]
    const fatTissueThreshold = [-205, -51]

    for (let i = 0; i < size; i++) {
      if (
        segments.includes('bone') &&
        backgroundValues[i] >= boneThreshold[0] &&
        backgroundValues[i] < boneThreshold[1]
      ) {
        values[i] = 1
      }

      if (
        segments.includes('softTissue') &&
        backgroundValues[i] >= softTissueThreshold[0] &&
        backgroundValues[i] < softTissueThreshold[1]
      ) {
        values[i] = 2
      }

      if (
        segments.includes('fatTissue') &&
        backgroundValues[i] >= fatTissueThreshold[0] &&
        backgroundValues[i] < fatTissueThreshold[1]
      ) {
        values[i] = 3
      }
      //  values[i] = 1
    }

    imageData.getPointData().getScalars().setData(values)
  }

  preLoadSegmentations = async () => {
    this.setState({ segmentationStatus: '(Calculating...)' })

    // Use ct as background for segmentation threshold
    const ctViewport = this.renderingEngine.getViewport('ctAxial')
    const { imageData: backgroundImageData } = ctViewport.getImageData()

    await createAndCacheDerivedVolume(ctVolumeUID, { uid: labelmap1UID })
    await createAndCacheDerivedVolume(ctVolumeUID, { uid: labelmap2UID })

    const boneSoftVolume = cache.getVolume(labelmap1UID)
    const fatVolume = cache.getVolume(labelmap2UID)

    // Bone & soft tissue labelmap
    this.fillBlobForThreshold(boneSoftVolume.imageData, backgroundImageData, [
      'bone',
      'softTissue',
    ])

    // fat tissue labelmap
    this.fillBlobForThreshold(fatVolume.imageData, backgroundImageData, [
      'fatTissue',
    ])

    this.setState({ segmentationStatus: 'done' })
  }

  loadSegmentation = async (segmentationUID, initialConfig) => {
    const toolGroupUID = this.state.selectedToolGroupName

    if (!initialConfig) {
      await addSegmentationsForToolGroup(toolGroupUID, [
        {
          volumeUID: segmentationUID,
          active: true,
          representation: {
            type: SegmentationRepresentations.Labelmap,
          },
        },
      ])
    } else {
      await addSegmentationsForToolGroup(
        toolGroupUID,
        [
          {
            volumeUID: segmentationUID,
            active: true,
            representation: {
              type: SegmentationRepresentations.Labelmap,
            },
          },
        ],
        {
          representations: {
            [SegmentationRepresentations.Labelmap]: {
              renderOutline: false,
            },
          },
        }
      )
    }

    this.setState({
      segmentationToolActive: true,
    })
  }

  toggleLockedSegmentIndex = (evt) => {
    const checked = evt.target.checked

    const activesegmentationInfo =
      SegmentationModule.activeSegmentationController.getActiveSegmentationInfo(
        this.state.selectedToolGroupName
      )

    const { volumeUID, activeSegmentIndex } = activesegmentationInfo

    const activeSegmentLockedStatus =
      SegmentationModule.lockedSegmentController.getSegmentIndexLockedStatusForSegmentation(
        volumeUID,
        activeSegmentIndex
      )

    SegmentationModule.lockedSegmentController.setSegmentIndexLockedStatusForSegmentation(
      volumeUID,
      activeSegmentIndex,
      !activeSegmentLockedStatus
    )

    this.setState({ segmentLocked: !activeSegmentLockedStatus })
  }

  changeActiveSegmentIndex = (direction) => {
    const toolGroupUID = this.state.selectedToolGroupName
    const activeSegmentationInfo =
      SegmentationModule.activeSegmentationController.getActiveSegmentationInfo(
        toolGroupUID
      )

    const { activeSegmentIndex } = activeSegmentationInfo
    let newIndex = activeSegmentIndex + direction

    if (newIndex < 0) {
      newIndex = 0
    }

    SegmentationModule.segmentIndexController.setActiveSegmentIndex(
      toolGroupUID,
      newIndex
    )

    const segmentIsLocked =
      SegmentationModule.lockedSegmentController.getSegmentIndexLockedStatus(
        toolGroupUID,
        newIndex
      )

    this.setState({
      selectedViewportActiveSegmentIndex: newIndex,
      segmentLocked: segmentIsLocked,
    })
  }

  calculateTMTV = () => {
    const viewportUID = this.state.selectedToolGroupName
    const { element } = this.renderingEngine.getViewport(viewportUID)
    const segmentationUIDs =
      SegmentationModule.getsegmentationUIDsForElement(element)

    const labelmaps = segmentationUIDs.map((uid) => cache.getVolume(uid))
    const segmentationIndex = 1
    const tmtv = csToolsUtils.segmentation.calculateTMTV(
      labelmaps,
      segmentationIndex
    )
    this.setState((prevState) => ({
      ...prevState,
      tmtv,
    }))
  }

  calculateSuvPeak = () => {
    const viewportUID = this.state.selectedToolGroupName
    const viewport = this.renderingEngine.getViewport(viewportUID)

    const { uid } = viewport.getDefaultActor()
    const referenceVolume = cache.getVolume(uid)

    const segmentationUIDs = SegmentationModule.getsegmentationUIDsForElement(
      viewport.element
    )

    const labelmaps = segmentationUIDs.map((uid) => cache.getVolume(uid))
    const segmentationIndex = 1
    const suvPeak = csToolsUtils.segmentation.calculateSuvPeak(
      viewport,
      labelmaps[0],
      referenceVolume
    )
    console.debug('suvPeak', suvPeak)
  }

  setEndSlice = () => {
    if (this.state.ptCtLeftClickTool !== RECTANGLE_ROI_THRESHOLD_MANUAL) {
      throw new Error('cannot apply start slice')
    }

    let toolData = toolDataSelection.getSelectedToolDataByToolName(
      this.state.ptCtLeftClickTool
    )

    if (!toolData) {
      throw new Error('No annotation selected ')
    }

    toolData = toolData[0]

    const {
      metadata: {
        enabledElement: { viewport },
      },
    } = toolData // assuming they are all overlayed on the same toolGroup

    const volumeActorInfo = viewport.getDefaultActor()

    // Todo: this only works for volumeViewport
    const { uid } = volumeActorInfo

    const segmentationData = SegmentatoinState.getSegmentationDataByUID(
      this.state.selectedToolGroupName,
      this.state.selectedsegmentationUID
    )
    const globalState = SegmentationState.getGlobalSegmentationDataByUID(
      segmentationData.volumeUID
    )

    if (!globalState) {
      throw new Error('No Segmentation Found')
    }

    // get the current slice Index
    const sliceIndex = viewport.getCurrentImageIdIndex()
    toolData.data.endSlice = sliceIndex
    toolData.data.invalidated = true // IMPORTANT: invalidate the toolData for the cached stat to get updated

    viewport.render()
  }

  setStartSlice = () => {
    if (this.state.ptCtLeftClickTool !== RECTANGLE_ROI_THRESHOLD_MANUAL) {
      throw new Error('cannot apply start slice')
    }

    let toolData = toolDataSelection.getSelectedToolDataByToolName(
      this.state.ptCtLeftClickTool
    )

    if (!toolData) {
      throw new Error('No annotation selected ')
    }

    toolData = toolData[0]

    const {
      metadata: {
        enabledElement: { viewport },
      },
    } = toolData // assuming they are all overlayed on the same toolGroup

    const { focalPoint, viewPlaneNormal } = viewport.getCamera()

    const selectedToolDataList =
      toolDataSelection.getSelectedToolDataByToolName(
        this.state.ptCtLeftClickTool
      )

    const { handles } = toolData.data
    const { points } = handles

    // get the current slice Index
    const sliceIndex = viewport.getCurrentImageIdIndex()
    toolData.data.startSlice = sliceIndex

    // distance between camera focal point and each point on the rectangle
    const newPoints = points.map((point) => {
      const distance = vec3.create()
      vec3.subtract(distance, focalPoint, point)
      // distance in the direction of the viewPlaneNormal
      const distanceInViewPlane = vec3.dot(distance, viewPlaneNormal)
      // new point is current point minus distanceInViewPlane
      const newPoint = vec3.create()
      vec3.scaleAndAdd(newPoint, point, viewPlaneNormal, distanceInViewPlane)

      return newPoint
      //
    })

    handles.points = newPoints
    toolData.data.invalidated = true // IMPORTANT: invalidate the toolData for the cached stat to get updated
    viewport.render()
  }

  executeThresholding = (mode) => {
    let toolData = toolDataSelection.getSelectedToolDataByToolName(
      this.state.ptCtLeftClickTool
    )

    if (!toolData) {
      throw new Error('No annotation selected ')
    }

    toolData = toolData[0]

    const {
      metadata: {
        enabledElement: { viewport },
      },
    } = toolData // assuming they are all overlayed on the same toolGroup

    const volumeActorInfo = viewport.getDefaultActor()

    // Todo: this only works for volumeViewport
    const { uid } = volumeActorInfo
    const referenceVolume = cache.getVolume(uid)

    const segmentationData = SegmentatoinState.getSegmentationDataByUID(
      this.state.selectedToolGroupName,
      this.state.selectedsegmentationUID
    )

    const numSlices = this.state.numSlicesForThreshold
    const selectedToolDataList =
      toolDataSelection.getSelectedToolDataByToolName(
        this.state.ptCtLeftClickTool
      )

    if (mode === 'max') {
      csToolsUtils.segmentation.thresholdVolumeByRoiStats(
        this.state.selectedToolGroupName,
        selectedToolDataList,
        [referenceVolume],
        segmentationData,
        {
          statistic: 'max',
          weight: 0.41,
          numSlicesToProject: numSlices,
          overwrite: false,
        }
      )

      return
    }

    csToolsUtils.segmentation.thresholdVolumeByRange(
      this.state.selectedToolGroupName,
      selectedToolDataList,
      [referenceVolume],
      segmentationData,
      {
        lowerThreshold: Number(this.state.thresholdMin),
        higherThreshold: Number(this.state.thresholdMax),
        numSlicesToProject: numSlices,
        overwrite: false,
      }
    )
  }

  showOffScreenCanvas = () => {
    // remove all children
    this._offScreenRef.current.innerHTML = ''
    const uri = this.renderingEngine._debugRender()
    const image = document.createElement('img')
    image.src = uri
    image.setAttribute('width', '100%')

    this._offScreenRef.current.appendChild(image)
  }

  hidOffScreenCanvas = () => {
    // remove all children
    this._offScreenRef.current.innerHTML = ''
  }

  getThresholdUID = () => {
    return (
      <>
        {this.getScissorsUI()}

        {this.state.ptCtLeftClickTool === RECTANGLE_ROI_THRESHOLD ? (
          <>
            <label htmlFor="numSlices" style={{ marginLeft: '5px' }}>
              Number of Slices (+/-)
            </label>
            <input
              type="number"
              style={{ marginLeft: '5px' }}
              name="numSlices"
              value={this.state.numSlicesForThreshold}
              onChange={(evt) => {
                this.setState({
                  numSlicesForThreshold: Number(evt.target.value),
                })
              }}
            />
          </>
        ) : (
          <>
            <button onClick={() => this.setStartSlice()}>
              Set Start Slice
            </button>
            <button onClick={() => this.setEndSlice()}>Set End Slice</button>
          </>
        )}
        <label htmlFor="thresholdMin" style={{ marginLeft: '5px' }}>
          Min value
        </label>
        <input
          type="number"
          style={{ marginLeft: '5px' }}
          name="thresholdMin"
          value={this.state.thresholdMin}
          onChange={(evt) => {
            this.setState({ thresholdMin: evt.target.value })
          }}
        />
        <label htmlFor="thresholdMax" style={{ marginLeft: '5px' }}>
          Max value
        </label>
        <input
          type="number"
          style={{ marginLeft: '5px' }}
          name="thresholdMax"
          value={this.state.thresholdMax}
          onChange={(evt) => {
            this.setState({ thresholdMax: evt.target.value })
          }}
        />
        <button
          style={{ marginLeft: '5px' }}
          onClick={() => this.executeThresholding('')}
        >
          Execute Range Thresholding on Selected Annotation
        </button>
        <button
          style={{ marginLeft: '5px' }}
          onClick={() => this.executeThresholding('max')}
        >
          Execute Max Thresholding on Selected Annotation
        </button>
        <button
          style={{ marginLeft: '5px' }}
          onClick={() => this.calculateTMTV()}
        >
          Calculate TMTV
        </button>
        <button
          style={{ marginLeft: '5px' }}
          onClick={() => this.calculateSuvPeak()}
        >
          Calculate SUV Peak
        </button>
        {this.state.tmtv !== null && (
          <span>{`    TMTV: ${this.state.tmtv.toFixed(2)} ml`}</span>
        )}
      </>
    )
  }

  getScissorsUI = () => {
    return (
      <>
        <button
          onClick={() => this.createNewLabelmapForScissors()}
          className="btn btn-primary"
          style={{ margin: '2px 4px' }}
        >
          Create New Segmentation
        </button>
      </>
    )
  }

  deleteSegmentation = () => {
    const segmentationDataUID = this.state.selectedsegmentationUID
    removeSegmentationsForToolGroup(this.state.selectedToolGroupName, [
      segmentationDataUID,
    ])
  }

  toggleSegmentationVisibility = (segmentDataUID) => {
    const visibilityStatus =
      SegmentationModule.segmentationVisibilityController.getSegmentationVisibility(
        this.state.selectedToolGroupName,
        segmentDataUID
      )

    SegmentationModule.segmentationVisibilityController.setSegmentationVisibility(
      this.state.selectedToolGroupName,
      segmentDataUID,
      !visibilityStatus
    )
  }

  hideAllSegmentations = () => {
    this.state.toolGroups[this.state.selectedToolGroupName].setToolDisabled(
      'SegmentationDisplay'
    )
  }

  showAllSegmentations = () => {
    this.state.toolGroups[this.state.selectedToolGroupName].setToolEnabled(
      'SegmentationDisplay'
    )
  }

  getToolStrategyUI = () => {
    const toolGroup = this.state.toolGroups[this.state.selectedToolGroupName]
    if (!toolGroup) {
      return null
    }
    const toolInstance = toolGroup.getToolInstance(this.state.ptCtLeftClickTool)

    if (!toolInstance) {
      return
    }

    const strategies = Object.keys(toolInstance.configuration.strategies)
    return (
      <>
        {strategies.map((strategyName) => (
          <option key={strategyName} value={strategyName}>
            {strategyName}
          </option>
        ))}
      </>
    )
  }

  getSetToolModes = () => {
    return (
      <>
        <span>Set this tool </span>
        <select
          value={this.state.ptCtLeftClickTool}
          onChange={(evt) => {
            const toolName = evt.target.value
            if (SEGMENTATION_TOOLS.includes(toolName)) {
              this.setState({ segmentationToolActive: true })
            }
            this.setState({ ptCtLeftClickTool: toolName })
          }}
        >
          {toolsToUse.map((toolName) => (
            <option key={toolName} value={toolName}>
              {toolName}
            </option>
          ))}
        </select>
        <span> Strategies </span>
        <select
          value={this.state.chosenToolStrategy}
          style={{ minWidth: '50px', margin: '0px 4px' }}
          onChange={(evt) => {
            const activeStrategy = evt.target.value
            const toolGroup =
              this.state.toolGroups[this.state.selectedToolGroupName]

            toolGroup
              .getToolInstance(this.state.ptCtLeftClickTool)
              .setActiveStrategy(activeStrategy)

            toolGroup.resetViewportsCursor(
              { name: this.state.ptCtLeftClickTool },
              activeStrategy
            )
            this.setState({ chosenToolStrategy: activeStrategy })
          }}
        >
          {this.state.toolGroups && this.getToolStrategyUI()}
        </select>
        <span style={{ marginLeft: '4px' }}>for this toolGroup </span>
        <select
          value={this.state.selectedToolGroupName}
          onChange={(evt) => {
            const toolGroupName = evt.target.value
            const toolGroupSegmentations =
              SegmentationState.getSegmentationState(toolGroupName)

            const activeSegmentationData =
              SegmentationModule.activeSegmentationController.getActiveSegmentationInfo(
                toolGroupName
              )

            const toolGroupSegmentationConfig =
              SegmentationModule.segmentationConfigController.getSegmentationConfig(
                toolGroupName
              )

            this.setState({
              selectedToolGroupName: toolGroupName,
              selectedToolGroupSegmentationDataUIDs: toolGroupSegmentations.map(
                (segData) => segData.segmentationDataUID
              ),
              selectedsegmentationUID:
                activeSegmentationData?.segmentationDataUID,
              renderOutlineToolGroup:
                toolGroupSegmentationConfig?.renderOutline || true,
              renderInactiveSegmentationsToolGroup:
                toolGroupSegmentationConfig?.renderInactiveSegmentations ||
                true,
              fillAlphaToolGroup: toolGroupSegmentationConfig?.fillAlpha || 0.9,
              fillAlphaInactiveToolGroup:
                toolGroupSegmentationConfig?.fillAlphaInactive || true,
            })
          }}
        >
          {Object.keys(this.state.toolGroups).map((toolGroupName) => (
            <option key={toolGroupName} value={toolGroupName}>
              {toolGroupName}
            </option>
          ))}
        </select>
        <button
          style={{ marginLeft: '4px' }}
          onClick={() => this.setToolMode(ToolModes.Active)}
        >
          Active
        </button>
        <button
          style={{ marginLeft: '4px' }}
          onClick={() => this.setToolMode(ToolModes.Passive)}
        >
          Passive
        </button>
        <button
          style={{ marginLeft: '4px' }}
          onClick={() => this.setToolMode(ToolModes.Enabled)}
        >
          Enabled
        </button>
        <button
          style={{ marginLeft: '4px' }}
          onClick={() => this.setToolMode(ToolModes.Disabled)}
        >
          Disabled
        </button>
      </>
    )
  }

  render() {
    return (
      <div style={{ paddingBottom: '55px' }}>
        <div className="row">
          <div className="col-xs-12" style={{ margin: '8px 0' }}>
            <h2>Segmentation Example ({this.state.progressText})</h2>
            <h4>
              For Segmentation tools, you need to click on "Create New
              Segmentation" button (when the options appear)
            </h4>
            {!window.crossOriginIsolated ? (
              <h1 style={{ color: 'red' }}>
                This Demo requires SharedArrayBuffer but your browser does not
                support it
              </h1>
            ) : null}
          </div>
        </div>

        <div>{this.getSetToolModes()}</div>
        {this.state.segmentationToolActive && (
          <div style={{ marginTop: '15px' }}>
            {this.state.ptCtLeftClickTool.includes('RectangleRoi')
              ? this.getThresholdUID()
              : this.getScissorsUI()}
            <span> All global segmentations </span>
            <select
              value={this.state.selectedSegmentationUIDFromAll}
              style={{ minWidth: '50px', margin: '0px 8px' }}
              onChange={(evt) => {
                this.setState({
                  selectedSegmentationUIDFromAll: evt.target.value,
                })
              }}
              size={3}
            >
              {this.state.allSegmentationUIDs.map((segmentationUID) => (
                <option key={`${segmentationUID}-all`} value={segmentationUID}>
                  {segmentationUID}
                </option>
              ))}
            </select>
            <button
              onClick={async () => {
                const toolGroupUID = this.state.selectedToolGroupName
                addSegmentationsForToolGroup(toolGroupUID, [
                  {
                    volumeUID: this.state.selectedSegmentationUIDFromAll,
                    // no representation -> labelmap
                  },
                ]).then(() => {
                  const { volumeUID, activeSegmentIndex } =
                    SegmentationModule.activeSegmentationController.getActiveSegmentationInfo(
                      toolGroupUID
                    )

                  const activeSegmentIndexLocked =
                    SegmentationModule.lockedSegmentController.getSegmentIndexLockedStatusForSegmentation(
                      volumeUID,
                      activeSegmentIndex
                    )

                  this.setState({
                    selectedViewportActiveSegmentIndex: activeSegmentIndex,
                    segmentLocked: activeSegmentIndexLocked,
                  })
                })
              }}
              className="btn btn-primary"
              style={{ margin: '2px 4px' }}
            >
              Add Segmentation to selected toolGroup
            </button>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                marginTop: '5px',
              }}
            >
              <span>
                {' '}
                ToolGroup Segmentations (selected is active Segmentation){' '}
              </span>
              <select
                value={this.state.selectedsegmentationUID}
                style={{ minWidth: '150px', margin: '0px 8px' }}
                onChange={(evt) => {
                  const selectedsegmentationUID = evt.target.value

                  SegmentationModule.activeSegmentationController.setActiveSegmentation(
                    this.state.selectedToolGroupName,
                    selectedsegmentationUID
                  )

                  this.setState({
                    selectedsegmentationUID,
                  })
                }}
                size={3}
              >
                {this.state.selectedToolGroupSegmentationDataUIDs.map(
                  (segmentationUID) => (
                    <option
                      key={`${segmentationUID}-viewport`}
                      value={segmentationUID}
                    >
                      {segmentationUID}
                    </option>
                  )
                )}
              </select>
              <button
                onClick={() => this.deleteSegmentation()}
                className="btn btn-primary"
                style={{ margin: '2px 4px' }}
              >
                Delete From ToolGroup
              </button>

              <button
                onClick={() => this.changeActiveSegmentIndex(-1)}
                className="btn btn-primary"
                style={{ margin: '2px 4px' }}
              >
                Previous Segment
              </button>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                {`Active Segment Index ${this.state.selectedViewportActiveSegmentIndex}`}
                <div>
                  <input
                    type="checkbox"
                    style={{ marginLeft: '0px' }}
                    name="lockToggle"
                    checked={this.state.segmentLocked}
                    onChange={(evt) => this.toggleLockedSegmentIndex(evt)}
                  />
                  <label htmlFor="lockToggle" style={{ marginLeft: '5px' }}>
                    Locked?
                  </label>
                </div>
              </span>
              <button
                onClick={() => this.changeActiveSegmentIndex(1)}
                className="btn btn-primary"
                style={{ margin: '2px 4px' }}
              >
                Next Segment
              </button>
            </div>
          </div>
        )}

        <div>
          <h5>Use Synthetic Segmentation</h5>
          <div>
            <button
              onClick={() => {
                this.setState(
                  { segmentationStatus: 'Calculating...' },
                  this.preLoadSegmentations
                )
              }}
              disabled={this.state.progressText !== 'Loaded.'}
              className="btn btn-primary"
              style={{ margin: '2px 4px' }}
            >
              1) Pre-compute bone & softTissue and fatTissue labelmaps
            </button>
            <span>{this.state.segmentationStatus}</span>
            {this.state.segmentationStatus !== 'done' ? null : (
              <>
                <button
                  onClick={() => this.loadSegmentation(labelmap1UID)}
                  className="btn btn-secondary"
                  style={{ margin: '2px 4px' }}
                >
                  2.a) Load Bone & Soft Tissue Labelmap
                </button>
                <button
                  onClick={() => this.loadSegmentation(labelmap2UID)}
                  className="btn btn-secondary"
                  style={{ margin: '2px 4px' }}
                >
                  2.b) Load Fat Tissue Labelmap
                </button>
                <button
                  onClick={() => this.loadSegmentation(labelmap2UID, true)}
                  className="btn btn-secondary"
                  style={{ margin: '2px 4px' }}
                >
                  2.b) Load Fat Tissue Labelmap With Initial Config
                </button>
              </>
            )}
          </div>

          <div>
            <h4>ToolGroup-specific Labelmap Config</h4>
            <input
              type="checkbox"
              style={{ marginLeft: '0px' }}
              name="toggle"
              defaultChecked={this.state.renderOutlineToolGroup}
              onChange={() => {
                const renderOutline = !this.state.renderOutlineToolGroup

                this.setState({
                  renderOutlineToolGroup: renderOutline,
                })
              }}
            />
            <label htmlFor="toggle" style={{ marginLeft: '5px' }}>
              Render Outline
            </label>
            <input
              type="checkbox"
              style={{ marginLeft: '10px' }}
              name="toggle"
              defaultChecked={this.state.renderInactiveSegmentationsToolGroup}
              onChange={() => {
                const renderInactiveSegmentations =
                  !this.state.renderInactiveSegmentationsToolGroup

                this.setState({
                  renderInactiveSegmentationsToolGroup:
                    renderInactiveSegmentations,
                })
              }}
            />
            <label htmlFor="toggle" style={{ marginLeft: '5px' }}>
              Render inactive Labelmaps
            </label>
            <div style={{ display: 'flex' }}>
              <div style={{ display: 'flex' }}>
                <label htmlFor="fillAlpha">fillAlpha</label>
                <input
                  style={{ maxWidth: '60%', marginLeft: '5px' }}
                  type="range"
                  id="fillAlpha"
                  name="fillAlpha"
                  value={this.state.fillAlphaToolGroup}
                  min="0.8"
                  max="0.999"
                  step="0.001"
                  onChange={(evt) => {
                    const fillAlpha = Number(evt.target.value)
                    const representationType =
                      SegmentationRepresentations.Labelmap

                    this.setState({ fillAlphaToolGroup: fillAlpha })
                  }}
                />
              </div>
              <div style={{ display: 'flex' }}>
                <label htmlFor="fillAlphaInactive">fillAlphaInactive</label>
                <input
                  style={{ maxWidth: '60%', marginLeft: '5px' }}
                  type="range"
                  id="fillAlphaInactive"
                  name="fillAlphaInactive"
                  value={this.state.fillAlphaInactiveToolGroup}
                  min="0.8"
                  max="0.999"
                  step="0.001"
                  onChange={(evt) => {
                    const fillAlphaInactive = Number(evt.target.value)
                    this.setState({
                      fillAlphaInactiveToolGroup: fillAlphaInactive,
                    })
                  }}
                />
              </div>
              <button
                onClick={() => {
                  SegmentationModule.segmentationConfigController.setSegmentationConfig(
                    this.state.selectedToolGroupName,
                    {
                      renderInactiveSegmentations:
                        this.state.renderInactiveSegmentationsToolGroup,
                      representations: {
                        [SegmentationRepresentations.Labelmap]: {
                          renderOutline: this.state.renderOutlineToolGroup,
                          fillAlpha: this.state.fillAlphaToolGroup,
                          fillAlphaInactive:
                            this.state.fillAlphaInactiveToolGroup,
                        },
                      },
                    }
                  )
                }}
              >
                Set Representation Config
              </button>
            </div>
          </div>
          <div>
            <h4>Global Labelmap Config</h4>
            <input
              type="checkbox"
              style={{ marginLeft: '0px' }}
              name="toggle"
              defaultChecked={this.state.renderOutlineGlobal}
              onChange={() => {
                const renderOutline = !this.state.renderOutlineGlobal

                const representationType = SegmentationRepresentations.Labelmap
                SegmentationModule.segmentationConfigController.updateGlobalRepresentationConfig(
                  representationType,
                  { renderOutline }
                )

                this.setState({
                  renderOutlineGlobal: renderOutline,
                })
              }}
            />
            <label htmlFor="toggle" style={{ marginLeft: '5px' }}>
              Render Outline
            </label>
            <input
              type="checkbox"
              style={{ marginLeft: '10px' }}
              name="toggle"
              defaultChecked={this.state.renderInactiveSegmentationsGlobal}
              onChange={() => {
                const renderInactiveSegmentations =
                  !this.state.renderInactiveSegmentationsGlobal

                SegmentationModule.segmentationConfigController.updateGlobalSegmentationConfig(
                  {
                    renderInactiveSegmentations,
                  }
                )

                this.setState({
                  renderInactiveSegmentationsGlobal:
                    renderInactiveSegmentations,
                })
              }}
            />
            <label htmlFor="toggle" style={{ marginLeft: '5px' }}>
              Render inactive Labelmaps
            </label>
            <div style={{ display: 'flex' }}>
              <div style={{ display: 'flex' }}>
                <label htmlFor="fillAlpha">fillAlpha</label>
                <input
                  style={{ maxWidth: '60%', marginLeft: '5px' }}
                  type="range"
                  id="fillAlpha"
                  name="fillAlpha"
                  value={this.state.fillAlphaGlobal}
                  min="0.8"
                  max="0.999"
                  step="0.001"
                  onChange={(evt) => {
                    const fillAlpha = Number(evt.target.value)
                    const representationType =
                      SegmentationRepresentations.Labelmap

                    SegmentationModule.segmentationConfigController.updateGlobalRepresentationConfig(
                      representationType,
                      {
                        fillAlpha,
                      }
                    )
                    this.setState({ fillAlphaGlobal: fillAlpha })
                  }}
                />
              </div>
              <div style={{ display: 'flex' }}>
                <label htmlFor="fillAlphaInactive">fillAlphaInactive</label>
                <input
                  style={{ maxWidth: '60%', marginLeft: '5px' }}
                  type="range"
                  id="fillAlphaInactive"
                  name="fillAlphaInactive"
                  value={this.state.fillAlphaInactiveGlobal}
                  min="0.8"
                  max="0.999"
                  step="0.001"
                  onChange={(evt) => {
                    const fillAlphaInactive = Number(evt.target.value)
                    const representationType =
                      SegmentationRepresentations.Labelmap

                    SegmentationModule.segmentationConfigController.updateGlobalRepresentationConfig(
                      representationType,
                      {
                        fillAlphaInactive,
                      }
                    )
                    this.setState({
                      fillAlphaInactiveGlobal: fillAlphaInactive,
                    })
                  }}
                />
              </div>
            </div>
          </div>
          <div>
            <button
              onClick={() =>
                this.toggleSegmentationVisibility(
                  this.state.selectedsegmentationUID
                )
              }
              className="btn btn-secondary"
              style={{ margin: '2px 4px' }}
            >
              Toggle Hide Segmentation For ToolGroup
            </button>
            <button
              onClick={() => this.hideAllSegmentations()}
              className="btn btn-secondary"
              style={{ margin: '2px 4px' }}
            >
              Hide All Segmentations For ToolGroup
            </button>
            <button
              onClick={() => this.showAllSegmentations()}
              className="btn btn-secondary"
              style={{ margin: '2px 4px' }}
            >
              Show All Segmentations For ToolGroup
            </button>
          </div>
        </div>
        <ViewportGrid
          numCols={this.state.viewportGrid.numCols}
          numRows={this.state.viewportGrid.numRows}
          renderingEngine={this.renderingEngine}
          style={{ minHeight: '650px', marginTop: '35px' }}
          ref={this._viewportGridRef}
        >
          {this.state.viewportGrid.viewports.map((vp, i) => (
            <div
              style={{
                width: '100%',
                height: '100%',
                border: '2px solid grey',
                background: 'black',
                ...(vp.cellStyle || {}),
              }}
              ref={(c) => this._elementNodes.set(i, c)}
              onContextMenu={(e) => e.preventDefault()}
              key={i}
            />
          ))}
        </ViewportGrid>
        <div>
          <h1>OffScreen Canvas Render</h1>
          <button
            onClick={this.showOffScreenCanvas}
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            Show OffScreenCanvas
          </button>
          <button
            onClick={this.hidOffScreenCanvas}
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            Hide OffScreenCanvas
          </button>
          <div ref={this._offScreenRef}></div>
        </div>
      </div>
    )
  }
}

export default SegmentationExample
