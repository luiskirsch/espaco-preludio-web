import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('nova consulta continua da data completa para o campo de hora', async () => {
  const script = await read('js/new-session-modal.js');

  assert.match(script, /id="scheduledDate"[^>]*type="date"/);
  assert.match(script, /id="scheduledTime"[^>]*type="time"/);
  assert.match(script, /scheduledDateDigits === 8[\s\S]*scheduledTimeInput\.focus\(\)/);
  assert.match(script, /const year = Number\(scheduledDateInput\.value\.slice\(0, 4\)\)/);
  assert.match(script, /if \(year >= 1000\) scheduledTimeInput\.focus\(\)/);
  assert.match(script, /`\$\{scheduledDateRaw\}T\$\{scheduledTimeRaw\}`/);
  assert.doesNotMatch(script, /type="datetime-local"/);
});
