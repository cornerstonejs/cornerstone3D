# Interface: LoaderOptions

## Properties

### beforeProcessing()?

> `optional` **beforeProcessing**: (`xhr`) => `Promise`\<`ArrayBuffer`\>

#### Parameters

• **xhr**: `XMLHttpRequest`

#### Returns

`Promise`\<`ArrayBuffer`\>

#### Defined in

[packages/dicomImageLoader/src/types/LoaderOptions.ts:24](https://github.com/cornerstonejs/cornerstone3D/blob/5addf8e516390235f8a3d16ccc818957013f098f/packages/dicomImageLoader/src/types/LoaderOptions.ts#L24)

***

### beforeSend()?

> `optional` **beforeSend**: (`xhr`, `imageId`, `defaultHeaders`, `params`) => `void` \| `Record`\<`string`, `string`\>

#### Parameters

• **xhr**: `XMLHttpRequest`

• **imageId**: `string`

• **defaultHeaders**: `Record`\<`string`, `string`\>

• **params**: [`LoaderXhrRequestParams`](LoaderXhrRequestParams.md)

#### Returns

`void` \| `Record`\<`string`, `string`\>

#### Defined in

[packages/dicomImageLoader/src/types/LoaderOptions.ts:17](https://github.com/cornerstonejs/cornerstone3D/blob/5addf8e516390235f8a3d16ccc818957013f098f/packages/dicomImageLoader/src/types/LoaderOptions.ts#L17)

***

### decodeConfig?

> `optional` **decodeConfig**: [`LoaderDecodeOptions`](LoaderDecodeOptions.md)

#### Defined in

[packages/dicomImageLoader/src/types/LoaderOptions.ts:33](https://github.com/cornerstonejs/cornerstone3D/blob/5addf8e516390235f8a3d16ccc818957013f098f/packages/dicomImageLoader/src/types/LoaderOptions.ts#L33)

***

### errorInterceptor()?

> `optional` **errorInterceptor**: (`error`) => `void`

#### Parameters

• **error**: [`LoaderXhrRequestError`](LoaderXhrRequestError.md)

#### Returns

`void`

#### Defined in

[packages/dicomImageLoader/src/types/LoaderOptions.ts:31](https://github.com/cornerstonejs/cornerstone3D/blob/5addf8e516390235f8a3d16ccc818957013f098f/packages/dicomImageLoader/src/types/LoaderOptions.ts#L31)

***

### imageCreated()?

> `optional` **imageCreated**: (`imageObject`) => `void`

#### Parameters

• **imageObject**: `unknown`

#### Returns

`void`

#### Defined in

[packages/dicomImageLoader/src/types/LoaderOptions.ts:26](https://github.com/cornerstonejs/cornerstone3D/blob/5addf8e516390235f8a3d16ccc818957013f098f/packages/dicomImageLoader/src/types/LoaderOptions.ts#L26)

***

### maxWebWorkers?

> `optional` **maxWebWorkers**: `number`

#### Defined in

[packages/dicomImageLoader/src/types/LoaderOptions.ts:8](https://github.com/cornerstonejs/cornerstone3D/blob/5addf8e516390235f8a3d16ccc818957013f098f/packages/dicomImageLoader/src/types/LoaderOptions.ts#L8)

***

### onloadend()?

> `optional` **onloadend**: (`event`, `params`) => `void`

#### Parameters

• **event**: `ProgressEvent`\<`EventTarget`\>

• **params**: `unknown`

#### Returns

`void`

#### Defined in

[packages/dicomImageLoader/src/types/LoaderOptions.ts:28](https://github.com/cornerstonejs/cornerstone3D/blob/5addf8e516390235f8a3d16ccc818957013f098f/packages/dicomImageLoader/src/types/LoaderOptions.ts#L28)

***

### onloadstart()?

> `optional` **onloadstart**: (`event`, `params`) => `void`

#### Parameters

• **event**: `ProgressEvent`\<`EventTarget`\>

• **params**: `unknown`

#### Returns

`void`

#### Defined in

[packages/dicomImageLoader/src/types/LoaderOptions.ts:27](https://github.com/cornerstonejs/cornerstone3D/blob/5addf8e516390235f8a3d16ccc818957013f098f/packages/dicomImageLoader/src/types/LoaderOptions.ts#L27)

***

### onprogress()?

> `optional` **onprogress**: (`event`, `params`) => `void`

#### Parameters

• **event**: `ProgressEvent`\<`EventTarget`\>

• **params**: `unknown`

#### Returns

`void`

#### Defined in

[packages/dicomImageLoader/src/types/LoaderOptions.ts:30](https://github.com/cornerstonejs/cornerstone3D/blob/5addf8e516390235f8a3d16ccc818957013f098f/packages/dicomImageLoader/src/types/LoaderOptions.ts#L30)

***

### onreadystatechange()?

> `optional` **onreadystatechange**: (`event`, `params`) => `void`

#### Parameters

• **event**: `Event`

• **params**: `unknown`

#### Returns

`void`

#### Defined in

[packages/dicomImageLoader/src/types/LoaderOptions.ts:29](https://github.com/cornerstonejs/cornerstone3D/blob/5addf8e516390235f8a3d16ccc818957013f098f/packages/dicomImageLoader/src/types/LoaderOptions.ts#L29)

***

### open()?

> `optional` **open**: (`xhr`, `url`, `defaultHeaders`, `params`) => `void`

#### Parameters

• **xhr**: `XMLHttpRequest`

• **url**: `string`

• **defaultHeaders**: `Record`\<`string`, `string`\>

• **params**: [`LoaderXhrRequestParams`](LoaderXhrRequestParams.md)

#### Returns

`void`

#### Defined in

[packages/dicomImageLoader/src/types/LoaderOptions.ts:10](https://github.com/cornerstonejs/cornerstone3D/blob/5addf8e516390235f8a3d16ccc818957013f098f/packages/dicomImageLoader/src/types/LoaderOptions.ts#L10)

***

### strict?

> `optional` **strict**: `boolean`

#### Defined in

[packages/dicomImageLoader/src/types/LoaderOptions.ts:32](https://github.com/cornerstonejs/cornerstone3D/blob/5addf8e516390235f8a3d16ccc818957013f098f/packages/dicomImageLoader/src/types/LoaderOptions.ts#L32)
