// TUSS (Terminologia Unificada da Saúde Suplementar) — códigos comuns para
// reembolso de convênio. Subset prático focado em saúde mental e clínica
// ambulatorial. Lista completa tem >10.000 códigos (ANS RN 305/2012 + atualizações).
//
// Uso: paciente pede reembolso ao convênio com PDF detalhado que inclui
// código TUSS do procedimento + valor + dados do profissional. Cobre ~95%
// dos atendimentos típicos das profissões suportadas pela plataforma.

export const TUSS = [
  // Psicologia / Psicoterapia
  { code: "50000470", description: "Consulta psicológica", profession: "CRP" },
  { code: "50000462", description: "Consulta psicológica em hospital", profession: "CRP" },
  { code: "50000489", description: "Psicoterapia individual (por sessão de 45 a 60 min)", profession: "CRP" },
  { code: "50000497", description: "Psicoterapia de grupo (por sessão)", profession: "CRP" },
  { code: "50000500", description: "Psicoterapia de casal", profession: "CRP" },
  { code: "50000519", description: "Psicoterapia de família", profession: "CRP" },
  { code: "50000527", description: "Psicoterapia breve (por sessão)", profession: "CRP" },
  { code: "50000543", description: "Avaliação psicológica (sessão única ou bateria)", profession: "CRP" },
  { code: "50000551", description: "Aplicação e interpretação de testes psicológicos", profession: "CRP" },
  { code: "50000578", description: "Neuropsicologia — avaliação", profession: "CRP" },
  { code: "50000586", description: "Neuropsicologia — reabilitação (por sessão)", profession: "CRP" },
  { code: "50000594", description: "Ludoterapia", profession: "CRP" },
  { code: "50000608", description: "Psicodiagnóstico", profession: "CRP" },

  // Psiquiatria / Medicina
  { code: "10101012", description: "Consulta em consultório (em horário normal ou pré-estabelecido)", profession: "CRM" },
  { code: "10101039", description: "Consulta em domicílio (clínica médica ou pediatria)", profession: "CRM" },
  { code: "10101047", description: "Consulta em pronto-socorro", profession: "CRM" },
  { code: "10101055", description: "Consulta de retorno (mesma especialidade, em até 30 dias)", profession: "CRM" },
  { code: "20104162", description: "Atendimento psiquiátrico individual (sessão de 50 minutos)", profession: "CRM" },
  { code: "20104170", description: "Atendimento psiquiátrico em grupo", profession: "CRM" },
  { code: "20104189", description: "Avaliação psiquiátrica especial", profession: "CRM" },
  { code: "20104197", description: "Eletroconvulsoterapia (ECT) — sessão", profession: "CRM" },

  // Fisioterapia
  { code: "50000020", description: "Consulta fisioterápica", profession: "CREFITO" },
  { code: "20102119", description: "Atendimento fisioterápico em paciente neurológico", profession: "CREFITO" },
  { code: "20102127", description: "Atendimento fisioterápico em paciente ortopédico", profession: "CREFITO" },
  { code: "20102135", description: "Atendimento fisioterápico em paciente cardiovascular", profession: "CREFITO" },
  { code: "20102143", description: "Atendimento fisioterápico em paciente respiratório", profession: "CREFITO" },

  // Terapia Ocupacional
  { code: "50000128", description: "Consulta de terapia ocupacional", profession: "CREFITO" },
  { code: "20104316", description: "Atendimento em terapia ocupacional", profession: "CREFITO" },

  // Nutrição
  { code: "50000080", description: "Consulta nutricional (avaliação)", profession: "CRN" },
  { code: "50000098", description: "Consulta nutricional (retorno)", profession: "CRN" },
  { code: "50000101", description: "Atendimento nutricional em grupo", profession: "CRN" },

  // Fonoaudiologia
  { code: "50000063", description: "Consulta fonoaudiológica", profession: "CFFa" },
  { code: "20104324", description: "Atendimento fonoaudiológico individual", profession: "CFFa" },

  // Odontologia
  { code: "81000038", description: "Consulta odontológica", profession: "CRO" }
];

function norm(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function searchTUSS(query, profession, limit = 15) {
  const q = norm(query).trim();
  let pool = TUSS;
  if (profession) pool = pool.filter(t => t.profession === profession);
  if (!q) return pool.slice(0, limit);
  const tokens = q.split(/\s+/).filter(Boolean);
  return pool
    .filter(item => {
      const hay = norm(item.code + " " + item.description);
      return tokens.every(t => hay.includes(t));
    })
    .slice(0, limit);
}

export function findTUSS(code) {
  return TUSS.find(t => t.code === code) || null;
}
