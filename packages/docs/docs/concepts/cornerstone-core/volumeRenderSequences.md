---
id: volumeRenderSequences
title: Volume Render Sequences
summary: The sequence of calls that sets up a multi-resolution volume, chooses its texture, loads it, fills a reduced texture, and displays a segmentation over it
---

# Volume Render Sequences

This page gives the sequence of calls for the multi-resolution volume work. Each diagram names the
real functions and files. [Volume Render Strategy](./volumeRenderStrategy.md) gives the design, and
[Composite Voxel Manager](./compositeVoxelManager.md) gives the model of the voxels. Read those two
pages for the reasons. Read this page to find the code.

The diagrams use Mermaid. GitHub shows a diagram in the view of a file and in a pull request.

The six sequences are:

1. [The application selects the GPU settings and creates the volume](#1-the-application-selects-the-gpu-settings-and-creates-the-volume)
2. [A viewport adds its actor, and the provider chooses the texture](#2-a-viewport-adds-its-actor-and-the-provider-chooses-the-texture)
3. [The loader delivers the images](#3-the-loader-delivers-the-images)
4. [A render fills the dirty slices of a reduced texture](#4-a-render-fills-the-dirty-slices-of-a-reduced-texture)
5. [A render path of the generic architecture selects a strategy on each render](#5-a-render-path-of-the-generic-architecture-selects-a-strategy-on-each-render)
6. [A segmentation is displayed over a reduced volume](#6-a-segmentation-is-displayed-over-a-reduced-volume)

## A worked example

A CT series of 512 × 512 × 2464 voxels gives these results. The edge limit decides each factor here,
because the memory of each preset is larger than the reduced texture.

| Preset              | `maxTextureEdge` | Factors (i, j, k) | Texture grid     | Texture set                              |
| ------------------- | ---------------- | ----------------- | ---------------- | ---------------------------------------- |
| `high-texture-4096` | 4096             | 1, 1, 1           | 512 × 512 × 2464 | `full-resolution/full-extent`            |
| `high`, `medium`    | 2048             | 1, 1, 1.203125    | 512 × 512 × 2048 | `reduced-1x1x1.2031/full-extent/average` |
| `low`, `low-tablet` | 256              | 2, 2, 9.625       | 256 × 256 × 256  | `reduced-2x2x9.625/full-extent/average`  |

Under `auto`, the result depends on the device. A device with a `MAX_3D_TEXTURE_SIZE` of 2048 gives
the row of `high`. A device that passes the probe at 2464 gives the row of `high-texture-4096`.

`boxAverageReductionFactors` sets each reduced edge M to `min(dimension, maxTextureEdge)`. Then,
while the reduced grid holds more voxels than `textureMemoryBytes / bytesPerVoxel`, it takes one
voxel from the largest reduced axis. Last, an axis takes a whole factor f that divides its edge when
`dimension / f` is at least 0.9 of M. The factor is `dimension / M`, so 2464 / 256 gives 9.625: no
divisor of 2464 gives an edge between 231 and 256. Each texel covers its exact range of the source,
see `VRS-I-18` in [Volume Render Strategy](./volumeRenderStrategy.md).

## 1. The application selects the GPU settings and creates the volume

Without final downsampling (`rendering.lossyDownsampling.final`), a volume gets its full-resolution
texture. With it, the default preset is `auto`, which reads the stored record of the device. An
application that selects a named preset does so before a viewport adds its actor. A viewport reads
the preset only at that moment.

```mermaid
sequenceDiagram
    autonumber
    participant App as Application
    participant Prof as gpuSettingsPresets
    participant Retr as imageRetrieveMetadataProvider
    participant VL as volumeLoader
    participant Vol as ImageVolume / BaseStreamingImageVolume
    participant CVM as CompositeVoxelManager

    App->>Prof: setGpuSettingsPreset('medium')
    Note over Prof: No call means the default 'auto'.<br/>An unknown name throws.
    App->>Retr: add('volume', ProgressiveRetrieveImages.coarseInterleavedRetrieveStages)
    App->>VL: createAndCacheVolume(volumeId, { imageIds })
    VL->>Vol: new volume (voxelGrid, dataType, imageIds)
    Note over Vol,CVM: The first read of compositeVoxelManager creates the composite,<br/>with primary = volume.voxelManager.
    Note over Vol: The volume holds no texture.<br/>vtkOpenGLTexture is undefined until a set exists.
```

## 2. A viewport adds its actor, and the provider chooses the texture

Both architectures meet in `resolveVolumeTexture`. A legacy viewport (`BaseVolumeViewport`,
`VolumeViewport3D`) calls it through `createVolumeActor`. A render path of the generic architecture
calls it through `createVolumeSliceActor` or `createVolumeActor`, with its own provider and
selection.

```mermaid
sequenceDiagram
    autonumber
    participant VP as BaseVolumeViewport.addVolumes<br/>or VtkVolumeSliceRenderPath.addData
    participant CA as createVolumeActor<br/>or createVolumeSliceActor
    participant RVT as resolveVolumeTexture
    participant Prov as defaultVolumeStrategyProvider
    participant Grid as voxelGrid utilities
    participant Vol as ImageVolume
    participant Store as volumeTextureStore
    participant Tex as vtkStreamingOpenGLTexture
    participant Map as createVolumeMapper

    VP->>CA: volumeId
    CA->>RVT: resolveVolumeTexture(volume, options)
    RVT->>RVT: gpuSettingsForRender()
    RVT->>Prov: provideStrategies({ volume, gpuSettings, reason: 'initial' })
    Note over Prov: Under 'auto', gpuSettingsForGrid probes an edge<br/>above the reliable edge before any allocation.
    Prov->>Grid: gridLimitsOfGpuSettings(gpuSettings, bytesPerVoxel)
    Grid-->>Prov: { maxEdge, maxVoxelCount }
    Prov->>Grid: boxAverageReductionFactors(dimensions, limits)
    Grid-->>Prov: factors, for example [1, 1, 1.203125]
    alt every factor is 1
        Prov->>Vol: provisionTextureSet('full-resolution/full-extent', backstop)
    else a factor is more than 1
        Prov->>Grid: deriveBoxAverageGrid(voxelGrid, { factors })
        Note over Prov: The statistic is volume.reductionStatistic:<br/>average for an image, foregroundMajority for a labelmap
        Prov->>Vol: provisionTextureSet('reduced-1x1x1.2031/full-extent/average')
    end
    Vol->>Store: provision({ volumeId, grids, coverage })
    alt the store already holds a set of this name
        Store-->>Vol: the existing set, no allocation
    else a new set
        Store->>Tex: newInstance(), setVolumeId(), setGrid(grid)
        Store->>Tex: set.markAllDirty(), so frames that arrived before the set fill too
        Store-->>Vol: the new set
    end
    Prov-->>RVT: [FullExtentTextureStrategy]
    RVT->>RVT: selectFirstReadyStrategy({ strategies })
    RVT->>RVT: strategy.bindings(), take the 'base' texture
    opt a legacy viewport (no provider and no selection given)
        RVT->>Vol: pinTextureSet(name)
    end
    RVT-->>CA: { strategy, texture }
    CA->>Map: createVolumeMapper(imageData, texture)
    Map->>Map: setSampleDistance(sampleDistanceOf(imageData, texture))
    Map->>Map: setScalarTexture(texture)
    Note over Tex: The texture holds no data yet.<br/>Every render fills only the slices that a delivery marked.
```

A slice actor calls `mapper.setScalarTexture` in `createVolumeSliceActor` and samples no ray, so it
has no sample distance.

## 3. The loader delivers the images

A delivery marks slices and records quality. A delivery uploads nothing. The load can start before
or after the actor exists: a set that the provider creates later marks all of its slices dirty.

```mermaid
sequenceDiagram
    autonumber
    participant Caller as Viewport or application
    participant SV as BaseStreamingImageVolume
    participant PR as ProgressiveRetrieveImages
    participant Pool as imageLoadPoolManager
    participant Cache as cache
    participant Vol as ImageVolume
    participant Set as VolumeTextureSet
    participant Tex as vtkStreamingOpenGLTexture
    participant CVM as CompositeVoxelManager

    Caller->>SV: load(callback)
    SV->>SV: metaData.get(IMAGE_RETRIEVE_CONFIGURATION, volumeId, ..., 'volume')
    SV->>PR: createProgressive(configuration)
    SV->>SV: listenForCachedImages()
    SV->>PR: _prefetchImageIds(), then imagesLoader.loadImages(imageIds, volume)
    Note over PR: coarseInterleavedRetrieveStages: initialImages, then 64 stages<br/>of every 64th image, in bit-reversed order of offset
    opt the load is progressive
        SV->>Pool: removeOtherPrefetchRequests()
    end
    SV->>SV: takeInCachedImages(), batches of 8 ms
    loop each image that a stage retrieves
        PR->>Cache: the image loader puts the decoded image (true decoded size)
        Cache-->>SV: IMAGE_CACHE_IMAGE_ADDED
        SV->>Vol: markFrameTexturesDirty(frameIndex)
        Vol->>Vol: voxelManager.invalidateSlice(frameIndex)
        Vol->>Set: markDirty(boundsOfFrame, markSlice)
        Set->>Tex: setUpdatedFrame(slice that covers the frame)
        PR->>Cache: fillNearbyFrames() calls setPartialImage(replicate) for the empty frames
        Note over Cache: A replicate sends no cache event.<br/>The delivery below marks its frame.
        PR->>SV: successCallback(imageId, image)
        SV->>SV: updateTextureAndTriggerEvents(index, imageId, quality)
        SV-->>Caller: IMAGE_VOLUME_MODIFIED
        SV->>Vol: markFrameTexturesDirty(frameIndex)
        SV->>Vol: recordFrameDelivery(frameIndex, quality)
        Vol->>CVM: acceptData({ grid, frameIndex, quality })
        Note over CVM: Records the quality.<br/>Redoes only the boxes of a derived representation that the frame touches.
    end
    SV-->>Caller: IMAGE_VOLUME_LOADING_COMPLETED
```

`markFrameModified` is the third entry point. An edit at an unchanged quality calls it. Sequence 6
shows it.

## 4. A render fills the dirty slices of a reduced texture

The fill runs on the main thread inside the render. A budget limits each render, and the texture
asks for another render for the slices that remain.

```mermaid
sequenceDiagram
    autonumber
    participant RE as RenderingEngine
    participant Map as vtkStreamingOpenGLVolumeMapper<br/>or ImageResliceMapper
    participant Tex as vtkStreamingOpenGLTexture
    participant CVM as CompositeVoxelManager
    participant Cache as cache
    participant Stat as voxel statistic
    participant GL as WebGL2

    RE->>Map: render
    Map->>Tex: update3DFromRaw()
    alt the grid of the texture is the grid of the volume
        Tex->>Tex: updateTextureImagesUsingVoxelManager()
        Note over Tex: The full-resolution path. One frame is one slice.
    else a reduced grid
        Tex->>Tex: updateTextureFromComposite(volume)
        Tex->>CVM: derivedSliceReaderOf(composite, grid, statistic)
        Tex->>Tex: boxFactorsOf(volume, grid)
        loop each dirty slice, from fillCursor
            alt 16 slices with data are filled, or 8 ms passed after one slice
                Tex->>Tex: fillCursor = slice, stop
            else a derived representation holds this slice
                Tex->>Cache: getImage(representation imageId).getScalarData()
            else compute the slice
                Tex->>Tex: fillSliceByBoxStatistic(volume, grid, factors, slice)
                Tex->>Tex: framesOfSlice(), the frames that arrived, else the nearest replicate
                Tex->>Cache: readFrame(), or voxelManager.getSliceData() for a small decode
                Tex->>Stat: fillPlane(frames, ..., [factorI, factorJ], target)
                Note over Stat: fillPlaneByAverage for an image,<br/>fillPlaneByForegroundMajority for a labelmap
            end
            Tex->>GL: texSubImage3D(zoffset = slice, depth = 1)
        end
        opt the budget stopped the fill
            Tex->>Tex: scheduleRemainingFill(), setTimeout 0
            Tex->>RE: modified(), autoLoad(volumeId), the next render continues
        end
    end
```

`rendering.reducedTextureFill.maxSlicesPerRender` (16) and
`rendering.reducedTextureFill.maxMillisecondsPerRender` (8) set the budget.

## 5. A render path of the generic architecture selects a strategy on each render

A legacy viewport stops after sequence 2: it keeps the texture that `resolveVolumeTexture` gave.
A render path of the generic architecture holds its strategies, and it selects again on each render.

```mermaid
sequenceDiagram
    autonumber
    participant GV as GenericViewport
    participant RP as VtkVolumeSliceRenderPath
    participant Prov as provideStrategies
    participant Sel as selectStrategy
    participant Strat as IVolumeRenderStrategy
    participant Vol as ImageVolume
    participant Map as mapper

    GV->>RP: addData(volume)
    RP->>Prov: provisionStrategies(rendering, 'initial')
    RP->>RP: applyStrategy(rendering)
    loop each render
        GV->>RP: render()
        RP->>Sel: selectStrategy({ strategies, previous })
        Sel-->>RP: previous while ready, else the first ready strategy
        opt the selection changed
            RP->>Strat: previous.deactivate(), releaseTextureSet
            RP->>Strat: selected.activate(), claimTextureSet
        end
        RP->>Strat: update()
        RP->>RP: bindStrategy(rendering, selected)
        opt the base texture changed
            RP->>Map: setScalarTexture(base.texture), modified()
        end
        RP->>Vol: getGridQuality(base.grid, statistic)
        Vol-->>RP: VoxelQualityRecord, stored as rendering.voxelQuality
    end
    Vol-->>RP: IMAGE_VOLUME_LOADING_COMPLETED
    RP->>Prov: provisionStrategies(rendering, 'loaded')
    Note over Prov,Strat: The provider runs again. The store returns the same set,<br/>and the render path keeps a strategy that has the same name.
```

`VtkVolume3DRenderPath` follows the same steps. It also sets the sample distance again when it binds
a texture of another grid.

## 6. A segmentation is displayed over a reduced volume

A labelmap is a volume of its own, with its own texture set. The labelmap reduces by foreground
majority, so each reduced voxel holds a real segment index.

```mermaid
sequenceDiagram
    autonumber
    participant App as Application
    participant Seg as segmentation display<br/>(labelmapDisplay)
    participant Plan as createLegacyVolumeLabelmapPlan
    participant Store as labelmapLayerStore
    participant LV as labelmap ImageVolume
    participant VP as BaseVolumeViewport
    participant RVT as resolveVolumeTexture
    participant Upd as performVolumeLabelmapUpdate
    participant Tex as labelmap texture

    App->>Seg: addSegmentationRepresentations(viewportId, [labelmap])
    Seg->>Plan: mountLegacyVolumeLabelmap()
    Plan->>Store: getOrCreateLabelmapVolume(layer), tagLabelmapVolume(volume)
    Store->>LV: reductionStatistic = foregroundMajority
    alt blendMode is LABELMAP_EDGE_PROJECTION_BLEND and the dimensions match
        Plan->>Plan: addVolumesAsIndependentComponents()
        Note over Plan: Builds a full-resolution 2-component CPU array<br/>on an unshared mapper. No strategy and no reduction.
    else a PlanarViewport of the generic architecture
        Plan->>Plan: addLabelmapToPlanarGenericViewport()
        Note over Plan: The overlay reaches VtkVolumeSliceRenderPath.addData,<br/>then sequences 2 and 5.
    else a legacy volume viewport
        Plan->>VP: addVolumesToViewports([labelmap volumeId])
        VP->>RVT: createVolumeActor() then resolveVolumeTexture(labelmap volume)
        Note over RVT: Sequence 2, with the grid and the voxel width of the labelmap.<br/>The same dimensions give the same factors as the CT,<br/>for example the set reduced-1x1x1.2031/full-extent/foregroundMajority.
    end
    App->>LV: a brush tool writes voxels through volume.voxelManager
    App-->>Upd: SEGMENTATION_DATA_MODIFIED, onLabelmapSegmentationDataModified
    Upd->>LV: markFrameModified(slice) for each modified slice
    LV->>LV: markFrameTexturesDirty(slice)
    LV->>LV: compositeVoxelManager.refreshDerivedFrames(bounds)
    Upd-->>App: IMAGE_VOLUME_MODIFIED
    Note over Tex: The next render fills the dirty slices with<br/>fillPlaneByForegroundMajority (sequence 4).
```

The CT and the labelmap stay aligned because `deriveBoxAverageGrid` puts the offset of the box
centre in the origin of the reduced grid. Two volumes with the same grid and the same factors get the
same reduced grid.

A tool reads `volume.voxelManager`, which is the full-resolution primary representation. A
measurement and a brush therefore never read a reduced texture.
