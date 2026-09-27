<?php
declare(strict_types=1);
require __DIR__.'/common.php';
csrfSession();
if ($_SERVER['REQUEST_METHOD']!=='POST') { http_response_code(405); exit; }
csrfCheck();
$token=(string)($_COOKIE['integral_admin_access']??'');
if ($token!=='') divisionAuthRequest('/auth/v1/logout',[], $token);
$options=['expires'=>time()-3600,'path'=>'/','domain'=>'.qrcodevalidacao.com','secure'=>true,'httponly'=>true,'samesite'=>'Lax'];
foreach (['integral_admin_access','integral_admin_refresh','integral_sid'] as $name) setcookie($name,'',$options);
$_SESSION=[]; session_destroy();
header('Location: /',true,303);
