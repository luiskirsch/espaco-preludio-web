// Shared messages for signatures verified by the backend. No keys are retained.
export function signatureErrorMessage(code) {
  return ({
    CPF_PROFISSIONAL_OBRIGATORIO: "Informe o CPF do titular do certificado.",
    CPF_ASSINANTE_DIVERGENTE: "O CPF do certificado não corresponde ao titular informado ou vinculado à sua conta.",
    NOME_ASSINANTE_DIVERGENTE: "O nome no certificado deve corresponder ao seu nome completo no perfil profissional.",
    CERTIFICADO_ECPF_OBRIGATORIO: "Utilize seu certificado pessoal e-CPF ICP-Brasil.",
    CERTIFICADO_OU_SENHA_INVALIDOS: "O certificado ou a senha estão incorretos.",
    ASSINATURA_OU_CADEIA_INVALIDA: "A assinatura ou a cadeia ICP-Brasil não pôde ser validada.",
    PDF_ASSINATURA_UNICA_OBRIGATORIA: "Envie um PDF com uma assinatura digital ICP-Brasil do profissional.",
    PDF_ALTERADO_OU_COBERTURA_INCOMPLETA: "O PDF foi alterado após a assinatura ou não está integralmente protegido.",
    REVOGACAO_NAO_CONFIRMADA: "Não foi possível confirmar a situação de revogação do certificado. Tente novamente ou consulte sua certificadora.",
    VALIDACAO_INDISPONIVEL: "O serviço de validação está indisponível. O documento continua como rascunho.",
    VALIDACAO_NAO_CONCLUIDA: "Não foi possível concluir a validação do arquivo. Confira o PDF e o certificado.",
    VALIDADOR_OCUPADO: "O serviço de assinatura está ocupado. Tente novamente em instantes.",
    PDF_GRANDE_DEMAIS: "O PDF excede o limite de armazenamento. Reduza as imagens ou o tamanho do documento.",
    PERFIL_ALTERADO_DURANTE_ASSINATURA: "O perfil profissional mudou durante a assinatura. Confira seus dados e tente novamente.",
  })[code] || code;
}
