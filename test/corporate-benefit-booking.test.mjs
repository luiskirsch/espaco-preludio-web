import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registration = readFileSync(resolve(root, 'colaborador-cadastro.html'), 'utf8');
const booking = readFileSync(resolve(root, 'agendar.html'), 'utf8');

test('inscrição corporativa não promete acesso imediato nem preço extra fixo', () => {
  assert.match(registration, /até 2 consultas por mês/);
  assert.match(registration, /aprovação da empresa/);
  assert.match(registration, /crie sua conta de paciente com este mesmo e-mail/);
  assert.doesNotMatch(registration, /R\$\s*60[,\.]00/);
});

test('agendamento corporativo valida saldo e preço no servidor', () => {
  assert.match(booking, /\/therapy\/colaborador\/beneficio\$\{query\}/);
  assert.match(booking, /scheduledAt=/);
  assert.match(booking, /Authorization: `Bearer \$\{await benefitUser\.getIdToken\(\)\}`/);
  assert.match(booking, /acceptExtraPriceCents: quotedExtraCents/);
  assert.match(booking, /extraPriceConsent/);
});

test('consulta adicional só apresenta sucesso após confirmação do Pix', () => {
  assert.match(booking, /data\.paymentRequired === true/);
  assert.match(booking, /\/criar-pix/);
  assert.match(booking, /\/status-pagamento/);
  assert.match(booking, /data\.paid === true/);
  assert.match(booking, /Pagamento confirmado\. Seu pedido foi encaminhado/);
});

test('scripts de cadastro, agendamento e administração têm sintaxe válida', () => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  for (const name of ['colaborador-cadastro.html', 'agendar.html', 'admin-empresas.html', 'admin-colaboradores.html', 'admin-repasses.html', 'empresa-painel.html']) {
    const page = readFileSync(resolve(root, name), 'utf8');
    const scripts = [...page.matchAll(/<script\s+type="module">([\s\S]*?)<\/script>/g)];
    assert.ok(scripts.length > 0, `${name}: script ausente`);
    for (const [, source] of scripts) {
      const withoutImports = source.replace(/^\s*import\s+[\s\S]*?\s+from\s+["'][^"']+["'];\s*$/gm, '');
      assert.doesNotMatch(withoutImports, /^\s*import\s/m, `${name}: import não removido`);
      assert.doesNotThrow(() => new AsyncFunction(withoutImports), `${name}: erro de sintaxe`);
    }
  }
});
