<?php
declare(strict_types=1);
require __DIR__.'/common.php'; csrfSession(); $auth=actor(); if (!$auth) { require __DIR__.'/login.php'; exit; } $person=$auth['person']; $grants=$auth['grants'];
$allowed=array_values(array_unique(array_column($grants,'territory_uf'))); $notice='';
if ($_SERVER['REQUEST_METHOD']==='POST') {
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
$items=[]; if ($allowed) { $in=implode(',',array_fill(0,count($allowed),'?')); $q=db()->prepare("SELECT id,territory_uf,title,details,status,created_at FROM work_items WHERE territory_uf IN ($in) ORDER BY id DESC LIMIT 100"); $q->execute($allowed); $items=$q->fetchAll(); }
$names=['lideranca_regional'=>'Liderança Regional','vendas_estaduais'=>'Vendas Estaduais','fornecedores'=>'Fornecedores','transportes'=>'Transporte','estoques'=>'Estoque','distribuidores_municipais'=>'Distribuidores Municipais'];
$name=$names[$cfg['system_code']]; header('Content-Type: text/html; charset=utf-8'); header('Cache-Control: no-store');
?><!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title><?=e($name)?> · Sistema Integral</title><link rel="stylesheet" href="style.css"><header><strong>Sistema Integral · <?=e($name)?></strong></header><main><nav aria-label="Minhas áreas"><?php $links=['lideranca_regional'=>'regional','vendas_estaduais'=>'estadual','fornecedores'=>'fornecedor','transportes'=>'transporte','estoques'=>'estoque','distribuidores_municipais'=>'municipal']; foreach(($auth['areas']??[]) as $area): if($area==='direcao_geral'): ?><a href="<?=e($auth['direction_url'])?>">Direção Geral</a> · <?php elseif(isset($links[$area])): ?><a href="https://<?=e($links[$area])?>.qrcodevalidacao.com/"><?=e($names[$area])?></a> · <?php endif; endforeach ?></nav><h1><?=e($name)?></h1><p><?=e($person['full_name'])?> · Territórios autorizados: <?=e(implode(', ',$allowed))?></p><p><?=e($notice)?></p><section><h2>Novo registro de trabalho</h2><p>Este fluxo inicial registra operações da divisão. As rotinas específicas do OS serão migradas separadamente.</p><form method="post"><input type="hidden" name="_csrf" value="<?=e($_SESSION['csrf'])?>"><label>Estado<select name="uf" required><?php foreach($allowed as $uf): ?><option value="<?=e($uf)?>"><?=e($uf)?></option><?php endforeach ?></select></label><label>Título<input name="title" minlength="3" maxlength="200" required></label><label>Detalhes<textarea name="details" maxlength="5000"></textarea></label><button name="action" value="create">Salvar</button></form></section><section><h2>Registros do território</h2><table><tr><th>ID</th><th>UF</th><th>Registro</th><th>Situação</th><th>Ação</th></tr><?php foreach($items as $item): ?><tr><td><?=e((string)$item['id'])?></td><td><?=e($item['territory_uf'])?></td><td><?=e($item['title'])?><br><small><?=e($item['details'])?></small></td><td><?=e($item['status'])?></td><td><?php if($item['status']==='aberto'): ?><form method="post"><input type="hidden" name="_csrf" value="<?=e($_SESSION['csrf'])?>"><input type="hidden" name="id" value="<?=e((string)$item['id'])?>"><button name="action" value="complete">Concluir</button></form><?php endif ?></td></tr><?php endforeach ?></table></section></main></html>
