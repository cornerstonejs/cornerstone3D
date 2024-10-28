# Interface: DICOMLoaderDataSetWithFetchMore

## Extends

- `DataSet`

## Properties

### attributeTag()

> **attributeTag**: (`tag`) => `string`

Finds the element for tag and parses an element tag according to the 'AT' VR definition if it exists and has data. Use this function for VR type AT.

#### Parameters

• **tag**: `string`

#### Returns

`string`

#### Inherited from

`DataSet.attributeTag`

#### Defined in

node\_modules/dicom-parser/index.d.ts:95

***

### byteArray

> **byteArray**: `ByteArray`

#### Inherited from

`DataSet.byteArray`

#### Defined in

node\_modules/dicom-parser/index.d.ts:27

***

### byteArrayParser

> **byteArrayParser**: `ByteArrayParser`

#### Inherited from

`DataSet.byteArrayParser`

#### Defined in

node\_modules/dicom-parser/index.d.ts:28

***

### double()

> **double**: (`tag`, `index`?) => `number`

Finds the element for tag and returns a 64 bit floating point number if it exists and has data. Use this function for VR type FD.

#### Parameters

• **tag**: `string`

• **index?**: `number`

#### Returns

`number`

#### Inherited from

`DataSet.double`

#### Defined in

node\_modules/dicom-parser/index.d.ts:65

***

### elements

> **elements**: `object`

Access element with the DICOM tag in the format xGGGGEEEE.

#### Index Signature

 \[`tag`: `string`\]: `Element`

#### Inherited from

`DataSet.elements`

#### Defined in

node\_modules/dicom-parser/index.d.ts:32

***

### fetchMore()?

> `optional` **fetchMore**: (`fetchOptions`) => `Promise`\<[`DICOMLoaderDataSetWithFetchMore`](DICOMLoaderDataSetWithFetchMore.md)\>

#### Parameters

• **fetchOptions**

• **fetchOptions.fetchedLength**: `number`

• **fetchOptions.imageId**: `string`

• **fetchOptions.lengthToFetch**: `number`

• **fetchOptions.uri**: `string`

#### Returns

`Promise`\<[`DICOMLoaderDataSetWithFetchMore`](DICOMLoaderDataSetWithFetchMore.md)\>

#### Defined in

[packages/dicomImageLoader/src/types/DICOMLoaderDataSetWithFetchMore.ts:4](https://github.com/cornerstonejs/cornerstone3D/blob/5addf8e516390235f8a3d16ccc818957013f098f/packages/dicomImageLoader/src/types/DICOMLoaderDataSetWithFetchMore.ts#L4)

***

### float()

> **float**: (`tag`, `index`?) => `number`

Finds the element for tag and returns a 32 bit floating point number if it exists and has data. Use this function for VR type FL.

#### Parameters

• **tag**: `string`

• **index?**: `number`

#### Returns

`number`

#### Inherited from

`DataSet.float`

#### Defined in

node\_modules/dicom-parser/index.d.ts:60

***

### floatString()

> **floatString**: (`tag`, `index`?) => `number`

Finds the element for tag and parses a string to a float if it exists and has data. Use this function for VR type DS.

#### Parameters

• **tag**: `string`

• **index?**: `number`

#### Returns

`number`

#### Inherited from

`DataSet.floatString`

#### Defined in

node\_modules/dicom-parser/index.d.ts:85

***

### int16()

> **int16**: (`tag`, `index`?) => `number`

Finds the element for tag and returns a signed int 16 if it exists and has data. Use this function for VR type SS.

#### Parameters

• **tag**: `string`

• **index?**: `number`

#### Returns

`number`

#### Inherited from

`DataSet.int16`

#### Defined in

node\_modules/dicom-parser/index.d.ts:45

***

### int32()

> **int32**: (`tag`, `index`?) => `number`

Finds the element for tag and returns a signed int 32 if it exists and has data. Use this function for VR type SL.

#### Parameters

• **tag**: `string`

• **index?**: `number`

#### Returns

`number`

#### Inherited from

`DataSet.int32`

#### Defined in

node\_modules/dicom-parser/index.d.ts:55

***

### intString()

> **intString**: (`tag`, `index`?) => `number`

Finds the element for tag and parses a string to an integer if it exists and has data. Use this function for VR type IS.

#### Parameters

• **tag**: `string`

• **index?**: `number`

#### Returns

`number`

#### Inherited from

`DataSet.intString`

#### Defined in

node\_modules/dicom-parser/index.d.ts:90

***

### numStringValues()

> **numStringValues**: (`tag`) => `number`

Returns the actual Value Multiplicity of an element - the number of values in a multi-valued element.

#### Parameters

• **tag**: `string`

#### Returns

`number`

#### Inherited from

`DataSet.numStringValues`

#### Defined in

node\_modules/dicom-parser/index.d.ts:70

***

### string()

> **string**: (`tag`, `index`?) => `string`

Finds the element for tag and returns a string if it exists and has data. Use this function for VR types AE, CS, SH, and LO.

#### Parameters

• **tag**: `string`

• **index?**: `number`

#### Returns

`string`

#### Inherited from

`DataSet.string`

#### Defined in

node\_modules/dicom-parser/index.d.ts:75

***

### text()

> **text**: (`tag`, `index`?) => `string`

Finds the element for tag and returns a string with the leading spaces preserved and trailing spaces removed if it exists and has data. Use this function for VR types UT, ST, and LT.

#### Parameters

• **tag**: `string`

• **index?**: `number`

#### Returns

`string`

#### Inherited from

`DataSet.text`

#### Defined in

node\_modules/dicom-parser/index.d.ts:80

***

### uint16()

> **uint16**: (`tag`, `index`?) => `number`

Finds the element for tag and returns an unsigned int 16 if it exists and has data. Use this function for VR type US.

#### Parameters

• **tag**: `string`

• **index?**: `number`

#### Returns

`number`

#### Inherited from

`DataSet.uint16`

#### Defined in

node\_modules/dicom-parser/index.d.ts:40

***

### uint32()

> **uint32**: (`tag`, `index`?) => `number`

Finds the element for tag and returns an unsigned int 32 if it exists and has data. Use this function for VR type UL.

#### Parameters

• **tag**: `string`

• **index?**: `number`

#### Returns

`number`

#### Inherited from

`DataSet.uint32`

#### Defined in

node\_modules/dicom-parser/index.d.ts:50

***

### warnings

> **warnings**: `string`[]

#### Inherited from

`DataSet.warnings`

#### Defined in

node\_modules/dicom-parser/index.d.ts:35
