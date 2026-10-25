import assert from 'node:assert/strict';
import {hasPhysicalPdfPageCitation as valid} from './qa-physical-pdf-page.mjs';
for(const text of ['DIN EN 81-20 §5.4.7.4, PDF-Seite 79', 'EN 81-20, PDF page 79', 'EN 81-20, página PDF 79', 'EN 81-20، صفحهٔ PDF 79'])
  assert.equal(valid(text),true,'must accept a physical PDF page: '+text);
for(const text of ['EN 81-20 S. 73', 'EN 81-20 p. 73', 'EN 81-20 page 73', 'EN 81-20 PDF page 0', 'EN 81-20 PDF page -2', 'EN 81-20 PDF page 79.3', 'EN 81-20 PDF page 79foo', '', null])
  assert.equal(valid(text),false,'must reject a non-physical or invalid page: '+text);
console.log('PASS: 4 locale PDF-page labels accepted; 9 generic/invalid page cases rejected');
