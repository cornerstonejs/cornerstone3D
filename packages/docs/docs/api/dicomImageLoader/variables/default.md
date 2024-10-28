# Variable: default

> `const` **default**: `object`

## Type declaration

### constants

> **constants**: [`constants`](../namespaces/constants/index.md)

### convertColorSpace()

> **convertColorSpace**: (`imageFrame`, `colorBuffer`, `useRGBA`) => `void`

#### Parameters

• **imageFrame**: `any`

• **colorBuffer**: `any`

• **useRGBA**: `any`

#### Returns

`void`

### convertPALETTECOLOR()

> **convertPALETTECOLOR**: (`imageFrame`, `colorBuffer`, `useRGBA`) => `void`

Convert pixel data with PALETTE COLOR Photometric Interpretation to RGBA

#### Parameters

• **imageFrame**: `ImageFrame`

The ImageFrame to convert

• **colorBuffer**: `ByteArray`

The buffer to write the converted pixel data to

• **useRGBA**: `boolean`

#### Returns

`void`

### convertRGBColorByPixel()

> **convertRGBColorByPixel**: (`imageFrame`, `colorBuffer`, `useRGBA`) => `void`

#### Parameters

• **imageFrame**: `ByteArray`

• **colorBuffer**: `ByteArray`

• **useRGBA**: `boolean`

#### Returns

`void`

### convertRGBColorByPlane()

> **convertRGBColorByPlane**: (`imageFrame`, `colorBuffer`, `useRGBA`) => `void`

#### Parameters

• **imageFrame**: `ByteArray`

• **colorBuffer**: `ByteArray`

• **useRGBA**: `boolean`

#### Returns

`void`

### convertYBRFullByPixel()

> **convertYBRFullByPixel**: (`imageFrame`, `colorBuffer`, `useRGBA`) => `void`

#### Parameters

• **imageFrame**: `ByteArray`

• **colorBuffer**: `ByteArray`

• **useRGBA**: `boolean`

#### Returns

`void`

### convertYBRFullByPlane()

> **convertYBRFullByPlane**: (`imageFrame`, `colorBuffer`, `useRGBA`) => `void`

#### Parameters

• **imageFrame**: `ByteArray`

• **colorBuffer**: `ByteArray`

• **useRGBA**: `boolean`

#### Returns

`void`

### createImage()

> **createImage**: (`imageId`, `pixelData`, `transferSyntax`, `options`) => `Promise`\<[`DICOMLoaderIImage`](../namespaces/Types/interfaces/DICOMLoaderIImage.md) \| `Types.IImageFrame`\>

#### Parameters

• **imageId**: `string`

• **pixelData**: `ByteArray`

• **transferSyntax**: `string`

• **options**: [`DICOMLoaderImageOptions`](../namespaces/Types/interfaces/DICOMLoaderImageOptions.md) = `{}`

#### Returns

`Promise`\<[`DICOMLoaderIImage`](../namespaces/Types/interfaces/DICOMLoaderIImage.md) \| `Types.IImageFrame`\>

### decodeJPEGBaseline8BitColor()

> **decodeJPEGBaseline8BitColor**: (`imageFrame`, `pixelData`, `canvas`) => `Promise`\<`Types.IImageFrame`\>

#### Parameters

• **imageFrame**: `ImageFrame`

• **pixelData**: `ByteArray`

• **canvas**: `HTMLCanvasElement`

#### Returns

`Promise`\<`Types.IImageFrame`\>

### getImageFrame()

> **getImageFrame**: (`imageId`) => `Types.IImageFrame`

#### Parameters

• **imageId**: `string`

#### Returns

`Types.IImageFrame`

### getMinMax()

> **getMinMax**: (`storedPixelData`) => `object`

Calculate the minimum and maximum values in an Array

#### Parameters

• **storedPixelData**: `PixelDataTypedArray`

#### Returns

`object`

##### max

> **max**: `number`

##### min

> **min**: `number`

### getPixelData()

> **getPixelData**: (`uri`, `imageId`, `mediaType`, `options`?) => `PromiseIterator`\<`unknown`\> \| [`LoaderXhrRequestPromise`](../namespaces/Types/interfaces/LoaderXhrRequestPromise.md)\<`object`\> \| `Promise`\<`object` \| `object`\>

#### Parameters

• **uri**: `string`

• **imageId**: `string`

• **mediaType**: `string` = `'application/octet-stream'`

• **options?**: `CornerstoneWadoRsLoaderOptions`

#### Returns

`PromiseIterator`\<`unknown`\> \| [`LoaderXhrRequestPromise`](../namespaces/Types/interfaces/LoaderXhrRequestPromise.md)\<`object`\> \| `Promise`\<`object` \| `object`\>

### init()

> **init**: (`options`) => `void`

#### Parameters

• **options**: [`LoaderOptions`](../namespaces/Types/interfaces/LoaderOptions.md)

#### Returns

`void`

### internal

> **internal**: `object`

### internal.getOptions()

> **getOptions**: () => [`LoaderOptions`](../namespaces/Types/interfaces/LoaderOptions.md)

#### Returns

[`LoaderOptions`](../namespaces/Types/interfaces/LoaderOptions.md)

### internal.setOptions()

> **setOptions**: (`newOptions`) => `void`

#### Parameters

• **newOptions**: [`LoaderOptions`](../namespaces/Types/interfaces/LoaderOptions.md)

#### Returns

`void`

### internal.streamRequest()

> **streamRequest**: (`url`, `imageId`, `defaultHeaders`, `options`) => `PromiseIterator`\<`unknown`\>

This function does a streaming parse from an http request, delivering
combined/subsequent parts of the result as iterations on a
ProgressiveIterator instance.

#### Parameters

• **url**: `string`

to request and parse as either multipart or singlepart.

• **imageId**: `string`

the imageId to be used in the returned detail object

• **defaultHeaders**: `Record`\<`string`, `string`\> = `{}`

• **options**: `CornerstoneWadoRsLoaderOptions` = `{}`

#### Returns

`PromiseIterator`\<`unknown`\>

### internal.xhrRequest()

> **xhrRequest**: (`url`, `imageId`, `defaultHeaders`, `params`) => [`LoaderXhrRequestPromise`](../namespaces/Types/interfaces/LoaderXhrRequestPromise.md)\<`ArrayBuffer`\>

#### Parameters

• **url**: `string`

• **imageId**: `string`

• **defaultHeaders**: `Record`\<`string`, `string`\> = `{}`

• **params**: [`LoaderXhrRequestParams`](../namespaces/Types/interfaces/LoaderXhrRequestParams.md) = `{}`

#### Returns

[`LoaderXhrRequestPromise`](../namespaces/Types/interfaces/LoaderXhrRequestPromise.md)\<`ArrayBuffer`\>

### isColorImage()

> **isColorImage**: (`photoMetricInterpretation`) => `boolean`

#### Parameters

• **photoMetricInterpretation**: `string`

#### Returns

`boolean`

### isJPEGBaseline8BitColor()

> **isJPEGBaseline8BitColor**: (`imageFrame`, `transferSyntax`) => `boolean`

#### Parameters

• **imageFrame**: `ImageFrame`

• **transferSyntax**: `string`

#### Returns

`boolean`

### wadors

> **wadors**: `object`

### wadors.findIndexOfString()

> **findIndexOfString**: (`data`, `str`, `offset`?) => `number`

#### Parameters

• **data**: `Uint8Array`

• **str**: `string`

• **offset?**: `number`

#### Returns

`number`

### wadors.getPixelData()

> **getPixelData**: (`uri`, `imageId`, `mediaType`, `options`?) => `PromiseIterator`\<`unknown`\> \| [`LoaderXhrRequestPromise`](../namespaces/Types/interfaces/LoaderXhrRequestPromise.md)\<`object`\> \| `Promise`\<`object` \| `object`\>

#### Parameters

• **uri**: `string`

• **imageId**: `string`

• **mediaType**: `string` = `'application/octet-stream'`

• **options?**: `CornerstoneWadoRsLoaderOptions`

#### Returns

`PromiseIterator`\<`unknown`\> \| [`LoaderXhrRequestPromise`](../namespaces/Types/interfaces/LoaderXhrRequestPromise.md)\<`object`\> \| `Promise`\<`object` \| `object`\>

### wadors.loadImage()

> **loadImage**: (`imageId`, `options`) => `Types.IImageLoadObject`

#### Parameters

• **imageId**: `string`

• **options**: `CornerstoneWadoRsLoaderOptions` = `{}`

#### Returns

`Types.IImageLoadObject`

### wadors.metaData

> **metaData**: `object`

### wadors.metaData.getNumberString()

> **getNumberString**: (`element`, `index`?, `defaultValue`?) => `number`

Returns the first string value as a Javascript number

#### Parameters

• **element**: [`WADORSMetaDataElement`](../namespaces/Types/interfaces/WADORSMetaDataElement.md)\<`boolean` \| `number`[] \| `string`[]\>

The javascript object for the specified element in the metadata

• **index?**: `number`

the index of the value in a multi-valued element, default is 0

• **defaultValue?**: `number`

The default value to return if the element does not exist

#### Returns

`number`

### wadors.metaData.getNumberValue()

> **getNumberValue**: (`element`, `index`?) => `number`

#### Parameters

• **element**: [`WADORSMetaDataElement`](../namespaces/Types/interfaces/WADORSMetaDataElement.md)\<`boolean` \| `number`[] \| `string`[]\>

• **index?**: `number`

#### Returns

`number`

### wadors.metaData.getNumberValues()

> **getNumberValues**: (`element`, `minimumLength`?) => `number`[]

Returns the values as an array of javascript numbers

#### Parameters

• **element**: [`WADORSMetaDataElement`](../namespaces/Types/interfaces/WADORSMetaDataElement.md)\<`boolean` \| `number`[] \| `string`[]\>

The javascript object for the specified element in the metadata

• **minimumLength?**: `number`

the minimum number of values

#### Returns

`number`[]

### wadors.metaData.getValue()

> **getValue**: \<`ReturnType`\>(`element`, `index`?, `defaultValue`?) => `ReturnType`

Returns the raw value

#### Type Parameters

• **ReturnType** = `unknown`

#### Parameters

• **element**: [`WADORSMetaDataElement`](../namespaces/Types/interfaces/WADORSMetaDataElement.md)\<`boolean` \| `number`[] \| `string`[]\>

The javascript object for the specified element in the metadata

• **index?**: `number`

the index of the value in a multi-valued element, default is 0

• **defaultValue?**: `ReturnType`

The default value to return if the element does not exist

#### Returns

`ReturnType`

### wadors.metaData.metaDataProvider()

> **metaDataProvider**: (`type`, `imageId`) => `object`

#### Parameters

• **type**: `any`

• **imageId**: `any`

#### Returns

`object`

### wadors.metaDataManager

> **metaDataManager**: `object`

### wadors.metaDataManager.add()

> **add**: (`imageId`, `metadata`) => `void`

#### Parameters

• **imageId**: `string`

• **metadata**: [`WADORSMetaData`](../namespaces/Types/type-aliases/WADORSMetaData.md)

#### Returns

`void`

### wadors.metaDataManager.get()

> **get**: (`imageId`) => [`WADORSMetaData`](../namespaces/Types/type-aliases/WADORSMetaData.md)

#### Parameters

• **imageId**: `string`

#### Returns

[`WADORSMetaData`](../namespaces/Types/type-aliases/WADORSMetaData.md)

### wadors.metaDataManager.purge()

> **purge**: () => `void`

#### Returns

`void`

### wadors.metaDataManager.remove()

> **remove**: (`imageId`) => `void`

#### Parameters

• **imageId**: `any`

#### Returns

`void`

### wadors.register()

> **register**: () => `void`

#### Returns

`void`

### wadouri

> **wadouri**: `object`

### wadouri.dataSetCacheManager

> **dataSetCacheManager**: `object`

### wadouri.dataSetCacheManager.get()

> **get**: (`uri`) => `DataSet`

#### Parameters

• **uri**: `string`

#### Returns

`DataSet`

### wadouri.dataSetCacheManager.getInfo()

> **getInfo**: () => `CornerstoneWadoLoaderCacheManagerInfoResponse`

#### Returns

`CornerstoneWadoLoaderCacheManagerInfoResponse`

### wadouri.dataSetCacheManager.isLoaded()

> **isLoaded**: (`uri`) => `boolean`

#### Parameters

• **uri**: `string`

#### Returns

`boolean`

### wadouri.dataSetCacheManager.load()

> **load**: (`uri`, `loadRequest`, `imageId`) => `CornerstoneWadoLoaderCachedPromise`

#### Parameters

• **uri**: `string`

• **loadRequest**: [`LoadRequestFunction`](../namespaces/Types/type-aliases/LoadRequestFunction.md) = `...`

• **imageId**: `string`

#### Returns

`CornerstoneWadoLoaderCachedPromise`

### wadouri.dataSetCacheManager.purge()

> **purge**: () => `void`

#### Returns

`void`

### wadouri.dataSetCacheManager.unload()

> **unload**: (`uri`) => `void`

#### Parameters

• **uri**: `string`

#### Returns

`void`

### wadouri.dataSetCacheManager.update()

> **update**: (`uri`, `dataSet`) => `void`

#### Parameters

• **uri**: `string`

• **dataSet**: `DataSet`

#### Returns

`void`

### wadouri.fileManager

> **fileManager**: `object`

### wadouri.fileManager.add()

> **add**: (`file`) => `string`

#### Parameters

• **file**: `Blob`

#### Returns

`string`

### wadouri.fileManager.get()

> **get**: (`index`) => `Blob`

#### Parameters

• **index**: `number`

#### Returns

`Blob`

### wadouri.fileManager.purge()

> **purge**: () => `void`

#### Returns

`void`

### wadouri.fileManager.remove()

> **remove**: (`index`) => `void`

#### Parameters

• **index**: `number`

#### Returns

`void`

### wadouri.getEncapsulatedImageFrame()

> **getEncapsulatedImageFrame**: (`dataSet`, `frameIndex`) => `ByteArray`

#### Parameters

• **dataSet**: `DataSet`

• **frameIndex**: `number`

#### Returns

`ByteArray`

### wadouri.getLoaderForScheme()

> **getLoaderForScheme**: (`scheme`) => [`LoadRequestFunction`](../namespaces/Types/type-aliases/LoadRequestFunction.md)

#### Parameters

• **scheme**: `string`

#### Returns

[`LoadRequestFunction`](../namespaces/Types/type-aliases/LoadRequestFunction.md)

### wadouri.getPixelData()

> **getPixelData**: (`dataSet`, `frameIndex`) => `ByteArray`

#### Parameters

• **dataSet**: `DataSet`

• **frameIndex**: `number` = `0`

#### Returns

`ByteArray`

### wadouri.getUncompressedImageFrame()

> **getUncompressedImageFrame**: (`dataSet`, `frameIndex`) => `Uint8Array`

Function to deal with extracting an image frame from an encapsulated data set.

#### Parameters

• **dataSet**: `DataSet`

• **frameIndex**: `number`

#### Returns

`Uint8Array`

### wadouri.loadFileRequest()

> **loadFileRequest**: (`uri`) => `Promise`\<`ArrayBuffer`\>

#### Parameters

• **uri**: `string`

#### Returns

`Promise`\<`ArrayBuffer`\>

### wadouri.loadImage()

> **loadImage**: (`imageId`, `options`) => `Types.IImageLoadObject`

#### Parameters

• **imageId**: `string`

• **options**: [`DICOMLoaderImageOptions`](../namespaces/Types/interfaces/DICOMLoaderImageOptions.md) = `{}`

#### Returns

`Types.IImageLoadObject`

### wadouri.loadImageFromPromise()

> **loadImageFromPromise**: (`dataSetPromise`, `imageId`, `frame`, `sharedCacheKey`, `options`, `callbacks`?) => `Types.IImageLoadObject`

Given the dataSetPromise and imageId this will return a promise to be
resolved with an image object containing the loaded image.

#### Parameters

• **dataSetPromise**: `Promise`\<`DataSet`\>

A promise that resolves to a DataSet object.

• **imageId**: `string`

The imageId of the image to be loaded.

• **frame**: `number` = `0`

The frame number to be loaded in case of multiframe. it should
be noted that this is used to extract the pixelData from dicomParser and
dicomParser is 0-based index (the first pixelData is frame 0); however,
in metadata and imageId frame is 1-based index (the first frame is frame 1).

• **sharedCacheKey**: `string`

A key to be used to cache the loaded image.

• **options**: [`DICOMLoaderImageOptions`](../namespaces/Types/interfaces/DICOMLoaderImageOptions.md)

Options to be used when loading the image.

• **callbacks?**

Callbacks to be called when the image is loaded.

• **callbacks.imageDoneCallback?**

#### Returns

`Types.IImageLoadObject`

An object containing a promise to be resolved with the loaded image

### wadouri.metaData

> **metaData**: `object`

### wadouri.metaData.getImagePixelModule()

> **getImagePixelModule**: (`dataSet`) => `Types.ImagePixelModuleMetadata`

#### Parameters

• **dataSet**: `DataSet`

#### Returns

`Types.ImagePixelModuleMetadata`

### wadouri.metaData.getLUTs()

> **getLUTs**: (`pixelRepresentation`, `lutSequence`) => [`LutType`](../namespaces/Types/interfaces/LutType.md)[]

#### Parameters

• **pixelRepresentation**: `number`

• **lutSequence**: `Element`

#### Returns

[`LutType`](../namespaces/Types/interfaces/LutType.md)[]

### wadouri.metaData.getModalityLUTOutputPixelRepresentation()

> **getModalityLUTOutputPixelRepresentation**: (`dataSet`) => `number`

#### Parameters

• **dataSet**: `DataSet`

#### Returns

`number`

### wadouri.metaData.getNumberValues()

> **getNumberValues**: (`dataSet`, `tag`, `minimumLength`) => `number`[]

#### Parameters

• **dataSet**: `DataSet`

• **tag**: `string`

• **minimumLength**: `number`

#### Returns

`number`[]

### wadouri.metaData.metadataForDataset()

> **metadataForDataset**: (`type`, `imageId`, `dataSet`) => `any`

#### Parameters

• **type**: `any`

• **imageId**: `any`

• **dataSet**: `DataSet`

#### Returns

`any`

### wadouri.metaData.metaDataProvider()

> **metaDataProvider**: (`type`, `imageId`) => `any`

#### Parameters

• **type**: `any`

• **imageId**: `any`

#### Returns

`any`

### wadouri.parseImageId()

> **parseImageId**: (`imageId`) => `CornerstoneImageUrl`

#### Parameters

• **imageId**: `string`

#### Returns

`CornerstoneImageUrl`

### wadouri.register()

> **register**: () => `void`

#### Returns

`void`

### wadouri.unpackBinaryFrame()

> **unpackBinaryFrame**: (`byteArray`, `frameOffset`, `pixelsPerFrame`) => `Uint8Array`

Function to deal with unpacking a binary frame

#### Parameters

• **byteArray**: `ByteArray`

• **frameOffset**: `number`

• **pixelsPerFrame**: `number`

#### Returns

`Uint8Array`

## Defined in

[packages/dicomImageLoader/src/index.ts:24](https://github.com/cornerstonejs/cornerstone3D/blob/ca63091460d8bdfd067d14a09b3105a6b4852ade/packages/dicomImageLoader/src/index.ts#L24)
