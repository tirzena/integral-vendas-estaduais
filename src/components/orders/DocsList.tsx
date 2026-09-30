import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { useOperationalMetadata } from "@/hooks/useOperationalMetadata";
import { PaymentMeter } from "@/components/common/PaymentMeter";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Ban,
  Copy,
  Eye,
  FileText,
  History,
  Link2,
  Loader2,
  Pencil,
  Printer,
  Send,
  Trash2,
  Upload,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatExchangeRate, formatMoney, formatNumber } from "@/lib/format";
import type { Currency } from "@/lib/format";
import { useRates } from "@/hooks/useRates";
import { isPix, exchangeConvert, manualExchange, type OrderExchange } from "@/lib/order-exchange";
import {
  PAYMENT_METHODS,
  applyCustomerCredit,
  getCustomerCredit,
  issueCustomerCredit,
  cancelOrderPayment,
  cancelQuote,
  convertQuote,
  documentCode,
  editOrderPayment,
  editPaymentReceived,
  registerPaymentReceived,
  registerPaymentWithCustomerCredit,
  orderNumber,
  documentMessage,
  invoicePreorder,
  printSalesDocument,
  registerOrderPayment,
  round2,
  setOrderStage,
  setCancelReturnWarehouse,
  toNumber,
  updatePaymentDate,
  whatsappLink,
  type PaymentInput,
  type PrintDoc,
  type PrintFormat,
  type SaleKind,
} from "@/lib/sales";
import type { PdvDraft } from "@/components/orders/Pdv";
import { DeliveryQr } from "@/components/entregas/DeliveryQr";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { authenticatedFileClient } from "@/lib/authenticated-storage";
import {
  deleteOrderWithReservationRepair,
  deleteUnusedPaymentProof,
} from "@/lib/order-proof.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReportButton, type ReportData } from "@/components/common/ReportButton";
import { EmptyState } from "@/components/common/PageHeader";
import { CurrencyValues } from "@/components/common/CurrencyValues";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  kind: SaleKind;
  productId: string;
  stage?:
    | "pedido_feito"
    | "em_caminho"
    | "vendido"
    | "pagamento_parcial"
    | "esperando_pagamento"
    | "perdido"
    | "cancelado";
  allOrders?: boolean;
  requestsOnly?: boolean;
  excludeRequests?: boolean;
  onEdit?: (draft: PdvDraft) => void;
};

const isCatalogRequest = (doc: any) =>
  Boolean(doc) &&
  doc.origin === "catalogo" &&
  doc.kind === "pre_pedido" &&
  doc.status === "pre_pedido" &&
  doc.stock_state === "nenhum";

const STATUS_OPTIONS: Record<SaleKind, string[]> = {
  venda: ["faturado", "entregue", "cancelado"],
  pre_pedido: ["pre_pedido", "cancelado"],
  orcamento: ["rascunho", "aprovado", "recusado"],
};

const STATUS_LABEL: Record<string, string> = {
  faturado: "Faturado",
  entregue: "Entregue",
  cancelado: "Cancelado",
  pre_pedido: "Reservado",
  rascunho: "Rascunho",
  aprovado: "Aprovado",
  recusado: "Recusado",
  novo: "Novo",
};

const WORKFLOW_OPTIONS = [
  { value: "pedido_feito", label: "Pedido feito" },
  { value: "esperando_pagamento", label: "Esperando pagamento" },
  { value: "pagamento_parcial", label: "Pagamento parcial" },
  { value: "vendido", label: "Pago" },
  { value: "em_caminho", label: "Em caminho" },
  { value: "perdido", label: "Produtos perdidos" },
  { value: "cancelado", label: "Cancelado" },
];

function workflowTone(stage: string) {
  if (stage === "vendido") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (stage === "pagamento_parcial") return "border-sky-200 bg-sky-50 text-sky-800";
  if (stage === "em_caminho") return "border-blue-200 bg-blue-50 text-blue-800";
  if (stage === "esperando_pagamento") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-border bg-secondary text-secondary-foreground";
}

/** Lista de documentos comerciais com busca, filtros e ações reais. */
export function DocsList({
  kind,
  productId,
  stage,
  allOrders = false,
  requestsOnly = false,
  excludeRequests = false,
  onEdit,
}: Props) {
  const { seesCompanySales, seesCompanyFinance, isAdmin, roles, can, userId } = usePermissions();
  const canIssueCredit = isAdmin || roles.includes("financeiro");
  const canUseLineCosts = roles.some((role) =>
    ["superadmin", "admin", "financeiro"].includes(role),
  );
  const stockOnly = can("inventory_manage") && !seesCompanySales;
  const queryClient = useQueryClient();
  const rates = useRates();
  const inventoryMetadata = useOperationalMetadata(true);
  const inventoryItems = inventoryMetadata.data?.items ?? [];
  const [supplierFilter, setSupplierFilter] = useState("todos");
  const isQuote = kind === "orcamento";
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("todos");
  const [seller, setSeller] = useState("todos");
  const [team, setTeam] = useState("todos");
  const [selectedProduct, setSelectedProduct] = useState("todos");
  const [origin, setOrigin] = useState("todos");
  const [sortOrder, setSortOrder] = useState<
    "recentes" | "antigos" | "alfabetica" | "numero_asc" | "numero_desc"
  >("numero_asc");
  const sortStorageKey = `pedidos:ordem:${userId ?? "anonimo"}:${kind}`;
  useEffect(() => {
    const saved = localStorage.getItem(sortStorageKey);
    if (["recentes", "antigos", "alfabetica", "numero_asc", "numero_desc"].includes(saved ?? ""))
      setSortOrder(saved as typeof sortOrder);
  }, [sortStorageKey]);
  const [reportScope, setReportScope] = useState<"tela" | "aba">("tela");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [reportSeller, setReportSeller] = useState("todos");
  const [reportStatus, setReportStatus] = useState("todos");
  const [reportProduct, setReportProduct] = useState("todos");
  const [reportCurrency, setReportCurrency] = useState("todos");
  const [reportNumber, setReportNumber] = useState("");
  const [busy, setBusy] = useState(false);

  const [payOpen, setPayOpen] = useState<any>(null);
  const [payTarget, setPayTarget] = useState<SaleKind>("venda");
  const [payments, setPayments] = useState<PaymentInput[]>([]);
  const [payMethod, setPayMethod] = useState("Dinheiro");
  const [payAmount, setPayAmount] = useState("");
  const [cancelDoc, setCancelDoc] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelWarehouseId, setCancelWarehouseId] = useState("");
  const [printFormat, setPrintFormat] = useState<PrintFormat>("A4");
  const [printOverrides, setPrintOverrides] = useState<Record<string, PrintFormat>>({});
  const [detailDoc, setDetailDoc] = useState<any>(null);
  const [proofUrl, setProofUrl] = useState("");
  const [uploadingProof, setUploadingProof] = useState(false);
  const [deleteDoc, setDeleteDoc] = useState<any>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [creditUseAmount, setCreditUseAmount] = useState("");
  const [shortItemId, setShortItemId] = useState("");
  const [shortQuantity, setShortQuantity] = useState("");
  const [shortReason, setShortReason] = useState("");
  const { data: creditableItems = [] } = useQuery({
    queryKey: ["customer-credit-order-items", detailDoc?.id],
    enabled: Boolean(detailDoc?.id && canIssueCredit),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("order_items")
        .select("id,description,quantity,total")
        .eq("order_id", detailDoc.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; description: string; quantity: number; total: number }[];
    },
  });
  const { data: customerCreditBalances = [] } = useQuery({
    queryKey: ["customer-credit", detailDoc?.customer_id],
    queryFn: () => getCustomerCredit(detailDoc.customer_id),
    enabled: Boolean(detailDoc?.customer_id),
    staleTime: 10_000,
  });
  const selectedCustomerCredit = Number(customerCreditBalances.find(
    (entry) => entry.currency === (detailDoc?.currency ?? "BRL"),
  )?.balance ?? 0);
  const [receivedMethod, setReceivedMethod] = useState("PIX");
  const [receivedDate, setReceivedDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [receivedExchangeMode, setReceivedExchangeMode] = useState<"automatic" | "manual">("automatic");
  const [receivedManualBrl, setReceivedManualBrl] = useState("");
  const [receivedManualPyg, setReceivedManualPyg] = useState("");
  const [cashReceiptToken, setCashReceiptToken] = useState("");
  const [proofToDelete, setProofToDelete] = useState<any>(null);
  const [paymentToEdit, setPaymentToEdit] = useState<any>(null);
  const [paymentEditAmount, setPaymentEditAmount] = useState("");
  const [paymentEditMethod, setPaymentEditMethod] = useState("Dinheiro");
  const [paymentEditReason, setPaymentEditReason] = useState("");
  const [paymentEditDate, setPaymentEditDate] = useState("");
  const [paymentToCancel, setPaymentToCancel] = useState<any>(null);
  const [paymentCancelReason, setPaymentCancelReason] = useState("");

  useEffect(() => {
    setReceivedExchangeMode("automatic");
    setReceivedManualBrl("");
    setReceivedManualPyg("");
  }, [detailDoc?.id]);

  useEffect(() => setSelectedProduct(productId), [productId]);

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["sales-docs", kind, productId, stage, allOrders, requestsOnly, excludeRequests, canUseLineCosts],
    queryFn: async () => {
      const table = isQuote ? "quotes" : "orders";
      let q = (supabase.from(table as any) as any)
        .select("*")
        .order("number", { ascending: false })
        .limit(500);
      if (productId !== "todos") q = q.eq("product_id", productId);
      if (!isQuote) q = q.is("deleted_at", null).is("superseded_at", null);
      if (!isQuote && !allOrders && stage !== "cancelado") q = q.eq("kind", kind);
      const [
        { data: docs },
        { data: customers },
        { data: people },
        { data: company },
        { data: teams },
        { data: teamMembers },
        { data: warehouses },
      ] = await Promise.all([
        q,
        supabase
          .from("customers")
          .select("id,name,document,phone,whatsapp,email,address,city,state"),
        supabase.from("profiles").select("id,full_name"),
        supabase.from("company_settings").select("*").limit(1).maybeSingle(),
        supabase.from("teams").select("id,name").order("name"),
        supabase.from("team_members").select("team_id,user_id"),
        (supabase as any).rpc("sales_warehouses"),
      ]);
      if (!isQuote && allOrders) {
        const requestedId = new URLSearchParams(window.location.search).get("pedido");
        if (requestedId && !(docs ?? []).some((d: any) => d.id === requestedId)) {
          const requested = await (supabase.from("orders") as any).select("*")
            .eq("id", requestedId).is("deleted_at", null).is("superseded_at", null).maybeSingle();
          if (requested.error) throw requested.error;
          if (requested.data) (docs ?? []).push(requested.data);
        }
      }
      const ids = (docs ?? []).map((d: any) => d.id);
      const { data: lines } = ids.length
        ? await (supabase.from(isQuote ? "quote_items" : "order_items") as any)
            .select("*")
            .in(isQuote ? "quote_id" : "order_id", ids)
        : { data: [] };
      let costs: any[] = [];
      if (ids.length && !isQuote && canUseLineCosts) {
        const result = await (supabase as any).rpc("sales_get_order_item_costs", {
          p_order_ids: ids,
        });
        if (result.error) throw result.error;
        costs = result.data ?? [];
      }
      return {
        docs: docs ?? [],
        customers: customers ?? [],
        people: people ?? [],
        company: company ?? null,
        lines: lines ?? [],
        costs,
        teams: teams ?? [],
        teamMembers: teamMembers ?? [],
        warehouses: warehouses ?? [],
      };
    },
  });

  const customers = useMemo(() => data?.customers ?? [], [data?.customers]);
  const people = useMemo(() => data?.people ?? [], [data?.people]);
  const teams = useMemo(() => data?.teams ?? [], [data?.teams]);
  const teamMembers = useMemo(() => data?.teamMembers ?? [], [data?.teamMembers]);
  const customersById = useMemo(
    () => new Map(customers.map((customer: any) => [customer.id, customer])),
    [customers],
  );
  const peopleById = useMemo(
    () => new Map(people.map((person: any) => [person.id, person])),
    [people],
  );
  const linesByDocument = useMemo(() => {
    const grouped = new Map<string, any[]>();
    for (const line of data?.lines ?? []) {
      const documentId = isQuote ? line.quote_id : line.order_id;
      if (!documentId) continue;
      const current = grouped.get(documentId);
      if (current) current.push(line);
      else grouped.set(documentId, [line]);
    }
    return grouped;
  }, [data?.lines, isQuote]);
  const costsByLine = useMemo(
    () => new Map((data?.costs ?? []).map((row: any) => [row.order_item_id, row])),
    [data?.costs],
  );
  const customerOf = (id: string) => customersById.get(id);
  const sellerName = (id: string) => peopleById.get(id)?.full_name ?? "—";
  const linesOf = (id: string) => linesByDocument.get(id) ?? [];

  useEffect(() => {
    if ((!allOrders && !requestsOnly) || !data?.docs?.length) return;
    const requestedId = new URLSearchParams(window.location.search).get("pedido");
    const requested = data.docs.find((doc: any) => doc.id === requestedId);
    if (requested) setDetailDoc(requested);
  }, [allOrders, requestsOnly, data?.docs]);

  const docs = useMemo(() => {
    const t = term.trim().toLowerCase();
    const matchesPeriod = (value: string | null | undefined) => {
      const date = String(value ?? "").slice(0, 10);
      return (!dateFrom || (date && date >= dateFrom)) && (!dateTo || (date && date <= dateTo));
    };
    const filtered = (data?.docs ?? []).filter((d: any) => {
      if (requestsOnly && !isCatalogRequest(d)) return false;
      if (excludeRequests && isCatalogRequest(d)) return false;
      if (!matchesPeriod(d.order_date ?? d.created_at)) return false;
      if (status !== "todos" && d.status !== status) return false;
      if (seller !== "todos" && d.seller_id !== seller) return false;
      if (
        team !== "todos" &&
        !teamMembers.some(
          (member: any) => member.team_id === team && member.user_id === d.seller_id,
        )
      )
        return false;
      const documentLines = linesByDocument.get(d.id) ?? [];
      if (
        selectedProduct !== "todos" &&
        !documentLines.some((line: any) => line.item_id === selectedProduct)
      )
        return false;
      if (
        supplierFilter !== "todos" &&
        !documentLines.some(
          (line: any) =>
            (line.supplier_id ??
              inventoryMetadata.data?.items.find((item) => item.id === line.item_id)
                ?.supplier_id) === supplierFilter,
        )
      )
        return false;
      if (origin !== "todos" && (d.origin ?? "pdv") !== origin) return false;
      if (stage === "cancelado" && d.status !== "cancelado") return false;
      if (
        stage &&
        stage !== "cancelado" &&
        (d.status === "cancelado" || d.workflow_stage !== stage)
      )
        return false;
      if (!t) return true;
      const c = customerOf(d.customer_id);
      const hay = [
        d.number,
        c?.name,
        c?.document,
        sellerName(d.seller_id),
        ...linesOf(d.id).map((l: any) => `${l.description} ${l.sku ?? ""} ${l.barcode ?? ""}`),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(t);
    });
    return [...filtered].sort((a: any, b: any) => {
      const numberDifference = Number(a.number ?? 0) - Number(b.number ?? 0);
      if (sortOrder === "numero_asc") return numberDifference;
      if (sortOrder === "numero_desc") return -numberDifference;
      if (sortOrder === "alfabetica") {
        const aName = customerOf(a.customer_id)?.name ?? "Venda balcão";
        const bName = customerOf(b.customer_id)?.name ?? "Venda balcão";
        return aName.localeCompare(bName, "pt-BR", { sensitivity: "base" }) || numberDifference;
      }
      const aTime = new Date(a.order_date ?? a.created_at).getTime();
      const bTime = new Date(b.order_date ?? b.created_at).getTime();
      const timeDifference = sortOrder === "antigos" ? aTime - bTime : bTime - aTime;
      return timeDifference || (sortOrder === "antigos" ? numberDifference : -numberDifference);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    data,
    term,
    status,
    seller,
    team,
    selectedProduct,
    origin,
    dateFrom,
    dateTo,
    stage,
    sortOrder,
    supplierFilter,
    inventoryMetadata.data,
    linesByDocument,
  ]);

  const visiblePeople =
    team === "todos"
      ? people
      : people.filter((person: any) =>
          teamMembers.some(
            (member: any) => member.team_id === team && member.user_id === person.id,
          ),
        );

  const stageLabel = (doc: any) => {
    if (doc.status === "cancelado") return "Cancelado";
    const labels: Record<string, string> = {
      perdido: "Produtos perdidos",
      pedido_feito: "Pedido feito",
      em_caminho: "Em caminho",
      vendido: "Pago",
      pagamento_parcial: "Pagamento parcial",
      esperando_pagamento: "Esperando pagamento",
    };
    return labels[doc.workflow_stage] ?? STATUS_LABEL[doc.status] ?? doc.status;
  };

  function buildOrdersReport(): ReportData {
    const source = reportScope === "tela"
      ? docs
      : (data?.docs ?? []).filter((doc: any) => {
          if (requestsOnly && !isCatalogRequest(doc)) return false;
          if (excludeRequests && isCatalogRequest(doc)) return false;
          if (stage === "cancelado") return doc.status === "cancelado";
          if (stage) return doc.status !== "cancelado" && doc.workflow_stage === stage;
          return true;
        });
    const selected = source.filter((doc: any) => {
      const date = String(doc.order_date ?? doc.created_at ?? "").slice(0, 10);
      if (reportFrom && date < reportFrom) return false;
      if (reportTo && date > reportTo) return false;
      if (reportSeller !== "todos" && doc.seller_id !== reportSeller) return false;
      if (
        reportStatus !== "todos" &&
        doc.workflow_stage !== reportStatus &&
        doc.status !== reportStatus
      ) return false;
      if (reportCurrency !== "todos" && doc.currency !== reportCurrency) return false;
      if (
        reportProduct !== "todos" &&
        !linesOf(doc.id).some((line: any) => line.item_id === reportProduct)
      ) return false;
      const number = reportNumber.trim().replace(/^#/, "");
      return !number || String(doc.number ?? "").padStart(2, "0").includes(number);
    });
    const filters = [
      reportScope === "tela" ? "Pedidos filtrados na tela" : "Todos os pedidos da aba",
      reportScope === "tela" && (dateFrom || dateTo)
        ? `Período da tela: ${dateFrom ? formatDate(dateFrom) : "início"} até ${dateTo ? formatDate(dateTo) : "sem limite"}`
        : "",
      reportFrom ? `De: ${formatDate(reportFrom)}` : "",
      reportTo ? `Até: ${formatDate(reportTo)}` : "",
      reportSeller !== "todos" ? `Vendedor: ${sellerName(reportSeller)}` : "",
      reportStatus !== "todos" ? `Situação: ${stageLabel({ workflow_stage: reportStatus, status: reportStatus })}` : "",
      reportProduct !== "todos" ? `Produto: ${inventoryItems.find((item) => item.id === reportProduct)?.name ?? "Selecionado"}` : "",
      reportCurrency !== "todos" ? `Moeda: ${reportCurrency}` : "",
      reportNumber.trim() ? `Número: ${reportNumber.trim()}` : "",
      (data?.docs ?? []).length >= 500 ? "Fonte: até 500 pedidos mais recentes carregados" : "",
    ].filter(Boolean);
    const baseHeaders = [
      "Pedido",
      "Data",
      "Cliente",
      "Vendedor",
      "Situação",
      "Produtos",
      "Unidades",
      "Total BRL",
      "Total USD",
      "Total PYG",
      "Pago BRL",
      "Pago USD",
      "Pago PYG",
      "A receber BRL",
      "A receber USD",
      "A receber PYG",
      "Frete BRL",
      "Frete USD",
      "Frete PYG",
      "Estoque",
      "Rastreio",
    ];
    const headers = seesCompanyFinance
      ? [
          ...baseHeaders,
          "Custo dos produtos BRL",
          "Custo dos produtos USD",
          "Custo dos produtos PYG",
          "Custos variáveis BRL",
          "Custos variáveis USD",
          "Custos variáveis PYG",
          "Custo total BRL",
          "Custo total USD",
          "Custo total PYG",
          "Lucro bruto BRL",
          "Lucro bruto USD",
          "Lucro bruto PYG",
        ]
      : baseHeaders;
    const orderedDocs = [...selected].sort(
      (a: any, b: any) => Number(a.number ?? 0) - Number(b.number ?? 0),
    );
    const reportValues = (amount: number, source: Currency) =>
      (["BRL", "USD", "PYG"] as Currency[]).map((target) => rates.money(amount, source, target));
    const rows = orderedDocs.map((doc: any) => {
      const customer = customerOf(doc.customer_id);
      const orderLines = linesOf(doc.id);
      const units = orderLines.reduce(
        (sum: number, line: any) => sum + Number(line.quantity ?? 0),
        0,
      );
      const warehouse = (data?.warehouses ?? []).find((item: any) => item.id === doc.warehouse_id);
      const row: (string | number | null | undefined)[] = [
        isQuote ? documentCode("orcamento", doc.number) : orderNumber(doc.number, doc.revision_no),
        formatDate(doc.order_date ?? doc.created_at),
        customer?.name ?? "Venda balcão",
        sellerName(doc.seller_id),
        stageLabel(doc),
        orderLines.map((line: any) => line.description).join(" | "),
        units,
        ...reportValues(Number(doc.total ?? 0), doc.currency ?? "BRL"),
        ...reportValues(Number(doc.amount_paid ?? 0), doc.currency ?? "BRL"),
        ...reportValues(Number(doc.amount_receivable ?? 0), doc.currency ?? "BRL"),
        ...reportValues(Number(doc.shipping_cost ?? 0), doc.currency ?? "BRL"),
        warehouse?.name ?? "Não definido",
        doc.tracking_code ?? "",
      ];
      if (seesCompanyFinance) {
        row.push(
          ...reportValues(Number(doc.merchandise_cost ?? 0), doc.currency ?? "BRL"),
          ...reportValues(Number(doc.variable_cost ?? 0), doc.currency ?? "BRL"),
          ...reportValues(Number(doc.total_cost_brl ?? 0), "BRL"),
          ...reportValues(Number(doc.gross_margin ?? 0), doc.currency ?? "BRL"),
        );
      }
      return row;
    });
    const totalsByCurrency = (["BRL", "USD", "PYG"] as Currency[]).map((currency) => ({
      currency,
      total: selected.reduce(
        (sum: number, doc: any) =>
          sum + (rates.convert(Number(doc.total ?? 0), doc.currency ?? "BRL", currency) ?? 0),
        0,
      ),
      paid: selected.reduce(
        (sum: number, doc: any) =>
          sum + (rates.convert(Number(doc.amount_paid ?? 0), doc.currency ?? "BRL", currency) ?? 0),
        0,
      ),
    }));
    const formattedTotals = totalsByCurrency
      .map((item) => formatMoney(item.total, item.currency))
      .join(" · ");
    const formattedPaid = totalsByCurrency
      .map((item) => formatMoney(item.paid, item.currency))
      .join(" · ");
    return {
      highlights: [
        { label: "Pedidos", value: formatNumber(selected.length) },
        { label: "Valor total", value: formattedTotals },
        { label: "Total recebido", value: formattedPaid },
      ],
      headers,
      rows,
      sections: canUseLineCosts && !isQuote ? [{
        title: "Custo por produto e por unidade (moeda do pedido)",
        headers: ["Pedido", "Produto", "Quantidade", "Moeda", "Custo por unidade", "Custo do produto", "Origem do custo"],
        rows: orderedDocs.flatMap((doc: any) => linesOf(doc.id).map((line: any) => {
          const cost: any = costsByLine.get(line.id);
          const unitCost = cost?.unit_cost == null ? null : Number(cost.unit_cost);
          return [
            orderNumber(doc.number, doc.revision_no),
            line.description,
            Number(line.quantity ?? 0),
            doc.currency ?? "BRL",
            unitCost == null ? "—" : formatMoney(unitCost, doc.currency ?? "BRL"),
            unitCost == null ? "—" : formatMoney(round2(unitCost * Number(line.quantity ?? 0)), doc.currency ?? "BRL"),
            cost?.is_manual ? "Manual" : unitCost == null ? "Sem custo cadastrado" : "Cadastro de estoque",
          ];
        })),
      }] : undefined,
      pdfDocument: {
        brand: data?.company?.brand_name ?? "OS",
        company: [data?.company?.legal_name, data?.company?.document].filter(Boolean).join(" · "),
        title: "Relatório de pedidos",
        filters,
        orders: orderedDocs.map((doc: any) => {
          const currency = (doc.currency ?? "BRL") as Currency;
          const customer = customerOf(doc.customer_id);
          const warehouse = (data?.warehouses ?? []).find((item: any) => item.id === doc.warehouse_id);
          const orderLines = linesOf(doc.id);
          const costsVisible = canUseLineCosts && seesCompanyFinance;
          const money = (value: any) => formatMoney(Number(value ?? 0), currency);
          return {
            title: `Pedido ${orderNumber(doc.number, doc.revision_no)} · ${customer?.name ?? "Venda balcão"}`,
            fields: [
              { label: "Data", value: formatDate(doc.order_date ?? doc.created_at) },
              { label: "Cliente", value: customer?.name ?? "Venda balcão" },
              { label: "Documento do cliente", value: customer?.document ?? "—" },
              { label: "Contato", value: customer?.phone ?? customer?.whatsapp ?? "—" },
              { label: "Vendedor", value: sellerName(doc.seller_id) },
              { label: "Situação", value: stageLabel(doc) },
              { label: "Pagamento", value: doc.payment_status ?? "—" },
              { label: "Moeda", value: currency },
              { label: "Origem", value: doc.origin ?? "pdv" },
              { label: "Estoque", value: warehouse?.name ?? "Não definido" },
              { label: "Destinatário", value: doc.delivery_recipient_name ?? "—" },
              { label: "Endereço de entrega", value: [
                doc.shipping_address, doc.shipping_address_number,
                doc.shipping_city, doc.shipping_state,
              ].filter(Boolean).join(", ") || "—" },
              { label: "Previsão de entrega", value: doc.delivery_deadline ? formatDate(doc.delivery_deadline) : "—" },
              { label: "Transportadora", value: doc.carrier ?? "—" },
              { label: "Rastreio", value: doc.tracking_code ?? "—" },
              { label: "Cotação do pedido", value: exchangeSnapshotText(doc.exchange_rates_snapshot) },
            ],
            itemHeaders: costsVisible
              ? ["Produto", "Qtd.", "Preço/un.", "Total", "Custo/un.", "Custo produto"]
              : ["Produto", "Qtd.", "Preço/un.", "Total"],
            itemRows: orderLines.map((line: any) => {
              const quantity = Number(line.quantity ?? 0);
              const discount = Number(line.discount ?? 0);
              const description = [line.description, line.sku ? `SKU: ${line.sku}` : ""]
                .filter(Boolean).join(" · ");
              const row = [
                description,
                formatNumber(quantity, 3),
                money(line.unit_price),
                money(round2(quantity * Number(line.unit_price ?? 0) - discount)),
              ];
              if (costsVisible) {
                const cost = (costsByLine.get(line.id) as any)?.unit_cost;
                row.push(
                  cost == null ? "—" : money(cost),
                  cost == null ? "—" : money(round2(Number(cost) * quantity)),
                );
              }
              return row;
            }),
            summary: [
              { label: "Total", value: reportValues(Number(doc.total ?? 0), currency).join(" · ") },
              { label: "Pago", value: reportValues(Number(doc.amount_paid ?? 0), currency).join(" · ") },
              { label: "A receber", value: reportValues(Number(doc.amount_receivable ?? 0), currency).join(" · ") },
              { label: "Frete", value: money(doc.shipping_cost) },
              { label: "Comissão prevista", value: money(doc.commission_total) },
              { label: "Bonificação", value: money(doc.bonus_amount) },
              ...(seesCompanyFinance ? [
                { label: "Custo dos produtos", value: money(doc.merchandise_cost) },
                { label: "Custos variáveis", value: money(doc.variable_cost) },
                { label: "Custo total BRL", value: formatMoney(Number(doc.total_cost_brl ?? 0), "BRL") },
                { label: "Custo total USD", value: formatMoney(Number(doc.total_cost_usd ?? 0), "USD") },
                { label: "Margem bruta", value: money(doc.gross_margin) },
              ] : []),
            ],
            notes: doc.notes ?? doc.source_payload?.observations ?? "",
          };
        }),
      },
    };
  }

  async function copyReportLink() {
    const reportTab = allOrders ? "pedidos" : stage || "pedidos";
    const url = new URL(window.location.href);
    url.searchParams.delete("pedido");
    url.searchParams.set("aba", reportTab);
    url.searchParams.set("relatorio", "1");
    await navigator.clipboard.writeText(url.toString());
    toast.success("Link desta aba de pedidos copiado.");
  }

  const allTotals = (total: number, from: Currency) =>
    (["BRL", "USD", "PYG"] as Currency[])
      .map((c) => ({ currency: c, total: rates.convert(total, from, c) ?? NaN }))
      .filter((c) => Number.isFinite(c.total));

  function buildPrint(doc: any): PrintDoc {
    const c = customerOf(doc.customer_id);
    const lines = linesOf(doc.id);
    const gross = round2(
      lines.reduce((s: number, l: any) => s + Number(l.quantity) * Number(l.unit_price), 0),
    );
    return {
      kind: isQuote ? "orcamento" : (doc.kind as SaleKind),
      number: doc.number,
      createdAt: doc.created_at,
      currency: (doc.currency ?? "BRL") as Currency,
      gross,
      discount: round2(gross + Number(doc.shipping_cost ?? 0) - Number(doc.total ?? 0)),
      shippingCost: Number(doc.shipping_cost ?? 0),
      variableCost: Number(doc.variable_cost ?? 0),
      merchandiseCost: Number(doc.merchandise_cost ?? 0),
      totalCostBrl: Number(doc.total_cost_brl ?? 0),
      totalCostUsd: Number(doc.total_cost_usd ?? 0),
      grossMargin: Number(doc.gross_margin ?? 0),
      total: Number(doc.total ?? 0),
      seller: sellerName(doc.seller_id),
      customer: c ?? null,
      company: data?.company ?? null,
      notes: doc.notes,
      status: stageLabel(doc),
      revision: Number(doc.revision_no ?? 1),
      origin: doc.origin ?? "pdv",
      paid: Number(doc.amount_paid ?? 0),
      receivable: Number(doc.amount_receivable ?? 0),
      paymentStatus: doc.payment_status,
      recipient: doc.delivery_recipient_name,
      warehouse: (data?.warehouses ?? []).find((item: any) => item.id === doc.warehouse_id),
      shipping: {
        address: [doc.shipping_address, doc.shipping_address_number].filter(Boolean).join(", "),
        city: doc.shipping_city,
        state: doc.shipping_state,
      },
      deliveryDeadline: doc.delivery_deadline,
      carrier: doc.carrier,
      trackingCode: doc.tracking_code,
      creationExchange: exchangeSnapshotText(doc.exchange_rates_snapshot),
      conversions: allTotals(Number(doc.total ?? 0), (doc.currency ?? "BRL") as Currency),
      lines: lines.map((l: any) => ({
        description: l.description,
        sku: l.sku,
        barcode: l.barcode,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
        discount: Number(l.discount ?? 0),
        unit_cost: canUseLineCosts
          ? (costsByLine.get(l.id) as any)?.unit_cost == null
            ? null
            : Number((costsByLine.get(l.id) as any).unit_cost)
          : null,
      })),
    };
  }

  async function printComplete(doc: any, audience: "customer" | "internal" = "customer") {
    const selectedPrintFormat = printOverrides[doc.id] ?? printFormat;
    if (isQuote) {
      if (!printSalesDocument(buildPrint(doc), selectedPrintFormat, audience))
        toast.error("Libere as janelas pop-up para imprimir.");
      return;
    }
    const [paymentsResult, proofsResult] = await Promise.all([
      (supabase as any)
        .from("payments")
        .select(
          "amount,received_amount,received_currency,method,paid_at,created_at,exchange_rates_snapshot,exchange_rate_source",
        )
        .eq("order_id", doc.id)
        .eq("status", "pago")
        .order("created_at", { ascending: true }),
      (supabase as any)
        .from("order_payment_proofs")
        .select("id", { count: "exact", head: true })
        .eq("order_id", doc.id),
    ]);
    if (paymentsResult.error) return void toast.error(paymentsResult.error.message);
    if (proofsResult.error) return void toast.error(proofsResult.error.message);
    const printable = buildPrint(doc);
    printable.proofCount = proofsResult.count ?? 0;
    printable.registeredPayments = (paymentsResult.data ?? []).map((payment: any) => ({
      method: payment.method,
      amount: Number(payment.amount ?? 0),
      received_amount:
        payment.received_amount == null ? undefined : Number(payment.received_amount),
      received_currency: payment.received_currency ?? undefined,
      date: payment.paid_at ?? payment.created_at,
      exchange: exchangeSnapshotText(payment.exchange_rates_snapshot),
    }));
    if (!printSalesDocument(printable, selectedPrintFormat, audience))
      toast.error("Libere as janelas pop-up para imprimir.");
  }

  function editInPdv(doc: any) {
    const request = isCatalogRequest(doc);
    const requestCustomer = customerOf(doc.customer_id);
    const lines = linesOf(doc.id).map((l: any, idx: number) => ({
      key: `${l.id}-${idx}`,
      item_id: l.item_id ?? null,
      name: l.description,
      sku: l.sku ?? null,
      barcode: l.barcode ?? null,
      unit: l.unit ?? "UN",
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
      unit_cost: (costsByLine.get(l.id) as any)?.is_manual
        ? Number((costsByLine.get(l.id) as any).unit_cost)
        : null,
      discount: Number(l.discount ?? 0),
      available: 0,
      base_price: Number(l.unit_price),
      base_currency: (doc.currency ?? "BRL") as Currency,
      commission_enabled: Boolean(l.commission_enabled),
      commission_percent: Number(l.commission_percent ?? 5),
      commission_amount: Number(l.commission_amount ?? 0),
      max_discount_percent: Number(l.max_discount_percent ?? 0),
    }));
    onEdit?.({
      sourceOrderId: isQuote ? undefined : doc.id,
      catalogRequest: isCatalogRequest(doc),
      customerId: doc.customer_id,
      currency: (doc.currency ?? "BRL") as Currency,
      exchangeMode: doc.exchange_rate_source?.includes("manual") ? "manual" : "automatic",
      manualBrl: doc.exchange_rates_snapshot?.USD
        ? String(doc.exchange_rates_snapshot.BRL / doc.exchange_rates_snapshot.USD)
        : "",
      manualPyg: doc.exchange_rates_snapshot?.USD
        ? String(doc.exchange_rates_snapshot.PYG / doc.exchange_rates_snapshot.USD)
        : "",
      notes: doc.notes,
      whatsapp: doc.whatsapp,
      discount: Number(doc.discount ?? 0),
      commissionEnabled: Boolean(doc.commission_enabled),
      warehouseId: doc.warehouse_id,
      shippingAddress:
        doc.shipping_address ??
        (request ? (doc.delivery?.address ?? requestCustomer?.address) : null),
      shippingAddressNumber: doc.shipping_address_number,
      shippingCity: doc.shipping_city ?? (request ? requestCustomer?.city : null),
      shippingState:
        doc.shipping_state ?? (request ? (doc.delivery?.state ?? requestCustomer?.state) : null),
      shippingCountry: doc.shipping_country ?? "Brasil",
      shippingCep: doc.shipping_cep,
      sellerId: doc.seller_id,
      deliveryRecipientName: doc.delivery_recipient_name ?? requestCustomer?.name ?? "",
      deliveryRecipientDocument: doc.delivery_recipient_document ?? requestCustomer?.document ?? "",
      shippingCost: Number(doc.shipping_cost ?? 0),
      shippingManuallyEdited: !isQuote && !request,
      variableCost: Number(doc.variable_cost ?? 0),
      shippingPercentage: doc.shipping_percentage == null ? null : Number(doc.shipping_percentage),
      deliveryDeadline: doc.delivery_deadline,
      orderDate: doc.order_date,
      deliveredAt: doc.delivered_at,
      carrier: doc.carrier,
      trackingCode: doc.tracking_code,
      lines,
    });
    toast.info(
      isCatalogRequest(doc)
        ? "Solicitação carregada para revisão e confirmação."
        : "Pedido carregado para edição.",
    );
  }

  function openPayments(doc: any, target: SaleKind) {
    setPayOpen(doc);
    setPayTarget(target);
    setPayments([]);
    setPayAmount(String(Number(doc.total ?? 0)));
  }

  async function confirmPayments() {
    if (!payOpen) return;
    setBusy(true);
    try {
      let converted: any;
      if (isQuote)
        converted = await convertQuote(
          payOpen.id,
          payTarget,
          payTarget === "venda" ? payments : [],
        );
      else converted = await invoicePreorder(payOpen.id, payments);
      if (payTarget === "venda" && converted?.id) await setOrderStage(converted.id, "vendido");
      toast.success(payTarget === "venda" ? "Venda faturada." : "Pré-pedido criado.");
      setPayOpen(null);
      queryClient.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancel() {
    if (!cancelDoc) return;
    setBusy(true);
    try {
      if (isQuote) await cancelQuote(cancelDoc.id, cancelReason);
      else {
        if (cancelWarehouseId) await setCancelReturnWarehouse(cancelDoc.id, cancelWarehouseId);
        await deleteOrderWithReservationRepair({
          data: { orderId: cancelDoc.id, reason: cancelReason },
        });
      }
      toast.success(isQuote ? "Orçamento recusado." : "Pedido excluído e totais recalculados.");
      setCancelDoc(null);
      setCancelReason("");
      setCancelWarehouseId("");
      queryClient.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível cancelar.");
    } finally {
      setBusy(false);
    }
  }

  function suggestReturnWarehouse(doc: any, notify = true) {
    const warehouses = [...(data?.warehouses ?? [])];
    const city = String(doc?.shipping_city ?? "")
      .trim()
      .toLowerCase();
    const state = String(doc?.shipping_state ?? "")
      .trim()
      .toLowerCase();
    warehouses.sort((a: any, b: any) => {
      const score = (warehouse: any) =>
        city &&
        String(warehouse.city ?? "")
          .trim()
          .toLowerCase() === city
          ? 0
          : state &&
              String(warehouse.state ?? "")
                .trim()
                .toLowerCase() === state
            ? 1
            : warehouse.id === doc?.warehouse_id
              ? 2
              : 3;
      return score(a) - score(b);
    });
    const suggested = warehouses[0];
    setCancelWarehouseId(suggested?.id ?? doc?.warehouse_id ?? "");
    if (notify && suggested) toast.info(`Estoque sugerido para devolução: ${suggested.name}.`);
  }

  async function changeStage(doc: any, next: string) {
    setBusy(true);
    try {
      await setOrderStage(doc.id, next);
      toast.success("Estágio do pedido atualizado.");
      await queryClient.invalidateQueries();
    } catch (e: any) {
      if (next === "vendido") setDetailDoc(doc);
      toast.error(e?.message ?? "Não foi possível alterar o estágio.");
    } finally {
      setBusy(false);
    }
  }

  async function copyOrderLink(doc: any) {
    const { data: token, error } = await (supabase as any).rpc("sales_order_share_token", {
      p_order_id: doc.id,
    });
    if (error || !token)
      return void toast.error(error?.message ?? "Não foi possível gerar o link.");
    await navigator.clipboard.writeText(`${window.location.origin}/pedido/${token}`);
    toast.success("Link sigiloso e detalhado do pedido copiado.");
  }

  async function addProofLink() {
    if (!detailDoc || !/^https?:\/\//i.test(proofUrl.trim()))
      return void toast.error("Informe um link válido do comprovante.");
    setUploadingProof(true);
    try {
      const { client, userId } = await authenticatedFileClient();
      const { error } = await (client as any).from("order_payment_proofs").insert({
        order_id: detailDoc.id,
        proof_type: "link",
        external_url: proofUrl.trim(),
        uploaded_by: userId,
      });
      if (error) throw error;
      setProofUrl("");
      await detailQuery.refetch();
      toast.success("Comprovante registrado.");
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível registrar o link.");
    } finally {
      setUploadingProof(false);
    }
  }

  async function uploadProof(file: File) {
    if (!detailDoc) return;
    setUploadingProof(true);
    try {
      const { client, userId } = await authenticatedFileClient();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const path = `${detailDoc.id}/${crypto.randomUUID()}-${safeName}`;
      const uploaded = await client.storage.from("payment-proofs").upload(path, file, {
        contentType: file.type || "application/octet-stream",
      });
      if (uploaded.error) throw uploaded.error;
      const { error } = await (client as any).from("order_payment_proofs").insert({
        order_id: detailDoc.id,
        proof_type: file.type.startsWith("image/") ? "imagem" : "arquivo",
        file_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        uploaded_by: userId,
      });
      if (error) {
        // Se o registro falhar, não mantenha um arquivo sem vínculo no Storage.
        await client.storage.from("payment-proofs").remove([path]);
        throw error;
      }
      await detailQuery.refetch();
      toast.success("Comprovante enviado.");
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível enviar o comprovante.");
    } finally {
      setUploadingProof(false);
    }
  }

  async function openProof(proof: any) {
    if (proof.proof_type === "recibo_sistema" && proof.file_path)
      return void window.open(`/recibo/${proof.file_path}`, "_blank", "noopener");
    if (proof.external_url) return void window.open(proof.external_url, "_blank", "noopener");
    try {
      const { client } = await authenticatedFileClient();
      const { data: signed, error } = await client.storage
        .from("payment-proofs")
        .createSignedUrl(proof.file_path, 300);
      if (error || !signed?.signedUrl)
        throw error ?? new Error("Não foi possível criar o link do comprovante.");
      window.open(signed.signedUrl, "_blank", "noopener");
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível abrir o comprovante.");
    }
  }

  async function confirmProofDelete() {
    if (!proofToDelete || proofToDelete.payment_id) return;
    setBusy(true);
    try {
      await deleteUnusedPaymentProof({ data: { proofId: proofToDelete.id } });
      setProofToDelete(null);
      await detailQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["orders-history-feed"] });
      toast.success("Comprovante excluído e registrado no histórico.");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível excluir o comprovante.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteDoc || deleteReason.trim().length < 5)
      return void toast.error("Informe o motivo da exclusão.");
    setBusy(true);
    try {
      await deleteOrderWithReservationRepair({
        data: { orderId: deleteDoc.id, reason: deleteReason },
      });
      setDeleteDoc(null);
      setDeleteReason("");
      await queryClient.invalidateQueries();
      toast.success("Pedido excluído e registrado no histórico.");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível excluir o pedido.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPartialPayment() {
    const proof = (detailQuery.data?.proofs ?? []).find((item: any) => !item.payment_id);
    const amount = toNumber(receivedAmount);
    const outstanding = round2(
      Number(detailQuery.data?.receivable ?? detailDoc?.amount_receivable ?? 0),
    );
    const isCash = receivedMethod.trim().toLowerCase() === "dinheiro";
    if (!isCash && !proof) return void toast.error("Envie um comprovante novo para esta baixa.");
    if (!(amount > 0)) return void toast.error("Informe o valor recebido.");
    const manualPaymentExchange = receivedExchangeMode === "manual"
      ? manualExchange(
          (detailDoc?.currency ?? "BRL") as Currency,
          toNumber(receivedManualBrl),
          toNumber(receivedManualPyg),
        )
      : null;
    if (receivedExchangeMode === "manual" && !manualPaymentExchange)
      return void toast.error("Informe cotações manuais válidas, maiores que zero.");
    if (!detailDoc?.customer_id && !isPix(receivedMethod) && outstanding > 0 && amount > outstanding)
      return void toast.error(
        `O valor informado é maior que o saldo de ${rates
          .allCurrencies(outstanding, detailQuery.data?.currency ?? detailDoc?.currency ?? "BRL")
          .map((item) => item.text)
          .join(" · ")}.`,
      );
    setBusy(true);
    try {
      const result = await (detailDoc?.customer_id
        ? registerPaymentWithCustomerCredit
        : registerPaymentReceived)(
        detailDoc.id,
        amount,
        receivedMethod,
        proof?.id ?? null,
        manualPaymentExchange,
      );
      if (result?.payment_id)
        await updatePaymentDate(detailDoc.id, result.payment_id, receivedDate || null);
      setCashReceiptToken(String(result?.receipt_token ?? ""));
      setReceivedAmount("");
      setReceivedExchangeMode("automatic");
      await detailQuery.refetch();
      await queryClient.invalidateQueries();
      toast.success(
        Number(result?.credit_created ?? 0) > 0
          ? `Pagamento concluído. ${formatMoney(Number(result.credit_created), detailQuery.data?.currency ?? detailDoc.currency)} virou crédito do cliente.`
          : Number(result?.remaining ?? 0) > 0
          ? "Pagamento abatido. O saldo continua em aberto."
          : "Pagamento concluído e pedido marcado como pago.",
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível registrar o pagamento.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCustomerCredit() {
    const amount = round2(toNumber(creditUseAmount));
    const remaining = Number(detailQuery.data?.receivable ?? detailDoc?.amount_receivable ?? 0);
    if (!(amount > 0) || amount > selectedCustomerCredit || amount > remaining)
      return void toast.error("O abatimento deve estar dentro do crédito disponível e do saldo a pagar.");
    setBusy(true);
    try {
      await applyCustomerCredit(detailDoc.id, amount);
      setCreditUseAmount("");
      await detailQuery.refetch();
      await queryClient.invalidateQueries();
      toast.success(`${formatMoney(amount, detailDoc.currency)} abatido do pedido com crédito do cliente.`);
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível usar o crédito.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmShortDeliveryCredit() {
    const item = creditableItems.find((entry) => entry.id === shortItemId);
    const quantity = toNumber(shortQuantity);
    if (!item || !(quantity > 0) || quantity > item.quantity || shortReason.trim().length < 5)
      return void toast.error("Escolha o produto, a quantidade faltante e informe o motivo.");
    const amount = round2(Number(item.total) * quantity / Number(item.quantity));
    if (!(amount > 0)) return void toast.error("Este item não gerou cobrança para creditar.");
    setBusy(true);
    try {
      await issueCustomerCredit({ customerId: detailDoc.customer_id,
        currency: detailDoc.currency, amount, kind: "short_delivery",
        note: shortReason.trim(), orderItemId: item.id, shortQuantity: quantity });
      setShortItemId(""); setShortQuantity(""); setShortReason("");
      await queryClient.invalidateQueries({ queryKey: ["customer-credit", detailDoc.customer_id] });
      toast.success(`${formatMoney(amount, detailDoc.currency)} de crédito pela quantidade não entregue. A nota do pedido foi preservada.`);
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível registrar a diferença na entrega.");
    } finally { setBusy(false); }
  }

  function openPaymentEdit(payment: any) {
    setPaymentToEdit(payment);
    setPaymentEditAmount(
      Number(payment.received_amount ?? payment.amount ?? 0).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    );
    setPaymentEditMethod(payment.method || "Dinheiro");
    setPaymentEditReason("");
    setPaymentEditDate(payment.paid_at ?? new Date(payment.created_at).toLocaleDateString("en-CA"));
  }

  async function confirmPaymentEdit() {
    if (!paymentToEdit || !detailDoc) return;
    const amount = toNumber(paymentEditAmount);
    if (!(amount > 0)) return void toast.error("Informe o valor correto do pagamento.");
    if (paymentEditReason.trim().length < 5)
      return void toast.error("Informe o motivo da alteração.");
    const isCash = paymentEditMethod.trim().toLowerCase() === "dinheiro";
    const unusedProof = (detailQuery.data?.proofs ?? []).find((proof: any) => !proof.payment_id);
    setBusy(true);
    try {
      const result = await editPaymentReceived(
        detailDoc.id,
        paymentToEdit.id,
        amount,
        paymentEditMethod,
        isCash ? null : (unusedProof?.id ?? null),
        paymentEditReason,
      );
      await updatePaymentDate(
        detailDoc.id,
        result?.payment_id ?? paymentToEdit.id,
        paymentEditDate || null,
      );
      setPaymentToEdit(null);
      setPaymentEditReason("");
      await detailQuery.refetch();
      await queryClient.invalidateQueries();
      toast.success("Pagamento corrigido e saldo recalculado.");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível editar o pagamento.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPaymentCancel() {
    if (!paymentToCancel || !detailDoc) return;
    if (paymentCancelReason.trim().length < 5)
      return void toast.error("Informe o motivo do cancelamento.");
    setBusy(true);
    try {
      await cancelOrderPayment(detailDoc.id, paymentToCancel.id, paymentCancelReason);
      setPaymentToCancel(null);
      setPaymentCancelReason("");
      await detailQuery.refetch();
      await queryClient.invalidateQueries();
      toast.success("Pagamento cancelado. O saldo do pedido foi recalculado.");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível cancelar o pagamento.");
    } finally {
      setBusy(false);
    }
  }

  const detailQuery = useQuery({
    queryKey: ["sales-order-detail", detailDoc?.id],
    enabled: !!detailDoc && !isQuote,
    queryFn: async () => {
      const [detail, history, proofs, paymentRows, orderRates] = await Promise.all([
        (supabase as any).rpc("sales_order_detail", { p_order_id: detailDoc.id }),
        (supabase as any).rpc("sales_order_history", { p_order_id: detailDoc.id }),
        (supabase as any)
          .from("order_payment_proofs")
          .select("*")
          .eq("order_id", detailDoc.id)
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("payments")
          .select(
            "id,amount,received_amount,received_currency,currency,method,paid_at,created_at,status,exchange_rates_snapshot,exchange_rate_source,exchange_rate_locked_at",
          )
          .eq("order_id", detailDoc.id)
          .order("created_at", { ascending: true }),
        (supabase as any)
          .from("orders")
          .select("exchange_rates_snapshot,exchange_rate_source,exchange_rate_locked_at")
          .eq("id", detailDoc.id)
          .single(),
      ]);
      if (detail.error) throw detail.error;
      if (history.error) throw history.error;
      if (proofs.error) throw proofs.error;
      if (paymentRows.error) throw paymentRows.error;
      if (orderRates.error) throw orderRates.error;
      return {
        ...detail.data,
        ...orderRates.data,
        history: history.data ?? [],
        proofs: proofs.data ?? [],
        registeredPayments: paymentRows.data ?? [],
      } as any;
    },
  });

  function exchangeSnapshotText(snapshot: any) {
    if (!snapshot?.base) return "Cotação não registrada";
    const base = String(snapshot.base);
    return (["BRL", "USD", "PYG"] as const)
      .filter((currency) => currency !== base && snapshot[currency] != null)
      .map(
        (currency) => `1 ${base} = ${formatExchangeRate(Number(snapshot[currency]))} ${currency}`,
      )
      .join(" · ");
  }

  const paid = round2(payments.reduce((s, p) => s + p.amount, 0));
  const payTotal = round2(Number(payOpen?.total ?? 0));
  const manualPaymentPreviewExchange = manualExchange(
    (detailDoc?.currency ?? "BRL") as Currency,
    toNumber(receivedManualBrl),
    toNumber(receivedManualPyg),
  );
  const manualPaymentPreviewCredit = receivedExchangeMode === "manual" && isPix(receivedMethod)
    && manualPaymentPreviewExchange && toNumber(receivedAmount) > 0
      ? exchangeConvert(
          toNumber(receivedAmount), "BRL", (detailDoc?.currency ?? "BRL") as Currency,
          manualPaymentPreviewExchange,
        )
      : null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando documentos…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <Label htmlFor={`busca-${kind}`}>Buscar</Label>
          <Input
            id={`busca-${kind}`}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Número, cliente, documento, vendedor ou produto"
          />
        </div>
        <div>
          <Label>Situação</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">{isQuote ? "Todos os orçamentos" : "Todas"}</SelectItem>
              {STATUS_OPTIONS[kind].map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s] ?? s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Vendedor</Label>
          <Select value={seller} onValueChange={setSeller}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {visiblePeople.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Equipe</Label>
          <Select
            value={team}
            onValueChange={(value) => {
              setTeam(value);
              if (
                value !== "todos" &&
                seller !== "todos" &&
                !teamMembers.some(
                  (member: any) => member.team_id === value && member.user_id === seller,
                )
              )
                setSeller("todos");
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              {teams.map((item: any) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Produto</Label>
          <Select value={selectedProduct} onValueChange={setSelectedProduct}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {inventoryItems.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Fornecedor</Label>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-44" aria-label="Fornecedor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {(inventoryMetadata.data?.suppliers ?? [])
                .filter((supplier) =>
                  (data?.lines ?? []).some(
                    (line: any) =>
                      (line.supplier_id ??
                        inventoryItems.find((item) => item.id === line.item_id)?.supplier_id) ===
                      supplier.id,
                  ),
                )
                .map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Origem</Label>
          <Select value={origin} onValueChange={setOrigin}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              <SelectItem value="pdv">Caixa</SelectItem>
              <SelectItem value="planilha_onedrive">Planilha importada</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Ordenar por</Label>
          <Select
            value={sortOrder}
            onValueChange={(value) => {
              setSortOrder(value as typeof sortOrder);
              localStorage.setItem(sortStorageKey, value);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recentes">Mais recentes</SelectItem>
              <SelectItem value="antigos">Mais antigos</SelectItem>
              <SelectItem value="numero_asc">Número: 01 ao maior</SelectItem>
              <SelectItem value="numero_desc">Número: maior ao 01</SelectItem>
              <SelectItem value="alfabetica">Cliente: A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="orders-filter-from">De</Label>
            <Input id="orders-filter-from" type="date" className="w-40" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="orders-filter-to">Até</Label>
            <Input id="orders-filter-to" type="date" className="w-40" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} />
          </div>
          {(dateFrom || dateTo) && (
            <Button type="button" variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>
              Limpar
            </Button>
          )}
        </div>
        <div>
          <Label>Formato de impressão</Label>
          <Select
            value={printFormat}
            onValueChange={(value) => {
              setPrintFormat(value as PrintFormat);
              setPrintOverrides({});
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A4">A4 / PDF</SelectItem>
              <SelectItem value="80">80 mm</SelectItem>
              <SelectItem value="58">58 mm</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end">
        {!isQuote && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => void copyReportLink()}>
              <Link2 className="mr-2 size-4" /> Gerar link
            </Button>
            <ReportButton
              title={
                allOrders
                  ? "Relatório de todos os pedidos"
                  : `Relatório — ${stage ? stageLabel({ workflow_stage: stage }) : "Pedidos"}`
              }
              description="Selecione os pedidos e baixe o PDF com os detalhes, itens e valores."
              filename={allOrders ? "todos-os-pedidos" : `pedidos-${stage ?? "aba"}`}
              label="Exportar relatório"
              build={buildOrdersReport}
              refreshKey={JSON.stringify([
                reportScope, reportFrom, reportTo, reportSeller, reportStatus,
                reportProduct, reportCurrency, reportNumber, dateFrom, dateTo, term,
                status, seller, team, selectedProduct, origin, supplierFilter,
                sortOrder, dataUpdatedAt,
              ])}
              filters={
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Label>Base do relatório</Label>
                    <Select value={reportScope} onValueChange={(value) => setReportScope(value as "tela" | "aba")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tela">Filtros da tela</SelectItem>
                        <SelectItem value="aba">Todos desta aba</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Número do pedido</Label>
                    <Input value={reportNumber} onChange={(event) => setReportNumber(event.target.value)} placeholder="Ex.: 01" />
                  </div>
                  <div>
                    <Label>Data inicial</Label>
                    <Input type="date" value={reportFrom} max={reportTo || undefined} onChange={(event) => setReportFrom(event.target.value)} />
                  </div>
                  <div>
                    <Label>Data final</Label>
                    <Input type="date" value={reportTo} min={reportFrom || undefined} onChange={(event) => setReportTo(event.target.value)} />
                  </div>
                  <div>
                    <Label>Vendedor</Label>
                    <Select value={reportSeller} onValueChange={setReportSeller}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        {people.map((person: any) => <SelectItem key={person.id} value={person.id}>{person.full_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Situação</Label>
                    <Select value={reportStatus} onValueChange={setReportStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas</SelectItem>
                        {WORKFLOW_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Produto</Label>
                    <Select value={reportProduct} onValueChange={setReportProduct}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        {inventoryItems.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Moeda</Label>
                    <Select value={reportCurrency} onValueChange={setReportCurrency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas</SelectItem>
                        <SelectItem value="BRL">BRL</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="PYG">PYG</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(data?.docs ?? []).length >= 500 && (
                    <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
                      Esta tela carrega até 500 pedidos recentes. Se precisar de um período maior, divida a consulta em relatórios menores.
                    </p>
                  )}
                </div>
              }
            />
          </div>
        )}
      </div>

      {docs.length === 0 ? (
        <EmptyState
          title={requestsOnly ? "Nenhuma solicitação pendente" : "Nenhum documento no período"}
          description={
            requestsOnly
              ? "As novas solicitações enviadas pelos catálogos aparecerão aqui."
              : "Ajuste os filtros ou registre uma nova operação no caixa."
          }
        />
      ) : (
        <div className="grid gap-3">
          {docs.map((d: any) => {
            const c = customerOf(d.customer_id);
            const docLines = linesOf(d.id);
            const totalUnits = docLines.reduce(
              (sum: number, line: any) => sum + Number(line.quantity ?? 0),
              0,
            );
            const cur = (d.currency ?? "BRL") as Currency;
            const cancelled = d.status === "cancelado" || d.status === "recusado";
            const catalogRequest = isCatalogRequest(d);
            const commission = cancelled ? 0 : Math.max(0, Number(d.commission_total ?? 0));
            const paidRatio =
              Number(d.total ?? 0) > 0
                ? Math.min(1, Math.max(0, Number(d.amount_paid ?? 0) / Number(d.total)))
                : 0;
            const releasedCommission = d.kind === "venda" ? round2(commission * paidRatio) : 0;
            return (
              <Card
                key={d.id}
                className="[contain-intrinsic-size:auto_320px] [content-visibility:auto]"
              >
                <CardContent className="grid gap-4 pt-4">
                  <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {isQuote
                          ? documentCode("orcamento", d.number)
                          : `${catalogRequest ? "Solicitação" : "Pedido"} ${orderNumber(d.number, d.revision_no)}`}{" "}
                        · {c?.name ?? "Venda balcão"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(d.order_date ?? d.created_at)} · {sellerName(d.seller_id)} ·{" "}
                        {docLines.length} item(ns) · {formatNumber(totalUnits)} unidade(s)
                        {d.valid_until ? ` · validade ${formatDate(d.valid_until)}` : ""}
                      </p>
                      {d.converted_order_id && (
                        <p className="text-xs text-primary">
                          Convertido em pedido (mantido no histórico)
                        </p>
                      )}
                      {d.cancel_reason && (
                        <p className="text-xs text-destructive">Motivo: {d.cancel_reason}</p>
                      )}
                      {!stockOnly && (
                        <div className="mt-2 grid gap-x-5 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                          <span>
                            Pago:{" "}
                            <strong className="text-foreground">
                              <CurrencyValues value={Number(d.amount_paid ?? 0)} currency={cur} />
                            </strong>
                          </span>
                          <span>
                            A receber:{" "}
                            <strong className="text-foreground">
                              <CurrencyValues
                                value={Number(d.amount_receivable ?? 0)}
                                currency={cur}
                              />
                            </strong>
                          </span>
                          <span>
                            Comissão prevista:{" "}
                            <strong className="text-foreground">
                              <CurrencyValues value={commission} currency={cur} />
                            </strong>
                          </span>
                          <span>
                            Comissão liberada:{" "}
                            <strong className="text-foreground">
                              <CurrencyValues value={releasedCommission} currency={cur} />
                            </strong>
                          </span>
                          <span>
                            Bonificação:{" "}
                            <strong className="text-foreground">
                              <CurrencyValues value={Number(d.bonus_amount ?? 0)} currency={cur} />
                            </strong>
                          </span>
                          <span>
                            Margem:{" "}
                            <strong className="text-foreground">
                              <CurrencyValues value={Number(d.gross_margin ?? 0)} currency={cur} />
                            </strong>
                          </span>
                          {seesCompanyFinance && (
                            <span>
                              Custo em BRL:{" "}
                              <strong className="text-foreground">
                                <CurrencyValues
                                  value={Number(d.total_cost_brl ?? 0)}
                                  currency="BRL"
                                />
                              </strong>
                            </span>
                          )}
                          {seesCompanyFinance && (
                            <span>
                              Custo em USD:{" "}
                              <strong className="text-foreground">
                                <CurrencyValues
                                  value={Number(d.total_cost_usd ?? 0)}
                                  currency="USD"
                                />
                              </strong>
                            </span>
                          )}
                          <span>
                            Mês:{" "}
                            <strong className="text-foreground">{d.source_month ?? "—"}</strong>
                          </span>
                          <span>
                            Envio:{" "}
                            <strong className="text-foreground">{d.tracking_status ?? "—"}</strong>
                          </span>
                          {d.tracking_code && (
                            <span className="sm:col-span-2">
                              Rastreio:{" "}
                              <strong className="text-foreground">{d.tracking_code}</strong>
                            </span>
                          )}
                          {(d.notes || d.source_payload?.observations) && (
                            <span className="sm:col-span-2 lg:col-span-4">
                              Observações:{" "}
                              <strong className="text-foreground">
                                {d.notes || d.source_payload?.observations}
                              </strong>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3 lg:justify-end">
                      {catalogRequest ? (
                        <Badge variant="secondary">Aguardando revisão</Badge>
                      ) : !isQuote && !cancelled ? (
                        <Select
                          value={d.workflow_stage ?? "pedido_feito"}
                          onValueChange={(next) => {
                            if (next === "cancelado") {
                              setCancelReason("");
                              suggestReturnWarehouse(d, false);
                              setCancelDoc(d);
                            } else if (next === "pagamento_parcial") {
                              setDetailDoc(d);
                              toast.info(
                                "Registre o valor recebido e vincule o comprovante nos detalhes do pedido.",
                              );
                            } else if (next !== d.workflow_stage) {
                              void changeStage(d, next);
                            }
                          }}
                          disabled={busy}
                        >
                          <SelectTrigger
                            aria-label={`Alterar situação do pedido ${d.number}`}
                            className={cn(
                              "h-8 w-auto min-w-44 rounded-full border px-3 font-medium shadow-none",
                              workflowTone(d.workflow_stage),
                            )}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WORKFLOW_OPTIONS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                                className={option.value === "cancelado" ? "text-destructive" : ""}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={cancelled ? "outline" : "secondary"}>
                          {allOrders
                            ? stageLabel(d)
                            : stage === "cancelado"
                              ? "Cancelado"
                              : (STATUS_LABEL[d.status] ?? d.status)}
                        </Badge>
                      )}
                      {!stockOnly && (
                        <span className="font-semibold">
                          <CurrencyValues value={Number(d.total ?? 0)} currency={cur} />
                        </span>
                      )}
                    </div>
                  </div>
                    {canUseLineCosts && !isQuote && docLines.length > 0 && (
                      <div className="overflow-x-auto rounded-lg border p-3 text-xs">
                        <p className="mb-2 font-medium">Custos dos produtos ({cur})</p>
                        <table className="w-full text-left">
                          <thead><tr className="border-b"><th className="py-1 pr-3">Produto</th><th className="py-1 pr-3 text-right">Qtd.</th><th className="py-1 pr-3 text-right">Custo por unidade</th><th className="py-1 text-right">Custo do produto</th></tr></thead>
                          <tbody>{docLines.map((line: any) => {
                            const unitCost = (costsByLine.get(line.id) as any)?.unit_cost;
                            return <tr key={line.id} className="border-b last:border-0">
                              <td className="py-1 pr-3">{line.description}</td>
                              <td className="py-1 pr-3 text-right">{formatNumber(Number(line.quantity ?? 0))}</td>
                              <td className="py-1 pr-3 text-right">{unitCost == null ? "—" : formatMoney(Number(unitCost), cur)}</td>
                              <td className="py-1 text-right">{unitCost == null ? "—" : formatMoney(round2(Number(unitCost) * Number(line.quantity ?? 0)), cur)}</td>
                            </tr>;
                          })}</tbody>
                        </table>
                      </div>
                    )}
                  {!isQuote && !stockOnly && !cancelled && (
                    <PaymentMeter paid={Number(d.amount_paid || 0)} total={Number(d.total || 0)} />
                  )}
                  <div className="flex min-h-10 flex-wrap items-center gap-2 border-t pt-3">
                    {!isQuote && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setDetailDoc(d)}
                      >
                        <Eye className="mr-1 h-4 w-4" /> Ver detalhes
                      </Button>
                    )}
                    {!catalogRequest && (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">Formato da nota</span>
                          <Select
                            value={printOverrides[d.id] ?? printFormat}
                            onValueChange={(value) =>
                              setPrintOverrides((current) => ({
                                ...current,
                                [d.id]: value as PrintFormat,
                              }))
                            }
                          >
                            <SelectTrigger className="h-8 w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="A4">A4 / PDF</SelectItem>
                              <SelectItem value="80">80 mm</SelectItem>
                              <SelectItem value="58">58 mm</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void printComplete(d)}
                        >
                          <Printer className="mr-1 h-4 w-4" /> Nota do cliente
                        </Button>
                        {!isQuote && seesCompanyFinance && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void printComplete(d, "internal")}
                          >
                            <FileText className="mr-1 h-4 w-4" /> Relatório interno
                          </Button>
                        )}
                        {!isQuote && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void copyOrderLink(d)}
                          >
                            <Copy className="mr-1 h-4 w-4" /> Gerar link
                          </Button>
                        )}
                      </>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        window.open(
                          whatsappLink(
                            d.whatsapp || c?.whatsapp || c?.phone,
                            documentMessage(buildPrint(d)),
                          ),
                          "_blank",
                          "noopener",
                        )
                      }
                    >
                      <Send className="mr-1 h-4 w-4" /> WhatsApp
                    </Button>
                    {!cancelled && kind === "orcamento" && !d.converted_order_id && (
                      <>
                        <Button type="button" size="sm" onClick={() => openPayments(d, "venda")}>
                          <Wallet className="mr-1 h-4 w-4" /> Converter em venda
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => openPayments(d, "pre_pedido")}
                        >
                          <FileText className="mr-1 h-4 w-4" /> Gerar pré-pedido
                        </Button>
                      </>
                    )}
                    {!cancelled && !isQuote && onEdit && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => editInPdv(d)}>
                        <Pencil className="mr-1 h-4 w-4" />
                        {catalogRequest ? "Revisar solicitação" : "Editar pedido"}
                      </Button>
                    )}
                    {!cancelled && !isQuote && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setDeleteDoc(d)}
                      >
                        <Trash2 className="mr-1 h-4 w-4" /> Excluir
                      </Button>
                    )}
                    {!cancelled && isQuote && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setCancelWarehouseId("");
                          setCancelDoc(d);
                        }}
                      >
                        <Ban className="mr-1 h-4 w-4" /> Recusar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!detailDoc} onOpenChange={(o) => !o && setDetailDoc(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Detalhes {isCatalogRequest(detailDoc) ? "da solicitação" : "do pedido"}{" "}
              {orderNumber(detailDoc?.number, detailDoc?.revision_no)}
            </DialogTitle>
          </DialogHeader>
          {detailDoc && onEdit && detailDoc.status !== "cancelado" && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  editInPdv(detailDoc);
                  setDetailDoc(null);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                {isCatalogRequest(detailDoc) ? "Revisar e gerar pedido" : "Editar pedido"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-destructive"
                onClick={() => {
                  setDeleteDoc(detailDoc);
                  setDetailDoc(null);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {isCatalogRequest(detailDoc) ? "Excluir solicitação" : "Excluir pedido"}
              </Button>
            </div>
          )}
          {detailQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando detalhes…</p>
          ) : (
            detailQuery.data && (
              <div className="space-y-4 text-sm">
                <div className="grid gap-3 rounded-lg bg-muted/50 p-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <span className="text-muted-foreground">Cliente</span>
                    <p className="font-medium">
                      {detailQuery.data.customer?.name ?? "Venda balcão"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fornecedor</span>
                    <p className="font-medium">
                      {detailQuery.data.supplier?.name ?? "Conforme itens"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Estoque</span>
                    <p className="font-medium">
                      {detailQuery.data.warehouse?.name ?? "Não definido"}
                      {detailQuery.data.warehouse?.city
                        ? ` · ${detailQuery.data.warehouse.city}/${detailQuery.data.warehouse.state}`
                        : ""}
                    </p>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <span className="text-muted-foreground">Despacho</span>
                    <p className="font-medium">
                      {[
                        detailQuery.data.shipping?.address,
                        detailDoc.shipping_address_number,
                        detailQuery.data.shipping?.city,
                        detailQuery.data.shipping?.state,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Não informado"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Data de emissão</span>
                    <p className="font-medium">
                      {formatDate(detailDoc.order_date ?? detailDoc.created_at)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Previsão de entrega</span>
                    <p className="font-medium">
                      {detailDoc.delivery_deadline
                        ? formatDate(detailDoc.delivery_deadline)
                        : "Não informada"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Entrega real</span>
                    <p className="font-medium">
                      {detailDoc.delivered_at
                        ? formatDate(detailDoc.delivered_at)
                        : "Não informada"}
                    </p>
                  </div>
                </div>
                {detailDoc.delivery_token && (
                  <DeliveryQr token={detailDoc.delivery_token} number={detailDoc.number} compact />
                )}
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-left">
                    <thead className="border-b bg-muted/40">
                      <tr>
                        <th className="p-3">Produto</th>
                        <th className="p-3">Categoria</th>
                        <th className="p-3">Subcategoria</th>
                        <th className="p-3">Fornecedor</th>
                        <th className="p-3 text-right">Qtd.</th>
                        {detailQuery.data.total != null && (
                          <>
                            <th className="p-3 text-right">Preço unitário no pedido</th>
                            <th className="p-3 text-right">Pago por unidade até agora</th>
                            <th className="p-3 text-right">Valor total</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {(detailQuery.data.items ?? []).map((i: any, idx: number) => (
                        <tr key={idx} className="border-b last:border-0">
                          <td className="p-3">
                            <p className="font-medium">{i.description}</p>
                            <p className="text-xs text-muted-foreground">{i.sku ?? "Sem SKU"}</p>
                          </td>
                          <td className="p-3">{i.product ?? "—"}</td>
                          <td className="p-3">{i.subcategory ?? "—"}</td>
                          <td className="p-3">{i.supplier ?? "—"}</td>
                          <td className="p-3 text-right">{i.quantity}</td>
                          {detailQuery.data.total != null && (
                            <>
                              <td className="p-3 text-right">
                                <CurrencyValues
                                  value={Number(i.unit_price ?? 0)}
                                  currency={detailQuery.data.currency}
                                />
                              </td>
                              <td className="p-3 text-right">
                                <CurrencyValues
                                  value={
                                    Number(i.quantity ?? 0) > 0 &&
                                    Number(detailQuery.data.total ?? 0) > 0
                                      ? (Number(i.total ?? 0) / Number(i.quantity)) *
                                        Math.min(
                                          1,
                                          Number(detailQuery.data.paid ?? 0) /
                                            Number(detailQuery.data.total),
                                        )
                                      : 0
                                  }
                                  currency={detailQuery.data.currency}
                                />
                              </td>
                              <td className="p-3 text-right">
                                <CurrencyValues
                                  value={Number(i.total ?? 0)}
                                  currency={detailQuery.data.currency}
                                />
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {canUseLineCosts && linesOf(detailDoc.id).length > 0 && (
                  <div className="overflow-x-auto rounded-lg border p-3">
                    <p className="mb-2 font-medium">Custos dos produtos ({detailQuery.data.currency ?? detailDoc.currency ?? "BRL"})</p>
                    <table className="w-full text-left">
                      <thead><tr className="border-b"><th className="p-2">Produto</th><th className="p-2 text-right">Qtd.</th><th className="p-2 text-right">Custo por unidade</th><th className="p-2 text-right">Custo do produto</th></tr></thead>
                      <tbody>{linesOf(detailDoc.id).map((line: any) => {
                        const unitCost = (costsByLine.get(line.id) as any)?.unit_cost;
                        const currency = (detailQuery.data.currency ?? detailDoc.currency ?? "BRL") as Currency;
                        return <tr key={line.id} className="border-b last:border-0">
                          <td className="p-2">{line.description}</td>
                          <td className="p-2 text-right">{formatNumber(Number(line.quantity ?? 0))}</td>
                          <td className="p-2 text-right">{unitCost == null ? "—" : formatMoney(Number(unitCost), currency)}</td>
                          <td className="p-2 text-right">{unitCost == null ? "—" : formatMoney(round2(Number(unitCost) * Number(line.quantity ?? 0)), currency)}</td>
                        </tr>;
                      })}</tbody>
                    </table>
                  </div>
                )}
                {detailQuery.data.total != null && (
                  <div className="flex flex-wrap justify-end gap-5 rounded-lg border p-3">
                    <span>
                      Total:{" "}
                      <strong>
                        <CurrencyValues
                          value={Number(detailQuery.data.total)}
                          currency={detailQuery.data.currency}
                        />
                      </strong>
                    </span>
                    <span>
                      Pago:{" "}
                      <strong>
                        <CurrencyValues
                          value={Number(detailQuery.data.paid ?? 0)}
                          currency={detailQuery.data.currency}
                        />
                      </strong>
                    </span>
                    <span>
                      A receber:{" "}
                      <strong>
                        <CurrencyValues
                          value={Number(detailQuery.data.receivable ?? 0)}
                          currency={detailQuery.data.currency}
                        />
                      </strong>
                    </span>
                    {detailQuery.data.cost_brl != null && (
                      <span>
                        Custo:{" "}
                        <strong>
                          <CurrencyValues
                            value={Number(detailQuery.data.cost_brl)}
                            currency="BRL"
                          />
                        </strong>
                      </span>
                    )}
                  </div>
                )}
                {canIssueCredit && detailDoc?.customer_id && creditableItems.length > 0 && (
                  <div className="rounded-lg border p-3">
                    <p className="font-medium">Produto enviado a menos</p>
                    <p className="mb-3 text-xs text-muted-foreground">
                      Gera crédito pelo valor cobrado das unidades faltantes, sem alterar a nota original.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-[2fr_1fr_2fr_auto] sm:items-end">
                      <div>
                        <Label>Produto</Label>
                        <Select value={shortItemId} onValueChange={setShortItemId}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>{creditableItems.map((item) => (
                            <SelectItem key={item.id} value={item.id}>{item.description} · {item.quantity} un.</SelectItem>
                          ))}</SelectContent>
                        </Select>
                      </div>
                      <div><Label>Quantidade faltante</Label><Input value={shortQuantity}
                        onChange={(event) => setShortQuantity(event.target.value)} inputMode="decimal" /></div>
                      <div><Label>Motivo</Label><Input value={shortReason}
                        onChange={(event) => setShortReason(event.target.value)} placeholder="Ex.: 2 unidades não enviadas" /></div>
                      <Button type="button" variant="outline" onClick={confirmShortDeliveryCredit} disabled={busy}>Gerar crédito</Button>
                    </div>
                  </div>
                )}
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center gap-2 font-medium">
                    <Wallet className="h-4 w-4" /> Cotações registradas
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="font-medium">
                      Cotação na criação{" "}
                      {isCatalogRequest(detailDoc) ? "da solicitação" : "do pedido"}
                    </p>
                    <p>{exchangeSnapshotText(detailQuery.data.exchange_rates_snapshot)}</p>
                    <p className="text-xs text-muted-foreground">
                      {detailQuery.data.exchange_rate_locked_at
                        ? new Date(detailQuery.data.exchange_rate_locked_at).toLocaleString("pt-BR")
                        : "Pedidos anteriores podem não ter uma cotação histórica salva."}
                      {detailQuery.data.exchange_rate_source
                        ? ` · ${detailQuery.data.exchange_rate_source}`
                        : ""}
                    </p>
                  </div>
                  {!isCatalogRequest(detailDoc) &&
                    ((detailQuery.data.registeredPayments ?? []).length ? (
                      <div className="grid gap-2">
                        {detailQuery.data.registeredPayments.map((payment: any, index: number) => (
                          <div key={payment.id} className="rounded-md border p-3">
                            <div className="flex flex-wrap items-start gap-2">
                              <div className="mr-auto">
                                <p className="font-medium">
                                  Pagamento {index + 1} ·{" "}
                                  <CurrencyValues
                                    value={Number(payment.received_amount ?? payment.amount)}
                                    currency={payment.received_currency ?? payment.currency}
                                    layout="inline"
                                  />
                                </p>
                                {payment.status === "cancelado" && (
                                  <Badge variant="destructive" className="mt-1">
                                    Registro cancelado
                                  </Badge>
                                )}
                              </div>
                              {payment.status === "pago" && (
                                <>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openPaymentEdit(payment)}
                                  >
                                    <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => {
                                      setPaymentToCancel(payment);
                                      setPaymentCancelReason("");
                                    }}
                                  >
                                    <Ban className="mr-1 h-3.5 w-3.5" /> Cancelar registro
                                  </Button>
                                </>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {payment.method} · {formatDate(payment.paid_at ?? payment.created_at)}
                            </p>
                            <p className="mt-1">
                              {exchangeSnapshotText(payment.exchange_rates_snapshot)}
                            </p>
                            {payment.exchange_rate_source && (
                              <p className="text-xs text-muted-foreground">
                                {payment.exchange_rate_locked_at
                                  ? new Date(payment.exchange_rate_locked_at).toLocaleString(
                                      "pt-BR",
                                    )
                                  : ""}
                                {` · ${payment.exchange_rate_source}`}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Ainda não há pagamentos registrados para este pedido.
                      </p>
                    ))}
                </div>
                {!isCatalogRequest(detailDoc) && (
                  <div className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-center gap-2 font-medium">
                      <Upload className="h-4 w-4" /> Comprovantes de pagamento
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <div className="min-w-56 flex-1">
                        <Label htmlFor="payment-proof-file">Enviar foto ou documento</Label>
                        <Input
                          id="payment-proof-file"
                          type="file"
                          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                          disabled={uploadingProof}
                          aria-label="Escolher comprovante para anexar ao pagamento"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void uploadProof(file);
                            event.currentTarget.value = "";
                          }}
                        />
                        {uploadingProof && (
                          <p className="mt-1 text-xs text-muted-foreground">Enviando comprovante…</p>
                        )}
                      </div>
                      <Input
                        className="min-w-56 flex-1"
                        value={proofUrl}
                        onChange={(e) => setProofUrl(e.target.value)}
                        placeholder="Ou cole o link do comprovante"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={uploadingProof}
                        onClick={() => void addProofLink()}
                      >
                        Registrar link
                      </Button>
                    </div>
                    {(detailQuery.data.proofs ?? []).length ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {detailQuery.data.proofs.map((proof: any) => (
                          <div key={proof.id} className="flex min-w-0 gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              className="min-w-0 flex-1 justify-start"
                              onClick={() => void openProof(proof)}
                            >
                              <FileText className="mr-2 h-4 w-4 shrink-0" />
                              <span className="truncate">
                                {proof.file_name ?? "Abrir comprovante"}
                              </span>
                            </Button>
                            {!proof.payment_id && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Excluir ${proof.file_name ?? "comprovante"}`}
                                className="text-destructive hover:text-destructive"
                                onClick={() => setProofToDelete(proof)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-amber-700">
                        O pedido só poderá ser marcado como pago depois do envio do comprovante.
                      </p>
                    )}
                    <div className="space-y-3 rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label>Câmbio deste pagamento</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (receivedExchangeMode === "manual") {
                              setReceivedExchangeMode("automatic");
                              return;
                            }
                            const snapshot = detailQuery.data?.exchange_rates_snapshot;
                            const usd = Number(snapshot?.USD);
                            setReceivedManualBrl(String(
                              usd > 0 && Number(snapshot.BRL) > 0
                                ? Number((Number(snapshot.BRL) / usd).toFixed(6))
                                : (rates.convert(1, "USD", "BRL") ?? ""),
                            ));
                            setReceivedManualPyg(String(
                              usd > 0 && Number(snapshot.PYG) > 0
                                ? Number((Number(snapshot.PYG) / usd).toFixed(6))
                                : (rates.convert(1, "USD", "PYG") ?? ""),
                            ));
                            setReceivedExchangeMode("manual");
                          }}
                        >
                          {receivedExchangeMode === "manual"
                            ? "Usar cotação do pedido"
                            : "Informar câmbio manual"}
                        </Button>
                      </div>
                      {receivedExchangeMode === "manual" ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <Label htmlFor="payment-manual-brl">1 dólar em reais (R$)</Label>
                            <Input
                              id="payment-manual-brl"
                              value={receivedManualBrl}
                              onChange={(event) => setReceivedManualBrl(event.target.value)}
                              inputMode="decimal"
                            />
                          </div>
                          <div>
                            <Label htmlFor="payment-manual-pyg">1 dólar em guaranis (Gs.)</Label>
                            <Input
                              id="payment-manual-pyg"
                              value={receivedManualPyg}
                              onChange={(event) => setReceivedManualPyg(event.target.value)}
                              inputMode="decimal"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground sm:col-span-2">
                            Esta cotação será salva apenas neste pagamento e usada para calcular o valor abatido.
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Cotação do pedido: {exchangeSnapshotText(detailQuery.data?.exchange_rates_snapshot)}
                        </p>
                      )}
                    </div>
                    <div className="grid gap-2 border-t pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <div>
                        <Label>
                          Valor recebido (
                          {isPix(receivedMethod) ? "BRL � R$" : (detailDoc?.currency ?? "BRL")})
                        </Label>
                        <Input
                          value={receivedAmount}
                          onChange={(e) => setReceivedAmount(e.target.value)}
                          onBlur={() => {
                            const amount = toNumber(receivedAmount);
                            if (amount > 0)
                              setReceivedAmount(
                                amount.toLocaleString("pt-BR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                }),
                              );
                          }}
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="0,00"
                        />
                        {manualPaymentPreviewCredit != null && (
                          <p className="mt-1 text-xs font-medium">
                            Valor abatido com este câmbio: {formatMoney(round2(manualPaymentPreviewCredit), (detailDoc?.currency ?? "BRL") as Currency)}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          Saldo em aberto:{" "}
                          <CurrencyValues
                            value={Number(detailQuery.data.receivable ?? 0)}
                            currency={detailQuery.data.currency}
                            layout="inline"
                          />
                        </p>
                        {detailDoc?.customer_id && (
                          <div className="mt-3 rounded-lg border bg-primary/5 p-3">
                            <p className="text-sm font-medium">Crédito do cliente: {formatMoney(selectedCustomerCredit, detailQuery.data.currency)}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Input className="max-w-44" aria-label="Valor do crédito a abater"
                                value={creditUseAmount} onChange={(event) => setCreditUseAmount(event.target.value)}
                                inputMode="decimal" placeholder="Valor a abater" />
                              <Button type="button" variant="secondary" onClick={confirmCustomerCredit}
                                disabled={busy || selectedCustomerCredit <= 0 || Number(detailQuery.data.receivable ?? 0) <= 0}>
                                Usar crédito
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div>
                        <Label>Forma de pagamento</Label>
                        <Select
                          value={receivedMethod}
                          onValueChange={(value) => {
                            setReceivedMethod(value);
                            setReceivedAmount("");
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_METHODS.map((method) => (
                              <SelectItem key={method} value={method}>
                                {method}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Data do pagamento</Label>
                        <Input
                          type="date"
                          value={receivedDate}
                          onChange={(e) => setReceivedDate(e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        disabled={busy || uploadingProof}
                        onClick={() => void confirmPartialPayment()}
                      >
                        Dar baixa
                      </Button>
                    </div>
                    {cashReceiptToken && (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                        <span className="mr-auto text-sm font-medium">
                          Recibo em dinheiro gerado e registrado.
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            window.open(`/recibo/${cashReceiptToken}`, "_blank", "noopener")
                          }
                        >
                          <FileText className="mr-2 size-4" /> Gerar arquivo
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={async () => {
                            await navigator.clipboard.writeText(
                              `${window.location.origin}/recibo/${cashReceiptToken}`,
                            );
                            toast.success("Link do recibo copiado.");
                          }}
                        >
                          <Link2 className="mr-2 size-4" /> Copiar link
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {receivedMethod.trim().toLowerCase() === "dinheiro"
                        ? "Em dinheiro, o sistema gera o recibo. Nos demais meios, anexe o comprovante antes da baixa."
                        : "Pagamentos parciais abatem o saldo. O pedido só muda para Pago quando o valor total for quitado."}
                    </p>
                  </div>
                )}
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2 font-medium">
                    <History className="h-4 w-4" /> Histórico de mudanças
                  </div>
                  {(detailQuery.data.history ?? []).length ? (
                    detailQuery.data.history.map((entry: any) => (
                      <div key={entry.id} className="border-l-2 pl-3 text-xs">
                        <p className="font-medium">
                          {entry.changed_by_name ?? "Usuário"} ·{" "}
                          {new Date(entry.created_at).toLocaleString("pt-BR")}
                        </p>
                        <p className="text-muted-foreground">{entry.note ?? entry.action}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">Nenhuma alteração registrada.</p>
                  )}
                </div>
                {detailQuery.data.cancel_reason && (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                    Cancelado: {detailQuery.data.cancel_reason}
                  </p>
                )}
              </div>
            )
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!paymentToEdit} onOpenChange={(open) => !open && setPaymentToEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar pagamento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O saldo e a situação do pedido serão recalculados. A alteração ficará registrada no
            histórico.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>
                Valor recebido (
                {isPix(paymentEditMethod) ? "BRL � R$" : (detailDoc?.currency ?? "BRL")})
              </Label>
              <Input
                value={paymentEditAmount}
                onChange={(event) => setPaymentEditAmount(event.target.value)}
                inputMode="decimal"
                autoComplete="off"
              />
            </div>
            <div>
              <Label>Forma de pagamento</Label>
              <Select
                value={paymentEditMethod}
                onValueChange={(value) => {
                  setPaymentEditMethod(value);
                  setPaymentEditAmount("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data do pagamento</Label>
              <Input
                type="date"
                value={paymentEditDate}
                onChange={(event) => setPaymentEditDate(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Motivo da alteração</Label>
            <Input
              value={paymentEditReason}
              onChange={(event) => setPaymentEditReason(event.target.value)}
              placeholder="Ex.: valor informado incorretamente"
            />
          </div>
          {paymentEditMethod.trim().toLowerCase() !== "dinheiro" && (
            <p className="text-xs text-muted-foreground">
              Para trocar para uma forma sem dinheiro, mantenha um comprovante vinculado ou envie um
              novo comprovante antes de salvar.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPaymentToEdit(null)}>
              Voltar
            </Button>
            <Button type="button" disabled={busy} onClick={() => void confirmPaymentEdit()}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Salvar correção
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!paymentToCancel} onOpenChange={(open) => !open && setPaymentToCancel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar registro de pagamento?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O valor voltará ao saldo em aberto do pedido. O pagamento e o comprovante continuarão
            visíveis no histórico como cancelados.
          </p>
          <div>
            <Label>Motivo do cancelamento</Label>
            <Input
              value={paymentCancelReason}
              onChange={(event) => setPaymentCancelReason(event.target.value)}
              placeholder="Ex.: pagamento registrado no pedido errado"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPaymentToCancel(null)}>
              Manter pagamento
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void confirmPaymentCancel()}
            >
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Cancelar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!proofToDelete} onOpenChange={(open) => !open && setProofToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir comprovante?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O comprovante enviado por engano será removido do pedido. Esta ação não pode ser
            desfeita.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setProofToDelete(null)}>
              Manter comprovante
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void confirmProofDelete()}
            >
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Excluir comprovante
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteDoc} onOpenChange={(open) => !open && setDeleteDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Excluir pedido {orderNumber(deleteDoc?.number, deleteDoc?.revision_no)}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A exclusão ajusta estoque e financeiro e fica registrada no histórico.
          </p>
          <div>
            <Label>Motivo da exclusão</Label>
            <Input value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDoc(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              Excluir pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PAGAMENTOS */}
      <Dialog open={!!payOpen} onOpenChange={(o) => !o && setPayOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {payTarget === "venda" ? "Faturar com pagamentos" : "Gerar pré-pedido"}
            </DialogTitle>
          </DialogHeader>
          {payTarget === "venda" ? (
            <div className="space-y-3 text-sm">
              <p>
                Total do documento:{" "}
                <strong>
                  <CurrencyValues
                    value={payTotal}
                    currency={(payOpen?.currency ?? "BRL") as Currency}
                  />
                </strong>
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label>Forma</Label>
                  <Select
                    value={payMethod}
                    onValueChange={(value) => {
                      setPayMethod(value);
                      setPayAmount("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>
                    Valor ({isPix(payMethod) ? "BRL � R$" : (payOpen?.currency ?? "BRL")})
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      inputMode="decimal"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        const received = round2(toNumber(payAmount));
                        const from = isPix(payMethod)
                          ? "BRL"
                          : ((payOpen?.currency ?? "BRL") as Currency);
                        const target = (payOpen?.currency ?? "BRL") as Currency;
                        const snapshot = payOpen?.exchange_rates_snapshot as
                          OrderExchange | undefined;
                        const converted = snapshot
                          ? exchangeConvert(received, from, target, snapshot)
                          : rates.convert(received, from, target);
                        if (converted === null)
                          return void toast.error("Cota��o para este pagamento indispon�vel.");
                        const v = round2(converted);
                        if (!(v > 0)) return void toast.error("Informe um valor válido.");
                        setPayments((p) => [
                          ...p,
                          {
                            method: payMethod,
                            installment: null,
                            amount: v,
                            received_amount: received,
                            received_currency: from,
                            paid_at: receivedDate,
                          },
                        ]);
                        setPayAmount("");
                      }}
                    >
                      Adicionar
                    </Button>
                  </div>
                </div>
                <div>
                  <Label>Data do pagamento</Label>
                  <Input
                    type="date"
                    value={receivedDate}
                    onChange={(e) => setReceivedDate(e.target.value)}
                  />
                </div>
              </div>
              <ul className="space-y-1">
                {payments.map((p, i) => (
                  <li key={i} className="flex items-center justify-between rounded border p-2">
                    <span>{p.method}</span>
                    <span className="flex items-center gap-2">
                      <CurrencyValues
                        value={p.received_amount ?? p.amount}
                        currency={p.received_currency ?? ((payOpen?.currency ?? "BRL") as Currency)}
                        layout="inline"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setPayments((prev) => prev.filter((_, x) => x !== i))}
                      >
                        Remover
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
              <p className={paid === payTotal ? "text-primary" : "text-destructive"}>
                Falta pagar:{" "}
                <CurrencyValues
                  value={Math.max(0, round2(payTotal - paid))}
                  currency={(payOpen?.currency ?? "BRL") as Currency}
                  layout="inline"
                />
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              O pré-pedido reserva o estoque dos itens, sem baixa e sem lançamento financeiro. O
              orçamento continua salvo no histórico.
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              onClick={confirmPayments}
              disabled={busy || (payTarget === "venda" && paid !== payTotal)}
            >
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CANCELAMENTO */}
      <Dialog open={!!cancelDoc} onOpenChange={(o) => !o && setCancelDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isQuote ? "Recusar orçamento" : "Cancelar documento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              O pedido sairá das contagens e das listas operacionais. O estoque volta e os
              lançamentos financeiros são cancelados; a ação permanece no histórico de auditoria.
            </p>
            <Label htmlFor="motivo">Motivo (obrigatório)</Label>
            <Input
              id="motivo"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Descreva o motivo"
            />
            {!isQuote && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <Label>Estoque de devolução</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => suggestReturnWarehouse(cancelDoc)}
                  >
                    Sugerir mais próximo
                  </Button>
                </div>
                <Select
                  value={cancelWarehouseId || cancelDoc?.warehouse_id || ""}
                  onValueChange={setCancelWarehouseId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Voltar ao estoque de saída" />
                  </SelectTrigger>
                  <SelectContent>
                    {(data?.warehouses ?? []).map((w: any) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name} · {w.city}/{w.state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  A sugestão considera primeiro a cidade e o estado do cliente. Você pode escolher
                  manualmente qualquer outro estoque.
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmCancel}
              disabled={busy || cancelReason.trim().length < 5}
            >
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function OrderHistoryList() {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["orders-history-feed"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("order_audit_log")
        .select(
          "id,order_id,new_order_id,action,revision_no,note,created_at,orders!order_id(number),profiles!changed_by(full_name)",
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });
  const selectedQuery = useQuery({
    queryKey: ["history-order-version", selectedOrderId],
    enabled: !!selectedOrderId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("sales_order_detail", {
        p_order_id: selectedOrderId,
      });
      if (error) throw error;
      return data as any;
    },
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando histórico…</p>;
  if (!data.length)
    return (
      <EmptyState
        title="Nenhuma mudança registrada"
        description="Edições, pagamentos, alterações de status e exclusões aparecerão aqui."
      />
    );
  return (
    <div className="grid gap-2">
      {data.map((entry: any) => (
        <Card
          key={entry.id}
          role="button"
          tabIndex={0}
          className="cursor-pointer transition-colors hover:border-primary/40 hover:bg-primary/[0.02]"
          onClick={() => setSelectedOrderId(entry.new_order_id || entry.order_id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setSelectedOrderId(entry.new_order_id || entry.order_id);
            }
          }}
        >
          <CardContent className="flex flex-wrap items-start justify-between gap-3 pt-4">
            <div>
              <p className="font-medium">
                Pedido {orderNumber(entry.orders?.number)} · versão {entry.revision_no}
              </p>
              <p className="text-sm text-muted-foreground">{entry.note ?? entry.action}</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                {entry.profiles?.full_name ?? "Usuário"} ·{" "}
                {new Date(entry.created_at).toLocaleString("pt-BR")}
              </span>
              <Eye className="size-4" aria-label="Ver esta versão" />
            </div>
          </CardContent>
        </Card>
      ))}
      <Dialog open={!!selectedOrderId} onOpenChange={(open) => !open && setSelectedOrderId(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da versão do pedido</DialogTitle>
          </DialogHeader>
          {selectedQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando versão…</p>
          ) : selectedQuery.error ? (
            <p className="text-sm text-destructive">Não foi possível abrir esta versão.</p>
          ) : selectedQuery.data ? (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 text-sm sm:grid-cols-3">
                <div>
                  <span className="block text-muted-foreground">Cliente</span>
                  <strong>{selectedQuery.data.customer?.name ?? "Venda balcão"}</strong>
                </div>
                <div>
                  <span className="block text-muted-foreground">Situação</span>
                  <strong>{selectedQuery.data.workflow_stage ?? selectedQuery.data.status}</strong>
                </div>
                <div>
                  <span className="block text-muted-foreground">Total</span>
                  <strong>
                    {selectedQuery.data.total == null ? (
                      "Restrito"
                    ) : (
                      <CurrencyValues
                        value={selectedQuery.data.total}
                        currency={selectedQuery.data.currency}
                      />
                    )}
                  </strong>
                </div>
                <div className="sm:col-span-2">
                  <span className="block text-muted-foreground">Entrega</span>
                  <strong>
                    {[
                      selectedQuery.data.shipping?.address,
                      selectedQuery.data.shipping?.city,
                      selectedQuery.data.shipping?.state,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Não informada"}
                  </strong>
                </div>
                <div>
                  <span className="block text-muted-foreground">Estoque</span>
                  <strong>{selectedQuery.data.warehouse?.name ?? "Não definido"}</strong>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Qtd.</TableHead>
                      <TableHead className="text-right">Unitário</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(selectedQuery.data.items ?? []).map((item: any, index: number) => (
                      <TableRow key={`${item.description}-${index}`}>
                        <TableCell>{item.description}</TableCell>
                        <TableCell className="text-right">
                          {formatNumber(item.quantity, 3)}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.unit_price == null ? (
                            "Restrito"
                          ) : (
                            <CurrencyValues
                              value={item.unit_price}
                              currency={selectedQuery.data.currency}
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.total == null ? (
                            "Restrito"
                          ) : (
                            <CurrencyValues
                              value={item.total}
                              currency={selectedQuery.data.currency}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
