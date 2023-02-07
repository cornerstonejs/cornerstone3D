/**
 * Create the dictionary.js DICOM dictionary file from the Standard.
 * Reformat The DICOM dictionary PS3.6 and PS3.7 docbook XML files (from e.g. standard docs) to JavaScript syntax.
 * Based on https://github.com/pydicom/pydicom/blob/8112bb69bfc0423c3a08cb89e7960defbe7237bf/source/generate_dict/generate_dicom_dict.py
 */
const fs = require('fs/promises');
const http = require('http');
const xml2js = require('xml2js');

require('@babel/register');
const DICTIONARY_PATH = './src/dictionary.js';
const dictionary = require(DICTIONARY_PATH).default;
const { Tag } = require('./src/Tag');

async function main() {
  const tags = [];

  /**
   * Collect DICOM tags from XML documents
   */
  const part06 = await getDocbook('part06/part06.xml');
  const part06Rows = part06.book.chapter.find(chapter => chapter.$['xml:id'] === 'chapter_6').table[0].tbody[0].tr;
  tags.push(...part06Rows.map(row => {
    const retired = getCellData(row.td[5])?.startsWith('RET');
    const name = getCellData(row.td[2]);
    return {
      tag: getCellData(row.td[0]),
      vr: getCellData(row.td[3]),
      name: retired ? `RETIRED_${name}` : name,
      vm: getCellData(row.td[4]),
      version: retired ? 'DICOM/retired' : 'DICOM',
    }
  }));

  const part07 = await getDocbook('part07/part07.xml');
  const chapterE = part07.book.chapter.find(chapter => chapter.$['xml:id'] === 'chapter_E');
  const commandFields = chapterE.section[0].table[0].tbody[0].tr;
  tags.push(...commandFields.map(row => {
    return {
      tag: getCellData(row.td[0]),
      vr: getCellData(row.td[3]),
      name: getCellData(row.td[2]),
      vm: getCellData(row.td[4]),
      version: 'DICOM',
    }
  }));
  const retiredCommandFields = chapterE.section[1].table[0].tbody[0].tr;
  tags.push(...retiredCommandFields.map(row => {
    return {
      tag: getCellData(row.td[0]),
      vr: getCellData(row.td[3]),
      name: `RETIRED_${getCellData(row.td[2])}`,
      vm: getCellData(row.td[4]),
      version: 'DICOM/retired',
    }
  }));

  const newTags = tags.filter(tag => tag.vr && tag.name && tag.vm)
    .filter(tag => !(tag.tag in dictionary)) // filter already defined
    .filter(tag => !/[(,\dA-F]x+[A-F\d,)]/.test(tag.tag)); // filter repeater tags

  /**
   * Insert new tags into dictionary, ordered among tags with the same version
   */
  const dictionaryArray = Object.values(dictionary);
  for (const newTag of newTags) {
    const parsedTag = Tag.fromPString(newTag.tag);
    const insertIndex = dictionaryArray.findIndex(tag => {
      if (tag.version !== newTag.version) {
        return false;
      }
      const thisTag = Tag.fromPString(tag.tag);
      return thisTag.toCleanString() > parsedTag.toCleanString();
    });
    dictionaryArray.splice(insertIndex, 0, newTag);
  }

  await writeDictionary(dictionaryArray);
}

async function writeDictionary(tags) {
  let data = 'const dictionary = {';
  for (const tag of tags) {
    if (!tag.tag) {
      data += `
    "": {
        tag: ""
    },`
      continue;
    }
    const tagKey = tag.tag.includes('"') ? `'${tag.tag}'` : `"${tag.tag}"`;
    data += `
    ${tagKey}: {
        tag: ${tagKey},
        vr: "${tag.vr}",
        name: "${tag.name}",
        vm: "${tag.vm}",
        version: "${tag.version ?? 'PrivateTag'}"
    },`;
  }
  data += `
};

export default dictionary;
`;

  await fs.writeFile(DICTIONARY_PATH, data);
}

async function getDocbook(part) {
  const source = await getUrl(`http://dicom.nema.org/medical/dicom/current/source/docbook/${part}`);
  return xml2js.parseStringPromise(source);
}

function getCellData(td) {
  const para = td.para?.[0];
  if (!para) {
    return undefined;
  }
  const text = para.emphasis ? para.emphasis[0]._ : para._;
  return text?.trim().replace(/[\u200b\uffff]/g, '');
}

function getUrl(url) {
  return new Promise((resolve, reject) => {
    http.get(url, request => {
      let data = '';
      request.on('error', () => {
        reject(error);
      });
      request.on('end', () => {
        resolve(data);
      });
      request.on('data', chunk => {
        data += chunk;
      });
    });
  });
}

if (require.main === module) {
  main().catch(error => {
    console.log(error);
  });
}
