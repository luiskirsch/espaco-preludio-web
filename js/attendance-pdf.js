// Comprovante de comparecimento (PDF) — declaração de presença em sessão por
// telessaúde, com os horários registrados pela plataforma ao entrar na sala.
// Não é documento clínico nem atestado de afastamento. Gerado no navegador.

const TZ = "America/Sao_Paulo";
const fmtDate = ms => new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: TZ });
const fmtTime = ms => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

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

  page.drawText("ESPAÇO PRELÚDIO", { x: margin, y, size: 10, font: bold, color: gold });
  y -= 30;
  text("Comprovante de comparecimento", { font: bold, size: 20 });
  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: margin + width, y }, thickness: 1, color: gold });
  y -= 30;

  const p = c.profissional || {};
  const registro = [p.conselho, p.registro].filter(Boolean).join(" ");
  const quem = [p.nome, registro && `(${registro})`].filter(Boolean).join(" ");
  const dia = fmtDate(c.entrada);
  const periodo = c.termino && c.termino > c.entrada
    ? `das ${fmtTime(c.entrada)} às ${fmtTime(c.termino)}`
    : `a partir das ${fmtTime(c.entrada)}`;
  text(`Declaro, para os devidos fins, que ${c.patientName || "o(a) paciente"} compareceu a atendimento por telessaúde realizado por meio da plataforma Espaço Prelúdio no dia ${dia}, ${periodo}, com ${quem || "o(a) profissional responsável"}${p.especialidade ? `, ${p.especialidade}` : ""}.`, { size: 12, gap: 1.6 });
  y -= 18;

  text("Registro da plataforma", { font: bold, size: 12 });
  y -= 2;
  const rows = [
    ["Data", dia],
    ["Entrada do(a) paciente na sala", fmtTime(c.entrada)],
    c.inicio ? ["Início do atendimento", fmtTime(c.inicio)] : null,
    c.termino ? ["Término do atendimento", fmtTime(c.termino)] : null,
    ["Modalidade", "Telessaúde (vídeo) via Espaço Prelúdio"],
    ["Código da sessão", c.sessionId]
  ].filter(Boolean);
  for (const [k, v] of rows) {
    page.drawText(k, { x: margin, y, size: 10, font: reg, color: muted });
    page.drawText(String(v), { x: margin + 200, y, size: 10, font: bold, color: ink });
    y -= 18;
  }
  y -= 16;
  text("Os horários acima foram registrados automaticamente pelo servidor da plataforma no momento da entrada na sala de vídeo (fuso horário de Brasília). Este documento declara apenas a presença no atendimento; não contém informação clínica nem justifica afastamento por motivo de saúde.", { size: 9, color: muted, gap: 1.5 });

  y = Math.min(y - 40, 200);
  page.drawLine({ start: { x: margin, y }, end: { x: margin + 240, y }, thickness: 0.8, color: ink });
  y -= 14;
  page.drawText(p.nome || "Profissional responsável", { x: margin, y, size: 10, font: bold, color: ink });
  if (registro) { y -= 13; page.drawText(registro, { x: margin, y, size: 9, font: reg, color: muted }); }

  page.drawText(`Emitido em ${fmtDate(Date.now())} · Espaço Prelúdio · CNPJ 67.092.881/0001-99 · espacopreludio.com.br`, { x: margin, y: 40, size: 8, font: reg, color: muted });

  const bytes = await pdf.save();
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  const safeName = String(c.patientName || "paciente").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  a.href = url;
  a.download = `comprovante-comparecimento-${safeName}-${new Date(c.entrada).toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
