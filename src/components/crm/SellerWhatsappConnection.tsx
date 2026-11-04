import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useProductScope } from "@/hooks/useProductScope";
import { connectSellerWhatsapp, mySellerWhatsapp, refreshSellerWhatsapp } from "@/lib/seller-whatsapp.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function SellerWhatsappConnection() {
 const {products}=useProductScope();
 const qc=useQueryClient();
 const get=useServerFn(mySellerWhatsapp);
 const create=useServerFn(connectSellerWhatsapp);
 const refresh=useServerFn(refreshSellerWhatsapp);
 const [product,setProduct]=useState("");
 const [audience,setAudience]=useState<"atacado"|"varejo">("atacado");
 const [qr,setQr]=useState<string|null>(null);
 const [consented,setConsented]=useState(false);
 const own=useQuery({queryKey:["seller-whatsapp-own"],queryFn:()=>get(),refetchOnWindowFocus:true});
 const connection=useMutation({
  mutationFn:async()=>create({data:{productId:product || products[0]?.id || "",audience}}),
  onSuccess:async result=>{setQr(result.qrBase64);await qc.invalidateQueries({queryKey:["seller-whatsapp-own"]});toast.success("Conexão criada. Leia o QR Code no seu WhatsApp.");},
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
   {own.data ? <div className="flex flex-wrap items-center gap-3">
     <span className="text-sm">Situação: <strong>{own.data.connection_status}</strong></span>
     <Button variant="outline" size="sm" onClick={()=>check.mutate()} disabled={check.isPending}>{check.isPending?"Verificando...":"Verificar / obter QR Code"}</Button>
   </div> : <>
    <div className="flex flex-wrap gap-2">
     <Select value={product || products[0]?.id || ""} onValueChange={setProduct}>
      <SelectTrigger className="w-56"><SelectValue placeholder="Categoria de atendimento" /></SelectTrigger>
      <SelectContent>{products.map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
     </Select>
     <Select value={audience} onValueChange={v=>setAudience(v as "atacado"|"varejo")}>
      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="atacado">Atacado</SelectItem><SelectItem value="varejo">Varejo</SelectItem></SelectContent>
     </Select>
     <Button onClick={()=>connection.mutate()} disabled={connection.isPending || !products.length || !consented}>{connection.isPending?"Conectando...":"Vincular meu WhatsApp"}</Button>
    </div>
    <label className="flex items-start gap-2 text-xs text-muted-foreground">
      <input type="checkbox" className="mt-1" checked={consented} onChange={e=>setConsented(e.target.checked)} />
      Entendo que as conversas e o histórico deste número poderão ser sincronizados com o CRM e visualizados por administradores. Vincularei apenas um número de atendimento autorizado, e não um WhatsApp pessoal privado.
    </label>
   </>}
   {qr && <div className="max-w-xs rounded-lg border p-3"><p className="mb-2 text-sm font-medium">Escaneie em Aparelhos conectados no WhatsApp</p>
    <img alt="QR Code para vincular meu WhatsApp" className="h-auto w-full" src={qr.startsWith("data:")?qr:`data:image/png;base64,${qr}`} />
   </div>}
  </CardContent>
 </Card>;
}
