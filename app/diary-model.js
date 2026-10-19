export const FEELINGS = {
  serenidade: { label: 'Serenidade', icon: '☁', color: '#9cbbc0' },
  nostalgia: { label: 'Nostalgia', icon: '🍂', color: '#d6ad72' },
  alegria: { label: 'Alegria', icon: '☀', color: '#e0ba56' },
  gratidao: { label: 'Gratidão', icon: '✧', color: '#9ba57d' },
  tristeza: { label: 'Tristeza', icon: '☂', color: '#8e9eb8' },
  ansiedade: { label: 'Ansiedade', icon: '〰', color: '#b19bb8' },
  cansaco: { label: 'Cansaço', icon: '☾', color: '#b49b86' },
};
export const AROMAS = { '': ['Sem aroma', '◌'], lavanda: ['Lavanda', '🪻'], cafe: ['Café recém-passado', '☕'], chuva: ['Terra molhada', '🌧'], laranja: ['Casca de laranja', '🍊'], madeira: ['Madeira & aconchego', '🪵'] };
export const WEATHER = { clear: ['Céu aberto', '☀️'], cloudy: ['Entre nuvens', '☁️'], rain: ['Chuva suave', '🌧️'], storm: ['Tempestade', '⛈️'], snow: ['Neve', '❄️'], fog: ['Névoa', '🌫️'] };
export function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function dateLabel(date, options = {}) {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', ...options }).format(new Date(`${date}T12:00:00Z`));
}
export function draft(kind = 'diary') {
  return { id: `page-${crypto.randomUUID()}`, kind, date: today(), text: '', version: 0, unlockDate: null, feelings: [], tags: [], aroma: '', aromaText: '', font: 'hand', weather: '' };
}
export function countWords(text) { return String(text || '').trim().split(/\s+/u).filter(Boolean).length; }
export function feelingStats(entries) {
  const counts = new Map();
  let total = 0;
  for (const entry of entries) {
    if (entry.locked) continue;
    for (const feeling of new Set(entry.feelings || [])) {
      if (!FEELINGS[feeling]) continue;
      counts.set(feeling, (counts.get(feeling) || 0) + 1); total++;
    }
  }
  return [...counts].map(([id, count]) => ({ id, count, percent: count / total * 100, ...FEELINGS[id] })).sort((a, b) => b.count - a.count);
}
export function searchEntries(entries, query = '') {
  const normalize = text => String(text).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
  const term = normalize(query.trim());
  return entries.filter(item => !term || (!item.locked && normalize([item.text, ...(item.tags || [])].join(' ')).includes(term)) || normalize(item.date).includes(term));
}
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
