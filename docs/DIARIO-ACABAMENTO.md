# Revisão de acabamento do diário

Data: 19 de outubro de 2026.

## Critérios e correções

| Área | Problema encontrado | Resultado |
| --- | --- | --- |
| Composição | A coluna lateral crescia muito além do papel, criando um vazio no fim da página. | Lateral mais larga e compacta no desktop; painéis em duas colunas no tablet e uma no celular. |
| Marca | O nome ficava comprimido em uma linha e dependia de espaço gerado pelo CSS. | Duas linhas com entrelinha e separação explícitas. |
| Navegação | Trocar de seção no fim da página podia deixar o novo conteúdo fora da tela. | A seção revela o início do papel e recebe foco acessível; diálogos preservam o próprio foco. |
| Memórias e sonhos | Título e resumo repetiam o mesmo texto; exclusão competia com a leitura. | Resumo usa somente a continuação; cartões ganham margem interna e ação de exclusão secundária. |
| Cápsulas | Texto de abertura e estado de bloqueio tinham pouca hierarquia. | Tipografia, espaçamento e contraste alinhados aos cartões de memória, preservando o bloqueio das cartas. |
| Estado vazio | Orientações pareciam soltas sobre a arte. | Superfícies próprias, linhas de leitura menores e separação das ações. |
| Sentimentos | O aviso e os cartões podiam se confundir com as folhas. | Fundos mais opacos, cores de texto mais fortes e contorno discreto. |
| Apoio lateral | Títulos longos e quatro colunas estreitas no tablet quebravam a leitura. | Títulos mais diretos, miniaturas proporcionais e distribuição por largura disponível. |
| Controle de volume | Aumentar a área de interação engrossava a barra nativa. | Área de toque preservada, com trilho fino e marcador definido nos mecanismos WebKit e Gecko. |
| Modo noturno | O papel claro continuava iluminando a tela. | Tinta clara, papel escuro com a ilustração original suavizada, cartões e diálogos adaptados. |
| Preferência visual | A aparência precisava persistir sem depender da conta. | Preferência local carregada antes da primeira pintura e compartilhada entre as duas entradas do diário. |

## Verificação

O teste de navegador exercita as cinco seções em 320, 390, 768, 1024 e
1440 px nos dois temas. Verifica ausência de transbordamento, preservação
da escrita ao trocar a aparência e restauração do modo noturno ao navegar
para o diário do aluno. Os fluxos existentes de gravação, ditado, salvamento,
sentimentos, busca, sonhos, cápsulas, desabafos e exclusão continuam incluídos.

As capturas integrais `docs/diary-preview/premium-*.png` registram os estados
claros e noturnos em uma sessão de demonstração, sem dados reais de usuários.
As imagens estáticas das folhas não recebem movimento nem camadas extras.

O modo noturno armazena somente `day` ou `night` em
`localStorage["ep.diary.appearance"]`. Se o navegador bloquear o armazenamento,
a alternância continua funcionando na página atual.
