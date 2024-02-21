# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.63.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.63.2...v1.63.3) (2024-02-21)

### Bug Fixes

- Video issues in the demo delete, play, current image ([#1108](https://github.com/cornerstonejs/cornerstone3D/issues/1108)) ([c8a7a89](https://github.com/cornerstonejs/cornerstone3D/commit/c8a7a89c21c4fe303e0ccbc55952eb1b41c15f0a)), closes [#1089](https://github.com/cornerstonejs/cornerstone3D/issues/1089)

## [1.63.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.63.1...v1.63.2) (2024-02-20)

### Bug Fixes

- **freehandROI:** moving mouse 1px back deletes the entire contour ([#1097](https://github.com/cornerstonejs/cornerstone3D/issues/1097)) ([#1110](https://github.com/cornerstonejs/cornerstone3D/issues/1110)) ([5e816d3](https://github.com/cornerstonejs/cornerstone3D/commit/5e816d390c7133af3c00824e1d4588edfd458dbf))

## [1.63.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.63.0...v1.63.1) (2024-02-20)

### Bug Fixes

- segmentBidirectionalTool broken after selecting any tool ([#1087](https://github.com/cornerstonejs/cornerstone3D/issues/1087)) ([#1111](https://github.com/cornerstonejs/cornerstone3D/issues/1111)) ([00f61fc](https://github.com/cornerstonejs/cornerstone3D/commit/00f61fcb31248c4f998a08edae17b27980fc2648))

# [1.63.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.62.0...v1.63.0) (2024-02-20)

### Features

- **tools:** Add new CircleStartEndThresholdTool and pointsInVolume statistics for 3D annotations ([#972](https://github.com/cornerstonejs/cornerstone3D/issues/972)) ([69350f4](https://github.com/cornerstonejs/cornerstone3D/commit/69350f48eb43ee163fc7e3f3e80ae7b996c25020))

# [1.62.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.61.7...v1.62.0) (2024-02-20)

### Features

- **volumeviewport:** return volume specific colormap information ([#1105](https://github.com/cornerstonejs/cornerstone3D/issues/1105)) ([53d9b97](https://github.com/cornerstonejs/cornerstone3D/commit/53d9b9753f412db5444d718b47e7f0ff0c93f83d))

## [1.61.7](https://github.com/cornerstonejs/cornerstone3D/compare/v1.61.6...v1.61.7) (2024-02-20)

### Bug Fixes

- Combine polyline interpolation breaks annotation state data ([#1079](https://github.com/cornerstonejs/cornerstone3D/issues/1079)) ([58efa2d](https://github.com/cornerstonejs/cornerstone3D/commit/58efa2d12f1dc5249744ccf5e4b48b700421a0ce))

## [1.61.6](https://github.com/cornerstonejs/cornerstone3D/compare/v1.61.5...v1.61.6) (2024-02-20)

### Bug Fixes

- **annotation-tools:** pointInShapeCallback now returns the correct array of points ([#962](https://github.com/cornerstonejs/cornerstone3D/issues/962)) ([b695318](https://github.com/cornerstonejs/cornerstone3D/commit/b695318e0e75f2492dfb7cff01932a0961d16ef9))

## [1.61.5](https://github.com/cornerstonejs/cornerstone3D/compare/v1.61.4...v1.61.5) (2024-02-16)

### Bug Fixes

- remove contour segmentation holes from annotationUIDsMap ([#1095](https://github.com/cornerstonejs/cornerstone3D/issues/1095)) ([#1103](https://github.com/cornerstonejs/cornerstone3D/issues/1103)) ([fc7ae30](https://github.com/cornerstonejs/cornerstone3D/commit/fc7ae30e98f368544b455982edd85567546bd4e5))

## [1.61.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.61.3...v1.61.4) (2024-02-16)

### Bug Fixes

- Rendering was throwing positions off on resize ([#942](https://github.com/cornerstonejs/cornerstone3D/issues/942)) ([d571e0c](https://github.com/cornerstonejs/cornerstone3D/commit/d571e0c6b2ead39ebaac2f0c61b1ba1d2265daec))

## [1.61.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.61.2...v1.61.3) (2024-02-16)

### Bug Fixes

- windowLevel dynamic range from video viewport ([#1088](https://github.com/cornerstonejs/cornerstone3D/issues/1088)) ([#1102](https://github.com/cornerstonejs/cornerstone3D/issues/1102)) ([1e3d435](https://github.com/cornerstonejs/cornerstone3D/commit/1e3d43576da60bf8e8d6fa69543e7d76e357bd12))

## [1.61.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.61.1...v1.61.2) (2024-02-16)

### Bug Fixes

- **freehandContourSeg:** freehand contour segmentation example ([#1084](https://github.com/cornerstonejs/cornerstone3D/issues/1084)) ([#1100](https://github.com/cornerstonejs/cornerstone3D/issues/1100)) ([fed9c02](https://github.com/cornerstonejs/cornerstone3D/commit/fed9c02b037c8c62118410ad37950db71ad1192b))

## [1.61.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.61.0...v1.61.1) (2024-02-15)

### Bug Fixes

- **colorbar:** don't change colorbar color if volume id doesn't match ([#1098](https://github.com/cornerstonejs/cornerstone3D/issues/1098)) ([cd7cb49](https://github.com/cornerstonejs/cornerstone3D/commit/cd7cb49ab04fbdd0c389731fda2e500ebb50f1c0))

# [1.61.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.60.0...v1.61.0) (2024-02-15)

### Features

- **Tools:** add Eraser Tool ([#806](https://github.com/cornerstonejs/cornerstone3D/issues/806)) ([9cd1381](https://github.com/cornerstonejs/cornerstone3D/commit/9cd13819a33de6cd6bde30a9e02a355b888f1700))

# [1.60.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.59.2...v1.60.0) (2024-02-15)

**Note:** Version bump only for package root

## [1.59.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.59.1...v1.59.2) (2024-02-15)

### Bug Fixes

- **annotation:** return empty array instead of undefined when no annotation object ([#885](https://github.com/cornerstonejs/cornerstone3D/issues/885)) ([8c73bd3](https://github.com/cornerstonejs/cornerstone3D/commit/8c73bd3c72733c8078f38acf17709b1af2780dba))

## [1.59.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.59.0...v1.59.1) (2024-02-15)

### Bug Fixes

- **polySeg:** able to handle holes inside contour segmentation ([#1080](https://github.com/cornerstonejs/cornerstone3D/issues/1080)) ([c4796fb](https://github.com/cornerstonejs/cornerstone3D/commit/c4796fb011145b88c8f4ff37b4882dfd7696b293))

# [1.59.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.58.5...v1.59.0) (2024-02-15)

### Features

- **colorbar:** react to changes to the colormap ([#1096](https://github.com/cornerstonejs/cornerstone3D/issues/1096)) ([9796f0c](https://github.com/cornerstonejs/cornerstone3D/commit/9796f0cf632290a23a8578c9038613b19561711d))

## [1.58.5](https://github.com/cornerstonejs/cornerstone3D/compare/v1.58.4...v1.58.5) (2024-02-14)

### Bug Fixes

- **annotations:** Ensure viewports re-render for annotation drawing ([#1083](https://github.com/cornerstonejs/cornerstone3D/issues/1083)) ([dd5e81d](https://github.com/cornerstonejs/cornerstone3D/commit/dd5e81d6f2491aac94593c2605f645ebb5319aed))

## [1.58.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.58.3...v1.58.4) (2024-02-13)

### Bug Fixes

- Stack/volume paired contour segmentations ([#1078](https://github.com/cornerstonejs/cornerstone3D/issues/1078)) ([ead38aa](https://github.com/cornerstonejs/cornerstone3D/commit/ead38aa502d25d18305707f1686a42a635a9ad17))

## [1.58.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.58.2...v1.58.3) (2024-02-13)

### Bug Fixes

- bidirectional on segmentation generation ([#1077](https://github.com/cornerstonejs/cornerstone3D/issues/1077)) ([9333d8d](https://github.com/cornerstonejs/cornerstone3D/commit/9333d8df0bec3b5ac040600143fe728827a8ee93))

## [1.58.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.58.1...v1.58.2) (2024-02-13)

### Bug Fixes

- multiple contour interpolation, holes and combinePolyline in contours ([#1070](https://github.com/cornerstonejs/cornerstone3D/issues/1070)) ([31c9573](https://github.com/cornerstonejs/cornerstone3D/commit/31c957361982c958c843cd108a3d799bac71e04d))

## [1.58.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.58.0...v1.58.1) (2024-02-13)

**Note:** Version bump only for package root

# [1.58.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.57.2...v1.58.0) (2024-02-12)

### Features

- **contours:** add polySeg converters to contour targets ([#1075](https://github.com/cornerstonejs/cornerstone3D/issues/1075)) ([296594d](https://github.com/cornerstonejs/cornerstone3D/commit/296594df8596a4f3e05766ed3040d6564061371f))

## [1.57.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.57.1...v1.57.2) (2024-02-12)

### Bug Fixes

- **spline:** spline update issue ([#1074](https://github.com/cornerstonejs/cornerstone3D/issues/1074)) ([8153cf6](https://github.com/cornerstonejs/cornerstone3D/commit/8153cf68c64721b4c9f4be5ddb2c4660e1339ab1))

## [1.57.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.57.0...v1.57.1) (2024-02-09)

### Bug Fixes

- Annotation view detection is separated out into multiple places breaking video interpolation ([#1066](https://github.com/cornerstonejs/cornerstone3D/issues/1066)) ([f30c025](https://github.com/cornerstonejs/cornerstone3D/commit/f30c0251452ce2f096853d76383d0d0c6593746a))

# [1.57.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.56.2...v1.57.0) (2024-02-09)

### Features

- **shades:** add light shades to volume rendering ([#1068](https://github.com/cornerstonejs/cornerstone3D/issues/1068)) ([65c6bd9](https://github.com/cornerstonejs/cornerstone3D/commit/65c6bd998d51a884a7d1286ff24e33df95f4f058))

## [1.56.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.56.1...v1.56.2) (2024-02-08)

### Bug Fixes

- segmentSelect issue + segmentation modified event ([#1065](https://github.com/cornerstonejs/cornerstone3D/issues/1065)) ([3451d24](https://github.com/cornerstonejs/cornerstone3D/commit/3451d24707606046960414eee270efab77e2906d))

## [1.56.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.56.0...v1.56.1) (2024-02-08)

### Bug Fixes

- **cobbAngle:** make arc lines configurable ([#1064](https://github.com/cornerstonejs/cornerstone3D/issues/1064)) ([1d9a351](https://github.com/cornerstonejs/cornerstone3D/commit/1d9a351efbfaa33cb714b69b508ffd40102d7e38))

# [1.56.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.55.0...v1.56.0) (2024-02-08)

### Features

- **videoViewport:** add segmentation for video viewport([#986](https://github.com/cornerstonejs/cornerstone3D/issues/986)) ([eb618f0](https://github.com/cornerstonejs/cornerstone3D/commit/eb618f0fb577f745a0a7c620d799d5df424831b5))

# [1.55.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.54.2...v1.55.0) (2024-02-08)

### Features

- **contourSeg:** polyline performance improvements ([#1061](https://github.com/cornerstonejs/cornerstone3D/issues/1061)) ([1df02d4](https://github.com/cornerstonejs/cornerstone3D/commit/1df02d4da24789c15acd8d9fc250454e47ed46a7))

## [1.54.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.54.1...v1.54.2) (2024-02-08)

### Bug Fixes

- **karma:** fixed the test coverage not appearing ([#1062](https://github.com/cornerstonejs/cornerstone3D/issues/1062)) ([1d2a8c3](https://github.com/cornerstonejs/cornerstone3D/commit/1d2a8c3f0d995ecb363a149894cc0d1fb090bb7a))

## [1.54.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.54.0...v1.54.1) (2024-02-07)

**Note:** Version bump only for package root

# [1.54.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.53.0...v1.54.0) (2024-02-07)

### Features

- **segmentation:** Add polymorph segmentation and representation conversion capabilities ([#844](https://github.com/cornerstonejs/cornerstone3D/issues/844)) ([ac21d9f](https://github.com/cornerstonejs/cornerstone3D/commit/ac21d9fc7cd67c230a916df74b578e3bae63345f))

# [1.53.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.52.0...v1.53.0) (2024-02-06)

### Features

- **contourSeg:** enable drawing and editing holes inside contour segmentation ([#1054](https://github.com/cornerstonejs/cornerstone3D/issues/1054)) ([a441c58](https://github.com/cornerstonejs/cornerstone3D/commit/a441c58fe19b2b14ab49917934ef6c8f02eddae3))

# [1.52.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.51.5...v1.52.0) (2024-02-02)

### Features

- **interpolation:** livewire on contour interpolation points ([#1041](https://github.com/cornerstonejs/cornerstone3D/issues/1041)) ([5f95a13](https://github.com/cornerstonejs/cornerstone3D/commit/5f95a130fce60f2038dd708b4a0702b5b13b7cab))

## [1.51.5](https://github.com/cornerstonejs/cornerstone3D/compare/v1.51.4...v1.51.5) (2024-02-01)

### Bug Fixes

- Refactor image splitting logic for 4D datasets ([#1055](https://github.com/cornerstonejs/cornerstone3D/issues/1055)) ([a19ea8f](https://github.com/cornerstonejs/cornerstone3D/commit/a19ea8fd4b06e7ba39000219c8476660cd661504))

## [1.51.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.51.3...v1.51.4) (2024-02-01)

### Bug Fixes

- **Magnify:** add flag to jump error and unnecessary logic ([#1053](https://github.com/cornerstonejs/cornerstone3D/issues/1053)) ([9b4321c](https://github.com/cornerstonejs/cornerstone3D/commit/9b4321cd59797452453664e9acc1416c5d8ad458))

## [1.51.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.51.2...v1.51.3) (2024-02-01)

### Bug Fixes

- Supplementary conditions to determine whether the error message exists ([#1052](https://github.com/cornerstonejs/cornerstone3D/issues/1052)) ([2909415](https://github.com/cornerstonejs/cornerstone3D/commit/29094159401977cc0e687d87db6a1435bf7cefa6))

## [1.51.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.51.1...v1.51.2) (2024-01-31)

### Bug Fixes

- Capture error messages thrown by vtk ([#1038](https://github.com/cornerstonejs/cornerstone3D/issues/1038)) ([9a9206d](https://github.com/cornerstonejs/cornerstone3D/commit/9a9206d13176dfe19e6d2e7e4f4d585b8bfff500))
- **dicom-image-loader:** add rgba condition interception for canvas createImageData API ([#1043](https://github.com/cornerstonejs/cornerstone3D/issues/1043)) ([70cf339](https://github.com/cornerstonejs/cornerstone3D/commit/70cf339e77f1396396c2d838722ac1330d205341))

## [1.51.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.51.0...v1.51.1) (2024-01-31)

### Bug Fixes

- Refactor image splitting logic to support additional metadata ([#1048](https://github.com/cornerstonejs/cornerstone3D/issues/1048)) ([4205452](https://github.com/cornerstonejs/cornerstone3D/commit/42054522680083aada25737d5e64fb22c24cb424))

# [1.51.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.50.3...v1.51.0) (2024-01-26)

### Features

- **contouSeg:** append/remove ([#1029](https://github.com/cornerstonejs/cornerstone3D/issues/1029)) ([29af2e1](https://github.com/cornerstonejs/cornerstone3D/commit/29af2e1a211ae904ac071b46ada48bbf62fb4c33))

## [1.50.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.50.2...v1.50.3) (2024-01-26)

### Bug Fixes

- **Cache:** Missing cached image to events details (removeImageLoadObject) ([#1040](https://github.com/cornerstonejs/cornerstone3D/issues/1040)) ([229f503](https://github.com/cornerstonejs/cornerstone3D/commit/229f50317aef2366b4c5363db203e21588d995d2))

## [1.50.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.50.1...v1.50.2) (2024-01-26)

### Bug Fixes

- **StackViewport:** Reset properties invert ([#1027](https://github.com/cornerstonejs/cornerstone3D/issues/1027)) ([a798596](https://github.com/cornerstonejs/cornerstone3D/commit/a79859640a8de88adc88915b19c6e3d52a5d49a3))

## [1.50.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.50.0...v1.50.1) (2024-01-26)

### Bug Fixes

- **WindowLevelTool:** attempt to set zero width color range ([#1037](https://github.com/cornerstonejs/cornerstone3D/issues/1037)) ([bcdc704](https://github.com/cornerstonejs/cornerstone3D/commit/bcdc704f994715163dde6d9160b80157904b793d))

# [1.50.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.49.2...v1.50.0) (2024-01-25)

### Features

- Livewire editing ([#1035](https://github.com/cornerstonejs/cornerstone3D/issues/1035)) ([655a241](https://github.com/cornerstonejs/cornerstone3D/commit/655a241b213e9f9eb00c295407cc53df2d4954ea))

## [1.49.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.49.1...v1.49.2) (2024-01-24)

### Bug Fixes

- wrong closed status value in SplineROI tool ([#1034](https://github.com/cornerstonejs/cornerstone3D/issues/1034)) ([0027ec1](https://github.com/cornerstonejs/cornerstone3D/commit/0027ec1afc8f1a3abf551bbe3fa86b77414bd9fb))

## [1.49.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.49.0...v1.49.1) (2024-01-24)

### Bug Fixes

- **spline:** spline ROI/Seg broken ([#1031](https://github.com/cornerstonejs/cornerstone3D/issues/1031)) ([3369d93](https://github.com/cornerstonejs/cornerstone3D/commit/3369d930f6232ca8dcf80369a9be6f3fed235521))

# [1.49.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.48.2...v1.49.0) (2024-01-23)

### Features

- **interpolation:** Contour segmentation interpolation for freehand and SplineROI ([#1003](https://github.com/cornerstonejs/cornerstone3D/issues/1003)) ([8434c8e](https://github.com/cornerstonejs/cornerstone3D/commit/8434c8e7386c1e5980099c325e087c60e8c270a1))

## [1.48.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.48.1...v1.48.2) (2024-01-22)

### Bug Fixes

- **splines:** add auto removing when outside image for SplineROITool series ([#1021](https://github.com/cornerstonejs/cornerstone3D/issues/1021)) ([6f24dd3](https://github.com/cornerstonejs/cornerstone3D/commit/6f24dd3f75dca4fc3276b1afc394267fca7d9b8f))

## [1.48.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.48.0...v1.48.1) (2024-01-22)

### Bug Fixes

- **VolumeViewport:** Set properties invert ([#1015](https://github.com/cornerstonejs/cornerstone3D/issues/1015)) ([69a8f6b](https://github.com/cornerstonejs/cornerstone3D/commit/69a8f6bf26f583ef9728c85bada614ac87a32fe4))

# [1.48.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.47.5...v1.48.0) (2024-01-22)

### Features

- **Segmentation:** Add stack to segmentation visibility ([#1014](https://github.com/cornerstonejs/cornerstone3D/issues/1014)) ([649eb8e](https://github.com/cornerstonejs/cornerstone3D/commit/649eb8e61a4ae298752189aedf53b76b4d3a50b1))

## [1.47.5](https://github.com/cornerstonejs/cornerstone3D/compare/v1.47.4...v1.47.5) (2024-01-22)

### Bug Fixes

- add auto remove when outside image for AngleTool ([#1019](https://github.com/cornerstonejs/cornerstone3D/issues/1019)) ([4a384d0](https://github.com/cornerstonejs/cornerstone3D/commit/4a384d0a9cb8508fff0c5ea5688d71a2874aecef))

## [1.47.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.47.3...v1.47.4) (2024-01-22)

### Bug Fixes

- synchronizer wrong logic if renderingEnigne is not exist ([#1023](https://github.com/cornerstonejs/cornerstone3D/issues/1023)) ([4e04816](https://github.com/cornerstonejs/cornerstone3D/commit/4e048163bbd2b62128ddfc1be56ba445f394354d))

## [1.47.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.47.2...v1.47.3) (2024-01-22)

### Bug Fixes

- wrong color convert error message ([#1012](https://github.com/cornerstonejs/cornerstone3D/issues/1012)) ([81308c0](https://github.com/cornerstonejs/cornerstone3D/commit/81308c05e790a62934df9c838d517bc610cea152))

## [1.47.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.47.1...v1.47.2) (2024-01-19)

### Bug Fixes

- bug EllipticalROITool ([#1011](https://github.com/cornerstonejs/cornerstone3D/issues/1011)) ([a072ebc](https://github.com/cornerstonejs/cornerstone3D/commit/a072ebc5deddff946aa08feb8b37fa24cab6d03e))

## [1.47.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.47.0...v1.47.1) (2024-01-18)

**Note:** Version bump only for package root

# [1.47.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.46.0...v1.47.0) (2024-01-18)

### Features

- **annotation:** Add getTargetId method for consistent target identification in viewports ([#1009](https://github.com/cornerstonejs/cornerstone3D/issues/1009)) ([ae653c9](https://github.com/cornerstonejs/cornerstone3D/commit/ae653c935a294e001a099043f4768d1521b7f697))

# [1.46.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.45.1...v1.46.0) (2024-01-16)

### Features

- **UltrasoundDirectionalTool:** add us directional adapter ([#999](https://github.com/cornerstonejs/cornerstone3D/issues/999)) ([1f78fd2](https://github.com/cornerstonejs/cornerstone3D/commit/1f78fd2859865ad19200096378ff7ce224209fb5))

## [1.45.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.45.0...v1.45.1) (2024-01-12)

### Bug Fixes

- Round negative values ([#995](https://github.com/cornerstonejs/cornerstone3D/issues/995)) ([c4d6ee5](https://github.com/cornerstonejs/cornerstone3D/commit/c4d6ee5053471f888c58b0c2af7de60e93e70c70))

# [1.45.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.44.3...v1.45.0) (2024-01-12)

### Features

- **video:** add support for contour ROI and contour based segmentation ([#988](https://github.com/cornerstonejs/cornerstone3D/issues/988)) ([944949e](https://github.com/cornerstonejs/cornerstone3D/commit/944949ef3717aaebb6d496bfbfd9b567561d2a35)), closes [#984](https://github.com/cornerstonejs/cornerstone3D/issues/984)

## [1.44.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.44.2...v1.44.3) (2024-01-11)

### Bug Fixes

- Lockup in request pool when returning non promise result ([#990](https://github.com/cornerstonejs/cornerstone3D/issues/990)) ([38d32c3](https://github.com/cornerstonejs/cornerstone3D/commit/38d32c3cb5e5e205985e163a2e19129a3beba7ed))

## [1.44.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.44.1...v1.44.2) (2024-01-11)

### Bug Fixes

- \_init function condition fault-tolerant in ScaleOverlayTool ([#991](https://github.com/cornerstonejs/cornerstone3D/issues/991)) ([f90d6c8](https://github.com/cornerstonejs/cornerstone3D/commit/f90d6c83a7f2d04f212bc8ab0d7fe1d60867a463))

## [1.44.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.44.0...v1.44.1) (2024-01-10)

**Note:** Version bump only for package root

# [1.44.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.43.7...v1.44.0) (2024-01-09)

### Features

- **contourSeg:** spline + freehand + livewire contour segmentation tools ([#983](https://github.com/cornerstonejs/cornerstone3D/issues/983)) ([505d358](https://github.com/cornerstonejs/cornerstone3D/commit/505d35825efbe5e38bf66f19b0deb90fbd2614a7))

## [1.43.7](https://github.com/cornerstonejs/cornerstone3D/compare/v1.43.6...v1.43.7) (2024-01-09)

### Bug Fixes

- **segmentation:** notify overlapping segments in generateToolState function ([#989](https://github.com/cornerstonejs/cornerstone3D/issues/989)) ([626cdbc](https://github.com/cornerstonejs/cornerstone3D/commit/626cdbc94d27c148ecd18ac8032174e2f202afbd))

## [1.43.6](https://github.com/cornerstonejs/cornerstone3D/compare/v1.43.5...v1.43.6) (2024-01-08)

### Bug Fixes

- **state manager:** Make viewport-related data optional for annotation event ([#950](https://github.com/cornerstonejs/cornerstone3D/issues/950)) ([9577cc0](https://github.com/cornerstonejs/cornerstone3D/commit/9577cc0a672397d6a146af85167e80764444a39d))

## [1.43.5](https://github.com/cornerstonejs/cornerstone3D/compare/v1.43.4...v1.43.5) (2024-01-08)

### Bug Fixes

- condition default streaming value ([#973](https://github.com/cornerstonejs/cornerstone3D/issues/973)) ([e9edf3c](https://github.com/cornerstonejs/cornerstone3D/commit/e9edf3ccbda05e0ce98a5a872e9bf68b1737685f))

## [1.43.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.43.3...v1.43.4) (2024-01-08)

**Note:** Version bump only for package root

## [1.43.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.43.2...v1.43.3) (2024-01-08)

**Note:** Version bump only for package root

## [1.43.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.43.1...v1.43.2) (2024-01-08)

### Bug Fixes

- **WindowLevelTool:** fix window level tool for non-pre-scaled PT images and images with small dynamic range ([#934](https://github.com/cornerstonejs/cornerstone3D/issues/934)) ([e147ecd](https://github.com/cornerstonejs/cornerstone3D/commit/e147ecd96cf194067ac7f76e2542daffe2822f1f))

## [1.43.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.43.0...v1.43.1) (2024-01-08)

### Bug Fixes

- Prevent errors during access to property of undefined object. ([#955](https://github.com/cornerstonejs/cornerstone3D/issues/955)) ([f15a218](https://github.com/cornerstonejs/cornerstone3D/commit/f15a218680fec529841881d20d3563aafe991f5b))

# [1.43.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.42.1...v1.43.0) (2024-01-07)

### Bug Fixes

- **segmentation-tools:** Improve rectangle and sphere brushes for non axis aligned images ([#961](https://github.com/cornerstonejs/cornerstone3D/issues/961)) ([3f4496f](https://github.com/cornerstonejs/cornerstone3D/commit/3f4496fee7636707fdaacf525144ff809346b27c))

### Features

- **release:** remove the test to release ([#987](https://github.com/cornerstonejs/cornerstone3D/issues/987)) ([0bddff3](https://github.com/cornerstonejs/cornerstone3D/commit/0bddff3ab156b96b4486655202b182351a95aa52))
- **vtk.js:** Upgrade version and add Segment Select Tool ([#922](https://github.com/cornerstonejs/cornerstone3D/issues/922)) ([d5f6abb](https://github.com/cornerstonejs/cornerstone3D/commit/d5f6abbfd0ca7f868d229696d27f047fb47f99cc))

## [1.42.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.42.0...v1.42.1) (2024-01-03)

**Note:** Version bump only for package root

# [1.42.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.41.0...v1.42.0) (2023-12-27)

### Features

- **tool:** Bidirectional creation on largest segment slice ([#937](https://github.com/cornerstonejs/cornerstone3D/issues/937)) ([b4ee6bf](https://github.com/cornerstonejs/cornerstone3D/commit/b4ee6bfdad64c208e37183a39681ba80c06ffe85))

# [1.41.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.40.3...v1.41.0) (2023-12-15)

### Features

- **ultrasound regions:** Add new US specific tool and augment length and probe tool to better support US ([#927](https://github.com/cornerstonejs/cornerstone3D/issues/927)) ([2211842](https://github.com/cornerstonejs/cornerstone3D/commit/2211842c990facbd66958aa26839ee53bc974d96))

## [1.40.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.40.2...v1.40.3) (2023-12-14)

### Bug Fixes

- **viewUp:** Adjust behavior after orientation change ([#948](https://github.com/cornerstonejs/cornerstone3D/issues/948)) ([464e2cf](https://github.com/cornerstonejs/cornerstone3D/commit/464e2cf5ba963c49d4143011a96463626257abf6))

## [1.40.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.40.1...v1.40.2) (2023-12-14)

### Bug Fixes

- **livewire:** issue when closing a path ([#946](https://github.com/cornerstonejs/cornerstone3D/issues/946)) ([50b7cdc](https://github.com/cornerstonejs/cornerstone3D/commit/50b7cdc7f633bcc9bf5f73518e88936fa929a0f1))

## [1.40.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.40.0...v1.40.1) (2023-12-14)

### Bug Fixes

- import from the viewportFilters again ([#945](https://github.com/cornerstonejs/cornerstone3D/issues/945)) ([c10ad71](https://github.com/cornerstonejs/cornerstone3D/commit/c10ad71d71c5d7d851674946834f3a6e4c2e8458))

# [1.40.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.39.0...v1.40.0) (2023-12-13)

### Bug Fixes

- Add degree to rad conversion for rotate mouse wheel ([#837](https://github.com/cornerstonejs/cornerstone3D/issues/837)) ([2e09018](https://github.com/cornerstonejs/cornerstone3D/commit/2e09018d1608eb68d93fff64d826fcd51fc0c2d7))

### Features

- **VolumeViewport:** add rotation property for Volume Viewport ([#928](https://github.com/cornerstonejs/cornerstone3D/issues/928)) ([8bb4f09](https://github.com/cornerstonejs/cornerstone3D/commit/8bb4f0906774c540a8c307326b4f7e75e054a6b9))

# [1.39.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.38.1...v1.39.0) (2023-12-13)

### Features

- **livewire:** livewire tool ([#941](https://github.com/cornerstonejs/cornerstone3D/issues/941)) ([cadb42b](https://github.com/cornerstonejs/cornerstone3D/commit/cadb42beb3e180629e5e219b235c8aa3faff65be))

## [1.38.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.38.0...v1.38.1) (2023-12-13)

### Bug Fixes

- **resetCamera:** Fixing relative zoom behavior in resetCamera ([#940](https://github.com/cornerstonejs/cornerstone3D/issues/940)) ([51a2509](https://github.com/cornerstonejs/cornerstone3D/commit/51a2509b41e2e15acbde70b797e7c2046b9e7c5e))

# [1.38.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.37.1...v1.38.0) (2023-12-12)

### Features

- Provide access to tracking unique measurement to allow combining parts of a measurement ([#932](https://github.com/cornerstonejs/cornerstone3D/issues/932)) ([65245ce](https://github.com/cornerstonejs/cornerstone3D/commit/65245ce8924776e20c78b18b6e5a86283b6e2668))

## [1.37.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.37.0...v1.37.1) (2023-12-11)

### Bug Fixes

- Display positioning and sizing was wrong ([#930](https://github.com/cornerstonejs/cornerstone3D/issues/930)) ([28a4955](https://github.com/cornerstonejs/cornerstone3D/commit/28a49559a7ebc8ca44e774c6d2b70d159219b810))

# [1.37.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.36.3...v1.37.0) (2023-12-11)

### Features

- **dynamic brush:** Add a dynamic threshold brush tool with preview ([#909](https://github.com/cornerstonejs/cornerstone3D/issues/909)) ([16fe759](https://github.com/cornerstonejs/cornerstone3D/commit/16fe759e618577a86c1b5535801b984d65a9d49d))

## [1.36.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.36.2...v1.36.3) (2023-12-06)

### Bug Fixes

- **disableElement:** should not resize the viewports ([#931](https://github.com/cornerstonejs/cornerstone3D/issues/931)) ([d7f8d34](https://github.com/cornerstonejs/cornerstone3D/commit/d7f8d3447649bb9550a71286de73480cf84e360a))

## [1.36.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.36.1...v1.36.2) (2023-12-06)

### Bug Fixes

- **dicomImageLoader:** Restore accidentally deleted options ([#916](https://github.com/cornerstonejs/cornerstone3D/issues/916)) ([#929](https://github.com/cornerstonejs/cornerstone3D/issues/929)) ([4cca3e4](https://github.com/cornerstonejs/cornerstone3D/commit/4cca3e4dc491139ea4b55fdf98a3b0b61ab42c4f))

## [1.36.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.36.0...v1.36.1) (2023-12-06)

### Bug Fixes

- Use callbacks to set headers for base loader ([#926](https://github.com/cornerstonejs/cornerstone3D/issues/926)) ([6df0c66](https://github.com/cornerstonejs/cornerstone3D/commit/6df0c6671e97ff89c91a039bd012f4b47edb8b11))

# [1.36.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.35.3...v1.36.0) (2023-12-05)

### Features

- **segmentation:** segmentation color change and fix seg import([#920](https://github.com/cornerstonejs/cornerstone3D/issues/920)) ([3af4437](https://github.com/cornerstonejs/cornerstone3D/commit/3af4437c4b20f7cc2556de4d655fc8f118e310a4))

## [1.35.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.35.2...v1.35.3) (2023-12-01)

### Bug Fixes

- **elliptical:** ROI and Rotation Tool Interaction (EllipticalROITool Only) ([#875](https://github.com/cornerstonejs/cornerstone3D/issues/875)) ([8ad260c](https://github.com/cornerstonejs/cornerstone3D/commit/8ad260cad281661a621376dbf0e8cd07659b8426))

## [1.35.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.35.1...v1.35.2) (2023-12-01)

### Bug Fixes

- Spline tool import ([#919](https://github.com/cornerstonejs/cornerstone3D/issues/919)) ([ae83fc4](https://github.com/cornerstonejs/cornerstone3D/commit/ae83fc44d885026605d46c170de5f10e4808ee40))

## [1.35.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.35.0...v1.35.1) (2023-11-30)

### Bug Fixes

- genericMetadataProvider import ([#918](https://github.com/cornerstonejs/cornerstone3D/issues/918)) ([165f4b6](https://github.com/cornerstonejs/cornerstone3D/commit/165f4b64d1008330c32fcf4ca928d5186e9c1ee1))

# [1.35.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.34.0...v1.35.0) (2023-11-28)

### Features

- **splineROI:** Add Cardinal, Linear, Catmull-Rom and B-Spline Spline Tools ([#898](https://github.com/cornerstonejs/cornerstone3D/issues/898)) ([b58c120](https://github.com/cornerstonejs/cornerstone3D/commit/b58c12008d0e6617704ae2c0c2f2f4cc2bb10d00))

# [1.34.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.33.0...v1.34.0) (2023-11-28)

### Features

- **imageSliceSync:** add acquisition image sync ([#906](https://github.com/cornerstonejs/cornerstone3D/issues/906)) ([c89c09c](https://github.com/cornerstonejs/cornerstone3D/commit/c89c09c11d6d9ed7ff035e4451d9f536112d5e8a))

# [1.33.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.32.3...v1.33.0) (2023-11-28)

### Features

- **segmentation:** add stack viewport segmentations rendering and tools ([#894](https://github.com/cornerstonejs/cornerstone3D/issues/894)) ([5d23572](https://github.com/cornerstonejs/cornerstone3D/commit/5d235720cec8914b35ed1ddc3d20e8b613003d44))

## [1.32.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.32.2...v1.32.3) (2023-11-28)

### Bug Fixes

- **slabScroll:** spacing calculation in getTargetVolumeAndSpacingInNormalDir function ([#905](https://github.com/cornerstonejs/cornerstone3D/issues/905)) ([ecde1a2](https://github.com/cornerstonejs/cornerstone3D/commit/ecde1a2e84414a6f36292518a571a729b3b9a2c9))

## [1.32.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.32.1...v1.32.2) (2023-11-24)

### Bug Fixes

- Inclusion of this build in OHIF was causing an import loop ([#911](https://github.com/cornerstonejs/cornerstone3D/issues/911)) ([997f5da](https://github.com/cornerstonejs/cornerstone3D/commit/997f5dab3bfb745d023525d90fc539c815ae4aa1))

## [1.32.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.32.0...v1.32.1) (2023-11-21)

### Bug Fixes

- **metadata:** exceptions trying to use the metadata providers ([#902](https://github.com/cornerstonejs/cornerstone3D/issues/902)) ([a4f1b63](https://github.com/cornerstonejs/cornerstone3D/commit/a4f1b634ee21a5fa3ce108902a1356d89ca838f0))

# [1.32.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.31.0...v1.32.0) (2023-11-21)

### Features

- **video Tools:** add video annotation tools ([#893](https://github.com/cornerstonejs/cornerstone3D/issues/893)) ([1a86640](https://github.com/cornerstonejs/cornerstone3D/commit/1a8664066474447e835c82ad10320778efc1a5bb))

# [1.31.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.30.1...v1.31.0) (2023-11-21)

### Features

- **webworker:** Simplify the API for running a compute task off the main thread in a worker ([#891](https://github.com/cornerstonejs/cornerstone3D/issues/891)) ([86876e5](https://github.com/cornerstonejs/cornerstone3D/commit/86876e5fa5bdb4b21ce999bd9dcccbf96a8adec7))

## [1.30.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.30.0...v1.30.1) (2023-11-15)

### Bug Fixes

- final htj2k transfer syntaxes ([#892](https://github.com/cornerstonejs/cornerstone3D/issues/892)) ([5b57ce6](https://github.com/cornerstonejs/cornerstone3D/commit/5b57ce6b31ffd65f7ec2a5e9dd60ab5829740ced))

# [1.30.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.29.0...v1.30.0) (2023-11-15)

### Features

- **video:** Apply window level and color balance ([#876](https://github.com/cornerstonejs/cornerstone3D/issues/876)) ([2accf81](https://github.com/cornerstonejs/cornerstone3D/commit/2accf818a90658ba3fb57e831b63d0795d53f6a4))

# [1.29.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.28.3...v1.29.0) (2023-11-14)

### Features

- **rendering:** HTJ2K Progressive Display on main branch ([#879](https://github.com/cornerstonejs/cornerstone3D/issues/879)) ([85fd193](https://github.com/cornerstonejs/cornerstone3D/commit/85fd19396762f54c6806fdbebf0235139a67629a))

## [1.28.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.28.2...v1.28.3) (2023-11-13)

### Bug Fixes

- **synchronizers:** support for async event handlers in Synchronizer class. ([#883](https://github.com/cornerstonejs/cornerstone3D/issues/883)) ([b012b4b](https://github.com/cornerstonejs/cornerstone3D/commit/b012b4b6e5ce8977add76531ab8c6e861a42448b))

## [1.28.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.28.1...v1.28.2) (2023-11-09)

### Bug Fixes

- **Tools:** Tool Styles Check Property ([#874](https://github.com/cornerstonejs/cornerstone3D/issues/874)) ([3a765a1](https://github.com/cornerstonejs/cornerstone3D/commit/3a765a140d76e6ce6a9932a47eedc85d3a633d59))

## [1.28.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.28.0...v1.28.1) (2023-11-09)

**Note:** Version bump only for package root

# [1.28.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.27.4...v1.28.0) (2023-11-08)

### Features

- **getDataInTime:** to export ijk as well for masks ([#869](https://github.com/cornerstonejs/cornerstone3D/issues/869)) ([6bac1fb](https://github.com/cornerstonejs/cornerstone3D/commit/6bac1fb4a7120b6837b608385060904de4515326))

## [1.27.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.27.3...v1.27.4) (2023-11-06)

**Note:** Version bump only for package root

## [1.27.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.27.2...v1.27.3) (2023-11-03)

### Bug Fixes

- **camera:** was not updating the viewUp and making the examples searchable in the prompt ([#865](https://github.com/cornerstonejs/cornerstone3D/issues/865)) ([72a3ed6](https://github.com/cornerstonejs/cornerstone3D/commit/72a3ed6b8b10271b1eefe534b139b8ad4d195dd0))

## [1.27.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.27.1...v1.27.2) (2023-10-31)

### Bug Fixes

- **invert:** Call setInvertColor after setTransferFunction in StackViewport.\_resetProperties. ([#861](https://github.com/cornerstonejs/cornerstone3D/issues/861)) ([016a14a](https://github.com/cornerstonejs/cornerstone3D/commit/016a14a8a8b9bed530689bba5920ab3b1ac42093))

## [1.27.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.27.0...v1.27.1) (2023-10-27)

### Bug Fixes

- **crosshairs:** and orientation markers and publish ([#856](https://github.com/cornerstonejs/cornerstone3D/issues/856)) ([9722013](https://github.com/cornerstonejs/cornerstone3D/commit/9722013b8d97a657914af18f5e597151b1ee4e79))

# [1.27.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.26.1...v1.27.0) (2023-10-27)

### Features

- **OrientationMarker:** clean up orientation marker ([#853](https://github.com/cornerstonejs/cornerstone3D/issues/853)) ([fe6bc44](https://github.com/cornerstonejs/cornerstone3D/commit/fe6bc440a345fd35bb60ead915b79fbcdeb8d2dd))

## [1.26.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.26.0...v1.26.1) (2023-10-27)

### Bug Fixes

- **scroll:** take into account the slab thickness for scrolling ([#849](https://github.com/cornerstonejs/cornerstone3D/issues/849)) ([8015160](https://github.com/cornerstonejs/cornerstone3D/commit/80151603e6f0d8aba96a6533925c77e559753ee8))

# [1.26.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.25.0...v1.26.0) (2023-10-27)

### Features

- **vide:** Add new Video Viewport with zoom and pan ([#828](https://github.com/cornerstonejs/cornerstone3D/issues/828)) ([5046db9](https://github.com/cornerstonejs/cornerstone3D/commit/5046db97e17e4b54ca003134661885cafaca4651))

# [1.25.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.24.0...v1.25.0) (2023-10-27)

**Note:** Version bump only for package root

# [1.24.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.23.4...v1.24.0) (2023-10-25)

### Features

- **colorbar:** add viewport colorbar ([#825](https://github.com/cornerstonejs/cornerstone3D/issues/825)) ([9f17218](https://github.com/cornerstonejs/cornerstone3D/commit/9f17218682e3e459962770000e983087204a5133))

## [1.23.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.23.3...v1.23.4) (2023-10-25)

**Note:** Version bump only for package root

## [1.23.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.23.2...v1.23.3) (2023-10-20)

### Bug Fixes

- **multiframe encapsulated:** take slice of array buffer to worker for decoding ([#667](https://github.com/cornerstonejs/cornerstone3D/issues/667)) ([a7f5b96](https://github.com/cornerstonejs/cornerstone3D/commit/a7f5b969dcc4dcf7998a0515e9ce4d03dd2c3951))

## [1.23.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.23.1...v1.23.2) (2023-10-20)

### Bug Fixes

- **voi:** sigmoid VOI ([#840](https://github.com/cornerstonejs/cornerstone3D/issues/840)) ([6a3cbc5](https://github.com/cornerstonejs/cornerstone3D/commit/6a3cbc58e554575d80a1b7085b13e46f90b4d826))

## [1.23.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.23.0...v1.23.1) (2023-10-20)

### Bug Fixes

- **colormap invert:** and dynamic volume new timePoint index event ([#841](https://github.com/cornerstonejs/cornerstone3D/issues/841)) ([c4d9bff](https://github.com/cornerstonejs/cornerstone3D/commit/c4d9bff1ed59b7797df07054c5e596145640a667))

# [1.23.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.22.1...v1.23.0) (2023-10-19)

### Features

- **surface rendering:** Add surface rendering as segmentation representation ([#808](https://github.com/cornerstonejs/cornerstone3D/issues/808)) ([f48d729](https://github.com/cornerstonejs/cornerstone3D/commit/f48d72905a61fe0dc0582b96e3c22cc9a4e76ea5))

## [1.22.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.22.0...v1.22.1) (2023-10-19)

### Bug Fixes

- **getDataInTime:** to consider different image spacing for reference ([#835](https://github.com/cornerstonejs/cornerstone3D/issues/835)) ([b71966d](https://github.com/cornerstonejs/cornerstone3D/commit/b71966d3f69056a224284be24390f4baab5176b9))

# [1.22.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.21.2...v1.22.0) (2023-10-17)

### Features

- **colormap:** add colormap props and default properties ([#834](https://github.com/cornerstonejs/cornerstone3D/issues/834)) ([475914d](https://github.com/cornerstonejs/cornerstone3D/commit/475914d0eaa35f1ae65b989c74efda042dc6d97a))

## [1.21.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.21.1...v1.21.2) (2023-10-16)

### Features

- **enhanced cobb angle:** more angles and being able to select each line ([#802](https://github.com/cornerstonejs/cornerstone3D/issues/802)) ([abc3bb8](https://github.com/cornerstonejs/cornerstone3D/commit/abc3bb8a19fab46f8f36c0ae42eae35f639b5973))

## [1.21.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.21.0...v1.21.1) (2023-10-14)

### Bug Fixes

- **advancedMagnifyTool:** fixed advanced magnify tool example (imageIds) ([#822](https://github.com/cornerstonejs/cornerstone3D/issues/822)) ([f5f0eb0](https://github.com/cornerstonejs/cornerstone3D/commit/f5f0eb006ed343fd8b1d7d9524a63f596b8ee317))
- **rotation:** Only one CAMERA_MODIFIED event per rotation ([#824](https://github.com/cornerstonejs/cornerstone3D/issues/824)) ([fd27c43](https://github.com/cornerstonejs/cornerstone3D/commit/fd27c43b7678e1eed97f75a1b2937c8ca7415a93))

# [1.21.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.20.3...v1.21.0) (2023-10-10)

### Features

- **advancedMagnifyTool:** advanced magnfying glass ([#816](https://github.com/cornerstonejs/cornerstone3D/issues/816)) ([a76cba9](https://github.com/cornerstonejs/cornerstone3D/commit/a76cba917fd1f67b4fc53ae19f77a7d9a70ba732))

## [1.20.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.20.2...v1.20.3) (2023-10-09)

### Bug Fixes

- **voi:** should publish voi change event on reset ([#821](https://github.com/cornerstonejs/cornerstone3D/issues/821)) ([84f9ab9](https://github.com/cornerstonejs/cornerstone3D/commit/84f9ab91b37fa1b898e211b5ec68ea090aba2691))

## [1.20.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.20.1...v1.20.2) (2023-10-09)

### Bug Fixes

- **modality unit:** fix the modality unit per target ([#820](https://github.com/cornerstonejs/cornerstone3D/issues/820)) ([41f06a7](https://github.com/cornerstonejs/cornerstone3D/commit/41f06a76376e399b6344caab5a3b7121bf1584f0))

## [1.20.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.20.0...v1.20.1) (2023-10-06)

### Bug Fixes

- **exports:** clean up rtss exports ([#814](https://github.com/cornerstonejs/cornerstone3D/issues/814)) ([a0dd324](https://github.com/cornerstonejs/cornerstone3D/commit/a0dd32499cc58001e4f49e2bda8d034b7f4ef48f))

# [1.20.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.19.4...v1.20.0) (2023-10-06)

### Features

- **adapter:** add RTSS Adapter and Labelmaps to Contours convertor ([#734](https://github.com/cornerstonejs/cornerstone3D/issues/734)) ([e3e05bd](https://github.com/cornerstonejs/cornerstone3D/commit/e3e05bd5ec0d851576fc76a2440e688c0a6e70d9))

## [1.19.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.19.3...v1.19.4) (2023-10-04)

### Bug Fixes

- **measurements:** Cached stats are now considered non-existent for various null or undefined attributes. ([#810](https://github.com/cornerstonejs/cornerstone3D/issues/810)) ([2d7f7b6](https://github.com/cornerstonejs/cornerstone3D/commit/2d7f7b6ad502cc468d5f1e6da28f11249bb0d8e4))

## [1.19.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.19.2...v1.19.3) (2023-10-02)

### Bug Fixes

- **segmentation:** should be able to change color ([#804](https://github.com/cornerstonejs/cornerstone3D/issues/804)) ([9394787](https://github.com/cornerstonejs/cornerstone3D/commit/939478765dc6c24d828689a013314c9bdf2dde7b))

## [1.19.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.19.1...v1.19.2) (2023-10-02)

### Bug Fixes

- Prefetch that is actually position aware and multi-viewport capable ([#726](https://github.com/cornerstonejs/cornerstone3D/issues/726)) ([abbc6f1](https://github.com/cornerstonejs/cornerstone3D/commit/abbc6f156c1162d6eea13fce99651f3891d6dc35))

## [1.19.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.19.0...v1.19.1) (2023-09-27)

### Bug Fixes

- **planarROITool:** Fix incorrect area calculation([#725](https://github.com/cornerstonejs/cornerstone3D/issues/725)) ([db14fa6](https://github.com/cornerstonejs/cornerstone3D/commit/db14fa6c115db22c4d47b854a1e958443cdb02c7))

# [1.19.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.18.0...v1.19.0) (2023-09-27)

### Features

- **referenceLines:** showFullDimension option to ReferenceLines tool ([#784](https://github.com/cornerstonejs/cornerstone3D/issues/784)) ([f9a498a](https://github.com/cornerstonejs/cornerstone3D/commit/f9a498ac18be171e6e2f89822c88e59f06ce43f2))

# [1.18.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.17.1...v1.18.0) (2023-09-26)

### Features

- **orientation marker:** New Orientation Marker tool ([#794](https://github.com/cornerstonejs/cornerstone3D/issues/794)) ([392a93b](https://github.com/cornerstonejs/cornerstone3D/commit/392a93b04599f8055050fefacfd53f0d891d7f53))

## [1.17.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.17.0...v1.17.1) (2023-09-25)

### Bug Fixes

- **stackSync:** Don't throw NPE if options is empty [#795](https://github.com/cornerstonejs/cornerstone3D/issues/795) ([#799](https://github.com/cornerstonejs/cornerstone3D/issues/799)) ([bd3d5c9](https://github.com/cornerstonejs/cornerstone3D/commit/bd3d5c9803a1e2c5030ffe55a6267d58272510b5))

# [1.17.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.16.6...v1.17.0) (2023-09-25)

### Features

- **overlayGrid:** New overlay grid tool ([#790](https://github.com/cornerstonejs/cornerstone3D/issues/790)) ([c8c5c91](https://github.com/cornerstonejs/cornerstone3D/commit/c8c5c919d46a2d0ad067028a61f027f2d1ee0c34))

## [1.16.6](https://github.com/cornerstonejs/cornerstone3D/compare/v1.16.5...v1.16.6) (2023-09-21)

### Bug Fixes

- **stackPrefetch:** disable function not working ([#793](https://github.com/cornerstonejs/cornerstone3D/issues/793)) ([7ced76e](https://github.com/cornerstonejs/cornerstone3D/commit/7ced76ed43c523f380e7252790f67afa005c1935))

## [1.16.5](https://github.com/cornerstonejs/cornerstone3D/compare/v1.16.4...v1.16.5) (2023-09-19)

### Bug Fixes

- **16bit float:** should not use 16bit int for float arrays ([#788](https://github.com/cornerstonejs/cornerstone3D/issues/788)) ([da13b89](https://github.com/cornerstonejs/cornerstone3D/commit/da13b898476a2044b1457a8a6e68a7090dcd9c45))

## [1.16.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.16.3...v1.16.4) (2023-09-18)

### Bug Fixes

- **segmentation:** stack segmentation remove should return ([#789](https://github.com/cornerstonejs/cornerstone3D/issues/789)) ([7bfe3ca](https://github.com/cornerstonejs/cornerstone3D/commit/7bfe3ca3e58bc0d9e1a6d174095c3935763b0c0b))

## [1.16.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.16.2...v1.16.3) (2023-09-18)

### Bug Fixes

- **Stack prefetch:** should not remove other requests ([#787](https://github.com/cornerstonejs/cornerstone3D/issues/787)) ([c2d6c2c](https://github.com/cornerstonejs/cornerstone3D/commit/c2d6c2c936bd98a58fea4db58558072563000f2f))

## [1.16.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.16.1...v1.16.2) (2023-09-18)

### Bug Fixes

- **invert:** Resetting the stack viewport properties should revert to the image's original invert setting ([#786](https://github.com/cornerstonejs/cornerstone3D/issues/786)) ([027a737](https://github.com/cornerstonejs/cornerstone3D/commit/027a73778c57e67efea2f99aa12b654f39994d97))

## [1.16.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.16.0...v1.16.1) (2023-09-14)

### Bug Fixes

- **config:** confusing initial config on init ([#783](https://github.com/cornerstonejs/cornerstone3D/issues/783)) ([ffa7288](https://github.com/cornerstonejs/cornerstone3D/commit/ffa7288968673b4f776cecffafbedd3551802ce7))

# [1.16.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.15.1...v1.16.0) (2023-09-12)

### Features

- **brush size:** enable specifying brush size for specific tool ([#780](https://github.com/cornerstonejs/cornerstone3D/issues/780)) ([e933b2f](https://github.com/cornerstonejs/cornerstone3D/commit/e933b2f0c02108023c38830ce479ca49a5cd372c))

## [1.15.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.15.0...v1.15.1) (2023-09-12)

### Bug Fixes

- **cine:** fix cine black images for slow computers ([#761](https://github.com/cornerstonejs/cornerstone3D/issues/761)) ([b110bda](https://github.com/cornerstonejs/cornerstone3D/commit/b110bdad1d5c561721d379bbd20cfe07639756ef))

# [1.15.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.14.4...v1.15.0) (2023-09-12)

### Features

- **Annotation textbox:** Add textBoxVisibility ([#776](https://github.com/cornerstonejs/cornerstone3D/issues/776)) ([c1981a1](https://github.com/cornerstonejs/cornerstone3D/commit/c1981a15d8ab3b5cbd227e6912b0e0f4a87871d5))

## [1.14.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.14.3...v1.14.4) (2023-09-07)

### Bug Fixes

- **measurements:** The image stack sync tool fails to work on non-FOR instances and hangs the browser ([#642](https://github.com/cornerstonejs/cornerstone3D/issues/642)) ([cd5efa0](https://github.com/cornerstonejs/cornerstone3D/commit/cd5efa06cb740e960a80817f9bdbb1fbe1d799d8))

## [1.14.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.14.2...v1.14.3) (2023-09-07)

### Bug Fixes

- **angle tool:** No text box if angle is incomplete/ value is NaN ([#721](https://github.com/cornerstonejs/cornerstone3D/issues/721)) ([de1af97](https://github.com/cornerstonejs/cornerstone3D/commit/de1af97624f199eabcb19cedbd4435681b895b35))

## [1.14.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.14.1...v1.14.2) (2023-09-07)

### Bug Fixes

- **examples:** publish nifti examples ([#773](https://github.com/cornerstonejs/cornerstone3D/issues/773)) ([e457ca8](https://github.com/cornerstonejs/cornerstone3D/commit/e457ca834939679c87b9ac46322b3b3c1c2b430f))

## [1.14.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.14.0...v1.14.1) (2023-09-07)

### Bug Fixes

- **release:** try to release nifti loader ([#772](https://github.com/cornerstonejs/cornerstone3D/issues/772)) ([74bbde0](https://github.com/cornerstonejs/cornerstone3D/commit/74bbde0542934f359be9f17f2f2b2a25eea0ae9d))

# [1.14.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.13.3...v1.14.0) (2023-09-07)

### Features

- **nifti:** Add nifti volume loader to cornerstone 3D repo ([#696](https://github.com/cornerstonejs/cornerstone3D/issues/696)) ([c9c2e83](https://github.com/cornerstonejs/cornerstone3D/commit/c9c2e83b2e0614c90c88bd89634f1bcb325d0a00))

## [1.13.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.13.2...v1.13.3) (2023-09-06)

### Bug Fixes

- **brush size:** brush size should be calculated in world not in canvas ([#771](https://github.com/cornerstonejs/cornerstone3D/issues/771)) ([6ca1e3a](https://github.com/cornerstonejs/cornerstone3D/commit/6ca1e3a6d7bc445bbe8aed08a46ec4998f9f8c54))

## [1.13.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.13.1...v1.13.2) (2023-09-05)

**Note:** Version bump only for package root

## [1.13.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.13.0...v1.13.1) (2023-09-01)

### Bug Fixes

- **Adapters:** adaptersSEG cornerstoneSR to cornerstoneSEG ([#766](https://github.com/cornerstonejs/cornerstone3D/issues/766)) ([e5d7826](https://github.com/cornerstonejs/cornerstone3D/commit/e5d78260320681714c6371a1747bdab8956e6e6b))

# [1.13.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.12.1...v1.13.0) (2023-08-30)

### Features

- **tools extensibility:** Added statistics calculator for Annotation Tools ([#723](https://github.com/cornerstonejs/cornerstone3D/issues/723)) ([9d96bed](https://github.com/cornerstonejs/cornerstone3D/commit/9d96beda02be8e32770512d815a56966620bb9d6))

## [1.12.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.12.0...v1.12.1) (2023-08-30)

### Bug Fixes

- **modifier key:** reset modifier keys when browser tab loses focus/is hidden ([#759](https://github.com/cornerstonejs/cornerstone3D/issues/759)) ([2602ec6](https://github.com/cornerstonejs/cornerstone3D/commit/2602ec6d69da53590217bd012e6b979fd22204da)), closes [#733](https://github.com/cornerstonejs/cornerstone3D/issues/733)

# [1.12.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.11.4...v1.12.0) (2023-08-29)

### Features

- **VolumeViewport:** Add getImageIds to volume viewport ([#758](https://github.com/cornerstonejs/cornerstone3D/issues/758)) ([6c430c7](https://github.com/cornerstonejs/cornerstone3D/commit/6c430c7b053a0bbed19c1bf6c6a1afb80ab039ae))

## [1.11.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.11.3...v1.11.4) (2023-08-29)

### Bug Fixes

- **BaseVolumeViewport:** when the volume actors are explicitly set, reset the inverted flag too ([#756](https://github.com/cornerstonejs/cornerstone3D/issues/756)) ([2258093](https://github.com/cornerstonejs/cornerstone3D/commit/2258093a2b9a2ed75023a6156a1a285093fcafc0))

## [1.11.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.11.2...v1.11.3) (2023-08-28)

### Bug Fixes

- **4D utility:** wrong array type returned by getDataInTime ([#754](https://github.com/cornerstonejs/cornerstone3D/issues/754)) ([14ea6c1](https://github.com/cornerstonejs/cornerstone3D/commit/14ea6c1dd77271d1d30698aa0e82994818112b5a))

## [1.11.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.11.1...v1.11.2) (2023-08-22)

### Bug Fixes

- **VolumeViewport:** Add optional volumeId to resetProperties in VolumeViewport ([#749](https://github.com/cornerstonejs/cornerstone3D/issues/749)) ([34b815e](https://github.com/cornerstonejs/cornerstone3D/commit/34b815e18c4380abe31c3fc5368d27dd99fa5fc6))

## [1.11.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.11.0...v1.11.1) (2023-08-21)

### Bug Fixes

- **memory leak:** array buffer was sticking around because of exception ([#748](https://github.com/cornerstonejs/cornerstone3D/issues/748)) ([f27ae9a](https://github.com/cornerstonejs/cornerstone3D/commit/f27ae9a28c4fa796ffd1973b7c56c325dec41754))

# [1.11.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.10.5...v1.11.0) (2023-08-21)

### Features

- **VolumeViewport:** Add reset properties to volume viewport ([#747](https://github.com/cornerstonejs/cornerstone3D/issues/747)) ([054b044](https://github.com/cornerstonejs/cornerstone3D/commit/054b044f8279f547459c0776a67db56e776927a6))

## [1.10.5](https://github.com/cornerstonejs/cornerstone3D/compare/v1.10.4...v1.10.5) (2023-08-21)

**Note:** Version bump only for package root

## [1.10.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.10.3...v1.10.4) (2023-08-17)

### Bug Fixes

- sorting priority groups ([#741](https://github.com/cornerstonejs/cornerstone3D/issues/741)) ([2dc7e87](https://github.com/cornerstonejs/cornerstone3D/commit/2dc7e87b362868e4bf7946924a597f238fa31027))

## [1.10.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.10.2...v1.10.3) (2023-08-15)

**Note:** Version bump only for package root

## [1.10.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.10.1...v1.10.2) (2023-08-15)

### Bug Fixes

- **color:** Convert color space for useRGBA false ([#730](https://github.com/cornerstonejs/cornerstone3D/issues/730)) ([52d5dcd](https://github.com/cornerstonejs/cornerstone3D/commit/52d5dcd59c892e594188f056612474db2812579d))

## [1.10.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.10.0...v1.10.1) (2023-08-09)

**Note:** Version bump only for package root

# [1.10.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.9.3...v1.10.0) (2023-08-02)

### Features

- **toolEvent:** added an event that is triggered when a tool is activated ([#718](https://github.com/cornerstonejs/cornerstone3D/issues/718)) ([c67b61e](https://github.com/cornerstonejs/cornerstone3D/commit/c67b61e8d5dc32a5d454b8c8c9daec3f6e12a7f9))

## [1.9.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.9.2...v1.9.3) (2023-08-02)

### Bug Fixes

- **volumeloader:** should work when images are cached ([#719](https://github.com/cornerstonejs/cornerstone3D/issues/719)) ([7e71da6](https://github.com/cornerstonejs/cornerstone3D/commit/7e71da6aef151e81adc8252be585eb0caa4205cf))

## [1.9.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.9.1...v1.9.2) (2023-08-01)

**Note:** Version bump only for package root

## [1.9.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.9.0...v1.9.1) (2023-07-31)

### Bug Fixes

- **loader:** Load colour images correctly when specified Float32Array ([#702](https://github.com/cornerstonejs/cornerstone3D/issues/702)) ([29f6619](https://github.com/cornerstonejs/cornerstone3D/commit/29f6619540609e45c7a2a0911b9c3fc99c26c85f)), closes [#699](https://github.com/cornerstonejs/cornerstone3D/issues/699) [#706](https://github.com/cornerstonejs/cornerstone3D/issues/706) [#705](https://github.com/cornerstonejs/cornerstone3D/issues/705)

# [1.9.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.8.1...v1.9.0) (2023-07-28)

### Features

- **voiSync:** add optoins to turn of invert sync for voisync ([#708](https://github.com/cornerstonejs/cornerstone3D/issues/708)) ([4f5b5c3](https://github.com/cornerstonejs/cornerstone3D/commit/4f5b5c36b92161dc103fa7fbc58137dc71c1ae91))

## [1.8.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.8.0...v1.8.1) (2023-07-28)

### Bug Fixes

- **voi:** fix the voi setting when the stack is composed of different orientations ([#703](https://github.com/cornerstonejs/cornerstone3D/issues/703)) ([c2810dd](https://github.com/cornerstonejs/cornerstone3D/commit/c2810dd5799caf21869c323631802cec3e599ca7))

# [1.8.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.7.2...v1.8.0) (2023-07-28)

### Features

- **segmentation export:** add new cornerstone3D segmentation export adapter ([#692](https://github.com/cornerstonejs/cornerstone3D/issues/692)) ([9e743f5](https://github.com/cornerstonejs/cornerstone3D/commit/9e743f5d2b58dedb17dcbe0de40f42e703f77b14))

## [1.7.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.7.1...v1.7.2) (2023-07-27)

### Bug Fixes

- **SVGCursorDescriptor:** improve CursorSVG typing ([#705](https://github.com/cornerstonejs/cornerstone3D/issues/705)) ([26b854a](https://github.com/cornerstonejs/cornerstone3D/commit/26b854ab2340efc2a6190d48e86cb8e45dd7b442))

## [1.7.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.7.0...v1.7.1) (2023-07-27)

**Note:** Version bump only for package root

# [1.7.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.6.0...v1.7.0) (2023-07-26)

### Features

- **streamingVolumeLoader:** added IMAGE_VOLUME_LOADING_COMPLETED event ([#699](https://github.com/cornerstonejs/cornerstone3D/issues/699)) ([c8c8f59](https://github.com/cornerstonejs/cornerstone3D/commit/c8c8f59078251eca168bf11952def05cbe412118))

# [1.6.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.5.0...v1.6.0) (2023-07-21)

### Features

- **calibration:** Add calibration type labels (ERMF, PROJ, USER) ([#638](https://github.com/cornerstonejs/cornerstone3D/issues/638)) ([0aafbc2](https://github.com/cornerstonejs/cornerstone3D/commit/0aafbc2be6f50f4733792b7eb924863ec3200f23))

# [1.5.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.4.6...v1.5.0) (2023-07-18)

### Features

- **viewportStatus:** Have renderedState to store the status of whether an image has been rendered yet ([#694](https://github.com/cornerstonejs/cornerstone3D/issues/694)) ([eeef233](https://github.com/cornerstonejs/cornerstone3D/commit/eeef233ef6e0b31f5b9ad14c6c722f529836ef5d))

## [1.4.6](https://github.com/cornerstonejs/cornerstone3D/compare/v1.4.5...v1.4.6) (2023-07-14)

**Note:** Version bump only for package root

## [1.4.5](https://github.com/cornerstonejs/cornerstone3D/compare/v1.4.4...v1.4.5) (2023-07-14)

### Bug Fixes

- **color volume:** take into account number of components for the volume length ([#687](https://github.com/cornerstonejs/cornerstone3D/issues/687)) ([667c42e](https://github.com/cornerstonejs/cornerstone3D/commit/667c42e635f6262225f88aa458fe7482ea9ecf1e))

## [1.4.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.4.3...v1.4.4) (2023-07-13)

### Bug Fixes

- **PT measurement units:** Non-SUV scaled, but pre-scaled PTs should show proper units ([#686](https://github.com/cornerstonejs/cornerstone3D/issues/686)) ([e9190df](https://github.com/cornerstonejs/cornerstone3D/commit/e9190df44b29be504b46ebb768e6ad2e6b02bbe3))

## [1.4.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.4.2...v1.4.3) (2023-07-12)

### Bug Fixes

- **ptct:** Jump to click and voisync for volume3d ([#678](https://github.com/cornerstonejs/cornerstone3D/issues/678)) ([8342ff4](https://github.com/cornerstonejs/cornerstone3D/commit/8342ff4e665b9dc1c09af0ca2eddd607d3b1c3a3))

## [1.4.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.4.1...v1.4.2) (2023-07-11)

### Bug Fixes

- **color volume viewport:** fix incorrect property on volume actor ([#683](https://github.com/cornerstonejs/cornerstone3D/issues/683)) ([dbc40e9](https://github.com/cornerstonejs/cornerstone3D/commit/dbc40e9adda15570ff451a13c60effb5fbc1adbb))

## [1.4.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.4.0...v1.4.1) (2023-07-04)

### Bug Fixes

- **PET vs PT:** Change all to PT for consistency ([#676](https://github.com/cornerstonejs/cornerstone3D/issues/676)) ([813e5ba](https://github.com/cornerstonejs/cornerstone3D/commit/813e5bac8a615b53cab3640052ce5d9bb7dabc5b))

# [1.4.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.3.0...v1.4.0) (2023-07-04)

### Features

- **detectGPU:** Add config for getGPUTier method in cornerstone.init ([#633](https://github.com/cornerstonejs/cornerstone3D/issues/633)) ([b5ea0e2](https://github.com/cornerstonejs/cornerstone3D/commit/b5ea0e2c1e337759062ff22c5c7db545fc8be745)), closes [#570](https://github.com/cornerstonejs/cornerstone3D/issues/570)

# [1.3.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.2.9...v1.3.0) (2023-07-04)

### Features

- **invertSync:** add invert sync to voi sync ([#677](https://github.com/cornerstonejs/cornerstone3D/issues/677)) ([a1dcfbc](https://github.com/cornerstonejs/cornerstone3D/commit/a1dcfbc986a483d650cd2abfdd8f1bba1e3d829a))

## [1.2.9](https://github.com/cornerstonejs/cornerstone3D/compare/v1.2.8...v1.2.9) (2023-07-03)

### Bug Fixes

- **dicomImageLoader:** Error when loading Wadouri JPEG Image ([#674](https://github.com/cornerstonejs/cornerstone3D/issues/674)) ([6564232](https://github.com/cornerstonejs/cornerstone3D/commit/6564232531877d2545226a502c10a829f8e6bf28))

## [1.2.8](https://github.com/cornerstonejs/cornerstone3D/compare/v1.2.7...v1.2.8) (2023-06-27)

### Bug Fixes

- **monochrome1:** fix bug for monochrom1 inverted color ([#668](https://github.com/cornerstonejs/cornerstone3D/issues/668)) ([0864049](https://github.com/cornerstonejs/cornerstone3D/commit/0864049b4d7c9846e715af70c8ef26e13b7be2dc))

## [1.2.7](https://github.com/cornerstonejs/cornerstone3D/compare/v1.2.6...v1.2.7) (2023-06-20)

### Bug Fixes

- **PlanarFreehandROITool:** trigger event after recalculation of stats ([#665](https://github.com/cornerstonejs/cornerstone3D/issues/665)) ([5a63104](https://github.com/cornerstonejs/cornerstone3D/commit/5a63104cca936b6104b7a7a87409e40363017f9e))

## [1.2.6](https://github.com/cornerstonejs/cornerstone3D/compare/v1.2.5...v1.2.6) (2023-06-14)

### Bug Fixes

- **stack:** invalidate stack if the next image is different PI ([#631](https://github.com/cornerstonejs/cornerstone3D/issues/631)) ([24ae3c9](https://github.com/cornerstonejs/cornerstone3D/commit/24ae3c975f25eaf91f0eccba69983ddd20e98ac0))
- **types:** fix the signature of resize method ([#630](https://github.com/cornerstonejs/cornerstone3D/issues/630)) ([7b6f855](https://github.com/cornerstonejs/cornerstone3D/commit/7b6f8556bc160ae63e9069baed83fb9082d7e719))

## [1.2.5](https://github.com/cornerstonejs/cornerstone3D/compare/v1.2.4...v1.2.5) (2023-06-14)

### Bug Fixes

- **PlanarFreehandROITool:** recalculate stats upon edit ([#607](https://github.com/cornerstonejs/cornerstone3D/issues/607)) ([f193701](https://github.com/cornerstonejs/cornerstone3D/commit/f1937010c982d57aec93e66a2e3e308f851eceec))

## [1.2.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.2.3...v1.2.4) (2023-06-13)

**Note:** Version bump only for package root

## [1.2.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.2.2...v1.2.3) (2023-06-13)

**Note:** Version bump only for package root

## [1.2.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.2.1...v1.2.2) (2023-06-13)

### Bug Fixes

- **colormap:** adding new Method to set the opacity of the colormap ([#649](https://github.com/cornerstonejs/cornerstone3D/issues/649)) ([d7e5430](https://github.com/cornerstonejs/cornerstone3D/commit/d7e54301e6e4e7cde6b3a087543b772943884bfa))

## [1.2.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.2.0...v1.2.1) (2023-06-13)

### Bug Fixes

- **multiframe:** transfer only portion of data for multiframe to worker ([#652](https://github.com/cornerstonejs/cornerstone3D/issues/652)) ([aaf94ea](https://github.com/cornerstonejs/cornerstone3D/commit/aaf94eace6064f6b952a0e7c077653b5b6dc8c99))

# [1.2.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.1.9...v1.2.0) (2023-06-12)

### Features

- **agnleTool:** link textbox to vertex unless moved by user ([#651](https://github.com/cornerstonejs/cornerstone3D/issues/651)) ([d77dff3](https://github.com/cornerstonejs/cornerstone3D/commit/d77dff3c339d46db52a2868feaf12501838e9b96))

## [1.1.9](https://github.com/cornerstonejs/cornerstone3D/compare/v1.1.8...v1.1.9) (2023-06-12)

### Bug Fixes

- **mipJump:** MIP jump to image click ([#645](https://github.com/cornerstonejs/cornerstone3D/issues/645)) ([d81d583](https://github.com/cornerstonejs/cornerstone3D/commit/d81d583d645e69c5d52d4d03a713c0c43d33867f))

## [1.1.8](https://github.com/cornerstonejs/cornerstone3D/compare/v1.1.7...v1.1.8) (2023-06-09)

### Bug Fixes

- **sab:** check for sab before using it ([#648](https://github.com/cornerstonejs/cornerstone3D/issues/648)) ([f4d60a2](https://github.com/cornerstonejs/cornerstone3D/commit/f4d60a283e3d52fbba3e2b482359a1482b1c38e9))

## [1.1.7](https://github.com/cornerstonejs/cornerstone3D/compare/v1.1.6...v1.1.7) (2023-06-09)

**Note:** Version bump only for package root

## [1.1.6](https://github.com/cornerstonejs/cornerstone3D-beta/compare/v1.1.5...v1.1.6) (2023-06-01)

### Bug Fixes

- **Cobb Angle:** use the two closest line segment points as the tail of each respectful vector ([#634](https://github.com/cornerstonejs/cornerstone3D-beta/issues/634)) ([8311de3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8311de3baf4f1f759406a3cac3fe0077d818bdbb))

## [1.1.5](https://github.com/cornerstonejs/cornerstone3D-beta/compare/v1.1.4...v1.1.5) (2023-05-23)

### Bug Fixes

- **event:** Interactions between double click and multi mouse button ([#616](https://github.com/cornerstonejs/cornerstone3D-beta/issues/616)) ([3be68c1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/3be68c166ade016793ae8d8c6dbe7bd15dfd07ac))

## [1.1.4](https://github.com/cornerstonejs/cornerstone3D-beta/compare/v1.1.3...v1.1.4) (2023-05-23)

### Bug Fixes

- **windowLevel:** should not double scale for window level ([#619](https://github.com/cornerstonejs/cornerstone3D-beta/issues/619)) ([479eba7](https://github.com/cornerstonejs/cornerstone3D-beta/commit/479eba77cb050b90984e2b1f51d63b29854a6d40))

## [1.1.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/v1.1.2...v1.1.3) (2023-05-23)

### Bug Fixes

- **expose:** api default mouse primary ([#622](https://github.com/cornerstonejs/cornerstone3D-beta/issues/622)) ([94be45b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/94be45b501c57435f1a451517200624e32187a02))

## [1.1.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/v1.1.1...v1.1.2) (2023-05-23)

**Note:** Version bump only for package root

## [1.1.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/v1.1.0...v1.1.1) (2023-05-23)

### Bug Fixes

- **husky:** husky config ([#627](https://github.com/cornerstonejs/cornerstone3D-beta/issues/627)) ([d99d77e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d99d77e3d612ba24936d430a8e5a29ee4fefeb9c))

# [1.1.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/v0.103.0...v1.1.0) (2023-05-22)

### Features

- **api:** cornerstone3D ([#626](https://github.com/cornerstonejs/cornerstone3D-beta/issues/626)) ([8ce3961](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8ce3961068291f98cbdd2cd4afe43a7f3ae2657d))

# [0.103.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/v0.102.0...v0.103.0) (2023-05-22)

- feat(api)!: cornerstone3D version 1.0 (#625) ([0c6cf01](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0c6cf0112f97a2cbd6b62f60783c368dc769859e)), closes [#625](https://github.com/cornerstonejs/cornerstone3D-beta/issues/625)

### BREAKING CHANGES

- cornerstone3D version 1

# [0.102.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/v0.101.0...v0.102.0) (2023-05-22)

- feat(version1)!: publish version 1.0 (#624) ([117cdb7](https://github.com/cornerstonejs/cornerstone3D-beta/commit/117cdb79bbcf005b78f7c26e2b38d3f63a455e12)), closes [#624](https://github.com/cornerstonejs/cornerstone3D-beta/issues/624)

### BREAKING CHANGES

- breaking change bump major

# 0.101.0 (2023-05-22)

### Bug Fixes

- **#186:** Expose Synchronizer Class at top level ([#188](https://github.com/cornerstonejs/cornerstone3D-beta/issues/188)) ([2f7ed66](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2f7ed6628d4a86ebea06135cc1e491557bd3c85c)), closes [#186](https://github.com/cornerstonejs/cornerstone3D-beta/issues/186)
- 🐛 adding readme notes ([#191](https://github.com/cornerstonejs/cornerstone3D-beta/issues/191)) ([459260d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/459260d6e2a6f905729ddf68b1f12d3140b53849))
- 🐛 fix array format regression from commit 70b24332783d63c9db2ed21d512d9f7b526c5222 ([#236](https://github.com/cornerstonejs/cornerstone3D-beta/issues/236)) ([5441063](https://github.com/cornerstonejs/cornerstone3D-beta/commit/5441063d0395ede6d9f8bd3ac0d92ee14f6ef209))
- 🐛 Fix rotation mapping for SEG cornerstone adapter ([#151](https://github.com/cornerstonejs/cornerstone3D-beta/issues/151)) ([3fab68c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/3fab68cbfd95f82820663b9fc99a2b0cd07e43c8))
- 🐛 Harden Segmentation import for different possible SEGs ([#146](https://github.com/cornerstonejs/cornerstone3D-beta/issues/146)) ([c4952bc](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c4952bc5842bab80a5d928de0d860f89afc8f400))
- 🐛 IDC Re [#2003](https://github.com/cornerstonejs/cornerstone3D-beta/issues/2003): fix regression in parsing segmentation orietations ([#220](https://github.com/cornerstonejs/cornerstone3D-beta/issues/220)) ([5c0c6a8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/5c0c6a85e67b25ce5f39412ced37d8e825691481))
- 🐛 IDC2733: find segmentations reference source image Ids ([#253](https://github.com/cornerstonejs/cornerstone3D-beta/issues/253)) ([f3e7101](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f3e71016dffa233bf0fb912cc7cf413718b8a1a9))
- 🐛 ignore frames without SourceImageSequence information when loading a segmentation ([#198](https://github.com/cornerstonejs/cornerstone3D-beta/issues/198)) ([82709c4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/82709c4a8a317aa1354244010300ab9b902802dd))
- 🐛 indentation in nearlyEqual ([#202](https://github.com/cornerstonejs/cornerstone3D-beta/issues/202)) ([989d6c9](https://github.com/cornerstonejs/cornerstone3D-beta/commit/989d6c9a80686425563c55424ac1795e6a06cd7b))
- 🐛 relax condition in nearlyEquals check for detecting numbers near to zero ([#304](https://github.com/cornerstonejs/cornerstone3D-beta/issues/304)) ([974cddd](https://github.com/cornerstonejs/cornerstone3D-beta/commit/974cddd785c076f1ac0211b534a7c0b82a4ba68a))
- 🐛 When converting to multiframe, fix IPP issues ([#152](https://github.com/cornerstonejs/cornerstone3D-beta/issues/152)) ([80496e4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/80496e422152c1a3dfd850a145011dd3dc632964))
- **180:** Avoid throwing exception for missing transfer syntax decoder ([#181](https://github.com/cornerstonejs/cornerstone3D-beta/issues/181)) ([874d7e6](https://github.com/cornerstonejs/cornerstone3D-beta/commit/874d7e660ab38d3d4da20e26c1a305c73d2b0dbd))
- **adapter:** Removed comment around getTID300RepresentationArguments 'tool' parameter ([#322](https://github.com/cornerstonejs/cornerstone3D-beta/issues/322)) ([d8f05ff](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d8f05ffb9ef1b5cce254980a597b4c428ffdfb6e)), closes [#306](https://github.com/cornerstonejs/cornerstone3D-beta/issues/306)
- **adapters:** Measurement reports can throw exceptions that prevent loading ([#458](https://github.com/cornerstonejs/cornerstone3D-beta/issues/458)) ([7bc7d8a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7bc7d8aaeb5aa0df91c24e278665d14f590ec234))
- **adapters:** Update rollup to newer version ([#407](https://github.com/cornerstonejs/cornerstone3D-beta/issues/407)) ([543675f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/543675f1269f8b739764291b1c27b40470c48c63))
- **adapters:** Update the build a little to allow debugging into typescript ([#439](https://github.com/cornerstonejs/cornerstone3D-beta/issues/439)) ([05e6419](https://github.com/cornerstonejs/cornerstone3D-beta/commit/05e6419e1a6705f40c367ac4b52c3975f6fd25c6))
- **adapter:** The rectangle encoding of SR ([#437](https://github.com/cornerstonejs/cornerstone3D-beta/issues/437)) ([bff23ec](https://github.com/cornerstonejs/cornerstone3D-beta/commit/bff23ecfe551312a1339211ddb7838993514a377))
- **add check for nullable numeric string vrs:** adds a check for nullable numeric strinv vrs ([#150](https://github.com/cornerstonejs/cornerstone3D-beta/issues/150)) ([75046c4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/75046c4e1b2830dd3a32dc8d6938f6def71940a5))
- Add coplanar check in stackImageSync callback ([#335](https://github.com/cornerstonejs/cornerstone3D-beta/issues/335)) ([f806177](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f806177d628664150b02e941c3a802b58bdc5293))
- add extra missing exports and no static code block at build ([#179](https://github.com/cornerstonejs/cornerstone3D-beta/issues/179)) ([dfdc4bf](https://github.com/cornerstonejs/cornerstone3D-beta/commit/dfdc4bfbf331da40368a4976f3dc199bd355864a))
- add getProperties method, rename voi to voiRange for clarity ([#194](https://github.com/cornerstonejs/cornerstone3D-beta/issues/194)) ([d0d861d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d0d861dbcc69df681540a7e37b60c6a5fa2caaa3))
- Add requestAnimationFrame handler for updating SVGs independently, stop re-rendering every viewport on crosshairs render ([#160](https://github.com/cornerstonejs/cornerstone3D-beta/issues/160)) ([8a84ead](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8a84eada90f0c383012e7ed29e6b618df463fe14))
- add src folder to package json to improve source maps ([#499](https://github.com/cornerstonejs/cornerstone3D-beta/issues/499)) ([aea4406](https://github.com/cornerstonejs/cornerstone3D-beta/commit/aea4406d4e8f1a415399481657373cd2d2d25523))
- Add storeAsInitialCamera parameter to StackViewport.setCamera ([#228](https://github.com/cornerstonejs/cornerstone3D-beta/issues/228)) ([b951acc](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b951acc2c893837d13ec78850e18b7d26dd32076))
- Add support for YBR_FULL_422 photometric interpretation ([#304](https://github.com/cornerstonejs/cornerstone3D-beta/issues/304)) ([2b57c08](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2b57c0876d77b5b04e1b3d339faa26f7f543f5b1))
- Address issues with CPU Flip ([#132](https://github.com/cornerstonejs/cornerstone3D-beta/issues/132)) ([62b2843](https://github.com/cornerstonejs/cornerstone3D-beta/commit/62b28430cb00fc90e212f1c9f3cb7f748dbadb84))
- Address issues with example deployment ([#357](https://github.com/cornerstonejs/cornerstone3D-beta/issues/357)) ([c29e738](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c29e738efe0aca7f5f25aacb42b791227e9e4e34))
- Address type issues preventing build from running ([#131](https://github.com/cornerstonejs/cornerstone3D-beta/issues/131)) ([81080c7](https://github.com/cornerstonejs/cornerstone3D-beta/commit/81080c719ea75cba7168165e5f733f4a7d6ec236))
- adjust canvas, not only off screen renderer on resize ([#279](https://github.com/cornerstonejs/cornerstone3D-beta/issues/279)) ([1959ac7](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1959ac7866305510855753f054678eac95e9c015))
- Allow synchronizers to work with Stack Viewports ([#192](https://github.com/cornerstonejs/cornerstone3D-beta/issues/192)) ([897573b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/897573be5188a2e7fd39e4f0f9fc4d587c868155))
- AngleTool not working after cancellation ([#342](https://github.com/cornerstonejs/cornerstone3D-beta/issues/342)) ([a82c0bc](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a82c0bc0e8beb6d47131ad2cd5040b93b02f2de9))
- annotation hidden on horizontal and vertical ([#205](https://github.com/cornerstonejs/cornerstone3D-beta/issues/205)) ([9e825fd](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9e825fd3d37ecfdf1722da9cd2fd6a1a75995459))
- annotation rendering engine on viewport removal ([#303](https://github.com/cornerstonejs/cornerstone3D-beta/issues/303)) ([aeb205e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/aeb205e56e0d2068258c278863aa3d7447331a43))
- annotation unit hydration bug and more color image support ([#151](https://github.com/cornerstonejs/cornerstone3D-beta/issues/151)) ([4f157dc](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4f157dc5d7a8d0d80abb5b68c35ed17cb5f349ed))
- annotations throwing error when stack and volume viewports are converted ([#195](https://github.com/cornerstonejs/cornerstone3D-beta/issues/195)) ([ed23f05](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ed23f05b23063769942328f9e6797d792767ec49))
- **annotations:** fix triggering of 'ANNOTATION_ADDED' event multiple times ([#570](https://github.com/cornerstonejs/cornerstone3D-beta/issues/570)) ([#584](https://github.com/cornerstonejs/cornerstone3D-beta/issues/584)) ([f8e75f3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f8e75f3d236da91c2710b4742ff2c2047e3e0e3c))
- **anonymizer:** [FIX & TESTS] cleanTags : check if param is undefined. Add 3 test ([#308](https://github.com/cornerstonejs/cornerstone3D-beta/issues/308)) ([44d23d6](https://github.com/cornerstonejs/cornerstone3D-beta/commit/44d23d6a9e347fcf049053129d4d7323a9258b71))
- ArrowAnnotateTool adapter in Cornerstone3D parsing label ([#270](https://github.com/cornerstonejs/cornerstone3D-beta/issues/270)) ([cb84979](https://github.com/cornerstonejs/cornerstone3D-beta/commit/cb84979be6eef8835cc7ced006625751a04356aa))
- **arrowTool:** trigger ANNOTATION_MODIFIED event on ArrowAnnotate Tool ([#610](https://github.com/cornerstonejs/cornerstone3D-beta/issues/610)) ([b67c3b8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b67c3b860196d0d54021d1652b5a128ad97a62d4))
- Attempt to fix build issues [@haehn](https://github.com/haehn) has reported ([#144](https://github.com/cornerstonejs/cornerstone3D-beta/issues/144)) ([2a7ec92](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2a7ec9271e012929682aa5c0a860cd65d0d5c02d))
- Attempt to resolve incompatible peerDeps situation ([#98](https://github.com/cornerstonejs/cornerstone3D-beta/issues/98)) ([00f141b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/00f141bfa9f9a4b37c016d726a6d31f2330e2e44))
- autoPan for synced viewports ([28197b3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/28197b36485b8de1e50623c25f336c199238a496))
- avoid using replaceAll() which isn't available in Node.js 14 ([#296](https://github.com/cornerstonejs/cornerstone3D-beta/issues/296)) ([7aac3ab](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7aac3ab05fdedfe1a7a159097690bec00c0bcd2b))
- bidirectional tool when short and long axis changes ([#309](https://github.com/cornerstonejs/cornerstone3D-beta/issues/309)) ([f973e72](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f973e7262897a2daf4f37363d3e818ae88620bb8))
- **binding:** fix this binding ([#521](https://github.com/cornerstonejs/cornerstone3D-beta/issues/521)) ([1d44728](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1d4472810313f55892e853e90d15c307d0e44130))
- broken export of getPTImageIdInstanceMetadata ([#259](https://github.com/cornerstonejs/cornerstone3D-beta/issues/259)) ([2943b7b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2943b7ba2be1d02af837916ab8126d1d239e11a2))
- bug in the setStartSlice logic ([4b670cd](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4b670cd9f7d10858f1d4baabdce6ee8b81f37b41))
- bug tolerance parameter was not propagated ([#241](https://github.com/cornerstonejs/cornerstone3D-beta/issues/241)) ([c2ed627](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c2ed6275ccb80fbbab3c0f9c67893d6b681b0bab))
- Bugs for labelmapIndex 0 conditionals, review comments ([b05eae5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b05eae590b4dee99d7cce1c0c9498a12b7f4faad))
- build error for tools ([8289521](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8289521800d2227b6796e1c191efee91b3b6d678))
- build errors for segmentation tools ([7973fa8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7973fa8b20bddcd1a7edf733785f213804be3349))
- Build issue caused by import changes ([#484](https://github.com/cornerstonejs/cornerstone3D-beta/issues/484)) ([d79cd58](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d79cd582843661cd8cb8c56fea55a9b1c68fd64b))
- **build:** adapters build missing files ([#400](https://github.com/cornerstonejs/cornerstone3D-beta/issues/400)) ([901dd88](https://github.com/cornerstonejs/cornerstone3D-beta/commit/901dd8815e121f29c50da0b1b9764d90d881114b))
- **build:** add build command back ([#413](https://github.com/cornerstonejs/cornerstone3D-beta/issues/413)) ([97ccd76](https://github.com/cornerstonejs/cornerstone3D-beta/commit/97ccd761700831368747bbfb05094dfb2b2579fb))
- **build:** Adding exports and files ([#398](https://github.com/cornerstonejs/cornerstone3D-beta/issues/398)) ([2e8101f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2e8101f229aa4c112405cb03558903956fc7e7f8))
- **build:** fixing publish of adapters in package json ([#396](https://github.com/cornerstonejs/cornerstone3D-beta/issues/396)) ([5a45b2f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/5a45b2f9ebeca9b800642d2735720a8d8400cd12))
- **build:** fixing test for dicom loader ([#414](https://github.com/cornerstonejs/cornerstone3D-beta/issues/414)) ([c41b443](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c41b443b7d11b67b25b47f189ba6fea9305a5ef1))
- **build:** Include adapters in circleci config ([#402](https://github.com/cornerstonejs/cornerstone3D-beta/issues/402)) ([45c8416](https://github.com/cornerstonejs/cornerstone3D-beta/commit/45c84167b40c6a48bb2c499b6153c200763778a0))
- **build:** prepublish for dicomImageLoader ([#415](https://github.com/cornerstonejs/cornerstone3D-beta/issues/415)) ([20589a1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/20589a1083a87505e26be85e2685a1cb621205fb))
- **build:** try to publish adapters ([#395](https://github.com/cornerstonejs/cornerstone3D-beta/issues/395)) ([191a17b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/191a17b690d2ac60ad98a4b8ecb8379a92638d67))
- **build:** update to build repo ([#410](https://github.com/cornerstonejs/cornerstone3D-beta/issues/410)) ([2f8def1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2f8def1ee3e296350bd965a8053b4e9d62214745))
- byteLength calculation ([#314](https://github.com/cornerstonejs/cornerstone3D-beta/issues/314)) ([743142b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/743142bde71a388538bc85c4a061a4c417a50020))
- cachedStatistics throttling and textBox rendering ([#329](https://github.com/cornerstonejs/cornerstone3D-beta/issues/329)) ([3f296ae](https://github.com/cornerstonejs/cornerstone3D-beta/commit/3f296ae86c89934dfdfc2107945fcba1e08db7df))
- **calibration:** Apply the calibration update only once ([#577](https://github.com/cornerstonejs/cornerstone3D-beta/issues/577)) ([0641930](https://github.com/cornerstonejs/cornerstone3D-beta/commit/06419303b5bf8901645f4c74bc25cb8eabf279c8))
- Camera events for flip and rotation changes ([#83](https://github.com/cornerstonejs/cornerstone3D-beta/issues/83)) ([82115ec](https://github.com/cornerstonejs/cornerstone3D-beta/commit/82115ec00bd924fb942473d04052473408b84eb7))
- camera position with new dynamic image data positoin ([34ad563](https://github.com/cornerstonejs/cornerstone3D-beta/commit/34ad563b7254ff08124555cc7796150de9e1981d))
- change package.json 'module' field to use '.js' extension from '.ts' ([#65](https://github.com/cornerstonejs/cornerstone3D-beta/issues/65)) ([42f66c2](https://github.com/cornerstonejs/cornerstone3D-beta/commit/42f66c2c8887467036c55b07d3a7041db467efab))
- checking the length before writing a DS and using exponential if ([#176](https://github.com/cornerstonejs/cornerstone3D-beta/issues/176)) ([601aa9e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/601aa9e8a6df26876b08da739451e538d46aa37b))
- **Circle and VolumeViewport:** fixes to ensure measurements are rendered properly ([#609](https://github.com/cornerstonejs/cornerstone3D-beta/issues/609)) ([293e6b1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/293e6b18e9d9306043aac8e23a5955b6e44fad0d))
- circleScissor bug that rendered the tool in other viewports ([a3b7e54](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a3b7e54fe868df1cc8cd95084b9facfdd7a6d9f0))
- cleanup exports, add docs and more tutorials ([#39](https://github.com/cornerstonejs/cornerstone3D-beta/issues/39)) ([743dea8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/743dea89c7a726c29d396756bdd991c81e561105))
- Cleanup magnify canvas on mouse up ([#135](https://github.com/cornerstonejs/cornerstone3D-beta/issues/135)) ([6fd0c3f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6fd0c3fe114586f9e7ac0ab1f448b6c5199d1f7a))
- **coding-scheme:** Fix coding scheme for updated standard ([ae3f0b5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ae3f0b5bcd398a4230c8fba2954e225fda97cc2f))
- colored images using rgba in CPU rendering [#338](https://github.com/cornerstonejs/cornerstone3D-beta/issues/338) ([#345](https://github.com/cornerstonejs/cornerstone3D-beta/issues/345)) ([90bcc7b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/90bcc7b5a8380adbc03af34f7c00c72795fe003c))
- **contour:** remove contour was using wrong uid ([#575](https://github.com/cornerstonejs/cornerstone3D-beta/issues/575)) ([a6892a5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a6892a5131dfdfecd5edeed6f9e633742bba2fb6))
- convert RGBA to RGB for GPU rendering if cached ([#152](https://github.com/cornerstonejs/cornerstone3D-beta/issues/152)) ([fb8aa36](https://github.com/cornerstonejs/cornerstone3D-beta/commit/fb8aa36374c4bdf06d9d6da1f2df128c68dbc7da))
- cornerstoneDemo is still a chafey repository ([4a18e45](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4a18e45fa6ee02cf6a21c93f9c3671c3ff0a7f3a))
- **cornerstone:** exceptions caused by undefined cached stats in adapters. Safe programming fix only ([#301](https://github.com/cornerstonejs/cornerstone3D-beta/issues/301)) ([893be43](https://github.com/cornerstonejs/cornerstone3D-beta/commit/893be433af05f11a03cfce0a572b448303b9334b))
- coronal view should not be flipped ([#321](https://github.com/cornerstonejs/cornerstone3D-beta/issues/321)) ([a85a867](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a85a86785de9f225154829a4934926143c86eb5e))
- Correct module property for ESM builds in package.json ([#66](https://github.com/cornerstonejs/cornerstone3D-beta/issues/66)) ([d53b857](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d53b8575aa8b93907f8bf127f36d9dfc10821478))
- CORS preflight for SharedArrayBuffer ([8ffc804](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8ffc804c2024b6155f199470ccd1851cc43bb4e3))
- could not access 'index' before initialization ([#337](https://github.com/cornerstonejs/cornerstone3D-beta/issues/337)) ([f4b7ff8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f4b7ff8a147a2fbebac3ae66d0b24f28c1910387))
- **cpu:** could not render if switched to cpu in the middle ([#615](https://github.com/cornerstonejs/cornerstone3D-beta/issues/615)) ([6b1d588](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6b1d588616dd7b7ab3358583414728a13225156a))
- Create CrosshairSpecificToolData interface ([204bae9](https://github.com/cornerstonejs/cornerstone3D-beta/commit/204bae9e0c2873bf8c88dddf43805744f01ae511))
- createImage fails if options are undefined (https://github.com/OHIF/Viewers/issues/2239) ([#353](https://github.com/cornerstonejs/cornerstone3D-beta/issues/353)) ([3cc6723](https://github.com/cornerstonejs/cornerstone3D-beta/commit/3cc6723c21e1f9bcf90f6f709b6339f2ac377ced))
- Crosshair and panTool for flipped viewport ([#159](https://github.com/cornerstonejs/cornerstone3D-beta/issues/159)) ([35152ea](https://github.com/cornerstonejs/cornerstone3D-beta/commit/35152ea1b7211f5e4fc2f5edb55bc5f8e70aa3d6))
- crosshairs for panned viewports after perf improvement ([3066198](https://github.com/cornerstonejs/cornerstone3D-beta/commit/306619874f647e16e97a88bc79ee234236a16f34))
- Crosshairs slabThickness not rendering in other viewports ([d4b9147](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d4b9147ceddacdb302a4e87022e0bcf90ad87250))
- **crosshairs:** Autopan causing infinite loop ([#551](https://github.com/cornerstonejs/cornerstone3D-beta/issues/551)) ([e54dfb3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e54dfb32d24af0f504768976eaa80a84fcfc6af0))
- **Crosshairs:** imageNeedsUpdate should be default false ([dd34d6d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/dd34d6de4540b14bf9119f46e04d73c73bc01e44))
- **crosshairs:** Reference lines are wrongly clipped ([#552](https://github.com/cornerstonejs/cornerstone3D-beta/issues/552)) ([0bc2134](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0bc2134754762c61b72824943c506be7396887b8))
- **cs:** [#318](https://github.com/cornerstonejs/cornerstone3D-beta/issues/318) - check instance's NumberOfFrames property to see if it is a multi-frame file or not ([#320](https://github.com/cornerstonejs/cornerstone3D-beta/issues/320)) ([0b030a4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0b030a45dd48f22a61a90dfe5bbb5848425960ca))
- **cs:** Resolves [#316](https://github.com/cornerstonejs/cornerstone3D-beta/issues/316) Cornerstone3D adaptor - Multiframe support - add "frameNumber" to the Annotation.data ([#317](https://github.com/cornerstonejs/cornerstone3D-beta/issues/317)) ([5fe862e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/5fe862e22653d30bfc78e5be5de3669610887727))
- **dcmjs:** Add a set of accessors to the sequence list so the API is more consistent ([#224](https://github.com/cornerstonejs/cornerstone3D-beta/issues/224)) ([9dad6c5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9dad6c549cb4dd5c351caa13386998cbe48a1ba6))
- decodeConfig was passed incorrectly to decode ([#502](https://github.com/cornerstonejs/cornerstone3D-beta/issues/502)) ([ed4de89](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ed4de89923ffcd026d3f0bf1abb6a1def9bb74ce))
- default voi for volumes and webLoader ([#171](https://github.com/cornerstonejs/cornerstone3D-beta/issues/171)) ([81f07a6](https://github.com/cornerstonejs/cornerstone3D-beta/commit/81f07a6f9d2a27d9cd6bb78c7ee65d6ac4456724))
- **demoData:** The URL was pointing to a private AWS account ([#175](https://github.com/cornerstonejs/cornerstone3D-beta/issues/175)) ([69dafea](https://github.com/cornerstonejs/cornerstone3D-beta/commit/69dafea902dcd224ea5d1d6d418d5e0c1cec2fe0))
- demos toolGroups should use toolOptions instead of tools ([4a39ad0](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4a39ad0f434a077d90465bc259ca2950ee09e115))
- dicom tag for series and studyUID ([#444](https://github.com/cornerstonejs/cornerstone3D-beta/issues/444)) ([6865c70](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6865c7081d0e473b0d960e382c6b9ea35a225c21))
- **dicomLoader:** data type view after scaling ([#463](https://github.com/cornerstonejs/cornerstone3D-beta/issues/463)) ([af1ba2e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/af1ba2e6dedb666ea0881161655e50187d2d1e5e))
- **DicomMessage:** Fix readFile after options were added ([c2b62a1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c2b62a13b3afc78516f39b906ca7576537037c20))
- do deep check when adding sources/targets to synchronizers ([#193](https://github.com/cornerstonejs/cornerstone3D-beta/issues/193)) ([920d317](https://github.com/cornerstonejs/cornerstone3D-beta/commit/920d317b3f57483f2a746bf2690e22fc7938a437))
- docs on netlify ([#183](https://github.com/cornerstonejs/cornerstone3D-beta/issues/183)) ([8b2c4a8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8b2c4a8acbccf41daf86c00315fa43d329caa4ff))
- don't reset display pipeline when spacing is missing ([#301](https://github.com/cornerstonejs/cornerstone3D-beta/issues/301)) ([e12fcf3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e12fcf3c361db0f927fd5fdd448686fef8893b36))
- Double click and multi-key bindings ([#571](https://github.com/cornerstonejs/cornerstone3D-beta/issues/571)) ([ebc0cf8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ebc0cf8f8164070e67bdfc09fc13a58c64a7d1c1))
- **doubleClick:** mouseDoubleClickIgnoreListener is now added to each viewport element instead of the document element ([#429](https://github.com/cornerstonejs/cornerstone3D-beta/issues/429)) ([360e2a9](https://github.com/cornerstonejs/cornerstone3D-beta/commit/360e2a9fa2efa690d2e4baec424699a6c66af4a2)), closes [#375](https://github.com/cornerstonejs/cornerstone3D-beta/issues/375)
- **doubleClick:** moved the mouse click/down timeout detection back into ([#417](https://github.com/cornerstonejs/cornerstone3D-beta/issues/417)) ([99eea67](https://github.com/cornerstonejs/cornerstone3D-beta/commit/99eea6795b4ded35d9fd9549e7208ce8c09a9ada))
- **doubleClick:** moved the mouse click/down timeout detection into \_doMouseDown ([#416](https://github.com/cornerstonejs/cornerstone3D-beta/issues/416)) ([ebd8f7b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ebd8f7b1aa2c311a6172e360d24a23ad256c5e24))
- drag probe appearing unnecessarily on all viewports ([#204](https://github.com/cornerstonejs/cornerstone3D-beta/issues/204)) ([c292c05](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c292c05eecf17a6edbdcab5aa5a604304ef3d2e5))
- Duplicate import of Types after rebase ([#343](https://github.com/cornerstonejs/cornerstone3D-beta/issues/343)) ([ca41c43](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ca41c4325edb20315d3b554b2836a80289ba5e32))
- elliptical roi and eventTarget ([#325](https://github.com/cornerstonejs/cornerstone3D-beta/issues/325)) ([8132153](https://github.com/cornerstonejs/cornerstone3D-beta/commit/81321536286648b2baf4a44e85cbff01a7698fed))
- Elliptical roi when in flipped/rotated state ([#479](https://github.com/cornerstonejs/cornerstone3D-beta/issues/479)) ([f0961ae](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f0961ae6f5e912230f2bf17be5acfe30f775bcae))
- **encoding:** encapsulation is applied for only PixelData ([#199](https://github.com/cornerstonejs/cornerstone3D-beta/issues/199)) ([ede2950](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ede2950d530fb189bb5817db6b5285e2be74ffee)), closes [#194](https://github.com/cornerstonejs/cornerstone3D-beta/issues/194)
- Enhance rendering performance by setting VTK Renderer's draw=true only for viewports that need to be rendered ([#226](https://github.com/cornerstonejs/cornerstone3D-beta/issues/226)) ([3e208f1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/3e208f11556e80c7ca53f76ef20c87613d57c989))
- Ensure d3 packages are also listed on dependencies ([#146](https://github.com/cornerstonejs/cornerstone3D-beta/issues/146)) ([5747dc6](https://github.com/cornerstonejs/cornerstone3D-beta/commit/5747dc6cbcb05eec690bf636ef733789c88f959f))
- Ensure DS and IS Value Representations are returned as arrays ([#83](https://github.com/cornerstonejs/cornerstone3D-beta/issues/83)) ([a264661](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a264661d5a0a899b761c58492955f6d18cc03a4d))
- Event triggering on Pet SUVPeak tool ([a9aba56](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a9aba5692d2c5da42a02c6e9a78f68014f0e2a5d))
- examples were using wrong image loader ([#173](https://github.com/cornerstonejs/cornerstone3D-beta/issues/173)) ([b07a07a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b07a07a80812b8d4af4acae26d58b445cf69ed2d))
- exception writing NaN and Infinity values of FD tags ([#325](https://github.com/cornerstonejs/cornerstone3D-beta/issues/325)) ([e86daaa](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e86daaad4c47e7ec2c135b94f0b0de622de69310))
- **exception:** js exception when setting invertRgbTransferFunction. safe program… ([#595](https://github.com/cornerstonejs/cornerstone3D-beta/issues/595)) ([4ab5d1e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4ab5d1e5e0c448065d4e7637afe40ce43d7e593c))
- Export loglevelnext logger as dcmjs.log for configuration ([#156](https://github.com/cornerstonejs/cornerstone3D-beta/issues/156)) ([33515e5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/33515e5fe3f581d71278674860834ee1ea932faa))
- extract IRenderingEngine type, docs: add documentation search ([#70](https://github.com/cornerstonejs/cornerstone3D-beta/issues/70)) ([6a705a8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6a705a8f3cb9e8463c0ab6fe4d59dd3bb8bf5ef2))
- failed tests after rebase ([#344](https://github.com/cornerstonejs/cornerstone3D-beta/issues/344)) ([b660e3f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b660e3f154f377ed07646c4e7cd0318500455d69))
- filter planarFreeHandeROI based on parallel normals instead of equal normals. ([#315](https://github.com/cornerstonejs/cornerstone3D-beta/issues/315)) ([70e4ffa](https://github.com/cornerstonejs/cornerstone3D-beta/commit/70e4ffa0c28ed293473c6674d7b158c644f9b1be))
- Fix event for camera modified firing with wrong values ([#133](https://github.com/cornerstonejs/cornerstone3D-beta/issues/133)) ([f16f994](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f16f9947902a104568cb4a7be75c0d19dd4a0715))
- Fix resize behaviour after devicePixelRatio changes ([#131](https://github.com/cornerstonejs/cornerstone3D-beta/issues/131)) ([2e9d686](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2e9d686d83e4a529cd71f1b4d0ea19e1137cee3a))
- Fix UN & AT VR processing logic ([#167](https://github.com/cornerstonejs/cornerstone3D-beta/issues/167)) ([#168](https://github.com/cornerstonejs/cornerstone3D-beta/issues/168)) ([7cb975a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7cb975af106d2e3e943881a7dac06f1fe391809c))
- fixes the memory leak for volumes ([#253](https://github.com/cornerstonejs/cornerstone3D-beta/issues/253)) ([c863126](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c863126fc1df3fa989e15da1a7eae43cf94b24d0))
- floodFill export in tools ([#362](https://github.com/cornerstonejs/cornerstone3D-beta/issues/362)) ([700baa3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/700baa349f59c12b4a10979b580ee3afd9637f9e))
- force a release for commit caaac4b ([#240](https://github.com/cornerstonejs/cornerstone3D-beta/issues/240)) ([f53b630](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f53b6306ce138c5ad3106015c4751b63fbcca362))
- **fragment:** Refactor and fragment bug ([#283](https://github.com/cornerstonejs/cornerstone3D-beta/issues/283)) ([307d60a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/307d60a6ffecf7d96bc729a37a45775c6b6e189c)), closes [#282](https://github.com/cornerstonejs/cornerstone3D-beta/issues/282)
- **fragment:** write padding to even length on final fragments of encapsulated frame data ([#294](https://github.com/cornerstonejs/cornerstone3D-beta/issues/294)) ([34b7561](https://github.com/cornerstonejs/cornerstone3D-beta/commit/34b7561fa48870a87b948eb427d4e32808b4d40e)), closes [#293](https://github.com/cornerstonejs/cornerstone3D-beta/issues/293)
- get correct imageData with targetId in BaseTool ([#294](https://github.com/cornerstonejs/cornerstone3D-beta/issues/294)) ([6e8e51b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6e8e51b4b3dde358134fcc7493237a59bec687ab))
- getEnabledElement when no viewports found ([f826193](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f82619358ead0ca06914f540b932abd0b9dd8e4d))
- getVolumeWithImageId if volume does not have image Ids ([be9d7af](https://github.com/cornerstonejs/cornerstone3D-beta/commit/be9d7af0b144f7c11d318f277effd077c21aec9a))
- github links from API Docs ([#143](https://github.com/cornerstonejs/cornerstone3D-beta/issues/143)) ([dc4e6f1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/dc4e6f1346b7af4c91faab8be73c5f054796a439))
- Handle cases where row and column cosines are missing ([#139](https://github.com/cornerstonejs/cornerstone3D-beta/issues/139)) ([5bd0a70](https://github.com/cornerstonejs/cornerstone3D-beta/commit/5bd0a7062adf7efd4654b20b6f4c8daed236a2db))
- htj2k and keymodifier ([#313](https://github.com/cornerstonejs/cornerstone3D-beta/issues/313)) ([48bd8a1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/48bd8a14b81e31cba9f3237b0b68b7082bd66892))
- HTML element cleanup for each test ([#348](https://github.com/cornerstonejs/cornerstone3D-beta/issues/348)) ([477eebe](https://github.com/cornerstonejs/cornerstone3D-beta/commit/477eebe4829594be898d5c338f3d5f044ba7712f))
- **idc-02252:** typo + release ([#180](https://github.com/cornerstonejs/cornerstone3D-beta/issues/180)) ([3f5cb24](https://github.com/cornerstonejs/cornerstone3D-beta/commit/3f5cb24fd0e50668d36dc21390a1ff527505a8db))
- If planar annotation is not visible, filter it ([#318](https://github.com/cornerstonejs/cornerstone3D-beta/issues/318)) ([ea8e32a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ea8e32a768d3f2d43fc0f1bc9b29388101825ad2))
- **image-comments:** Move ImageComments to DerivedPixels ([da11200](https://github.com/cornerstonejs/cornerstone3D-beta/commit/da112001e3c1c01b30acbd634fd9b2f46a9d3a63))
- imageRetrievalPoolManager should also use addToBeginning ([#402](https://github.com/cornerstonejs/cornerstone3D-beta/issues/402)) ([5bd9945](https://github.com/cornerstonejs/cornerstone3D-beta/commit/5bd994527c67c3625f18e450fe6018e2c71d64ca))
- import bug for example page ([#373](https://github.com/cornerstonejs/cornerstone3D-beta/issues/373)) ([32e2718](https://github.com/cornerstonejs/cornerstone3D-beta/commit/32e27183d243d58dd9ca3aa561b7f2af23d80c62))
- **import:** missing import for addAccessors ([#295](https://github.com/cornerstonejs/cornerstone3D-beta/issues/295)) ([6b631b6](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6b631b6c8bdb2a7a70637308c9ebfe849fe9ccaf))
- improvements for usage of targetBuffer, add convertFloatPixelDataToInt flag (default true) ([1f58326](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1f583264303668e820f61cf1bb2351f03e16de1d))
- infinite loop on dcm with no meta length ([#331](https://github.com/cornerstonejs/cornerstone3D-beta/issues/331)) ([51b156b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/51b156bf1278fc0f9476de70c89697576c0f4b55))
- **init:** should only check gl context and not extensions ([#544](https://github.com/cornerstonejs/cornerstone3D-beta/issues/544)) ([be8b9cd](https://github.com/cornerstonejs/cornerstone3D-beta/commit/be8b9cddb4166a3bb2258953c4aedffc4ccd0e33))
- invalid keybindings Alt and Ctrl ([#176](https://github.com/cornerstonejs/cornerstone3D-beta/issues/176)) ([d74d696](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d74d696b5de5fe1cd1fb6d36a32660c60140caa0))
- Invalid VR of the private creator tag of the "Implicit VR Endian" typed DICOM file ([#242](https://github.com/cornerstonejs/cornerstone3D-beta/issues/242)) ([#243](https://github.com/cornerstonejs/cornerstone3D-beta/issues/243)) ([6d0552f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6d0552fb96c59dcf3e39b3306a50004b24128330))
- **invalidated stack:** GPU rendering - inheriting voiRange when recreating the default actor ([#598](https://github.com/cornerstonejs/cornerstone3D-beta/issues/598)) ([457746a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/457746ae9b25cc95dcc048269ee46277aac97b1f))
- invalidating the data for RoiStartEndThreshold ([cd1535d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/cd1535d77dd2fe551fa8e0fab0a4ac2bd16c38dc))
- issues in binary tag parsing ([#276](https://github.com/cornerstonejs/cornerstone3D-beta/issues/276)) ([60c3af1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/60c3af1654b8f64baea1cd47f1049fd16ea2fee8))
- js exception prevention - safe programming only ([#600](https://github.com/cornerstonejs/cornerstone3D-beta/issues/600)) ([bbd2ff4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/bbd2ff4ab8cc9ac13f4b98f5cf589d6ff83b5eb3))
- jumpToSlice and scaling of images in renderToCanvas ([#78](https://github.com/cornerstonejs/cornerstone3D-beta/issues/78)) ([bbebf7f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/bbebf7fbad28e670333783cd669e571ec2ae7358))
- labelmap only update cfun when needed ([f0f96de](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f0f96de545074d5e6b2fce69d98733e9a612ef1a))
- large image rendering, missing metadata for StackViewport, high DPI devices ([#127](https://github.com/cornerstonejs/cornerstone3D-beta/issues/127)) ([d4bf1c8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d4bf1c80391bcecaee64d9eb086416c42aa406e2))
- limit disabled element not need to render for annotations ([#289](https://github.com/cornerstonejs/cornerstone3D-beta/issues/289)) ([8232ed0](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8232ed00ee42ab3fd837ab2c5a75b2128c8f87a6))
- lines of ref cropping for crosshairs ([#338](https://github.com/cornerstonejs/cornerstone3D-beta/issues/338)) ([f095a49](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f095a49f15655cb7e4e3ba232e91849d209ee367))
- **loading order:** reversed time points requests otherwise it would load from last to first ([#522](https://github.com/cornerstonejs/cornerstone3D-beta/issues/522)) ([c5acf45](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c5acf452bd533931dfe52c9a560cd548fa205672))
- make typescript strict true ([#162](https://github.com/cornerstonejs/cornerstone3D-beta/issues/162)) ([7c311f7](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7c311f77f0532372ae82b6be2027bcd25925fa0d))
- **measurement-report:** Fix issues with Measurement Report for Bidirectional measurements ([25cf222](https://github.com/cornerstonejs/cornerstone3D-beta/commit/25cf222e9d80bbe5b68854362383ac4fcaec7f6c))
- **measurement-report:** Fix ReferencedFrameNumber usage in MeasurementReport ([b80cd2a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b80cd2af070d0280295e88ee24d7e4d43c4af861))
- mediaType to avoid preflight requests ([#419](https://github.com/cornerstonejs/cornerstone3D-beta/issues/419)) ([90662ec](https://github.com/cornerstonejs/cornerstone3D-beta/commit/90662ecd68bda22cc0ab60bc4f8fef1b03433d9a))
- **memory:** memory leak on deletion ([#531](https://github.com/cornerstonejs/cornerstone3D-beta/issues/531)) ([5788300](https://github.com/cornerstonejs/cornerstone3D-beta/commit/578830013cb7b9474166dfe1f469f7908b39aabe))
- missing bind for the callLoadImage function ([#380](https://github.com/cornerstonejs/cornerstone3D-beta/issues/380)) ([fd96060](https://github.com/cornerstonejs/cornerstone3D-beta/commit/fd96060f3bc1e62bc73b22db0973c84513f1e9d9))
- **mobile:** Crosshairs highlighted for mobile ([#493](https://github.com/cornerstonejs/cornerstone3D-beta/issues/493)) ([22309aa](https://github.com/cornerstonejs/cornerstone3D-beta/commit/22309aa2519d4c543ad28920d6ff82906cc8af1c))
- monochrome1 bug for stackviewport ([#378](https://github.com/cornerstonejs/cornerstone3D-beta/issues/378)) ([f542d9c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f542d9ce8bd755f87aa6b316c56001a253d591ae))
- mouse-up should not unhighlight annotations ([#305](https://github.com/cornerstonejs/cornerstone3D-beta/issues/305)) ([0ca9653](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0ca96533d253c35534c9820e4174b54270483d5e))
- **mouse:** Avoid the delay on double click checking for right click ([#560](https://github.com/cornerstonejs/cornerstone3D-beta/issues/560)) ([2c86500](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2c8650001e19355bf856e8e475121bbd99feb18d))
- **multiframe:** fix frameNumber for pixelData and windowlevel issue ([#603](https://github.com/cornerstonejs/cornerstone3D-beta/issues/603)) ([6bf51b1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6bf51b148bbff008bf0bc63b8de4fa375eaad625))
- Name collision on CHANGELOG.md ([#412](https://github.com/cornerstonejs/cornerstone3D-beta/issues/412)) ([aa85c22](https://github.com/cornerstonejs/cornerstone3D-beta/commit/aa85c22dad168c741d3ed4b8b6730792b3ce6255))
- **naturalize:** revert single element sequence ([#223](https://github.com/cornerstonejs/cornerstone3D-beta/issues/223)) ([0743ed3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0743ed34f657b622d4868fe5db37015ad1aa7850))
- **naturalizing:** Fix the exception on naturalize twice ([#237](https://github.com/cornerstonejs/cornerstone3D-beta/issues/237)) ([abced98](https://github.com/cornerstonejs/cornerstone3D-beta/commit/abced980dccbabce7c4b159600f89c25ba747076))
- no need for wadors header provider in the demo ([#356](https://github.com/cornerstonejs/cornerstone3D-beta/issues/356)) ([92891cf](https://github.com/cornerstonejs/cornerstone3D-beta/commit/92891cf4fd8f502b1dd0908702e46fb3556bacd7))
- null ref error for getLuts from metadata ([edbfa91](https://github.com/cornerstonejs/cornerstone3D-beta/commit/edbfa9128ed030cec55b2575aa3f868fa758a6c8)), closes [#269](https://github.com/cornerstonejs/cornerstone3D-beta/issues/269)
- Only fire STACK_NEW_IMAGE event after we are certain this image will be displayed ([#72](https://github.com/cornerstonejs/cornerstone3D-beta/issues/72)) ([bfb8b91](https://github.com/cornerstonejs/cornerstone3D-beta/commit/bfb8b91baafb3bd342239ab9f1c4da0a1bfdf12a))
- Only rerender scenes containing volumes that are currently loading. Stop checking currentInput to decide when to rebuild shader ([#54](https://github.com/cornerstonejs/cornerstone3D-beta/issues/54)) ([59d9777](https://github.com/cornerstonejs/cornerstone3D-beta/commit/59d9777a917f7586529e8b608a8b44086298f242))
- **parsing:** can't read an encapsulated frame whose size is greater than fragment size ([#205](https://github.com/cornerstonejs/cornerstone3D-beta/issues/205)) ([176875d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/176875d0c9c34704302512d2c27103db205b1c8f)), closes [#204](https://github.com/cornerstonejs/cornerstone3D-beta/issues/204)
- passive tools stealing non-primary mousedowns ([#80](https://github.com/cornerstonejs/cornerstone3D-beta/issues/80)) ([a325a69](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a325a692618c998f9fa2052fdfc5ca5dad5d408f))
- PetThreshold mouse cursor ([#221](https://github.com/cornerstonejs/cornerstone3D-beta/issues/221)) ([2fb251d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2fb251d4cfabe2f5bae9c9139711f39be14fe2c0))
- Pixel data array was the wrong length for color images ([#138](https://github.com/cornerstonejs/cornerstone3D-beta/issues/138)) ([e42419d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e42419d0f7be45ff0ba87cb51502017b53687171))
- **planarFreehandROITool:** proper handling of pure movements on y-axis ([#590](https://github.com/cornerstonejs/cornerstone3D-beta/issues/590)) ([33635fa](https://github.com/cornerstonejs/cornerstone3D-beta/commit/33635fad566ccbb9c5b0441957726c11aab80901))
- pointInSphere bug for segmentation ([5a645f5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/5a645f5b075d51c8dca5a273f5bccc653085a778))
- prevent karma grabbing the wrong files for tests ([9e4c75d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9e4c75da26a6054113356ee88371c283c171f3ed))
- public path for dynamically imported codecs / worker ([#398](https://github.com/cornerstonejs/cornerstone3D-beta/issues/398)) ([2b2bd58](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2b2bd586818073d417187b4c2cc1898e05fb219b))
- publicPath to auto ([#399](https://github.com/cornerstonejs/cornerstone3D-beta/issues/399)) ([d9275b5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d9275b5e3414db68b875bb93b7f8ac913496c7f6))
- Re IDC [#2761](https://github.com/cornerstonejs/cornerstone3D-beta/issues/2761) fix loading of segmentations ([#258](https://github.com/cornerstonejs/cornerstone3D-beta/issues/258)) ([ceaf09a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ceaf09af74f5727205e5d5869c97114b2c283ae5))
- RectangleRoiStartEnd bug for imageId calculation ([9547ecd](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9547ecdb6a58e129f041881b8b2989c95e842a9d))
- RectangleRoiStartEnd performance improvements ([faa777a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/faa777a178704e9151aab97ac4ee995ad9c24e4e))
- reference line exports and add cpu demo ([#297](https://github.com/cornerstonejs/cornerstone3D-beta/issues/297)) ([e20d0b2](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e20d0b25c5ff0aafab4fa541b38815b4bee412b2))
- Remove explicit server-side transcoding ([#357](https://github.com/cornerstonejs/cornerstone3D-beta/issues/357)) ([#359](https://github.com/cornerstonejs/cornerstone3D-beta/issues/359)) ([88e373b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/88e373bb9a9a0d4a3ab35bdcf184afe2642bb3cc))
- Remove resemblejs from dependencies, add detect-gpu, clonedeep, CWIL ([#73](https://github.com/cornerstonejs/cornerstone3D-beta/issues/73)) ([db65d50](https://github.com/cornerstonejs/cornerstone3D-beta/commit/db65d50a5c7488f323ab2424cf9d750055b2e6d5))
- remove the need for slabThickness in volumeAPI for tools ([#113](https://github.com/cornerstonejs/cornerstone3D-beta/issues/113)) ([a5e431d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a5e431dee952281be340994aa773a593a85fad04))
- remove the need for volumeUID to be passed in the configuration ([#337](https://github.com/cornerstonejs/cornerstone3D-beta/issues/337)) ([301d3ab](https://github.com/cornerstonejs/cornerstone3D-beta/commit/301d3ab61a4a29851f51f905dc6a94d20f6eae6a))
- Remove unnecessary check for metadata, because sometimes metadata may be coming from an outside provider ([#320](https://github.com/cornerstonejs/cornerstone3D-beta/issues/320)) ([be1b4e6](https://github.com/cornerstonejs/cornerstone3D-beta/commit/be1b4e6f8aafd9d8c541335052724240924acd6e))
- remove unnecessary logging ([#427](https://github.com/cornerstonejs/cornerstone3D-beta/issues/427)) ([a200edd](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a200edd17272219d8686c49f032802933e98fb0d))
- removed unnecessary files from repo ([#324](https://github.com/cornerstonejs/cornerstone3D-beta/issues/324)) ([48f432e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/48f432e72323567a13083cb274d65e56b3442635))
- rename ArrowTool to ArrowAnnotate ([#91](https://github.com/cornerstonejs/cornerstone3D-beta/issues/91)) ([9bd0cd8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9bd0cd882746df909ee76549bc9818834ccc2ee3))
- Renaming SUV PET scaling parameter to include suvbw (SUV Body Weight) ([#374](https://github.com/cornerstonejs/cornerstone3D-beta/issues/374)) ([821dc03](https://github.com/cornerstonejs/cornerstone3D-beta/commit/821dc0364e7cb674184dcb7231a8677d9215b63f))
- rendering of palette color for no useRGB flag ([#459](https://github.com/cornerstonejs/cornerstone3D-beta/issues/459)) ([60f8e84](https://github.com/cornerstonejs/cornerstone3D-beta/commit/60f8e84ffc9d751fd0b30923174289ffdd3c9dad))
- renderingEngine and ellipticalTool ([ccd62a7](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ccd62a79f8ea4f6f5d8f6ef56e4b3a6d552fabb6))
- **rendering:** should still use Float32 when not 16 bit for scaling issues ([#501](https://github.com/cornerstonejs/cornerstone3D-beta/issues/501)) ([448baf2](https://github.com/cornerstonejs/cornerstone3D-beta/commit/448baf2086ef28b8eedc90ab46e0fee54cf7ac9e))
- renderToCanvas to use CPU rendering ([#74](https://github.com/cornerstonejs/cornerstone3D-beta/issues/74)) ([97ba32f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/97ba32f629376960f45bfbc3f22552476f934198))
- **renderToCanvas:** device pixel ratio should get included as well ([#604](https://github.com/cornerstonejs/cornerstone3D-beta/issues/604)) ([249957f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/249957fbd91225882ac28e05c27e2bd27b51662e))
- Reset requestAnimationFrame flags ([#247](https://github.com/cornerstonejs/cornerstone3D-beta/issues/247)) ([f727dbb](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f727dbbf8bb661c9b40edfd85cd511924c06401b))
- resetCamera and annotations for flipped viewports ([#278](https://github.com/cornerstonejs/cornerstone3D-beta/issues/278)) ([cabefce](https://github.com/cornerstonejs/cornerstone3D-beta/commit/cabefcefcba463abb1ea9bf346a2f755b2494aed))
- resetCamera should reset the rotation as well ([#236](https://github.com/cornerstonejs/cornerstone3D-beta/issues/236)) ([a347c93](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a347c9338252fb3843737b605d610f2d51b2c547))
- resetPan option in resetCamera was ignored for PolyData ([#125](https://github.com/cornerstonejs/cornerstone3D-beta/issues/125)) ([5f4f36d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/5f4f36df1e70f25b379fccef7c08b86f8c80f3dc))
- Resizing off-screen canvas was broken due to devicePixelRatio ([#134](https://github.com/cornerstonejs/cornerstone3D-beta/issues/134)) ([7b8ac34](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7b8ac340f4708d8b0d99951d2fa4e2c996514968))
- Resolves error for voiLutModule if undefined ([#283](https://github.com/cornerstonejs/cornerstone3D-beta/issues/283)) ([cb5ee8f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/cb5ee8fdebc7d6c7cf97b952061021f93046ad20))
- revert change to webpack, it causes shader loader issues in dev ([f1d8fc6](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f1d8fc6610956b23d99965612ce7630aec09d676))
- revert synchronizer event firing being unnecessary async ([#299](https://github.com/cornerstonejs/cornerstone3D-beta/issues/299)) ([1e244d1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1e244d11778d74b66df671f936138c73adb5a699))
- revert the stack viewport setting of targetImageIndex ([#192](https://github.com/cornerstonejs/cornerstone3D-beta/issues/192)) ([0cf057e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0cf057ee45a7b154ecd5ac067c719ac52403f382))
- rework decode config to be passed to the workers ([#503](https://github.com/cornerstonejs/cornerstone3D-beta/issues/503)) ([e4e2be3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e4e2be3d01bc9998b5749f7645c55a1952161f4a))
- **rgba:** Handle rgba to rgb conversion based on length ([#220](https://github.com/cornerstonejs/cornerstone3D-beta/issues/220)) ([d56dd8a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d56dd8a7b23579f2a87cd3487b6b73b40a89648b))
- RoiThresholdManual now projects in the direction of projection ([8e09a84](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8e09a848b4bc4155f8fad9ef1b6e6d7ed8a92fd8))
- scale factor for zoom in perspective mode and do not update clipping planes for non Volume Actors ([#116](https://github.com/cornerstonejs/cornerstone3D-beta/issues/116)) ([ce8c13e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ce8c13e534a48392fc11dcb615d8d81275cd01d7))
- scale image for Volume if already cached in stack ([9a03a15](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9a03a1561aa659de5965b08c08afed46b57f0800))
- scaling metadata should be derived from providers ([#464](https://github.com/cornerstonejs/cornerstone3D-beta/issues/464)) ([abb0892](https://github.com/cornerstonejs/cornerstone3D-beta/commit/abb08921f46fc3e1d946b0a0a5782bcbe8c3a10f))
- **scroll:** Scrolling failed to find the volume with segmentation ([#470](https://github.com/cornerstonejs/cornerstone3D-beta/issues/470)) ([79b8c96](https://github.com/cornerstonejs/cornerstone3D-beta/commit/79b8c96f111563dd0850f72d89e7c43e8b0cbd5c))
- **scroll:** was not able to scroll back ([#593](https://github.com/cornerstonejs/cornerstone3D-beta/issues/593)) ([f934e21](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f934e21769655ea82b9cdc0cf1f34a40a5d87d82))
- segmentation remove bug which removed other segs ([4d6c83b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4d6c83b3835c205a51bae5e91c945da83c11b970))
- Segmentation slice range is wrong when nearly orthonormal as well as for segmentation volumes ([#511](https://github.com/cornerstonejs/cornerstone3D-beta/issues/511)) ([cd232e3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/cd232e38d7635693a4757598a1cd5e3dfe59cbf4))
- **Segmentation_4X:** Update tag name in getSegmentIndex method for segs ([#183](https://github.com/cornerstonejs/cornerstone3D-beta/issues/183)) ([1e96ee3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1e96ee3ce3280900d56f1887da81471f9b128d30))
- **segmentation:** Do not render inapplicable segmentations ([#545](https://github.com/cornerstonejs/cornerstone3D-beta/issues/545)) ([1b9d28c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1b9d28c0de1ccec5b517ff816488571ae1602adc))
- **segmentation:** segmentation could not render segment while invisible ([#477](https://github.com/cornerstonejs/cornerstone3D-beta/issues/477)) ([199b139](https://github.com/cornerstonejs/cornerstone3D-beta/commit/199b1390f367c42b49c1a7ba01ab0f176d0789f4))
- **segmentationVisibility:** Improve performance for `getSegmentationIndices` ([#556](https://github.com/cornerstonejs/cornerstone3D-beta/issues/556)) ([c02d31c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c02d31c739a2b319a5c815bda404a12dcba65bd1))
- **segmentColor:** should be able to change initial segment color for render ([#535](https://github.com/cornerstonejs/cornerstone3D-beta/issues/535)) ([0a81736](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0a8173671315eff3bf2b52d079cde9a604208fa1))
- **seg:** Use ReferencedSegmentNumber in shared fg ([#166](https://github.com/cornerstonejs/cornerstone3D-beta/issues/166)) ([0ed3347](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0ed33477bb1c13b05d682c342edaf0a901fe0f7a))
- selection API, requestPoolManager and VOI and Scaling ([#82](https://github.com/cornerstonejs/cornerstone3D-beta/issues/82)) ([bedd8dd](https://github.com/cornerstonejs/cornerstone3D-beta/commit/bedd8ddfa356c2d52a6e72f74c7cb3bb660a86ef))
- setToolActive with no options ([9f1002d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9f1002dccd85a99b16fff8e2e999c0af21c2f4dc))
- setToolPassive should not override other bindings ([0a3b3d0](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0a3b3d088368b060e9ff0ee1526ef8eb8164fde1))
- several issues with character set handling ([#299](https://github.com/cornerstonejs/cornerstone3D-beta/issues/299)) ([8e22107](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8e221074179b6d33b82ab5c6f1ae4c06c5522d6b))
- shadow for annotations and stack viewport targetImageIdIndex bug ([#189](https://github.com/cornerstonejs/cornerstone3D-beta/issues/189)) ([be70be7](https://github.com/cornerstonejs/cornerstone3D-beta/commit/be70be70a543fffb18f7d05c69e16d5c0255a57e))
- Size In Bytes should take into account default use of Float32 ([#288](https://github.com/cornerstonejs/cornerstone3D-beta/issues/288)) ([6374316](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6374316c01dacf8f1f229310e753eb6510dcb480))
- **SliceRange:** slice range for oblique image ([#408](https://github.com/cornerstonejs/cornerstone3D-beta/issues/408)) ([7138372](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7138372b185b5d7c2cc76a8e2b257a94e1751f42))
- Sphere implementation in world is no working ([6afc734](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6afc734407433dc03b0ef9caa9e6d71a809ec8d9))
- stack viewport flip scroll ([#304](https://github.com/cornerstonejs/cornerstone3D-beta/issues/304)) ([5605a39](https://github.com/cornerstonejs/cornerstone3D-beta/commit/5605a39b17749f4f1d0bf6f3ee6f5ee9be492be8))
- stackScroll should honor invert configuration ([#234](https://github.com/cornerstonejs/cornerstone3D-beta/issues/234)) ([aa8f1c4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/aa8f1c4de6837b3438ef62ae48d3412b4d3847bf))
- **Stack:** swap image row and column pixel spacing + relaxing isequal compar… ([#566](https://github.com/cornerstonejs/cornerstone3D-beta/issues/566)) ([1e95ece](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1e95ece03dce10635d9efe4302aa4de768d14721))
- **stackViewport:** better error handling for disabled viewports ([#605](https://github.com/cornerstonejs/cornerstone3D-beta/issues/605)) ([2b144a2](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2b144a2ae58d27d51935a674497437cabb7a4a3d))
- **stackViewport:** check same image was broken after 16 bit texture ([#483](https://github.com/cornerstonejs/cornerstone3D-beta/issues/483)) ([dddfb05](https://github.com/cornerstonejs/cornerstone3D-beta/commit/dddfb05cccc7ba6f8195b26f4f13c755397731ee))
- **StackViewport:** float number comparison to use epsilon when StackViewport is abou… ([#530](https://github.com/cornerstonejs/cornerstone3D-beta/issues/530)) ([abde30b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/abde30b32fb68f019f34fab3ce5489c957466fbf))
- **StackViewport:** Reset camera bug when rotation happens on StackViewport ([#374](https://github.com/cornerstonejs/cornerstone3D-beta/issues/374)) ([598e95f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/598e95f0d1fe6aea5e8e9d37cc61c355cc704c70)), closes [#372](https://github.com/cornerstonejs/cornerstone3D-beta/issues/372)
- **stackviewport:** swap image row and column pixel spacing ([#561](https://github.com/cornerstonejs/cornerstone3D-beta/issues/561)) ([aede776](https://github.com/cornerstonejs/cornerstone3D-beta/commit/aede776ac6475f47a187db1f2ab5b2700192d466))
- State creation error for empty viewportLabelmapState ([d37b836](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d37b836b9e002952cd42d5f12b54e1397780b86d))
- streaming loader package json for entries ([#357](https://github.com/cornerstonejs/cornerstone3D-beta/issues/357)) ([9a5fbf1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9a5fbf1cb60193b4be987e828f29201133bc9106))
- StreamingImageVolume tests ([0ca3cc2](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0ca3cc23ddd764bc256163235599cb02de2a0b52))
- **StreamingImageVolume:** scaling bug for undefined parameters ([#376](https://github.com/cornerstonejs/cornerstone3D-beta/issues/376)) ([a366d9d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a366d9decaad125dc566315e0ae2bf882762d8ba))
- Suppress transitionary CAMERA_MODIFIED events on stack image change ([#200](https://github.com/cornerstonejs/cornerstone3D-beta/issues/200)) ([6369781](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6369781e8daeaa4a546f3c4c018df839619e8520))
- **suv display:** fix scaling of non-SUV PT images ([#536](https://github.com/cornerstonejs/cornerstone3D-beta/issues/536)) ([f9182f0](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f9182f076d9d5f3af4989550b9549aeaa2792466))
- **svg:** Don't try to compute an ID for the SVG defs ([9ea2060](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9ea2060abea86ce9f3b1818e51898581a040f7e8))
- **svg:** find and reset svg-layer within the correct element ([#387](https://github.com/cornerstonejs/cornerstone3D-beta/issues/387)) ([3e0829e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/3e0829e35f19bef3601ee9f197dbf6d87bc01fcf))
- Switch to terser-webpack-plugin from uglify ([#283](https://github.com/cornerstonejs/cornerstone3D-beta/issues/283)) ([edd47c4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/edd47c4b0e78438e25b4a9cb73b3ad08c50c2646))
- terminate ([#277](https://github.com/cornerstonejs/cornerstone3D-beta/issues/277)) ([#278](https://github.com/cornerstonejs/cornerstone3D-beta/issues/278)) ([7fd9197](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7fd9197663be9ce00b895e5fc69fefdc736d3bb5))
- test ci permissions ([f6ad461](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f6ad461a719c83eaa676b9ff2c05a0fd7afe5349))
- test ci semantic-release ([b599d3d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b599d3d145828ba052a217e2635734c1a1ef4732)), closes [#267](https://github.com/cornerstonejs/cornerstone3D-beta/issues/267) [#267](https://github.com/cornerstonejs/cornerstone3D-beta/issues/267)
- test for volume using cached image from stack ([d5fdc7c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d5fdc7cbc27af1bbb04bd5b57783810cd4874811))
- test run; kick-off ci ([0149c8d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0149c8deed31de18805f895b89d6b0edaea534d7))
- tests and api after the rebase ([#319](https://github.com/cornerstonejs/cornerstone3D-beta/issues/319)) ([6453183](https://github.com/cornerstonejs/cornerstone3D-beta/commit/64531833942f2db62cae3313a948ec38b9b5015c))
- **tests:** unified test data loading ([#292](https://github.com/cornerstonejs/cornerstone3D-beta/issues/292)) ([c34f398](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c34f39813755227b79f7a0958a81a5e5c0935b73))
- TextBox move should not re-calculate stats ([#223](https://github.com/cornerstonejs/cornerstone3D-beta/issues/223)) ([85fe884](https://github.com/cornerstonejs/cornerstone3D-beta/commit/85fe8844acba4dced29182cc67076c6d8e1ae2a0))
- tool bindings with different modifier keys ([#377](https://github.com/cornerstonejs/cornerstone3D-beta/issues/377)) ([c95ba60](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c95ba60e0045eac33e889985e2a340f2ce543dc2))
- toolGroup default cursor ([#120](https://github.com/cornerstonejs/cornerstone3D-beta/issues/120)) ([8c385c4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8c385c4780cbaf40400fffc310fd1e3b86056767))
- toolName typo for Crosshairs tool ([#193](https://github.com/cornerstonejs/cornerstone3D-beta/issues/193)) ([46d13bc](https://github.com/cornerstonejs/cornerstone3D-beta/commit/46d13bcb047c2b71c17b0246359d9494fbd8fb89))
- **tools:** Some older annotations were missing normal ([#528](https://github.com/cornerstonejs/cornerstone3D-beta/issues/528)) ([319822a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/319822acdd99da5f75eb716588ebfe9ec2090e76))
- **trackball:** rotate was wrong on mouse drag ([#424](https://github.com/cornerstonejs/cornerstone3D-beta/issues/424)) ([99c1a0a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/99c1a0a35dd52ddec26551de75656cdda7149b39))
- typedoc version problem ([6911ada](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6911adaa6906d2257a6b25abd4b17919fc8e0859))
- types after rebase ([#346](https://github.com/cornerstonejs/cornerstone3D-beta/issues/346)) ([4c7aa8c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4c7aa8c66d75b20fa0be2fd7b612223f79ea811f))
- typescript build error ([70ffb92](https://github.com/cornerstonejs/cornerstone3D-beta/commit/70ffb92806dcd50e9f8917efceab1b772fa54f6a))
- typo cornerStreaming --> cornerstoneStreaming ([#260](https://github.com/cornerstonejs/cornerstone3D-beta/issues/260)) ([78ff266](https://github.com/cornerstonejs/cornerstone3D-beta/commit/78ff2660c3ad7785d89af0cfe55d38dbbae0e6f4))
- unexpected token problem for typescript for tools ([#360](https://github.com/cornerstonejs/cornerstone3D-beta/issues/360)) ([7844798](https://github.com/cornerstonejs/cornerstone3D-beta/commit/78447981ed583ef97f8f7cbed247cd6c3b1419a6))
- unify handling of annotation units and remove 'MO' ([#161](https://github.com/cornerstonejs/cornerstone3D-beta/issues/161)) ([7fddeab](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7fddeab0f686fce5dc0e9c6953025ff14c00e252))
- **update jsdocs, cut release:** release ([#203](https://github.com/cornerstonejs/cornerstone3D-beta/issues/203)) ([307974c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/307974cb399d07152e0f6d4dd9f40fe1c17f076e))
- update readme to trigger release ([#257](https://github.com/cornerstonejs/cornerstone3D-beta/issues/257)) ([554f50d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/554f50d838fbcbeed25460c7384e14dc46bebb11))
- Update to dicom-parser 1.8.9 because it excludes zlib from its bundle ([#397](https://github.com/cornerstonejs/cornerstone3D-beta/issues/397)) ([d6a81d2](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d6a81d232071e33898a24faddd62f511b642c265))
- update variable name for frame index ([#332](https://github.com/cornerstonejs/cornerstone3D-beta/issues/332)) ([5515d6e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/5515d6e0abe11dee04f9b75272d3fbb5d00b2bd7))
- Use maximum clipping range for StackViewport ([#136](https://github.com/cornerstonejs/cornerstone3D-beta/issues/136)) ([016eff6](https://github.com/cornerstonejs/cornerstone3D-beta/commit/016eff66a02e4b120fb8ed06f90faaa3b29a8024))
- use metadataProvider option instead of cornerstone.metaData ([#280](https://github.com/cornerstonejs/cornerstone3D-beta/issues/280)) ([3a0e484](https://github.com/cornerstonejs/cornerstone3D-beta/commit/3a0e484d203770cd309e2bd9f78946a733e79d0c))
- use one actor for a contourset rendering ([#432](https://github.com/cornerstonejs/cornerstone3D-beta/issues/432)) ([c92f8be](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c92f8beafb6731eb0b81ef295ff2774192cfd7ed))
- Use queryselector instead of firstChild to get svg-layer ([#268](https://github.com/cornerstonejs/cornerstone3D-beta/issues/268)) ([1dd315c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1dd315c61476f7bca5640033f530bcc956d14307))
- **utilities:** added getImageLegacy for migrations of cornerstone legacy's getImage ([#613](https://github.com/cornerstonejs/cornerstone3D-beta/issues/613)) ([c4aa974](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c4aa9747270d3a8551887d8bb503e88ff7f3e142))
- **utilities:** Export Bidirectional and Polyline inside TID300 ([75e0e29](https://github.com/cornerstonejs/cornerstone3D-beta/commit/75e0e29f771843a80bfa32532d2186a4e7cdbd57))
- **versioning:** sync all versions ([#623](https://github.com/cornerstonejs/cornerstone3D-beta/issues/623)) ([36b2e91](https://github.com/cornerstonejs/cornerstone3D-beta/commit/36b2e912a627a018f242cc433a9382946097a14f))
- Viewport resize should not reset slice ([#219](https://github.com/cornerstonejs/cornerstone3D-beta/issues/219)) ([2edd77d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2edd77d4d54dfcc7ffe1634cb8c3081928d8dd5e))
- **viewport:** Exception on resize to very small window ([#559](https://github.com/cornerstonejs/cornerstone3D-beta/issues/559)) ([5877820](https://github.com/cornerstonejs/cornerstone3D-beta/commit/58778201c3412f4bda867ed7fb42a47e12f725fd))
- viewportSpecificState initial state ([47c38bd](https://github.com/cornerstonejs/cornerstone3D-beta/commit/47c38bd08ef105530526a769740c195575950bd5))
- viewRight was calculated wrong for tools ([#255](https://github.com/cornerstonejs/cornerstone3D-beta/issues/255)) ([cf536df](https://github.com/cornerstonejs/cornerstone3D-beta/commit/cf536df66c05b4c4385ad18ad814d1dac1c8ad77))
- VOI sync between viewports needs to take into account tool configuration's volumeUID ([dbf02f5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/dbf02f5ec042bb91087aac93bef8685e6d7cfad4))
- **voi:** linear transfer function for volume viewport([#444](https://github.com/cornerstonejs/cornerstone3D-beta/issues/444)) ([dcec5eb](https://github.com/cornerstonejs/cornerstone3D-beta/commit/dcec5ebafe3ba929735685a443ff28fe348c09c0))
- **voi:** stack viewport should prioritize image metadata for windowlevel and not persist ([#454](https://github.com/cornerstonejs/cornerstone3D-beta/issues/454)) ([420c812](https://github.com/cornerstonejs/cornerstone3D-beta/commit/420c8121cb0cdc4c321013ca807c6ca32901d7a6))
- volume scaling should be returned in getImageData ([#282](https://github.com/cornerstonejs/cornerstone3D-beta/issues/282)) ([4df3f71](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4df3f7110de1a12dbeb0fea1260e4bb9e85320fa))
- volume viewport getCurrentImageId ([#265](https://github.com/cornerstonejs/cornerstone3D-beta/issues/265)) ([30e4a5d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/30e4a5d812a9d800887dfdc940a73149e5687ab8))
- **volumeLoad:** should still update texture when loading ([#527](https://github.com/cornerstonejs/cornerstone3D-beta/issues/527)) ([65c71ea](https://github.com/cornerstonejs/cornerstone3D-beta/commit/65c71ea8e5aa2c4dc92ed69c64707a6bdfa206b5))
- **VolumeViewport3D:** implemented getCurrentImageId method ([#529](https://github.com/cornerstonejs/cornerstone3D-beta/issues/529)) ([c6b6ab5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c6b6ab5baa79cc1f2da18e1eccf2cc64a2b7848f))
- **volumeViewport:** Add optional scaling as the volume can be undefined ([#323](https://github.com/cornerstonejs/cornerstone3D-beta/issues/323)) ([a58a831](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a58a831f4c5ab4c9ea9d7d258a59cbdcb5c837e4))
- **VolumeViewport:** added null actorEntry check in VolumeViewport.getCurrentImageId ([#618](https://github.com/cornerstonejs/cornerstone3D-beta/issues/618)) ([e5fd29b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e5fd29ba3708e655c6f3eb1ab04b7b6268496884))
- **VR:** added support for specific character set ([#291](https://github.com/cornerstonejs/cornerstone3D-beta/issues/291)) ([f103d19](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f103d1918d02780c4881db5c8aa30f653c4da6b6))
- **vr:** Convert empty DecimalString and NumberString to null instead of to zero ([#278](https://github.com/cornerstonejs/cornerstone3D-beta/issues/278)) ([43cd8ea](https://github.com/cornerstonejs/cornerstone3D-beta/commit/43cd8eaa316a08ff1a025b1267fedda239526acb))
- VTK volumeMapper bounds off by half-voxel in each direction. Added rendering tests ([#145](https://github.com/cornerstonejs/cornerstone3D-beta/issues/145)) ([0164b76](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0164b765cf1bd9121112bdc286f699f606393da0))
- **wado-rs:** Fix broken case for getTransferSyntaxForContentType ([eacc417](https://github.com/cornerstonejs/cornerstone3D-beta/commit/eacc4174d5844b55b1f74fd7f58461bc3c1b4492))
- wadouri metadata was not using scaling parameters properly ([#159](https://github.com/cornerstonejs/cornerstone3D-beta/issues/159)) ([d21aba5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d21aba56f1e0a8730088d89a4dfde8358d978a60))
- Webpack externals were not properly defined ([70499a5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/70499a55c5824b3f94920ffd48411118e6fe4bb8))
- **WebWorker:** Handle decoder exceptions ([#253](https://github.com/cornerstonejs/cornerstone3D-beta/issues/253)) ([6ed6c70](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6ed6c70f7406fdfa64904a16a4319f3ce08a9ced))
- **webworker:** Hangs forever when image decode fails ([#492](https://github.com/cornerstonejs/cornerstone3D-beta/issues/492)) ([58ac0b6](https://github.com/cornerstonejs/cornerstone3D-beta/commit/58ac0b61ca54ca350f27100cd5fbbef07605dfe9))
- windowLevel event trigger and initial voi range ([#81](https://github.com/cornerstonejs/cornerstone3D-beta/issues/81)) ([38307d4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/38307d40cec60f2b3b8497abda8aa4fa657fc179))
- **windowLevelTool:** WWWL multipler too high when burned in pixels are present ([#462](https://github.com/cornerstonejs/cornerstone3D-beta/issues/462)) ([47bfa46](https://github.com/cornerstonejs/cornerstone3D-beta/commit/47bfa46caa563bfc131487bac0c5c517e65128bf))
- **worldToImage:** Not throw out of bounds in worldToImage ([#302](https://github.com/cornerstonejs/cornerstone3D-beta/issues/302)) ([ffb20f7](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ffb20f715c768b8f590b103cd18acc2bc2068adf))
- wrap coverage report in the page header ([#190](https://github.com/cornerstonejs/cornerstone3D-beta/issues/190)) ([6ba6c58](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6ba6c58644ff5719c15c698310c70b489da7e85b))
- **writeBytes:** create release from commit ([d9a4105](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d9a41050e756f9b7e56ef4ae3d5000ce86ea39eb))
- wrong ushape calculation when loading SR/freehand from server ([#199](https://github.com/cornerstonejs/cornerstone3D-beta/issues/199)) ([ce0c5c9](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ce0c5c9b1c2ef7df9d571c113f37571261cad26f))
- ZoomTool fix for polyData actors with no imageData ([#308](https://github.com/cornerstonejs/cornerstone3D-beta/issues/308)) ([1350eca](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1350eca3cdc8d456642c6497dd2b2460a3584c7e))
- zoomTool should not consume the preMouse event ([#196](https://github.com/cornerstonejs/cornerstone3D-beta/issues/196)) ([8ec505a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8ec505a3e2b55d74f5ad3af6159e83398017b87b))

### Features

- 🎸 Allow optional in-worker scaling and buffer redirection ([c504bb1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c504bb16ee150d3e616a2fd9966fe8275163d28a))
- **3d from 4d:** 3D image generation from 4D ([#502](https://github.com/cornerstonejs/cornerstone3D-beta/issues/502)) ([9217691](https://github.com/cornerstonejs/cornerstone3D-beta/commit/921769132398756fe192e266bcc9a09b98e0e733))
- **4d utility:** getDataInTime from 4D data ([#460](https://github.com/cornerstonejs/cornerstone3D-beta/issues/460)) ([57bd947](https://github.com/cornerstonejs/cornerstone3D-beta/commit/57bd947b5385f922ed6bdbab940c56dfd245c8b1))
- **4D:** added support for 4D data rendering ([#438](https://github.com/cornerstonejs/cornerstone3D-beta/issues/438)) ([975e596](https://github.com/cornerstonejs/cornerstone3D-beta/commit/975e59629125fbf0ba5ea676fa14b71a2b30ca44))
- **4D:** fixed cine play issue and added getDynamicVolumeInfo method ([#562](https://github.com/cornerstonejs/cornerstone3D-beta/issues/562)) ([f4c2531](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f4c25316eb1c5a6b13edb7c0873c9b0ce7a4e581))
- **adapters:** Add adapter for exporting polylines from dicom-microscopy-viewer to DICOM-SR ([#44](https://github.com/cornerstonejs/cornerstone3D-beta/issues/44)) ([7a1947c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7a1947c6ec164da4e9f66e90c1bbf1055978b173))
- **adapters:** Add adapter to generate segments & geometry from SEG for easier use in VTKjs (migrated from vtkDisplay example) ([398b74d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/398b74d70deb32824a74e98210127326887dfa77))
- **adapters:** Add adapters for Rectangle, Angle and fix generate DICOM ([#427](https://github.com/cornerstonejs/cornerstone3D-beta/issues/427)) ([b8ca75e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b8ca75e6ba378f175bd987d07f094f44b41a46cf))
- **adapters:** First steps for DICOM-SR read support for polylines with dicom-microscopy-viewer ([#49](https://github.com/cornerstonejs/cornerstone3D-beta/issues/49)) ([37f1888](https://github.com/cornerstonejs/cornerstone3D-beta/commit/37f18881dd7369818de4aa22c5730012c2829616))
- add 16 bit data type scale under a decode flag ([#501](https://github.com/cornerstonejs/cornerstone3D-beta/issues/501)) ([1b47073](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1b47073d8f526dc49d9cdcfd57a42c691e2969d2))
- Add 2D rectangle roi threshold tool ([48ff815](https://github.com/cornerstonejs/cornerstone3D-beta/commit/48ff81540534d21d6601c4db81abfdd706652607))
- Add a basic Brush tool ([6358b12](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6358b126c9d03bd349f864cec53d22c92f8b1405))
- Add a CircleROI tool ([#459](https://github.com/cornerstonejs/cornerstone3D-beta/issues/459)) ([1c03ed3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1c03ed3457fbb63bbd87315b90bfed99b1cd09cc))
- Add activeStrategy cursor to RectangleScissor tool ([24fd78b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/24fd78b5e1960843cfc4b60fd8fcb349f54ef2b7))
- Add additionalDetails to request object in volume ([05cb249](https://github.com/cornerstonejs/cornerstone3D-beta/commit/05cb24991bf1ed2be092edab582304b026abe112))
- Add AngleTool and MagnifyTool ([#97](https://github.com/cornerstonejs/cornerstone3D-beta/issues/97)) ([2c4c800](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2c4c800c4b3ba92164f728865b904933a2539210))
- Add annotation completed event ([#84](https://github.com/cornerstonejs/cornerstone3D-beta/issues/84)) ([cd574da](https://github.com/cornerstonejs/cornerstone3D-beta/commit/cd574da73403e3030a5bc414778e08536fb77381))
- add annotation display Tool ([#283](https://github.com/cornerstonejs/cornerstone3D-beta/issues/283)) ([e4a0324](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e4a0324840f8f5ac29f9db292e8df0c59ee69322))
- Add ArrowTool and remove toolName from drawing API ([#88](https://github.com/cornerstonejs/cornerstone3D-beta/issues/88)) ([217637c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/217637cb2a48ca6e73cea7d1781a4a83fc482e79))
- Add AutoPan to the CrosshairTools ([7d30510](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7d30510efebb10e1df157cd745eeaee297a4b9a5))
- Add base brushTool ([4384aa0](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4384aa0fea6505db22d3c53e3b46d495d08766f6))
- Add beforeProcessing hook to WADO-URI XMLHttpRequest ([#338](https://github.com/cornerstonejs/cornerstone3D-beta/issues/338)) ([43dbacb](https://github.com/cornerstonejs/cornerstone3D-beta/commit/43dbacbd11fd9388355f48cf6daabc1e391acde9))
- Add cachedStats to labelmaps ([9d46576](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9d4657638fe87c57d0035a0561286943eb7a6af3))
- Add calibrated pixel spacing ([#166](https://github.com/cornerstonejs/cornerstone3D-beta/issues/166)) ([714af76](https://github.com/cornerstonejs/cornerstone3D-beta/commit/714af76265099f8298e8d3f8c900f51cce9bf780))
- Add CINE tool via playClip ([#99](https://github.com/cornerstonejs/cornerstone3D-beta/issues/99)) ([916d783](https://github.com/cornerstonejs/cornerstone3D-beta/commit/916d783a56a7abc2a46c7477e2685ad436ad3637))
- Add circle scissor tool for all orthogonal planes ([f7fa26b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f7fa26b825c6f219c5bce2658e5cdbb90184bd1f))
- Add circle scissor tool with fillCircle strategy ([4c0b444](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4c0b4444f61c33c02e31c33aa3bc53e62196ceb2))
- Add cleaning for tools after viewport disabling ([#139](https://github.com/cornerstonejs/cornerstone3D-beta/issues/139)) ([a138fd0](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a138fd0805d09808c1dad1da7742c0d818c186f8))
- Add Clipping planes for rendering ([#110](https://github.com/cornerstonejs/cornerstone3D-beta/issues/110)) ([1a6e4c7](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1a6e4c742a3b89a88b46fd98d6cbeca5c95918aa))
- Add colorLUT and segmentIndex color ([112f70f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/112f70fd46f5572b11115a29ebbdf6bfb51291a6))
- Add Cornerstone3D adapter for Length tool ([#261](https://github.com/cornerstonejs/cornerstone3D-beta/issues/261)) ([2cab0d9](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2cab0d9edba20e99b11407d41ed2a4bf60a6ab9b))
- Add cornerstoneTools segmentationManager ([caf4ebd](https://github.com/cornerstonejs/cornerstone3D-beta/commit/caf4ebdacdaee8672055af71633c1b02b82e8d34))
- add crosshairs example and fix locking ([#40](https://github.com/cornerstonejs/cornerstone3D-beta/issues/40)) ([fe9ec50](https://github.com/cornerstonejs/cornerstone3D-beta/commit/fe9ec50a61c16a2f3655b1dbb405fa7e2ec2438f))
- add data id to length and rectangle svg for e2e tests ([#240](https://github.com/cornerstonejs/cornerstone3D-beta/issues/240)) ([3c4e023](https://github.com/cornerstonejs/cornerstone3D-beta/commit/3c4e02305423c59ddcad5d2551cd2ca629738eea))
- Add editable first and last slice for the RectangleRoiThreshold tool ([33d8acd](https://github.com/cornerstonejs/cornerstone3D-beta/commit/33d8acd49742204efad7b1c81dab343646ba102a))
- Add events to RoiThresholdManual tool ([890cc58](https://github.com/cornerstonejs/cornerstone3D-beta/commit/890cc584567b9b13051cd5a83eb168b5472ed944))
- Add flipping to the stack and volume viewports ([#152](https://github.com/cornerstonejs/cornerstone3D-beta/issues/152)) ([641c569](https://github.com/cornerstonejs/cornerstone3D-beta/commit/641c569f1677e4983ae0772bfb5f39e5bc44accb))
- Add frame loading priority for volumes ([#151](https://github.com/cornerstonejs/cornerstone3D-beta/issues/151)) ([09a3a2c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/09a3a2cdd0756332e8297f44e4d61643f6241b45))
- Add getViewport methods to Synchronizers ([aa1d8ed](https://github.com/cornerstonejs/cornerstone3D-beta/commit/aa1d8ed9716219e5479ee128a774fdd62c6a8fc5))
- Add hide segmentation controller to change visibility ([88424eb](https://github.com/cornerstonejs/cornerstone3D-beta/commit/88424eb8d3052b77abf1021184aefcba53ef89df))
- Add HTJ2K - release attempt ([c65218e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c65218ef61bb54e7afa64d7e1600ac91e0ef9def))
- Add immediate flag to RenderingEngine.resize() ([#224](https://github.com/cornerstonejs/cornerstone3D-beta/issues/224)) ([b3de025](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b3de0254671652af7b4204adef0f43a20c4aab9e))
- Add initial scissorsTool ([e37bff9](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e37bff9c14dc2ee870f895190f951fa20f8bb662))
- Add initial segmentation demo ([0b9b2b3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0b9b2b3932f65e6794327c86cc4212a58a9f837c))
- Add label to the labelmap states ([731450e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/731450ea6daa1333faf3741a61ec6f749dfff48c))
- Add labelmap remove methods and event triggers ([0e7c2eb](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0e7c2eb27cc77980b8369818b041170a6d5ef4be))
- Add labels to the toolData for annotation tools ([fe7570d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/fe7570dcd0bfe01e28da6102523e6570191f297e))
- Add lockedSegments and global segmentation config update ([2ea8579](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2ea8579d3ad58a208f9b59f05eb4b594eebb79dd))
- Add maintainFrame flag for viewports resetCamera ([#239](https://github.com/cornerstonejs/cornerstone3D-beta/issues/239)) ([d2fc40d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d2fc40d067dd937287f5819c7ff767a16e6ef60d))
- Add max value calculations to rectangle and ellipse ([2ebabc1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2ebabc179cbdcfe25673808254741c17142f896a))
- Add merge labelmaps utility function ([7278c72](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7278c7232e5c8177896a73e37d0cd9429f0078e4))
- Add more documentation to tools and toolStyles ([#214](https://github.com/cornerstonejs/cornerstone3D-beta/issues/214)) ([8499c6f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8499c6f5cb97f4ac7c6c261e8cd5da70bd3c352a))
- Add more tests to Synchronizer and ToolGroup managers ([#217](https://github.com/cornerstonejs/cornerstone3D-beta/issues/217)) ([f22ae0f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f22ae0f1e751e3fd3944fe97c4abd9e1a10137e8))
- Add mouseWheel invert configuration ([#232](https://github.com/cornerstonejs/cornerstone3D-beta/issues/232)) ([36d194b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/36d194b8721c81a23b18f740ecdde5e4d06ee32a))
- add multiframe example ([#331](https://github.com/cornerstonejs/cornerstone3D-beta/issues/331)) ([327f17a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/327f17a551f869c8f454566782be720367291235))
- Add multiple demos for library ([#342](https://github.com/cornerstonejs/cornerstone3D-beta/issues/342)) ([879ea99](https://github.com/cornerstonejs/cornerstone3D-beta/commit/879ea99bcecffc35d8960362ce58118d0c5894d8))
- Add new 3D volume viewport ([#281](https://github.com/cornerstonejs/cornerstone3D-beta/issues/281)) ([57cf7ac](https://github.com/cornerstonejs/cornerstone3D-beta/commit/57cf7ac3bfd83d35d68f54b1f00f03583ed8e998))
- Add new getAllToolGroups ([0053d05](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0053d05c03a4ae5ef54adf7b5b3c25af71129f83))
- Add numSlices option to RectangleRoiThreshold tool ([3b8f15e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/3b8f15ebbb5abf672ed592d6d4f99438f3992bf2))
- Add onLabelmapModified event ([6d5f909](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6d5f909998528ef548ce16d30824458fad88a6d6))
- add option to skipi image creation ([#504](https://github.com/cornerstonejs/cornerstone3D-beta/issues/504)) ([d287878](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d2878785c52292730da5607d79a793d33800a522))
- Add overlapping segment check to Cornerstone 4.x DICOM SEG adapter ([#155](https://github.com/cornerstonejs/cornerstone3D-beta/issues/155)) ([df44e27](https://github.com/cornerstonejs/cornerstone3D-beta/commit/df44e27b3b1c26082bf3d7a9477ab7f0d5ca1d19))
- Add overwrite on the volume threshold utility function ([5f12208](https://github.com/cornerstonejs/cornerstone3D-beta/commit/5f12208057ab618ad8f3f78bb539c08500ffc4e0))
- add petSeries and petImage modules to providers ([#505](https://github.com/cornerstonejs/cornerstone3D-beta/issues/505)) ([60fa805](https://github.com/cornerstonejs/cornerstone3D-beta/commit/60fa8051e6ea13597f8b809e3ff1799ce0883b77))
- Add preScale parameters to the image ([#413](https://github.com/cornerstonejs/cornerstone3D-beta/issues/413)) ([14603e2](https://github.com/cornerstonejs/cornerstone3D-beta/commit/14603e23bcfe2f9c9afa855dc591748f66b9ba3b))
- Add projection of rectangleTool as dash line in the scan axis ([48640cf](https://github.com/cornerstonejs/cornerstone3D-beta/commit/48640cfdd17ddd42f7c951abf6c05c9a94783c90))
- Add projection point and imageIds data to RectangleRoiStartEnd tool ([1c06e89](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1c06e89b55956a8bca3a90814fc8eb65135ee6a4))
- Add re-rendering of labelmaps based on config change ([792fa36](https://github.com/cornerstonejs/cornerstone3D-beta/commit/792fa3685dcb2715d7aaa22c71e4fd8e9d35b67a))
- add Rectangle Scissors tool ([b4eb90c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b4eb90c511eb69929ea1f104d9750884f411dcc2))
- add reference lines tool ([#292](https://github.com/cornerstonejs/cornerstone3D-beta/issues/292)) ([c56df91](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c56df91a64ec005656f940dd3728f476152fa917))
- add referenceCursors tool ([#275](https://github.com/cornerstonejs/cornerstone3D-beta/issues/275)) ([3303246](https://github.com/cornerstonejs/cornerstone3D-beta/commit/3303246836c81efb51e5d5e70c1a8801fbcb019a))
- Add referenceVolume name to labelmaps ([afe8add](https://github.com/cornerstonejs/cornerstone3D-beta/commit/afe8addbb881abaa906b534f9e14861234cd4cf1))
- Add renderToCanvas functionality ([#279](https://github.com/cornerstonejs/cornerstone3D-beta/issues/279)) ([dd2bfc8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/dd2bfc8d085f0dda99473ba90dfc4ba2214fb2c4))
- add rgba property to image object ([#460](https://github.com/cornerstonejs/cornerstone3D-beta/issues/460)) ([798ce3f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/798ce3fdc7ab9dcc21f0c7669dff9ef5f22035b1))
- Add rotation for viewports and enhanced docs ([#150](https://github.com/cornerstonejs/cornerstone3D-beta/issues/150)) ([cfa3bde](https://github.com/cornerstonejs/cornerstone3D-beta/commit/cfa3bde36120db4034e7efb11813b193a0e148ab))
- add scrollToSlice for element ([#76](https://github.com/cornerstonejs/cornerstone3D-beta/issues/76)) ([c43fe8f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c43fe8f955930a70be60015f2f6bc1d5bf9fffbb))
- Add segmentation config and setActiveLabelmapIndex ([a0948d8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a0948d88349ead83fceb0b2726c7761bd8d8ce80))
- Add segmentation support for volumes ([4b83f20](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4b83f20e5d4ec514cdd506f67361b38d532fc1f4))
- Add segmentIndex-level segmentation editing ([5cd5ccf](https://github.com/cornerstonejs/cornerstone3D-beta/commit/5cd5ccf91d2f970269f15d4331c9a839948aea06))
- Add segmentSpecificConfiguration and add outlineOpacity config for Segmentation ([#285](https://github.com/cornerstonejs/cornerstone3D-beta/issues/285)) ([92fb495](https://github.com/cornerstonejs/cornerstone3D-beta/commit/92fb49594cfc3219f761e905ba765acaddbe1e1a))
- add setCursorForElement ([#326](https://github.com/cornerstonejs/cornerstone3D-beta/issues/326)) ([cfff4e3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/cfff4e38576a4e1cea1e76e9086f8f4ee2695e25))
- Add Sphere scissor and SUV PeakTool and refactor ROI computations ([a854cf4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a854cf48c370f97811b1fe8bae23802e440c6c41))
- Add split load and retrieve requests and add WASM codecs from CSWIL ([98137d7](https://github.com/cornerstonejs/cornerstone3D-beta/commit/98137d7a3ca824f1db7cb623431bd8d3a010b507))
- add stack synchronization within or across studies ([#291](https://github.com/cornerstonejs/cornerstone3D-beta/issues/291)) ([f38bec0](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f38bec06713265cee361fc905539aa5ed841e707))
- add support for WADO-URI Streaming Volume Loading ([#354](https://github.com/cornerstonejs/cornerstone3D-beta/issues/354)) ([a1e4a36](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a1e4a36e92870ca65c7b9cc1b738aa219686e861))
- Add tests for annotation tools ([#208](https://github.com/cornerstonejs/cornerstone3D-beta/issues/208)) ([93fb724](https://github.com/cornerstonejs/cornerstone3D-beta/commit/93fb7240c6a6e54793ac680ce418a9330cdea781))
- Add threshold by ROI statistics and optimize triggering of events ([09f5bff](https://github.com/cornerstonejs/cornerstone3D-beta/commit/09f5bff1fecbcf700059a85ff45ae2a32be8eaaf))
- Add threshold roi segmentation strategies ([de991c0](https://github.com/cornerstonejs/cornerstone3D-beta/commit/de991c0b9d625e47a00a01d46b879d23097beb1c))
- Add TMTV calculation for segmentations ([556bdcd](https://github.com/cornerstonejs/cornerstone3D-beta/commit/556bdcd14123a90b275f54d9b82e79e68a5d1334))
- Add toolData to suv peak calculation to improve performance ([99bf586](https://github.com/cornerstonejs/cornerstone3D-beta/commit/99bf5868f8b33c6afc791000401fde48c960e726))
- Add toolStyles configuration and DragProbe ([#93](https://github.com/cornerstonejs/cornerstone3D-beta/issues/93)) ([ba15be6](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ba15be6d268b8c568bdf0e247e571f5ca29a26ad))
- Add VOLUME_NEW_IMAGE event and Add jumpToSlice and default VOI for volume viewport ([#104](https://github.com/cornerstonejs/cornerstone3D-beta/issues/104)) ([d36a23a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d36a23a4eaf5bafcc8dddc0ab796065098df616a))
- Add worldToImage and imageToWorld utilities ([#85](https://github.com/cornerstonejs/cornerstone3D-beta/issues/85)) ([54e1b7f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/54e1b7f718f9d23b4c9f98ebc02c523100c1ddb0))
- added display area to viewport ([#280](https://github.com/cornerstonejs/cornerstone3D-beta/issues/280)) ([ec64803](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ec64803cb8daf9a8678afdbb227583801207ba83))
- Added more documentation to rendering and tools ([bc1a434](https://github.com/cornerstonejs/cornerstone3D-beta/commit/bc1a434de240951aead63f65136f76b88abac532))
- Added setProperties api for changing voi and other props ([#179](https://github.com/cornerstonejs/cornerstone3D-beta/issues/179)) ([ae9295d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ae9295db916a3ef5d30d591a0541b2a8c6213fe8))
- added voiLUTFunction ([#476](https://github.com/cornerstonejs/cornerstone3D-beta/issues/476)) ([28fec2f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/28fec2f08173515bb8056043f71fba7ae05e63b4))
- Adding support for cursors ([#164](https://github.com/cornerstonejs/cornerstone3D-beta/issues/164)) ([0dbf0d0](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0dbf0d0e85b7d4e27fe15fb9f5a659985811cfb0))
- adding support for multiframe metadata in wadors and wadouri ([#494](https://github.com/cornerstonejs/cornerstone3D-beta/issues/494)) ([483cfa7](https://github.com/cornerstonejs/cornerstone3D-beta/commit/483cfa701a13614e27ec3f1d6b8e6e2538b21036))
- advanced examples ([#38](https://github.com/cornerstonejs/cornerstone3D-beta/issues/38)) ([27f26a1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/27f26a12a1712b7542cc66ab1d077cfb0da50a86))
- Allow backslashes in UIDs in order to support DICOM Q&R ([#277](https://github.com/cornerstonejs/cornerstone3D-beta/issues/277)) ([6d2d5c6](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6d2d5c60f500174abb1be7757094178ec6a1d144))
- Annotation tools added for Stack Viewports, Measurement Events added, Tool cancellation added ([#120](https://github.com/cornerstonejs/cornerstone3D-beta/issues/120)) ([3490b9a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/3490b9a9a319d336841c3ed0cc314581710fa53c))
- **annotations:** rework annotation manager api and enable multi-manager setup ([#442](https://github.com/cornerstonejs/cornerstone3D-beta/issues/442)) ([60bd013](https://github.com/cornerstonejs/cornerstone3D-beta/commit/60bd0132785744c55cd52b6a7dfc4ee56408d373))
- **anonymizer:** export Array tagNamesToEmpty and modify cleanTags ([#303](https://github.com/cornerstonejs/cornerstone3D-beta/issues/303)) ([e960085](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e960085ca08fb28a0a8134fbfee7d450722d8c64))
- API renaming and type fixes for cornerstone-tools ([#350](https://github.com/cornerstonejs/cornerstone3D-beta/issues/350)) ([02ab03d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/02ab03d60c214bf8a6abc9b0b7e77c1f08f82c9a))
- Bidirectional Arrow and EllipticalROI adapters for CS3D ([#264](https://github.com/cornerstonejs/cornerstone3D-beta/issues/264)) ([1fc7932](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1fc7932e3eed85fa1a0f857d84bab35a2e62d80d))
- Brush on mouse move ([#20](https://github.com/cornerstonejs/cornerstone3D-beta/issues/20)) ([4a08cce](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4a08cce5e6cc2e9715367c233ab272bd259ca7d1))
- bump versions of CSWIL ([#285](https://github.com/cornerstonejs/cornerstone3D-beta/issues/285)) ([5f08164](https://github.com/cornerstonejs/cornerstone3D-beta/commit/5f081648284c1ad5f4b08179ad1da5dd3b5a4d81))
- cachedStats to store imageId and volumeId ([#75](https://github.com/cornerstonejs/cornerstone3D-beta/issues/75)) ([a2404c4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a2404c4f1cb15a3935ba3af58fa7fc556716458c))
- camera sync canvas relative ([#167](https://github.com/cornerstonejs/cornerstone3D-beta/issues/167)) ([2fd6c98](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2fd6c9830eb6e9da10960de0c25702b06716382a))
- Change viewport types in annotationRender ([#244](https://github.com/cornerstonejs/cornerstone3D-beta/issues/244)) ([8b684e1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8b684e116e99ccf8f4843724d6570b827f8c6824))
- **cine:** added support for 4D volumes ([#471](https://github.com/cornerstonejs/cornerstone3D-beta/issues/471)) ([4e62137](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4e62137004a340420d7c5c56c6ad5bebb7a8021c)), closes [#470](https://github.com/cornerstonejs/cornerstone3D-beta/issues/470)
- **CobbAngle:** Add CobbAngle tool ([#353](https://github.com/cornerstonejs/cornerstone3D-beta/issues/353)) ([b9bd701](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b9bd701df41ae2b8b2afbcf1d092d7587f7b267a))
- **codecs, loadImage:** Switch to WASM Codecs, use image load into distinct queues for retrievals and decoding ([#394](https://github.com/cornerstonejs/cornerstone3D-beta/issues/394)) ([4ffc3e6](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4ffc3e6c99397e9b2ed26ebae8e1c6766baea8f4))
- **contour api:** add api for contour rendering configuration ([#443](https://github.com/cornerstonejs/cornerstone3D-beta/issues/443)) ([4ab751d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4ab751df4082c56b64e4b97e9d6ca6de3c60c7e5))
- **contour:** improved performance and better configuration ([#543](https://github.com/cornerstonejs/cornerstone3D-beta/issues/543)) ([c69c58a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c69c58a171f1dc24d94aded51bbdffa3775c7e6e))
- **cornerstone:** Feature add cornerstone adapters ([#225](https://github.com/cornerstonejs/cornerstone3D-beta/issues/225)) ([23c0877](https://github.com/cornerstonejs/cornerstone3D-beta/commit/23c08777f7a93d4c0576a5e583113029a1a1e05f))
- **cpu event:** added event pre stack new image for cpu ([#565](https://github.com/cornerstonejs/cornerstone3D-beta/issues/565)) ([b91076f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b91076f8fe0856895f04f18e3cb42269dbb0b38d))
- cpu fallback for rendering stack viewports ([#315](https://github.com/cornerstonejs/cornerstone3D-beta/issues/315)) ([9ed4425](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9ed44254c21455ec14b4ee0019784d4d73bd9cd3)), closes [#296](https://github.com/cornerstonejs/cornerstone3D-beta/issues/296) [#297](https://github.com/cornerstonejs/cornerstone3D-beta/issues/297) [#298](https://github.com/cornerstonejs/cornerstone3D-beta/issues/298) [#294](https://github.com/cornerstonejs/cornerstone3D-beta/issues/294) [#299](https://github.com/cornerstonejs/cornerstone3D-beta/issues/299) [#300](https://github.com/cornerstonejs/cornerstone3D-beta/issues/300) [#301](https://github.com/cornerstonejs/cornerstone3D-beta/issues/301) [#302](https://github.com/cornerstonejs/cornerstone3D-beta/issues/302) [#303](https://github.com/cornerstonejs/cornerstone3D-beta/issues/303) [#304](https://github.com/cornerstonejs/cornerstone3D-beta/issues/304) [#305](https://github.com/cornerstonejs/cornerstone3D-beta/issues/305) [#306](https://github.com/cornerstonejs/cornerstone3D-beta/issues/306) [#309](https://github.com/cornerstonejs/cornerstone3D-beta/issues/309) [#310](https://github.com/cornerstonejs/cornerstone3D-beta/issues/310) [#308](https://github.com/cornerstonejs/cornerstone3D-beta/issues/308) [#311](https://github.com/cornerstonejs/cornerstone3D-beta/issues/311)
- **crosshairs:** Make the reference lines gap configurable ([#557](https://github.com/cornerstonejs/cornerstone3D-beta/issues/557)) ([be91ab8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/be91ab87d89f5e8079e1073a504a07a0d53373a8))
- CrossOrigin check is added to demos ([#222](https://github.com/cornerstonejs/cornerstone3D-beta/issues/222)) ([8cb3741](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8cb374127a502b0ec289f4eb11fa1bb98b6a1710))
- **data:** add test color images for dicom image loader ([#488](https://github.com/cornerstonejs/cornerstone3D-beta/issues/488)) ([a47a2cb](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a47a2cbbae6523590a390b5aa8bc87dac5b29105))
- Decoupled RoiThreshold execution logic into set of utility functions ([1c4d639](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1c4d639fcce2af2a5ebc6cb8816519a7d48a5114))
- **deflated:** Added support for reading datasets with deflated transfer syntax ([#312](https://github.com/cornerstonejs/cornerstone3D-beta/issues/312)) ([ee8f8f2](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ee8f8f21babbbd8eac2b19e8e957db2cc5a09325))
- **dicomImageLoader types:** Add types to the dicom image loader ([#441](https://github.com/cornerstonejs/cornerstone3D-beta/issues/441)) ([10a3370](https://github.com/cornerstonejs/cornerstone3D-beta/commit/10a3370b7f23084d1f2c55506079c17dea959659)), closes [#449](https://github.com/cornerstonejs/cornerstone3D-beta/issues/449) [#450](https://github.com/cornerstonejs/cornerstone3D-beta/issues/450)
- **dicomImageLoader:** make cornerstone to use new dicom image loader and handle scaling correctly ([#553](https://github.com/cornerstonejs/cornerstone3D-beta/issues/553)) ([a01687a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a01687ab925c469bf979d6f2089d2e8f31c28e75))
- **docs:** change dicomImageLoader webpack build process ([#587](https://github.com/cornerstonejs/cornerstone3D-beta/issues/587)) ([2c0b336](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2c0b33602444b553e1f109b1a2cc7358a6de10ba))
- **doubleClick:** Add Double click detection ([#375](https://github.com/cornerstonejs/cornerstone3D-beta/issues/375)) ([#382](https://github.com/cornerstonejs/cornerstone3D-beta/issues/382)) ([8e4be96](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8e4be962c8f9d6c226095a573905087842995f89))
- draw center point of the ellipticalROI tool and make it configurable ([#191](https://github.com/cornerstonejs/cornerstone3D-beta/issues/191)) ([b0ad00c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b0ad00ce263d55214e1b3d61e51e319c63d11c42)), closes [#190](https://github.com/cornerstonejs/cornerstone3D-beta/issues/190) [#190](https://github.com/cornerstonejs/cornerstone3D-beta/issues/190) [#190](https://github.com/cornerstonejs/cornerstone3D-beta/issues/190) [#190](https://github.com/cornerstonejs/cornerstone3D-beta/issues/190) [#190](https://github.com/cornerstonejs/cornerstone3D-beta/issues/190) [#190](https://github.com/cornerstonejs/cornerstone3D-beta/issues/190)
- enable having multiple instances of the same tool and add more seg tools ([#327](https://github.com/cornerstonejs/cornerstone3D-beta/issues/327)) ([7ff05c5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7ff05c5519243632d9d9113e3c84cf9e10725193))
- Enhanced crosshairs architecture ([#280](https://github.com/cornerstonejs/cornerstone3D-beta/issues/280)) ([f064a37](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f064a374b1bb68ef60aaa82683193e231775df94))
- flip viewports via camera api instead of actor ([#271](https://github.com/cornerstonejs/cornerstone3D-beta/issues/271)) ([7c99f76](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7c99f76fe10f9dac2f2221f9cdc134c90ebbe115))
- Improve null equality check in the volume ([1a930f0](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1a930f01f4769424e311fffcff0949ed900bdd61))
- Improve renderToCanvas functionality and Scaling ([#286](https://github.com/cornerstonejs/cornerstone3D-beta/issues/286)) ([126b5df](https://github.com/cornerstonejs/cornerstone3D-beta/commit/126b5df6d6cde7477a3a7b61814e06f4f5b67813))
- improved example runner to handle casing and partial match ([#347](https://github.com/cornerstonejs/cornerstone3D-beta/issues/347)) ([9e8fa12](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9e8fa122f766c1fceff4e3d4fe3cd0f68963c92b))
- improved stack prefetch and zoom to mouse ([#121](https://github.com/cornerstonejs/cornerstone3D-beta/issues/121)) ([bc72d37](https://github.com/cornerstonejs/cornerstone3D-beta/commit/bc72d37b10f5a9e3e2bc9ed1254a707047f04f45))
- improved threshold volume API and refactored boundingBox utils ([#117](https://github.com/cornerstonejs/cornerstone3D-beta/issues/117)) ([adc308b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/adc308bef0509852bc48c96114eb3268c3d100b9))
- include segment labels in segmentation state ([#433](https://github.com/cornerstonejs/cornerstone3D-beta/issues/433)) ([412a914](https://github.com/cornerstonejs/cornerstone3D-beta/commit/412a914682b27b0f5b39f942986cd09c375107d1))
- jumptToWorld using utility function instead of tool ([#282](https://github.com/cornerstonejs/cornerstone3D-beta/issues/282)) ([f887054](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f887054a327ca0c99b1722d8845d1ba4187530b6))
- Lazily instantiating colorLUT for segmentation when needed ([7a50c55](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7a50c55046ca08a0bd11ee8ae24c985bb03717d1))
- **loop:** option to scroll tools ([#494](https://github.com/cornerstonejs/cornerstone3D-beta/issues/494)) ([34d4380](https://github.com/cornerstonejs/cornerstone3D-beta/commit/34d438083e750d12b9fb9cbc6a34b7dca2d6f1d0))
- **mem:** Zero Copy ArrayBuffer ([#279](https://github.com/cornerstonejs/cornerstone3D-beta/issues/279)) ([a17f2d7](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a17f2d75bc102cc789289f0eae51e5b416ce1567))
- **metadata:** adding support for multiframe metadata in wadors and wadouri ([#582](https://github.com/cornerstonejs/cornerstone3D-beta/issues/582)) ([7ae983c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7ae983ce33c0f08becd8f5cdafa34956c29defd1))
- **mobile:** modify config for crosshair tool ([#533](https://github.com/cornerstonejs/cornerstone3D-beta/issues/533)) ([50111d2](https://github.com/cornerstonejs/cornerstone3D-beta/commit/50111d20de7d6921ca40813589f6ed0297c4a2f0))
- Modifier keys to enable multiple active tools at once ([#205](https://github.com/cornerstonejs/cornerstone3D-beta/issues/205)) ([51c7965](https://github.com/cornerstonejs/cornerstone3D-beta/commit/51c7965d5b71e8b544d2d5b9f19aef2e2679be19))
- Move adapters from dcmjs for Cornerstone/3d and VTK ([b136a21](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b136a21fb96bb28c3a10a63b6b78083b897f4e19))
- Move IMAGE_RENDERED event triggering to the end of RAF ([#220](https://github.com/cornerstonejs/cornerstone3D-beta/issues/220)) ([a553c05](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a553c0526706a0757eb4f927900071c5262a400a))
- Move to world calculation for segmentations instead of canvas ([0dca280](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0dca280d4b396135112d802bcc712671d1eb8e1b))
- new segmentation demo with petCt ([92923e1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/92923e17024d615ec7b1f62f373fecf1767aac8b))
- **npm:** bump minor version (minor readme edits) ([b48f665](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b48f665893f5e4b643c68ddc2fc3b13c641b6b29))
- option to use Arraybuffer for volume loader instead of sharedArrayBuffer ([#358](https://github.com/cornerstonejs/cornerstone3D-beta/issues/358)) ([ab8237c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ab8237cf6b9672e4837ec27b73b75d38e85305f0))
- **options.beforeSend:** Add headers object and parameters to the beforeSend callback to simplify transfer-syntax specification ([#227](https://github.com/cornerstonejs/cornerstone3D-beta/issues/227)) ([2fdc9bc](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2fdc9bc61463c084d105dfa35412b986ff51ab34))
- orientation on volumeViewport can be optional ([#203](https://github.com/cornerstonejs/cornerstone3D-beta/issues/203)) ([749dcb5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/749dcb59414c1aff2dffdca582fb3df0e4ca5ed7))
- **overlayPlaneMetadata:** Add metadata provider paths for DICOM Overlays ([#240](https://github.com/cornerstonejs/cornerstone3D-beta/issues/240)) ([1f1352d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1f1352de66542409986b60c8e7f2d3d87c9b4114)), closes [cornerstonejs/cornerstoneTools#788](https://github.com/cornerstonejs/cornerstoneTools/issues/788) [cornerstonejs/cornerstoneTools#780](https://github.com/cornerstonejs/cornerstoneTools/issues/780) [cornerstonejs/cornerstoneTools#788](https://github.com/cornerstonejs/cornerstoneTools/issues/788) [cornerstonejs/cornerstoneTools#780](https://github.com/cornerstonejs/cornerstoneTools/issues/780)
- Planar freehand roi tool ([#89](https://github.com/cornerstonejs/cornerstone3D-beta/issues/89)) ([0067339](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0067339e7cf7f6b26e8fd6342113d82eb6915409))
- **PlanarFreehandROI stats:** PlanarFreehandROI stats ([#326](https://github.com/cornerstonejs/cornerstone3D-beta/issues/326)) ([9240862](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9240862f56241ba35b920b951fb867443d068833))
- **planarRotateTool:** rotate tool for volume viewport ([#436](https://github.com/cornerstonejs/cornerstone3D-beta/issues/436)) ([52e5739](https://github.com/cornerstonejs/cornerstone3D-beta/commit/52e57398fd3ddd8404787333e54edeb4ed53dfcb))
- Provide enums for flip direction ([#233](https://github.com/cornerstonejs/cornerstone3D-beta/issues/233)) ([fcff364](https://github.com/cornerstonejs/cornerstone3D-beta/commit/fcff364d179c858c89a1fadc4d39424349b106e6))
- Re-architecture of the segmentation state ([05592f5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/05592f5ce81f83d283779c5e9afc41b23802fddc))
- **readme:** stress need for a PR for npm package ([#310](https://github.com/cornerstonejs/cornerstone3D-beta/issues/310)) ([dafd78d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/dafd78d004ccb9d0b505f0b7e0fd461eda9c3710))
- RectangleRoiThreshold tool now can work in axial, sagittal and coronal ([419aaa8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/419aaa86c246b6e5dfb85c300a838fb75c642c73))
- Refactored RectangleRoiThreshold and improved segmentation example ([4888507](https://github.com/cornerstonejs/cornerstone3D-beta/commit/48885071f90872a4f364c187cb99b5932601c09e))
- remove Scenes from core and tools ([#323](https://github.com/cornerstonejs/cornerstone3D-beta/issues/323)) ([954117d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/954117d87f178fe4cbada478417d927ac436d379))
- remove unnecessary event firing for annotations ([#123](https://github.com/cornerstonejs/cornerstone3D-beta/issues/123)) ([03551d9](https://github.com/cornerstonejs/cornerstone3D-beta/commit/03551d9f9269b7bfd3d828dad4f8f38ef51703d1))
- removed unnecessary event dispatcher for labelmaps ([1285450](https://github.com/cornerstonejs/cornerstone3D-beta/commit/12854503bf3b7ac4b15453aa74fb84314558d6e3))
- Rename libraries for publishing ([#281](https://github.com/cornerstonejs/cornerstone3D-beta/issues/281)) ([5f6e969](https://github.com/cornerstonejs/cornerstone3D-beta/commit/5f6e9691123c91db0ba536750274932a6d1ef51b))
- **renderCanvasGPU:** use gpu to in the renderToCanvas utility ([#586](https://github.com/cornerstonejs/cornerstone3D-beta/issues/586)) ([0b69c86](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0b69c86c6709a32b2d987eee3e81552d8e7adb1b))
- rendering engine should not reset camera on resize ([#273](https://github.com/cornerstonejs/cornerstone3D-beta/issues/273)) ([f1fe501](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f1fe5015eaac736d1a16670e53849ab3d19baddf))
- **rendering:** 16 bit texture support with flag ([#420](https://github.com/cornerstonejs/cornerstone3D-beta/issues/420)) ([f14073e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f14073e13836e33f85a1cf7aec566ab782174def))
- reset to center option for reset camera ([#269](https://github.com/cornerstonejs/cornerstone3D-beta/issues/269)) ([9539f6c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9539f6c56e2bd3b06f4c6b40fd6b4478d806bee3))
- Restructure strategies to be inside configuration of tool instances ([cc0cc79](https://github.com/cornerstonejs/cornerstone3D-beta/commit/cc0cc7948b8c50bdccb53fb2fe4a2fde16095a97))
- ROI threshold to consider two volumes for thresholding ([#325](https://github.com/cornerstonejs/cornerstone3D-beta/issues/325)) ([87362af](https://github.com/cornerstonejs/cornerstone3D-beta/commit/87362af8008b08fd874ffbb5188d415d9a71abdd))
- **ScaleOverlayTool:** Add scale overlay tool ([#386](https://github.com/cornerstonejs/cornerstone3D-beta/issues/386)) ([45d863e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/45d863ede9c46d129443063bde97e0c708cdbf37))
- **scrollEvent:** added out of bounds scroll ([#476](https://github.com/cornerstonejs/cornerstone3D-beta/issues/476)) ([4cf2b63](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4cf2b637da2fc78efcd64acfb2fe5130cf10e368))
- Segmentation architecture improvements ([#330](https://github.com/cornerstonejs/cornerstone3D-beta/issues/330)) ([c603906](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c60390646a2b84bc6e63e4a08c4e97a81601b1d8))
- segmentation examples ([#29](https://github.com/cornerstonejs/cornerstone3D-beta/issues/29)) ([fd95a12](https://github.com/cornerstonejs/cornerstone3D-beta/commit/fd95a12910ffe87a201d5eb94cbae32e95a8be8f))
- Segmentation state restructure to add main representation ([#19](https://github.com/cornerstonejs/cornerstone3D-beta/issues/19)) ([b6eda97](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b6eda97ab77ec244fd2e3a8c7d164efe78a4516f))
- **Segmentation:** Add contour representation for segmentations ([#384](https://github.com/cornerstonejs/cornerstone3D-beta/issues/384)) ([541a351](https://github.com/cornerstonejs/cornerstone3D-beta/commit/541a3519cd78437db020d1bc561d3b2755ec9c7c))
- **segmentation:** segmentation threshold utility ([#487](https://github.com/cornerstonejs/cornerstone3D-beta/issues/487)) ([5325428](https://github.com/cornerstonejs/cornerstone3D-beta/commit/53254285e69a89db23de019d00757b70b8f170ed))
- segmentLocker api and applied review comments ([36c35f4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/36c35f4b4882b3efed84f18b2260c5c96990c36c))
- **sr:** export TID300 - Point class ([#323](https://github.com/cornerstonejs/cornerstone3D-beta/issues/323)) ([d2aebc3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d2aebc3166c23e14dce4d7a8b7f1e2fc933f6328))
- **stackRotate:** Add stack rotate tool ([#329](https://github.com/cornerstonejs/cornerstone3D-beta/issues/329)) ([e2fbf6e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e2fbf6e26b7f63d8923d050d8fff10a4dfad34bb))
- **stackViewport colormap:** setColormapGPU implementation for Stack Viewport ([#549](https://github.com/cornerstonejs/cornerstone3D-beta/issues/549)) ([e282149](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e28214940b71a023fd563d9ab4742562355782ef))
- **StackViewport:** rework rotation for stack viewport ([#388](https://github.com/cornerstonejs/cornerstone3D-beta/issues/388)) ([cfdb0b3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/cfdb0b38e5cfee93f7c0d241a75498e08dcec6e8)), closes [#372](https://github.com/cornerstonejs/cornerstone3D-beta/issues/372)
- **streaming-image-volume:** add caching for image load object ([#567](https://github.com/cornerstonejs/cornerstone3D-beta/issues/567)) ([c721ecd](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c721ecd0a2724fa04c01704a33239e68eac5d0f1))
- **structured-reports:** Add initial work on Adapters / Utilities for Imaging Measurement Structured Report input / output ([#17](https://github.com/cornerstonejs/cornerstone3D-beta/issues/17)) ([941ad75](https://github.com/cornerstonejs/cornerstone3D-beta/commit/941ad75320eece3368104d08247fdc371497c7cd))
- Switch to div instead of canvas for viewports ([2ed5809](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2ed5809610b211961218342564de7e297c3e2af6))
- switch to published calculate-suv ([#328](https://github.com/cornerstonejs/cornerstone3D-beta/issues/328)) ([d6c59af](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d6c59af77ecfa3575a2fe586fd942bece16713c9))
- **testing:** Use the Jest testing framework and switch to GitHub Actions ([#254](https://github.com/cornerstonejs/cornerstone3D-beta/issues/254)) ([a91ff2b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a91ff2babd2c6a44f20ecbd954ab38901276cf41))
- toolGroup configuration refactor ([#340](https://github.com/cornerstonejs/cornerstone3D-beta/issues/340)) ([d20eb1e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d20eb1ebb5b04eeced837a7f8a7dbdb99a2dba0e))
- **tools:** Add invert zoom option ([#574](https://github.com/cornerstonejs/cornerstone3D-beta/issues/574)) ([7d41449](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7d4144957af9f261771283c51a1bfa304802e4fd))
- **Touch:** added touch events to tools ([#247](https://github.com/cornerstonejs/cornerstone3D-beta/issues/247)) ([e35f963](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e35f963717b3909b670f874b38e242a522007e68)), closes [#3](https://github.com/cornerstonejs/cornerstone3D-beta/issues/3)
- **touch:** more optimized touch interactions ([#461](https://github.com/cornerstonejs/cornerstone3D-beta/issues/461)) ([f79f29a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f79f29a2d3885440c511437e03a2b1552eeb51cb))
- Trigger labelmap state updated on config change ([ec9f63c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ec9f63cb63f87ea3c6aa166ef79163f31210a3a8))
- unify the windowLevel and ptThreshold tools ([#322](https://github.com/cornerstonejs/cornerstone3D-beta/issues/322)) ([8d1ecb5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8d1ecb5a8a5e6a9f423a7ab6169b52149318f94a))
- update yarn lock ([0dd87ad](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0dd87addcb3b58536eb14608e57f172bd627d8b9))
- Use vtk upstream copy of half-voxel fix ([666596e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/666596ea764913e78f64963eb7d21a2b07a6e16b))
- **voi:** added support for sigmoid voiLUTFunction for StackViewport and VolumeViewport ([#224](https://github.com/cornerstonejs/cornerstone3D-beta/issues/224)) ([2fcec22](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2fcec22fc7a27cad75d41713339f7e030d653f80))
- volume viewport api with setProperties ([#154](https://github.com/cornerstonejs/cornerstone3D-beta/issues/154)) ([fab3abe](https://github.com/cornerstonejs/cornerstone3D-beta/commit/fab3abe907ddde1ee61bc121c40d4fc23d2dbfd7))
- **volume3d:** add orientation to volume viewport 3d ([#482](https://github.com/cornerstonejs/cornerstone3D-beta/issues/482)) ([55d7f44](https://github.com/cornerstonejs/cornerstone3D-beta/commit/55d7f440a5c75f451e7c893665d1c3d5de2cab2e))
- **volumeLoader:** no need for streaming-wadors imageLoader anymore since streaming volume loader will use cswil wadors image loader ([#340](https://github.com/cornerstonejs/cornerstone3D-beta/issues/340)) ([0b5f785](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0b5f785041a6f92443b58f6d72c8c965a29b35fc))
- **VolumeViewport:** add colormap preset and invert to volume viewport ([#602](https://github.com/cornerstonejs/cornerstone3D-beta/issues/602)) ([f28a392](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f28a3923bba958ed1991dad40ce88d162daa1a6f))
- **VolumeViewport:** Add optional flag to assume fallbacks for ZSpacing for volumes ([#435](https://github.com/cornerstonejs/cornerstone3D-beta/issues/435)) ([162f78a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/162f78a5dc45a4182ffd2edbdcbcdcb2a37e101d))
- **WebWorkers:** Use worker-loader to pull in codecs and web worker ([#264](https://github.com/cornerstonejs/cornerstone3D-beta/issues/264)) ([23c1e58](https://github.com/cornerstonejs/cornerstone3D-beta/commit/23c1e5876e5d19565eaf9f8d10c56190a50561f9))
- wip on circle scissors ([f22dcf2](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f22dcf2bb5834b799bf8f0966979740720408351))

### Performance Improvements

- add option to use RGB instead of RGBA ([#457](https://github.com/cornerstonejs/cornerstone3D-beta/issues/457)) ([0bfea34](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0bfea348d71a53a63751c0a5d21f8bcf2afd4abc))
- **sphereBrush:** tool optimization ([#447](https://github.com/cornerstonejs/cornerstone3D-beta/issues/447)) ([c314bfe](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c314bfe79f2efa9ed44630233ceb06736c735855))
- suv peak calculation on a limited bounding box ([d687d1c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d687d1c43a866179ecd9129d462cf36fc89094cf))

### BREAKING CHANGES

- **codecs, loadImage:** An external dependency must be updated to a higher version.

Co-authored-by: dannyrb <danny.ri.brown@gmail.com>
Co-authored-by: Alireza <ar.sedghi@gmail.com>

- **WebWorkers:** Web worker and codec paths no longer need to be specified, they are pulled in directly inside the library.
