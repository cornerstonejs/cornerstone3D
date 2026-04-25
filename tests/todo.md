[] - rename viewport next -> generic viewport
[] - rename the data id to displaySets
[] - nextLabelmapSegmentationTools has flickering during labelmap edit

[] why we have render mode in options

stackViewport.setDataList([
      {
        dataId: stackDataId,
        options: {
          renderMode: stackRenderMode,
        },
      },
    ]),
    volumeViewport.setDataList([
      {
        dataId: volumeDataId,
        options: {
          orientation: OrientationAxis.SAGITTAL,
          renderMode: volumeRenderMode,
        },
      },
    ]),
