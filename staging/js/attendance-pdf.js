// Comprovante de comparecimento (PDF) — declaração de presença em sessão por
// telessaúde, com os horários registrados pela plataforma ao entrar na sala.
// Não é documento clínico nem atestado de afastamento. Gerado no navegador.

const TZ = "America/Sao_Paulo";
const fmtDate = ms => new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: TZ });
const fmtTime = ms => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

const VERIFY_BASE = "https://espacopreludio.com.br/verificar-comprovante.html";
const LOGO_URL = new URL("../logo_oficial_fundo_transparente.png?v=2", import.meta.url).href;
const LOWER_WORDS = new Set(["de", "da", "das", "do", "dos", "e"]);

// Nome todo em caixa alta (como alguns cadastros vêm) → "Luis Henrique de Souza".
function displayName(name) {
  const n = String(name || "").trim();
  if (!n || n !== n.toUpperCase()) return n;
  return n.toLowerCase().split(/\s+/).map((w, i) => (i > 0 && LOWER_WORDS.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// Especialidade salva como slug ("terapia-de-casal") → "Terapia de casal".
function specialtyLabel(v) {
  const s = String(v || "").trim();
  if (!/^[a-z0-9-]+$/.test(s)) return s;
  const t = s.replace(/-/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function wrap(text, font, size, maxWidth) {
  const out = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxWidth && line) { out.push(line); line = word; }
      else line = next;
    }
    out.push(line);
  }
  return out;
}

export async function downloadAttendanceCertificate(c) {
  const { PDFDocument, StandardFonts, rgb } = await import("https://esm.sh/pdf-lib@1.17.1");
  const pdf = await PDFDocument.create();
  pdf.setTitle("Comprovante de comparecimento");
  pdf.setProducer("Espaço Prelúdio");
  const page = pdf.addPage([595.28, 841.89]);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.12, 0.11), muted = rgb(0.4, 0.42, 0.4), gold = rgb(0.69, 0.54, 0.24);
  const margin = 56, width = 595.28 - margin * 2;
  let y = 780;

  const text = (t, { font = reg, size = 11, color = ink, gap = 1.5 } = {}) => {
    for (const line of wrap(t, font, size, width)) { page.drawText(line, { x: margin, y, size, font, color }); y -= size * gap; }
  };

  // Logo antes do nome; se não carregar, o cabeçalho sai só com o texto.
  let brandX = margin;
  try {
    const logoBytes = await fetch(LOGO_URL).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)));
    const logo = await pdf.embedPng(logoBytes);
    const logoSize = 26;
    page.drawImage(logo, { x: margin, y: y - 9, width: logoSize, height: logoSize });
    brandX = margin + logoSize + 8;
  } catch { /* sem logo */ }
  page.drawText("ESPAÇO PRELÚDIO", { x: brandX, y, size: 10, font: bold, color: gold });
  y -= brandX > margin ? 36 : 30;
  text("Comprovante de comparecimento", { font: bold, size: 20 });
  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: margin + width, y }, thickness: 1, color: gold });
  y -= 30;

  const p = { ...(c.profissional || {}) };
  p.nome = displayName(p.nome);
  p.especialidade = specialtyLabel(p.especialidade);
  if (p.conselho === "SEM_CONSELHO") { p.conselho = null; p.registro = null; }
  const registro = [p.conselho, p.registro].filter(Boolean).join(" ");
  const quem = [p.nome, registro && `(${registro})`].filter(Boolean).join(" ");
  const dia = fmtDate(c.entrada);
  const periodo = c.termino && c.termino > c.entrada
    ? `das ${fmtTime(c.entrada)} às ${fmtTime(c.termino)}`
    : `a partir das ${fmtTime(c.entrada)}`;
  text(`Declaro, para os devidos fins, que ${displayName(c.patientName) || "o(a) paciente"} compareceu a atendimento por telessaúde realizado por meio da plataforma Espaço Prelúdio no dia ${dia}, ${periodo}, com ${quem || "o(a) profissional responsável"}${p.especialidade ? `, ${p.especialidade}` : ""}.`, { size: 12, gap: 1.6 });
  y -= 18;

  text("Registro da plataforma", { font: bold, size: 12 });
  y -= 2;
  const rows = [
    ["Data", dia],
    ["Entrada do(a) paciente na sala", fmtTime(c.entrada)],
    c.inicio ? ["Início do atendimento", fmtTime(c.inicio)] : null,
    c.termino ? ["Término do atendimento", fmtTime(c.termino)] : null,
    ["Modalidade", "Telessaúde (vídeo) via Espaço Prelúdio"],
    ["Código da sessão", c.sessionId],
    c.verificationCode ? ["Código de verificação", c.verificationCode] : null
  ].filter(Boolean);
  for (const [k, v] of rows) {
    page.drawText(k, { x: margin, y, size: 10, font: reg, color: muted });
    page.drawText(String(v), { x: margin + 200, y, size: 10, font: bold, color: ink });
    y -= 18;
  }
  y -= 16;
  text("Os horários acima foram registrados automaticamente pelo servidor da plataforma (entrada do(a) paciente na sala de vídeo e encerramento do atendimento), no fuso horário de Brasília. Este documento declara apenas a presença no atendimento; não contém informação clínica nem justifica afastamento por motivo de saúde.", { size: 9, color: muted, gap: 1.5 });

  // Assinatura eletrônica simples (Lei 14.063/2020, art. 4º, I): emitido pela
  // conta autenticada do profissional; data/hora vêm do servidor. Substitui a
  // antiga linha de "assinatura" em branco, que não provava nada.
  const issuedAt = c.issuedAt || Date.now();
  {
    y -= 26;
    const boxX = margin, boxW = width, padX = 14;
    const lines = [
      { t: "ASSINADO ELETRONICAMENTE", font: bold, size: 8, color: gold },
      { t: [p.nome || "Profissional responsável", registro].filter(Boolean).join(" · "), font: bold, size: 12, color: ink },
      { t: `via Espaço Prelúdio em ${fmtDate(issuedAt)}, às ${fmtTime(issuedAt)} (horário de Brasília)`, font: reg, size: 9.5, color: ink },
      { t: c.verificationCode
          ? `Assinatura eletrônica simples (Lei nº 14.063/2020, art. 4º, I). Autenticidade verificável pelo código ${c.verificationCode}.`
          : "Assinatura eletrônica simples (Lei nº 14.063/2020, art. 4º, I).", font: reg, size: 8.5, color: muted }
    ];
    const wrapped = lines.flatMap(l => wrap(l.t, l.font, l.size, boxW - padX * 2 - 4).map(t => ({ ...l, t })));
    const boxH = wrapped.reduce((h, l) => h + l.size * 1.55, 0) + 16;
    const top = y;
    page.drawRectangle({ x: boxX, y: top - boxH, width: boxW, height: boxH, borderColor: rgb(0.85, 0.8, 0.7), borderWidth: 0.8 });
    page.drawRectangle({ x: boxX, y: top - boxH, width: 3, height: boxH, color: gold });
    let ly = top - 8;
    for (const l of wrapped) {
      ly -= l.size * 1.2;
      page.drawText(l.t, { x: boxX + padX + 4, y: ly, size: l.size, font: l.font, color: l.color });
      ly -= l.size * 0.35;
    }
    y = top - boxH;
  }

  // Autenticidade: código + QR para a página pública de verificação.
  if (c.verificationCode) {
    const verifyUrl = `${VERIFY_BASE}?c=${encodeURIComponent(c.verificationCode)}`;
    const QRCode = (await import("https://esm.sh/qrcode@1.5.4")).default;
    const qrPng = await pdf.embedPng(await QRCode.toDataURL(verifyUrl, { margin: 0, width: 240, errorCorrectionLevel: "M" }));
    const qrSize = 84;
    y -= 20;
    const top = y;
    page.drawImage(qrPng, { x: margin, y: top - qrSize, width: qrSize, height: qrSize });
    const tx = margin + qrSize + 16, tw = width - qrSize - 16;
    let ty = top - 12;
    page.drawText("Verifique a autenticidade deste documento", { x: tx, y: ty, size: 10, font: bold, color: ink });
    ty -= 15;
    for (const line of wrap("Leia o QR code ou acesse espacopreludio.com.br/verificar-comprovante.html e informe o código abaixo. Dados divergentes indicam documento alterado.", reg, 9, tw)) {
      page.drawText(line, { x: tx, y: ty, size: 9, font: reg, color: muted }); ty -= 12;
    }
    ty -= 4;
    page.drawText(c.verificationCode, { x: tx, y: ty, size: 12, font: bold, color: gold });
    y = top - qrSize;
  }

  page.drawText(`Emitido em ${fmtDate(issuedAt)} · Espaço Prelúdio · CNPJ 67.092.881/0001-99 · espacopreludio.com.br`, { x: margin, y: 40, size: 8, font: reg, color: muted });

  const bytes = await pdf.save();
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  const safeName = String(c.patientName || "paciente").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  a.href = url;
  a.download = `comprovante-comparecimento-${safeName}-${new Date(c.entrada).toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
