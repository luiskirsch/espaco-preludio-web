import test from 'node:test';
import assert from 'node:assert/strict';
import { moveBookmarks } from '../app/diary-bookmarks.js';

test('bookmarks follow insertions and deletions before a selected passage', () => {
  const text = 'Hoje fui ao parque e sorri.';
  const mark = { id: 'mark-1', label: 'O parque', color: 'blue', start: 12, end: 18 };
  const added = 'De manhã. ' + text;
  const moved = moveBookmarks([mark], text, added);
  assert.equal(added.slice(moved[0].start, moved[0].end), 'parque');
  assert.equal(moved[0].label, mark.label);
  assert.deepEqual(moveBookmarks(moved, added, text), [mark]);
  assert.deepEqual(moveBookmarks([mark], text, ''), [{ ...mark, start: 0, end: 0 }]);
});

test('bookmark boundaries keep inserted text outside the passage and track edits inside it', () => {
  const mark = { id: 'mark-1', label: 'O parque', color: 'red', start: 4, end: 10 };
  assert.deepEqual(moveBookmarks([mark], 'Meu parque lindo', 'Meu belo parque lindo'), [{ ...mark, start: 9, end: 15 }]);
  assert.deepEqual(moveBookmarks([mark], 'Meu parque lindo', 'Meu parque florido lindo'), [mark]);
  assert.deepEqual(moveBookmarks([mark], 'Meu parque lindo', 'Meu jardim lindo'), [mark]);
  assert.deepEqual(moveBookmarks([mark], 'Meu parque lindo', 'Meu par lindo'), [{ ...mark, end: 7 }]);
});
