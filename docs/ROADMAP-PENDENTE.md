# Roadmap pendente — features que ainda exigem decisão estratégica

Atualizado: 2026-05-13

Cada item abaixo foi avaliado e mantido fora do MVP por motivos técnicos,
regulatórios ou de custo. Listo o escopo real, o motivo do adiamento e o
caminho mínimo viável quando você quiser priorizar.

---

## 1. NFS-e (Nota Fiscal de Serviço eletrônica)

**Escopo real:** integração com webservice da prefeitura (varia por município
— Florianópolis usa GINFES, São Paulo usa próprio, etc.), assinatura XML com
certificado digital A1 do profissional, persistência do RPS + nº NFS-e gerado,
PDF da nota.

**Por que não está pronto:**
- Cada prefeitura tem API/schema/credenciamento próprio (>5.500 municípios).
- Exige certificado digital A1 do profissional (~R$ 150-300/ano cada um).
- Assinatura XML XAdES + autenticação por mTLS no webservice.

**Caminho mínimo viável (~2-3 semanas):**
1. Suportar 1 município piloto (Florianópolis ou São Paulo).
2. Profissional faz upload do .pfx (A1) cifrado no perfil.
3. Backend assina e submete o XML; armazena nº NFS-e + URL pública da nota.
4. Botão "Emitir NFS-e" no card de transação paga.

**Alternativa pragmática hoje:** o CSV exportado (`financeiro/export.csv`) já
serve pro contador emitir manualmente via portal da prefeitura.

---

## 2. Gravação de sessão E2EE

**Escopo real:** captura de vídeo+áudio durante a sessão, cifragem client-side,
upload de blobs para storage cifrado, decifragem só para o profissional.

**Por que não está pronto:**
- LGPD Art. 11: dados sensíveis exigem consentimento específico + finalidade
  explícita + base legal documentada.
- CFP/CFM: registros clínicos têm regras de retenção (mín 20 anos psicologia,
  20 anos medicina). Gravação vira documento clínico permanente.
- LiveKit não tem E2EE recording nativo (E2EE on-call ≠ E2EE-at-rest).
- Custo de storage cifrado escala rápido (~500MB/h em HD; ~2GB/sessão típica).

**Decisão estratégica recomendada:** **não gravar.** Plataformas concorrentes
(Doxy, SimplePractice) explicitamente não gravam — protege profissional E
paciente. Anotações textuais já cobrem o registro clínico exigido pelo
conselho.

**Se for priorizar mesmo assim:**
1. Modal de consentimento bilateral (ambos clicam "ok gravar") + log de audit.
2. Captura via MediaRecorder API client-side, cifragem com DEK do terapeuta.
3. Upload em chunks para Cloudflare R2 ou Backblaze B2 (cheaper than Firebase).
4. Storage cost passado ao plano (adicional fixo + tier por hora gravada).

---

## 3. TISS/SADT (faturamento de convênios)

**Escopo real:** preenchimento de guias TISS (Troca de Informação Saúde
Suplementar — padrão ANS) em XML, envio para operadora, conciliação de
recebimentos.

**Por que não está pronto:**
- Schema TISS é massivo (>300 campos por guia, versão 3.05.00).
- Cada operadora tem seu portal de submissão (Unimed, Bradesco, Amil…).
- Maioria dos psicólogos atende particular — TISS é mais relevante pra
  médicos. ROI baixo pra audiência atual.

**Caminho mínimo viável:** gerar PDF "Comprovante de atendimento" com dados
suficientes pro paciente solicitar reembolso (já temos via Recibo). Faturamento
direto operadora→profissional é território de software vertical (Conpass, Tasy).

**Status atual já cobre 80% do caso de uso:** Recibo gerado tem CNPJ/CPF,
serviço, valor, data — paciente leva ao convênio.

---

## 4. Firestore staging ↔ prod (separação)

**Estado atual (memória do projeto):** ambos `espacopreludio.com.br` e
`espacopreludio.com.br/staging/` apontam pro mesmo backend Railway (env
`staging`, apesar do nome), que usa o mesmo Firestore project
(`sextolugar-staging`).

**Por que separar:** se algum dia fizer teste destrutivo em staging, contamina
prod. Hoje "staging" só serve pra testar UI/JS isolado — qualquer write vai
pra mesma base dos clientes reais.

**Decisão estratégica:** **só separa quando tiver clientes pagantes em
volume.** Hoje a base é pequena, dual-environment dobra custo de Firestore +
Railway + Firebase Auth project. Quando faturamento sustentar, vale.

**Caminho de migração:**
1. Criar novo Firebase project: `espaco-preludio-prod`.
2. Configurar 2º env no Railway: `production` apontando pra novo Firebase.
3. CNAMEs:
   - `espacopreludio.com.br` → GitHub Pages root → JS lê `BACKEND_BASE_URL`
     de `prod`.
   - `staging.espacopreludio.com.br` (novo) → mesmo Pages mas branch staging,
     JS aponta pra Railway env `staging`.
4. Subpasta `/staging/` no repo deprecada.
5. Migrar dados: Firebase Cloud Functions export + import para novo project,
   ou backup manual via Console (Firestore tem export nativo pra GCS bucket).
6. Atualizar `Cloudflare` DNS pra novo subdomínio staging.

**Custo extra estimado:** ~US$ 25/mês (Firebase Blaze + Railway env extra +
Resend domain extra).

---

## 5. i18n PT/EN

**Escopo real:** extrair ~3.000 strings de UI dos 100+ HTMLs, organizar em
dicionário (`pt.json`/`en.json`), runtime de substituição (data-attribute
ou função `t("key")`), tradução de e-mails server-side, formatação de datas/
moeda locale-aware, plurais.

**Por que adiado:** público-alvo (psicólogos brasileiros atendendo brasileiros)
não pede inglês. Estudantes estrangeiros que atendem em PT permanecem em PT.
ROI quase zero.

**Caminho mínimo viável:** começar só pelo paciente-painel.html + agendar.html
(o que paciente estrangeiro veria), não a plataforma do profissional.

---

## Resumo

| Feature | Status | Justificativa |
|---|---|---|
| NFS-e | adiado | precisa cert. digital + 1 prefeitura piloto |
| Gravação E2EE | recomendo não fazer | LGPD/CFP risk > UX gain |
| TISS/SADT | adiado | mercado errado (médico vs psicólogo) |
| Firestore split | adiado | custo extra sem ROI agora |
| i18n EN | adiado | audiência PT-BR |

Tudo que era razoavelmente abordável foi entregue nas commits anteriores.
