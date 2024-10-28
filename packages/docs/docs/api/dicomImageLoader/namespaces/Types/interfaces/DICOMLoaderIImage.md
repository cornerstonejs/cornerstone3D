# Interface: DICOMLoaderIImage

## Extends

- `IImage`

## Properties

### bufferView?

> `optional` **bufferView**: `object`

#### buffer

> **buffer**: `ArrayBuffer`

#### offset

> **offset**: `number`

#### Inherited from

`Types.IImage.bufferView`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:90

***

### cachedLut?

> `optional` **cachedLut**: `object`

#### invert?

> `optional` **invert**: `boolean`

#### lutArray?

> `optional` **lutArray**: `Uint8ClampedArray`

#### modalityLUT?

> `optional` **modalityLUT**: `CPUFallbackLUT`

#### voiLUT?

> `optional` **voiLUT**: `CPUFallbackLUT`

#### windowCenter?

> `optional` **windowCenter**: `number` \| `number`[]

#### windowWidth?

> `optional` **windowWidth**: `number` \| `number`[]

#### Inherited from

`Types.IImage.cachedLut`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:76

***

### calibration?

> `optional` **calibration**: `IImageCalibration`

#### Inherited from

`Types.IImage.calibration`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:85

***

### color

> **color**: `boolean`

#### Inherited from

`Types.IImage.color`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:45

***

### colormap?

> `optional` **colormap**: `CPUFallbackColormap`

#### Inherited from

`Types.IImage.colormap`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:57

***

### columnPixelSpacing

> **columnPixelSpacing**: `number`

#### Inherited from

`Types.IImage.columnPixelSpacing`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:49

***

### columns

> **columns**: `number`

#### Inherited from

`Types.IImage.columns`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:42

***

### data?

> `optional` **data**: `DataSet`

#### Defined in

[packages/dicomImageLoader/src/types/DICOMLoaderIImage.ts:8](https://github.com/cornerstonejs/cornerstone3D/blob/ca63091460d8bdfd067d14a09b3105a6b4852ade/packages/dicomImageLoader/src/types/DICOMLoaderIImage.ts#L8)

***

### dataType

> **dataType**: `PixelDataTypedArrayString`

#### Inherited from

`Types.IImage.dataType`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:88

***

### decodeTimeInMS

> **decodeTimeInMS**: `number`

#### Overrides

`Types.IImage.decodeTimeInMS`

#### Defined in

[packages/dicomImageLoader/src/types/DICOMLoaderIImage.ts:4](https://github.com/cornerstonejs/cornerstone3D/blob/ca63091460d8bdfd067d14a09b3105a6b4852ade/packages/dicomImageLoader/src/types/DICOMLoaderIImage.ts#L4)

***

### floatPixelData?

> `optional` **floatPixelData**: `ByteArray` \| `Float32Array`

#### Defined in

[packages/dicomImageLoader/src/types/DICOMLoaderIImage.ts:5](https://github.com/cornerstonejs/cornerstone3D/blob/ca63091460d8bdfd067d14a09b3105a6b4852ade/packages/dicomImageLoader/src/types/DICOMLoaderIImage.ts#L5)

***

### FrameOfReferenceUID?

> `optional` **FrameOfReferenceUID**: `string`

#### Inherited from

`Types.IImage.FrameOfReferenceUID`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:87

***

### getCanvas()

> **getCanvas**: () => `HTMLCanvasElement`

#### Returns

`HTMLCanvasElement`

#### Inherited from

`Types.IImage.getCanvas`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:40

***

### getPixelData()

> **getPixelData**: () => `PixelDataTypedArray`

#### Returns

`PixelDataTypedArray`

#### Inherited from

`Types.IImage.getPixelData`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:39

***

### height

> **height**: `number`

#### Inherited from

`Types.IImage.height`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:43

***

### imageFrame?

> `optional` **imageFrame**: `ImageFrame`

#### Overrides

`Types.IImage.imageFrame`

#### Defined in

[packages/dicomImageLoader/src/types/DICOMLoaderIImage.ts:9](https://github.com/cornerstonejs/cornerstone3D/blob/ca63091460d8bdfd067d14a09b3105a6b4852ade/packages/dicomImageLoader/src/types/DICOMLoaderIImage.ts#L9)

***

### imageId

> **imageId**: `string`

#### Inherited from

`Types.IImage.imageId`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:18

***

### imageQualityStatus?

> `optional` **imageQualityStatus**: `ImageQualityStatus`

#### Inherited from

`Types.IImage.imageQualityStatus`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:84

***

### intercept

> **intercept**: `number`

#### Inherited from

`Types.IImage.intercept`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:35

***

### invert

> **invert**: `boolean`

#### Inherited from

`Types.IImage.invert`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:52

***

### isPreScaled?

> `optional` **isPreScaled**: `boolean`

#### Inherited from

`Types.IImage.isPreScaled`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:21

***

### loadTimeInMS?

> `optional` **loadTimeInMS**: `number`

#### Overrides

`Types.IImage.loadTimeInMS`

#### Defined in

[packages/dicomImageLoader/src/types/DICOMLoaderIImage.ts:6](https://github.com/cornerstonejs/cornerstone3D/blob/ca63091460d8bdfd067d14a09b3105a6b4852ade/packages/dicomImageLoader/src/types/DICOMLoaderIImage.ts#L6)

***

### maxPixelValue

> **maxPixelValue**: `number`

#### Inherited from

`Types.IImage.maxPixelValue`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:33

***

### minPixelValue

> **minPixelValue**: `number`

#### Inherited from

`Types.IImage.minPixelValue`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:32

***

### modalityLUT?

> `optional` **modalityLUT**: `CPUFallbackLUT`

#### Inherited from

`Types.IImage.modalityLUT`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:55

***

### numberOfComponents

> **numberOfComponents**: `number`

#### Inherited from

`Types.IImage.numberOfComponents`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:47

***

### photometricInterpretation?

> `optional` **photometricInterpretation**: `string`

#### Inherited from

`Types.IImage.photometricInterpretation`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:53

***

### preScale?

> `optional` **preScale**: `object`

#### enabled

> **enabled**: `boolean`

#### scaled?

> `optional` **scaled**: `boolean`

#### scalingParameters?

> `optional` **scalingParameters**: `object`

#### scalingParameters.modality?

> `optional` **modality**: `string`

#### scalingParameters.rescaleIntercept?

> `optional` **rescaleIntercept**: `number`

#### scalingParameters.rescaleSlope?

> `optional` **rescaleSlope**: `number`

#### scalingParameters.suvbw?

> `optional` **suvbw**: `number`

#### Inherited from

`Types.IImage.preScale`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:22

***

### referencedImageId?

> `optional` **referencedImageId**: `string`

#### Inherited from

`Types.IImage.referencedImageId`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:19

***

### render()?

> `optional` **render**: (`enabledElement`, `invalidated`) => `unknown`

#### Parameters

• **enabledElement**: `CPUFallbackEnabledElement`

• **invalidated**: `boolean`

#### Returns

`unknown`

#### Inherited from

`Types.IImage.render`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:48

***

### rgba

> **rgba**: `boolean`

#### Inherited from

`Types.IImage.rgba`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:46

***

### rowPixelSpacing

> **rowPixelSpacing**: `number`

#### Inherited from

`Types.IImage.rowPixelSpacing`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:50

***

### rows

> **rows**: `number`

#### Inherited from

`Types.IImage.rows`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:41

***

### scaling?

> `optional` **scaling**: `object`

#### PT?

> `optional` **PT**: `object`

#### PT.SUVbsaFactor?

> `optional` **SUVbsaFactor**: `number`

#### PT.suvbwToSuvbsa?

> `optional` **suvbwToSuvbsa**: `number`

#### PT.suvbwToSuvlbm?

> `optional` **suvbwToSuvlbm**: `number`

#### PT.SUVlbmFactor?

> `optional` **SUVlbmFactor**: `number`

#### Inherited from

`Types.IImage.scaling`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:58

***

### sharedCacheKey?

> `optional` **sharedCacheKey**: `string`

#### Inherited from

`Types.IImage.sharedCacheKey`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:20

***

### sizeInBytes

> **sizeInBytes**: `number`

#### Inherited from

`Types.IImage.sizeInBytes`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:54

***

### sliceThickness?

> `optional` **sliceThickness**: `number`

#### Inherited from

`Types.IImage.sliceThickness`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:51

***

### slope

> **slope**: `number`

#### Inherited from

`Types.IImage.slope`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:34

***

### stats?

> `optional` **stats**: `object`

#### lastGetPixelDataTime?

> `optional` **lastGetPixelDataTime**: `number`

#### lastLutGenerateTime?

> `optional` **lastLutGenerateTime**: `number`

#### lastPutImageDataTime?

> `optional` **lastPutImageDataTime**: `number`

#### lastRenderedViewport?

> `optional` **lastRenderedViewport**: `unknown`

#### lastRenderTime?

> `optional` **lastRenderTime**: `number`

#### lastStoredPixelDataToCanvasImageDataTime?

> `optional` **lastStoredPixelDataToCanvasImageDataTime**: `number`

#### Inherited from

`Types.IImage.stats`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:68

***

### totalTimeInMS?

> `optional` **totalTimeInMS**: `number`

#### Defined in

[packages/dicomImageLoader/src/types/DICOMLoaderIImage.ts:7](https://github.com/cornerstonejs/cornerstone3D/blob/ca63091460d8bdfd067d14a09b3105a6b4852ade/packages/dicomImageLoader/src/types/DICOMLoaderIImage.ts#L7)

***

### transferSyntaxUID?

> `optional` **transferSyntaxUID**: `string`

#### Defined in

[packages/dicomImageLoader/src/types/DICOMLoaderIImage.ts:11](https://github.com/cornerstonejs/cornerstone3D/blob/ca63091460d8bdfd067d14a09b3105a6b4852ade/packages/dicomImageLoader/src/types/DICOMLoaderIImage.ts#L11)

***

### voiLUT?

> `optional` **voiLUT**: `CPUFallbackLUT`

#### Inherited from

`Types.IImage.voiLUT`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:56

***

### voiLUTFunction

> **voiLUTFunction**: `string`

#### Overrides

`Types.IImage.voiLUTFunction`

#### Defined in

[packages/dicomImageLoader/src/types/DICOMLoaderIImage.ts:10](https://github.com/cornerstonejs/cornerstone3D/blob/ca63091460d8bdfd067d14a09b3105a6b4852ade/packages/dicomImageLoader/src/types/DICOMLoaderIImage.ts#L10)

***

### voxelManager?

> `optional` **voxelManager**: `IVoxelManager`\<`number`\> \| `IVoxelManager`\<`RGB`\>

#### Inherited from

`Types.IImage.voxelManager`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:89

***

### width

> **width**: `number`

#### Inherited from

`Types.IImage.width`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:44

***

### windowCenter

> **windowCenter**: `number` \| `number`[]

#### Inherited from

`Types.IImage.windowCenter`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:36

***

### windowWidth

> **windowWidth**: `number` \| `number`[]

#### Inherited from

`Types.IImage.windowWidth`

#### Defined in

packages/core/dist/esm/types/IImage.d.ts:37
