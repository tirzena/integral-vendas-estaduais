/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { useEstadualAccess } from "@/hooks/useEstadualAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Item = { id: string; product_id: string; name: string; price: number; currency: string };
type Category = { id: string; name: string };
type Warehouse = { id: string; name: string };
type Stock = { warehouse_id: string; item_id: string; available: number };
type Customer = { id: string; name: string; phone: string | null };
type Line = { item_id: string; quantity: number };
type Quote = { currency: string; subtotal: number; shipping_cost: number; total: number; items: any[] };
const emptyAddress = { country: "Brasil", state: "", city: "", address: "", number: "" };
const rpc = (name: string, args?: Record<string, unknown>) => (supabase as any).rpc(name, args);
const errorMessage = (e: any) => e?.message ?? String(e);

export function SellerOrderForm({ onFinished }: { onFinished?: () => void }) {
  const { userId } = useCurrentUser();
  const access = useEstadualAccess();
  const qc = useQueryClient();
  const [categoryId, setCategoryId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [lines, setLines] = useState<Line[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [customerId, setCustomerId] = useState("novo");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState(emptyAddress);
  const [currency, setCurrency] = useState("BRL");
  const [notes, setNotes] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [request, setRequest] = useState<any>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["estadual-seller-pdv", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [portal, stock, customers] = await Promise.all([
        rpc("seller_portal_data"), rpc("estadual_seller_warehouse_stock"),
        rpc("estadual_seller_customers"),
      ]);
      if (portal.error) throw portal.error;
      if (stock.error) throw stock.error;
      if (customers.error) throw customers.error;
      return {
        products: (portal.data?.products ?? []) as Category[],
        items: (portal.data?.items ?? []) as Item[],
        warehouses: (portal.data?.warehouses ?? []) as Warehouse[],
        stock: (stock.data ?? []) as Stock[],
        customers: (customers.data ?? []) as Customer[],
      };
    },
  });
  const products = data?.products ?? [];
  const items = data?.items ?? [];
  const customers = data?.customers ?? [];
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const availableWarehouses = (data?.warehouses ?? []).filter((w) =>
    lines.every((line) => (data?.stock ?? []).some((s) =>
      s.warehouse_id === w.id && s.item_id === line.item_id &&
      Number(s.available) >= line.quantity)),
  );
  const invalidate = () => { setQuote(null); setRequest(null); setRequestId(null); };
  const changeAddress = (key: keyof typeof emptyAddress, value: string) => {
    setAddress((old) => ({ ...old, [key]: value })); invalidate();
  };
  const add = () => {
    const qty = Number(quantity);
    if (!itemById.has(itemId) || !Number.isFinite(qty) || qty <= 0 ||
        qty > 1000000 || Math.round(qty * 1000) !== qty * 1000)
      return void toast.error("Selecione um produto e uma quantidade válida.");
    const current = lines.find((line) => line.item_id === itemId);
    const next = current ? lines.map((line) => line.item_id === itemId
      ? { ...line, quantity: line.quantity + qty } : line)
      : [...lines, { item_id: itemId, quantity: qty }];
    if (next.some((line) => line.quantity > 1000000)) return void toast.error("Quantidade inválida.");
    setLines(next); setItemId(""); setQuantity("1"); invalidate();
  };
  const buildRequest = () => {
    if (!access.canWrite) throw new Error("Seu perfil está somente leitura.");
    if (!lines.length) throw new Error("Adicione produtos ao pedido.");
    if (!warehouseId || !availableWarehouses.some((w) => w.id === warehouseId))
      throw new Error("Escolha um estoque com saldo suficiente.");
    const customerName = selectedCustomer?.name ?? name.trim();
    if (!customerName) throw new Error("Informe o nome do cliente.");
    if (!address.state.trim() || !address.city.trim() || !address.address.trim())
      throw new Error("Preencha estado, cidade e endereço.");
    return {
      currency, exchange: { mode: "automatic" }, warehouse_id: warehouseId,
      destination: { ...address, recipient_name: customerName,
        phone: selectedCustomer?.phone ?? phone.trim() },
      customer: { name: customerName, phone: selectedCustomer?.phone ?? phone.trim() },
      notes: notes.trim().slice(0, 1000),
      items: lines.map((line) => ({ ...line, discount_percent: 0 })),
    };
  };
  const calculate = async () => {
    setBusy(true);
    try {
      const payload = buildRequest(); invalidate();
      const { data: result, error: quoteError } = await rpc("seller_portal_quote", {
        p_request: payload,
      });
      if (quoteError) throw quoteError;
      setQuote(result); setRequest(payload); setRequestId(crypto.randomUUID());
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const create = async () => {
    if (!quote || !request || !requestId || busy || !access.canWrite) return;
    setBusy(true);
    try {
      const { data: result, error: createError } = await rpc("estadual_seller_create_order", {
        p_request: request, p_request_id: requestId, p_expected_quote: quote,
        p_customer_id: selectedCustomer?.id ?? null,
      });
      if (createError) throw createError;
      toast.success(`Pedido #${result.number} criado e vinculado ao cliente.`);
      setLines([]); setWarehouseId(""); setCustomerId("novo"); setName(""); setPhone("");
      setAddress(emptyAddress); setNotes(""); invalidate();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["estadual-seller-pdv"] }),
        qc.invalidateQueries({ queryKey: ["estadual-seller-customers"] }),
        qc.invalidateQueries({ queryKey: ["sales-stage-counts"] }),
        qc.invalidateQueries({ queryKey: ["orders"] }),
      ]);
      onFinished?.();
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(false); }
  };
  if (isLoading || access.loading) return <p className="p-4">Carregando produtos e estoques autorizados…</p>;
  if (error) return <div role="alert" className="space-y-3 p-4">
    <p>Não foi possível carregar o pedido: {errorMessage(error)}</p>
    <Button variant="outline" onClick={() => void refetch()}>Tentar novamente</Button>
  </div>;
  if (!access.canWrite) return <p>Este perfil não possui autorização para criar pedidos.</p>;
  return <div className="space-y-5">SELLER_ORDER_FORM_BODY</div>;
}
