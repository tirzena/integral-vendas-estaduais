<?php
declare(strict_types=1);
const INTEGRAL_SYSTEM = 'vendas_estaduais';
const INTEGRAL_SECRET_FILE = 'estadual.php';
const INTEGRAL_HOST = 'estadual.qrcodevalidacao.com';
const INTEGRAL_LABEL = 'Vendas Estaduais';
$secretPath=dirname(__DIR__).'/integral-secrets/'.INTEGRAL_SECRET_FILE;
$isInstalled=is_file($secretPath);
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if ($isInstalled) { http_response_code(404); exit('Página não encontrada.'); }
if (strtolower((string)($_SERVER['HTTP_HOST']??''))!==INTEGRAL_HOST || empty($_SERVER['HTTPS']) || $_SERVER['HTTPS']==='off') {
 http_response_code(403); exit('Endereço inválido ou HTTPS ausente.');
}
function centralInstall(string $action,array $data): bool {
 $ch=curl_init('https://teste.qrcodevalidacao.com/api.php?action='.$action);
 curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>json_encode($data,JSON_THROW_ON_ERROR),CURLOPT_HTTPHEADER=>['Content-Type: application/json'],CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>8,CURLOPT_FOLLOWLOCATION=>false]);
 $response=curl_exec($ch); $status=curl_getinfo($ch,CURLINFO_RESPONSE_CODE); curl_close($ch);
 return $status===200 && is_array(json_decode((string)$response,true)) && (json_decode((string)$response,true)['ok']??false)===true;
}
session_name('integral_install_csrf');
session_set_cookie_params(['secure'=>true,'httponly'=>true,'samesite'=>'Strict','path'=>'/']);
session_start(); $_SESSION['csrf']??=bin2hex(random_bytes(32));
$error=''; $success=false;
if ($_SERVER['REQUEST_METHOD']==='POST') {
 if (($_SERVER['HTTP_ORIGIN']??'')!=='https://'.INTEGRAL_HOST || !is_string($_POST['_csrf']??null) || !hash_equals($_SESSION['csrf'],$_POST['_csrf'])) { http_response_code(403); exit('Formulário expirado ou origem inválida.'); }
 $dbName=trim((string)($_POST['db_name']??'')); $dbUser=trim((string)($_POST['db_user']??'')); $dbPassword=(string)($_POST['db_password']??'');
 $siteKey=trim((string)($_POST['turnstile_site_key']??'')); $turnstileSecret=trim((string)($_POST['turnstile_secret']??''));
 if (!preg_match('/^[a-zA-Z0-9_]{1,64}$/D',$dbName)||!preg_match('/^[a-zA-Z0-9_]{1,64}$/D',$dbUser)||$dbPassword==='' || (INTEGRAL_SYSTEM==='captacao' && ($siteKey==='' || $turnstileSecret===''))) $error='Preencha as credenciais completas do banco'.(INTEGRAL_SYSTEM==='captacao'?' e as chaves Turnstile.':'.');
 else {
  try {
   $dsn='mysql:host=localhost;dbname='.$dbName.';charset=utf8mb4';
   $pdo=new PDO($dsn,$dbUser,$dbPassword,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);
   $required=INTEGRAL_SYSTEM==='captacao'?['leads','outbox','intake_attempts']:['work_items','outbox'];
   $q=$pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('.implode(',',array_fill(0,count($required),'?')).')');
   $q->execute($required); $existing=(int)$q->fetchColumn();
   if ($existing>0 && $existing<count($required)) throw new RuntimeException('O banco tem apenas parte das tabelas esperadas. Confira se selecionou o banco correto.');
   if ($existing===0) {
    $schema=file_get_contents(__DIR__.'/schema.sql');
    if (!is_string($schema)||$schema==='') throw new RuntimeException('Arquivo schema.sql indisponível.');
    foreach (explode(';',$schema) as $sql) if (trim($sql)!=='') $pdo->exec($sql);
   }
   $key=bin2hex(random_bytes(32));
   $config=['db'=>['dsn'=>$dsn,'user'=>$dbUser,'password'=>$dbPassword], 'central_api'=>'https://teste.qrcodevalidacao.com/api.php','service_key'=>$key];
   if (INTEGRAL_SYSTEM==='captacao') { $config['turnstile_site_key']=$siteKey; $config['turnstile_secret']=$turnstileSecret; $config['public_origin']='https://'.INTEGRAL_HOST; }
   else $config['system_code']=INTEGRAL_SYSTEM;
   $dir=dirname($secretPath);
   if (!is_dir($dir)&&!mkdir($dir,0700,true)) throw new RuntimeException('Não foi possível criar integral-secrets acima de public_html.');
   if (is_file($secretPath)) throw new RuntimeException('A configuração deste site já existe.');
   $tmp=$dir.'/install-'.bin2hex(random_bytes(12)).'.tmp';
   $contents="<?php\nreturn ".var_export($config,true).";\n";
   if (file_put_contents($tmp,$contents,LOCK_EX)===false) throw new RuntimeException('Sem permissão para escrever a configuração privada.');
   chmod($tmp,0600);
   if (!rename($tmp,$secretPath)) throw new RuntimeException('Não foi possível concluir a configuração privada.');
   if (!centralInstall('install_register',['system'=>INTEGRAL_SYSTEM,'key'=>$key])) {
    if (!unlink($secretPath)) throw new RuntimeException('A comunicação com a Direção falhou. Remova a configuração criada em integral-secrets antes de tentar novamente.');
    throw new RuntimeException('A Direção Geral não conseguiu validar este domínio. Confira a implantação de install-proof.php e tente novamente.');
   }
   $success=true;
  } catch (Throwable $ex) { $error=$ex instanceof PDOException?'Banco inacessível ou estrutura inválida. Confira nome, usuário e senha.':$ex->getMessage(); }
  finally { if (isset($tmp)&&is_file($tmp)) unlink($tmp); }
 }
}
function h(string $s): string { return htmlspecialchars($s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8'); }
header('Content-Type: text/html; charset=utf-8');
?><!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Instalar · Sistema Integral</title><style>body{font:16px system-ui;background:#f7f6fb;color:#19172a;margin:0}main{max-width:480px;margin:7vh auto;padding:28px;background:#fff;border-radius:18px;box-shadow:0 12px 40px #15112b13}label{display:block;margin:16px 0;font-weight:600}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #bcb8ce;border-radius:8px;margin-top:6px}button{padding:13px 22px;background:#5e35e9;color:white;border:0;border-radius:8px;cursor:pointer}.error{color:#a51635}</style><main><?php if($success): ?><h1>Instalação concluída</h1><p>As tabelas e a comunicação com a Direção Geral foram configuradas.</p><a href="/">Abrir área</a><?php else: ?><h1>Instalar <?=h(INTEGRAL_LABEL)?></h1><p>Informe os dados do banco MySQL deste site. A senha será salva somente fora de public_html.</p><?php if($error!==''): ?><p class="error" role="alert"><?=h($error)?></p><?php endif ?><form method="post"><input type="hidden" name="_csrf" value="<?=h($_SESSION['csrf'])?>"><label>Nome completo do banco<input name="db_name" required autocomplete="off" placeholder="u123456789_regional"></label><label>Usuário completo do banco<input name="db_user" required autocomplete="off" placeholder="u123456789_regional"></label><label>Senha do banco<input name="db_password" type="password" required autocomplete="new-password"></label><?php if(INTEGRAL_SYSTEM==='captacao'): ?><label>Chave pública Turnstile<input name="turnstile_site_key" required></label><label>Chave secreta Turnstile<input name="turnstile_secret" type="password" required></label><?php endif ?><button type="submit">Instalar <?=h(INTEGRAL_LABEL)?></button></form><?php endif ?></main></html>
