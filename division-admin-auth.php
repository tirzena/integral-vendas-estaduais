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
 $profiles=divisionAuthRequest('/rest/v1/profiles?select=full_name,is_active&id=eq.'.$id.'&limit=1',null,$token);
 if ($profiles['status']!==200||!is_array($profiles['data'])||($profiles['data'][0]['is_active']??false)!==true) return null;
 $roles=divisionAuthRequest('/rest/v1/user_roles?select=role&user_id=eq.'.$id,null,$token);
 $admin=$roles['status']===200&&is_array($roles['data'])&&array_filter($roles['data'],static fn($r)=>is_array($r)&&in_array($r['role']??'',['admin','superadmin'],true));
 $access=divisionAuthRequest('/rest/v1/integral_division_access?select=system_code,territory_uf,region_code,can_view,can_write,own_records_only&user_id=eq.'.$id,null,$token);
 if ($access['status']!==200||!is_array($access['data'])) return null;
 global $cfg;
 $system=(string)$cfg['system_code'];
 $connection=divisionAuthRequest('/rest/v1/rpc/integral_is_system_active',['p_code'=>$system],$token);
 if ($connection['status']!==200||$connection['data']!==true) return null;
 $myGrants=array_values(array_filter($access['data'],static fn($row)=>is_array($row)&&($row['system_code']??'')===$system&&(($row['can_view']??false)===true||($row['can_write']??false)===true)));
 if (!$admin&&!$myGrants) return null;
 $areas=$admin?['lideranca_regional','vendas_estaduais','fornecedores','transportes','estoques','distribuidores_municipais']:[];
 foreach($access['data'] as $row) if(is_array($row)&&(($row['can_view']??false)===true||($row['can_write']??false)===true)&&in_array($row['system_code']??'', ['lideranca_regional','vendas_estaduais','fornecedores','transportes','estoques','distribuidores_municipais'],true)) $areas[]=$row['system_code'];
 $regions=['norte'=>['AC','AP','AM','PA','RO','RR','TO'],'nordeste'=>['AL','BA','CE','MA','PB','PE','PI','RN','SE'],'centro_oeste'=>['DF','GO','MT','MS'],'sudeste'=>['ES','MG','RJ','SP'],'sul'=>['PR','RS','SC']];
 $ufs=[];
 if($admin) $ufs=INTEGRAL_UFS;
 else foreach($myGrants as $grant) {
  $state=strtoupper((string)($grant['territory_uf']??''));
  if($state!==''&&in_array($state,INTEGRAL_UFS,true)) $ufs[]=$state;
  elseif($grant['region_code']!==null) $ufs=array_merge($ufs,$regions[(string)$grant['region_code']]??[]);
  else $ufs=array_merge($ufs,INTEGRAL_UFS);
 }
 $ufs=array_values(array_unique($ufs));
 return ['person'=>['id'=>0,'full_name'=>(string)($profiles['data'][0]['full_name']??$user['data']['email']??'Membro')],
  'grants'=>array_map(static fn($uf)=>['territory_uf'=>$uf],$ufs),
  'areas'=>array_values(array_unique(array_merge($areas,['direcao_geral']))),
  'direction_url'=>'https://login.qrcodevalidacao.com/','supabase_admin'=>true,
  'own_records_only'=>!$admin&&$myGrants&&count(array_filter($myGrants,static fn($g)=>($g['own_records_only']??false)===true))===count($myGrants)];
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
 divisionSetAdminCookies($result['data']);
 global $cfg;
 $heartbeat=divisionAuthRequest('/rest/v1/rpc/integral_mark_identity_connected',['p_system_code'=>(string)$cfg['system_code']],$result['data']['access_token']);
 if ($heartbeat['status']!==200 && $heartbeat['status']!==204) error_log('Integral identity heartbeat failed for '.$cfg['system_code'].': '.$heartbeat['status']);
 $connectionToken=getenv('INTEGRAL_CONNECTION_TOKEN');
 if (is_string($connectionToken)&&$connectionToken!=='') {
  $ping=divisionAuthRequest('/rest/v1/rpc/integral_connection_ping',['p_code'=>(string)$cfg['system_code'],'p_token'=>$connectionToken],$result['data']['access_token']);
  if ($ping['status']!==200||$ping['data']!==true) error_log('Integral API connection verification failed for '.$cfg['system_code']);
 }
 return true;
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
