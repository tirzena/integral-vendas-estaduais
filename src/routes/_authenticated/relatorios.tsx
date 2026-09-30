import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useProductScope } from "@/hooks/useProductScope";
import { PageHeader, EmptyState } from "@/components/common/PageHeader";
import { ReportButton } from "@/components/common/ReportButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney, type Currency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Vendas Estaduais" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { userId, loading: permissionsLoading, canOpen, seesCompanySales } = usePermissions();
  const { productId, products, loading: scopeLoading } = useProductScope();
  const [from, setFrom] = useState("");
  const [through, setThrough] = useState("");
  const [status, setStatus] = useState("");
  const permitted = canOpen("/relatorios");
  const invalidRange = Boolean(from && through && from > through);
  const scopeIds = products.map((product) => product.id);
  const orders = useQuery({
    queryKey: ["state-sales-reports", userId, seesCompanySales, productId, scopeIds, from, through],
    enabled: Boolean(userId && permitted && !permissionsLoading && !scopeLoading && !invalidRange),
    queryFn: async () => {
      if (!scopeIds.length) return [];
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        let query = supabase.from("orders")
          .select("id,number,created_at,status,total,amount_paid,currency,product_id,seller_id")
          .is("deleted_at", null).is("superseded_at", null)
          .in("product_id", productId === "todos" ? scopeIds : [productId])
          .order("created_at", { ascending: false }).order("id").range(offset, offset + 499);
        if (!seesCompanySales) query = query.eq("seller_id", userId!);
        if (from) query = query.gte("created_at", new Date(from + "T00:00:00").toISOString());
        if (through) {
          const end = new Date(through + "T00:00:00");
          end.setDate(end.getDate() + 1);
          query = query.lt("created_at", end.toISOString());
        }
        const { data, error } = await query;
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < 500) break;
      }
      return rows;
    },
  });
  if (permissionsLoading || scopeLoading) return <p role="status">Carregando permissões…</p>;
  if (!permitted) return <EmptyState title="Acesso não autorizado" description="Seu perfil não tem acesso aos relatórios consolidados." />;
  const rows = (orders.data ?? []).filter((order) => !status || order.status === status);
  const statuses = [...new Set((orders.data ?? []).map((order) => order.status))].sort();
  const headers = ["Pedido", "Data", "Categoria", "Situação", "Moeda", "Valor", "Pago"];
  const reportRows = rows.map((order) => [
    order.number, formatDate(order.created_at),
    products.find((product) => product.id === order.product_id)?.name ?? "—",
    order.status, order.currency, Number(order.total ?? 0), Number(order.amount_paid ?? 0),
  ]);
  const description = `Período: ${from || "início"} até ${through || "hoje"} · ${rows.length} pedidos · ${status || "todas as situações"}`;
  return (
    <div>
      <PageHeader title="Relatórios" description="Pedidos nas categorias e territórios autorizados para seu perfil." />
      <Card className="mb-5"><CardContent className="flex flex-wrap items-end gap-4 pt-6">
        <div className="space-y-2"><Label htmlFor="report-from">De</Label><Input id="report-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="report-through">Até</Label><Input id="report-through" type="date" value={through} onChange={(e) => setThrough(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="report-status">Situação</Label>
          <select id="report-status" className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas</option>{statuses.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <Button variant="outline" onClick={() => { setFrom(""); setThrough(""); setStatus(""); }}>Limpar filtros</Button>
        <Button variant="outline" disabled={orders.isFetching || invalidRange} onClick={() => void orders.refetch()}>Atualizar</Button>
      </CardContent></Card>
      {invalidRange ? <p role="alert">A data inicial deve ser anterior ou igual à data final.</p>
        : orders.isPending || orders.isFetching ? <p role="status">Carregando relatório…</p>
        : orders.isError ? <EmptyState title="Não foi possível carregar os relatórios" description="Tente novamente pelo botão Atualizar." />
        : <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{description}</p>
            {rows.length > 0 && <ReportButton title="Relatório de pedidos estaduais" description={description} filename="vendas-estaduais" build={() => ({ headers, rows: reportRows })} />}
          </div>
          {!rows.length ? <EmptyState title="Nenhum pedido encontrado" description="Ajuste o período, a situação ou a categoria selecionada." />
            : <Table><TableHeader><TableRow>{headers.map((header) => <TableHead key={header}>{header}</TableHead>)}</TableRow></TableHeader>
              <TableBody>{rows.map((order, index) => <TableRow key={order.id}>
                <TableCell>{order.number}</TableCell><TableCell>{reportRows[index][1]}</TableCell><TableCell>{reportRows[index][2]}</TableCell>
                <TableCell>{order.status}</TableCell><TableCell>{order.currency}</TableCell>
                <TableCell>{formatMoney(order.total, order.currency as Currency)}</TableCell>
                <TableCell>{formatMoney(order.amount_paid, order.currency as Currency)}</TableCell>
              </TableRow>)}</TableBody></Table>}
        </>}
    </div>
  );
}
