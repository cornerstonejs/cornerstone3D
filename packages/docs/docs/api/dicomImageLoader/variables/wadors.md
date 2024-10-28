# Variable: wadors

> **wadors**: `object`

## Type declaration

### findIndexOfString()

> **findIndexOfString**: (`data`, `str`, `offset`?) => `number`

#### Parameters

• **data**: `Uint8Array`

• **str**: `string`

• **offset?**: `number`

#### Returns

`number`

### getPixelData()

> **getPixelData**: (`uri`, `imageId`, `mediaType`, `options`?) => `PromiseIterator`\<`unknown`\> \| [`LoaderXhrRequestPromise`](../namespaces/Types/interfaces/LoaderXhrRequestPromise.md)\<`object`\> \| `Promise`\<`object` \| `object`\>

#### Parameters

• **uri**: `string`

• **imageId**: `string`

• **mediaType**: `string` = `'application/octet-stream'`

• **options?**: `CornerstoneWadoRsLoaderOptions`

#### Returns

`PromiseIterator`\<`unknown`\> \| [`LoaderXhrRequestPromise`](../namespaces/Types/interfaces/LoaderXhrRequestPromise.md)\<`object`\> \| `Promise`\<`object` \| `object`\>

### loadImage()

> **loadImage**: (`imageId`, `options`) => `Types.IImageLoadObject`

#### Parameters

• **imageId**: `string`

• **options**: `CornerstoneWadoRsLoaderOptions` = `{}`

#### Returns

`Types.IImageLoadObject`

### metaData

> **metaData**: `object`

### metaData.getNumberString()

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

### metaData.getNumberValue()

> **getNumberValue**: (`element`, `index`?) => `number`

#### Parameters

• **element**: [`WADORSMetaDataElement`](../namespaces/Types/interfaces/WADORSMetaDataElement.md)\<`boolean` \| `number`[] \| `string`[]\>

• **index?**: `number`

#### Returns

`number`

### metaData.getNumberValues()

> **getNumberValues**: (`element`, `minimumLength`?) => `number`[]

Returns the values as an array of javascript numbers

#### Parameters

• **element**: [`WADORSMetaDataElement`](../namespaces/Types/interfaces/WADORSMetaDataElement.md)\<`boolean` \| `number`[] \| `string`[]\>

The javascript object for the specified element in the metadata

• **minimumLength?**: `number`

the minimum number of values

#### Returns

`number`[]

### metaData.getValue()

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

### metaData.metaDataProvider()

> **metaDataProvider**: (`type`, `imageId`) => `object`

#### Parameters

• **type**: `any`

• **imageId**: `any`

#### Returns

`object`

### metaDataManager

> **metaDataManager**: `object`

### metaDataManager.add()

> **add**: (`imageId`, `metadata`) => `void`

#### Parameters

• **imageId**: `string`

• **metadata**: [`WADORSMetaData`](../namespaces/Types/type-aliases/WADORSMetaData.md)

#### Returns

`void`

### metaDataManager.get()

> **get**: (`imageId`) => [`WADORSMetaData`](../namespaces/Types/type-aliases/WADORSMetaData.md)

#### Parameters

• **imageId**: `string`

#### Returns

[`WADORSMetaData`](../namespaces/Types/type-aliases/WADORSMetaData.md)

### metaDataManager.purge()

> **purge**: () => `void`

#### Returns

`void`

### metaDataManager.remove()

> **remove**: (`imageId`) => `void`

#### Parameters

• **imageId**: `any`

#### Returns

`void`

### register()

> **register**: () => `void`

#### Returns

`void`

## Defined in

[packages/dicomImageLoader/src/imageLoader/wadors/index.ts:20](https://github.com/cornerstonejs/cornerstone3D/blob/ca63091460d8bdfd067d14a09b3105a6b4852ade/packages/dicomImageLoader/src/imageLoader/wadors/index.ts#L20)
