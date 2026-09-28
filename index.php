<?php
declare(strict_types=1);
require __DIR__.'/common.php'; csrfSession(); $auth=actor(); if (!$auth) { require __DIR__.'/login.php'; exit; } $person=$auth['person']; $grants=$auth['grants'];
$allowed=array_values(array_unique(array_column($grants,'territory_uf'))); $notice=($auth['supabase_admin']??false)?'Os pedidos abaixo vêm da Direção Geral. A edição e os demais módulos ainda estão em integração.':'';
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
$centralOrders=[]; $centralOrdersError='';
if ($readOnly) {
 $token=(string)($_COOKIE['integral_admin_access']??'');
 $result=divisionAuthRequest('/rest/v1/rpc/integral_division_orders',['p_system_code'=>'vendas_estaduais','p_limit'=>100],$token);
 if ($result['status']===200 && is_array($result['data'])) $centralOrders=$result['data'];
 else $centralOrdersError='Não foi possível consultar os pedidos da Direção Geral.';
}
$ordersPaid=count(array_filter($centralOrders,static fn($o)=>($o['payment_status']??'')==='pago'));
$ordersOpen=count($centralOrders)-$ordersPaid;
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
    <?php if($readOnly): ?><a href="#pedidos-centrais">▤ <span>Pedidos da Direção Geral</span></a><?php endif ?>
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
      <?php if($readOnly): ?><p class="notice">Pedidos em leitura na Direção Geral. Edição e demais dados ainda em integração.</p><?php elseif($notice!==''): ?><p class="notice"><?=e($notice)?></p><?php endif ?>
      <div class="metrics">
        <article class="metric"><span><?= $readOnly ? 'Pedidos centrais' : 'Registros visíveis' ?></span><strong><?= $readOnly ? count($centralOrders) : count($items) ?></strong><small><?= $readOnly ? 'Até 100 pedidos recentes' : 'Até 100 registros recentes' ?></small></article>
        <article class="metric"><span><?= $readOnly ? 'Pagamento pendente' : 'Em aberto' ?></span><strong><?= $readOnly ? $ordersOpen : $openCount ?></strong><small><?= $readOnly ? 'Nos pedidos exibidos' : 'Aguardando conclusão' ?></small></article>
        <article class="metric"><span><?= $readOnly ? 'Pagos' : 'Concluídos' ?></span><strong><?= $readOnly ? $ordersPaid : $doneCount ?></strong><small>Nos registros exibidos</small></article>
        <article class="metric"><span>Estados autorizados</span><strong><?=count($allowed)?></strong><small><?= !empty($auth['own_records_only']) ? 'Somente registros próprios' : e(implode(', ',array_slice($allowed,0,5))) ?></small></article>
      </div>
    </section>
    <?php if($readOnly): ?><section id="pedidos-centrais" class="panel"><div class="panel-heading"><div><p class="eyebrow">SUPABASE · FONTE CANÔNICA</p><h2>Pedidos da Direção Geral</h2></div><span class="counter">Leitura conforme suas permissões</span></div>
      <?php if($centralOrdersError!==''): ?><p class="error" role="alert"><?=e($centralOrdersError)?></p><?php elseif(!$centralOrders): ?><div class="empty"><strong>Sem pedidos visíveis</strong><p>Não há pedidos no seu escopo ou nenhum pedido foi registrado.</p></div><?php else: ?><div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Data</th><th>Estado</th><th>Valor</th><th>Pagamento</th><th>Etapa</th></tr></thead><tbody>
        <?php foreach($centralOrders as $order): ?><tr><td>#<?=e((string)($order['number']??''))?></td><td><?=e((string)($order['order_date']??''))?></td><td><?=e((string)($order['shipping_state']??''))?></td><td><?=e((string)($order['currency']??''))?> <?=e(number_format((float)($order['total']??0),2,',','.'))?></td><td><span class="status"><?=e((string)($order['payment_status']??''))?></span></td><td><?=e((string)($order['workflow_stage']??''))?></td></tr><?php endforeach ?>
      </tbody></table></div><?php endif ?>
    </section><?php endif ?>
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
