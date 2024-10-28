# Interface: LoaderXhrRequestParams

## Description

mutable object

## Properties

### deferred?

> `optional` **deferred**: `object`

#### reject()

> **reject**: (`reason`) => `void`

##### Parameters

• **reason**: `any`

##### Returns

`void`

#### resolve()

> **resolve**: (`value`) => `void`

##### Parameters

• **value**: `ArrayBuffer` \| `PromiseLike`\<`ArrayBuffer`\>

##### Returns

`void`

#### Defined in

[packages/dicomImageLoader/src/types/XHRRequest.ts:12](https://github.com/cornerstonejs/cornerstone3D/blob/5addf8e516390235f8a3d16ccc818957013f098f/packages/dicomImageLoader/src/types/XHRRequest.ts#L12)

***

### imageId?

> `optional` **imageId**: `string`

#### Defined in

[packages/dicomImageLoader/src/types/XHRRequest.ts:16](https://github.com/cornerstonejs/cornerstone3D/blob/5addf8e516390235f8a3d16ccc818957013f098f/packages/dicomImageLoader/src/types/XHRRequest.ts#L16)

***

### url?

> `optional` **url**: `string`

#### Defined in

[packages/dicomImageLoader/src/types/XHRRequest.ts:11](https://github.com/cornerstonejs/cornerstone3D/blob/5addf8e516390235f8a3d16ccc818957013f098f/packages/dicomImageLoader/src/types/XHRRequest.ts#L11)
