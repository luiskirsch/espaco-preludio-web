export const BOOKMARK_COLORS = {
  red: { label: 'Vermelho', hex: '#a5322b' },
  blue: { label: 'Azul', hex: '#477fba' },
  green: { label: 'Verde', hex: '#658854' },
  gold: { label: 'Dourado', hex: '#c59939' },
  purple: { label: 'Violeta', hex: '#9464b0' },
  rose: { label: 'Rosa', hex: '#c47491' },
};

// Offsets belong to the writing, so inserting or removing earlier words moves
// the ribbons along with their passage. A removed passage rests at the cut.
export function moveBookmarks(bookmarks = [], before, after) {
  if (before === after || !bookmarks.length) return bookmarks;
  let start = 0, oldEnd = before.length, newEnd = after.length;
  while (start < oldEnd && start < newEnd && before[start] === after[start]) start++;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  const delta = newEnd - oldEnd;
  const move = (position, end = false) => {
    if (position < start || end && position === start) return position;
    if (position >= oldEnd) return position + delta;
    return end ? newEnd : start;
  };
  return bookmarks.map(mark => {
    const nextStart = move(mark.start);
    return { ...mark, start: nextStart, end: Math.max(nextStart, move(mark.end, true)) };
  });
}
