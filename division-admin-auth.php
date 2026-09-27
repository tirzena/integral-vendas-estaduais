<?php
declare(strict_types=1);
/** Same Supabase identity as Direção Geral. The publishable key is public; no service key is used here. */
const INTEGRAL_AUTH_URL = 'https://wyutdvttldxkaqqysiuv.supabase.co';
const INTEGRAL_PUBLISHABLE_KEY = 'sb_publishable_92wwNBdwonXuzbKoLL1XEA_nDrjHAyn';
const INTEGRAL_UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
function divisionAuthRequest(string $path, ?array $body = null, string $accessToken = ''): array {
 $ch=curl_init(INTEGRAL_AUTH_URL.$path);
 $headers=['apikey: '.INTEGRAL_PUBLISHABLE_KEY,'Accept: application/json'];
 if ($accessToken!=='') $headers[]='Authorization: Bearer '.$accessToken;
 if ($body!==null) { $headers[]='Content-Type: application/json'; curl_setopt($ch,CURLOPT_POST,true); curl_setopt($ch,CURLOPT_POSTFIELDS,json_encode($body,JSON_THROW_ON_ERROR)); }
 curl_setopt_array($ch,[CURLOPT_HTTPHEADER=>$headers,CURLOPT_TIMEOUT=>8,CURLOPT_RETURNTRANSFER=>true,CURLOPT_FOLLOWLOCATION=>false]);
 $raw=curl_exec($ch); $status=curl_getinfo($ch,CURLINFO_RESPONSE_CODE); curl_close($ch);
 $value=is_string($raw)?json_decode($raw,true):null;
 return ['status'=>$status,'data'=>is_array($value)?$value:$value];
}
function divisionAdminIdentity(string $token): ?array {
 if ($token===''||strlen($token)>8192) return null;
 $user=divisionAuthRequest('/auth/v1/user',null,$token);
 $id=$user['data']['id']??null;
 if ($user['status']!==200||!is_string($id)||!preg_match('/^[a-f0-9-]{36}$/D',$id)) return null;
 $roles=divisionAuthRequest('/rest/v1/user_roles?select=role&user_id=eq.'.$id,null,$token);
 if ($roles['status']!==200||!is_array($roles['data'])||!array_filter($roles['data'],static fn($r)=>is_array($r)&&in_array($r['role']??'', ['admin','superadmin'],true))) return null;
 $profiles=divisionAuthRequest('/rest/v1/profiles?select=full_name,is_active&id=eq.'.$id.'&limit=1',null,$token);
 if ($profiles['status']!==200||!is_array($profiles['data'])||($profiles['data'][0]['is_active']??false)!==true) return null;
 global $cfg;
 $permission=divisionAuthRequest('/rest/v1/rpc/integral_can_access',[
  'p_system_code'=>(string)$cfg['system_code'],'p_state'=>null,'p_municipality_ibge_id'=>null,'p_product_id'=>null,'p_write'=>false
 ],$token);
 if ($permission['status']!==200||$permission['data']!==true) return null;
 return ['person'=>['id'=>0,'full_name'=>(string)($profiles['data'][0]['full_name']??$user['data']['email']??'Admin')],
  'grants'=>array_map(static fn($uf)=>['territory_uf'=>$uf],INTEGRAL_UFS),
  'areas'=>['lideranca_regional','vendas_estaduais','fornecedores','transportes','estoques','distribuidores_municipais','direcao_geral'],
  'direction_url'=>'https://login.qrcodevalidacao.com/','supabase_admin'=>true];
}
function divisionSetAdminCookies(array $tokens): void {
 $access=(string)($tokens['access_token']??''); $refresh=(string)($tokens['refresh_token']??'');
 if ($access===''||$refresh==='') return;
 $options=['path'=>'/','domain'=>'.qrcodevalidacao.com','secure'=>true,'httponly'=>true,'samesite'=>'Lax'];
 setcookie('integral_admin_access',$access,$options+['expires'=>time()+max(60,(int)($tokens['expires_in']??3600))]);
 setcookie('integral_admin_refresh',$refresh,$options+['expires'=>time()+2592000]);
 $_COOKIE['integral_admin_access']=$access; $_COOKIE['integral_admin_refresh']=$refresh;
}
function divisionAdminLogin(string $email,string $password): bool {
 $result=divisionAuthRequest('/auth/v1/token?grant_type=password',['email'=>$email,'password'=>$password]);
 if ($result['status']!==200||!is_array($result['data'])||!is_string($result['data']['access_token']??null)) return false;
 if (!divisionAdminIdentity($result['data']['access_token'])) return false;
 divisionSetAdminCookies($result['data']); return true;
}
function divisionAdminActor(): ?array {
 $token=(string)($_COOKIE['integral_admin_access']??'');
 $auth=divisionAdminIdentity($token); if ($auth) return $auth;
 $refresh=(string)($_COOKIE['integral_admin_refresh']??'');
 if ($refresh===''||strlen($refresh)>8192) return null;
 $result=divisionAuthRequest('/auth/v1/token?grant_type=refresh_token',['refresh_token'=>$refresh]);
 if ($result['status']!==200||!is_array($result['data'])||!is_string($result['data']['access_token']??null)) return null;
 $auth=divisionAdminIdentity($result['data']['access_token']);
 if (!$auth) return null;
 divisionSetAdminCookies($result['data']); return $auth;
}
