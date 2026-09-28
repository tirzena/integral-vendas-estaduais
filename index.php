<?php
declare(strict_types=1);
require __DIR__.'/common.php'; csrfSession(); $auth=actor(); if (!$auth) { require __DIR__.'/login.php'; exit; } $person=$auth['person']; $grants=$auth['grants'];
$allowed=array_values(array_unique(array_column($grants,'territory_uf'))); $notice=($auth['supabase_admin']??false)?'Acesso administrativo de leitura. A integração dos registros operacionais ainda está em andamento.':'';
if ($_SERVER['REQUEST_METHOD']==='POST') {
 if ($auth['supabase_admin']??false) { http_response_code(403); exit('Edição indisponível até a integração dos registros operacionais.'); }
 csrfCheck(); $action=(string)($_POST['action']??'');
 if ($action==='create') {
  $uf=strtoupper(trim((string)($_POST['uf']??''))); $title=trim((string)($_POST['title']??'')); $details=trim((string)($_POST['details']??''));
  if (!in_array($uf,$allowed,true)||!preg_match('/^[A-Z]{2}$/D',$uf)||mb_strlen($title)<3||mb_strlen($title)>200||mb_strlen($details)>5000) $notice='UF ou conteúdo inválido.';
  else { db()->beginTransaction(); try {
   $q=db()->prepare('INSERT INTO work_items(person_id,territory_uf,title,details) VALUES(?,?,?,?)'); $q->execute([(int)$person['id'],$uf,$title,$details]); $id=(int)db()->lastInsertId();
   queueEvent('work_item.created',['id'=>$id,'territory_uf'=>$uf,'title'=>$title,'person_id'=>(int)$person['id']]); db()->commit(); $notice='Registro criado.';
  } catch(Throwable $ex) { db()->rollBack(); throw $ex; } }
 } elseif ($action==='complete') {
  $id=(int)($_POST['id']??0); $in=implode(',',array_fill(0,count($allowed),'?'));
  if ($id>0&&$allowed) { db()->beginTransaction(); try {
   $q=db()->prepare("UPDATE work_items SET status='concluido' WHERE id=? AND territory_uf IN ($in) AND status='aberto'"); $q->execute(array_merge([$id],$allowed));
   if ($q->rowCount()===1) { queueEvent('work_item.updated',['id'=>$id,'status'=>'concluido','person_id'=>(int)$person['id']]); $notice='Registro concluído.'; }
   db()->commit();
  } catch(Throwable $ex) { db()->rollBack(); throw $ex; } }
 }
}
try { deliverEvents(); } catch(Throwable $ex) { error_log('Integral outbox delivery failed: '.$ex->getMessage()); }
$items=[]; if ($allowed && !($auth['supabase_admin']??false)) { $in=implode(',',array_fill(0,count($allowed),'?')); $q=db()->prepare("SELECT id,territory_uf,title,details,status,created_at FROM work_items WHERE territory_uf IN ($in) ORDER BY id DESC LIMIT 100"); $q->execute($allowed); $items=$q->fetchAll(); }
$names=['lideranca_regional'=>'Liderança Regional','vendas_estaduais'=>'Vendas Estaduais','fornecedores'=>'Fornecedores','transportes'=>'Transporte','estoques'=>'Estoque','distribuidores_municipais'=>'Distribuidores Municipais'];
$links=['lideranca_regional'=>'regional','vendas_estaduais'=>'estadual','fornecedores'=>'fornecedor','transportes'=>'transporte','estoques'=>'estoque','distribuidores_municipais'=>'municipal'];
$name=$names[$cfg['system_code']];
$openCount=count(array_filter($items,static fn($item)=>$item['status']==='aberto'));
$doneCount=count(array_filter($items,static fn($item)=>$item['status']==='concluido'));
$readOnly=(bool)($auth['supabase_admin']??false);
header('Content-Type: text/html; charset=utf-8'); header('Cache-Control: no-store');
?><!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title><?=e($name)?> · Sistema Integral</title><link rel="stylesheet" href="style.css">
</head>
<body class="app-shell">
<aside class="sidebar" aria-label="Menu principal">
  <a class="brand" href="#visao-geral"><strong>sistema<span>integral</span></strong><small>DISTRIBUIÇÃO NACIONAL</small></a>
  <p class="nav-caption">PAINEL <?=e(mb_strtoupper($name))?></p>
  <nav class="side-nav">
    <a href="#visao-geral" class="active">▦ <span>Visão geral</span></a>
    <a href="#registros">▤ <span>Registros</span></a>
    <?php if(!$readOnly): ?><a href="#novo-registro">＋ <span>Novo registro</span></a><?php endif ?>
  </nav>
  <p class="nav-caption">MINHAS ÁREAS</p>
  <nav class="side-nav" aria-label="Áreas autorizadas">
    <?php foreach(($auth['areas']??[]) as $area): ?>
      <?php if($area==='direcao_geral'): ?><a href="<?=e($auth['direction_url'])?>">⌂ <span>Direção Geral</span></a>
      <?php elseif(isset($links[$area])): ?><a href="https://<?=e($links[$area])?>.qrcodevalidacao.com/">↗ <span><?=e($names[$area])?></span></a><?php endif ?>
    <?php endforeach ?>
  </nav>
  <form method="post" action="/logout.php" class="logout"><input type="hidden" name="_csrf" value="<?=e($_SESSION['csrf'])?>"><button type="submit">Sair da conta</button></form>
</aside>
<div class="workspace">
  <header class="topbar"><span class="mobile-brand">sistemaintegral</span><span class="topbar-title"><?=e($name)?></span><span class="user-chip"><?=e($person['full_name'])?></span></header>
  <main>
    <section id="visao-geral" class="overview">
      <p class="eyebrow">PAINEL OPERACIONAL</p>
      <h1><?=e($name)?></h1>
      <p class="subtitle">Acompanhe os registros e acesse suas áreas autorizadas.</p>
      <?php if($readOnly): ?><p class="notice">Acesso de leitura. Os registros operacionais desta divisão ainda estão sendo integrados à Direção Geral.</p><?php elseif($notice!==''): ?><p class="notice"><?=e($notice)?></p><?php endif ?>
      <div class="metrics">
        <article class="metric"><span>Registros visíveis</span><strong><?=count($items)?></strong><small><?= $readOnly ? 'Integração em andamento' : 'Até 100 registros recentes' ?></small></article>
        <article class="metric"><span>Em aberto</span><strong><?=$openCount?></strong><small>Aguardando conclusão</small></article>
        <article class="metric"><span>Concluídos</span><strong><?=$doneCount?></strong><small><?= $readOnly ? 'Integração em andamento' : 'Nos registros exibidos' ?></small></article>
        <article class="metric"><span>Estados autorizados</span><strong><?=count($allowed)?></strong><small><?= !empty($auth['own_records_only']) ? 'Somente registros próprios' : e(implode(', ',array_slice($allowed,0,5))) ?></small></article>
      </div>
    </section>
    <section id="registros" class="panel"><div class="panel-heading"><div><p class="eyebrow">ATIVIDADE</p><h2>Registros do território</h2></div><span class="counter"><?=count($items)?> exibidos</span></div>
      <?php if(!$items): ?><div class="empty"><strong>Nenhum registro disponível</strong><p><?= $readOnly ? 'Os dados da Direção Geral ainda estão sendo integrados a este painel.' : 'Quando houver registros desta divisão e território, eles aparecerão aqui.' ?></p></div>
      <?php else: ?><div class="table-wrap"><table><thead><tr><th>ID</th><th>UF</th><th>Registro</th><th>Situação</th><th>Ação</th></tr></thead><tbody>
      <?php foreach($items as $item): ?><tr><td>#<?=e((string)$item['id'])?></td><td><?=e($item['territory_uf'])?></td><td><strong><?=e($item['title'])?></strong><br><small><?=e($item['details'])?></small></td><td><span class="status"><?=e($item['status'])?></span></td><td><?php if($item['status']==='aberto'&&!$readOnly): ?><form method="post" class="row-action"><input type="hidden" name="_csrf" value="<?=e($_SESSION['csrf'])?>"><input type="hidden" name="id" value="<?=e((string)$item['id'])?>"><button name="action" value="complete">Concluir</button></form><?php endif ?></td></tr><?php endforeach ?>
      </tbody></table></div><?php endif ?>
    </section>
    <?php if(!$readOnly): ?><section id="novo-registro" class="panel"><div class="panel-heading"><div><p class="eyebrow">OPERAÇÃO</p><h2>Novo registro de trabalho</h2></div></div><p class="muted">Registre uma atividade desta divisão. As rotinas específicas serão integradas por módulo.</p>
      <form method="post" class="entry-form"><input type="hidden" name="_csrf" value="<?=e($_SESSION['csrf'])?>"><label>Estado<select name="uf" required><?php foreach($allowed as $uf): ?><option value="<?=e($uf)?>"><?=e($uf)?></option><?php endforeach ?></select></label><label>Título<input name="title" minlength="3" maxlength="200" required></label><label class="wide">Detalhes<textarea name="details" maxlength="5000"></textarea></label><button name="action" value="create">Salvar registro</button></form>
    </section><?php endif ?>
  </main>
</div>
</body></html>
