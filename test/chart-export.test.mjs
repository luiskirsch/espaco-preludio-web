import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';
import { layoutPdfText } from '../js/chart-pdf-text.js';

test('PDF contains existing notes, clinical context, independent records, supplements and clinical documents', async () => {
  const html = await readFile(new URL('../prontuario.html', import.meta.url), 'utf8');
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  let source;
  walk.simple(parse(script, { ecmaVersion: 'latest', sourceType: 'module' }), {
    FunctionDeclaration(node) { if (node.id.name === 'buildProntuarioPdf') source = script.slice(node.start, node.end); }
  });
  assert.ok(source);
  source = source.replace('await import("https://esm.sh/pdf-lib@1.17.1")', 'pdfLib');
  const drawn = [];
  let pages = 0;
  const font = { widthOfTextAtSize(text, size) {
    if ([...text].some(char => char.codePointAt(0) > 255)) throw new Error('Unsupported font character');
    return text.length * size * 0.5;
  } };
  const pdf = { embedFont: async () => font, getPageCount: () => pages,
    addPage() { pages++; return { drawText(text, options) { drawn.push({ text, ...options }); }, drawLine() {} }; }, save: async () => new Uint8Array([1, 2, 3]) };
  const run = vm.runInNewContext('(' + source + ')', {
    pdfLib: { PDFDocument: { create: async () => pdf }, StandardFonts: { Helvetica: 'regular', HelveticaBold: 'bold' }, rgb: () => ({}) },
    layoutPdfText, therapist: { displayName: 'Fixture professional', numeroConselho: '12345' }, sess: { conselho: { sigla: 'CREFITO' } },
    currentLocale: () => 'pt-BR', fmtDuration: value => String(value), isSessionOverdue: () => false,
    tr: (_key, text, variables = {}) => String(text).replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '')
  });
  const at = Date.parse('2026-10-10T12:00:00Z');
  const result = await run({ patient: { name: 'Fixture patient', birthdate: '1990-01-01', createdAt: at, demographics: { city: 'Fixture city' } },
    sessions: [{ sessionId: 'session', createdAt: at, startedAt: at, completedAt: at + 1200000, status: 'completed' }],
    notesBySession: new Map([['session', [{ text: 'Existing encrypted session note', createdAt: at }]]]), receitas: [], escalas: [],
    chartData: { clinical: { summary: 'Clinical context included', allergyStatus: 'none', goals: 'Care plan goals included' },
      entries: [{ title: 'Independent SOAP record', occurredAt: at, createdAt: at, sections: [{ key: 'subjective', label: 'Subjective', text: 'Independent entry text 🧠\n' + 'x'.repeat(300) }] },
        { title: 'Record supplement', occurredAt: at, createdAt: at, parentEntryId: 'original_record', sections: [{ label: 'Supplement', text: 'Correction remains linked to the original' }] }],
      documents: [{ documentoId: 'document_id', tipo: 'encaminhamento', status: 'signed', createdAt: at, form: { resumoClinico: 'Linked clinical document content', patientId: 'not-to-print' } }] }
  });
  assert.equal(result.length, 3);
  const text = drawn.map(line => line.text).join('\n');
  for (const expected of ['CREFITO 12345', 'Fixture city', 'Existing encrypted session note', 'Clinical context included', 'Care plan goals included',
    'Independent SOAP record', '[U+1F9E0]', 'Record supplement', 'original_record', 'Linked clinical document content']) assert.ok(text.includes(expected), expected);
  assert.equal(text.includes('not-to-print'), false);
  assert.ok(pages >= 3);
  assert.ok(drawn.filter(line => line.size >= 10).every(line => line.x + font.widthOfTextAtSize(line.text, line.size) <= 546));
});
