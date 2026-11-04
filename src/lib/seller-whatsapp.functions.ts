/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { invokeEvolution, newWhatsappInstanceName } from "@/lib/supabase-evolution.server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sellerDatabase(context: any) {
  const { data, error } = await context.supabase.from("user_roles")
    .select("role").eq("user_id",context.userId).eq("role","vendedor").limit(1);
  if (error || !data?.length) throw new Error("Somente vendedores podem vincular um WhatsApp pessoal.");
  const {supabaseAdmin} = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export const mySellerWhatsapp = createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context}) => {
    const db=await sellerDatabase(context);
    const {data,error}=await db.from("whatsapp_accounts")
      .select("id,display_name,phone_e164,connection_status,created_at")
      .eq("created_by",context.userId).is("deleted_at",null).order("created_at",{ascending:false}).limit(1);
    if(error) throw error;
    return data?.[0] ?? null;
  });

export const connectSellerWhatsapp = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .validator((input:{productId:string;audience:"atacado"|"varejo"})=>{
    if(!uuid.test(input?.productId ?? "")) throw new Error("Selecione uma categoria válida.");
    if(!["atacado","varejo"].includes(input?.audience)) throw new Error("Informe Atacado ou Varejo.");
    return input;
  })
  .handler(async ({context,data})=>{
    const db=await sellerDatabase(context);
    const {data:granted,error:grantedError}=await context.supabase.rpc("has_product_access",{
      _user_id:context.userId,_product_id:data.productId,
    });
    if(grantedError || !granted) throw new Error("Categoria não autorizada para este vendedor.");
    const {data:existing,error:existingError}=await db.from("whatsapp_accounts")
      .select("id").eq("created_by",context.userId).is("deleted_at",null).limit(1);
    if(existingError) throw existingError;
    if(existing?.length) throw new Error("Você já possui um WhatsApp vinculado. Use reconectar.");
    const {data:account,error}=await db.from("whatsapp_accounts").insert({
      provider:"evolution",instance_name:newWhatsappInstanceName(),
      display_name:"WhatsApp do vendedor",product_id:data.productId,product_ids:[data.productId],
      status:"pendente",connection_status:"conectando",demo_mode:false,created_by:context.userId,
    }).select("id").single();
    if(error || !account) throw new Error("Não foi possível criar a conexão.");
    try{
      const {error:audienceError}=await db.from("crm_channel_segments").upsert({
        channel:"whatsapp",account_id:account.id,audience:data.audience,updated_by:context.userId,
      },{onConflict:"channel,account_id"});
      if(audienceError) throw audienceError;
      const qr=await invokeEvolution(context,"create",{accountId:account.id});
      await db.from("whatsapp_accounts").update({connection_status:qr.qrBase64?"aguardando_qr":"conectando"}).eq("id",account.id);
      return {accountId:account.id,qrBase64:qr.qrBase64 ?? null};
    }catch(e){
      await db.from("whatsapp_accounts").update({deleted_at:new Date().toISOString(),connection_status:"erro"}).eq("id",account.id);
      throw e;
    }
  });

export const refreshSellerWhatsapp = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .validator((input:{accountId:string})=>{
    if(!uuid.test(input?.accountId??"")) throw new Error("Conta inválida.");
    return input;
  })
  .handler(async ({context,data})=>{
    const db=await sellerDatabase(context);
    const {data:owned}=await db.from("whatsapp_accounts").select("id")
      .eq("id",data.accountId).eq("created_by",context.userId).is("deleted_at",null).maybeSingle();
    if(!owned) throw new Error("WhatsApp não pertence a este vendedor.");
    const check=await invokeEvolution(context,"check",{accountId:data.accountId});
    if(check.status==="conectado" || check.connected) {
      await db.from("whatsapp_accounts").update({connection_status:"conectado",status:"conectado",connected_at:new Date().toISOString()}).eq("id",data.accountId);
      return {connected:true,qrBase64:null};
    }
    const qr=await invokeEvolution(context,"qr",{accountId:data.accountId});
    return {connected:!!qr.connected,qrBase64:qr.qrBase64 ?? null};
  });
