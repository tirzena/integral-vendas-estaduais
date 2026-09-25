<?php
declare(strict_types=1);
if (!is_file(dirname(__DIR__).'/integral-secrets/estadual.php')) { http_response_code(503); exit('Configuração indisponível'); }
$cfg=require dirname(__DIR__).'/integral-secrets/estadual.php';
$codes=['lideranca_regional','vendas_estaduais','fornecedores','transportes','estoques','distribuidores_municipais'];
if (!in_array($cfg['system_code']??'',$codes,true)||!str_starts_with((string)($cfg['central_api']??''),'https://')||strlen((string)($cfg['service_key']??''))<32||str_contains((string)$cfg['service_key'],'CHAVE_')) { http_response_code(503); exit('Configuração insegura'); }
function db(): PDO { global $cfg; static $pdo; return $pdo??=new PDO($cfg['db']['dsn'],$cfg['db']['user'],$cfg['db']['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]); }
function central(string $action,array $body): array {
 global $cfg; $url=$cfg['central_api'].'?action='.rawurlencode($action);
 $ch=curl_init($url); curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>json_encode($body,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE),CURLOPT_HTTPHEADER=>['Content-Type: application/json','X-System-Code: '.$cfg['system_code'],'X-Service-Key: '.$cfg['service_key']],CURLOPT_TIMEOUT=>6,CURLOPT_RETURNTRANSFER=>true,CURLOPT_FOLLOWLOCATION=>false]);
 $reply=curl_exec($ch); $status=curl_getinfo($ch,CURLINFO_RESPONSE_CODE); curl_close($ch);
 if (!is_string($reply)) return ['_status'=>503]; $decoded=json_decode($reply,true);
 if (!is_array($decoded)) return ['_status'=>503]; $decoded['_status']=$status; return $decoded;
}
function actor(): ?array {
 $token=(string)($_COOKIE['integral_sid']??'');
 if (!preg_match('/^[a-f0-9]{64}$/D',$token)) return null;
 $result=central('introspect',['token'=>$token]);
 if (in_array($result['_status']??0,[401,403],true)) return null;
 if (($result['_status']??0)!==200) { http_response_code(503); exit('Serviço de identidade indisponível.'); }
 return $result;
}
function centralLogin(string $email,string $password): array {
 global $cfg;
 $cookie='';
 $ch=curl_init($cfg['central_api'].'?action=login');
 curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>json_encode(['email'=>$email,'password'=>$password],JSON_THROW_ON_ERROR),CURLOPT_HTTPHEADER=>['Content-Type: application/json'],CURLOPT_TIMEOUT=>8,CURLOPT_RETURNTRANSFER=>true,CURLOPT_FOLLOWLOCATION=>false]);
 curl_setopt($ch,CURLOPT_HEADERFUNCTION,static function($ch,string $line) use (&$cookie): int {
  if (preg_match('/^Set-Cookie:\s*integral_sid=([a-f0-9]{64})(?:;|$)/i',$line,$m)) $cookie=$m[1];
  return strlen($line);
 });
 curl_exec($ch); $status=curl_getinfo($ch,CURLINFO_RESPONSE_CODE); curl_close($ch);
 return ['_status'=>$status,'token'=>$status===200?$cookie:''];
}
function e(string $value): string { return htmlspecialchars($value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8'); }
function csrfSession(): void { session_name('integral_division_csrf'); session_set_cookie_params(['secure'=>true,'httponly'=>true,'samesite'=>'Lax']); session_start(); $_SESSION['csrf']??=bin2hex(random_bytes(32)); }
function csrfCheck(): void { if (!is_string($_POST['_csrf']??null)||!hash_equals((string)($_SESSION['csrf']??''),$_POST['_csrf'])) { http_response_code(403); exit('Formulário expirado'); } }
function queueEvent(string $type,array $data): void { $q=db()->prepare('INSERT INTO outbox(id,event_type,payload) VALUES(?,?,?)'); $q->execute([bin2hex(random_bytes(16)),$type,json_encode($data,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE)]); }
function deliverEvents(): void {
 $rows=db()->query('SELECT id,event_type,payload FROM outbox WHERE delivered_at IS NULL ORDER BY created_at LIMIT 10')->fetchAll();
 foreach($rows as $row) { $result=central('event',['id'=>$row['id'],'type'=>$row['event_type'],'payload'=>json_decode($row['payload'],true)]); if (($result['_status']??0)!==200) break; $q=db()->prepare('UPDATE outbox SET delivered_at=UTC_TIMESTAMP() WHERE id=? AND delivered_at IS NULL'); $q->execute([$row['id']]); }
}
