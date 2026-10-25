import assert from 'node:assert/strict';
import {hasPhysicalPdfPageCitation as valid,hasEn8120ReleaseCitationContract as releaseCitation} from './qa-physical-pdf-page.mjs';
for(const text of ['DIN EN 81-20 §5.4.7.4, PDF-Seite 79', 'EN 81-20, PDF page 79', 'EN 81-20, página PDF 79', 'EN 81-20، صفحهٔ PDF 79'])
  assert.equal(valid(text),true,'must accept a physical PDF page: '+text);
for(const text of ['EN 81-20 S. 73', 'EN 81-20 p. 73', 'EN 81-20 page 73', 'EN 81-20 PDF page 0', 'EN 81-20 PDF page -2', 'EN 81-20 PDF page 79.3', 'EN 81-20 PDF page 79foo', '', null])
  assert.equal(valid(text),false,'must reject a non-physical or invalid page: '+text);
for(const text of [
  'DIN EN 81-20:2014-11 §5.4.7.4, PDF-Seite 79',
  'EN 81-20:2020 5.4.7.4, PDF page 80',
  'DIN EN 81-20:2014-11 §5.4.7.4، صفحهٔ PDF 79',
]) assert.equal(releaseCitation(text),true,'complete edition/clause/page citation required');
for(const text of [
  'EN 81-20 §5.4.7.4, PDF page 79', // no edition
  'DIN EN 81-20:2014-11 PDF-Seite 79', // no clause
  'DIN EN 81-20:2014-11 §5.4.7.4, Seite 73', // printed page only
  'DIN EN 81-20:2014-11 §5.4.7.4, PDF-Seite 79.3', // invalid page
  'DIN EN 81-50:2014-11 §5.4.7.4, PDF-Seite 79', // wrong standard
  'PDF page 79', '', null,
]) assert.equal(releaseCitation(text),false,'incomplete release citation must fail closed');
console.log('PASS: 4 physical-page labels, 9 negative labels, 3 complete release citations, 8 incomplete release citations');
