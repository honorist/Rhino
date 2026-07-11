'use strict';
/**
 * @file Rotas de operação — recursos (RH), documentos, estoque, solicitações
 * de compra, manutenção de equipamentos, frota/veículos, layouts de dashboard
 * e templates de documento.
 *
 * Fase 2 do desmembramento do server.js. Handlers injetados via `deps`.
 *
 * @param {object} router  Instância de lib/router.js.
 * @param {object} deps    { handle* ... }
 */
module.exports = function registerOperacao(router, deps) {
  // ── Recursos (RH) ──
  router.get('/api/recursos', (ctx) => deps.handleGetRecursos(ctx.req, ctx.res));
  router.post('/api/recursos', (ctx) => deps.handlePostRecurso(ctx.body, ctx.res));
  router.put('/api/recursos/:id', (ctx) => deps.handlePutRecurso(ctx.params[0], ctx.body, ctx.res));
  router.delete('/api/recursos/:id', (ctx) => deps.handleDeleteRecurso(ctx.params[0], ctx.res));
  router.post('/api/recursos/:id/folgas', (ctx) =>
    deps.handleAddFolga(ctx.params[0], ctx.body, ctx.res)
  );
  router.delete('/api/recursos/:id/folgas/:folgaId', (ctx) =>
    deps.handleDeleteFolga(ctx.params[0], ctx.params[1], ctx.res)
  );
  router.post('/api/recursos/:id/folgas/:folgaId/passagem', (ctx) =>
    deps.handleComprarPassagem(ctx.params[0], ctx.params[1], ctx.body, ctx.res)
  );

  // ── Documentos (de colaboradores) ──
  router.get('/api/documentos/status', (ctx) => deps.handleGetDocumentosStatus(ctx.res));
  router.post('/api/recursos/:id/documentos', (ctx) =>
    deps.handleAddDocumento(ctx.params[0], ctx.body, ctx.res)
  );
  router.put('/api/recursos/:id/documentos/:docId', (ctx) =>
    deps.handlePutDocumento(ctx.params[0], ctx.params[1], ctx.body, ctx.res)
  );
  router.delete('/api/recursos/:id/documentos/:docId', (ctx) =>
    deps.handleDeleteDocumento(ctx.params[0], ctx.params[1], ctx.res)
  );
  router.post('/api/recursos/:id/documentos/:docId/arquivo', (ctx) =>
    deps.handlePostRecursoDocArquivo(ctx.params[0], ctx.params[1], ctx.req, ctx.res)
  );
  router.get('/api/recursos/:id/documentos/:docId/arquivo', (ctx) =>
    deps.handleGetRecursoDocArquivo(ctx.params[0], ctx.params[1], ctx.res)
  );
  router.delete('/api/recursos/:id/documentos/:docId/arquivo', (ctx) =>
    deps.handleDeleteRecursoDocArquivo(ctx.params[0], ctx.params[1], ctx.res)
  );
  router.post('/api/recursos/:id/documentos/:docId/validar', (ctx) =>
    deps.handleValidarDocumento(ctx.params[0], ctx.params[1], ctx.res)
  );

  // ── Estoque ──
  router.get('/api/estoque/itens', (ctx) => deps.handleListItensEstoque(ctx.res));
  router.post('/api/estoque/itens', (ctx) => deps.handlePostItemEstoque(ctx.body, ctx.res));
  router.put('/api/estoque/itens/:id', (ctx) =>
    deps.handlePutItemEstoque(ctx.params[0], ctx.body, ctx.res)
  );
  router.delete('/api/estoque/itens/:id', (ctx) =>
    deps.handleDeleteItemEstoque(ctx.params[0], ctx.res)
  );
  router.get('/api/estoque/almoxarifados', (ctx) => deps.handleListAlmoxarifados(ctx.res));
  router.post('/api/estoque/almoxarifados', (ctx) =>
    deps.handlePostAlmoxarifado(ctx.body, ctx.res)
  );
  router.put('/api/estoque/almoxarifados/:id', (ctx) =>
    deps.handlePutAlmoxarifado(ctx.params[0], ctx.body, ctx.res)
  );
  router.delete('/api/estoque/almoxarifados/:id', (ctx) =>
    deps.handleDeleteAlmoxarifado(ctx.params[0], ctx.res)
  );
  router.get('/api/estoque/movimentacoes', (ctx) =>
    deps.handleListMovimentacoes(ctx.parsedUrl.query, ctx.res)
  );
  router.post('/api/estoque/movimentacoes', (ctx) =>
    deps.handlePostMovimentacao(ctx.body, ctx.res)
  );
  router.delete('/api/estoque/movimentacoes/:id', (ctx) =>
    deps.handleDeleteMovimentacao(ctx.params[0], ctx.res)
  );
  router.get('/api/estoque/saldo', (ctx) =>
    deps.handleGetSaldoEstoque(ctx.parsedUrl.query, ctx.res)
  );
  router.get('/api/estoque/visao-geral', (ctx) => deps.handleGetVisaoGeral(ctx.res));

  // ── Solicitações de compra ──
  router.get('/api/solicitacoes-compra', (ctx) =>
    deps.handleListSolicitacoesCompra(ctx.parsedUrl.query, ctx.res)
  );
  router.post('/api/solicitacoes-compra', (ctx) =>
    deps.handlePostSolicitacaoCompra(ctx.req, ctx.body, ctx.res)
  );
  router.put('/api/solicitacoes-compra/:id', (ctx) =>
    deps.handlePutSolicitacaoCompra(ctx.params[0], ctx.body, ctx.res)
  );
  router.delete('/api/solicitacoes-compra/:id', (ctx) =>
    deps.handleDeleteSolicitacaoCompra(ctx.params[0], ctx.res)
  );
  router.post('/api/solicitacoes-compra/:id/avaliar', (ctx) =>
    deps.handleAvaliarSolicitacao(ctx.req, ctx.params[0], ctx.body, ctx.res)
  );
  router.post('/api/solicitacoes-compra/:id/cancelar', (ctx) =>
    deps.handleCancelarSolicitacao(ctx.req, ctx.params[0], ctx.body, ctx.res)
  );
  router.post('/api/solicitacoes-compra/:id/aprovar', (ctx) =>
    deps.handleAprovarSolicitacao(ctx.req, ctx.params[0], ctx.body, ctx.res)
  );
  router.post('/api/solicitacoes-compra/:id/rejeitar', (ctx) =>
    deps.handleRejeitarSolicitacao(ctx.req, ctx.params[0], ctx.body, ctx.res)
  );
  router.post('/api/solicitacoes-compra/:id/comprar', (ctx) =>
    deps.handleComprarSolicitacao(ctx.req, ctx.params[0], ctx.body, ctx.res)
  );
  router.post('/api/solicitacoes-compra/:id/receber', (ctx) =>
    deps.handleReceberSolicitacao(ctx.req, ctx.params[0], ctx.body, ctx.res)
  );
  router.get('/api/cotacoes-historico', (ctx) =>
    deps.handleCotacoesHistorico(ctx.parsedUrl.query, ctx.res)
  );

  // ── Manutenção de equipamentos ──
  router.get('/api/manutencoes', (ctx) => deps.handleListManutencoes(ctx.parsedUrl.query, ctx.res));
  router.post('/api/manutencoes', (ctx) => deps.handlePostManutencao(ctx.req, ctx.body, ctx.res));
  router.put('/api/manutencoes/:id', (ctx) =>
    deps.handlePutManutencao(ctx.params[0], ctx.body, ctx.res)
  );
  router.delete('/api/manutencoes/:id', (ctx) =>
    deps.handleDeleteManutencao(ctx.params[0], ctx.res)
  );
  router.post('/api/manutencoes/:id/retorno', (ctx) =>
    deps.handleRetornoManutencao(ctx.req, ctx.params[0], ctx.body, ctx.res)
  );
  router.post('/api/manutencoes/:id/cancelar', (ctx) =>
    deps.handleCancelarManutencao(ctx.req, ctx.params[0], ctx.body, ctx.res)
  );
  router.post('/api/manutencoes/:id/avaliar', (ctx) =>
    deps.handleAvaliarManutencao(ctx.req, ctx.params[0], ctx.body, ctx.res)
  );
  router.post('/api/manutencoes/:id/aprovar', (ctx) =>
    deps.handleAprovarManutencao(ctx.req, ctx.params[0], ctx.body, ctx.res)
  );
  router.post('/api/manutencoes/:id/rejeitar', (ctx) =>
    deps.handleRejeitarManutencao(ctx.req, ctx.params[0], ctx.body, ctx.res)
  );
  // Foto da manutenção — o POST (upload multipart) é interceptado no server.js,
  // fora do router (igual ao RDO). Aqui só o DELETE.
  router.delete('/api/manutencoes/:id/fotos/:fotoId', (ctx) =>
    deps.handleDeleteManutencaoFoto(ctx.params[0], ctx.params[1], ctx.res)
  );

  // ── Frota / veículos ──
  router.get('/api/veiculos', (ctx) => deps.handleListVeiculos(ctx.res));
  router.post('/api/veiculos', (ctx) => deps.handlePostVeiculo(ctx.body, ctx.res));
  router.put('/api/veiculos/:id', (ctx) => deps.handlePutVeiculo(ctx.params[0], ctx.body, ctx.res));
  router.delete('/api/veiculos/:id', (ctx) => deps.handleDeleteVeiculo(ctx.params[0], ctx.res));
  router.put('/api/veiculos/:id/km', (ctx) =>
    deps.handlePutVeiculoKm(ctx.params[0], ctx.body, ctx.res)
  );
  router.put('/api/veiculos/:id/localizacao', (ctx) =>
    deps.handlePutVeiculoLocalizacao(ctx.params[0], ctx.body, ctx.res)
  );
  router.post('/api/veiculos/:id/planos', (ctx) =>
    deps.handlePostVeiculoPlano(ctx.params[0], ctx.body, ctx.res)
  );
  router.put('/api/veiculos/:id/planos/:planoId', (ctx) =>
    deps.handlePutVeiculoPlano(ctx.params[0], ctx.params[1], ctx.body, ctx.res)
  );
  router.delete('/api/veiculos/:id/planos/:planoId', (ctx) =>
    deps.handleDeleteVeiculoPlano(ctx.params[0], ctx.params[1], ctx.res)
  );
  router.post('/api/veiculos/:id/manutencoes', (ctx) =>
    deps.handlePostVeiculoManutencao(ctx.req, ctx.params[0], ctx.body, ctx.res)
  );
  router.put('/api/veiculos/:id/manutencoes/:manutId', (ctx) =>
    deps.handlePutVeiculoManutencao(ctx.params[0], ctx.params[1], ctx.body, ctx.res)
  );
  router.delete('/api/veiculos/:id/manutencoes/:manutId', (ctx) =>
    deps.handleDeleteVeiculoManutencao(ctx.params[0], ctx.params[1], ctx.res)
  );
  router.get('/api/veiculos/:id/abastecimentos', (ctx) =>
    deps.handleListVeiculoAbastecimentos(ctx.params[0], ctx.res)
  );
  router.post('/api/veiculos/:id/abastecimentos', (ctx) =>
    deps.handlePostVeiculoAbastecimento(ctx.params[0], ctx.body, ctx.res)
  );
  router.put('/api/veiculos/:id/abastecimentos/:abastecId', (ctx) =>
    deps.handlePutVeiculoAbastecimento(ctx.params[0], ctx.params[1], ctx.body, ctx.res)
  );
  router.delete('/api/veiculos/:id/abastecimentos/:abastecId', (ctx) =>
    deps.handleDeleteVeiculoAbastecimento(ctx.params[0], ctx.params[1], ctx.res)
  );

  // ── KPIs operacionais do dashboard (frota/compras/recrutamento/folha/estoque) ──
  router.get('/api/dashboard/cobranca', (ctx) => deps.handleDashboardCobranca(ctx.req, ctx.res));
  router.get('/api/dashboard/operacional', (ctx) => deps.handleDashboardOperacional(ctx.res));

  // ── Layouts de dashboard (por usuário) ──
  router.get('/api/dashboard/layouts', (ctx) => deps.handleListDashLayouts(ctx.req, ctx.res));
  router.post('/api/dashboard/layouts', (ctx) =>
    deps.handlePostDashLayout(ctx.req, ctx.body, ctx.res)
  );
  router.put('/api/dashboard/layouts/:id', (ctx) =>
    deps.handlePutDashLayout(ctx.req, ctx.params[0], ctx.body, ctx.res)
  );
  router.delete('/api/dashboard/layouts/:id', (ctx) =>
    deps.handleDeleteDashLayout(ctx.req, ctx.params[0], ctx.res)
  );

  // ── Templates de documento ──
  router.get('/api/doc-templates', (ctx) => deps.handleGetDocTemplates(ctx.res));
  router.post('/api/doc-templates', (ctx) => deps.handlePostDocTemplate(ctx.body, ctx.res));
  router.put('/api/doc-templates/:id', (ctx) =>
    deps.handlePutDocTemplate(ctx.params[0], ctx.body, ctx.res)
  );
  router.delete('/api/doc-templates/:id', (ctx) =>
    deps.handleDeleteDocTemplate(ctx.params[0], ctx.res)
  );
};
