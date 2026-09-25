<?php
declare(strict_types=1);
if (!function_exists('centralLogin')) require __DIR__.'/common.php';
if (session_status()!==PHP_SESSION_ACTIVE) csrfSession();
$names=['lideranca_regional'=>'Liderança Regional','vendas_estaduais'=>'Vendas Estaduais','fornecedores'=>'Fornecedores','transportes'=>'Transporte','estoques'=>'Estoque','distribuidores_municipais'=>'Distribuidores Municipais'];
$name=$names[$cfg['system_code']]??'Área';
$notice='';
if ($_SERVER['REQUEST_METHOD']==='POST') {
 if (($_SERVER['HTTP_ORIGIN']??'')!=='https://'.(string)($_SERVER['HTTP_HOST']??'')) { http_response_code(403); exit('Origem inválida.'); }
 csrfCheck();
 $email=strtolower(trim((string)($_POST['email']??'')));
 $password=(string)($_POST['password']??'');
 if (!filter_var($email,FILTER_VALIDATE_EMAIL)||$password===''||strlen($password)>1024) $notice='Informe e-mail e senha válidos.';
 else {
  $login=centralLogin($email,$password);
  $token=(string)$login['token'];
  if (($login['_status']??0)===200 && preg_match('/^[a-f0-9]{64}$/D',$token)) {
   $check=central('introspect',['token'=>$token]);
   if (($check['_status']??0)===200) {
    setcookie('integral_sid',$token,['expires'=>time()+28800,'path'=>'/','domain'=>'.qrcodevalidacao.com','secure'=>true,'httponly'=>true,'samesite'=>'Lax']);
    header('Location: /',true,303); exit;
   }
   $notice=($check['_status']??0)===403?'Esta conta não tem acesso a esta área.':'Não foi possível verificar sua função agora.';
  } elseif (($login['_status']??0)===429) $notice='Muitas tentativas. Aguarde alguns minutos.';
  else $notice='E-mail ou senha inválidos.';
 }
}
header('Cache-Control: no-store');
header('Content-Type: text/html; charset=utf-8');
?><!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Entrar · <?=e($name)?> · Sistema Integral</title><link rel="stylesheet" href="/style.css"><header><strong>Sistema Integral · <?=e($name)?></strong></header><main><section><h1>Entrar em <?=e($name)?></h1><p>Use a conta criada pela Direção Geral. Uma mesma conta pode ter acesso a várias áreas.</p><?php if($notice!==''): ?><p class="error" role="alert"><?=e($notice)?></p><?php endif ?><form method="post"><input type="hidden" name="_csrf" value="<?=e($_SESSION['csrf'])?>"><label>E-mail<input name="email" type="email" autocomplete="username" required></label><label>Senha<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Entrar</button></form></section></main></html>
