[] - rename viewport next -> generic viewport
[] - rename the data id to displaySets
[] - rename 3dViewport to viewport3D

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
