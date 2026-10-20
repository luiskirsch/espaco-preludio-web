import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdleInvitation } from '../app/diary-invitation.js';

function clock() {
  let now = 0, sequence = 0;
  const timers = new Map();
  return {
    schedule(callback, delay) { const id = ++sequence; timers.set(id, { callback, deadline: now + delay }); return id; },
    cancel(id) { timers.delete(id); },
    advance(milliseconds) {
      const end = now + milliseconds;
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].deadline - b[1].deadline)[0];
        if (!next || next[1].deadline > end) break;
        now = next[1].deadline; timers.delete(next[0]); next[1].callback();
      }
      now = end;
    },
  };
}

test('diary invitation waits ten full idle minutes and repeats without turning pages', () => {
  const time = clock();
  let calls = 0;
  const invitation = createIdleInvitation({ ...time, play: () => calls++ });
  assert.equal(invitation.enabled, true);
  time.advance(1_200_000);
  assert.equal(calls, 0, 'The timer starts paused until the diary is ready');
  invitation.resume();
  time.advance(599_999); assert.equal(calls, 0);
  time.advance(1); assert.equal(calls, 1);
  time.advance(600_000); assert.equal(calls, 2);
  invitation.pause();
  time.advance(1_200_000); assert.equal(calls, 2, 'Leaving the diary stops invitations');
  invitation.resume();
  time.advance(599_999); assert.equal(calls, 2, 'Leaving again starts a fresh ten minutes');
  time.advance(1); assert.equal(calls, 3);
  invitation.destroy();
  time.advance(600_000); assert.equal(calls, 3);
});

test('activity and the invitation preference reset or cancel the pending call', () => {
  const time = clock();
  let calls = 0;
  const invitation = createIdleInvitation({ ...time, play: () => calls++ });
  invitation.resume();
  time.advance(540_000); invitation.activity();
  time.advance(599_999); assert.equal(calls, 0);
  invitation.setEnabled(false); time.advance(1_200_000); assert.equal(calls, 0);
  invitation.setEnabled(true); time.advance(599_999); assert.equal(calls, 0);
  time.advance(1); assert.equal(calls, 1);
});
