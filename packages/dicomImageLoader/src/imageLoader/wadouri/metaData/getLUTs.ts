import type { DataSet, Element } from 'dicom-parser';
import type { LutType } from '../../../types';

function getLUT(pixelRepresentation: number, lutDataSet: DataSet): LutType {
  let numLUTEntries = lutDataSet.uint16('x00283002', 0);

  // Value 1 of LUT Descriptor is a US, which cannot hold 65536, so 0 means
  // 65536 entries (PS3.3 C.11.1.1). Reading it as 65535 dropped the last entry
  // of every full size LUT.
  if (numLUTEntries === 0) {
    numLUTEntries = 65536;
  }
  let firstValueMapped = 0;

  // Only value 2, First Value Mapped, is interpreted with the pixel
  // representation: it lives in the same space as the pixel data it maps.
  if (pixelRepresentation === 0) {
    firstValueMapped = lutDataSet.uint16('x00283002', 1);
  } else {
    firstValueMapped = lutDataSet.int16('x00283002', 1);
  }
  const numBitsPerEntry = lutDataSet.uint16('x00283002', 2);
  // console.log('LUT(', numLUTEntries, ',', firstValueMapped, ',', numBitsPerEntry, ')');
  const lut = {
    id: '1',
    firstValueMapped,
    numBitsPerEntry,
    lut: [],
  };

  const lutDataElement = lutDataSet.elements.x00283006;
  const bytesPerEntry = getBytesPerEntry(
    lutDataElement,
    numLUTEntries,
    numBitsPerEntry
  );

  // The descriptor cannot be trusted beyond the data actually received - a
  // short LUT Data would otherwise fill the tail of the table with undefined
  if (lutDataElement) {
    numLUTEntries = Math.min(
      numLUTEntries,
      Math.floor(lutDataElement.length / bytesPerEntry)
    );
  }

  // LUT Data is always unsigned, whatever the pixel representation says: it
  // holds output values, not pixel values. Reading it as int16 turned every
  // entry above 32767 negative, which also broke the "largest entry decides the
  // bit depth" heuristic the renderers use.
  for (let i = 0; i < numLUTEntries; i++) {
    if (bytesPerEntry === 1) {
      lut.lut[i] = lutDataSet.byteArray[lutDataElement.dataOffset + i];
    } else {
      lut.lut[i] = lutDataSet.uint16('x00283006', i);
    }
  }

  return lut;
}

/**
 * The width of one entry of LUT Data. An entry is 16 bits (LUT Data is US or
 * OW), but a LUT that declares 8 bits for each entry can hold one entry in each
 * byte. The length of the element says which of the two the file uses, because
 * the number of entries is known. Reading such a LUT as 16 bit words gave half
 * a LUT of nonsense.
 */
function getBytesPerEntry(
  lutDataElement: Element,
  numLUTEntries: number,
  numBitsPerEntry: number
): number {
  if (numBitsPerEntry === 8 && lutDataElement?.length === numLUTEntries) {
    return 1;
  }

  return 2;
}

function getLUTs(pixelRepresentation: number, lutSequence: Element): LutType[] {
  if (!lutSequence || !lutSequence.items || !lutSequence.items.length) {
    return;
  }
  const luts: LutType[] = [];

  for (let i = 0; i < lutSequence.items.length; i++) {
    const lutDataSet = lutSequence.items[i].dataSet;
    const lut = getLUT(pixelRepresentation, lutDataSet);

    if (lut) {
      luts.push(lut);
    }
  }

  return luts;
}

export default getLUTs;
