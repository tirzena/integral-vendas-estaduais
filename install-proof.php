<?php
declare(strict_types=1);
const INTEGRAL_SYSTEM = 'vendas_estaduais';
const INTEGRAL_SECRET_FILE = 'estadual.php';
const INTEGRAL_HOST = 'estadual.qrcodevalidacao.com';
const INTEGRAL_LABEL = 'Vendas Estaduais';
header('Cache-Control: no-store');
header('Content-Type: text/plain; charset=utf-8');
if ($_SERVER['REQUEST_METHOD']!=='GET' || strtolower((string)($_SERVER['HTTP_HOST']??''))!==INTEGRAL_HOST || empty($_SERVER['HTTPS']) || $_SERVER['HTTPS']==='off') { http_response_code(404); exit; }
$nonce=(string)($_GET['nonce']??'');
$secret=dirname(__DIR__).'/integral-secrets/'.INTEGRAL_SECRET_FILE;
if (!preg_match('/^[a-f0-9]{64}$/D',$nonce)||!is_file($secret)) { http_response_code(404); exit; }
$cfg=require $secret;
$key=(string)($cfg['service_key']??'');
if (!preg_match('/^[a-f0-9]{64}$/D',$key)||($cfg['system_code']??INTEGRAL_SYSTEM)!==INTEGRAL_SYSTEM) { http_response_code(404); exit; }
echo hash_hmac('sha256',$nonce,$key);
