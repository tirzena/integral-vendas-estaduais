export type GuideSystem = "general" | "state";
export type GuideChapter = {
  id: string;
  title: string;
  group: string;
  route: string;
  scope: "both" | "general";
  summary: string;
  steps: { title: string; text: string }[];
  checks: string[];
  tips: string[];
};
export const guideChapters: GuideChapter[] = [
  {
    id: "inicio",
    title: "Primeiro acesso e navegação",
    group: "Comece aqui",
    route: "/configuracoes",
    scope: "both",
    summary: "Aprenda a entrar, reconhecer seu perfil e encontrar as ferramentas.",
    steps: [
      {
        title: "Confira sua conta",
        text: "Entre com o e-mail e a senha fornecidos pela administração. Confira seu nome e seus cargos no cabeçalho antes de lançar informações.",
      },
      {
        title: "Atualize seus dados",
        text: "Abra Configurações no perfil. Salve nome, telefone e foto; altere sua senha. Se trocar o e-mail, conclua a confirmação solicitada antes de usar o novo endereço.",
      },
      {
        title: "Use os filtros",
        text: "A categoria do cabeçalho pode filtrar várias telas. Confira categoria, período, vendedor e situação quando um registro parecer ausente. Sem período, consulte todos os registros disponíveis ao seu acesso.",
      },
      {
        title: "Navegue com seu perfil",
        text: "Use o menu lateral; no celular, abra o menu pelo botão do cabeçalho. Mude o tema pelo ícone de sol/lua. Use Sair ao terminar em um computador compartilhado.",
      },
    ],
    checks: [
      "Nome e cargos corretos no cabeçalho.",
      "Você está no domínio da Direção Geral ou do Estadual desejado.",
    ],
    tips: [
      "As permissões de vários cargos se somam. Visualizar uma área não significa poder alterar ou aprovar nela.",
      "O manual usa exemplos ilustrativos; nenhum botão mostrado na imagem executa operações.",
    ],
  },
  {
    id: "painel",
    title: "Visão geral e resumos",
    group: "Comece aqui",
    route: "/painel",
    scope: "both",
    summary: "Entenda os indicadores e encontre pendências de aprovação.",
    steps: [
      {
        title: "Defina o recorte",
        text: "Confira categoria, datas e demais filtros disponíveis antes de comparar números. O Estadual mostra os dados permitidos ao vendedor, principalmente seus próprios pedidos.",
      },
      {
        title: "Leia os cartões",
        text: "Observe os cartões de resumo e clique nos indicadores que levam às listagens. Compare valores na mesma moeda e no mesmo período.",
      },
      {
        title: "Abra as aprovações",
        text: "Abaixo dos resumos, clique no título de aprovações para expandir. Pedidos e pagamentos têm Em análise, Ajuste solicitado, Reprovados e Aprovados.",
      },
      {
        title: "Resolva a pendência",
        text: "Na Direção Geral, abra a fila de Aprovações se tiver atribuição. No Estadual, abra o pedido indicado, leia o histórico e acompanhe a resposta ou corrija o solicitado.",
      },
    ],
    checks: [
      "Os filtros do painel e da listagem são compatíveis.",
      "Pedido aprovado e pagamento aprovado são decisões diferentes.",
    ],
    tips: [],
  },
  {
    id: "clientes",
    title: "Cadastrar e consultar clientes",
    group: "Comercial",
    route: "/clientes",
    scope: "both",
    summary: "Cadastre o cliente antes da venda e evite duplicidades.",
    steps: [
      {
        title: "Procure o cliente",
        text: "Busque por nome, documento ou telefone antes de criar um cadastro. O vendedor acessa apenas os clientes liberados ao seu perfil.",
      },
      {
        title: "Preencha o cadastro",
        text: "Use a ação de novo cliente. Informe nome, CPF/CNPJ quando solicitado, telefone e os dados de contato e endereço disponíveis no formulário.",
      },
      {
        title: "Confira e salve",
        text: "Revise nome e documento do comprador e do destinatário. Se o pedido vai para outra pessoa, mantenha o comprador correto e preencha a entrega separadamente.",
      },
      {
        title: "Consulte o histórico",
        text: "Abra o cliente para consultar seus registros e, quando disponível, o crédito. Para utilizar crédito em um pedido, use Lançar pagamento naquele pedido.",
      },
    ],
    checks: [
      "Cliente localizado no seletor do pedido.",
      "Telefone e endereço conferidos antes do envio.",
    ],
    tips: [],
  },
  {
    id: "crm",
    title: "Leads e CRM",
    group: "Comercial",
    route: "/crm",
    scope: "both",
    summary: "Acompanhe uma oportunidade desde o primeiro contato até a negociação.",
    steps: [
      {
        title: "Busque antes de criar",
        text: "Confira se o contato já existe no CRM. Ajuste filtros de responsável, categoria e situação para evitar cadastrar a mesma oportunidade duas vezes.",
      },
      {
        title: "Cadastre a oportunidade",
        text: "Preencha nome, contato, origem e território: região, estado e cidade ou endereço, conforme o formulário. Selecione o responsável permitido.",
      },
      {
        title: "Atualize a etapa",
        text: "Abra o cartão ou use as ações da tela para registrar a fase da negociação, anotações e atividades. O vendedor trabalha com suas próprias oportunidades.",
      },
      {
        title: "Organize o próximo contato",
        text: "Registre a próxima tarefa e o prazo. Quando a venda estiver definida, confira o cadastro do cliente e crie o pedido em Pedidos.",
      },
    ],
    checks: ["Oportunidade atribuída ao responsável correto.", "Próxima ação e prazo registrados."],
    tips: [],
  },
  {
    id: "produtos",
    title: "Consultar produtos e preços",
    group: "Comercial",
    route: "/produtos",
    scope: "both",
    summary: "O catálogo foi separado em Produtos, Catálogos online e Tabelas de preços.",
    steps: [
      {
        title: "Abra Produtos",
        text: "Entre no catálogo e selecione Produtos no menu horizontal. Busque pelo nome e filtre categoria, subcategoria e marca.",
      },
      {
        title: "Confira a disponibilidade",
        text: "Verifique quantidade disponível, apresentação e unidade. A quantidade disponível considera as reservas; não presuma que todo saldo total esteja livre para vender.",
      },
      {
        title: "Confira a moeda",
        text: "Use o valor de venda e sua moeda cadastrada. Produto com preço definido em reais mantém esse preço em reais; a cotação é usada apenas nas conversões necessárias.",
      },
      {
        title: "Leia as informações",
        text: "Abra Informações do produto quando disponíveis. Confira foto, descrição e fonte. No Estadual, consulte preços e quantidades; cadastro, edição e exclusão de produtos ficam na Direção Geral.",
      },
    ],
    checks: [
      "Apresentação e dosagem do produto corretas.",
      "Moeda e quantidade suficientes para o pedido.",
    ],
    tips: [
      "Se o saldo estiver incorreto, peça conferência do estoque; não crie outro produto para tentar corrigir a quantidade.",
    ],
  },
  {
    id: "cadastro-produto",
    title: "Criar produto e vincular o estoque",
    group: "Comercial",
    route: "/categorias",
    scope: "general",
    summary: "Organize o cadastro do produto antes de registrar sua entrada de estoque.",
    steps: [
      {
        title: "Prepare a classificação",
        text: "Confira a categoria principal em Categorias e a subcategoria desejada. Cadastre o fornecedor na área de Fornecedores quando necessário.",
      },
      {
        title: "Cadastre o produto",
        text: "Em Categorias → Produtos, use Novo produto. Informe nome, apresentação, marca, unidade, categoria, subcategoria, imagem e fornecedor conforme os campos disponíveis.",
      },
      {
        title: "Defina os preços",
        text: "Cadastre custo e venda nas moedas corretas. Revise descrição, finalidade, orientações e fonte do conteúdo. Salve o cadastro antes de registrar a compra.",
      },
      {
        title: "Registre a entrada uma vez",
        text: "Para compra com custo e pagamento, use Estoques → Estoque principal → Registrar compra. Para adicionar apenas quantidade recebida, use Abastecer produto, que indica Estoque principal. Não registre a mesma entrada pelos dois caminhos.",
      },
      {
        title: "Confira o resultado",
        text: "Consulte o saldo no Catálogo e em Estoques disponíveis. Vendedores consultam os produtos liberados em todos os estoques ativos criados pela administração, identificados apenas pelo estado; novos estoques aparecem automaticamente. Compras e alterações manuais de saldo são exclusivas de admin e superadmin.",
      },
    ],
    checks: [
      "Produto associado à categoria e ao fornecedor corretos.",
      "Entrada registrada uma única vez, no estoque identificado.",
      "Preço de venda e moeda conferidos.",
    ],
    tips: [
      "Editar a ficha do produto e receber mercadoria são operações diferentes. Use a operação de entrada para registrar quantidade e histórico.",
    ],
  },
  {
    id: "catalogos",
    title: "Catálogos online",
    group: "Comercial",
    route: "/produtos",
    scope: "both",
    summary:
      "Consulte materiais publicados e crie seu catálogo com produtos liberados ao seu perfil.",
    steps: [
      {
        title: "Abra Catálogos online",
        text: "No catálogo de produtos, abra Catálogos online. Use Meus catálogos para os materiais que você criou e Catálogos públicos para os compartilhados pelos demais membros.",
      },
      {
        title: "Crie seu material",
        text: "Nos dois sistemas, clique em Novo catálogo online. Informe título, descrição, moeda e WhatsApp opcional. Na seção Categorias, selecione os grupos desejados: suas subcategorias e produtos entram automaticamente. Desmarque subcategorias ou produtos que não deseja. A busca pelo nome permite adicionar produtos de qualquer categoria.",
      },
      {
        title: "Confira as duas versões",
        text: "Use os links Vendedor e Cliente do cartão. A versão de vendedor mostra preços; a versão de cliente segue a apresentação sem preços. Confira as duas antes de compartilhar.",
      },
      {
        title: "Salve e compartilhe",
        text: "Salve o material e abra os links Vendedor e Cliente no cartão. No Estadual, o catálogo fica associado ao membro que o criou e utiliza os preços de venda da direção; criar o material não altera o produto ou o estoque.",
      },
      {
        title: "Defina a visibilidade interna",
        text: "Qualquer membro pode criar materiais com os produtos liberados ao seu perfil. A opção Mostrar este material para os demais membros vem marcada. Desmarque para manter o material somente na sua seção Meus catálogos/Minhas tabelas. Essa escolha não desativa o link publicado para enviar ao cliente.",
      },
    ],
    checks: [
      "Publicação, produtos e quantidades mínimas revisados.",
      "Link do público correto escolhido.",
      "Pelo menos um produto selecionado e preços definidos pela direção preservados.",
    ],
    tips: [
      "Produto sob consulta, como TG sem preço definido, não deve ser tratado como uma compra com preço automático.",
    ],
  },
  {
    id: "tabelas",
    title: "Tabelas de preços",
    group: "Comercial",
    route: "/produtos",
    scope: "both",
    summary: "Consulte produtos em lista e gere uma tabela de venda.",
    steps: [
      {
        title: "Escolha Tabelas de preços",
        text: "No catálogo, abra Tabelas de preços. Use Minhas tabelas para as criadas por você e Tabelas públicas para as compartilhadas pelos demais membros.",
      },
      {
        title: "Confira a lista",
        text: "Revise os produtos, a quantidade disponível e o valor de venda. O preço é apresentado na moeda cadastrada para a venda.",
      },
      {
        title: "Exporte a seleção",
        text: "Ajuste o título da tabela e use o botão de relatório disponível. Confira o arquivo antes de encaminhá-lo.",
      },
      {
        title: "Crie uma tabela online",
        text: "Nos dois sistemas, clique em Nova tabela de vendas. Informe título, moeda e descrição. Escolha categorias, retire as subcategorias que não deseja e revise os produtos. Use a busca pelo nome para adicionar produtos avulsos. Salve e confira os links Vendedor e Cliente do cartão. O vendedor monta o material sem alterar preços dos produtos.",
      },
      {
        title: "Defina a visibilidade interna",
        text: "Qualquer membro pode criar materiais com os produtos liberados ao seu perfil. A opção Mostrar este material para os demais membros vem marcada. Desmarque para manter o material somente na sua seção Meus catálogos/Minhas tabelas. Essa escolha não desativa o link publicado para enviar ao cliente.",
      },
    ],
    checks: [
      "A tabela contém os produtos pretendidos.",
      "Moedas e disponibilidade conferidas antes do envio.",
    ],
    tips: [],
  },
  {
    id: "categorias",
    title: "Categorias, subcategorias e produtos",
    group: "Comercial",
    route: "/categorias",
    scope: "general",
    summary: "Mantenha uma organização única para catálogo, pedidos e concessões.",
    steps: [
      {
        title: "Procure a classificação",
        text: "Abra Categorias. O menu horizontal separa Categorias, Subcategorias e Produtos. Confira a classificação antes de criar novos cadastros.",
      },
      {
        title: "Crie ou ajuste",
        text: "Use a ação de cadastro/edição permitida e informe nome e imagem, quando disponível. Vincule a subcategoria à categoria principal correta.",
      },
      {
        title: "Classifique os produtos",
        text: "Em Categorias → Produtos, crie ou edite a ficha completa e selecione categoria e subcategoria. Esse é o local de edição dos produtos; a aba Catálogo permite somente consultar e montar materiais.",
      },
      {
        title: "Confira os acessos",
        text: "Revise as concessões do membro na administração. Um produto pode existir no sistema e não estar disponível para um vendedor sem concessão.",
      },
    ],
    checks: ["Categorias sem duplicidades.", "Produtos visíveis ao público interno autorizado."],
    tips: [],
  },
  {
    id: "pedidos",
    title: "Criar um pedido de venda",
    group: "Pedidos e revisão",
    route: "/pedidos",
    scope: "both",
    summary: "Do cadastro completo à solicitação em análise.",
    steps: [
      {
        title: "Abra Novo pedido",
        text: "Entre em Pedidos e clique em Novo pedido. Confira o vendedor e a categoria. Se estiver retomando um rascunho, confirme que ele corresponde à venda atual.",
      },
      {
        title: "Selecione o cliente",
        text: "Busque o cliente cadastrado. Se for um novo cliente, preencha o cadastro solicitado antes de continuar. Confira telefone e documento.",
      },
      {
        title: "Adicione os produtos",
        text: "Escolha produto e apresentação, informe quantidade e confira preço, moeda e estoque. Revise os mínimos comerciais quando aplicáveis e os descontos permitidos.",
      },
      {
        title: "Preencha a entrega",
        text: "Informe destinatário, documento, endereço, número, bairro, CEP, cidade e UF conforme os campos exigidos. Confira o estoque de origem.",
      },
      {
        title: "Confira o frete",
        text: "Se o frete já estiver embutido, mantenha essa condição. Para um adicional autorizado, informe o percentual ou o valor manual, observando a moeda e o total final.",
      },
      {
        title: "Revise e envie",
        text: "Confira itens, unidades, total, observações e os dados de entrega; salve/envie a solicitação. Acompanhe em Em análise. Não lance um segundo pedido se o primeiro ainda está aguardando revisão.",
      },
      {
        title: "Acompanhe a resposta",
        text: "Após aprovação, o pedido segue para Pedidos aprovados e para a operação de preparo/transporte. Se houver Ajuste solicitado, abra o histórico, corrija e reenvie.",
      },
    ],
    checks: [
      "Pedido aparece na situação esperada.",
      "Total e dados de entrega conferidos antes da aprovação.",
    ],
    tips: [
      "Salvar um rascunho não equivale a enviar um pedido para aprovação.",
      "O vendedor cria o pedido; a revisão da comissão é feita por um aprovador autorizado.",
    ],
  },
  {
    id: "editar-pedido",
    title: "Editar, excluir ou cancelar",
    group: "Pedidos e revisão",
    route: "/pedidos",
    scope: "both",
    summary: "Escolha a ação correta sem perder o histórico da venda.",
    steps: [
      {
        title: "Localize o pedido",
        text: "Busque pelo número ou cliente. Abra Ver detalhes para conferir se é a versão vigente e se existem pagamentos ou envio.",
      },
      {
        title: "Edite quando permitido",
        text: "Use Editar pedido ou o atalho da caneta. Pedidos já pagos parcialmente, enviados ou protegidos pelo fluxo podem gerar uma solicitação de alteração para aprovação.",
      },
      {
        title: "Compare antes de enviar",
        text: "Revise os itens e valores anteriores e propostos. Informe o motivo da correção e acompanhe a solicitação em Aprovações ou no histórico do pedido, conforme seu acesso.",
      },
      {
        title: "Exclua ou solicite cancelamento",
        text: "Use Excluir pedido ou a lixeira e informe o motivo. Um pedido em andamento pode exigir revisão de cancelamento, em vez de exclusão direta.",
      },
      {
        title: "Acompanhe os efeitos",
        text: "No cancelamento aprovado, confira o tratamento da mercadoria e do crédito do cliente. Pedido perdido representa custo da empresa e não deve retornar automaticamente ao saldo disponível.",
      },
    ],
    checks: [
      "Motivo e histórico registrados.",
      "Nenhuma duplicidade criada para substituir uma edição pendente.",
    ],
    tips: [
      "Quem solicitou uma alteração ou um cancelamento não deve revisar sua própria solicitação. Outro aprovador precisa conferir.",
    ],
  },
  {
    id: "aprovar-pedidos",
    title: "Aprovar pedidos e alterações",
    group: "Pedidos e revisão",
    route: "/aprovacoes",
    scope: "general",
    summary: "Atribuição de aprovação é diferente de ter acesso apenas para consulta.",
    steps: [
      {
        title: "Abra a fila",
        text: "Entre em Aprovações → Pedidos em análise, ou abra o cartão correspondente no painel/Pedidos. Confira quantos pedidos e solicitações aguardam revisão.",
      },
      {
        title: "Revise o pedido",
        text: "Clique em Revisar pedido. Confira cliente, itens, preços, descontos, estoque, frete, endereço e observações. Confira a comissão calculada pelo acordo.",
      },
      {
        title: "Defina a comissão",
        text: "Aplique a política vigente; quando autorizado, registre uma exceção justificada ou a condição sem comissão. Revise a base e o valor antes de decidir.",
      },
      {
        title: "Ajuste e confira novamente",
        text: "Se alterar dados, salve os ajustes e confira os valores recalculados. Depois aprove, reprove ou solicite ajuste ao vendedor, sempre com justificativa.",
      },
      {
        title: "Revise alterações separadamente",
        text: "Na seção Solicitações de alteração de pedidos, compare valores anteriores/propostos. Aprove e aplique ou rejeite apenas se você não é o solicitante nem o vendedor do pedido.",
      },
      {
        title: "Confira o histórico",
        text: "A decisão registra quem, quando e o motivo; o vendedor é notificado. Pedidos aprovados liberam o próximo fluxo operacional. Solicitações de cancelamento também exigem revisão do destino da mercadoria.",
      },
    ],
    checks: [
      "Situação final: Em análise, Ajuste solicitado, Reprovados ou Aprovados.",
      "Junior possui permissão de aprovação de pedidos; sua própria solicitação de alteração/cancelamento exige outro aprovador.",
    ],
    tips: [
      "A mensagem de aprovação própria não significa ausência de permissão geral. Peça a outro aprovador para revisar a solicitação.",
      "Poder aprovar pedidos não concede automaticamente poder para aprovar pagamentos.",
    ],
  },
  {
    id: "pagamento",
    title: "Registrar pagamento e usar crédito",
    group: "Pedidos e revisão",
    route: "/pedidos",
    scope: "both",
    summary: "O vendedor registra; a conferência financeira confirma ou devolve o lançamento.",
    steps: [
      {
        title: "Abra Lançar pagamento",
        text: "Na lista de Pedidos, localize o pedido correto e clique em Lançar pagamento. O lançamento deve ser feito por esse botão, e não dentro dos detalhes.",
      },
      {
        title: "Confira saldo e crédito",
        text: "Confira valor total, pago, saldo livre e crédito disponível do cliente. Para usar crédito, informe quanto pretende utilizar, respeitando o disponível e o saldo do pedido.",
      },
      {
        title: "Preencha o recebimento",
        text: "Informe valor recebido, moeda, forma e data do pagamento. Não confunda valor recebido em outra moeda com o valor convertido para a moeda do pedido.",
      },
      {
        title: "Anexe o comprovante",
        text: "Envie o arquivo do pagamento. Para dinheiro em mãos, siga o fluxo de recibo: imprimir, colher as assinaturas necessárias e anexar o recibo.",
      },
      {
        title: "Envie para conferência",
        text: "Finalize o registro. O pedido passa a indicar Aguardando financeiro; a parcela em análise aparece em laranja na barra. Ainda não é recebimento confirmado.",
      },
      {
        title: "Acompanhe o retorno",
        text: "Depois da confirmação financeira, a parcela fica verde e o saldo confirmado é atualizado. Se houver rejeição ou ajuste solicitado, leia o motivo e envie a correção necessária.",
      },
    ],
    checks: [
      "Comprovante legível e vinculado ao pedido correto.",
      "Data, moeda e valor recebidos conferidos.",
      "Saldo só tratado como confirmado depois da aprovação.",
    ],
    tips: [
      "Crédito solicitado para um pedido também passa pela conferência e pode ficar reservado enquanto aguarda decisão.",
      "Não registre o mesmo comprovante novamente enquanto ele ainda estiver em análise.",
    ],
  },
  {
    id: "aprovar-pagamentos",
    title: "Conferir e aprovar pagamentos",
    group: "Pedidos e revisão",
    route: "/aprovacoes",
    scope: "general",
    summary:
      "Aprovação financeira acontece na área Aprovações, separada dos relatórios de Finanças.",
    steps: [
      {
        title: "Abra Pagamentos para aprovar",
        text: "Entre em Aprovações e selecione a fila de pagamentos. Apenas quem possui atribuição financeira de aprovação pode decidir; consulta não autoriza baixa.",
      },
      {
        title: "Confira o recebimento",
        text: "Abra o lançamento e compare comprovante/recibo, cliente, pedido, data, forma, valor e moeda. Se for crédito, confira a origem e o disponível.",
      },
      {
        title: "Decida com justificativa",
        text: "Confirme se estiver correto. Quando permitido, ajuste os dados ou devolva para correção; reprove quando não houver recebimento válido. Registre o motivo da decisão.",
      },
      {
        title: "Confira a atualização",
        text: "Verifique o status do pagamento e o saldo do pedido. O aprovado entra no pago confirmado; o valor em análise não deve ser liberado como comissão.",
      },
      {
        title: "Faça a baixa final",
        text: "Na fila de quitações para baixa financeira, confira todos os pagamentos do pedido integralmente quitado e conclua a baixa quando correto.",
      },
      {
        title: "Consulte o histórico",
        text: "Abra o histórico de decisões financeiras para consultar responsável, data, motivo e alterações. Use Em análise, Ajuste solicitado, Reprovados e Aprovados para acompanhar.",
      },
    ],
    checks: [
      "Financeiro aprovado por responsável habilitado.",
      "Pedido e saldo atualizados sem duplicar recebimentos.",
    ],
    tips: [
      "Ze e Bia têm atribuição financeira; superadmin possui acesso integral. A aprovação de pedidos do Junior não lhe concede aprovação financeira.",
    ],
  },
  {
    id: "status",
    title: "Situações e atraso de pagamento",
    group: "Pedidos e revisão",
    route: "/pedidos",
    scope: "both",
    summary: "Diferencie revisão, transporte e quitação: são etapas relacionadas, mas distintas.",
    steps: [
      {
        title: "Leia a revisão",
        text: "Em análise aguarda decisão; Ajuste solicitado aguarda correção; Reprovados registra a recusa; Pedidos aprovados reúne os liberados.",
      },
      {
        title: "Leia o operacional",
        text: "A preparar corresponde à preparação. Em caminho indica transporte. Consulte Entregas para os eventos operacionais e a data de entrega.",
      },
      {
        title: "Leia o financeiro",
        text: "Aguardando financeiro indica lançamento pendente de conferência. Pagamento parcial tem valor confirmado abaixo do total; Pagos indica quitação confirmada, sujeita à baixa final prevista no fluxo.",
      },
      {
        title: "Entenda o atraso",
        text: "Pagamento atrasado passa a ser indicado três dias após a entrega registrada sem pagamento registrado. O pedido informa quantos dias se passaram desde a entrega. Confira lançamentos em análise antes de cobrar.",
      },
      {
        title: "Consulte exceções",
        text: "Produtos perdidos, Cancelados e Histórico têm finalidade própria. Use o histórico para entender revisões e versões, em vez de inferir a situação apenas pela posição em uma aba.",
      },
    ],
    checks: [
      "Entrega efetivamente registrada para calcular atraso.",
      "Pagamento em análise distinguido de pagamento confirmado.",
    ],
    tips: [],
  },
  {
    id: "rastreio",
    title: "Código de rastreio do pedido",
    group: "Operação",
    route: "/pedidos",
    scope: "both",
    summary: "Vincule o código à venda e acompanhe movimentações registradas.",
    steps: [
      {
        title: "Abra o rastreio",
        text: "No cartão do pedido, use Código de rastreio, abaixo de Lançar pagamento.",
      },
      {
        title: "Vincule os dados",
        text: "O vendedor do pedido ou o responsável autorizado de entrega/logística informa transportadora e código. Confira caracteres e salve.",
      },
      {
        title: "Veja o caminho",
        text: "Consulte o caminho do pedido e os eventos de transporte disponíveis. A entrega aparece quando sua data foi registrada.",
      },
      {
        title: "Consulte a transportadora",
        text: "Copie o código para consultar o serviço da transportadora. O histórico do sistema mostra seus próprios eventos registrados; cadastrar um código não cria eventos externos automaticamente.",
      },
      {
        title: "Revise alterações",
        text: "Abra o histórico dos códigos para consultar quem alterou, quando e qual código/transportadora foi informado.",
      },
    ],
    checks: [
      "Código corresponde ao pedido e à transportadora.",
      "Histórico consultado antes de substituir um código.",
    ],
    tips: [],
  },
  {
    id: "entregas",
    title: "Entregas e logística",
    group: "Operação",
    route: "/entregas",
    scope: "both",
    summary: "Acompanhe preparo, transporte e entrega; altere somente com atribuição operacional.",
    steps: [
      {
        title: "Encontre a entrega",
        text: "Abra Entregas. Confira filtros de etapa, período e demais recortes disponíveis e busque o pedido.",
      },
      {
        title: "Confira a identificação",
        text: "Abra o pedido para consultar destinatário, endereço, prazo, instruções e responsável operacional.",
      },
      {
        title: "Registre o andamento",
        text: "Quem possui permissão de logística pode registrar as etapas e ocorrências da entrega. Informe data, local e observações reais; o vendedor acompanha o andamento permitido.",
      },
      {
        title: "Confirme a entrega real",
        text: "Registre a data quando a entrega acontecer. Corrija uma ocorrência pelo fluxo autorizado e mantenha evidências e histórico.",
      },
      {
        title: "Acompanhe a cobrança",
        text: "Após a entrega, consulte o pagamento do pedido. Para receber, use Lançar pagamento no pedido; o código de rastreio é vinculado pelo botão próprio.",
      },
    ],
    checks: ["Evento corresponde ao que aconteceu.", "Data de entrega e destinatário conferidos."],
    tips: [],
  },
  {
    id: "estoque",
    title: "Estoques e movimentações",
    group: "Operação",
    route: "/estoque",
    scope: "general",
    summary: "Saiba de qual estoque saem e em qual estoque entram as quantidades.",
    steps: [
      {
        title: "Selecione o estoque",
        text: "Abra Estoque e identifique o estoque principal ou o estoque atribuído. Confira categoria e produtos antes de movimentar.",
      },
      {
        title: "Consulte saldo e reservas",
        text: "Compare saldo físico, reservado e disponível. Uma venda pode consumir reserva; não corrija saldo apenas porque o disponível é menor que o total.",
      },
      {
        title: "Registre a operação correta",
        text: "Use a ação correspondente a compra/entrada, transferência ou ajuste, conforme sua atribuição. Identifique origem e destino nas transferências e o motivo nos ajustes.",
      },
      {
        title: "Confira o recebimento",
        text: "Revise produtos e unidades recebidas; confira o destino da compra. Uma entrada apenas quantitativa feita em Abastecer produto é destinada ao Estoque principal.",
      },
      {
        title: "Confira o histórico",
        text: "Verifique as movimentações e depois compare com o Catálogo. Se houver divergência, confira estoque escolhido, reservas e entradas duplicadas antes de fazer outro ajuste.",
      },
    ],
    checks: [
      "Origem e destino identificados.",
      "Movimentação registrada com justificativa e sem duplicidade.",
    ],
    tips: [],
  },
  {
    id: "compras",
    title: "Compras e reposição",
    group: "Operação",
    route: "/compras",
    scope: "general",
    summary: "Compra de mercadoria para estoque é diferente de pedido de venda ao cliente.",
    steps: [
      {
        title: "Inicie no estoque de destino",
        text: "Para compra vinculada ao estoque, abra Estoques → Estoque principal → Registrar compra. A área Compras e reposição permite acompanhar os registros de compra.",
      },
      {
        title: "Selecione o fornecedor",
        text: "Escolha o fornecedor e os produtos cadastrados. Informe quantidades, custo unitário, moeda e demais valores solicitados.",
      },
      {
        title: "Registre condições e pagamento",
        text: "Confira frete e condições. Registre os pagamentos e comprovantes da compra no fluxo próprio; não use o lançamento de pagamento de uma venda ao cliente.",
      },
      {
        title: "Acompanhe a situação",
        text: "Use as abas de compras para acompanhar trânsito, pagamento, consolidação, perdas e cancelamentos, conferindo o número de registros de cada situação.",
      },
      {
        title: "Receba e concilie",
        text: "No recebimento/consolidação, confira a quantidade efetivamente recebida e o estoque de destino. Compare o saldo atualizado com o Catálogo sem repetir a entrada.",
      },
    ],
    checks: [
      "Custo, fornecedor e destino do estoque corretos.",
      "Pagamento da compra separado do recebimento da venda.",
    ],
    tips: [],
  },
  {
    id: "fornecedores",
    title: "Fornecedores",
    group: "Operação",
    route: "/fornecedores",
    scope: "general",
    summary: "Mantenha a origem dos produtos e os dados do fornecedor organizados.",
    steps: [
      {
        title: "Busque o fornecedor",
        text: "Confira se ele já está cadastrado antes de criar um novo registro.",
      },
      {
        title: "Complete o cadastro",
        text: "Informe identificação e contatos e os demais dados exigidos. Salve e confira o nome utilizado nas compras.",
      },
      {
        title: "Vincule os produtos",
        text: "No cadastro de produtos e nos registros de compra, selecione o fornecedor correto. Confira lotes e condições quando disponíveis.",
      },
      {
        title: "Consulte os registros",
        text: "Use os filtros e detalhes da área para consultar fornecimentos e os registros permitidos. Atualizações devem preservar o histórico de compras anteriores.",
      },
    ],
    checks: [
      "Fornecedor identificável e sem duplicidade.",
      "Produtos e compras com vínculo correto.",
    ],
    tips: [],
  },
  {
    id: "perdas",
    title: "Perda, cancelamento e substituição",
    group: "Operação",
    route: "/pedidos",
    scope: "general",
    summary: "Resolva uma perda preservando custo, cobrança e vínculo da nota de substituição.",
    steps: [
      {
        title: "Registre a ocorrência",
        text: "Confira qual pedido e quais mercadorias foram perdidos antes de alterar a situação. Registre o motivo e as evidências no fluxo disponível.",
      },
      {
        title: "Trate o custo",
        text: "Produto perdido é custo da empresa; não deve voltar automaticamente ao estoque. Confira o tratamento financeiro da ocorrência.",
      },
      {
        title: "Gere substituição quando necessário",
        text: "No fluxo de perdido, use a opção de duplicar/gerar substituição disponível. Confira o vínculo com a nota perdida e os dados do novo envio.",
      },
      {
        title: "Revise a cobrança",
        text: "Se o pedido for cancelado com pagamento confirmado, confira o crédito gerado para o cliente. Uma reposição ativa precisa ser revisada antes do cancelamento da cobrança original.",
      },
      {
        title: "Confira o histórico",
        text: "Confirme que o registro original e a substituição ficam identificados e que não houve cobrança ou entrada de estoque duplicada.",
      },
    ],
    checks: [
      "Mercadoria perdida sem retorno fictício ao saldo.",
      "Nota de substituição vinculada à original.",
    ],
    tips: [],
  },
  {
    id: "financeiro",
    title: "Financeiro: consultar e conciliar",
    group: "Finanças",
    route: "/financeiro",
    scope: "both",
    summary: "Acompanhe os valores da empresa ou seus valores pessoais, conforme o perfil.",
    steps: [
      {
        title: "Confira o acesso e os filtros",
        text: "Entre em Financeiro ou Pagamentos e comissões no Estadual. Selecione período, categoria e moeda. O vendedor consulta apenas os valores autorizados do próprio perfil.",
      },
      {
        title: "Leia as áreas",
        text: "Na Direção Geral, use Resumo, A receber, A pagar e Em estoque para suas finalidades. Não some valores BRL, USD e PYG como se fossem uma única moeda.",
      },
      {
        title: "Consulte registros e documentos",
        text: "Abra os itens para conferir referência, vencimento, situação, comprovantes e histórico. Créditos de clientes e Remuneração e folha têm seções específicas.",
      },
      {
        title: "Faça a ação no lugar correto",
        text: "Pagamento de pedido é registrado em Pedidos → Lançar pagamento e revisado em Aprovações. A área financeira serve também para contas, políticas e folha conforme as permissões.",
      },
      {
        title: "Exporte e confira",
        text: "Use o relatório apropriado e revise filtros, títulos e moedas antes de compartilhar.",
      },
    ],
    checks: [
      "Consulta pessoal diferenciada da visão financeira da empresa.",
      "Comprovantes e baixas conferidos na fila apropriada.",
    ],
    tips: [],
  },
  {
    id: "politicas",
    title: "Políticas de remuneração e comissão",
    group: "Finanças",
    route: "/financeiro",
    scope: "general",
    summary: "Centralize os acordos em Financeiro → Políticas de remuneração.",
    steps: [
      {
        title: "Abra a política",
        text: "Selecione Políticas de remuneração e consulte a política vigente antes de criar outra. Criação e alteração ficam com os administradores autorizados.",
      },
      {
        title: "Defina o alcance",
        text: "Informe os cargos/membros atendidos e os produtos/categorias previstos. Confira vigência e se o acordo é fixo ou temporário.",
      },
      {
        title: "Defina base, valor e moeda",
        text: "Escolha base de venda, custo, custo com frete ou lucro conforme as opções. Defina percentual ou valor fixo e sua moeda. Para o acordo de 5% sobre venda, R$ 20.000 de base elegível corresponde a R$ 1.000 antes de considerar recebimentos parciais e exceções.",
      },
      {
        title: "Configure metas e faixas",
        text: "Defina período, participantes, métrica e faixas por produto/categoria. Confira se a faixa substitui a taxa anterior e como a política combina metas individuais e de time.",
      },
      {
        title: "Revise e registre",
        text: "Salve com justificativa e confira o histórico. Na revisão do pedido, verifique a política aplicada e eventuais exceções; na folha, confira apenas valores liberados por pagamentos confirmados.",
      },
    ],
    checks: [
      "Base de cálculo e produtos elegíveis identificados.",
      "Vigência, faixas e participantes sem ambiguidade.",
    ],
    tips: [
      "Percentual não significa comissão liberada sobre o pedido inteiro: recebimentos parciais liberam somente a parte correspondente confirmada.",
    ],
  },
  {
    id: "folha",
    title: "Remuneração, folha e recibos",
    group: "Finanças",
    route: "/financeiro",
    scope: "both",
    summary: "Acompanhe a comissão apurada, liberada e paga.",
    steps: [
      {
        title: "Abra sua remuneração",
        text: "No Estadual, consulte Pagamentos e comissões. Na Direção Geral, abra Financeiro → Remuneração e folha, conforme sua atribuição.",
      },
      {
        title: "Confira a origem",
        text: "Compare pedidos, produtos, acordo e valores liberados. Valores de pagamentos ainda em análise não são recebimentos confirmados para liberar comissão.",
      },
      {
        title: "Confira o período",
        text: "Observe o período de apuração e a data de pagamento definidos pela administração. Revise exceções, estornos e ajustes registrados.",
      },
      {
        title: "Registre o pagamento autorizado",
        text: "O responsável habilitado registra o pagamento da remuneração pelo fluxo da folha. O beneficiário confere o recebido e segue a exigência de recibo/assinatura e anexo.",
      },
      {
        title: "Guarde o registro",
        text: "Confira notificações, recibos e situação do pagamento. Em divergências, informe o pedido e o período ao responsável financeiro, em vez de alterar o acordo por fora.",
      },
    ],
    checks: [
      "Apuração e pagamento identificados separadamente.",
      "Recibo e comprovante vinculados ao lançamento correto.",
    ],
    tips: [],
  },
  {
    id: "creditos",
    title: "Créditos de clientes",
    group: "Finanças",
    route: "/financeiro",
    scope: "general",
    summary: "Consulte o saldo, a origem e o uso do crédito sem confundir com recebimento novo.",
    steps: [
      {
        title: "Localize o cliente",
        text: "Abra Financeiro → Créditos de clientes e selecione o cliente e a moeda corretos.",
      },
      {
        title: "Confira o extrato",
        text: "Leia origem do crédito, aplicações, reservas e saldo disponível. Créditos em moedas diferentes devem ser tratados separadamente.",
      },
      {
        title: "Registre ajustes autorizados",
        text: "Quando sua permissão permitir, faça a operação de crédito prevista no formulário com valor, motivo e referência. Não faça crédito duplicado para um cancelamento já tratado.",
      },
      {
        title: "Use no pedido",
        text: "A aplicação em uma venda é solicitada em Pedidos → Lançar pagamento. Informe o valor de crédito a utilizar; o lançamento passa por conferência financeira.",
      },
      {
        title: "Concilie após a decisão",
        text: "Confira o saldo e o pedido depois da aprovação ou devolução da solicitação.",
      },
    ],
    checks: [
      "Moeda e cliente corretos.",
      "Reserva pendente diferenciada do crédito efetivamente aplicado.",
    ],
    tips: [],
  },
  {
    id: "cambio",
    title: "Cotações e câmbio",
    group: "Finanças",
    route: "/cambio",
    scope: "general",
    summary: "Entenda a moeda cadastrada e as conversões usadas nas operações.",
    steps: [
      {
        title: "Consulte as cotações",
        text: "Abra Cotações e câmbio e confira moedas, fonte e data da referência disponível.",
      },
      {
        title: "Identifique a moeda original",
        text: "No cadastro e no pedido, confira se o valor original está em BRL, USD ou PYG. Um preço cadastrado em reais deve continuar o mesmo valor em reais.",
      },
      {
        title: "Revise a conversão",
        text: "Quando uma operação usa outra moeda, confira a cotação aplicada e o valor convertido. Pedidos podem guardar uma referência de câmbio própria.",
      },
      {
        title: "Altere somente com permissão",
        text: "Se sua atribuição permite ajustes de cotação/configuração, registre pelo controle disponível e confira o efeito em uma simulação antes de concluir uma operação real.",
      },
    ],
    checks: [
      "Moeda original preservada.",
      "Cotação da operação conferida, sem recalcular manualmente um pedido já fechado.",
    ],
    tips: [],
  },
  {
    id: "ranking",
    title: "Metas, ranking e bonificações",
    group: "Resultados",
    route: "/ranking",
    scope: "both",
    summary: "Compare desempenho no mesmo período e acompanhe campanhas.",
    steps: [
      {
        title: "Escolha o período",
        text: "Abra Ranking ou Metas e ranking. Confira filtros de categoria, produto e período.",
      },
      {
        title: "Leia as classificações",
        text: "Use as seções de campeonatos, ranking e comparativo por equipes quando disponíveis. Compare somente participantes elegíveis.",
      },
      {
        title: "Confira suas metas",
        text: "Veja critérios, quantidade/valor exigido e progresso. Ze e Junior não competem no ranking de vendedores.",
      },
      {
        title: "Administre quando permitido",
        text: "Na Direção Geral, cadastre e revise campanhas, participantes e regras de bonificação nos controles administrativos. Para o acordo de pagamento/comissão, use Políticas de remuneração como referência.",
      },
    ],
    checks: [
      "Período e participantes elegíveis conferidos.",
      "Bonificação e comissão não duplicadas por acordos paralelos.",
    ],
    tips: [],
  },
  {
    id: "promocoes",
    title: "Promoções",
    group: "Comercial",
    route: "/promocoes",
    scope: "both",
    summary: "Consulte ofertas vigentes e respeite produtos, preços e mínimos definidos.",
    steps: [
      {
        title: "Consulte a vigência",
        text: "Abra Promoções e confira quais ofertas estão ativas no período atual.",
      },
      {
        title: "Leia as condições",
        text: "Confira produto/apresentação, preço, moeda, quantidade mínima e público autorizado antes de oferecer a condição.",
      },
      {
        title: "Cadastre pela Direção Geral",
        text: "Quem possui permissão usa a ação de cadastro/edição para definir produtos, condições e período. Confira a condição antes de ativar.",
      },
      {
        title: "Aplique e confira",
        text: "No pedido ou material de venda autorizado, confira se a condição foi aplicada corretamente antes de enviar para aprovação. O vendedor não altera preços administrativos pelo catálogo.",
      },
    ],
    checks: [
      "Condição válida para os produtos e quantidades vendidos.",
      "Oferta fora da vigência não utilizada.",
    ],
    tips: [],
  },
  {
    id: "relatorios",
    title: "Relatórios completos e simplificados",
    group: "Resultados",
    route: "/pedidos",
    scope: "both",
    summary: "Escolha o relatório e confira seus filtros antes de exportar.",
    steps: [
      {
        title: "Filtre os registros",
        text: "Na aba de origem, selecione período, categoria, vendedor, situação e demais recortes necessários. No Estadual, a exportação respeita o acesso do vendedor.",
      },
      {
        title: "Abra Exportar relatório",
        text: "Em Pedidos, o botão fica junto aos filtros. Em outras áreas, use o botão de relatório disponível no início ou final da seção.",
      },
      {
        title: "Escolha o formato",
        text: "Use o relatório completo para detalhes. No simplificado de pedidos, confira pedido, data, cliente, vendedor, situação, datas de pagamento, produtos, unidades, totais, pago, a receber, frete e estoque, com moedas agrupadas.",
      },
      {
        title: "Revise antes de enviar",
        text: "Confira título, seleção, datas e agrupamentos BRL/USD/PYG no arquivo. A nota do cliente é diferente do relatório interno e não deve expor dados administrativos.",
      },
    ],
    checks: [
      "Arquivo contém apenas o recorte pretendido.",
      "Nenhuma soma direta entre moedas diferentes.",
    ],
    tips: [],
  },
  {
    id: "membros",
    title: "Membros, cargos e concessões",
    group: "Administração",
    route: "/equipe",
    scope: "general",
    summary: "Cadastre a pessoa, atribua cargos e confira o acesso efetivo.",
    steps: [
      {
        title: "Procure o membro",
        text: "Abra Membros e confira se o e-mail ou a pessoa já está cadastrada.",
      },
      {
        title: "Cadastre e atribua cargos",
        text: "Um administrador autorizado informa identificação, e-mail inicial, senha definida e os cargos/setor. Confira a política de remuneração associada ao cargo e eventuais exceções.",
      },
      {
        title: "Defina as concessões",
        text: "Revise categorias, produtos, estoques, território e sistemas liberados. Vários cargos somam áreas autorizadas, mas aprovações financeiras continuam dependendo de atribuição específica.",
      },
      {
        title: "Confira o acesso",
        text: "Revise a visão do membro por modo de consulta quando disponível. O modo espelho não autoriza operações em nome do usuário.",
      },
      {
        title: "Oriente o primeiro acesso",
        text: "Peça ao membro que entre e atualize seus dados, e-mail e senha em Configurações. Mudanças de e-mail podem exigir confirmação.",
      },
    ],
    checks: [
      "Cargo e concessões conferidos.",
      "Usuário ativo e com credenciais iniciais definidas.",
    ],
    tips: ["Não coloque senhas reais em observações, imagens de treinamento ou no chat interno."],
  },
  {
    id: "tarefas",
    title: "Tarefas e prazos",
    group: "Colaboração",
    route: "/tarefas",
    scope: "both",
    summary: "Registre solicitações e acompanhe o responsável por cada entrega.",
    steps: [
      {
        title: "Busque a atividade",
        text: "Confira filtros, situação, responsável e prazo antes de criar uma tarefa repetida.",
      },
      {
        title: "Crie a tarefa",
        text: "Preencha título, tipo, equipe solicitante, responsável, cliente quando aplicável, prazo, prioridade e descrição conforme os campos disponíveis.",
      },
      {
        title: "Acompanhe e atualize",
        text: "Abra a tarefa para registrar andamento. Use pendente, em andamento e concluída conforme a execução real.",
      },
      {
        title: "Confira a conclusão",
        text: "Valide o resultado antes de concluir. Se usar conexão de calendário disponível à sua conta, confira também a sincronização da atividade.",
      },
    ],
    checks: ["Responsável e prazo claros.", "Descrição suficiente para executar a solicitação."],
    tips: [],
  },
  {
    id: "avisos",
    title: "Avisos e notificações",
    group: "Colaboração",
    route: "/avisos",
    scope: "both",
    summary: "Consulte comunicados e acompanhe decisões sobre seus pedidos.",
    steps: [
      {
        title: "Abra o sino",
        text: "No cabeçalho, consulte notificações de aprovações, pagamentos e demais eventos do seu acesso.",
      },
      {
        title: "Acesse o registro",
        text: "Clique no aviso para abrir a área ou pedido relacionado. Confira quem agiu, quando e o motivo no histórico do registro.",
      },
      {
        title: "Leia os comunicados",
        text: "Abra Avisos internos ou Notificações no menu para consultar os comunicados disponíveis ao perfil.",
      },
      {
        title: "Publique se autorizado",
        text: "Administradores habilitados usam os controles de publicação para definir conteúdo, público e vigência. Confira o destino antes de publicar.",
      },
    ],
    checks: [
      "Notificação conferida no registro de origem.",
      "Comunicado enviado apenas ao público definido.",
    ],
    tips: [],
  },
  {
    id: "chat",
    title: "Conversas individuais e grupos",
    group: "Colaboração",
    route: "/chat",
    scope: "both",
    summary: "Converse com membros ativos dentro do sistema.",
    steps: [
      {
        title: "Abra Nova conversa",
        text: "Entre no Chat interno e clique em Nova conversa. Aguarde o carregamento dos membros e use Buscar membro.",
      },
      {
        title: "Inicie uma conversa individual",
        text: "Na aba Pessoa, selecione o membro desejado. O sistema reutiliza a conversa individual existente quando houver.",
      },
      {
        title: "Crie um grupo",
        text: "Na aba Grupo, informe um nome e selecione pelo menos um participante além de você. Clique em Criar grupo e confira os integrantes escolhidos.",
      },
      {
        title: "Envie e acompanhe",
        text: "Digite a mensagem e envie. Use responder ou anexar conforme os controles disponíveis. Quem não participa da conversa não acessa seu conteúdo.",
      },
      {
        title: "Corrija com cuidado",
        text: "A ação de apagar está disponível para suas próprias mensagens. Se a lista de membros falhar, use Tentar novamente; não interprete erro de carregamento como ausência de equipe.",
      },
    ],
    checks: [
      "Destinatário/grupo corretos antes de enviar.",
      "Mensagem aparece na conversa escolhida.",
    ],
    tips: [],
  },
  {
    id: "estudo",
    title: "Guia de estudo dos produtos",
    group: "Conhecimento",
    route: "/produtos#guia-de-estudo",
    scope: "both",
    summary: "Consulte as informações de produto vinculadas ao catálogo.",
    steps: [
      {
        title: "Busque o produto",
        text: "Abra Catálogo → Guia de estudo e utilize os filtros e a busca por nome, categoria ou marca disponíveis.",
      },
      {
        title: "Abra as informações",
        text: "Consulte imagem, apresentação, descrição, finalidade e orientações registradas no cadastro.",
      },
      {
        title: "Confira a fonte",
        text: "Leia a fonte indicada e confira a apresentação exata do produto. Informações incompletas devem ser encaminhadas à administração para revisão.",
      },
      {
        title: "Atualize na origem",
        text: "Administradores atualizam informações e imagens no cadastro do produto. O guia aproveita os dados cadastrados, evitando manter versões conflitantes.",
      },
    ],
    checks: ["Produto e apresentação correspondem ao material consultado."],
    tips: [
      "O guia organiza informações; conteúdo de uso não substitui avaliação profissional e a documentação oficial aplicável.",
    ],
  },
  {
    id: "perfil",
    title: "Meu perfil, foto, e-mail e senha",
    group: "Conta",
    route: "/configuracoes",
    scope: "both",
    summary: "Atualize seus próprios dados com facilidade.",
    steps: [
      {
        title: "Abra Configurações",
        text: "Use o perfil/cabeçalho ou a opção Configurações disponível. Confira se está na sua sessão real, sem modo espelho.",
      },
      {
        title: "Atualize seus dados",
        text: "Em Meu perfil, altere nome, telefone e os campos disponíveis. Para a foto, envie JPG, PNG ou WebP de até 5 MB e salve.",
      },
      {
        title: "Troque o e-mail",
        text: "Em E-mail de acesso, informe o novo endereço e use Alterar meu e-mail. Conclua a confirmação exigida; o histórico permanece associado à mesma pessoa.",
      },
      {
        title: "Troque a senha",
        text: "Preencha os campos de senha disponíveis e confirme a alteração. Guarde a nova senha e use o novo acesso no próximo login.",
      },
    ],
    checks: ["Dados salvos e foto atualizada.", "Confirmação de e-mail concluída quando exigida."],
    tips: [],
  },
  {
    id: "atendimento",
    title: "Atendimentos",
    group: "Atendimento e marketing",
    route: "/atendimentos",
    scope: "general",
    summary: "Gerencie conversas de atendimento nas contas conectadas.",
    steps: [
      {
        title: "Escolha a conta/conversa",
        text: "Abra Atendimentos e selecione a conexão e a conversa disponíveis ao seu acesso. Falha de conexão deve ser tratada na configuração da conta.",
      },
      {
        title: "Identifique o contato",
        text: "Confira nome, telefone, responsável e histórico antes de responder. Ajuste identificação e atribuição quando permitido.",
      },
      {
        title: "Registre o atendimento",
        text: "Envie texto ou anexos pelos controles da conversa. Confira o destinatário antes de enviar e associe a oportunidade/cliente quando o fluxo permitir.",
      },
      {
        title: "Organize o encerramento",
        text: "Use fixar, arquivar ou as demais ações conforme a rotina. Um atendimento de cliente é diferente de uma conversa com membros no Chat interno.",
      },
    ],
    checks: ["Conta e contato corretos.", "Responsável definido para continuidade."],
    tips: [],
  },
  {
    id: "contatos",
    title: "Listas de contatos",
    group: "Atendimento e marketing",
    route: "/contatos",
    scope: "general",
    summary: "Organize contatos e encaminhe oportunidades ao CRM.",
    steps: [
      {
        title: "Abra ou crie a lista",
        text: "Em Listas de contatos, consulte as listas existentes antes de criar uma nova.",
      },
      {
        title: "Cadastre ou importe",
        text: "Informe os dados solicitados ou use o importador disponível. Confira o formato do arquivo e a correspondência dos campos antes de confirmar.",
      },
      {
        title: "Classifique os contatos",
        text: "Revise nome, telefone, e-mail, empresa, cidade e origem. Use a situação apropriada, como novo, em contato, enviado ao CRM ou descartado.",
      },
      {
        title: "Encaminhe e acompanhe",
        text: "Use a ação de envio ao CRM quando aplicável e confira o responsável. Evite encaminhar o mesmo contato repetidamente.",
      },
    ],
    checks: ["Lista e contatos sem duplicidades evitáveis.", "Telefone e origem revisados."],
    tips: [],
  },
  {
    id: "disparador",
    title: "Disparador de mensagens",
    group: "Atendimento e marketing",
    route: "/disparador",
    scope: "general",
    summary: "Prepare uma comunicação para a lista correta nas conexões autorizadas.",
    steps: [
      {
        title: "Confira a conexão",
        text: "Abra Disparador de mensagens e verifique a conta/canal autorizado disponível.",
      },
      {
        title: "Defina o público",
        text: "Selecione a lista ou destinatários pretendidos e confira exclusões e quantidade de contatos.",
      },
      {
        title: "Revise o conteúdo",
        text: "Preencha a mensagem e os anexos conforme o formulário. Confira nomes, links e condição comercial antes de prosseguir.",
      },
      {
        title: "Acompanhe o envio",
        text: "Use os controles de prévia, agendamento/envio e acompanhamento existentes na tela. Não repita o envio para resolver uma falha sem antes conferir o resultado anterior.",
      },
    ],
    checks: [
      "Público e conteúdo autorizados para a comunicação.",
      "Resultado consultado antes de repetir o envio.",
    ],
    tips: [],
  },
  {
    id: "trafego",
    title: "Tráfego pago",
    group: "Atendimento e marketing",
    route: "/trafego-pago",
    scope: "general",
    summary: "Acompanhe campanhas e seus indicadores.",
    steps: [
      {
        title: "Selecione o recorte",
        text: "Abra Tráfego pago e confira conta/campanha, período e filtros disponíveis.",
      },
      {
        title: "Consulte os indicadores",
        text: "Compare investimento, resultados e demais indicadores na mesma janela de datas.",
      },
      {
        title: "Registre os dados permitidos",
        text: "Use cadastro, edição ou integração somente quando sua atribuição e os controles da tela permitirem. Revise campanha e moeda.",
      },
      {
        title: "Concilie e compartilhe",
        text: "Confira os números com a origem e use o relatório disponível. Não trate uma edição de indicador interno como alteração automática da campanha na plataforma externa.",
      },
    ],
    checks: ["Período, campanha e fonte identificados.", "Custos comparados na mesma moeda."],
    tips: [],
  },
  {
    id: "scripts",
    title: "Scripts e treinamentos",
    group: "Conhecimento",
    route: "/scripts",
    scope: "general",
    summary: "Consulte roteiros comerciais e materiais de capacitação.",
    steps: [
      {
        title: "Escolha a seção",
        text: "Abra Scripts e treinamentos e escolha Scripts de venda ou Treinamentos e cursos.",
      },
      {
        title: "Filtre o conteúdo",
        text: "Encontre o material correspondente ao produto, etapa e público pretendidos.",
      },
      {
        title: "Use o roteiro aprovado",
        text: "Leia o conteúdo completo e confira se corresponde à condição comercial vigente antes de utilizar.",
      },
      {
        title: "Atualize com permissão",
        text: "Administradores habilitados mantêm título, conteúdo, links e anexos pelos controles de cadastro/edição da área.",
      },
    ],
    checks: ["Conteúdo compatível com o público e a condição atual."],
    tips: [],
  },
  {
    id: "manuais",
    title: "Manuais e onboarding",
    group: "Conhecimento",
    route: "/manuais",
    scope: "general",
    summary: "Organize os materiais internos além deste manual de uso.",
    steps: [
      {
        title: "Consulte os materiais",
        text: "Abra Manuais e onboarding para visualizar os documentos e conteúdos disponíveis.",
      },
      {
        title: "Leia antes de operar",
        text: "Escolha o material correspondente à rotina e confira orientações e anexos.",
      },
      {
        title: "Cadastre se autorizado",
        text: "Use os controles administrativos disponíveis para registrar ou atualizar o conteúdo e seus vínculos.",
      },
      {
        title: "Use este manual para os fluxos",
        text: "Para executar ações nas telas atuais, volte a Como usar o sistema e busque o assunto. O Guia de estudo é dedicado às informações dos produtos.",
      },
    ],
    checks: ["Material correto selecionado.", "Versão e instruções conferidas antes da operação."],
    tips: [],
  },
  {
    id: "acessos",
    title: "Acessos e credenciais",
    group: "Administração",
    route: "/acessos",
    scope: "general",
    summary: "Consulte e mantenha acessos somente com atribuição administrativa.",
    steps: [
      {
        title: "Confira sua autorização",
        text: "Entre em Acessos apenas quando essa área estiver liberada ao seu perfil.",
      },
      {
        title: "Localize o registro",
        text: "Use a busca e abra o acesso correspondente ao serviço desejado.",
      },
      {
        title: "Use os dados com cuidado",
        text: "Confira o serviço, o usuário e o destino antes de copiar informações. Não compartilhe credenciais em materiais públicos ou imagens.",
      },
      {
        title: "Atualize pelo controle próprio",
        text: "Se autorizado, registre ou altere os dados pelos formulários da área. Revise o destino e salve a alteração sem apagar referências necessárias à operação.",
      },
    ],
    checks: ["Serviço e conta corretos.", "Credenciais não expostas em conversas ou relatórios."],
    tips: [],
  },
  {
    id: "rastreabilidade",
    title: "Rastreabilidade e autenticidade",
    group: "Administração",
    route: "/autenticidade",
    scope: "general",
    summary: "Gerencie a identificação e a validação dos produtos conforme a atribuição.",
    steps: [
      {
        title: "Localize o produto/lote",
        text: "Abra Rastreabilidade e confira os filtros e os registros de identificação disponíveis.",
      },
      {
        title: "Confira os vínculos",
        text: "Verifique produto, apresentação, lote e dados associados ao código antes de gerar ou alterar registros.",
      },
      {
        title: "Execute a ação autorizada",
        text: "Use os controles de cadastro, emissão ou consulta disponíveis. Revise o endereço de validação antes de distribuir um código.",
      },
      {
        title: "Valide o resultado",
        text: "Abra a consulta correspondente e confira se o código leva ao produto/lote correto. Código de autenticidade não é o código de transporte do pedido.",
      },
    ],
    checks: ["Identificação corresponde ao produto/lote pretendido."],
    tips: [],
  },
  {
    id: "integracoes",
    title: "Integrações",
    group: "Administração",
    route: "/integracoes",
    scope: "general",
    summary: "Confira conexões e seu estado operacional.",
    steps: [
      {
        title: "Identifique a conexão",
        text: "Abra Integrações e localize o serviço/configuração desejado.",
      },
      {
        title: "Confira o estado",
        text: "Consulte a situação e os dados disponíveis antes de reconectar ou alterar parâmetros.",
      },
      {
        title: "Configure somente com permissão",
        text: "Utilize os formulários e procedimentos autorizados. Não copie chaves de servidor para campos públicos ou materiais de treinamento.",
      },
      {
        title: "Valide o resultado",
        text: "Depois de salvar, confira a situação e o fluxo relacionado. Uma conexão de login não garante que todos os módulos estejam integrados.",
      },
    ],
    checks: ["Conexão e ambiente corretos.", "Operação dependente testada após a configuração."],
    tips: [],
  },
  {
    id: "sistemas",
    title: "Integrações e APIs divisionais",
    group: "Administração",
    route: "/sistemas-divisionais",
    scope: "general",
    summary: "Administre a conexão entre a Direção Geral e os portais autorizados.",
    steps: [
      {
        title: "Abra a área administrativa",
        text: "Use Integrações e APIs quando disponível à sua conta.",
      },
      {
        title: "Confira o sistema",
        text: "Identifique o portal, domínio e situação da conexão antes de alterar configurações.",
      },
      {
        title: "Revise as permissões",
        text: "Confira o membro, cargos, concessões e o sistema liberado. Evite criar cadastros paralelos para a mesma pessoa.",
      },
      {
        title: "Valide com o perfil correto",
        text: "Após uma alteração autorizada, confira o acesso pelo portal correspondente e consulte os registros de sincronização disponíveis.",
      },
    ],
    checks: [
      "Portal e conexão identificados.",
      "Acesso respeita cargos, concessões e proprietário do registro.",
    ],
    tips: [],
  },
  {
    id: "admin",
    title: "Visão interna e administração",
    group: "Administração",
    route: "/admin",
    scope: "general",
    summary: "Use ferramentas administrativas conforme sua atribuição.",
    steps: [
      {
        title: "Confira a conta",
        text: "Confirme que está na Direção Geral e em sua conta administrativa real.",
      },
      {
        title: "Escolha a ferramenta",
        text: "Abra Visão interna (admin) e selecione a função necessária; confira o alcance de qualquer alteração antes de executá-la.",
      },
      {
        title: "Revise os vínculos",
        text: "Quando a rotina envolve membro, confira cargos, categoria, produtos, estoque e sistemas concedidos.",
      },
      {
        title: "Confira o histórico",
        text: "Depois da alteração, consulte o registro e seu histórico e valide o resultado no perfil apropriado. Superadmin possui acesso integral; outros perfis seguem as atribuições.",
      },
    ],
    checks: ["Registro e alcance da alteração conferidos antes de salvar."],
    tips: [],
  },
  {
    id: "sos",
    title: "SOS de conta",
    group: "Administração",
    route: "/sos",
    scope: "general",
    summary: "Confira problemas de conta e vínculos administrativos.",
    steps: [
      {
        title: "Abra SOS de conta",
        text: "Na Direção Geral, use o botão de SOS quando sua conta estiver autorizada.",
      },
      {
        title: "Identifique o problema",
        text: "Confira qual conta, sistema e vínculo está sendo diagnosticado. Não altere outra pessoa por semelhança de nome.",
      },
      {
        title: "Use os controles permitidos",
        text: "Consulte o diagnóstico e execute somente o ajuste necessário pelos controles da ferramenta.",
      },
      {
        title: "Valide o acesso",
        text: "Peça à pessoa para testar o acesso com a conta correta. Confira se os cargos e concessões continuam coerentes com o acordo.",
      },
    ],
    checks: ["Pessoa e sistema identificados antes de qualquer ajuste."],
    tips: [],
  },
];
