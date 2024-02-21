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

**Note:** Version bump only for package @cornerstonejs/tools

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

**Note:** Version bump only for package @cornerstonejs/tools

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

**Note:** Version bump only for package @cornerstonejs/tools

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

**Note:** Version bump only for package @cornerstonejs/tools

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

**Note:** Version bump only for package @cornerstonejs/tools

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

**Note:** Version bump only for package @cornerstonejs/tools

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

**Note:** Version bump only for package @cornerstonejs/tools

## [1.51.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.51.3...v1.51.4) (2024-02-01)

### Bug Fixes

- **Magnify:** add flag to jump error and unnecessary logic ([#1053](https://github.com/cornerstonejs/cornerstone3D/issues/1053)) ([9b4321c](https://github.com/cornerstonejs/cornerstone3D/commit/9b4321cd59797452453664e9acc1416c5d8ad458))

## [1.51.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.51.2...v1.51.3) (2024-02-01)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.51.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.51.1...v1.51.2) (2024-01-31)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.51.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.51.0...v1.51.1) (2024-01-31)

**Note:** Version bump only for package @cornerstonejs/tools

# [1.51.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.50.3...v1.51.0) (2024-01-26)

### Features

- **contouSeg:** append/remove ([#1029](https://github.com/cornerstonejs/cornerstone3D/issues/1029)) ([29af2e1](https://github.com/cornerstonejs/cornerstone3D/commit/29af2e1a211ae904ac071b46ada48bbf62fb4c33))

## [1.50.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.50.2...v1.50.3) (2024-01-26)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.50.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.50.1...v1.50.2) (2024-01-26)

**Note:** Version bump only for package @cornerstonejs/tools

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

**Note:** Version bump only for package @cornerstonejs/tools

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

**Note:** Version bump only for package @cornerstonejs/tools

## [1.47.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.47.1...v1.47.2) (2024-01-19)

### Bug Fixes

- bug EllipticalROITool ([#1011](https://github.com/cornerstonejs/cornerstone3D/issues/1011)) ([a072ebc](https://github.com/cornerstonejs/cornerstone3D/commit/a072ebc5deddff946aa08feb8b37fa24cab6d03e))

## [1.47.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.47.0...v1.47.1) (2024-01-18)

**Note:** Version bump only for package @cornerstonejs/tools

# [1.47.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.46.0...v1.47.0) (2024-01-18)

### Features

- **annotation:** Add getTargetId method for consistent target identification in viewports ([#1009](https://github.com/cornerstonejs/cornerstone3D/issues/1009)) ([ae653c9](https://github.com/cornerstonejs/cornerstone3D/commit/ae653c935a294e001a099043f4768d1521b7f697))

# [1.46.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.45.1...v1.46.0) (2024-01-16)

**Note:** Version bump only for package @cornerstonejs/tools

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

**Note:** Version bump only for package @cornerstonejs/tools

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

**Note:** Version bump only for package @cornerstonejs/tools

## [1.43.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.43.3...v1.43.4) (2024-01-08)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.43.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.43.2...v1.43.3) (2024-01-08)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.43.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.43.1...v1.43.2) (2024-01-08)

### Bug Fixes

- **WindowLevelTool:** fix window level tool for non-pre-scaled PT images and images with small dynamic range ([#934](https://github.com/cornerstonejs/cornerstone3D/issues/934)) ([e147ecd](https://github.com/cornerstonejs/cornerstone3D/commit/e147ecd96cf194067ac7f76e2542daffe2822f1f))

## [1.43.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.43.0...v1.43.1) (2024-01-08)

**Note:** Version bump only for package @cornerstonejs/tools

# [1.43.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.42.1...v1.43.0) (2024-01-07)

### Bug Fixes

- **segmentation-tools:** Improve rectangle and sphere brushes for non axis aligned images ([#961](https://github.com/cornerstonejs/cornerstone3D/issues/961)) ([3f4496f](https://github.com/cornerstonejs/cornerstone3D/commit/3f4496fee7636707fdaacf525144ff809346b27c))

### Features

- **release:** remove the test to release ([#987](https://github.com/cornerstonejs/cornerstone3D/issues/987)) ([0bddff3](https://github.com/cornerstonejs/cornerstone3D/commit/0bddff3ab156b96b4486655202b182351a95aa52))
- **vtk.js:** Upgrade version and add Segment Select Tool ([#922](https://github.com/cornerstonejs/cornerstone3D/issues/922)) ([d5f6abb](https://github.com/cornerstonejs/cornerstone3D/commit/d5f6abbfd0ca7f868d229696d27f047fb47f99cc))

## [1.42.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.42.0...v1.42.1) (2024-01-03)

**Note:** Version bump only for package @cornerstonejs/tools

# [1.42.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.41.0...v1.42.0) (2023-12-27)

### Features

- **tool:** Bidirectional creation on largest segment slice ([#937](https://github.com/cornerstonejs/cornerstone3D/issues/937)) ([b4ee6bf](https://github.com/cornerstonejs/cornerstone3D/commit/b4ee6bfdad64c208e37183a39681ba80c06ffe85))

# [1.41.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.40.3...v1.41.0) (2023-12-15)

### Features

- **ultrasound regions:** Add new US specific tool and augment length and probe tool to better support US ([#927](https://github.com/cornerstonejs/cornerstone3D/issues/927)) ([2211842](https://github.com/cornerstonejs/cornerstone3D/commit/2211842c990facbd66958aa26839ee53bc974d96))

## [1.40.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.40.2...v1.40.3) (2023-12-14)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.40.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.40.1...v1.40.2) (2023-12-14)

### Bug Fixes

- **livewire:** issue when closing a path ([#946](https://github.com/cornerstonejs/cornerstone3D/issues/946)) ([50b7cdc](https://github.com/cornerstonejs/cornerstone3D/commit/50b7cdc7f633bcc9bf5f73518e88936fa929a0f1))

## [1.40.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.40.0...v1.40.1) (2023-12-14)

### Bug Fixes

- import from the viewportFilters again ([#945](https://github.com/cornerstonejs/cornerstone3D/issues/945)) ([c10ad71](https://github.com/cornerstonejs/cornerstone3D/commit/c10ad71d71c5d7d851674946834f3a6e4c2e8458))

# [1.40.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.39.0...v1.40.0) (2023-12-13)

### Bug Fixes

- Add degree to rad conversion for rotate mouse wheel ([#837](https://github.com/cornerstonejs/cornerstone3D/issues/837)) ([2e09018](https://github.com/cornerstonejs/cornerstone3D/commit/2e09018d1608eb68d93fff64d826fcd51fc0c2d7))

# [1.39.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.38.1...v1.39.0) (2023-12-13)

### Features

- **livewire:** livewire tool ([#941](https://github.com/cornerstonejs/cornerstone3D/issues/941)) ([cadb42b](https://github.com/cornerstonejs/cornerstone3D/commit/cadb42beb3e180629e5e219b235c8aa3faff65be))

## [1.38.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.38.0...v1.38.1) (2023-12-13)

**Note:** Version bump only for package @cornerstonejs/tools

# [1.38.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.37.1...v1.38.0) (2023-12-12)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.37.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.37.0...v1.37.1) (2023-12-11)

**Note:** Version bump only for package @cornerstonejs/tools

# [1.37.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.36.3...v1.37.0) (2023-12-11)

### Features

- **dynamic brush:** Add a dynamic threshold brush tool with preview ([#909](https://github.com/cornerstonejs/cornerstone3D/issues/909)) ([16fe759](https://github.com/cornerstonejs/cornerstone3D/commit/16fe759e618577a86c1b5535801b984d65a9d49d))

## [1.36.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.36.2...v1.36.3) (2023-12-06)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.36.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.36.1...v1.36.2) (2023-12-06)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.36.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.36.0...v1.36.1) (2023-12-06)

**Note:** Version bump only for package @cornerstonejs/tools

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

**Note:** Version bump only for package @cornerstonejs/tools

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

**Note:** Version bump only for package @cornerstonejs/tools

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

**Note:** Version bump only for package @cornerstonejs/tools

# [1.28.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.27.4...v1.28.0) (2023-11-08)

### Features

- **getDataInTime:** to export ijk as well for masks ([#869](https://github.com/cornerstonejs/cornerstone3D/issues/869)) ([6bac1fb](https://github.com/cornerstonejs/cornerstone3D/commit/6bac1fb4a7120b6837b608385060904de4515326))

## [1.27.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.27.3...v1.27.4) (2023-11-06)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.27.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.27.2...v1.27.3) (2023-11-03)

### Bug Fixes

- **camera:** was not updating the viewUp and making the examples searchable in the prompt ([#865](https://github.com/cornerstonejs/cornerstone3D/issues/865)) ([72a3ed6](https://github.com/cornerstonejs/cornerstone3D/commit/72a3ed6b8b10271b1eefe534b139b8ad4d195dd0))

## [1.27.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.27.1...v1.27.2) (2023-10-31)

**Note:** Version bump only for package @cornerstonejs/tools

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

**Note:** Version bump only for package @cornerstonejs/tools

# [1.24.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.23.4...v1.24.0) (2023-10-25)

### Features

- **colorbar:** add viewport colorbar ([#825](https://github.com/cornerstonejs/cornerstone3D/issues/825)) ([9f17218](https://github.com/cornerstonejs/cornerstone3D/commit/9f17218682e3e459962770000e983087204a5133))

## [1.23.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.23.3...v1.23.4) (2023-10-25)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.23.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.23.2...v1.23.3) (2023-10-20)

### Bug Fixes

- **multiframe encapsulated:** take slice of array buffer to worker for decoding ([#667](https://github.com/cornerstonejs/cornerstone3D/issues/667)) ([a7f5b96](https://github.com/cornerstonejs/cornerstone3D/commit/a7f5b969dcc4dcf7998a0515e9ce4d03dd2c3951))

## [1.23.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.23.1...v1.23.2) (2023-10-20)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.23.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.23.0...v1.23.1) (2023-10-20)

**Note:** Version bump only for package @cornerstonejs/tools

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

# [1.21.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.20.3...v1.21.0) (2023-10-10)

### Features

- **advancedMagnifyTool:** advanced magnfying glass ([#816](https://github.com/cornerstonejs/cornerstone3D/issues/816)) ([a76cba9](https://github.com/cornerstonejs/cornerstone3D/commit/a76cba917fd1f67b4fc53ae19f77a7d9a70ba732))

## [1.20.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.20.2...v1.20.3) (2023-10-09)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.20.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.20.1...v1.20.2) (2023-10-09)

### Bug Fixes

- **modality unit:** fix the modality unit per target ([#820](https://github.com/cornerstonejs/cornerstone3D/issues/820)) ([41f06a7](https://github.com/cornerstonejs/cornerstone3D/commit/41f06a76376e399b6344caab5a3b7121bf1584f0))

## [1.20.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.20.0...v1.20.1) (2023-10-06)

**Note:** Version bump only for package @cornerstonejs/tools

# [1.20.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.19.4...v1.20.0) (2023-10-06)

**Note:** Version bump only for package @cornerstonejs/tools

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

**Note:** Version bump only for package @cornerstonejs/tools

## [1.16.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.16.3...v1.16.4) (2023-09-18)

### Bug Fixes

- **segmentation:** stack segmentation remove should return ([#789](https://github.com/cornerstonejs/cornerstone3D/issues/789)) ([7bfe3ca](https://github.com/cornerstonejs/cornerstone3D/commit/7bfe3ca3e58bc0d9e1a6d174095c3935763b0c0b))

## [1.16.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.16.2...v1.16.3) (2023-09-18)

### Bug Fixes

- **Stack prefetch:** should not remove other requests ([#787](https://github.com/cornerstonejs/cornerstone3D/issues/787)) ([c2d6c2c](https://github.com/cornerstonejs/cornerstone3D/commit/c2d6c2c936bd98a58fea4db58558072563000f2f))

## [1.16.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.16.1...v1.16.2) (2023-09-18)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.16.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.16.0...v1.16.1) (2023-09-14)

**Note:** Version bump only for package @cornerstonejs/tools

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

**Note:** Version bump only for package @cornerstonejs/tools

## [1.14.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.14.0...v1.14.1) (2023-09-07)

**Note:** Version bump only for package @cornerstonejs/tools

# [1.14.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.13.3...v1.14.0) (2023-09-07)

### Features

- **nifti:** Add nifti volume loader to cornerstone 3D repo ([#696](https://github.com/cornerstonejs/cornerstone3D/issues/696)) ([c9c2e83](https://github.com/cornerstonejs/cornerstone3D/commit/c9c2e83b2e0614c90c88bd89634f1bcb325d0a00))

## [1.13.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.13.2...v1.13.3) (2023-09-06)

### Bug Fixes

- **brush size:** brush size should be calculated in world not in canvas ([#771](https://github.com/cornerstonejs/cornerstone3D/issues/771)) ([6ca1e3a](https://github.com/cornerstonejs/cornerstone3D/commit/6ca1e3a6d7bc445bbe8aed08a46ec4998f9f8c54))

## [1.13.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.13.1...v1.13.2) (2023-09-05)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.13.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.13.0...v1.13.1) (2023-09-01)

**Note:** Version bump only for package @cornerstonejs/tools

# [1.13.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.12.1...v1.13.0) (2023-08-30)

### Features

- **tools extensibility:** Added statistics calculator for Annotation Tools ([#723](https://github.com/cornerstonejs/cornerstone3D/issues/723)) ([9d96bed](https://github.com/cornerstonejs/cornerstone3D/commit/9d96beda02be8e32770512d815a56966620bb9d6))

## [1.12.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.12.0...v1.12.1) (2023-08-30)

### Bug Fixes

- **modifier key:** reset modifier keys when browser tab loses focus/is hidden ([#759](https://github.com/cornerstonejs/cornerstone3D/issues/759)) ([2602ec6](https://github.com/cornerstonejs/cornerstone3D/commit/2602ec6d69da53590217bd012e6b979fd22204da)), closes [#733](https://github.com/cornerstonejs/cornerstone3D/issues/733)

# [1.12.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.11.4...v1.12.0) (2023-08-29)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.11.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.11.3...v1.11.4) (2023-08-29)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.11.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.11.2...v1.11.3) (2023-08-28)

### Bug Fixes

- **4D utility:** wrong array type returned by getDataInTime ([#754](https://github.com/cornerstonejs/cornerstone3D/issues/754)) ([14ea6c1](https://github.com/cornerstonejs/cornerstone3D/commit/14ea6c1dd77271d1d30698aa0e82994818112b5a))

## [1.11.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.11.1...v1.11.2) (2023-08-22)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.11.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.11.0...v1.11.1) (2023-08-21)

**Note:** Version bump only for package @cornerstonejs/tools

# [1.11.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.10.5...v1.11.0) (2023-08-21)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.10.5](https://github.com/cornerstonejs/cornerstone3D/compare/v1.10.4...v1.10.5) (2023-08-21)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.10.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.10.3...v1.10.4) (2023-08-17)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.10.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.10.2...v1.10.3) (2023-08-15)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.10.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.10.1...v1.10.2) (2023-08-15)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.10.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.10.0...v1.10.1) (2023-08-09)

**Note:** Version bump only for package @cornerstonejs/tools

# [1.10.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.9.3...v1.10.0) (2023-08-02)

### Features

- **toolEvent:** added an event that is triggered when a tool is activated ([#718](https://github.com/cornerstonejs/cornerstone3D/issues/718)) ([c67b61e](https://github.com/cornerstonejs/cornerstone3D/commit/c67b61e8d5dc32a5d454b8c8c9daec3f6e12a7f9))

## [1.9.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.9.2...v1.9.3) (2023-08-02)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.9.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.9.1...v1.9.2) (2023-08-01)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.9.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.9.0...v1.9.1) (2023-07-31)

**Note:** Version bump only for package @cornerstonejs/tools

# [1.9.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.8.1...v1.9.0) (2023-07-28)

### Features

- **voiSync:** add optoins to turn of invert sync for voisync ([#708](https://github.com/cornerstonejs/cornerstone3D/issues/708)) ([4f5b5c3](https://github.com/cornerstonejs/cornerstone3D/commit/4f5b5c36b92161dc103fa7fbc58137dc71c1ae91))

## [1.8.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.8.0...v1.8.1) (2023-07-28)

**Note:** Version bump only for package @cornerstonejs/tools

# [1.8.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.7.2...v1.8.0) (2023-07-28)

### Features

- **segmentation export:** add new cornerstone3D segmentation export adapter ([#692](https://github.com/cornerstonejs/cornerstone3D/issues/692)) ([9e743f5](https://github.com/cornerstonejs/cornerstone3D/commit/9e743f5d2b58dedb17dcbe0de40f42e703f77b14))

## [1.7.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.7.1...v1.7.2) (2023-07-27)

### Bug Fixes

- **SVGCursorDescriptor:** improve CursorSVG typing ([#705](https://github.com/cornerstonejs/cornerstone3D/issues/705)) ([26b854a](https://github.com/cornerstonejs/cornerstone3D/commit/26b854ab2340efc2a6190d48e86cb8e45dd7b442))

## [1.7.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.7.0...v1.7.1) (2023-07-27)

**Note:** Version bump only for package @cornerstonejs/tools

# [1.7.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.6.0...v1.7.0) (2023-07-26)

**Note:** Version bump only for package @cornerstonejs/tools

# [1.6.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.5.0...v1.6.0) (2023-07-21)

### Features

- **calibration:** Add calibration type labels (ERMF, PROJ, USER) ([#638](https://github.com/cornerstonejs/cornerstone3D/issues/638)) ([0aafbc2](https://github.com/cornerstonejs/cornerstone3D/commit/0aafbc2be6f50f4733792b7eb924863ec3200f23))

# [1.5.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.4.6...v1.5.0) (2023-07-18)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.4.6](https://github.com/cornerstonejs/cornerstone3D/compare/v1.4.5...v1.4.6) (2023-07-14)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.4.5](https://github.com/cornerstonejs/cornerstone3D/compare/v1.4.4...v1.4.5) (2023-07-14)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.4.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.4.3...v1.4.4) (2023-07-13)

### Bug Fixes

- **PT measurement units:** Non-SUV scaled, but pre-scaled PTs should show proper units ([#686](https://github.com/cornerstonejs/cornerstone3D/issues/686)) ([e9190df](https://github.com/cornerstonejs/cornerstone3D/commit/e9190df44b29be504b46ebb768e6ad2e6b02bbe3))

## [1.4.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.4.2...v1.4.3) (2023-07-12)

### Bug Fixes

- **ptct:** Jump to click and voisync for volume3d ([#678](https://github.com/cornerstonejs/cornerstone3D/issues/678)) ([8342ff4](https://github.com/cornerstonejs/cornerstone3D/commit/8342ff4e665b9dc1c09af0ca2eddd607d3b1c3a3))

## [1.4.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.4.1...v1.4.2) (2023-07-11)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.4.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.4.0...v1.4.1) (2023-07-04)

### Bug Fixes

- **PET vs PT:** Change all to PT for consistency ([#676](https://github.com/cornerstonejs/cornerstone3D/issues/676)) ([813e5ba](https://github.com/cornerstonejs/cornerstone3D/commit/813e5bac8a615b53cab3640052ce5d9bb7dabc5b))

# [1.4.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.3.0...v1.4.0) (2023-07-04)

**Note:** Version bump only for package @cornerstonejs/tools

# [1.3.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.2.9...v1.3.0) (2023-07-04)

### Features

- **invertSync:** add invert sync to voi sync ([#677](https://github.com/cornerstonejs/cornerstone3D/issues/677)) ([a1dcfbc](https://github.com/cornerstonejs/cornerstone3D/commit/a1dcfbc986a483d650cd2abfdd8f1bba1e3d829a))

## [1.2.9](https://github.com/cornerstonejs/cornerstone3D/compare/v1.2.8...v1.2.9) (2023-07-03)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.2.8](https://github.com/cornerstonejs/cornerstone3D/compare/v1.2.7...v1.2.8) (2023-06-27)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.2.7](https://github.com/cornerstonejs/cornerstone3D/compare/v1.2.6...v1.2.7) (2023-06-20)

### Bug Fixes

- **PlanarFreehandROITool:** trigger event after recalculation of stats ([#665](https://github.com/cornerstonejs/cornerstone3D/issues/665)) ([5a63104](https://github.com/cornerstonejs/cornerstone3D/commit/5a63104cca936b6104b7a7a87409e40363017f9e))

## [1.2.6](https://github.com/cornerstonejs/cornerstone3D/compare/v1.2.5...v1.2.6) (2023-06-14)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.2.5](https://github.com/cornerstonejs/cornerstone3D/compare/v1.2.4...v1.2.5) (2023-06-14)

### Bug Fixes

- **PlanarFreehandROITool:** recalculate stats upon edit ([#607](https://github.com/cornerstonejs/cornerstone3D/issues/607)) ([f193701](https://github.com/cornerstonejs/cornerstone3D/commit/f1937010c982d57aec93e66a2e3e308f851eceec))

## [1.2.4](https://github.com/cornerstonejs/cornerstone3D/compare/v1.2.3...v1.2.4) (2023-06-13)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.2.3](https://github.com/cornerstonejs/cornerstone3D/compare/v1.2.2...v1.2.3) (2023-06-13)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.2.2](https://github.com/cornerstonejs/cornerstone3D/compare/v1.2.1...v1.2.2) (2023-06-13)

### Bug Fixes

- **colormap:** adding new Method to set the opacity of the colormap ([#649](https://github.com/cornerstonejs/cornerstone3D/issues/649)) ([d7e5430](https://github.com/cornerstonejs/cornerstone3D/commit/d7e54301e6e4e7cde6b3a087543b772943884bfa))

## [1.2.1](https://github.com/cornerstonejs/cornerstone3D/compare/v1.2.0...v1.2.1) (2023-06-13)

**Note:** Version bump only for package @cornerstonejs/tools

# [1.2.0](https://github.com/cornerstonejs/cornerstone3D/compare/v1.1.9...v1.2.0) (2023-06-12)

### Features

- **agnleTool:** link textbox to vertex unless moved by user ([#651](https://github.com/cornerstonejs/cornerstone3D/issues/651)) ([d77dff3](https://github.com/cornerstonejs/cornerstone3D/commit/d77dff3c339d46db52a2868feaf12501838e9b96))

## [1.1.9](https://github.com/cornerstonejs/cornerstone3D/compare/v1.1.8...v1.1.9) (2023-06-12)

### Bug Fixes

- **mipJump:** MIP jump to image click ([#645](https://github.com/cornerstonejs/cornerstone3D/issues/645)) ([d81d583](https://github.com/cornerstonejs/cornerstone3D/commit/d81d583d645e69c5d52d4d03a713c0c43d33867f))

## [1.1.8](https://github.com/cornerstonejs/cornerstone3D/compare/v1.1.7...v1.1.8) (2023-06-09)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.1.7](https://github.com/cornerstonejs/cornerstone3D/compare/v1.1.6...v1.1.7) (2023-06-09)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.1.6](https://github.com/cornerstonejs/cornerstone3D-beta/compare/v1.1.5...v1.1.6) (2023-06-01)

### Bug Fixes

- **Cobb Angle:** use the two closest line segment points as the tail of each respectful vector ([#634](https://github.com/cornerstonejs/cornerstone3D-beta/issues/634)) ([8311de3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8311de3baf4f1f759406a3cac3fe0077d818bdbb))

## [1.1.5](https://github.com/cornerstonejs/cornerstone3D-beta/compare/v1.1.4...v1.1.5) (2023-05-23)

### Bug Fixes

- **event:** Interactions between double click and multi mouse button ([#616](https://github.com/cornerstonejs/cornerstone3D-beta/issues/616)) ([3be68c1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/3be68c166ade016793ae8d8c6dbe7bd15dfd07ac))

## [1.1.4](https://github.com/cornerstonejs/cornerstone3D-beta/compare/v1.1.3...v1.1.4) (2023-05-23)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.1.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/v1.1.2...v1.1.3) (2023-05-23)

### Bug Fixes

- **expose:** api default mouse primary ([#622](https://github.com/cornerstonejs/cornerstone3D-beta/issues/622)) ([94be45b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/94be45b501c57435f1a451517200624e32187a02))

## [1.1.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/v1.1.1...v1.1.2) (2023-05-23)

**Note:** Version bump only for package @cornerstonejs/tools

## [1.1.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/v1.1.0...v1.1.1) (2023-05-23)

**Note:** Version bump only for package @cornerstonejs/tools

# [1.1.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/v0.103.0...v1.1.0) (2023-05-22)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.103.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/v0.102.0...v0.103.0) (2023-05-22)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.102.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/v0.101.0...v0.102.0) (2023-05-22)

**Note:** Version bump only for package @cornerstonejs/tools

# 0.101.0 (2023-05-22)

### Bug Fixes

- Add coplanar check in stackImageSync callback ([#335](https://github.com/cornerstonejs/cornerstone3D-beta/issues/335)) ([f806177](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f806177d628664150b02e941c3a802b58bdc5293))
- add extra missing exports and no static code block at build ([#179](https://github.com/cornerstonejs/cornerstone3D-beta/issues/179)) ([dfdc4bf](https://github.com/cornerstonejs/cornerstone3D-beta/commit/dfdc4bfbf331da40368a4976f3dc199bd355864a))
- add src folder to package json to improve source maps ([#499](https://github.com/cornerstonejs/cornerstone3D-beta/issues/499)) ([aea4406](https://github.com/cornerstonejs/cornerstone3D-beta/commit/aea4406d4e8f1a415399481657373cd2d2d25523))
- AngleTool not working after cancellation ([#342](https://github.com/cornerstonejs/cornerstone3D-beta/issues/342)) ([a82c0bc](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a82c0bc0e8beb6d47131ad2cd5040b93b02f2de9))
- annotation hidden on horizontal and vertical ([#205](https://github.com/cornerstonejs/cornerstone3D-beta/issues/205)) ([9e825fd](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9e825fd3d37ecfdf1722da9cd2fd6a1a75995459))
- annotation rendering engine on viewport removal ([#303](https://github.com/cornerstonejs/cornerstone3D-beta/issues/303)) ([aeb205e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/aeb205e56e0d2068258c278863aa3d7447331a43))
- annotation unit hydration bug and more color image support ([#151](https://github.com/cornerstonejs/cornerstone3D-beta/issues/151)) ([4f157dc](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4f157dc5d7a8d0d80abb5b68c35ed17cb5f349ed))
- annotations throwing error when stack and volume viewports are converted ([#195](https://github.com/cornerstonejs/cornerstone3D-beta/issues/195)) ([ed23f05](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ed23f05b23063769942328f9e6797d792767ec49))
- **annotations:** fix triggering of 'ANNOTATION_ADDED' event multiple times ([#570](https://github.com/cornerstonejs/cornerstone3D-beta/issues/570)) ([#584](https://github.com/cornerstonejs/cornerstone3D-beta/issues/584)) ([f8e75f3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f8e75f3d236da91c2710b4742ff2c2047e3e0e3c))
- **arrowTool:** trigger ANNOTATION_MODIFIED event on ArrowAnnotate Tool ([#610](https://github.com/cornerstonejs/cornerstone3D-beta/issues/610)) ([b67c3b8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b67c3b860196d0d54021d1652b5a128ad97a62d4))
- Attempt to fix build issues [@haehn](https://github.com/haehn) has reported ([#144](https://github.com/cornerstonejs/cornerstone3D-beta/issues/144)) ([2a7ec92](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2a7ec9271e012929682aa5c0a860cd65d0d5c02d))
- Attempt to resolve incompatible peerDeps situation ([#98](https://github.com/cornerstonejs/cornerstone3D-beta/issues/98)) ([00f141b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/00f141bfa9f9a4b37c016d726a6d31f2330e2e44))
- bidirectional tool when short and long axis changes ([#309](https://github.com/cornerstonejs/cornerstone3D-beta/issues/309)) ([f973e72](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f973e7262897a2daf4f37363d3e818ae88620bb8))
- **calibration:** Apply the calibration update only once ([#577](https://github.com/cornerstonejs/cornerstone3D-beta/issues/577)) ([0641930](https://github.com/cornerstonejs/cornerstone3D-beta/commit/06419303b5bf8901645f4c74bc25cb8eabf279c8))
- Camera events for flip and rotation changes ([#83](https://github.com/cornerstonejs/cornerstone3D-beta/issues/83)) ([82115ec](https://github.com/cornerstonejs/cornerstone3D-beta/commit/82115ec00bd924fb942473d04052473408b84eb7))
- **Circle and VolumeViewport:** fixes to ensure measurements are rendered properly ([#609](https://github.com/cornerstonejs/cornerstone3D-beta/issues/609)) ([293e6b1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/293e6b18e9d9306043aac8e23a5955b6e44fad0d))
- cleanup exports, add docs and more tutorials ([#39](https://github.com/cornerstonejs/cornerstone3D-beta/issues/39)) ([743dea8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/743dea89c7a726c29d396756bdd991c81e561105))
- Cleanup magnify canvas on mouse up ([#135](https://github.com/cornerstonejs/cornerstone3D-beta/issues/135)) ([6fd0c3f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6fd0c3fe114586f9e7ac0ab1f448b6c5199d1f7a))
- **contour:** remove contour was using wrong uid ([#575](https://github.com/cornerstonejs/cornerstone3D-beta/issues/575)) ([a6892a5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a6892a5131dfdfecd5edeed6f9e633742bba2fb6))
- coronal view should not be flipped ([#321](https://github.com/cornerstonejs/cornerstone3D-beta/issues/321)) ([a85a867](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a85a86785de9f225154829a4934926143c86eb5e))
- Correct module property for ESM builds in package.json ([#66](https://github.com/cornerstonejs/cornerstone3D-beta/issues/66)) ([d53b857](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d53b8575aa8b93907f8bf127f36d9dfc10821478))
- could not access 'index' before initialization ([#337](https://github.com/cornerstonejs/cornerstone3D-beta/issues/337)) ([f4b7ff8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f4b7ff8a147a2fbebac3ae66d0b24f28c1910387))
- **cpu:** could not render if switched to cpu in the middle ([#615](https://github.com/cornerstonejs/cornerstone3D-beta/issues/615)) ([6b1d588](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6b1d588616dd7b7ab3358583414728a13225156a))
- **crosshairs:** Autopan causing infinite loop ([#551](https://github.com/cornerstonejs/cornerstone3D-beta/issues/551)) ([e54dfb3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e54dfb32d24af0f504768976eaa80a84fcfc6af0))
- **crosshairs:** Reference lines are wrongly clipped ([#552](https://github.com/cornerstonejs/cornerstone3D-beta/issues/552)) ([0bc2134](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0bc2134754762c61b72824943c506be7396887b8))
- **demoData:** The URL was pointing to a private AWS account ([#175](https://github.com/cornerstonejs/cornerstone3D-beta/issues/175)) ([69dafea](https://github.com/cornerstonejs/cornerstone3D-beta/commit/69dafea902dcd224ea5d1d6d418d5e0c1cec2fe0))
- Double click and multi-key bindings ([#571](https://github.com/cornerstonejs/cornerstone3D-beta/issues/571)) ([ebc0cf8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ebc0cf8f8164070e67bdfc09fc13a58c64a7d1c1))
- **doubleClick:** mouseDoubleClickIgnoreListener is now added to each viewport element instead of the document element ([#429](https://github.com/cornerstonejs/cornerstone3D-beta/issues/429)) ([360e2a9](https://github.com/cornerstonejs/cornerstone3D-beta/commit/360e2a9fa2efa690d2e4baec424699a6c66af4a2)), closes [#375](https://github.com/cornerstonejs/cornerstone3D-beta/issues/375)
- **doubleClick:** moved the mouse click/down timeout detection back into ([#417](https://github.com/cornerstonejs/cornerstone3D-beta/issues/417)) ([99eea67](https://github.com/cornerstonejs/cornerstone3D-beta/commit/99eea6795b4ded35d9fd9549e7208ce8c09a9ada))
- **doubleClick:** moved the mouse click/down timeout detection into \_doMouseDown ([#416](https://github.com/cornerstonejs/cornerstone3D-beta/issues/416)) ([ebd8f7b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ebd8f7b1aa2c311a6172e360d24a23ad256c5e24))
- drag probe appearing unnecessarily on all viewports ([#204](https://github.com/cornerstonejs/cornerstone3D-beta/issues/204)) ([c292c05](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c292c05eecf17a6edbdcab5aa5a604304ef3d2e5))
- Elliptical roi when in flipped/rotated state ([#479](https://github.com/cornerstonejs/cornerstone3D-beta/issues/479)) ([f0961ae](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f0961ae6f5e912230f2bf17be5acfe30f775bcae))
- Ensure d3 packages are also listed on dependencies ([#146](https://github.com/cornerstonejs/cornerstone3D-beta/issues/146)) ([5747dc6](https://github.com/cornerstonejs/cornerstone3D-beta/commit/5747dc6cbcb05eec690bf636ef733789c88f959f))
- filter planarFreeHandeROI based on parallel normals instead of equal normals. ([#315](https://github.com/cornerstonejs/cornerstone3D-beta/issues/315)) ([70e4ffa](https://github.com/cornerstonejs/cornerstone3D-beta/commit/70e4ffa0c28ed293473c6674d7b158c644f9b1be))
- floodFill export in tools ([#362](https://github.com/cornerstonejs/cornerstone3D-beta/issues/362)) ([700baa3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/700baa349f59c12b4a10979b580ee3afd9637f9e))
- get correct imageData with targetId in BaseTool ([#294](https://github.com/cornerstonejs/cornerstone3D-beta/issues/294)) ([6e8e51b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6e8e51b4b3dde358134fcc7493237a59bec687ab))
- htj2k and keymodifier ([#313](https://github.com/cornerstonejs/cornerstone3D-beta/issues/313)) ([48bd8a1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/48bd8a14b81e31cba9f3237b0b68b7082bd66892))
- If planar annotation is not visible, filter it ([#318](https://github.com/cornerstonejs/cornerstone3D-beta/issues/318)) ([ea8e32a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ea8e32a768d3f2d43fc0f1bc9b29388101825ad2))
- invalid keybindings Alt and Ctrl ([#176](https://github.com/cornerstonejs/cornerstone3D-beta/issues/176)) ([d74d696](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d74d696b5de5fe1cd1fb6d36a32660c60140caa0))
- js exception prevention - safe programming only ([#600](https://github.com/cornerstonejs/cornerstone3D-beta/issues/600)) ([bbd2ff4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/bbd2ff4ab8cc9ac13f4b98f5cf589d6ff83b5eb3))
- jumpToSlice and scaling of images in renderToCanvas ([#78](https://github.com/cornerstonejs/cornerstone3D-beta/issues/78)) ([bbebf7f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/bbebf7fbad28e670333783cd669e571ec2ae7358))
- large image rendering, missing metadata for StackViewport, high DPI devices ([#127](https://github.com/cornerstonejs/cornerstone3D-beta/issues/127)) ([d4bf1c8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d4bf1c80391bcecaee64d9eb086416c42aa406e2))
- limit disabled element not need to render for annotations ([#289](https://github.com/cornerstonejs/cornerstone3D-beta/issues/289)) ([8232ed0](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8232ed00ee42ab3fd837ab2c5a75b2128c8f87a6))
- make typescript strict true ([#162](https://github.com/cornerstonejs/cornerstone3D-beta/issues/162)) ([7c311f7](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7c311f77f0532372ae82b6be2027bcd25925fa0d))
- **mobile:** Crosshairs highlighted for mobile ([#493](https://github.com/cornerstonejs/cornerstone3D-beta/issues/493)) ([22309aa](https://github.com/cornerstonejs/cornerstone3D-beta/commit/22309aa2519d4c543ad28920d6ff82906cc8af1c))
- mouse-up should not unhighlight annotations ([#305](https://github.com/cornerstonejs/cornerstone3D-beta/issues/305)) ([0ca9653](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0ca96533d253c35534c9820e4174b54270483d5e))
- **mouse:** Avoid the delay on double click checking for right click ([#560](https://github.com/cornerstonejs/cornerstone3D-beta/issues/560)) ([2c86500](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2c8650001e19355bf856e8e475121bbd99feb18d))
- **multiframe:** fix frameNumber for pixelData and windowlevel issue ([#603](https://github.com/cornerstonejs/cornerstone3D-beta/issues/603)) ([6bf51b1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6bf51b148bbff008bf0bc63b8de4fa375eaad625))
- **planarFreehandROITool:** proper handling of pure movements on y-axis ([#590](https://github.com/cornerstonejs/cornerstone3D-beta/issues/590)) ([33635fa](https://github.com/cornerstonejs/cornerstone3D-beta/commit/33635fad566ccbb9c5b0441957726c11aab80901))
- reference line exports and add cpu demo ([#297](https://github.com/cornerstonejs/cornerstone3D-beta/issues/297)) ([e20d0b2](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e20d0b25c5ff0aafab4fa541b38815b4bee412b2))
- Remove resemblejs from dependencies, add detect-gpu, clonedeep, CWIL ([#73](https://github.com/cornerstonejs/cornerstone3D-beta/issues/73)) ([db65d50](https://github.com/cornerstonejs/cornerstone3D-beta/commit/db65d50a5c7488f323ab2424cf9d750055b2e6d5))
- remove the need for slabThickness in volumeAPI for tools ([#113](https://github.com/cornerstonejs/cornerstone3D-beta/issues/113)) ([a5e431d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a5e431dee952281be340994aa773a593a85fad04))
- rename ArrowTool to ArrowAnnotate ([#91](https://github.com/cornerstonejs/cornerstone3D-beta/issues/91)) ([9bd0cd8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9bd0cd882746df909ee76549bc9818834ccc2ee3))
- **rendering:** should still use Float32 when not 16 bit for scaling issues ([#501](https://github.com/cornerstonejs/cornerstone3D-beta/issues/501)) ([448baf2](https://github.com/cornerstonejs/cornerstone3D-beta/commit/448baf2086ef28b8eedc90ab46e0fee54cf7ac9e))
- resetCamera and annotations for flipped viewports ([#278](https://github.com/cornerstonejs/cornerstone3D-beta/issues/278)) ([cabefce](https://github.com/cornerstonejs/cornerstone3D-beta/commit/cabefcefcba463abb1ea9bf346a2f755b2494aed))
- revert synchronizer event firing being unnecessary async ([#299](https://github.com/cornerstonejs/cornerstone3D-beta/issues/299)) ([1e244d1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1e244d11778d74b66df671f936138c73adb5a699))
- scale factor for zoom in perspective mode and do not update clipping planes for non Volume Actors ([#116](https://github.com/cornerstonejs/cornerstone3D-beta/issues/116)) ([ce8c13e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ce8c13e534a48392fc11dcb615d8d81275cd01d7))
- **scroll:** Scrolling failed to find the volume with segmentation ([#470](https://github.com/cornerstonejs/cornerstone3D-beta/issues/470)) ([79b8c96](https://github.com/cornerstonejs/cornerstone3D-beta/commit/79b8c96f111563dd0850f72d89e7c43e8b0cbd5c))
- **scroll:** was not able to scroll back ([#593](https://github.com/cornerstonejs/cornerstone3D-beta/issues/593)) ([f934e21](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f934e21769655ea82b9cdc0cf1f34a40a5d87d82))
- **segmentation:** Do not render inapplicable segmentations ([#545](https://github.com/cornerstonejs/cornerstone3D-beta/issues/545)) ([1b9d28c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1b9d28c0de1ccec5b517ff816488571ae1602adc))
- **segmentation:** segmentation could not render segment while invisible ([#477](https://github.com/cornerstonejs/cornerstone3D-beta/issues/477)) ([199b139](https://github.com/cornerstonejs/cornerstone3D-beta/commit/199b1390f367c42b49c1a7ba01ab0f176d0789f4))
- **segmentationVisibility:** Improve performance for `getSegmentationIndices` ([#556](https://github.com/cornerstonejs/cornerstone3D-beta/issues/556)) ([c02d31c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c02d31c739a2b319a5c815bda404a12dcba65bd1))
- **segmentColor:** should be able to change initial segment color for render ([#535](https://github.com/cornerstonejs/cornerstone3D-beta/issues/535)) ([0a81736](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0a8173671315eff3bf2b52d079cde9a604208fa1))
- selection API, requestPoolManager and VOI and Scaling ([#82](https://github.com/cornerstonejs/cornerstone3D-beta/issues/82)) ([bedd8dd](https://github.com/cornerstonejs/cornerstone3D-beta/commit/bedd8ddfa356c2d52a6e72f74c7cb3bb660a86ef))
- shadow for annotations and stack viewport targetImageIdIndex bug ([#189](https://github.com/cornerstonejs/cornerstone3D-beta/issues/189)) ([be70be7](https://github.com/cornerstonejs/cornerstone3D-beta/commit/be70be70a543fffb18f7d05c69e16d5c0255a57e))
- stackScroll should honor invert configuration ([#234](https://github.com/cornerstonejs/cornerstone3D-beta/issues/234)) ([aa8f1c4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/aa8f1c4de6837b3438ef62ae48d3412b4d3847bf))
- **stackViewport:** better error handling for disabled viewports ([#605](https://github.com/cornerstonejs/cornerstone3D-beta/issues/605)) ([2b144a2](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2b144a2ae58d27d51935a674497437cabb7a4a3d))
- **stackviewport:** swap image row and column pixel spacing ([#561](https://github.com/cornerstonejs/cornerstone3D-beta/issues/561)) ([aede776](https://github.com/cornerstonejs/cornerstone3D-beta/commit/aede776ac6475f47a187db1f2ab5b2700192d466))
- **suv display:** fix scaling of non-SUV PT images ([#536](https://github.com/cornerstonejs/cornerstone3D-beta/issues/536)) ([f9182f0](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f9182f076d9d5f3af4989550b9549aeaa2792466))
- **svg:** find and reset svg-layer within the correct element ([#387](https://github.com/cornerstonejs/cornerstone3D-beta/issues/387)) ([3e0829e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/3e0829e35f19bef3601ee9f197dbf6d87bc01fcf))
- tool bindings with different modifier keys ([#377](https://github.com/cornerstonejs/cornerstone3D-beta/issues/377)) ([c95ba60](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c95ba60e0045eac33e889985e2a340f2ce543dc2))
- toolGroup default cursor ([#120](https://github.com/cornerstonejs/cornerstone3D-beta/issues/120)) ([8c385c4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8c385c4780cbaf40400fffc310fd1e3b86056767))
- toolName typo for Crosshairs tool ([#193](https://github.com/cornerstonejs/cornerstone3D-beta/issues/193)) ([46d13bc](https://github.com/cornerstonejs/cornerstone3D-beta/commit/46d13bcb047c2b71c17b0246359d9494fbd8fb89))
- **tools:** Some older annotations were missing normal ([#528](https://github.com/cornerstonejs/cornerstone3D-beta/issues/528)) ([319822a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/319822acdd99da5f75eb716588ebfe9ec2090e76))
- **trackball:** rotate was wrong on mouse drag ([#424](https://github.com/cornerstonejs/cornerstone3D-beta/issues/424)) ([99c1a0a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/99c1a0a35dd52ddec26551de75656cdda7149b39))
- unexpected token problem for typescript for tools ([#360](https://github.com/cornerstonejs/cornerstone3D-beta/issues/360)) ([7844798](https://github.com/cornerstonejs/cornerstone3D-beta/commit/78447981ed583ef97f8f7cbed247cd6c3b1419a6))
- unify handling of annotation units and remove 'MO' ([#161](https://github.com/cornerstonejs/cornerstone3D-beta/issues/161)) ([7fddeab](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7fddeab0f686fce5dc0e9c6953025ff14c00e252))
- use one actor for a contourset rendering ([#432](https://github.com/cornerstonejs/cornerstone3D-beta/issues/432)) ([c92f8be](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c92f8beafb6731eb0b81ef295ff2774192cfd7ed))
- Use queryselector instead of firstChild to get svg-layer ([#268](https://github.com/cornerstonejs/cornerstone3D-beta/issues/268)) ([1dd315c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1dd315c61476f7bca5640033f530bcc956d14307))
- **versioning:** sync all versions ([#623](https://github.com/cornerstonejs/cornerstone3D-beta/issues/623)) ([36b2e91](https://github.com/cornerstonejs/cornerstone3D-beta/commit/36b2e912a627a018f242cc433a9382946097a14f))
- viewRight was calculated wrong for tools ([#255](https://github.com/cornerstonejs/cornerstone3D-beta/issues/255)) ([cf536df](https://github.com/cornerstonejs/cornerstone3D-beta/commit/cf536df66c05b4c4385ad18ad814d1dac1c8ad77))
- **voi:** stack viewport should prioritize image metadata for windowlevel and not persist ([#454](https://github.com/cornerstonejs/cornerstone3D-beta/issues/454)) ([420c812](https://github.com/cornerstonejs/cornerstone3D-beta/commit/420c8121cb0cdc4c321013ca807c6ca32901d7a6))
- wadouri metadata was not using scaling parameters properly ([#159](https://github.com/cornerstonejs/cornerstone3D-beta/issues/159)) ([d21aba5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d21aba56f1e0a8730088d89a4dfde8358d978a60))
- Webpack externals were not properly defined ([70499a5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/70499a55c5824b3f94920ffd48411118e6fe4bb8))
- windowLevel event trigger and initial voi range ([#81](https://github.com/cornerstonejs/cornerstone3D-beta/issues/81)) ([38307d4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/38307d40cec60f2b3b8497abda8aa4fa657fc179))
- **windowLevelTool:** WWWL multipler too high when burned in pixels are present ([#462](https://github.com/cornerstonejs/cornerstone3D-beta/issues/462)) ([47bfa46](https://github.com/cornerstonejs/cornerstone3D-beta/commit/47bfa46caa563bfc131487bac0c5c517e65128bf))
- wrong ushape calculation when loading SR/freehand from server ([#199](https://github.com/cornerstonejs/cornerstone3D-beta/issues/199)) ([ce0c5c9](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ce0c5c9b1c2ef7df9d571c113f37571261cad26f))
- ZoomTool fix for polyData actors with no imageData ([#308](https://github.com/cornerstonejs/cornerstone3D-beta/issues/308)) ([1350eca](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1350eca3cdc8d456642c6497dd2b2460a3584c7e))
- zoomTool should not consume the preMouse event ([#196](https://github.com/cornerstonejs/cornerstone3D-beta/issues/196)) ([8ec505a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8ec505a3e2b55d74f5ad3af6159e83398017b87b))

### Features

- **3d from 4d:** 3D image generation from 4D ([#502](https://github.com/cornerstonejs/cornerstone3D-beta/issues/502)) ([9217691](https://github.com/cornerstonejs/cornerstone3D-beta/commit/921769132398756fe192e266bcc9a09b98e0e733))
- **4d utility:** getDataInTime from 4D data ([#460](https://github.com/cornerstonejs/cornerstone3D-beta/issues/460)) ([57bd947](https://github.com/cornerstonejs/cornerstone3D-beta/commit/57bd947b5385f922ed6bdbab940c56dfd245c8b1))
- **4D:** added support for 4D data rendering ([#438](https://github.com/cornerstonejs/cornerstone3D-beta/issues/438)) ([975e596](https://github.com/cornerstonejs/cornerstone3D-beta/commit/975e59629125fbf0ba5ea676fa14b71a2b30ca44))
- **4D:** fixed cine play issue and added getDynamicVolumeInfo method ([#562](https://github.com/cornerstonejs/cornerstone3D-beta/issues/562)) ([f4c2531](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f4c25316eb1c5a6b13edb7c0873c9b0ce7a4e581))
- **adapters:** Add adapters for Rectangle, Angle and fix generate DICOM ([#427](https://github.com/cornerstonejs/cornerstone3D-beta/issues/427)) ([b8ca75e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b8ca75e6ba378f175bd987d07f094f44b41a46cf))
- Add a basic Brush tool ([6358b12](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6358b126c9d03bd349f864cec53d22c92f8b1405))
- Add a CircleROI tool ([#459](https://github.com/cornerstonejs/cornerstone3D-beta/issues/459)) ([1c03ed3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1c03ed3457fbb63bbd87315b90bfed99b1cd09cc))
- Add AngleTool and MagnifyTool ([#97](https://github.com/cornerstonejs/cornerstone3D-beta/issues/97)) ([2c4c800](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2c4c800c4b3ba92164f728865b904933a2539210))
- Add annotation completed event ([#84](https://github.com/cornerstonejs/cornerstone3D-beta/issues/84)) ([cd574da](https://github.com/cornerstonejs/cornerstone3D-beta/commit/cd574da73403e3030a5bc414778e08536fb77381))
- add annotation display Tool ([#283](https://github.com/cornerstonejs/cornerstone3D-beta/issues/283)) ([e4a0324](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e4a0324840f8f5ac29f9db292e8df0c59ee69322))
- Add ArrowTool and remove toolName from drawing API ([#88](https://github.com/cornerstonejs/cornerstone3D-beta/issues/88)) ([217637c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/217637cb2a48ca6e73cea7d1781a4a83fc482e79))
- Add CINE tool via playClip ([#99](https://github.com/cornerstonejs/cornerstone3D-beta/issues/99)) ([916d783](https://github.com/cornerstonejs/cornerstone3D-beta/commit/916d783a56a7abc2a46c7477e2685ad436ad3637))
- Add Clipping planes for rendering ([#110](https://github.com/cornerstonejs/cornerstone3D-beta/issues/110)) ([1a6e4c7](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1a6e4c742a3b89a88b46fd98d6cbeca5c95918aa))
- add crosshairs example and fix locking ([#40](https://github.com/cornerstonejs/cornerstone3D-beta/issues/40)) ([fe9ec50](https://github.com/cornerstonejs/cornerstone3D-beta/commit/fe9ec50a61c16a2f3655b1dbb405fa7e2ec2438f))
- add data id to length and rectangle svg for e2e tests ([#240](https://github.com/cornerstonejs/cornerstone3D-beta/issues/240)) ([3c4e023](https://github.com/cornerstonejs/cornerstone3D-beta/commit/3c4e02305423c59ddcad5d2551cd2ca629738eea))
- add multiframe example ([#331](https://github.com/cornerstonejs/cornerstone3D-beta/issues/331)) ([327f17a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/327f17a551f869c8f454566782be720367291235))
- Add new 3D volume viewport ([#281](https://github.com/cornerstonejs/cornerstone3D-beta/issues/281)) ([57cf7ac](https://github.com/cornerstonejs/cornerstone3D-beta/commit/57cf7ac3bfd83d35d68f54b1f00f03583ed8e998))
- add reference lines tool ([#292](https://github.com/cornerstonejs/cornerstone3D-beta/issues/292)) ([c56df91](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c56df91a64ec005656f940dd3728f476152fa917))
- add referenceCursors tool ([#275](https://github.com/cornerstonejs/cornerstone3D-beta/issues/275)) ([3303246](https://github.com/cornerstonejs/cornerstone3D-beta/commit/3303246836c81efb51e5d5e70c1a8801fbcb019a))
- add scrollToSlice for element ([#76](https://github.com/cornerstonejs/cornerstone3D-beta/issues/76)) ([c43fe8f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c43fe8f955930a70be60015f2f6bc1d5bf9fffbb))
- Add segmentSpecificConfiguration and add outlineOpacity config for Segmentation ([#285](https://github.com/cornerstonejs/cornerstone3D-beta/issues/285)) ([92fb495](https://github.com/cornerstonejs/cornerstone3D-beta/commit/92fb49594cfc3219f761e905ba765acaddbe1e1a))
- add stack synchronization within or across studies ([#291](https://github.com/cornerstonejs/cornerstone3D-beta/issues/291)) ([f38bec0](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f38bec06713265cee361fc905539aa5ed841e707))
- Add toolStyles configuration and DragProbe ([#93](https://github.com/cornerstonejs/cornerstone3D-beta/issues/93)) ([ba15be6](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ba15be6d268b8c568bdf0e247e571f5ca29a26ad))
- Add VOLUME_NEW_IMAGE event and Add jumpToSlice and default VOI for volume viewport ([#104](https://github.com/cornerstonejs/cornerstone3D-beta/issues/104)) ([d36a23a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d36a23a4eaf5bafcc8dddc0ab796065098df616a))
- advanced examples ([#38](https://github.com/cornerstonejs/cornerstone3D-beta/issues/38)) ([27f26a1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/27f26a12a1712b7542cc66ab1d077cfb0da50a86))
- **annotations:** rework annotation manager api and enable multi-manager setup ([#442](https://github.com/cornerstonejs/cornerstone3D-beta/issues/442)) ([60bd013](https://github.com/cornerstonejs/cornerstone3D-beta/commit/60bd0132785744c55cd52b6a7dfc4ee56408d373))
- Brush on mouse move ([#20](https://github.com/cornerstonejs/cornerstone3D-beta/issues/20)) ([4a08cce](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4a08cce5e6cc2e9715367c233ab272bd259ca7d1))
- cachedStats to store imageId and volumeId ([#75](https://github.com/cornerstonejs/cornerstone3D-beta/issues/75)) ([a2404c4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a2404c4f1cb15a3935ba3af58fa7fc556716458c))
- camera sync canvas relative ([#167](https://github.com/cornerstonejs/cornerstone3D-beta/issues/167)) ([2fd6c98](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2fd6c9830eb6e9da10960de0c25702b06716382a))
- **cine:** added support for 4D volumes ([#471](https://github.com/cornerstonejs/cornerstone3D-beta/issues/471)) ([4e62137](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4e62137004a340420d7c5c56c6ad5bebb7a8021c)), closes [#470](https://github.com/cornerstonejs/cornerstone3D-beta/issues/470)
- **CobbAngle:** Add CobbAngle tool ([#353](https://github.com/cornerstonejs/cornerstone3D-beta/issues/353)) ([b9bd701](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b9bd701df41ae2b8b2afbcf1d092d7587f7b267a))
- **contour api:** add api for contour rendering configuration ([#443](https://github.com/cornerstonejs/cornerstone3D-beta/issues/443)) ([4ab751d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4ab751df4082c56b64e4b97e9d6ca6de3c60c7e5))
- **contour:** improved performance and better configuration ([#543](https://github.com/cornerstonejs/cornerstone3D-beta/issues/543)) ([c69c58a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c69c58a171f1dc24d94aded51bbdffa3775c7e6e))
- **crosshairs:** Make the reference lines gap configurable ([#557](https://github.com/cornerstonejs/cornerstone3D-beta/issues/557)) ([be91ab8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/be91ab87d89f5e8079e1073a504a07a0d53373a8))
- **dicomImageLoader types:** Add types to the dicom image loader ([#441](https://github.com/cornerstonejs/cornerstone3D-beta/issues/441)) ([10a3370](https://github.com/cornerstonejs/cornerstone3D-beta/commit/10a3370b7f23084d1f2c55506079c17dea959659)), closes [#449](https://github.com/cornerstonejs/cornerstone3D-beta/issues/449) [#450](https://github.com/cornerstonejs/cornerstone3D-beta/issues/450)
- **dicomImageLoader:** make cornerstone to use new dicom image loader and handle scaling correctly ([#553](https://github.com/cornerstonejs/cornerstone3D-beta/issues/553)) ([a01687a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a01687ab925c469bf979d6f2089d2e8f31c28e75))
- **doubleClick:** Add Double click detection ([#375](https://github.com/cornerstonejs/cornerstone3D-beta/issues/375)) ([#382](https://github.com/cornerstonejs/cornerstone3D-beta/issues/382)) ([8e4be96](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8e4be962c8f9d6c226095a573905087842995f89))
- draw center point of the ellipticalROI tool and make it configurable ([#191](https://github.com/cornerstonejs/cornerstone3D-beta/issues/191)) ([b0ad00c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b0ad00ce263d55214e1b3d61e51e319c63d11c42)), closes [#190](https://github.com/cornerstonejs/cornerstone3D-beta/issues/190) [#190](https://github.com/cornerstonejs/cornerstone3D-beta/issues/190) [#190](https://github.com/cornerstonejs/cornerstone3D-beta/issues/190) [#190](https://github.com/cornerstonejs/cornerstone3D-beta/issues/190) [#190](https://github.com/cornerstonejs/cornerstone3D-beta/issues/190) [#190](https://github.com/cornerstonejs/cornerstone3D-beta/issues/190)
- enable having multiple instances of the same tool and add more seg tools ([#327](https://github.com/cornerstonejs/cornerstone3D-beta/issues/327)) ([7ff05c5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7ff05c5519243632d9d9113e3c84cf9e10725193))
- improved example runner to handle casing and partial match ([#347](https://github.com/cornerstonejs/cornerstone3D-beta/issues/347)) ([9e8fa12](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9e8fa122f766c1fceff4e3d4fe3cd0f68963c92b))
- improved stack prefetch and zoom to mouse ([#121](https://github.com/cornerstonejs/cornerstone3D-beta/issues/121)) ([bc72d37](https://github.com/cornerstonejs/cornerstone3D-beta/commit/bc72d37b10f5a9e3e2bc9ed1254a707047f04f45))
- improved threshold volume API and refactored boundingBox utils ([#117](https://github.com/cornerstonejs/cornerstone3D-beta/issues/117)) ([adc308b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/adc308bef0509852bc48c96114eb3268c3d100b9))
- include segment labels in segmentation state ([#433](https://github.com/cornerstonejs/cornerstone3D-beta/issues/433)) ([412a914](https://github.com/cornerstonejs/cornerstone3D-beta/commit/412a914682b27b0f5b39f942986cd09c375107d1))
- **loop:** option to scroll tools ([#494](https://github.com/cornerstonejs/cornerstone3D-beta/issues/494)) ([34d4380](https://github.com/cornerstonejs/cornerstone3D-beta/commit/34d438083e750d12b9fb9cbc6a34b7dca2d6f1d0))
- **mobile:** modify config for crosshair tool ([#533](https://github.com/cornerstonejs/cornerstone3D-beta/issues/533)) ([50111d2](https://github.com/cornerstonejs/cornerstone3D-beta/commit/50111d20de7d6921ca40813589f6ed0297c4a2f0))
- orientation on volumeViewport can be optional ([#203](https://github.com/cornerstonejs/cornerstone3D-beta/issues/203)) ([749dcb5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/749dcb59414c1aff2dffdca582fb3df0e4ca5ed7))
- Planar freehand roi tool ([#89](https://github.com/cornerstonejs/cornerstone3D-beta/issues/89)) ([0067339](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0067339e7cf7f6b26e8fd6342113d82eb6915409))
- **PlanarFreehandROI stats:** PlanarFreehandROI stats ([#326](https://github.com/cornerstonejs/cornerstone3D-beta/issues/326)) ([9240862](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9240862f56241ba35b920b951fb867443d068833))
- **planarRotateTool:** rotate tool for volume viewport ([#436](https://github.com/cornerstonejs/cornerstone3D-beta/issues/436)) ([52e5739](https://github.com/cornerstonejs/cornerstone3D-beta/commit/52e57398fd3ddd8404787333e54edeb4ed53dfcb))
- remove unnecessary event firing for annotations ([#123](https://github.com/cornerstonejs/cornerstone3D-beta/issues/123)) ([03551d9](https://github.com/cornerstonejs/cornerstone3D-beta/commit/03551d9f9269b7bfd3d828dad4f8f38ef51703d1))
- **rendering:** 16 bit texture support with flag ([#420](https://github.com/cornerstonejs/cornerstone3D-beta/issues/420)) ([f14073e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f14073e13836e33f85a1cf7aec566ab782174def))
- reset to center option for reset camera ([#269](https://github.com/cornerstonejs/cornerstone3D-beta/issues/269)) ([9539f6c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9539f6c56e2bd3b06f4c6b40fd6b4478d806bee3))
- ROI threshold to consider two volumes for thresholding ([#325](https://github.com/cornerstonejs/cornerstone3D-beta/issues/325)) ([87362af](https://github.com/cornerstonejs/cornerstone3D-beta/commit/87362af8008b08fd874ffbb5188d415d9a71abdd))
- **ScaleOverlayTool:** Add scale overlay tool ([#386](https://github.com/cornerstonejs/cornerstone3D-beta/issues/386)) ([45d863e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/45d863ede9c46d129443063bde97e0c708cdbf37))
- **scrollEvent:** added out of bounds scroll ([#476](https://github.com/cornerstonejs/cornerstone3D-beta/issues/476)) ([4cf2b63](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4cf2b637da2fc78efcd64acfb2fe5130cf10e368))
- segmentation examples ([#29](https://github.com/cornerstonejs/cornerstone3D-beta/issues/29)) ([fd95a12](https://github.com/cornerstonejs/cornerstone3D-beta/commit/fd95a12910ffe87a201d5eb94cbae32e95a8be8f))
- Segmentation state restructure to add main representation ([#19](https://github.com/cornerstonejs/cornerstone3D-beta/issues/19)) ([b6eda97](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b6eda97ab77ec244fd2e3a8c7d164efe78a4516f))
- **Segmentation:** Add contour representation for segmentations ([#384](https://github.com/cornerstonejs/cornerstone3D-beta/issues/384)) ([541a351](https://github.com/cornerstonejs/cornerstone3D-beta/commit/541a3519cd78437db020d1bc561d3b2755ec9c7c))
- **segmentation:** segmentation threshold utility ([#487](https://github.com/cornerstonejs/cornerstone3D-beta/issues/487)) ([5325428](https://github.com/cornerstonejs/cornerstone3D-beta/commit/53254285e69a89db23de019d00757b70b8f170ed))
- **stackRotate:** Add stack rotate tool ([#329](https://github.com/cornerstonejs/cornerstone3D-beta/issues/329)) ([e2fbf6e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e2fbf6e26b7f63d8923d050d8fff10a4dfad34bb))
- **streaming-image-volume:** add caching for image load object ([#567](https://github.com/cornerstonejs/cornerstone3D-beta/issues/567)) ([c721ecd](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c721ecd0a2724fa04c01704a33239e68eac5d0f1))
- **tools:** Add invert zoom option ([#574](https://github.com/cornerstonejs/cornerstone3D-beta/issues/574)) ([7d41449](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7d4144957af9f261771283c51a1bfa304802e4fd))
- **Touch:** added touch events to tools ([#247](https://github.com/cornerstonejs/cornerstone3D-beta/issues/247)) ([e35f963](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e35f963717b3909b670f874b38e242a522007e68)), closes [#3](https://github.com/cornerstonejs/cornerstone3D-beta/issues/3)
- **touch:** more optimized touch interactions ([#461](https://github.com/cornerstonejs/cornerstone3D-beta/issues/461)) ([f79f29a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f79f29a2d3885440c511437e03a2b1552eeb51cb))
- **voi:** added support for sigmoid voiLUTFunction for StackViewport and VolumeViewport ([#224](https://github.com/cornerstonejs/cornerstone3D-beta/issues/224)) ([2fcec22](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2fcec22fc7a27cad75d41713339f7e030d653f80))
- volume viewport api with setProperties ([#154](https://github.com/cornerstonejs/cornerstone3D-beta/issues/154)) ([fab3abe](https://github.com/cornerstonejs/cornerstone3D-beta/commit/fab3abe907ddde1ee61bc121c40d4fc23d2dbfd7))
- **volumeLoader:** no need for streaming-wadors imageLoader anymore since streaming volume loader will use cswil wadors image loader ([#340](https://github.com/cornerstonejs/cornerstone3D-beta/issues/340)) ([0b5f785](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0b5f785041a6f92443b58f6d72c8c965a29b35fc))
- **VolumeViewport:** add colormap preset and invert to volume viewport ([#602](https://github.com/cornerstonejs/cornerstone3D-beta/issues/602)) ([f28a392](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f28a3923bba958ed1991dad40ce88d162daa1a6f))

### Performance Improvements

- **sphereBrush:** tool optimization ([#447](https://github.com/cornerstonejs/cornerstone3D-beta/issues/447)) ([c314bfe](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c314bfe79f2efa9ed44630233ceb06736c735855))

## [0.67.7](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.67.6...@cornerstonejs/tools@0.67.7) (2023-05-18)

### Bug Fixes

- **cpu:** could not render if switched to cpu in the middle ([#615](https://github.com/cornerstonejs/cornerstone3D-beta/issues/615)) ([6b1d588](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6b1d588616dd7b7ab3358583414728a13225156a))

## [0.67.6](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.67.5...@cornerstonejs/tools@0.67.6) (2023-05-18)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.67.5](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.67.4...@cornerstonejs/tools@0.67.5) (2023-05-17)

### Bug Fixes

- **arrowTool:** trigger ANNOTATION_MODIFIED event on ArrowAnnotate Tool ([#610](https://github.com/cornerstonejs/cornerstone3D-beta/issues/610)) ([b67c3b8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b67c3b860196d0d54021d1652b5a128ad97a62d4))

## [0.67.4](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.67.3...@cornerstonejs/tools@0.67.4) (2023-05-15)

### Bug Fixes

- **Circle and VolumeViewport:** fixes to ensure measurements are rendered properly ([#609](https://github.com/cornerstonejs/cornerstone3D-beta/issues/609)) ([293e6b1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/293e6b18e9d9306043aac8e23a5955b6e44fad0d))

## [0.67.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.67.2...@cornerstonejs/tools@0.67.3) (2023-05-12)

### Bug Fixes

- **stackViewport:** better error handling for disabled viewports ([#605](https://github.com/cornerstonejs/cornerstone3D-beta/issues/605)) ([2b144a2](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2b144a2ae58d27d51935a674497437cabb7a4a3d))

## [0.67.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.67.1...@cornerstonejs/tools@0.67.2) (2023-05-10)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.67.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.67.0...@cornerstonejs/tools@0.67.1) (2023-05-09)

### Bug Fixes

- **multiframe:** fix frameNumber for pixelData and windowlevel issue ([#603](https://github.com/cornerstonejs/cornerstone3D-beta/issues/603)) ([6bf51b1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6bf51b148bbff008bf0bc63b8de4fa375eaad625))

# [0.67.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.66.7...@cornerstonejs/tools@0.67.0) (2023-05-09)

### Features

- **PlanarFreehandROI stats:** PlanarFreehandROI stats ([#326](https://github.com/cornerstonejs/cornerstone3D-beta/issues/326)) ([9240862](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9240862f56241ba35b920b951fb867443d068833))
- **VolumeViewport:** add colormap preset and invert to volume viewport ([#602](https://github.com/cornerstonejs/cornerstone3D-beta/issues/602)) ([f28a392](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f28a3923bba958ed1991dad40ce88d162daa1a6f))

## [0.66.7](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.66.6...@cornerstonejs/tools@0.66.7) (2023-05-06)

### Bug Fixes

- js exception prevention - safe programming only ([#600](https://github.com/cornerstonejs/cornerstone3D-beta/issues/600)) ([bbd2ff4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/bbd2ff4ab8cc9ac13f4b98f5cf589d6ff83b5eb3))

## [0.66.6](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.66.5...@cornerstonejs/tools@0.66.6) (2023-05-05)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.66.5](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.66.4...@cornerstonejs/tools@0.66.5) (2023-05-05)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.66.4](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.66.3...@cornerstonejs/tools@0.66.4) (2023-05-04)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.66.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.66.2...@cornerstonejs/tools@0.66.3) (2023-05-04)

### Bug Fixes

- **planarFreehandROITool:** proper handling of pure movements on y-axis ([#590](https://github.com/cornerstonejs/cornerstone3D-beta/issues/590)) ([33635fa](https://github.com/cornerstonejs/cornerstone3D-beta/commit/33635fad566ccbb9c5b0441957726c11aab80901))

## [0.66.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.66.1...@cornerstonejs/tools@0.66.2) (2023-05-03)

### Bug Fixes

- **scroll:** was not able to scroll back ([#593](https://github.com/cornerstonejs/cornerstone3D-beta/issues/593)) ([f934e21](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f934e21769655ea82b9cdc0cf1f34a40a5d87d82))

## [0.66.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.66.0...@cornerstonejs/tools@0.66.1) (2023-05-03)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.66.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.65.1...@cornerstonejs/tools@0.66.0) (2023-04-28)

### Features

- **streaming-image-volume:** add caching for image load object ([#567](https://github.com/cornerstonejs/cornerstone3D-beta/issues/567)) ([c721ecd](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c721ecd0a2724fa04c01704a33239e68eac5d0f1))

## [0.65.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.65.0...@cornerstonejs/tools@0.65.1) (2023-04-28)

### Bug Fixes

- **annotations:** fix triggering of 'ANNOTATION_ADDED' event multiple times ([#570](https://github.com/cornerstonejs/cornerstone3D-beta/issues/570)) ([#584](https://github.com/cornerstonejs/cornerstone3D-beta/issues/584)) ([f8e75f3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f8e75f3d236da91c2710b4742ff2c2047e3e0e3c))

# [0.65.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.64.0...@cornerstonejs/tools@0.65.0) (2023-04-26)

### Features

- **dicomImageLoader:** make cornerstone to use new dicom image loader and handle scaling correctly ([#553](https://github.com/cornerstonejs/cornerstone3D-beta/issues/553)) ([a01687a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a01687ab925c469bf979d6f2089d2e8f31c28e75))

# [0.64.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.63.3...@cornerstonejs/tools@0.64.0) (2023-04-26)

### Features

- **tools:** Add invert zoom option ([#574](https://github.com/cornerstonejs/cornerstone3D-beta/issues/574)) ([7d41449](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7d4144957af9f261771283c51a1bfa304802e4fd))

## [0.63.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.63.2...@cornerstonejs/tools@0.63.3) (2023-04-26)

### Bug Fixes

- **calibration:** Apply the calibration update only once ([#577](https://github.com/cornerstonejs/cornerstone3D-beta/issues/577)) ([0641930](https://github.com/cornerstonejs/cornerstone3D-beta/commit/06419303b5bf8901645f4c74bc25cb8eabf279c8))

## [0.63.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.63.1...@cornerstonejs/tools@0.63.2) (2023-04-25)

### Bug Fixes

- **contour:** remove contour was using wrong uid ([#575](https://github.com/cornerstonejs/cornerstone3D-beta/issues/575)) ([a6892a5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a6892a5131dfdfecd5edeed6f9e633742bba2fb6))

## [0.63.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.63.0...@cornerstonejs/tools@0.63.1) (2023-04-24)

### Bug Fixes

- Double click and multi-key bindings ([#571](https://github.com/cornerstonejs/cornerstone3D-beta/issues/571)) ([ebc0cf8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ebc0cf8f8164070e67bdfc09fc13a58c64a7d1c1))

# [0.63.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.62.2...@cornerstonejs/tools@0.63.0) (2023-04-20)

### Features

- **4D:** fixed cine play issue and added getDynamicVolumeInfo method ([#562](https://github.com/cornerstonejs/cornerstone3D-beta/issues/562)) ([f4c2531](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f4c25316eb1c5a6b13edb7c0873c9b0ce7a4e581))

## [0.62.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.62.1...@cornerstonejs/tools@0.62.2) (2023-04-19)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.62.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.62.0...@cornerstonejs/tools@0.62.1) (2023-04-18)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.62.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.61.11...@cornerstonejs/tools@0.62.0) (2023-04-18)

### Features

- **crosshairs:** Make the reference lines gap configurable ([#557](https://github.com/cornerstonejs/cornerstone3D-beta/issues/557)) ([be91ab8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/be91ab87d89f5e8079e1073a504a07a0d53373a8))

## [0.61.11](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.61.10...@cornerstonejs/tools@0.61.11) (2023-04-18)

### Bug Fixes

- **segmentationVisibility:** Improve performance for `getSegmentationIndices` ([#556](https://github.com/cornerstonejs/cornerstone3D-beta/issues/556)) ([c02d31c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c02d31c739a2b319a5c815bda404a12dcba65bd1))

## [0.61.10](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.61.9...@cornerstonejs/tools@0.61.10) (2023-04-18)

### Bug Fixes

- **mouse:** Avoid the delay on double click checking for right click ([#560](https://github.com/cornerstonejs/cornerstone3D-beta/issues/560)) ([2c86500](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2c8650001e19355bf856e8e475121bbd99feb18d))

## [0.61.9](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.61.8...@cornerstonejs/tools@0.61.9) (2023-04-18)

### Bug Fixes

- **stackviewport:** swap image row and column pixel spacing ([#561](https://github.com/cornerstonejs/cornerstone3D-beta/issues/561)) ([aede776](https://github.com/cornerstonejs/cornerstone3D-beta/commit/aede776ac6475f47a187db1f2ab5b2700192d466))

## [0.61.8](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.61.7...@cornerstonejs/tools@0.61.8) (2023-04-17)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.61.7](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.61.6...@cornerstonejs/tools@0.61.7) (2023-04-14)

### Bug Fixes

- **segmentation:** Do not render inapplicable segmentations ([#545](https://github.com/cornerstonejs/cornerstone3D-beta/issues/545)) ([1b9d28c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1b9d28c0de1ccec5b517ff816488571ae1602adc))

## [0.61.6](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.61.5...@cornerstonejs/tools@0.61.6) (2023-04-14)

### Bug Fixes

- **crosshairs:** Autopan causing infinite loop ([#551](https://github.com/cornerstonejs/cornerstone3D-beta/issues/551)) ([e54dfb3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e54dfb32d24af0f504768976eaa80a84fcfc6af0))

## [0.61.5](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.61.4...@cornerstonejs/tools@0.61.5) (2023-04-14)

### Bug Fixes

- **crosshairs:** Reference lines are wrongly clipped ([#552](https://github.com/cornerstonejs/cornerstone3D-beta/issues/552)) ([0bc2134](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0bc2134754762c61b72824943c506be7396887b8))

## [0.61.4](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.61.3...@cornerstonejs/tools@0.61.4) (2023-04-12)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.61.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.61.2...@cornerstonejs/tools@0.61.3) (2023-04-11)

### Bug Fixes

- **suv display:** fix scaling of non-SUV PT images ([#536](https://github.com/cornerstonejs/cornerstone3D-beta/issues/536)) ([f9182f0](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f9182f076d9d5f3af4989550b9549aeaa2792466))

## [0.61.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.61.1...@cornerstonejs/tools@0.61.2) (2023-04-11)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.61.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.61.0...@cornerstonejs/tools@0.61.1) (2023-04-10)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.61.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.60.2...@cornerstonejs/tools@0.61.0) (2023-04-05)

### Features

- **contour:** improved performance and better configuration ([#543](https://github.com/cornerstonejs/cornerstone3D-beta/issues/543)) ([c69c58a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c69c58a171f1dc24d94aded51bbdffa3775c7e6e))

## [0.60.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.60.1...@cornerstonejs/tools@0.60.2) (2023-04-04)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.60.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.60.0...@cornerstonejs/tools@0.60.1) (2023-04-01)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.60.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.59.1...@cornerstonejs/tools@0.60.0) (2023-03-30)

### Features

- **scrollEvent:** added out of bounds scroll ([#476](https://github.com/cornerstonejs/cornerstone3D-beta/issues/476)) ([4cf2b63](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4cf2b637da2fc78efcd64acfb2fe5130cf10e368))

## [0.59.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.59.0...@cornerstonejs/tools@0.59.1) (2023-03-30)

### Bug Fixes

- **segmentColor:** should be able to change initial segment color for render ([#535](https://github.com/cornerstonejs/cornerstone3D-beta/issues/535)) ([0a81736](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0a8173671315eff3bf2b52d079cde9a604208fa1))

# [0.59.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.58.0...@cornerstonejs/tools@0.59.0) (2023-03-30)

### Features

- **mobile:** modify config for crosshair tool ([#533](https://github.com/cornerstonejs/cornerstone3D-beta/issues/533)) ([50111d2](https://github.com/cornerstonejs/cornerstone3D-beta/commit/50111d20de7d6921ca40813589f6ed0297c4a2f0))

# [0.58.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.57.1...@cornerstonejs/tools@0.58.0) (2023-03-28)

### Features

- **3d from 4d:** 3D image generation from 4D ([#502](https://github.com/cornerstonejs/cornerstone3D-beta/issues/502)) ([9217691](https://github.com/cornerstonejs/cornerstone3D-beta/commit/921769132398756fe192e266bcc9a09b98e0e733))

## [0.57.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.57.0...@cornerstonejs/tools@0.57.1) (2023-03-28)

### Bug Fixes

- **tools:** Some older annotations were missing normal ([#528](https://github.com/cornerstonejs/cornerstone3D-beta/issues/528)) ([319822a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/319822acdd99da5f75eb716588ebfe9ec2090e76))

# [0.57.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.56.7...@cornerstonejs/tools@0.57.0) (2023-03-28)

### Features

- **contour api:** add api for contour rendering configuration ([#443](https://github.com/cornerstonejs/cornerstone3D-beta/issues/443)) ([4ab751d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4ab751df4082c56b64e4b97e9d6ca6de3c60c7e5))

## [0.56.7](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.56.6...@cornerstonejs/tools@0.56.7) (2023-03-28)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.56.6](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.56.5...@cornerstonejs/tools@0.56.6) (2023-03-28)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.56.5](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.56.4...@cornerstonejs/tools@0.56.5) (2023-03-28)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.56.4](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.56.3...@cornerstonejs/tools@0.56.4) (2023-03-26)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.56.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.56.2...@cornerstonejs/tools@0.56.3) (2023-03-24)

### Bug Fixes

- add src folder to package json to improve source maps ([#499](https://github.com/cornerstonejs/cornerstone3D-beta/issues/499)) ([aea4406](https://github.com/cornerstonejs/cornerstone3D-beta/commit/aea4406d4e8f1a415399481657373cd2d2d25523))

## [0.56.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.56.1...@cornerstonejs/tools@0.56.2) (2023-03-24)

### Bug Fixes

- **mobile:** Crosshairs highlighted for mobile ([#493](https://github.com/cornerstonejs/cornerstone3D-beta/issues/493)) ([22309aa](https://github.com/cornerstonejs/cornerstone3D-beta/commit/22309aa2519d4c543ad28920d6ff82906cc8af1c))

## [0.56.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.56.0...@cornerstonejs/tools@0.56.1) (2023-03-23)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.56.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.55.2...@cornerstonejs/tools@0.56.0) (2023-03-22)

### Features

- Add a CircleROI tool ([#459](https://github.com/cornerstonejs/cornerstone3D-beta/issues/459)) ([1c03ed3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1c03ed3457fbb63bbd87315b90bfed99b1cd09cc))

## [0.55.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.55.1...@cornerstonejs/tools@0.55.2) (2023-03-22)

### Bug Fixes

- Elliptical roi when in flipped/rotated state ([#479](https://github.com/cornerstonejs/cornerstone3D-beta/issues/479)) ([f0961ae](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f0961ae6f5e912230f2bf17be5acfe30f775bcae))

## [0.55.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.55.0...@cornerstonejs/tools@0.55.1) (2023-03-22)

### Bug Fixes

- **rendering:** should still use Float32 when not 16 bit for scaling issues ([#501](https://github.com/cornerstonejs/cornerstone3D-beta/issues/501)) ([448baf2](https://github.com/cornerstonejs/cornerstone3D-beta/commit/448baf2086ef28b8eedc90ab46e0fee54cf7ac9e))

# [0.55.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.54.1...@cornerstonejs/tools@0.55.0) (2023-03-22)

### Features

- **loop:** option to scroll tools ([#494](https://github.com/cornerstonejs/cornerstone3D-beta/issues/494)) ([34d4380](https://github.com/cornerstonejs/cornerstone3D-beta/commit/34d438083e750d12b9fb9cbc6a34b7dca2d6f1d0))

## [0.54.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.54.0...@cornerstonejs/tools@0.54.1) (2023-03-21)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.54.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.53.1...@cornerstonejs/tools@0.54.0) (2023-03-21)

### Features

- **segmentation:** segmentation threshold utility ([#487](https://github.com/cornerstonejs/cornerstone3D-beta/issues/487)) ([5325428](https://github.com/cornerstonejs/cornerstone3D-beta/commit/53254285e69a89db23de019d00757b70b8f170ed))

## [0.53.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.53.0...@cornerstonejs/tools@0.53.1) (2023-03-17)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.53.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.52.3...@cornerstonejs/tools@0.53.0) (2023-03-16)

### Features

- **touch:** more optimized touch interactions ([#461](https://github.com/cornerstonejs/cornerstone3D-beta/issues/461)) ([f79f29a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f79f29a2d3885440c511437e03a2b1552eeb51cb))

## [0.52.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.52.2...@cornerstonejs/tools@0.52.3) (2023-03-16)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.52.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.52.1...@cornerstonejs/tools@0.52.2) (2023-03-15)

### Bug Fixes

- **segmentation:** segmentation could not render segment while invisible ([#477](https://github.com/cornerstonejs/cornerstone3D-beta/issues/477)) ([199b139](https://github.com/cornerstonejs/cornerstone3D-beta/commit/199b1390f367c42b49c1a7ba01ab0f176d0789f4))

## [0.52.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.52.0...@cornerstonejs/tools@0.52.1) (2023-03-15)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.52.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.51.0...@cornerstonejs/tools@0.52.0) (2023-03-13)

### Features

- **rendering:** 16 bit texture support with flag ([#420](https://github.com/cornerstonejs/cornerstone3D-beta/issues/420)) ([f14073e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f14073e13836e33f85a1cf7aec566ab782174def))

# [0.51.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.50.2...@cornerstonejs/tools@0.51.0) (2023-03-13)

### Features

- **cine:** added support for 4D volumes ([#471](https://github.com/cornerstonejs/cornerstone3D-beta/issues/471)) ([4e62137](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4e62137004a340420d7c5c56c6ad5bebb7a8021c)), closes [#470](https://github.com/cornerstonejs/cornerstone3D-beta/issues/470)

## [0.50.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.50.1...@cornerstonejs/tools@0.50.2) (2023-03-10)

### Bug Fixes

- **scroll:** Scrolling failed to find the volume with segmentation ([#470](https://github.com/cornerstonejs/cornerstone3D-beta/issues/470)) ([79b8c96](https://github.com/cornerstonejs/cornerstone3D-beta/commit/79b8c96f111563dd0850f72d89e7c43e8b0cbd5c))

## [0.50.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.50.0...@cornerstonejs/tools@0.50.1) (2023-03-07)

### Bug Fixes

- **windowLevelTool:** WWWL multipler too high when burned in pixels are present ([#462](https://github.com/cornerstonejs/cornerstone3D-beta/issues/462)) ([47bfa46](https://github.com/cornerstonejs/cornerstone3D-beta/commit/47bfa46caa563bfc131487bac0c5c517e65128bf))

# [0.50.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.49.1...@cornerstonejs/tools@0.50.0) (2023-03-06)

### Features

- **4d utility:** getDataInTime from 4D data ([#460](https://github.com/cornerstonejs/cornerstone3D-beta/issues/460)) ([57bd947](https://github.com/cornerstonejs/cornerstone3D-beta/commit/57bd947b5385f922ed6bdbab940c56dfd245c8b1))

## [0.49.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.49.0...@cornerstonejs/tools@0.49.1) (2023-03-06)

### Bug Fixes

- **voi:** stack viewport should prioritize image metadata for windowlevel and not persist ([#454](https://github.com/cornerstonejs/cornerstone3D-beta/issues/454)) ([420c812](https://github.com/cornerstonejs/cornerstone3D-beta/commit/420c8121cb0cdc4c321013ca807c6ca32901d7a6))

# [0.49.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.48.0...@cornerstonejs/tools@0.49.0) (2023-03-03)

### Features

- **dicomImageLoader types:** Add types to the dicom image loader ([#441](https://github.com/cornerstonejs/cornerstone3D-beta/issues/441)) ([10a3370](https://github.com/cornerstonejs/cornerstone3D-beta/commit/10a3370b7f23084d1f2c55506079c17dea959659)), closes [#449](https://github.com/cornerstonejs/cornerstone3D-beta/issues/449) [#450](https://github.com/cornerstonejs/cornerstone3D-beta/issues/450)

# [0.48.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.47.0...@cornerstonejs/tools@0.48.0) (2023-03-01)

### Features

- **annotations:** rework annotation manager api and enable multi-manager setup ([#442](https://github.com/cornerstonejs/cornerstone3D-beta/issues/442)) ([60bd013](https://github.com/cornerstonejs/cornerstone3D-beta/commit/60bd0132785744c55cd52b6a7dfc4ee56408d373))

# [0.47.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.46.3...@cornerstonejs/tools@0.47.0) (2023-02-28)

### Features

- **4D:** added support for 4D data rendering ([#438](https://github.com/cornerstonejs/cornerstone3D-beta/issues/438)) ([975e596](https://github.com/cornerstonejs/cornerstone3D-beta/commit/975e59629125fbf0ba5ea676fa14b71a2b30ca44))

## [0.46.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.46.2...@cornerstonejs/tools@0.46.3) (2023-02-24)

### Performance Improvements

- **sphereBrush:** tool optimization ([#447](https://github.com/cornerstonejs/cornerstone3D-beta/issues/447)) ([c314bfe](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c314bfe79f2efa9ed44630233ceb06736c735855))

## [0.46.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.46.1...@cornerstonejs/tools@0.46.2) (2023-02-23)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.46.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.46.0...@cornerstonejs/tools@0.46.1) (2023-02-22)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.46.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.45.1...@cornerstonejs/tools@0.46.0) (2023-02-21)

### Features

- **planarRotateTool:** rotate tool for volume viewport ([#436](https://github.com/cornerstonejs/cornerstone3D-beta/issues/436)) ([52e5739](https://github.com/cornerstonejs/cornerstone3D-beta/commit/52e57398fd3ddd8404787333e54edeb4ed53dfcb))

## [0.45.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.45.0...@cornerstonejs/tools@0.45.1) (2023-02-16)

### Bug Fixes

- **doubleClick:** mouseDoubleClickIgnoreListener is now added to each viewport element instead of the document element ([#429](https://github.com/cornerstonejs/cornerstone3D-beta/issues/429)) ([360e2a9](https://github.com/cornerstonejs/cornerstone3D-beta/commit/360e2a9fa2efa690d2e4baec424699a6c66af4a2)), closes [#375](https://github.com/cornerstonejs/cornerstone3D-beta/issues/375)

# [0.45.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.44.0...@cornerstonejs/tools@0.45.0) (2023-02-14)

### Features

- include segment labels in segmentation state ([#433](https://github.com/cornerstonejs/cornerstone3D-beta/issues/433)) ([412a914](https://github.com/cornerstonejs/cornerstone3D-beta/commit/412a914682b27b0f5b39f942986cd09c375107d1))

# [0.44.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.43.2...@cornerstonejs/tools@0.44.0) (2023-02-13)

### Features

- **voi:** added support for sigmoid voiLUTFunction for StackViewport and VolumeViewport ([#224](https://github.com/cornerstonejs/cornerstone3D-beta/issues/224)) ([2fcec22](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2fcec22fc7a27cad75d41713339f7e030d653f80))

## [0.43.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.43.1...@cornerstonejs/tools@0.43.2) (2023-02-10)

### Bug Fixes

- use one actor for a contourset rendering ([#432](https://github.com/cornerstonejs/cornerstone3D-beta/issues/432)) ([c92f8be](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c92f8beafb6731eb0b81ef295ff2774192cfd7ed))

## [0.43.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.43.0...@cornerstonejs/tools@0.43.1) (2023-02-10)

### Bug Fixes

- **trackball:** rotate was wrong on mouse drag ([#424](https://github.com/cornerstonejs/cornerstone3D-beta/issues/424)) ([99c1a0a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/99c1a0a35dd52ddec26551de75656cdda7149b39))

# [0.43.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.42.1...@cornerstonejs/tools@0.43.0) (2023-02-08)

### Features

- **adapters:** Add adapters for Rectangle, Angle and fix generate DICOM ([#427](https://github.com/cornerstonejs/cornerstone3D-beta/issues/427)) ([b8ca75e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b8ca75e6ba378f175bd987d07f094f44b41a46cf))

## [0.42.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.42.0...@cornerstonejs/tools@0.42.1) (2023-02-07)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.42.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.41.1...@cornerstonejs/tools@0.42.0) (2023-02-06)

### Features

- **planarRotate:** Add planar rotate tool ([#329](https://github.com/cornerstonejs/cornerstone3D-beta/issues/329)) ([e2fbf6e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e2fbf6e26b7f63d8923d050d8fff10a4dfad34bb))

## [0.41.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.41.0...@cornerstonejs/tools@0.41.1) (2023-02-06)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.41.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.40.2...@cornerstonejs/tools@0.41.0) (2023-02-03)

### Features

- **ScaleOverlayTool:** Add scale overlay tool ([#386](https://github.com/cornerstonejs/cornerstone3D-beta/issues/386)) ([45d863e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/45d863ede9c46d129443063bde97e0c708cdbf37))

## [0.40.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.40.1...@cornerstonejs/tools@0.40.2) (2023-02-03)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.40.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.40.0...@cornerstonejs/tools@0.40.1) (2023-02-02)

### Bug Fixes

- **doubleClick:** moved the mouse click/down timeout detection back into ([#417](https://github.com/cornerstonejs/cornerstone3D-beta/issues/417)) ([99eea67](https://github.com/cornerstonejs/cornerstone3D-beta/commit/99eea6795b4ded35d9fd9549e7208ce8c09a9ada))

# [0.40.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.39.1...@cornerstonejs/tools@0.40.0) (2023-02-01)

### Bug Fixes

- **svg:** find and reset svg-layer within the correct element ([#387](https://github.com/cornerstonejs/cornerstone3D-beta/issues/387)) ([3e0829e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/3e0829e35f19bef3601ee9f197dbf6d87bc01fcf))

### Features

- **Segmentation:** Add contour representation for segmentations ([#384](https://github.com/cornerstonejs/cornerstone3D-beta/issues/384)) ([541a351](https://github.com/cornerstonejs/cornerstone3D-beta/commit/541a3519cd78437db020d1bc561d3b2755ec9c7c))

## [0.39.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.39.0...@cornerstonejs/tools@0.39.1) (2023-02-01)

### Bug Fixes

- **doubleClick:** moved the mouse click/down timeout detection into \_doMouseDown ([#416](https://github.com/cornerstonejs/cornerstone3D-beta/issues/416)) ([ebd8f7b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ebd8f7b1aa2c311a6172e360d24a23ad256c5e24))

# [0.39.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.38.0...@cornerstonejs/tools@0.39.0) (2023-01-30)

### Features

- **CobbAngle:** Add CobbAngle tool ([#353](https://github.com/cornerstonejs/cornerstone3D-beta/issues/353)) ([b9bd701](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b9bd701df41ae2b8b2afbcf1d092d7587f7b267a))

# [0.38.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.37.0...@cornerstonejs/tools@0.38.0) (2023-01-27)

### Features

- **Touch:** added touch events to tools ([#247](https://github.com/cornerstonejs/cornerstone3D-beta/issues/247)) ([e35f963](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e35f963717b3909b670f874b38e242a522007e68)), closes [#3](https://github.com/cornerstonejs/cornerstone3D-beta/issues/3)

# [0.37.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.36.4...@cornerstonejs/tools@0.37.0) (2023-01-26)

### Features

- **doubleClick:** Add Double click detection ([#375](https://github.com/cornerstonejs/cornerstone3D-beta/issues/375)) ([#382](https://github.com/cornerstonejs/cornerstone3D-beta/issues/382)) ([8e4be96](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8e4be962c8f9d6c226095a573905087842995f89))

## [0.36.4](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.36.3...@cornerstonejs/tools@0.36.4) (2023-01-23)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.36.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.36.2...@cornerstonejs/tools@0.36.3) (2023-01-20)

### Bug Fixes

- tool bindings with different modifier keys ([#377](https://github.com/cornerstonejs/cornerstone3D-beta/issues/377)) ([c95ba60](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c95ba60e0045eac33e889985e2a340f2ce543dc2))

## [0.36.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.36.1...@cornerstonejs/tools@0.36.2) (2023-01-20)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.36.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.36.0...@cornerstonejs/tools@0.36.1) (2023-01-20)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.36.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.35.2...@cornerstonejs/tools@0.36.0) (2023-01-16)

### Features

- add multiframe example ([#331](https://github.com/cornerstonejs/cornerstone3D-beta/issues/331)) ([327f17a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/327f17a551f869c8f454566782be720367291235))

## [0.35.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.35.1...@cornerstonejs/tools@0.35.2) (2023-01-13)

### Bug Fixes

- floodFill export in tools ([#362](https://github.com/cornerstonejs/cornerstone3D-beta/issues/362)) ([700baa3](https://github.com/cornerstonejs/cornerstone3D-beta/commit/700baa349f59c12b4a10979b580ee3afd9637f9e))

## [0.35.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.35.0...@cornerstonejs/tools@0.35.1) (2023-01-13)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.35.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.34.2...@cornerstonejs/tools@0.35.0) (2023-01-12)

### Features

- ROI threshold to consider two volumes for thresholding ([#325](https://github.com/cornerstonejs/cornerstone3D-beta/issues/325)) ([87362af](https://github.com/cornerstonejs/cornerstone3D-beta/commit/87362af8008b08fd874ffbb5188d415d9a71abdd))

## [0.34.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.34.1...@cornerstonejs/tools@0.34.2) (2023-01-12)

### Bug Fixes

- unexpected token problem for typescript for tools ([#360](https://github.com/cornerstonejs/cornerstone3D-beta/issues/360)) ([7844798](https://github.com/cornerstonejs/cornerstone3D-beta/commit/78447981ed583ef97f8f7cbed247cd6c3b1419a6))

## [0.34.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.34.0...@cornerstonejs/tools@0.34.1) (2023-01-11)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.34.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.33.0...@cornerstonejs/tools@0.34.0) (2023-01-06)

### Features

- **volumeLoader:** no need for streaming-wadors imageLoader anymore since streaming volume loader will use cswil wadors image loader ([#340](https://github.com/cornerstonejs/cornerstone3D-beta/issues/340)) ([0b5f785](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0b5f785041a6f92443b58f6d72c8c965a29b35fc))

# [0.33.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.32.3...@cornerstonejs/tools@0.33.0) (2023-01-06)

### Features

- improved example runner to handle casing and partial match ([#347](https://github.com/cornerstonejs/cornerstone3D-beta/issues/347)) ([9e8fa12](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9e8fa122f766c1fceff4e3d4fe3cd0f68963c92b))

## [0.32.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.32.2...@cornerstonejs/tools@0.32.3) (2023-01-04)

### Bug Fixes

- AngleTool not working after cancellation ([#342](https://github.com/cornerstonejs/cornerstone3D-beta/issues/342)) ([a82c0bc](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a82c0bc0e8beb6d47131ad2cd5040b93b02f2de9))

## [0.32.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.32.1...@cornerstonejs/tools@0.32.2) (2023-01-03)

### Bug Fixes

- could not access 'index' before initialization ([#337](https://github.com/cornerstonejs/cornerstone3D-beta/issues/337)) ([f4b7ff8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f4b7ff8a147a2fbebac3ae66d0b24f28c1910387))

## [0.32.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.32.0...@cornerstonejs/tools@0.32.1) (2022-12-16)

### Bug Fixes

- Add coplanar check in stackImageSync callback ([#335](https://github.com/cornerstonejs/cornerstone3D-beta/issues/335)) ([f806177](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f806177d628664150b02e941c3a802b58bdc5293))

# [0.32.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.31.0...@cornerstonejs/tools@0.32.0) (2022-12-09)

### Features

- Add new 3D volume viewport ([#281](https://github.com/cornerstonejs/cornerstone3D-beta/issues/281)) ([57cf7ac](https://github.com/cornerstonejs/cornerstone3D-beta/commit/57cf7ac3bfd83d35d68f54b1f00f03583ed8e998))

# [0.31.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.30.7...@cornerstonejs/tools@0.31.0) (2022-12-08)

### Features

- enable having multiple instances of the same tool and add more seg tools ([#327](https://github.com/cornerstonejs/cornerstone3D-beta/issues/327)) ([7ff05c5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7ff05c5519243632d9d9113e3c84cf9e10725193))

## [0.30.7](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.30.6...@cornerstonejs/tools@0.30.7) (2022-12-01)

### Bug Fixes

- Use queryselector instead of firstChild to get svg-layer ([#268](https://github.com/cornerstonejs/cornerstone3D-beta/issues/268)) ([1dd315c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1dd315c61476f7bca5640033f530bcc956d14307))

## [0.30.6](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.30.5...@cornerstonejs/tools@0.30.6) (2022-12-01)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.30.5](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.30.4...@cornerstonejs/tools@0.30.5) (2022-12-01)

### Bug Fixes

- bidirectional tool when short and long axis changes ([#309](https://github.com/cornerstonejs/cornerstone3D-beta/issues/309)) ([f973e72](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f973e7262897a2daf4f37363d3e818ae88620bb8))

## [0.30.4](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.30.3...@cornerstonejs/tools@0.30.4) (2022-12-01)

### Bug Fixes

- coronal view should not be flipped ([#321](https://github.com/cornerstonejs/cornerstone3D-beta/issues/321)) ([a85a867](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a85a86785de9f225154829a4934926143c86eb5e))

## [0.30.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.30.2...@cornerstonejs/tools@0.30.3) (2022-12-01)

### Bug Fixes

- htj2k and keymodifier ([#313](https://github.com/cornerstonejs/cornerstone3D-beta/issues/313)) ([48bd8a1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/48bd8a14b81e31cba9f3237b0b68b7082bd66892))

## [0.30.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.30.1...@cornerstonejs/tools@0.30.2) (2022-12-01)

### Bug Fixes

- filter planarFreeHandeROI based on parallel normals instead of equal normals. ([#315](https://github.com/cornerstonejs/cornerstone3D-beta/issues/315)) ([70e4ffa](https://github.com/cornerstonejs/cornerstone3D-beta/commit/70e4ffa0c28ed293473c6674d7b158c644f9b1be))
- get correct imageData with targetId in BaseTool ([#294](https://github.com/cornerstonejs/cornerstone3D-beta/issues/294)) ([6e8e51b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6e8e51b4b3dde358134fcc7493237a59bec687ab))
- If planar annotation is not visible, filter it ([#318](https://github.com/cornerstonejs/cornerstone3D-beta/issues/318)) ([ea8e32a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ea8e32a768d3f2d43fc0f1bc9b29388101825ad2))

## [0.30.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.30.0...@cornerstonejs/tools@0.30.1) (2022-11-24)

### Bug Fixes

- ZoomTool fix for polyData actors with no imageData ([#308](https://github.com/cornerstonejs/cornerstone3D-beta/issues/308)) ([1350eca](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1350eca3cdc8d456642c6497dd2b2460a3584c7e))

# [0.30.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.29.8...@cornerstonejs/tools@0.30.0) (2022-11-23)

### Features

- add referenceCursors tool ([#275](https://github.com/cornerstonejs/cornerstone3D-beta/issues/275)) ([3303246](https://github.com/cornerstonejs/cornerstone3D-beta/commit/3303246836c81efb51e5d5e70c1a8801fbcb019a))

## [0.29.8](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.29.7...@cornerstonejs/tools@0.29.8) (2022-11-23)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.29.7](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.29.6...@cornerstonejs/tools@0.29.7) (2022-11-23)

### Bug Fixes

- mouse-up should not unhighlight annotations ([#305](https://github.com/cornerstonejs/cornerstone3D-beta/issues/305)) ([0ca9653](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0ca96533d253c35534c9820e4174b54270483d5e))

## [0.29.6](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.29.5...@cornerstonejs/tools@0.29.6) (2022-11-21)

### Bug Fixes

- annotation rendering engine on viewport removal ([#303](https://github.com/cornerstonejs/cornerstone3D-beta/issues/303)) ([aeb205e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/aeb205e56e0d2068258c278863aa3d7447331a43))

## [0.29.5](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.29.4...@cornerstonejs/tools@0.29.5) (2022-11-19)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.29.4](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.29.3...@cornerstonejs/tools@0.29.4) (2022-11-18)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.29.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.29.2...@cornerstonejs/tools@0.29.3) (2022-11-17)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.29.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.29.1...@cornerstonejs/tools@0.29.2) (2022-11-16)

### Bug Fixes

- revert synchronizer event firing being unnecessary async ([#299](https://github.com/cornerstonejs/cornerstone3D-beta/issues/299)) ([1e244d1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1e244d11778d74b66df671f936138c73adb5a699))

## [0.29.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.29.0...@cornerstonejs/tools@0.29.1) (2022-11-14)

### Bug Fixes

- reference line exports and add cpu demo ([#297](https://github.com/cornerstonejs/cornerstone3D-beta/issues/297)) ([e20d0b2](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e20d0b25c5ff0aafab4fa541b38815b4bee412b2))

# [0.29.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.28.0...@cornerstonejs/tools@0.29.0) (2022-11-11)

### Features

- add reference lines tool ([#292](https://github.com/cornerstonejs/cornerstone3D-beta/issues/292)) ([c56df91](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c56df91a64ec005656f940dd3728f476152fa917))

# [0.28.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.27.2...@cornerstonejs/tools@0.28.0) (2022-11-11)

### Features

- Add segmentSpecificConfiguration and add outlineOpacity config for Segmentation ([#285](https://github.com/cornerstonejs/cornerstone3D-beta/issues/285)) ([92fb495](https://github.com/cornerstonejs/cornerstone3D-beta/commit/92fb49594cfc3219f761e905ba765acaddbe1e1a))
- add stack synchronization within or across studies ([#291](https://github.com/cornerstonejs/cornerstone3D-beta/issues/291)) ([f38bec0](https://github.com/cornerstonejs/cornerstone3D-beta/commit/f38bec06713265cee361fc905539aa5ed841e707))

## [0.27.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.27.1...@cornerstonejs/tools@0.27.2) (2022-11-10)

### Bug Fixes

- limit disabled element not need to render for annotations ([#289](https://github.com/cornerstonejs/cornerstone3D-beta/issues/289)) ([8232ed0](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8232ed00ee42ab3fd837ab2c5a75b2128c8f87a6))

## [0.27.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.27.0...@cornerstonejs/tools@0.27.1) (2022-11-09)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.27.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.26.5...@cornerstonejs/tools@0.27.0) (2022-11-07)

### Features

- add annotation display Tool ([#283](https://github.com/cornerstonejs/cornerstone3D-beta/issues/283)) ([e4a0324](https://github.com/cornerstonejs/cornerstone3D-beta/commit/e4a0324840f8f5ac29f9db292e8df0c59ee69322))

## [0.26.5](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.26.4...@cornerstonejs/tools@0.26.5) (2022-11-04)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.26.4](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.26.3...@cornerstonejs/tools@0.26.4) (2022-11-04)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.26.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.26.2...@cornerstonejs/tools@0.26.3) (2022-11-04)

### Bug Fixes

- resetCamera and annotations for flipped viewports ([#278](https://github.com/cornerstonejs/cornerstone3D-beta/issues/278)) ([cabefce](https://github.com/cornerstonejs/cornerstone3D-beta/commit/cabefcefcba463abb1ea9bf346a2f755b2494aed))

## [0.26.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.26.1...@cornerstonejs/tools@0.26.2) (2022-11-01)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.26.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.26.0...@cornerstonejs/tools@0.26.1) (2022-11-01)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.26.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.25.0...@cornerstonejs/tools@0.26.0) (2022-10-31)

### Features

- reset to center option for reset camera ([#269](https://github.com/cornerstonejs/cornerstone3D-beta/issues/269)) ([9539f6c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9539f6c56e2bd3b06f4c6b40fd6b4478d806bee3))

# [0.25.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.24.17...@cornerstonejs/tools@0.25.0) (2022-10-28)

### Bug Fixes

- viewRight was calculated wrong for tools ([#255](https://github.com/cornerstonejs/cornerstone3D-beta/issues/255)) ([cf536df](https://github.com/cornerstonejs/cornerstone3D-beta/commit/cf536df66c05b4c4385ad18ad814d1dac1c8ad77))

### Features

- add data id to length and rectangle svg for e2e tests ([#240](https://github.com/cornerstonejs/cornerstone3D-beta/issues/240)) ([3c4e023](https://github.com/cornerstonejs/cornerstone3D-beta/commit/3c4e02305423c59ddcad5d2551cd2ca629738eea))

## [0.24.17](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.24.16...@cornerstonejs/tools@0.24.17) (2022-10-27)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.24.16](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.24.15...@cornerstonejs/tools@0.24.16) (2022-10-25)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.24.15](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.24.14...@cornerstonejs/tools@0.24.15) (2022-10-25)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.24.14](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.24.13...@cornerstonejs/tools@0.24.14) (2022-10-25)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.24.13](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.24.12...@cornerstonejs/tools@0.24.13) (2022-10-25)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.24.12](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.24.11...@cornerstonejs/tools@0.24.12) (2022-10-11)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.24.11](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.24.10...@cornerstonejs/tools@0.24.11) (2022-10-07)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.24.10](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.24.9...@cornerstonejs/tools@0.24.10) (2022-10-06)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.24.9](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.24.8...@cornerstonejs/tools@0.24.9) (2022-10-06)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.24.8](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.24.7...@cornerstonejs/tools@0.24.8) (2022-10-06)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.24.7](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.24.6...@cornerstonejs/tools@0.24.7) (2022-10-05)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.24.6](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.24.5...@cornerstonejs/tools@0.24.6) (2022-10-05)

### Bug Fixes

- stackScroll should honor invert configuration ([#234](https://github.com/cornerstonejs/cornerstone3D-beta/issues/234)) ([aa8f1c4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/aa8f1c4de6837b3438ef62ae48d3412b4d3847bf))

## [0.24.5](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.24.4...@cornerstonejs/tools@0.24.5) (2022-10-05)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.24.4](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.24.3...@cornerstonejs/tools@0.24.4) (2022-10-04)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.24.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.24.2...@cornerstonejs/tools@0.24.3) (2022-09-16)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.24.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.24.1...@cornerstonejs/tools@0.24.2) (2022-09-14)

### Bug Fixes

- annotation hidden on horizontal and vertical ([#205](https://github.com/cornerstonejs/cornerstone3D-beta/issues/205)) ([9e825fd](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9e825fd3d37ecfdf1722da9cd2fd6a1a75995459))

## [0.24.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.24.0...@cornerstonejs/tools@0.24.1) (2022-09-08)

### Bug Fixes

- drag probe appearing unnecessarily on all viewports ([#204](https://github.com/cornerstonejs/cornerstone3D-beta/issues/204)) ([c292c05](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c292c05eecf17a6edbdcab5aa5a604304ef3d2e5))

# [0.24.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.23.3...@cornerstonejs/tools@0.24.0) (2022-09-08)

### Features

- orientation on volumeViewport can be optional ([#203](https://github.com/cornerstonejs/cornerstone3D-beta/issues/203)) ([749dcb5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/749dcb59414c1aff2dffdca582fb3df0e4ca5ed7))

## [0.23.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.23.2...@cornerstonejs/tools@0.23.3) (2022-09-05)

### Bug Fixes

- wrong ushape calculation when loading SR/freehand from server ([#199](https://github.com/cornerstonejs/cornerstone3D-beta/issues/199)) ([ce0c5c9](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ce0c5c9b1c2ef7df9d571c113f37571261cad26f))

## [0.23.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.23.1...@cornerstonejs/tools@0.23.2) (2022-09-02)

### Bug Fixes

- annotations throwing error when stack and volume viewports are converted ([#195](https://github.com/cornerstonejs/cornerstone3D-beta/issues/195)) ([ed23f05](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ed23f05b23063769942328f9e6797d792767ec49))

## [0.23.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.23.0...@cornerstonejs/tools@0.23.1) (2022-09-02)

### Bug Fixes

- zoomTool should not consume the preMouse event ([#196](https://github.com/cornerstonejs/cornerstone3D-beta/issues/196)) ([8ec505a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8ec505a3e2b55d74f5ad3af6159e83398017b87b))

# [0.23.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.22.3...@cornerstonejs/tools@0.23.0) (2022-08-30)

### Features

- draw center point of the ellipticalROI tool and make it configurable ([#191](https://github.com/cornerstonejs/cornerstone3D-beta/issues/191)) ([b0ad00c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b0ad00ce263d55214e1b3d61e51e319c63d11c42)), closes [#190](https://github.com/cornerstonejs/cornerstone3D-beta/issues/190) [#190](https://github.com/cornerstonejs/cornerstone3D-beta/issues/190) [#190](https://github.com/cornerstonejs/cornerstone3D-beta/issues/190) [#190](https://github.com/cornerstonejs/cornerstone3D-beta/issues/190) [#190](https://github.com/cornerstonejs/cornerstone3D-beta/issues/190) [#190](https://github.com/cornerstonejs/cornerstone3D-beta/issues/190)

## [0.22.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.22.2...@cornerstonejs/tools@0.22.3) (2022-08-30)

### Bug Fixes

- toolName typo for Crosshairs tool ([#193](https://github.com/cornerstonejs/cornerstone3D-beta/issues/193)) ([46d13bc](https://github.com/cornerstonejs/cornerstone3D-beta/commit/46d13bcb047c2b71c17b0246359d9494fbd8fb89))

## [0.22.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.22.1...@cornerstonejs/tools@0.22.2) (2022-08-26)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.22.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.22.0...@cornerstonejs/tools@0.22.1) (2022-08-26)

### Bug Fixes

- shadow for annotations and stack viewport targetImageIdIndex bug ([#189](https://github.com/cornerstonejs/cornerstone3D-beta/issues/189)) ([be70be7](https://github.com/cornerstonejs/cornerstone3D-beta/commit/be70be70a543fffb18f7d05c69e16d5c0255a57e))

# [0.22.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.21.11...@cornerstonejs/tools@0.22.0) (2022-08-23)

### Features

- camera sync canvas relative ([#167](https://github.com/cornerstonejs/cornerstone3D-beta/issues/167)) ([2fd6c98](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2fd6c9830eb6e9da10960de0c25702b06716382a))

## [0.21.11](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.21.10...@cornerstonejs/tools@0.21.11) (2022-08-23)

### Bug Fixes

- invalid keybindings Alt and Ctrl ([#176](https://github.com/cornerstonejs/cornerstone3D-beta/issues/176)) ([d74d696](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d74d696b5de5fe1cd1fb6d36a32660c60140caa0))

## [0.21.10](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.21.9...@cornerstonejs/tools@0.21.10) (2022-08-23)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.21.9](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.21.8...@cornerstonejs/tools@0.21.9) (2022-08-19)

### Bug Fixes

- **demoData:** The URL was pointing to a private AWS account ([#175](https://github.com/cornerstonejs/cornerstone3D-beta/issues/175)) ([69dafea](https://github.com/cornerstonejs/cornerstone3D-beta/commit/69dafea902dcd224ea5d1d6d418d5e0c1cec2fe0))

## [0.21.8](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.21.7...@cornerstonejs/tools@0.21.8) (2022-08-18)

### Bug Fixes

- add extra missing exports and no static code block at build ([#179](https://github.com/cornerstonejs/cornerstone3D-beta/issues/179)) ([dfdc4bf](https://github.com/cornerstonejs/cornerstone3D-beta/commit/dfdc4bfbf331da40368a4976f3dc199bd355864a))

## [0.21.7](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.21.6...@cornerstonejs/tools@0.21.7) (2022-08-15)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.21.6](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.21.5...@cornerstonejs/tools@0.21.6) (2022-08-12)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.21.5](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.21.4...@cornerstonejs/tools@0.21.5) (2022-08-11)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.21.4](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.21.3...@cornerstonejs/tools@0.21.4) (2022-08-10)

### Bug Fixes

- unify handling of annotation units and remove 'MO' ([#161](https://github.com/cornerstonejs/cornerstone3D-beta/issues/161)) ([7fddeab](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7fddeab0f686fce5dc0e9c6953025ff14c00e252))

## [0.21.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.21.2...@cornerstonejs/tools@0.21.3) (2022-08-04)

### Bug Fixes

- make typescript strict true ([#162](https://github.com/cornerstonejs/cornerstone3D-beta/issues/162)) ([7c311f7](https://github.com/cornerstonejs/cornerstone3D-beta/commit/7c311f77f0532372ae82b6be2027bcd25925fa0d))

## [0.21.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.21.1...@cornerstonejs/tools@0.21.2) (2022-08-03)

### Bug Fixes

- wadouri metadata was not using scaling parameters properly ([#159](https://github.com/cornerstonejs/cornerstone3D-beta/issues/159)) ([d21aba5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d21aba56f1e0a8730088d89a4dfde8358d978a60))

## [0.21.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.21.0...@cornerstonejs/tools@0.21.1) (2022-08-03)

### Bug Fixes

- Attempt to fix build issues [@haehn](https://github.com/haehn) has reported ([#144](https://github.com/cornerstonejs/cornerstone3D-beta/issues/144)) ([2a7ec92](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2a7ec9271e012929682aa5c0a860cd65d0d5c02d))

# [0.21.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.20.15...@cornerstonejs/tools@0.21.0) (2022-07-29)

### Features

- volume viewport api with setProperties ([#154](https://github.com/cornerstonejs/cornerstone3D-beta/issues/154)) ([fab3abe](https://github.com/cornerstonejs/cornerstone3D-beta/commit/fab3abe907ddde1ee61bc121c40d4fc23d2dbfd7))

## [0.20.15](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.20.14...@cornerstonejs/tools@0.20.15) (2022-07-27)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.20.14](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.20.13...@cornerstonejs/tools@0.20.14) (2022-07-25)

### Bug Fixes

- annotation unit hydration bug and more color image support ([#151](https://github.com/cornerstonejs/cornerstone3D-beta/issues/151)) ([4f157dc](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4f157dc5d7a8d0d80abb5b68c35ed17cb5f349ed))

## [0.20.13](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.20.11...@cornerstonejs/tools@0.20.13) (2022-07-15)

### Bug Fixes

- Ensure d3 packages are also listed on dependencies ([#146](https://github.com/cornerstonejs/cornerstone3D-beta/issues/146)) ([5747dc6](https://github.com/cornerstonejs/cornerstone3D-beta/commit/5747dc6cbcb05eec690bf636ef733789c88f959f))

## [0.20.12](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.20.11...@cornerstonejs/tools@0.20.12) (2022-07-08)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.20.11](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.20.10...@cornerstonejs/tools@0.20.11) (2022-06-24)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.20.10](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.20.9...@cornerstonejs/tools@0.20.10) (2022-06-24)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.20.9](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.20.8...@cornerstonejs/tools@0.20.9) (2022-06-20)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.20.8](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.20.7...@cornerstonejs/tools@0.20.8) (2022-06-20)

### Bug Fixes

- Cleanup magnify canvas on mouse up ([#135](https://github.com/cornerstonejs/cornerstone3D-beta/issues/135)) ([6fd0c3f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6fd0c3fe114586f9e7ac0ab1f448b6c5199d1f7a))

## [0.20.7](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.20.6...@cornerstonejs/tools@0.20.7) (2022-06-20)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.20.6](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.20.5...@cornerstonejs/tools@0.20.6) (2022-06-20)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.20.5](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.20.4...@cornerstonejs/tools@0.20.5) (2022-06-20)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.20.4](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.20.3...@cornerstonejs/tools@0.20.4) (2022-06-17)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.20.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.20.2...@cornerstonejs/tools@0.20.3) (2022-06-17)

### Bug Fixes

- large image rendering, missing metadata for StackViewport, high DPI devices ([#127](https://github.com/cornerstonejs/cornerstone3D-beta/issues/127)) ([d4bf1c8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d4bf1c80391bcecaee64d9eb086416c42aa406e2))

## [0.20.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.20.1...@cornerstonejs/tools@0.20.2) (2022-06-16)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.20.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.20.0...@cornerstonejs/tools@0.20.1) (2022-06-14)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.20.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.19.1...@cornerstonejs/tools@0.20.0) (2022-06-14)

### Features

- remove unnecessary event firing for annotations ([#123](https://github.com/cornerstonejs/cornerstone3D-beta/issues/123)) ([03551d9](https://github.com/cornerstonejs/cornerstone3D-beta/commit/03551d9f9269b7bfd3d828dad4f8f38ef51703d1))

## [0.19.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.19.0...@cornerstonejs/tools@0.19.1) (2022-06-10)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.19.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.18.1...@cornerstonejs/tools@0.19.0) (2022-06-06)

### Features

- improved stack prefetch and zoom to mouse ([#121](https://github.com/cornerstonejs/cornerstone3D-beta/issues/121)) ([bc72d37](https://github.com/cornerstonejs/cornerstone3D-beta/commit/bc72d37b10f5a9e3e2bc9ed1254a707047f04f45))

## [0.18.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.18.0...@cornerstonejs/tools@0.18.1) (2022-06-01)

### Bug Fixes

- toolGroup default cursor ([#120](https://github.com/cornerstonejs/cornerstone3D-beta/issues/120)) ([8c385c4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/8c385c4780cbaf40400fffc310fd1e3b86056767))

# [0.18.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.17.4...@cornerstonejs/tools@0.18.0) (2022-05-31)

### Features

- improved threshold volume API and refactored boundingBox utils ([#117](https://github.com/cornerstonejs/cornerstone3D-beta/issues/117)) ([adc308b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/adc308bef0509852bc48c96114eb3268c3d100b9))

## [0.17.4](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.17.3...@cornerstonejs/tools@0.17.4) (2022-05-30)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.17.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.17.2...@cornerstonejs/tools@0.17.3) (2022-05-27)

### Bug Fixes

- scale factor for zoom in perspective mode and do not update clipping planes for non Volume Actors ([#116](https://github.com/cornerstonejs/cornerstone3D-beta/issues/116)) ([ce8c13e](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ce8c13e534a48392fc11dcb615d8d81275cd01d7))

## [0.17.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.17.1...@cornerstonejs/tools@0.17.2) (2022-05-27)

### Bug Fixes

- remove the need for slabThickness in volumeAPI for tools ([#113](https://github.com/cornerstonejs/cornerstone3D-beta/issues/113)) ([a5e431d](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a5e431dee952281be340994aa773a593a85fad04))

## [0.17.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.17.0...@cornerstonejs/tools@0.17.1) (2022-05-27)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.17.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.16.0...@cornerstonejs/tools@0.17.0) (2022-05-24)

### Features

- Add VOLUME_NEW_IMAGE event and Add jumpToSlice and default VOI for volume viewport ([#104](https://github.com/cornerstonejs/cornerstone3D-beta/issues/104)) ([d36a23a](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d36a23a4eaf5bafcc8dddc0ab796065098df616a))

# [0.16.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.15.4...@cornerstonejs/tools@0.16.0) (2022-05-24)

### Features

- Add Clipping planes for rendering ([#110](https://github.com/cornerstonejs/cornerstone3D-beta/issues/110)) ([1a6e4c7](https://github.com/cornerstonejs/cornerstone3D-beta/commit/1a6e4c742a3b89a88b46fd98d6cbeca5c95918aa))

## [0.15.4](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.15.3...@cornerstonejs/tools@0.15.4) (2022-05-16)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.15.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.15.2...@cornerstonejs/tools@0.15.3) (2022-05-16)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.15.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.15.1...@cornerstonejs/tools@0.15.2) (2022-05-16)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.15.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.15.0...@cornerstonejs/tools@0.15.1) (2022-05-13)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.15.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.14.1...@cornerstonejs/tools@0.15.0) (2022-05-12)

### Features

- Add CINE tool via playClip ([#99](https://github.com/cornerstonejs/cornerstone3D-beta/issues/99)) ([916d783](https://github.com/cornerstonejs/cornerstone3D-beta/commit/916d783a56a7abc2a46c7477e2685ad436ad3637))

## [0.14.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.14.0...@cornerstonejs/tools@0.14.1) (2022-05-11)

### Bug Fixes

- Attempt to resolve incompatible peerDeps situation ([#98](https://github.com/cornerstonejs/cornerstone3D-beta/issues/98)) ([00f141b](https://github.com/cornerstonejs/cornerstone3D-beta/commit/00f141bfa9f9a4b37c016d726a6d31f2330e2e44))

# [0.14.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.13.0...@cornerstonejs/tools@0.14.0) (2022-05-10)

### Features

- Add AngleTool and MagnifyTool ([#97](https://github.com/cornerstonejs/cornerstone3D-beta/issues/97)) ([2c4c800](https://github.com/cornerstonejs/cornerstone3D-beta/commit/2c4c800c4b3ba92164f728865b904933a2539210))

# [0.13.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.12.1...@cornerstonejs/tools@0.13.0) (2022-05-09)

### Features

- Add toolStyles configuration and DragProbe ([#93](https://github.com/cornerstonejs/cornerstone3D-beta/issues/93)) ([ba15be6](https://github.com/cornerstonejs/cornerstone3D-beta/commit/ba15be6d268b8c568bdf0e247e571f5ca29a26ad))

## [0.12.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.12.0...@cornerstonejs/tools@0.12.1) (2022-05-03)

### Bug Fixes

- rename ArrowTool to ArrowAnnotate ([#91](https://github.com/cornerstonejs/cornerstone3D-beta/issues/91)) ([9bd0cd8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/9bd0cd882746df909ee76549bc9818834ccc2ee3))

# [0.12.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.11.0...@cornerstonejs/tools@0.12.0) (2022-05-03)

### Features

- Planar freehand roi tool ([#89](https://github.com/cornerstonejs/cornerstone3D-beta/issues/89)) ([0067339](https://github.com/cornerstonejs/cornerstone3D-beta/commit/0067339e7cf7f6b26e8fd6342113d82eb6915409))

# [0.11.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.10.1...@cornerstonejs/tools@0.11.0) (2022-05-03)

### Features

- Add ArrowTool and remove toolName from drawing API ([#88](https://github.com/cornerstonejs/cornerstone3D-beta/issues/88)) ([217637c](https://github.com/cornerstonejs/cornerstone3D-beta/commit/217637cb2a48ca6e73cea7d1781a4a83fc482e79))

## [0.10.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.10.0...@cornerstonejs/tools@0.10.1) (2022-04-27)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.10.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.9.4...@cornerstonejs/tools@0.10.0) (2022-04-26)

### Features

- Add annotation completed event ([#84](https://github.com/cornerstonejs/cornerstone3D-beta/issues/84)) ([cd574da](https://github.com/cornerstonejs/cornerstone3D-beta/commit/cd574da73403e3030a5bc414778e08536fb77381))

## [0.9.4](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.9.3...@cornerstonejs/tools@0.9.4) (2022-04-22)

### Bug Fixes

- Camera events for flip and rotation changes ([#83](https://github.com/cornerstonejs/cornerstone3D-beta/issues/83)) ([82115ec](https://github.com/cornerstonejs/cornerstone3D-beta/commit/82115ec00bd924fb942473d04052473408b84eb7))

## [0.9.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.9.2...@cornerstonejs/tools@0.9.3) (2022-04-21)

### Bug Fixes

- selection API, requestPoolManager and VOI and Scaling ([#82](https://github.com/cornerstonejs/cornerstone3D-beta/issues/82)) ([bedd8dd](https://github.com/cornerstonejs/cornerstone3D-beta/commit/bedd8ddfa356c2d52a6e72f74c7cb3bb660a86ef))

## [0.9.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.9.1...@cornerstonejs/tools@0.9.2) (2022-04-20)

### Bug Fixes

- windowLevel event trigger and initial voi range ([#81](https://github.com/cornerstonejs/cornerstone3D-beta/issues/81)) ([38307d4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/38307d40cec60f2b3b8497abda8aa4fa657fc179))

## [0.9.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.9.0...@cornerstonejs/tools@0.9.1) (2022-04-19)

### Bug Fixes

- jumpToSlice and scaling of images in renderToCanvas ([#78](https://github.com/cornerstonejs/cornerstone3D-beta/issues/78)) ([bbebf7f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/bbebf7fbad28e670333783cd669e571ec2ae7358))

# [0.9.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.8.0...@cornerstonejs/tools@0.9.0) (2022-04-14)

### Features

- add scrollToSlice for element ([#76](https://github.com/cornerstonejs/cornerstone3D-beta/issues/76)) ([c43fe8f](https://github.com/cornerstonejs/cornerstone3D-beta/commit/c43fe8f955930a70be60015f2f6bc1d5bf9fffbb))

# [0.8.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.7.12...@cornerstonejs/tools@0.8.0) (2022-04-13)

### Features

- cachedStats to store imageId and volumeId ([#75](https://github.com/cornerstonejs/cornerstone3D-beta/issues/75)) ([a2404c4](https://github.com/cornerstonejs/cornerstone3D-beta/commit/a2404c4f1cb15a3935ba3af58fa7fc556716458c))

## [0.7.12](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.7.11...@cornerstonejs/tools@0.7.12) (2022-04-13)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.7.11](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.7.10...@cornerstonejs/tools@0.7.11) (2022-04-12)

### Bug Fixes

- Remove resemblejs from dependencies, add detect-gpu, clonedeep, CWIL ([#73](https://github.com/cornerstonejs/cornerstone3D-beta/issues/73)) ([db65d50](https://github.com/cornerstonejs/cornerstone3D-beta/commit/db65d50a5c7488f323ab2424cf9d750055b2e6d5))

## [0.7.10](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.7.9...@cornerstonejs/tools@0.7.10) (2022-04-12)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.7.9](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.7.8...@cornerstonejs/tools@0.7.9) (2022-04-11)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.7.8](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.7.7...@cornerstonejs/tools@0.7.8) (2022-04-04)

### Bug Fixes

- Correct module property for ESM builds in package.json ([#66](https://github.com/cornerstonejs/cornerstone3D-beta/issues/66)) ([d53b857](https://github.com/cornerstonejs/cornerstone3D-beta/commit/d53b8575aa8b93907f8bf127f36d9dfc10821478))

## [0.7.7](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.7.6...@cornerstonejs/tools@0.7.7) (2022-04-04)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.7.6](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.7.5...@cornerstonejs/tools@0.7.6) (2022-04-01)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.7.5](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.7.4...@cornerstonejs/tools@0.7.5) (2022-04-01)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.7.4](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.7.3...@cornerstonejs/tools@0.7.4) (2022-04-01)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.7.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.7.2...@cornerstonejs/tools@0.7.3) (2022-04-01)

### Bug Fixes

- Webpack externals were not properly defined ([70499a5](https://github.com/cornerstonejs/cornerstone3D-beta/commit/70499a55c5824b3f94920ffd48411118e6fe4bb8))

## [0.7.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.7.1...@cornerstonejs/tools@0.7.2) (2022-04-01)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.7.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.7.0...@cornerstonejs/tools@0.7.1) (2022-04-01)

### Bug Fixes

- cleanup exports, add docs and more tutorials ([#39](https://github.com/cornerstonejs/cornerstone3D-beta/issues/39)) ([743dea8](https://github.com/cornerstonejs/cornerstone3D-beta/commit/743dea89c7a726c29d396756bdd991c81e561105))

# [0.7.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.6.0...@cornerstonejs/tools@0.7.0) (2022-03-31)

### Features

- add crosshairs example and fix locking ([#40](https://github.com/cornerstonejs/cornerstone3D-beta/issues/40)) ([fe9ec50](https://github.com/cornerstonejs/cornerstone3D-beta/commit/fe9ec50a61c16a2f3655b1dbb405fa7e2ec2438f))

# [0.6.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.5.4...@cornerstonejs/tools@0.6.0) (2022-03-31)

### Features

- advanced examples ([#38](https://github.com/cornerstonejs/cornerstone3D-beta/issues/38)) ([27f26a1](https://github.com/cornerstonejs/cornerstone3D-beta/commit/27f26a12a1712b7542cc66ab1d077cfb0da50a86))

## [0.5.4](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.5.3...@cornerstonejs/tools@0.5.4) (2022-03-31)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.5.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.5.2...@cornerstonejs/tools@0.5.3) (2022-03-31)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.5.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.5.1...@cornerstonejs/tools@0.5.2) (2022-03-30)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.5.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.5.0...@cornerstonejs/tools@0.5.1) (2022-03-30)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.5.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.4.4...@cornerstonejs/tools@0.5.0) (2022-03-30)

### Features

- segmentation examples ([#29](https://github.com/cornerstonejs/cornerstone3D-beta/issues/29)) ([fd95a12](https://github.com/cornerstonejs/cornerstone3D-beta/commit/fd95a12910ffe87a201d5eb94cbae32e95a8be8f))

## [0.4.4](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.4.3...@cornerstonejs/tools@0.4.4) (2022-03-30)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.4.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.4.2...@cornerstonejs/tools@0.4.3) (2022-03-28)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.4.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.4.1...@cornerstonejs/tools@0.4.2) (2022-03-28)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.4.1](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.4.0...@cornerstonejs/tools@0.4.1) (2022-03-28)

**Note:** Version bump only for package @cornerstonejs/tools

# [0.4.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.3.0...@cornerstonejs/tools@0.4.0) (2022-03-28)

### Features

- Brush on mouse move ([#20](https://github.com/cornerstonejs/cornerstone3D-beta/issues/20)) ([4a08cce](https://github.com/cornerstonejs/cornerstone3D-beta/commit/4a08cce5e6cc2e9715367c233ab272bd259ca7d1))

# [0.3.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.2.0...@cornerstonejs/tools@0.3.0) (2022-03-28)

### Features

- Add a basic Brush tool ([6358b12](https://github.com/cornerstonejs/cornerstone3D-beta/commit/6358b126c9d03bd349f864cec53d22c92f8b1405))

# [0.2.0](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.1.4...@cornerstonejs/tools@0.2.0) (2022-03-28)

### Features

- Segmentation state restructure to add main representation ([#19](https://github.com/cornerstonejs/cornerstone3D-beta/issues/19)) ([b6eda97](https://github.com/cornerstonejs/cornerstone3D-beta/commit/b6eda97ab77ec244fd2e3a8c7d164efe78a4516f))

## [0.1.4](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.1.3...@cornerstonejs/tools@0.1.4) (2022-03-25)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.1.3](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.1.2...@cornerstonejs/tools@0.1.3) (2022-03-24)

**Note:** Version bump only for package @cornerstonejs/tools

## [0.1.2](https://github.com/cornerstonejs/cornerstone3D-beta/compare/@cornerstonejs/tools@0.1.1...@cornerstonejs/tools@0.1.2) (2022-03-24)

**Note:** Version bump only for package @cornerstonejs/tools

## 0.1.1 (2022-03-24)

**Note:** Version bump only for package @cornerstonejs/tools
