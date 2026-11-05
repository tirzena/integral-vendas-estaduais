import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useProductScope } from "@/hooks/useProductScope";
import { connectSellerWhatsapp, mySellerWhatsapp, refreshSellerWhatsapp, updateSellerWhatsappProducts } from "@/lib/seller-whatsapp.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function SellerWhatsappConnection() {
 const {products}=useProductScope();
 const qc=useQueryClient();
 const get=useServerFn(mySellerWhatsapp);
 const create=useServerFn(connectSellerWhatsapp);
 const refresh=useServerFn(refreshSellerWhatsapp);
 const updateProducts=useServerFn(updateSellerWhatsappProducts);
 const initialAccountId=useRef<string|null>(null);
 const [productIds,setProductIds]=useState<string[]>([]);
 const availableIds=products.filter(p=>p.is_active).map(p=>p.id);
 const allSelected=availableIds.length>0 && availableIds.every(id=>productIds.includes(id));
 const toggleProduct=(id:string,enabled:boolean)=>setProductIds(current=>enabled?[...new Set([...current,id])]:current.filter(x=>x!==id));
 useEffect(()=>setProductIds(current=>current.filter(id=>availableIds.includes(id))),[products]);
 const [audience,setAudience]=useState<"atacado"|"varejo">("atacado");
 const [qr,setQr]=useState<string|null>(null);
 const [consented,setConsented]=useState(false);
 const own=useQuery({queryKey:["seller-whatsapp-own"],queryFn:()=>get(),refetchOnWindowFocus:true});
 useEffect(()=>{
   if (own.data?.id && initialAccountId.current!==own.data.id) {
     initialAccountId.current=own.data.id;
     setProductIds(own.data.product_ids ?? []);
   }
 },[own.data?.id,own.data?.product_ids]);
 const savedProductIds:string[]=own.data?.product_ids ?? [];
 const alreadySaved=productIds.length===savedProductIds.length && productIds.every(id=>savedProductIds.includes(id));
 const connection=useMutation({
  mutationFn:async()=>create({data:{productIds,audience}}),
  onSuccess:async result=>{setQr(result.qrBase64);await qc.invalidateQueries({queryKey:["seller-whatsapp-own"]});toast.success("Conexão criada. Leia o QR Code no seu WhatsApp.");},
  onError:(e:Error)=>toast.error(e.message),
 });
 const edit=useMutation({
  mutationFn:async()=>updateProducts({data:{accountId:own.data!.id,productIds}}),
  onSuccess:async()=>{
    toast.success("Macroáreas do WhatsApp atualizadas.");
    await qc.invalidateQueries({queryKey:["seller-whatsapp-own"]});
    await qc.invalidateQueries({queryKey:["wa-accounts-inbox"]});
  },
  onError:(e:Error)=>toast.error(e.message),
 });
 const check=useMutation({
  mutationFn:async()=>refresh({data:{accountId:own.data!.id}}),
  onSuccess:async result=>{setQr(result.qrBase64);await qc.invalidateQueries({queryKey:["seller-whatsapp-own"]});if(result.connected)toast.success("WhatsApp conectado.");},
  onError:(e:Error)=>toast.error(e.message),
 });
 return <Card className="mb-5">
  <CardHeader><CardTitle>Meu WhatsApp de atendimento</CardTitle>
   <p className="text-sm text-muted-foreground">Vincule seu número para atender clientes pelo seu próprio WhatsApp. Você verá apenas suas conversas e os leads encaminhados para você. O administrador poderá supervisionar os atendimentos.</p>
  </CardHeader>
  <CardContent className="space-y-3">
   {own.data && <div className="flex flex-wrap items-center gap-3">
     <span className="text-sm">Situação: <strong>{own.data.connection_status}</strong> · {(own.data.product_ids ?? []).length} macroárea(s) vinculada(s)</span>
     <Button variant="outline" size="sm" onClick={()=>check.mutate()} disabled={check.isPending}>{check.isPending?"Verificando...":"Verificar / obter QR Code"}</Button>
   </div>}
    <div className="flex flex-wrap gap-3">
     <div className="w-full max-w-sm space-y-2">
       <p className="text-sm font-medium">Macroáreas do atendimento</p>
       <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border p-2">
         <label className="flex cursor-pointer items-center gap-2 rounded-md bg-muted/40 p-2 text-sm font-medium">
           <input type="checkbox" checked={allSelected}
             onChange={event=>setProductIds(event.target.checked?availableIds:[])} />
           Todas as macroáreas autorizadas
         </label>
         {products.filter(p=>p.is_active).map(p=><label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md p-2 text-sm hover:bg-muted/50">
           <input type="checkbox" checked={productIds.includes(p.id)}
             onChange={event=>toggleProduct(p.id,event.target.checked)} />
           <span>{p.name}</span>
         </label>)}
       </div>
       <p className="text-xs text-muted-foreground">{productIds.length} de {availableIds.length} macroáreas selecionadas.</p>
     </div>
     {own.data ? (
       <Button onClick={()=>edit.mutate()} disabled={edit.isPending || !productIds.length || (productIds.length===(own.data.product_ids??[]).length && productIds.every(id=>(own.data.product_ids??[]).includes(id)))}>
         {edit.isPending?"Salvando...":"Salvar macroáreas"}
       </Button>
     ) : <>
       <Select value={audience} onValueChange={v=>setAudience(v as "atacado"|"varejo")}>
        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="atacado">Atacado</SelectItem><SelectItem value="varejo">Varejo</SelectItem></SelectContent>
       </Select>
       <Button onClick={()=>connection.mutate()} disabled={connection.isPending || !productIds.length || !consented}>{connection.isPending?"Conectando...":"Vincular meu WhatsApp"}</Button>
     </>}
    </div>
    {!own.data && <label className="flex items-start gap-2 text-xs text-muted-foreground">
      <input type="checkbox" className="mt-1" checked={consented} onChange={e=>setConsented(e.target.checked)} />
      Entendo que as conversas e o histórico deste número poderão ser sincronizados com o CRM e visualizados por administradores. Vincularei apenas um número de atendimento autorizado, e não um WhatsApp pessoal privado.
    </label>}
   {own.data && alreadySaved && <p role="status" className="text-sm text-muted-foreground">{allSelected ? "Todas as macroáreas autorizadas já estão salvas." : "Macroáreas já salvas."} {own.data.connection_status !== "conectado" && "Falta concluir a conexão pelo QR Code."}</p>}
   {qr && <div className="max-w-xs rounded-lg border p-3"><p className="mb-2 text-sm font-medium">Escaneie em Aparelhos conectados no WhatsApp</p>
    <img alt="QR Code para vincular meu WhatsApp" className="h-auto w-full" src={qr.startsWith("data:")?qr:`data:image/png;base64,${qr}`} />
   </div>}
  </CardContent>
 </Card>;
}
