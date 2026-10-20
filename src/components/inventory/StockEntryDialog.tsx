import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNumber } from "@/lib/format";
export function StockEntryDialog({ item, onClose }: { item: { id: string; name: string; quantity?: number | string }; onClose: () => void }) {
 const qc=useQueryClient();
 const [quantity,setQuantity]=useState("");
 const [reason,setReason]=useState("Abastecimento de estoque");
 const [requestId]=useState(()=>crypto.randomUUID());
 const [saving,setSaving]=useState(false);
 const amount=Number(quantity.replace(",","."));
 async function save(){
  if(saving)return;
  if(!Number.isFinite(amount)||amount<=0||Math.abs(amount*1000-Math.round(amount*1000))>0.00001){toast.error("Informe uma quantidade positiva com até três casas decimais.");return;}
  if(reason.trim().length<3){toast.error("Informe o motivo da entrada.");return;}
  setSaving(true);
  try {
   const {data,error}=await (supabase as any).rpc("inventory_receive_principal",{p_item_id:item.id,p_quantity:amount,p_request_id:requestId,p_reason:reason.trim()});
   if(error)throw error;
   await qc.invalidateQueries();
   toast.success("Entrada registrada. Saldo total: "+formatNumber(data.quantity)+" unidades.");
   onClose();
  }catch(error){toast.error((error as Error).message);}
  finally{setSaving(false);}
 }
 return <Dialog open onOpenChange={(open)=>{if(!open&&!saving)onClose();}}><DialogContent><DialogHeader><DialogTitle>Abastecer produto</DialogTitle><DialogDescription>{item.name} — destino: Estoque principal.</DialogDescription></DialogHeader>
 <form onSubmit={(e)=>{e.preventDefault();void save();}} className="space-y-4">
 <p>Saldo atual: <strong>{formatNumber(Number(item.quantity ?? 0))} unidades</strong></p>
 <div className="space-y-2"><Label htmlFor="stock-entry-quantity">Quantidade recebida para adicionar</Label><Input id="stock-entry-quantity" inputMode="decimal" autoFocus value={quantity} onChange={e=>setQuantity(e.target.value)} disabled={saving} required /></div>
 {Number.isFinite(amount)&&amount>0&&<p>Novo saldo: <strong>{formatNumber(Number(item.quantity ?? 0)+amount)} unidades</strong></p>}
 <div className="space-y-2"><Label htmlFor="stock-entry-reason">Motivo</Label><Input id="stock-entry-reason" value={reason} onChange={e=>setReason(e.target.value)} disabled={saving} required /></div>
 <p className="text-sm text-muted-foreground">Esta entrada registra apenas a quantidade recebida e atualiza Catálogo e Estoque. Recebimentos com custo e pagamento devem ser lançados diretamente em Estoques → Estoque principal → Registrar compra, uma única vez.</p>
 <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={saving}>{saving?"Registrando…":"Confirmar entrada"}</Button></DialogFooter>
 </form></DialogContent></Dialog>;
}
