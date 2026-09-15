const asNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const nonNegative = (value, fallback = 0) => Math.max(0, asNumber(value, fallback));
const percentage = (value, fallback = 0) => Math.min(100, nonNegative(value, fallback));
const money = (value) => Math.round((asNumber(value) + Number.EPSILON) * 100) / 100;

export const DEFAULT_SCENARIO = Object.freeze({
  institutionName: "Instituição parceira",
  institutionDocument: "",
  municipality: "",
  contactName: "",
  proposalDate: "",
  validityDays: 15,
  contractMonths: 12,
  paymentDay: 10,
  annualAdjustment: "IPCA/IBGE",
  students: 1000,
  schools: 1,
  utilizationMode: "profile",
  serviceProfile: "hybrid",
  educationSegment: "basic-br",
  annualUtilizationPct: 3.15,
  averageActiveMonths: 3,
  maturityFactor: 1,
  engagementFactor: 1,
  accessFactor: 1,
  capacityMonthlyUsers: 0,
  maxMonthlySessionsPerStudent: 4,
  expectedAdherencePct: 6,
  sessionsPerActiveStudent: 1.8,
  professionalCostPerSession: 55,
  technologyCostPerStudent: 1.8,
  supportCostPerSchool: 350,
  fixedOperationsMonthly: 2500,
  customerSuccessMonthly: 1200,
  administrativeMonthly: 900,
  marketingMonthly: 300,
  otherMonthlyCosts: 0,
  implementationFee: 3500,
  taxPct: 8,
  contingencyPct: 3,
  targetProfitMarginPct: 25,
  commercialDiscountPct: 0,
  minimumMonthlyFee: 0,
  sessionMinutes: 50,
  professionalWeeklyCapacity: 20,
  scopeNotes: "Acolhimento, triagem, agenda, videoatendimento, acompanhamento operacional e indicadores agregados.",
});

export function normalizeScenario(source = {}) {
  return {
    ...DEFAULT_SCENARIO,
    ...source,
    institutionName: String(source.institutionName ?? DEFAULT_SCENARIO.institutionName).trim() || DEFAULT_SCENARIO.institutionName,
    institutionDocument: String(source.institutionDocument ?? "").trim(),
    municipality: String(source.municipality ?? "").trim(),
    contactName: String(source.contactName ?? "").trim(),
    proposalDate: String(source.proposalDate ?? "").trim(),
    annualAdjustment: String(source.annualAdjustment ?? DEFAULT_SCENARIO.annualAdjustment).trim() || DEFAULT_SCENARIO.annualAdjustment,
    scopeNotes: String(source.scopeNotes ?? DEFAULT_SCENARIO.scopeNotes).trim(),
    validityDays: Math.max(1, Math.round(nonNegative(source.validityDays, DEFAULT_SCENARIO.validityDays))),
    contractMonths: Math.max(1, Math.round(nonNegative(source.contractMonths, DEFAULT_SCENARIO.contractMonths))),
    paymentDay: Math.min(28, Math.max(1, Math.round(nonNegative(source.paymentDay, DEFAULT_SCENARIO.paymentDay)))),
    students: Math.max(1, Math.round(nonNegative(source.students, DEFAULT_SCENARIO.students))),
    schools: Math.max(1, Math.round(nonNegative(source.schools, DEFAULT_SCENARIO.schools))),
    utilizationMode: ["profile", "evidence", "manual"].includes(source.utilizationMode)
      ? source.utilizationMode
      : DEFAULT_SCENARIO.utilizationMode,
    serviceProfile: ["medical-urgent", "psychology", "hybrid"].includes(source.serviceProfile)
      ? source.serviceProfile
      : DEFAULT_SCENARIO.serviceProfile,
    educationSegment: ["basic-br", "higher-education", "custom"].includes(source.educationSegment)
      ? source.educationSegment
      : DEFAULT_SCENARIO.educationSegment,
    annualUtilizationPct: percentage(source.annualUtilizationPct, DEFAULT_SCENARIO.annualUtilizationPct),
    averageActiveMonths: Math.min(12, Math.max(0.1, nonNegative(source.averageActiveMonths, DEFAULT_SCENARIO.averageActiveMonths))),
    maturityFactor: Math.min(2, Math.max(0.25, nonNegative(source.maturityFactor, DEFAULT_SCENARIO.maturityFactor))),
    engagementFactor: Math.min(2, Math.max(0.25, nonNegative(source.engagementFactor, DEFAULT_SCENARIO.engagementFactor))),
    accessFactor: Math.min(2, Math.max(0.25, nonNegative(source.accessFactor, DEFAULT_SCENARIO.accessFactor))),
    capacityMonthlyUsers: Math.max(0, Math.round(nonNegative(source.capacityMonthlyUsers, DEFAULT_SCENARIO.capacityMonthlyUsers))),
    maxMonthlySessionsPerStudent: Math.max(1, Math.round(nonNegative(source.maxMonthlySessionsPerStudent, DEFAULT_SCENARIO.maxMonthlySessionsPerStudent))),
    expectedAdherencePct: percentage(source.expectedAdherencePct, DEFAULT_SCENARIO.expectedAdherencePct),
    sessionsPerActiveStudent: nonNegative(source.sessionsPerActiveStudent, DEFAULT_SCENARIO.sessionsPerActiveStudent),
    professionalCostPerSession: nonNegative(source.professionalCostPerSession, DEFAULT_SCENARIO.professionalCostPerSession),
    technologyCostPerStudent: nonNegative(source.technologyCostPerStudent, DEFAULT_SCENARIO.technologyCostPerStudent),
    supportCostPerSchool: nonNegative(source.supportCostPerSchool, DEFAULT_SCENARIO.supportCostPerSchool),
    fixedOperationsMonthly: nonNegative(source.fixedOperationsMonthly, DEFAULT_SCENARIO.fixedOperationsMonthly),
    customerSuccessMonthly: nonNegative(source.customerSuccessMonthly, DEFAULT_SCENARIO.customerSuccessMonthly),
    administrativeMonthly: nonNegative(source.administrativeMonthly, DEFAULT_SCENARIO.administrativeMonthly),
    marketingMonthly: nonNegative(source.marketingMonthly, DEFAULT_SCENARIO.marketingMonthly),
    otherMonthlyCosts: nonNegative(source.otherMonthlyCosts, DEFAULT_SCENARIO.otherMonthlyCosts),
    implementationFee: nonNegative(source.implementationFee, DEFAULT_SCENARIO.implementationFee),
    taxPct: percentage(source.taxPct, DEFAULT_SCENARIO.taxPct),
    contingencyPct: percentage(source.contingencyPct, DEFAULT_SCENARIO.contingencyPct),
    targetProfitMarginPct: percentage(source.targetProfitMarginPct, DEFAULT_SCENARIO.targetProfitMarginPct),
    commercialDiscountPct: percentage(source.commercialDiscountPct, DEFAULT_SCENARIO.commercialDiscountPct),
    minimumMonthlyFee: nonNegative(source.minimumMonthlyFee, DEFAULT_SCENARIO.minimumMonthlyFee),
    sessionMinutes: Math.max(1, Math.round(nonNegative(source.sessionMinutes, DEFAULT_SCENARIO.sessionMinutes))),
    professionalWeeklyCapacity: Math.max(1, nonNegative(source.professionalWeeklyCapacity, DEFAULT_SCENARIO.professionalWeeklyCapacity)),
  };
}

export const UTILIZATION_BENCHMARKS = Object.freeze({
  "basic-br": {
    annualPct: 3.15,
    label: "Educação básica · estimativa baseada em prevalência e acesso no Brasil",
    basis: "14,3% com condição de saúde mental × 22% com uso de algum serviço no ano",
  },
  "higher-education": {
    annualPct: 10.2,
    label: "Ensino superior · centros de aconselhamento",
    basis: "Utilização anual média observada em 789 instituições",
  },
});

export const SERVICE_PROFILES = Object.freeze({
  "medical-urgent": {
    adherencePct: 2.5,
    sessionsPerActiveStudent: 1,
    label: "Pronto atendimento médico",
    basis: "Premissa operacional: 2,5% dos alunos ativos no mês, com 1 consulta por usuário",
  },
  psychology: {
    adherencePct: 5,
    sessionsPerActiveStudent: 2.5,
    label: "Psicologia e acolhimento continuado",
    basis: "Premissa operacional: 5% dos alunos ativos no mês, com 2,5 consultas por usuário",
  },
  hybrid: {
    adherencePct: 6,
    sessionsPerActiveStudent: 1.8,
    label: "Plataforma híbrida: médico e terapia",
    basis: "Premissa operacional: 6% dos alunos ativos no mês, com 1,8 consulta por usuário",
  },
});

export function estimateEvidenceBasedUtilization(input) {
  const benchmark = UTILIZATION_BENCHMARKS[input.educationSegment];
  const annualBasePct = benchmark?.annualPct ?? input.annualUtilizationPct;
  const monthlyRatePct = Math.min(
    100,
    annualBasePct
      * (input.averageActiveMonths / 12)
      * input.maturityFactor
      * input.engagementFactor
      * input.accessFactor
  );
  const uncappedActiveStudents = Math.ceil(input.students * monthlyRatePct / 100);
  const activeStudents = input.capacityMonthlyUsers > 0
    ? Math.min(uncappedActiveStudents, input.capacityMonthlyUsers)
    : uncappedActiveStudents;

  return {
    annualBasePct: money(annualBasePct),
    monthlyRatePct: money(monthlyRatePct),
    uncappedActiveStudents,
    activeStudents,
    capacityApplied: activeStudents < uncappedActiveStudents,
    sourceLabel: benchmark?.label || "Histórico próprio informado",
    basis: benchmark?.basis || "Percentual anual personalizado",
  };
}

export function calculateInstitutionalPricing(source = {}) {
  const input = normalizeScenario(source);
  const serviceProfile = SERVICE_PROFILES[input.serviceProfile];
  if (input.utilizationMode === "profile") {
    input.expectedAdherencePct = serviceProfile.adherencePct;
    input.sessionsPerActiveStudent = serviceProfile.sessionsPerActiveStudent;
  }
  const manualUncappedActiveStudents = Math.ceil(input.students * input.expectedAdherencePct / 100);
  const manualActiveStudents = input.capacityMonthlyUsers > 0
    ? Math.min(manualUncappedActiveStudents, input.capacityMonthlyUsers)
    : manualUncappedActiveStudents;
  const evidence = input.utilizationMode === "evidence"
    ? estimateEvidenceBasedUtilization(input)
    : {
        annualBasePct: null,
        monthlyRatePct: input.expectedAdherencePct,
        uncappedActiveStudents: manualUncappedActiveStudents,
        activeStudents: manualActiveStudents,
        capacityApplied: manualActiveStudents < manualUncappedActiveStudents,
        sourceLabel: input.utilizationMode === "profile" ? serviceProfile.label : "Histórico próprio informado",
        basis: input.utilizationMode === "profile" ? serviceProfile.basis : "Taxa mensal manual",
      };
  input.expectedAdherencePct = evidence.monthlyRatePct;
  const taxRate = input.taxPct / 100;
  const contingencyRate = input.contingencyPct / 100;
  const targetProfitRate = input.targetProfitMarginPct / 100;
  const discountRate = input.commercialDiscountPct / 100;
  const denominator = 1 - taxRate - contingencyRate - targetProfitRate;

  if (denominator <= 0.05) {
    throw new RangeError("A soma de impostos, reserva e margem deve ser inferior a 95%.");
  }

  const activeStudents = evidence.activeStudents;
  const monthlySessions = Math.ceil(activeStudents * input.sessionsPerActiveStudent);
  const professionalHours = monthlySessions * input.sessionMinutes / 60;
  const professionalFte = monthlySessions / (input.professionalWeeklyCapacity * 4.33);

  const careCost = monthlySessions * input.professionalCostPerSession;
  const technologyCost = input.students * input.technologyCostPerStudent;
  const unitSupportCost = input.schools * input.supportCostPerSchool;
  const operatingCost = careCost
    + technologyCost
    + unitSupportCost
    + input.fixedOperationsMonthly
    + input.customerSuccessMonthly
    + input.administrativeMonthly
    + input.marketingMonthly
    + input.otherMonthlyCosts;

  const targetMonthlyRevenue = operatingCost / denominator;
  const discountedRevenue = targetMonthlyRevenue * (1 - discountRate);
  const monthlyRevenue = Math.max(input.minimumMonthlyFee, discountedRevenue);
  const taxes = monthlyRevenue * taxRate;
  const contingency = monthlyRevenue * contingencyRate;
  const netProfit = monthlyRevenue - operatingCost - taxes - contingency;
  const effectiveMarginPct = monthlyRevenue > 0 ? netProfit / monthlyRevenue * 100 : 0;
  const markupPct = operatingCost > 0 ? netProfit / operatingCost * 100 : 0;
  const monthlyPerStudent = monthlyRevenue / input.students;
  const annualRecurring = monthlyRevenue * input.contractMonths;
  const contractTotal = annualRecurring + input.implementationFee;
  const breakEvenRevenue = operatingCost / (1 - taxRate - contingencyRate);
  const maximumSafeDiscountPct = targetMonthlyRevenue > 0
    ? Math.max(0, (targetMonthlyRevenue - breakEvenRevenue) / targetMonthlyRevenue * 100)
    : 0;

  return {
    input,
    evidence,
    activeStudents,
    monthlySessions,
    professionalHours: money(professionalHours),
    professionalFte: money(professionalFte),
    careCost: money(careCost),
    technologyCost: money(technologyCost),
    unitSupportCost: money(unitSupportCost),
    operatingCost: money(operatingCost),
    targetMonthlyRevenue: money(targetMonthlyRevenue),
    discountedRevenue: money(discountedRevenue),
    monthlyRevenue: money(monthlyRevenue),
    minimumApplied: input.minimumMonthlyFee > discountedRevenue,
    taxes: money(taxes),
    contingency: money(contingency),
    netProfit: money(netProfit),
    effectiveMarginPct: money(effectiveMarginPct),
    markupPct: money(markupPct),
    monthlyPerStudent: money(monthlyPerStudent),
    annualRecurring: money(annualRecurring),
    contractTotal: money(contractTotal),
    breakEvenRevenue: money(breakEvenRevenue),
    maximumSafeDiscountPct: money(maximumSafeDiscountPct),
    marginStatus: netProfit < 0 ? "loss" : effectiveMarginPct + 0.01 < input.targetProfitMarginPct ? "below-target" : "on-target",
  };
}

export function buildProposalText(result, formatCurrency = (value) => String(value)) {
  const { input } = result;
  const location = input.municipality ? `, com atuação em ${input.municipality}` : "";
  return [
    `PROPOSTA COMERCIAL — ${input.institutionName}`,
    "",
    `Abrangência: ${input.students.toLocaleString("pt-BR")} estudantes em ${input.schools} unidade(s)${location}.`,
    `Premissa operacional: adesão mensal estimada de ${input.expectedAdherencePct}% (${result.activeStudents} estudantes ativos), com ${result.monthlySessions.toLocaleString("pt-BR")} atendimento(s)/mês.`,
    `Cobertura individual: até ${input.maxMonthlySessionsPerStudent} sessões mensais por estudante, conforme indicação profissional e dentro da capacidade global contratada. Necessidades de maior intensidade serão encaminhadas ou dependerão de ampliação previamente autorizada.`,
    `Investimento mensal: ${formatCurrency(result.monthlyRevenue)} (${formatCurrency(result.monthlyPerStudent)} por estudante elegível).`,
    `Implantação: ${formatCurrency(input.implementationFee)}. Valor global para ${input.contractMonths} meses: ${formatCurrency(result.contractTotal)}.`,
    `Pagamento: dia ${input.paymentDay}. Reajuste: ${input.annualAdjustment}. Validade desta proposta: ${input.validityDays} dias.`,
    "",
    `Escopo: ${input.scopeNotes}`,
    "",
    "Valores calculados a partir das premissas registradas no simulador. Alterações de população, cobertura, escopo ou volume assistencial exigem reequilíbrio comercial.",
  ].join("\n");
}
