/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  FileText,
  Loader2,
  Package,
  Plus,
  Printer,
  Send,
  Navigation,
  ShoppingCart,
  Trash2,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useRates } from "@/hooks/useRates";
import { manualExchange, exchangeConvert, isPix } from "@/lib/order-exchange";
import { formatMoney, formatNumber } from "@/lib/format";
import type { Currency } from "@/lib/format";
import { formatCep, lookupCep } from "@/lib/cep";
import {
  PAYMENT_METHODS,
  assignOrderSeller,
  createOrderWithOptionalCredit,
  createSalesDocument,
  discountValue,
  documentMessage,
  matchItem,
  parseQuantityCode,
  printSalesDocument,
  registerOrderPayment,
  getCustomerCredit,
  preserveRevisionNumber,
  replaceOrderVersion,
  round2,
  setOrderStage,
  toNumber,
  whatsappLink,
  type PaymentInput,
  type PrintDoc,
  type PrintFormat,
  type SaleKind,
  type SearchMode,
  updateOrderLogistics,
  updateOrderDelivery,
  updateOrderDates,
  updateOrderAddressNumber,
  updatePaymentDate,
} from "@/lib/sales";
import { calculateOrderShipping } from "@/lib/shipping.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CurrencyValues } from "@/components/common/CurrencyValues";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/common/DecimalInput";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type CartLine = {
  key: string;
  is_bonus?: boolean;
  item_id: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string | null;
  quantity: number;
  unit_price: number;
  /** Custo informado manualmente por unidade, na moeda do pedido. */
  unit_cost?: number | null;
  discount: number;
  available: number;
  base_price: number;
  base_currency: Currency;
  commission_enabled: boolean;
  commission_percent: number;
  commission_amount?: number;
  max_discount_percent: number;
  promotion_id?: string | null;
  promotion_title?: string | null;
  promotion_original_price?: number | null;
  promotion_ends_at?: string | null;
};

export type PdvDraft = {
  sourceOrderId?: string;
  catalogRequest?: boolean;
  customerId?: string | null;
  useCustomerCredit?: boolean;
  customerCreditAmount?: string;
  currency?: Currency;
  exchangeMode?: "automatic" | "manual";
  manualBrl?: string;
  manualPyg?: string;
  notes?: string | null;
  whatsapp?: string | null;
  discount?: number;
  commissionEnabled?: boolean;
  warehouseId?: string | null;
  shippingAddress?: string | null;
  shippingAddressNumber?: string | null;
  shippingCity?: string | null;
  shippingState?: string | null;
  shippingCep?: string | null;
  sellerId?: string | null;
  deliveryRecipientName?: string | null;
  deliveryRecipientDocument?: string | null;
  shippingCost?: number;
  shippingCostInput?: string;
  shippingManuallyEdited?: boolean;
  payments?: PaymentInput[];
  counterSale?: boolean;
  variableCost?: number;
  shippingPercentage?: number | null;
  deliveryDeadline?: string | null;
  orderDate?: string | null;
  deliveredAt?: string | null;
  shippingCountry?: string | null;
  carrier?: string | null;
  trackingCode?: string | null;
  lines: CartLine[];
};

const onlyDigits = (v: any) => String(v ?? "").replace(/\D/g, "");
const today = () => new Date().toLocaleDateString("en-CA");
export const orderDraftStorageKey = (userId: string | null | undefined) =>
  `os-order-draft:${userId ?? "anonymous"}`;

/** Cadastro de pedido com cliente, itens, entrega e reserva de estoque. */
export function Pdv({
  productId,
  draft,
  onFinished,
}: {
  productId: string;
  draft?: PdvDraft | null;
  onFinished?: () => void;
}) {
  const calculateShipping = useServerFn(calculateOrderShipping);
  const { userId } = useCurrentUser();
  const { can, roles, seesCompanyFinance } = usePermissions();
  const canEditCosts = roles.some((role) =>
    ["superadmin", "admin", "financeiro"].includes(role),
  );
  const canManageDiscounts = can("manage_discounts");
  const systemRates = useRates();
  const [exchangeMode, setExchangeMode] = useState<"automatic" | "manual">("automatic");
  const [manualBrl, setManualBrl] = useState("");
  const [manualPyg, setManualPyg] = useState("");
  const queryClient = useQueryClient();
  const scoped = productId !== "todos";

  const [step, setStep] = useState("itens");
  const [currency, setCurrency] = useState<Currency>("USD");
  const selectedExchange = useMemo(
    () =>
      exchangeMode === "manual"
        ? manualExchange(
            currency,
            Number(manualBrl.replace(",", ".")),
            Number(manualPyg.replace(",", ".")),
          )
        : null,
    [exchangeMode, currency, manualBrl, manualPyg],
  );
  const rates = {
    ...systemRates,
    convert: (value: number | null | undefined, from: Currency, to: Currency) =>
      exchangeMode === "manual"
        ? exchangeConvert(Number(value ?? 0), from, to, selectedExchange)
        : systemRates.convert(value, from, to),
    money: (value: number, from: Currency, to: Currency) => {
      const converted =
        exchangeMode === "manual"
          ? exchangeConvert(value, from, to, selectedExchange)
          : systemRates.convert(value, from, to);
      return converted === null ? "—" : formatMoney(converted, to);
    },
  };
  const [customerId, setCustomerId] = useState("");
  const [useCustomerCredit, setUseCustomerCredit] = useState(false);
  const [customerCreditAmount, setCustomerCreditAmount] = useState("");
  const { data: customerCredits = [], isLoading: creditLoading } = useQuery({
    queryKey: ["customer-credit", customerId],
    queryFn: () => getCustomerCredit(customerId),
    enabled: Boolean(customerId),
    staleTime: 10_000,
  });
  const availableCredit = Number(customerCredits.find((entry) => entry.currency === currency)?.balance ?? 0);
  const [counterSale, setCounterSale] = useState(false);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [saleDiscount, setSaleDiscount] = useState("0");
  const [saleDiscountKind, setSaleDiscountKind] = useState<"valor" | "percent">("valor");
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [payMethod, setPayMethod] = useState("");
  const [payInstallments, setPayInstallments] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(today());
  const [payments, setPayments] = useState<PaymentInput[]>([]);
  useEffect(() => {
    setPayments((previous) => {
      let changed = false;
      const next = previous.map((payment) => {
        if (payment.received_amount == null || !payment.received_currency) return payment;
        const snapshot =
          exchangeMode === "manual"
            ? manualExchange(
                currency,
                Number(manualBrl.replace(",", ".")),
                Number(manualPyg.replace(",", ".")),
              )
            : null;
        const factor =
          payment.received_currency === currency
            ? 1
            : systemRates.factors[`${payment.received_currency}-${currency}`];
        const converted =
          exchangeMode === "manual"
            ? exchangeConvert(
                payment.received_amount,
                payment.received_currency,
                currency,
                snapshot,
              )
            : factor
              ? payment.received_amount * factor
              : null;
        if (converted == null || round2(converted) === payment.amount) return payment;
        changed = true;
        return { ...payment, amount: round2(converted) };
      });
      return changed ? next : previous;
    });
  }, [exchangeMode, manualBrl, manualPyg, currency, systemRates.factors]);
  const [whatsapp, setWhatsapp] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<PrintDoc | null>(null);
  const [printFormat, setPrintFormat] = useState<PrintFormat>("80");
  const [sourceOrderId, setSourceOrderId] = useState<string | null>(null);
  const [catalogRequest, setCatalogRequest] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingAddressNumber, setShippingAddressNumber] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingState, setShippingState] = useState("");
  const [shippingCountry, setShippingCountry] = useState("Brasil");
  const [selectedSellerId, setSelectedSellerId] = useState("");
  const [sellerPickerOpen, setSellerPickerOpen] = useState(false);
  const [deliveryRecipientName, setDeliveryRecipientName] = useState("");
  const [deliveryRecipientDocument, setDeliveryRecipientDocument] = useState("");
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const [sameRecipientAsCustomer, setSameRecipientAsCustomer] = useState(true);
  const [shippingCost, setShippingCost] = useState("0");
  const [variableCost, setVariableCost] = useState("0");
  const [shippingPercentage, setShippingPercentage] = useState<number | null>(null);
  const [shippingManuallyEdited, setShippingManuallyEdited] = useState(false);
  const restoringDraft = useRef(false);
  const [shippingCalculationError, setShippingCalculationError] = useState("");
  const [revisionNote, setRevisionNote] = useState("");
  const [deliveryDeadline, setDeliveryDeadline] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [deliveredAt, setDeliveredAt] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingCode, setTrackingCode] = useState("");
  const [destinationLat, setDestinationLat] = useState("");
  const [destinationLng, setDestinationLng] = useState("");
  const [destinationCep, setDestinationCep] = useState("");
  const [loadingCep, setLoadingCep] = useState(false);

  // busca de itens
  const [mode, setMode] = useState<SearchMode>("palavras");
  const [term, setTerm] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // cliente
  const [customerTerm, setCustomerTerm] = useState("");
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [nc, setNc] = useState({ name: "", document: "", phone: "", email: "" });

  const {
    data,
    isLoading,
    error: dataError,
    refetch: reloadData,
  } = useQuery({
    queryKey: ["pdv-data", productId],
    queryFn: async () => {
      // Lista enxuta e autorizada pelo banco: sem custo, fornecedor ou local físico.
      const itemsQuery = supabase.rpc("sales_items_for_sale", {
        ...(scoped && productId ? { _product_id: productId } : {}),
      });
      const [
        { data: items, error: itemsError },
        { data: customers },
        { data: customerContacts },
        { data: company },
        { data: sellerOptions, error: sellerOptionsError },
        { data: warehouses },
        { data: warehouseInventory },
      ] = await Promise.all([
        itemsQuery,
        supabase
          .from("customers")
          .select("id,name,document,phone,whatsapp,email,address,city,state")
          .is("deleted_at", null)
          .order("name")
          .limit(1000),
        supabase
          .from("customer_contacts")
          .select("id,customer_id,name,phone,email,role")
          .order("name")
          .limit(1000),
        supabase.from("company_settings").select("*").limit(1).maybeSingle(),
        (supabase as any).rpc("sales_seller_options"),
        (supabase as any).rpc("sales_warehouses"),
        (supabase as any)
          .from("warehouse_inventory")
          .select("warehouse_id,item_id,quantity,reserved,min_quantity"),
      ]);
      if (itemsError) throw itemsError;
      if (sellerOptionsError) throw sellerOptionsError;
      return {
        items: items ?? [],
        customers: customers ?? [],
        customerContacts: customerContacts ?? [],
        company: company ?? null,
        sellerOptions: sellerOptions ?? [],
        warehouses: warehouses ?? [],
        warehouseInventory: warehouseInventory ?? [],
      };
    },
  });

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const customers = useMemo(() => data?.customers ?? [], [data?.customers]);
  const customer = customers.find((c: any) => c.id === customerId) ?? null;
  const customerContacts = useMemo(() => data?.customerContacts ?? [], [data?.customerContacts]);
  const sellerOptions = useMemo(() => data?.sellerOptions ?? [], [data?.sellerOptions]);
  const seller = sellerOptions.find((p: any) => p.id === selectedSellerId) as any;
  const recipientOptions = useMemo(() => {
    const customerPeople = customers.map((entry: any) => ({
      id: `customer:${entry.id}`,
      source: "customer",
      label: entry.name,
      detail: [entry.document, entry.phone ?? entry.whatsapp, entry.city, entry.state]
        .filter(Boolean)
        .join(" · "),
      name: entry.name,
      document: entry.document ?? "",
      phone: entry.whatsapp ?? entry.phone ?? "",
      address: entry.address ?? "",
      city: entry.city ?? "",
      state: entry.state ?? "",
    }));
    const contacts = customerContacts.map((entry: any) => {
      const owner = customers.find((candidate: any) => candidate.id === entry.customer_id);
      return {
        id: `contact:${entry.id}`,
        source: "contact",
        label: entry.name,
        detail: [entry.role, entry.phone, entry.email, owner?.name && `Cliente: ${owner.name}`]
          .filter(Boolean)
          .join(" · "),
        name: entry.name,
        document: "",
        phone: entry.phone ?? "",
        address: owner?.address ?? "",
        city: owner?.city ?? "",
        state: owner?.state ?? "",
      };
    });
    return [...customerPeople, ...contacts];
  }, [customerContacts, customers]);
  const warehouses = useMemo(() => data?.warehouses ?? [], [data?.warehouses]);
  const warehouseInventory = useMemo(
    () => data?.warehouseInventory ?? [],
    [data?.warehouseInventory],
  );
  const available = (i: any) => Number(i?.available ?? 0);

  // carrega rascunho vindo de edição/reabertura
  useEffect(() => {
    if (!draft) return;
    restoringDraft.current = true;
    setSourceOrderId(draft.sourceOrderId ?? null);
    setCatalogRequest(Boolean(draft.catalogRequest));
    setLines(
      (draft.lines ?? []).map((line) => ({
        ...line,
        is_bonus: Boolean(line.is_bonus) || line.name.startsWith("Bonificação — "),
        commission_enabled: Boolean(line.commission_enabled),
        commission_percent: Number(line.commission_percent ?? 5),
        max_discount_percent: Number(line.max_discount_percent ?? 0),
      })),
    );
    setCommissionEnabled(Boolean(draft.commissionEnabled));
    setCustomerId(draft.customerId ?? "");
    setUseCustomerCredit(Boolean(draft.useCustomerCredit) && !draft.sourceOrderId);
    setCustomerCreditAmount(draft.customerCreditAmount ?? "");
    setCurrency(draft.currency ?? "USD");
    setExchangeMode(draft.exchangeMode ?? "automatic");
    setManualBrl(draft.manualBrl ?? "");
    setManualPyg(draft.manualPyg ?? "");
    setNotes(draft.notes ?? "");
    setWhatsapp(draft.whatsapp ?? "");
    setSaleDiscount(String(draft.discount ?? 0));
    setSaleDiscountKind("valor");
    setWarehouseId(draft.warehouseId ?? "");
    setShippingAddress(draft.shippingAddress ?? "");
    setShippingAddressNumber(draft.shippingAddressNumber ?? "");
    setShippingCity(draft.shippingCity ?? "");
    setShippingState(draft.shippingState ?? "");
    setShippingCountry(draft.shippingCountry ?? "Brasil");
    setDestinationCep(formatCep(draft.shippingCep ?? ""));
    setSelectedSellerId(draft.sellerId ?? "");
    setDeliveryRecipientName(draft.deliveryRecipientName ?? "");
    setDeliveryRecipientDocument(draft.deliveryRecipientDocument ?? "");
    setSameRecipientAsCustomer(false);
    setShippingCost(draft.shippingCostInput ?? String(draft.shippingCost ?? 0));
    setPayments(draft.payments ?? []);
    setCounterSale(Boolean(draft.counterSale));
    setVariableCost(String(draft.variableCost ?? 0));
    setShippingPercentage(draft.shippingPercentage ?? null);
    setShippingManuallyEdited(Boolean(draft.shippingManuallyEdited));
    setDeliveryDeadline(draft.deliveryDeadline ?? "");
    setOrderDate(draft.orderDate ?? today());
    setDeliveredAt(draft.deliveredAt ?? "");
    setCarrier(draft.carrier ?? "");
    setTrackingCode(draft.trackingCode ?? "");
    setRevisionNote(draft.catalogRequest ? "Solicitação do catálogo revisada e confirmada." : "");
    setStep("itens");
  }, [draft]);

  useEffect(() => {
    if (selectedSellerId || sellerOptions.length === 0) return;
    const currentSeller = sellerOptions.find((option: any) => option.id === userId);
    if (currentSeller) setSelectedSellerId(currentSeller.id);
    else if (sellerOptions.length === 1) setSelectedSellerId(sellerOptions[0].id);
  }, [selectedSellerId, sellerOptions, userId]);

  const priceIn = (i: any) => {
    const base = Number(i?.promotional_price ?? i?.price ?? 0);
    const from = (i?.currency ?? currency) as Currency;
    if (from === currency) return round2(base);
    const converted = rates.convert(base, from, currency);
    return converted === null ? round2(base) : round2(converted);
  };

  const secondaryCurrencyValues = (value: number) =>
    (["BRL", "USD", "PYG"] as Currency[])
      .filter((target) => target !== currency)
      .map((target) => rates.money(value, currency, target))
      .join(" · ");

  function changeCurrency(nextCurrency: Currency) {
    if (nextCurrency === currency) return;
    const factor = rates.convert(1, currency, nextCurrency);
    const hasMonetaryValues =
      lines.length > 0 ||
      toNumber(saleDiscount) > 0 ||
      toNumber(shippingCost) > 0 ||
      toNumber(variableCost) > 0 ||
      payments.length > 0 ||
      toNumber(payAmount) > 0;
    if (factor === null && hasMonetaryValues) {
      toast.error("Aguarde a cotação carregar para trocar a moeda deste pedido.");
      return;
    }

    const convert = (value: number) => round2(value * (factor ?? 1));
    const convertInput = (value: string) =>
      value.trim() === "" ? "" : String(convert(toNumber(value)));

    setLines((current) =>
      current.map((line) => ({
        ...line,
        unit_price: convert(line.unit_price),
        unit_cost: line.unit_cost == null ? null : convert(line.unit_cost),
        discount: convert(line.discount),
      })),
    );
    if (saleDiscountKind === "valor") setSaleDiscount(convertInput(saleDiscount));
    setShippingCost(convertInput(shippingCost));
    setVariableCost(convertInput(variableCost));
    setPayments((current) =>
      current.map((payment) => ({ ...payment, amount: convert(payment.amount) })),
    );
    setPayAmount(convertInput(payAmount));
    setCurrency(nextCurrency);
  }

  const results = useMemo(() => {
    if (!term.trim()) return items.slice(0, 12);
    const { code } = parseQuantityCode(term);
    return items.filter((i: any) => matchItem(i, code, mode)).slice(0, 25);
  }, [items, term, mode]);

  const filteredCustomers = useMemo(() => {
    const t = customerTerm.trim().toLowerCase();
    if (!t) return customers.slice(0, 20);
    const digits = onlyDigits(t);
    return customers
      .filter((c: any) => {
        const hay = `${c.name ?? ""} ${c.email ?? ""}`.toLowerCase();
        const nums = `${onlyDigits(c.phone)} ${onlyDigits(c.whatsapp)} ${onlyDigits(c.document)}`;
        return hay.includes(t) || (digits.length >= 3 && nums.includes(digits));
      })
      .slice(0, 20);
  }, [customers, customerTerm]);

  useEffect(() => {
    if (!customer || !sameRecipientAsCustomer) return;
    setDeliveryRecipientName(customer.name ?? "");
    setDeliveryRecipientDocument(customer.document ?? "");
  }, [customer, sameRecipientAsCustomer]);

  const gross = round2(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0));
  const itemDiscounts = round2(lines.reduce((s, l) => s + l.discount, 0));
  const netAfterItems = Math.max(0, round2(gross - itemDiscounts));
  const generalDiscount = discountValue(netAfterItems, toNumber(saleDiscount), saleDiscountKind);
  const freight = Math.max(0, round2(toNumber(shippingCost)));
  const internalVariableCost = Math.max(0, round2(toNumber(variableCost)));
  const total = Math.max(0, round2(netAfterItems - generalDiscount + freight));
  const commissionTotal = round2(
    lines.reduce(
      (sum, line) =>
        sum +
        (line.commission_enabled
          ? Math.max(0, line.quantity * line.unit_price - line.discount) *
            (line.commission_percent / 100)
          : 0),
      0,
    ),
  );
  const creditToUse = useCustomerCredit ? round2(toNumber(customerCreditAmount)) : 0;
  const paid = round2(payments.reduce((s, p) => s + p.amount, 0) + creditToUse);
  const remaining = round2(Math.max(0, total - paid));
  const shippingItemsKey = lines.map((line) => `${line.item_id}:${line.quantity}`).join("|");

  useEffect(() => {
    if (restoringDraft.current) {
      restoringDraft.current = false;
      return;
    }
    if (!userId || sourceOrderId) return;
    const hasContent = Boolean(
      lines.length ||
      customerId ||
      notes.trim() ||
      shippingAddress.trim() ||
      whatsapp.trim() ||
      deliveryRecipientName.trim() ||
      deliveryRecipientDocument.trim() ||
      payments.length ||
      destinationCep.trim() ||
      trackingCode.trim() ||
      shippingManuallyEdited,
    );
    const key = orderDraftStorageKey(userId);
    {
      if (!hasContent) {
        localStorage.removeItem(key);
        window.dispatchEvent(new CustomEvent("os-order-draft-changed"));
        return;
      }
      const saved: PdvDraft = {
        customerId: customerId || null,
        useCustomerCredit,
        customerCreditAmount,
        currency,
        exchangeMode,
        manualBrl,
        manualPyg,
        notes: notes || null,
        whatsapp: whatsapp || null,
        discount: generalDiscount,
        commissionEnabled,
        warehouseId: warehouseId || null,
        shippingAddress: shippingAddress || null,
        shippingAddressNumber: shippingAddressNumber || null,
        shippingCity: shippingCity || null,
        shippingState: shippingState || null,
        shippingCountry: shippingCountry || null,
        shippingCep: destinationCep || null,
        sellerId: selectedSellerId || null,
        deliveryRecipientName: deliveryRecipientName || null,
        deliveryRecipientDocument: deliveryRecipientDocument || null,
        shippingCost: freight,
        shippingCostInput: shippingCost,
        shippingManuallyEdited,
        payments,
        counterSale,
        variableCost: internalVariableCost,
        shippingPercentage,
        deliveryDeadline: deliveryDeadline || null,
        orderDate: orderDate || null,
        deliveredAt: deliveredAt || null,
        carrier: carrier || null,
        trackingCode: trackingCode || null,
        lines,
      };
      localStorage.setItem(key, JSON.stringify(saved));
      window.dispatchEvent(new CustomEvent("os-order-draft-changed"));
    }
  }, [
    userId,
    sourceOrderId,
    shippingCost,
    shippingManuallyEdited,
    payments,
    counterSale,
    lines,
    customerId,
    useCustomerCredit,
    customerCreditAmount,
    currency,
    notes,
    whatsapp,
    generalDiscount,
    commissionEnabled,
    warehouseId,
    shippingAddress,
    shippingAddressNumber,
    shippingCity,
    shippingState,
    shippingCountry,
    destinationCep,
    selectedSellerId,
    deliveryRecipientName,
    deliveryRecipientDocument,
    freight,
    internalVariableCost,
    shippingPercentage,
    deliveryDeadline,
    orderDate,
    deliveredAt,
    carrier,
    trackingCode,
    exchangeMode,
    manualBrl,
    manualPyg,
  ]);

  useEffect(() => {
    if (shippingCountry !== "Paraguai" && !shippingState.trim()) return;
    if (!lines.length || shippingManuallyEdited) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        setShippingCalculationError("");
        const calculated = await calculateShipping({
          data: {
            items: lines.map((line) => ({
              itemId: line.item_id,
              quantity: line.quantity,
            })),
            state: shippingState,
            country: shippingCountry,
            currency,
            manualRates:
              exchangeMode === "manual" && selectedExchange
                ? {
                    BRL: Number(manualBrl.replace(",", ".")),
                    PYG: Number(manualPyg.replace(",", ".")),
                  }
                : undefined,
          },
        });
        if (!active) return;
        const calculatedCost = Number(calculated?.shipping_cost ?? 0);
        const calculatedPercentage = Number(calculated?.percentage ?? 0);
        setShippingCost(String(calculatedCost));
        setShippingPercentage(calculatedPercentage);
        setShippingManuallyEdited(false);
      } catch (error) {
        if (!active) return;
        setShippingCalculationError(
          error instanceof Error ? error.message : "Não foi possível calcular o frete.",
        );
      }
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    calculateShipping,
    currency,
    shippingItemsKey,
    selectedExchange,
    exchangeMode,
    manualBrl,
    manualPyg,
    shippingManuallyEdited,
    shippingState,
    shippingCountry,
    lines,
  ]);

  function selectCustomer(entry: any) {
    setCustomerId(entry.id);
    setUseCustomerCredit(false);
    setCustomerCreditAmount("");
    setCustomerTerm(entry.name ?? "");
    setCounterSale(false);
    setWhatsapp(entry.whatsapp ?? entry.phone ?? "");
    setShippingAddress(entry.address ?? "");
    setShippingAddressNumber("");
    setShippingCity(entry.city ?? "");
    setShippingState(String(entry.state ?? "").toUpperCase());
    setDestinationCep("");

    if (sameRecipientAsCustomer) {
      setDeliveryRecipientName(entry.name ?? "");
      setDeliveryRecipientDocument(entry.document ?? "");
    }
  }

  function selectRecipient(entry: (typeof recipientOptions)[number]) {
    setSameRecipientAsCustomer(false);
    setDeliveryRecipientName(entry.name);
    setDeliveryRecipientDocument(entry.document);
    if (entry.phone) setWhatsapp(entry.phone);
    if (entry.address) setShippingAddress(entry.address);
    if (entry.city) setShippingCity(entry.city);
    if (entry.state) setShippingState(String(entry.state).toUpperCase());

    setRecipientPickerOpen(false);
  }

  const requiredByItem = useMemo(() => {
    const required = new Map<string, { quantity: number; name: string }>();
    for (const line of lines) {
      if (!line.item_id) continue;
      const previous = required.get(line.item_id);
      required.set(line.item_id, {
        name: previous?.name ?? line.name,
        quantity: (previous?.quantity ?? 0) + line.quantity,
      });
    }
    return required;
  }, [lines]);
  const eligibleWarehouses = useMemo(() => {
    if (!requiredByItem.size) return warehouses;
    return warehouses.filter((warehouse: any) =>
      [...requiredByItem].every(([itemId, required]) => {
        const balance = warehouseInventory.find(
          (row: any) => row.warehouse_id === warehouse.id && row.item_id === itemId,
        );
        return Number(balance?.quantity ?? 0) - Number(balance?.reserved ?? 0) >= required.quantity;
      }),
    );
  }, [requiredByItem, warehouseInventory, warehouses]);

  const warehouseHasStock = (warehouseIdToCheck: string) =>
    [...requiredByItem].every(([itemId, required]) => {
      const balance = warehouseInventory.find(
        (row: any) => row.warehouse_id === warehouseIdToCheck && row.item_id === itemId,
      );
      return Number(balance?.quantity ?? 0) - Number(balance?.reserved ?? 0) >= required.quantity;
    });

  const principalWarehouse = warehouses.find((warehouse: any) => warehouse.level === "principal");
  const principalLowStock = useMemo(() => {
    if (!principalWarehouse || !requiredByItem.size) return [];
    return [...requiredByItem].flatMap(([itemId, required]) => {
      const balance = warehouseInventory.find(
        (row: any) => row.warehouse_id === principalWarehouse.id && row.item_id === itemId,
      );
      const availableAfterOrder =
        Number(balance?.quantity ?? 0) -
        Number(balance?.reserved ?? 0) -
        (warehouseId === principalWarehouse.id ? required.quantity : 0);
      const minimum = Number(balance?.min_quantity ?? 0);
      return availableAfterOrder <= minimum
        ? [{ name: required.name, availableAfterOrder, minimum }]
        : [];
    });
  }, [requiredByItem, principalWarehouse, warehouseId, warehouseInventory]);

  const distanceKm = (warehouse: any) => {
    const lat1 = Number(destinationLat.replace(",", "."));
    const lon1 = Number(destinationLng.replace(",", "."));
    const lat2 = Number(warehouse.latitude);
    const lon2 = Number(warehouse.longitude);
    if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
    const rad = (value: number) => (value * Math.PI) / 180;
    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  function suggestWarehouse() {
    if (!eligibleWarehouses.length)
      return void toast.error("Nenhum estoque possui saldo suficiente para todos os itens.");
    const normalized = (value: string) => value.trim().toLowerCase();
    const ranked = [...eligibleWarehouses].sort((a: any, b: any) => {
      const da = distanceKm(a);
      const db = distanceKm(b);
      if (da != null && db != null) return da - db;
      const score = (w: any) =>
        normalized(w.city) === normalized(shippingCity)
          ? 0
          : normalized(w.state) === normalized(shippingState)
            ? 1
            : 2;
      return score(a) - score(b);
    });
    setWarehouseId(ranked[0].id);
    const km = distanceKm(ranked[0]);
    toast.success(
      km == null
        ? `Estoque sugerido: ${ranked[0].name}.`
        : `Estoque sugerido a ${km.toFixed(0)} km.`,
    );
  }

  async function fillDestinationFromCep() {
    setLoadingCep(true);
    try {
      const address = await lookupCep(destinationCep);
      setDestinationCep(address.cep);
      setShippingCity(address.city);
      setShippingState(address.state.toUpperCase());

      setDestinationLat(address.latitude);
      setDestinationLng(address.longitude);
      const street = [address.street, address.neighborhood].filter(Boolean).join(", ");
      if (street) setShippingAddress(street);
      toast.success("Endereço preenchido pelo CEP. Complete o número e o complemento.");
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível consultar o CEP.");
    } finally {
      setLoadingCep(false);
    }
  }

  function addItem(item: any, quantity = 1) {
    if (lines.some((line) => line.item_id === item.id)) {
      toast.info("Este produto já está no pedido. Ajuste a quantidade na linha existente.");
      setTerm("");
      return;
    }
    setLines((ls) => [
      ...ls,
      {
        key: `${item.id}-${Date.now()}-${ls.length}`,
        is_bonus: false,
        item_id: item.id,
        name: item.variation ? `${item.name} — ${item.variation}` : item.name,
        sku: item.sku ?? null,
        barcode: item.barcode ?? null,
        unit: item.unit ?? "UN",
        quantity,
        unit_price: priceIn(item),
        unit_cost: null,
        discount: 0,
        available: available(item),
        base_price: Number(item.price ?? 0),
        base_currency: (item.currency ?? "BRL") as Currency,
        commission_enabled: commissionEnabled,
        commission_percent: Number(item.commission_percent ?? 5),
        max_discount_percent: Number(item.max_discount_percent ?? 0),
        promotion_id: item.promotion_id ?? null,
        promotion_title: item.promotion_title ?? null,
        promotion_original_price: item.promotion_id
          ? priceIn({ ...item, promotional_price: null })
          : null,
        promotion_ends_at: item.promotion_ends_at ?? null,
      },
    ]);
    setTerm("");
    searchRef.current?.focus();
  }

  function submitSearch() {
    const { quantity, code } = parseQuantityCode(term);
    const found = items.filter((i: any) => matchItem(i, code, mode));
    if (found.length === 0) return void toast.error("Nenhum item encontrado com essa busca.");
    if (found.length > 1 && mode !== "barras")
      return void toast.info("Vários itens encontrados. Escolha na lista abaixo.");
    addItem(found[0], quantity);
  }

  const updateLine = (key: string, patch: Partial<CartLine>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  function addBonusLine(line: CartLine) {
    setLines((current) => [...current, {
      ...line,
      key: `${line.item_id}-bonus-${Date.now()}-${current.length}`,
      name: `Bonificação — ${line.name}`,
      is_bonus: true,
      quantity: 1,
      unit_price: 0,
      discount: 0,
      commission_enabled: false,
      commission_amount: 0,
      promotion_id: null,
    }]);
    toast.info("Item bonificado adicionado sem cobrança. Confira a quantidade total enviada.");
  }

  /** "Vender por valor": informa o total desejado da linha e ajusta o desconto. */
  function sellByValue(line: CartLine, target: number) {
    const base = round2(line.quantity * line.unit_price);
    updateLine(line.key, { discount: Math.max(0, round2(base - target)) });
  }

  function clearSale() {
    setCurrency("USD");
    setExchangeMode("automatic");
    setManualBrl("");
    setManualPyg("");
    setLines([]);
    setCustomerId("");
    setUseCustomerCredit(false);
    setCustomerCreditAmount("");
    setCounterSale(false);
    setSaleDiscount("0");
    setSaleDiscountKind("valor");
    setCommissionEnabled(false);
    setPayments([]);
    setPayMethod("");
    setPayInstallments("");
    setPayAmount("");
    setPayDate(today());
    setWhatsapp("");
    setNotes("");
    setTerm("");
    setSourceOrderId(null);
    setCatalogRequest(false);
    setWarehouseId("");
    setShippingAddress("");
    setShippingAddressNumber("");
    setShippingCity("");
    setShippingState("");
    setShippingCountry("Brasil");
    setDestinationCep("");
    setDeliveryRecipientName("");
    setDeliveryRecipientDocument("");
    setSameRecipientAsCustomer(true);
    setShippingCost("0");
    setShippingPercentage(null);
    setShippingCalculationError("");
    setShippingManuallyEdited(false);
    setRevisionNote("");
    setDeliveryDeadline("");
    setOrderDate(today());
    setDeliveredAt("");
    setCarrier("");
    setTrackingCode("");
    setDestinationLat("");
    setDestinationLng("");
    setStep("itens");
    if (userId) localStorage.removeItem(orderDraftStorageKey(userId));
    window.dispatchEvent(new CustomEvent("os-order-draft-changed"));
  }

  async function createCustomer() {
    const name = nc.name.trim();
    if (!name) return void toast.error("Informe o nome do cliente.");
    const dupe = customers.find((c: any) => {
      const doc = onlyDigits(nc.document);
      const phone = onlyDigits(nc.phone);
      return (
        (doc && onlyDigits(c.document) === doc) ||
        (phone && onlyDigits(c.phone) === phone) ||
        (nc.email && String(c.email ?? "").toLowerCase() === nc.email.trim().toLowerCase()) ||
        String(c.name ?? "").toLowerCase() === name.toLowerCase()
      );
    });
    if (dupe) {
      setCustomerId(dupe.id);
      setNewCustomerOpen(false);
      return void toast.info(
        `Este cliente já existe: ${dupe.name}. Selecionamos o cadastro atual.`,
      );
    }
    const { data: created, error } = await supabase
      .from("customers")
      .insert({
        name,
        document: nc.document || null,
        phone: nc.phone || null,
        email: nc.email || null,
        created_by: userId ?? null,
      })
      .select("id")
      .single();
    if (error || !created) return void toast.error("Não foi possível cadastrar o cliente.");
    await queryClient.invalidateQueries({ queryKey: ["pdv-data", productId] });
    setCustomerId(created.id);
    setNewCustomerOpen(false);
    setNc({ name: "", document: "", phone: "", email: "" });
    toast.success("Cliente cadastrado.");
  }

  function buildReceipt(kind: SaleKind, number: number | null): PrintDoc {
    return {
      kind,
      number,
      createdAt: new Date().toISOString(),
      currency,
      gross,
      discount: round2(itemDiscounts + generalDiscount),
      shippingCost: freight,
      total,
      seller: seller?.full_name ?? null,
      customer,
      company: data?.company ?? null,
      notes,
      conversions: (["BRL", "USD", "PYG"] as Currency[])
        .map((c) => ({ currency: c, total: rates.convert(total, currency, c) ?? NaN }))
        .filter((c) => Number.isFinite(c.total)),
      payments: kind === "venda" ? payments : [],
      lines: lines.map((l) => ({
        description: l.name,
        sku: l.sku,
        barcode: l.barcode,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount: l.discount,
      })),
    };
  }

  async function finalize(kind: SaleKind) {
    if (useCustomerCredit && (
      !customerId || Boolean(sourceOrderId) || kind === "orcamento" ||
      payments.length > 0 || !(creditToUse > 0) ||
      creditToUse > availableCredit || creditToUse > total
    )) {
      setStep("finalizacao");
      return void toast.error("Confira o cliente, o saldo de crédito e o valor a abater. Registre outros pagamentos após salvar.");
    }
    if (kind === "venda" && paid !== total) {
      setStep("finalizacao");
      return void toast.error("A soma dos pagamentos precisa ser igual ao total da venda.");
    }
    if (kind !== "orcamento" && !warehouseId) {
      setStep("finalizacao");
      return void toast.error("Escolha o estoque de origem do pedido.");
    }
    if (kind !== "orcamento" && !selectedSellerId) {
      setStep("finalizacao");
      return void toast.error("Escolha o vendedor responsável pelo pedido.");
    }
    if (
      kind !== "orcamento" &&
      shippingPercentage != null &&
      (shippingPercentage < 0 || shippingPercentage > 100)
    ) {
      setStep("finalizacao");
      return void toast.error("Informe um percentual de frete entre 0% e 100%.");
    }
    const invalidCommission = lines.find(
      (line) => line.commission_percent < 0 || line.commission_percent > 100,
    );
    if (invalidCommission) {
      setStep("itens");
      return void toast.error(
        `A comissão de ${invalidCommission.name} deve ficar entre 0% e 100%.`,
      );
    }
    if (lines.some((line) => line.unit_cost != null && (!Number.isFinite(line.unit_cost) || line.unit_cost < 0))) {
      setStep("finalizacao");
      return void toast.error("Informe um custo unitário válido e não negativo.");
    }
    if (!canManageDiscounts) {
      const excessDiscount = lines.find((line) => {
        const lineTotal = line.quantity * line.unit_price;
        const usedPercent = lineTotal > 0 ? (line.discount * 100) / lineTotal : 0;
        return usedPercent > line.max_discount_percent + 0.000001;
      });
      if (excessDiscount) {
        setStep("itens");
        return void toast.error(
          `O desconto de ${excessDiscount.name} ultrapassa o limite de ${excessDiscount.max_discount_percent}%.`,
        );
      }
    }

    setSaving(true);
    try {
      const cashOnlySale =
        kind === "venda" &&
        payments.length > 0 &&
        payments.every((payment) => payment.method.trim().toLowerCase() === "dinheiro");
      const orderItems = lines.map((l) => ({
        item_id: l.item_id,
        description: l.name,
        sku: l.sku,
        barcode: l.barcode,
        unit: l.unit,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount: l.discount,
        commission_enabled: commissionEnabled && l.commission_enabled,
        commission_percent: l.commission_percent,
        max_discount_percent: l.max_discount_percent,
      }));
      // Keep the address usable while the production database is on the schema
      // that stores the street and number in the same field.
      const storedShippingAddress = [shippingAddress.trim(), shippingAddressNumber.trim()]
        .filter(Boolean)
        .join(", ");
      if (exchangeMode === "manual" && !selectedExchange)
        throw new Error("Informe cotações manuais válidas, maiores que zero.");
      const res = sourceOrderId
        ? await replaceOrderVersion({
            exchange:
              selectedExchange ??
              (systemRates.ready
                ? {
                    base: currency,
                    mode: "automatic",
                    BRL: systemRates.convert(1, currency, "BRL")!,
                    USD: systemRates.convert(1, currency, "USD")!,
                    PYG: systemRates.convert(1, currency, "PYG")!,
                  }
                : null),
            previousOrderId: sourceOrderId,
            customerId: customerId || null,
            productId: scoped ? productId : null,
            currency,
            discount: generalDiscount,
            shippingCost: freight,
            shippingPercentage,
            notes: notes || null,
            whatsapp: whatsapp || null,
            items: orderItems,
            warehouseId,
            shippingAddress: storedShippingAddress,
            shippingCity,
            shippingState,
            deliveryDeadline: deliveryDeadline || null,
            carrier,
            trackingCode,
            revisionNote: revisionNote.trim() || "Pedido editado.",
          })
        : kind === "orcamento"
          ? await createSalesDocument({
              exchange:
                selectedExchange ??
                (systemRates.ready
                  ? {
                      base: currency,
                      mode: "automatic",
                      BRL: systemRates.convert(1, currency, "BRL")!,
                      USD: systemRates.convert(1, currency, "USD")!,
                      PYG: systemRates.convert(1, currency, "PYG")!,
                    }
                  : null),
              kind,
              customerId: customerId || null,
              productId: scoped ? productId : null,
              currency,
              discount: generalDiscount,
              notes: notes || null,
              paymentMethod: null,
              paymentInstallments: null,
              validUntil: null,
              whatsapp: whatsapp || null,
              origin: "pdv",
              items: orderItems,
              payments: [],
            })
          : await createOrderWithOptionalCredit({
              exchange:
                selectedExchange ??
                (systemRates.ready
                  ? {
                      base: currency,
                      mode: "automatic",
                      BRL: systemRates.convert(1, currency, "BRL")!,
                      USD: systemRates.convert(1, currency, "USD")!,
                      PYG: systemRates.convert(1, currency, "PYG")!,
                    }
                  : null),
              kind: cashOnlySale || creditToUse > 0 ? "pre_pedido" : kind,
              customerId: customerId || null,
              productId: scoped ? productId : null,
              currency,
              discount: generalDiscount,
              shippingCost: freight,
              shippingPercentage,
              notes: notes || null,
              paymentMethod:
                kind === "venda" ? (creditToUse > 0 ? "Crédito do cliente" : payments.map((p) => p.method).join(" + ")) || null : null,
              paymentInstallments: kind === "venda" ? payInstallments || null : null,
              whatsapp: whatsapp || null,
              origin: "pdv",
              items: orderItems,
              payments: kind === "venda" && !cashOnlySale && creditToUse === 0 ? payments : [],
            }, creditToUse, {
              warehouseId,
              address: storedShippingAddress,
              city: shippingCity,
              state: shippingState,
            });

      if (kind !== "orcamento" && !sourceOrderId) {
        if (creditToUse === 0) await updateOrderLogistics(
          res.id,
          warehouseId || null,
          storedShippingAddress,
          shippingCity,
          shippingState,
        );
        await updateOrderDelivery(res.id, deliveryDeadline || null, carrier, trackingCode);
        if (cashOnlySale) {
          for (const payment of payments) {
            const paymentResult = await registerOrderPayment(
              res.id,
              payment.amount,
              payment.method,
              null,
            );
            if (paymentResult?.payment_id)
              await updatePaymentDate(res.id, paymentResult.payment_id, payment.paid_at ?? null);
          }
        } else if (kind === "venda" && creditToUse === 0) await setOrderStage(res.id, "vendido");
      }
      if (kind !== "orcamento") {
        if (canEditCosts && lines.some((line) => line.unit_cost != null)) {
          const { error: costsError } = await (supabase as any).rpc("sales_set_order_item_costs", {
            p_order_id: res.id,
            p_costs: lines.filter((line) => line.unit_cost != null).map((line) => ({
              item_id: line.item_id,
              unit_cost: line.unit_cost,
            })),
          });
          if (costsError) throw costsError;
        }
        const { error: recipientError } = await (supabase as any)
          .from("orders")
          .update({
            delivery_recipient_name: deliveryRecipientName.trim(),
            delivery_recipient_document: onlyDigits(deliveryRecipientDocument) || null,
            shipping_cep: onlyDigits(destinationCep) || null,
            variable_cost: internalVariableCost,
          })
          .eq("id", res.id);
        if (recipientError) throw recipientError;
        await assignOrderSeller(res.id, selectedSellerId);
        await updateOrderDates(
          res.id,
          orderDate || null,
          deliveryDeadline || null,
          deliveredAt || null,
          shippingCountry || null,
        );
        await updateOrderAddressNumber(res.id, shippingAddressNumber.trim() || null);
        if (sourceOrderId) await preserveRevisionNumber(res.id);
        const { error: confirmationError } = await (supabase as any).rpc("sales_confirm_order", {
          p_order_id: res.id,
        });
        if (confirmationError) throw confirmationError;
      }

      setReceipt(buildReceipt(kind, res?.number ?? null));
      toast.success(
        kind === "venda"
          ? "Venda faturada com sucesso."
          : kind === "orcamento"
            ? "Orçamento salvo."
            : catalogRequest
              ? "Solicitação confirmada. Pedido gerado, estoque baixado e entrega gerada."
              : "Pedido criado, estoque baixado e entrega gerada.",
      );
      queryClient.invalidateQueries();
      if (userId) localStorage.removeItem(orderDraftStorageKey(userId));
      window.dispatchEvent(new CustomEvent("os-order-draft-changed"));
      onFinished?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível concluir a operação.");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando o caixa…
      </div>
    );
  }

  if (dataError) {
    return (
      <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 p-6">
        <p>Não foi possível carregar os produtos e as opções do pedido.</p>
        <Button variant="outline" onClick={() => void reloadData()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <Card>
        <CardContent className="pt-4">
          <Tabs value={step} onValueChange={setStep}>
            <TabsList>
              <TabsTrigger value="cliente">
                <UserRound className="mr-1 h-4 w-4" /> Cliente
              </TabsTrigger>
              <TabsTrigger value="itens">
                <Package className="mr-1 h-4 w-4" /> Itens
              </TabsTrigger>
              <TabsTrigger value="finalizacao">
                <ShoppingCart className="mr-1 h-4 w-4" /> Finalização
              </TabsTrigger>
            </TabsList>

            {/* CLIENTE */}
            <TabsContent value="cliente" className="space-y-3 pt-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-56 flex-1">
                  <Label htmlFor="busca-cliente">
                    Buscar por nome, telefone, e-mail ou documento
                  </Label>
                  <Input
                    id="busca-cliente"
                    value={customerTerm}
                    onChange={(e) => setCustomerTerm(e.target.value)}
                    placeholder="Ex.: Maria, 4199..., maria@email.com, 123.456..."
                  />
                </div>
                <Button type="button" variant="secondary" onClick={() => setNewCustomerOpen(true)}>
                  <Plus className="mr-1 h-4 w-4" /> Novo cliente
                </Button>
              </div>

              <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                <Checkbox
                  checked={counterSale}
                  onCheckedChange={(v) => setCounterSale(Boolean(v))}
                  aria-label="Venda balcão sem cliente"
                />
                Venda balcão (sem cliente). Válido apenas para venda concluída na hora.
              </label>

              <div className="max-h-80 divide-y overflow-auto rounded-lg border">
                {filteredCustomers.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
                )}
                {filteredCustomers.map((c: any) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCustomer(c)}
                    className={`flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-muted/60 ${
                      customerId === c.id ? "bg-primary/10" : ""
                    }`}
                  >
                    <span>
                      <span className="font-medium">{c.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[c.document, c.phone, c.email].filter(Boolean).join(" · ") ||
                          "Sem contato"}
                      </span>
                    </span>
                    {customerId === c.id && <Badge>Selecionado</Badge>}
                  </button>
                ))}
              </div>
              {customerId && (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm" aria-live="polite">
                  <p className="font-medium">Crédito do cliente</p>
                  <p className="mt-1 text-muted-foreground">
                    {creditLoading
                      ? "Consultando saldo..."
                      : (["BRL", "USD", "PYG"] as Currency[])
                          .map((code) => `${formatMoney(Number(customerCredits.find((entry) => entry.currency === code)?.balance ?? 0), code)}`)
                          .join(" · ")}
                  </p>
                </div>
              )}
            </TabsContent>

            {/* ITENS */}
            <TabsContent value="itens" className="space-y-3 pt-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-56 flex-1">
                  <Label htmlFor="busca-item">Buscar item (aceita 2*CÓDIGO)</Label>
                  <Input
                    id="busca-item"
                    ref={searchRef}
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitSearch();
                      }
                    }}
                    placeholder="Nome em qualquer ordem, SKU ou código de barras"
                  />
                </div>
                <div>
                  <Label>Tipo de busca</Label>
                  <Select value={mode} onValueChange={(v) => setMode(v as SearchMode)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="palavras">Palavras</SelectItem>
                      <SelectItem value="exato">Exata</SelectItem>
                      <SelectItem value="barras">Código de barras</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Moeda</Label>
                  <Select
                    value={currency}
                    onValueChange={(value) => changeCurrency(value as Currency)}
                  >
                    <SelectTrigger className="w-48" aria-label="Moeda principal do pedido">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BRL">Real (R$)</SelectItem>
                      <SelectItem value="USD">Dólar (US$)</SelectItem>
                      <SelectItem value="PYG">Guarani (Gs.)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Selecione a moeda principal usada para preencher e registrar este pedido.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label>
                    Cotação {exchangeMode === "manual" ? "manual" : "automática do sistema"}
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (exchangeMode === "automatic") {
                        setManualBrl(String(systemRates.convert(1, "USD", "BRL") ?? ""));
                        setManualPyg(String(systemRates.convert(1, "USD", "PYG") ?? ""));
                        setExchangeMode("manual");
                      } else setExchangeMode("automatic");
                    }}
                  >
                    {exchangeMode === "manual" ? "Usar cotação automática" : "Usar cotação manual"}
                  </Button>
                </div>
                {exchangeMode === "manual" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="manual-brl">1 dólar em reais (R$)</Label>
                      <Input
                        id="manual-brl"
                        inputMode="decimal"
                        value={manualBrl}
                        onChange={(e) => setManualBrl(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="manual-pyg">1 dólar em guaranis (Gs.)</Label>
                      <Input
                        id="manual-pyg"
                        inputMode="decimal"
                        value={manualPyg}
                        onChange={(e) => setManualPyg(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  A cotação manual vale somente para este pedido. Os preços já preenchidos
                  permanecem na moeda escolhida.
                </p>
              </div>

              <div className="max-h-72 divide-y overflow-auto rounded-lg border">
                {results.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">
                    Nenhum item encontrado no estoque.
                  </p>
                )}
                {results.map((i: any) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => addItem(i)}
                    className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-muted/60"
                  >
                    <span>
                      <span className="font-medium">{i.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[i.barcode, i.sku].filter(Boolean).join(" · ") || "Sem código"}
                      </span>
                    </span>
                    <span className="text-right">
                      <CurrencyValues
                        convert={rates.convert}
                        value={priceIn(i)}
                        currency={currency}
                        emphasize
                        primaryFirst
                      />
                      <span className="block text-xs text-muted-foreground">
                        {formatNumber(available(i), 3)} disponível
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </TabsContent>

            {/* FINALIZAÇÃO */}
            <TabsContent value="finalizacao" className="space-y-4 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Vendedor responsável</Label>
                  <Popover open={sellerPickerOpen} onOpenChange={setSellerPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={sellerPickerOpen}
                        className="w-full justify-between font-normal"
                      >
                        <span className="truncate">
                          {seller
                            ? `${seller.full_name}${seller.teams ? ` · ${seller.teams}` : ""}`
                            : "Digite ou selecione o vendedor"}
                        </span>
                        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[var(--radix-popover-trigger-width)] p-0"
                      align="start"
                    >
                      <Command>
                        <CommandInput placeholder="Buscar vendedor pelo nome..." />
                        <CommandList>
                          <CommandEmpty>Nenhum vendedor encontrado.</CommandEmpty>
                          {sellerOptions.map((option: any) => (
                            <CommandItem
                              key={option.id}
                              value={`${option.full_name} ${option.teams ?? ""}`}
                              onSelect={() => {
                                setSelectedSellerId(option.id);
                                setSellerPickerOpen(false);
                              }}
                            >
                              <Check
                                className={`size-4 ${selectedSellerId === option.id ? "opacity-100" : "opacity-0"}`}
                              />
                              <span>
                                <span className="block">{option.full_name}</span>
                                {option.teams && (
                                  <span className="block text-xs text-muted-foreground">
                                    {option.teams}
                                  </span>
                                )}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="mt-1 text-xs text-muted-foreground">
                    A lista respeita as equipes do usuário. Administradores podem escolher qualquer
                    vendedor.
                  </p>
                </div>
                <div>
                  <Label>Desconto geral</Label>
                  <div className="flex gap-2">
                    <Input
                      value={saleDiscount}
                      onChange={(e) => setSaleDiscount(e.target.value)}
                      inputMode="decimal"
                      aria-label="Valor do desconto geral"
                      disabled={!canManageDiscounts}
                    />
                    <Select
                      value={saleDiscountKind}
                      disabled={!canManageDiscounts}
                      onValueChange={(v) => setSaleDiscountKind(v as "valor" | "percent")}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="valor">{currency}</SelectItem>
                        <SelectItem value="percent">%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Forma de pagamento</Label>
                  <Select
                    value={payMethod}
                    onValueChange={(value) => {
                      setPayMethod(value);
                      setPayAmount("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
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
                {customerId && !sourceOrderId && (
                  <div className="sm:col-span-2 rounded-lg border bg-primary/5 p-3">
                    <p className="text-sm font-medium">Crédito disponível: {formatMoney(availableCredit, currency)}</p>
                    <label className="mt-2 flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={useCustomerCredit}
                        disabled={creditLoading || availableCredit <= 0 || payments.length > 0}
                        onCheckedChange={(checked) => {
                          setUseCustomerCredit(Boolean(checked));
                          if (!checked) setCustomerCreditAmount("");
                        }}
                      />
                      Usar crédito neste pedido
                    </label>
                    {useCustomerCredit && (
                      <div className="mt-2 max-w-xs">
                        <Label htmlFor="customer-credit-amount">Valor a abater ({currency})</Label>
                        <Input id="customer-credit-amount" value={customerCreditAmount}
                          onChange={(event) => setCustomerCreditAmount(event.target.value)} inputMode="decimal"
                          placeholder={formatMoney(Math.min(availableCredit,total),currency)} />
                        <p className="mt-1 text-xs text-muted-foreground">
                          O restante permanece como crédito. Registre outros pagamentos depois de salvar o pedido.
                        </p>
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <Label>Parcelas</Label>
                  <Input
                    value={payInstallments}
                    onChange={(e) => setPayInstallments(e.target.value)}
                    inputMode="numeric"
                    placeholder="Ex.: 3"
                  />
                </div>
                <div>
                  <Label>Data deste pagamento</Label>
                  <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Valor deste pagamento ({isPix(payMethod) ? "BRL · R$" : currency})</Label>
                  <div className="flex gap-2">
                    <Input
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      inputMode="decimal"
                      placeholder={String(
                        isPix(payMethod)
                          ? (rates.convert(remaining, currency, "BRL") ?? "")
                          : remaining,
                      )}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        if (!payMethod) return void toast.error("Escolha a forma de pagamento.");
                        const receivedCurrency = isPix(payMethod) ? "BRL" : currency;
                        const received = payAmount.trim()
                          ? toNumber(payAmount)
                          : rates.convert(remaining, currency, receivedCurrency);
                        const converted =
                          received === null
                            ? null
                            : rates.convert(received, receivedCurrency, currency);
                        if (converted === null)
                          return void toast.error(
                            "Informe uma cotação válida para este pagamento.",
                          );
                        const value = round2(converted);
                        if (!(value > 0))
                          return void toast.error("Informe um valor maior que zero.");
                        setPayments((prev) => [
                          ...prev,
                          {
                            method: payMethod,
                            installment: toNumber(payInstallments) || null,
                            amount: value,
                            received_amount: round2(received!),
                            received_currency: receivedCurrency,
                            paid_at: payDate || today(),
                          },
                        ]);
                        setPayAmount("");
                      }}
                    >
                      Adicionar
                    </Button>
                  </div>
                </div>
              </div>

              {payments.length > 0 && (
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Pagamentos lançados</caption>
                    <thead className="bg-muted/60 text-xs text-muted-foreground">
                      <tr>
                        <th className="p-2 text-left">Forma</th>
                        <th className="p-2 text-left">Parcelas</th>
                        <th className="p-2 text-left">Data</th>
                        <th className="p-2 text-right">Valor</th>
                        <th className="p-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{p.method}</td>
                          <td className="p-2">{p.installment ?? "—"}</td>
                          <td className="p-2">{p.paid_at || "—"}</td>
                          <td className="p-2 text-right">
                            {formatMoney(
                              p.received_amount ?? p.amount,
                              p.received_currency ?? currency,
                            )}
                          </td>
                          <td className="p-2 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setPayments((prev) => prev.filter((_, x) => x !== i))}
                            >
                              Remover
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border bg-primary/5 p-3">
                  <p className="text-xs text-muted-foreground">Valor pago</p>
                  <CurrencyValues
                    convert={rates.convert}
                    value={paid}
                    currency={currency}
                    className="text-xl"
                    emphasize
                    primaryFirst
                  />
                </div>
                <div
                  className={`rounded-lg border p-3 ${remaining > 0 ? "bg-destructive/10" : "bg-muted"}`}
                >
                  <p className="text-xs text-muted-foreground">Falta pagar</p>
                  <CurrencyValues
                    convert={rates.convert}
                    value={remaining}
                    currency={currency}
                    className="text-xl"
                    emphasize
                    primaryFirst
                  />
                </div>
              </div>

              <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Estoque de origem</Label>
                  <div className="flex gap-2">
                    <Select value={warehouseId} onValueChange={setWarehouseId}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Selecione o estoque" />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map((w: any) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name} · {w.city}/{w.state}
                            {warehouseHasStock(w.id) ? "" : " · saldo insuficiente"}
                            {distanceKm(w) == null ? "" : ` · ${distanceKm(w)!.toFixed(0)} km`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={suggestWarehouse}
                      title="Escolher o estoque com saldo mais próximo"
                    >
                      <Navigation className="mr-1 size-4" /> Sugerir
                    </Button>
                  </div>
                </div>
                {principalLowStock.length > 0 && (
                  <div className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="font-medium">Estoque principal baixo</p>
                      <p>
                        {principalLowStock
                          .map(
                            (item) =>
                              `${item.name}: ${formatNumber(item.availableAfterOrder, 3)} disponível, mínimo ${formatNumber(item.minimum, 3)}`,
                          )
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                )}
                <div>
                  <Label>Endereço de entrega</Label>
                  <Input
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    placeholder="Rua, avenida ou logradouro"
                  />
                </div>
                <div>
                  <Label>Número</Label>
                  <Input
                    value={shippingAddressNumber}
                    onChange={(e) => setShippingAddressNumber(e.target.value)}
                    placeholder="Número ou S/N"
                  />
                </div>
                <div className="sm:col-span-2 rounded-lg border bg-muted/20 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Checkbox
                      id="same-delivery-recipient"
                      checked={sameRecipientAsCustomer}
                      onCheckedChange={(checked) => {
                        const same = checked === true;
                        setSameRecipientAsCustomer(same);
                        if (same) {
                          setDeliveryRecipientName(customer?.name ?? "");
                          setDeliveryRecipientDocument(customer?.document ?? "");
                        }
                      }}
                    />
                    <Label htmlFor="same-delivery-recipient">Mesmos dados do cliente</Label>
                  </div>
                  <Label>Nome de quem receberá a entrega</Label>
                  <Popover open={recipientPickerOpen} onOpenChange={setRecipientPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        disabled={sameRecipientAsCustomer}
                        aria-expanded={recipientPickerOpen}
                        className="w-full justify-between font-normal"
                      >
                        <span className="truncate">
                          {deliveryRecipientName || "Digite ou selecione o destinatário"}
                        </span>
                        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[var(--radix-popover-trigger-width)] p-0"
                      align="start"
                    >
                      <Command>
                        <CommandInput placeholder="Buscar pessoa pelo nome..." />
                        <CommandList>
                          <CommandEmpty>Nenhuma pessoa cadastrada encontrada.</CommandEmpty>
                          {recipientOptions.map((entry) => (
                            <CommandItem
                              key={entry.id}
                              value={`${entry.label} ${entry.detail}`}
                              onSelect={() => selectRecipient(entry)}
                            >
                              <span>
                                <span className="block">{entry.label}</span>
                                <span className="block text-xs text-muted-foreground">
                                  {entry.detail || "Sem outros dados cadastrados"}
                                </span>
                              </span>
                            </CommandItem>
                          ))}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {!sameRecipientAsCustomer && (
                    <Input
                      className="mt-2"
                      value={deliveryRecipientName}
                      onChange={(e) => setDeliveryRecipientName(e.target.value)}
                      placeholder="Ou informe um novo destinatário"
                    />
                  )}
                  <Label className="mt-3 block">CPF ou documento de quem receberá</Label>
                  <Input
                    value={deliveryRecipientDocument}
                    onChange={(e) => setDeliveryRecipientDocument(e.target.value)}
                    inputMode="numeric"
                    placeholder={
                      sameRecipientAsCustomer
                        ? "Complete o CPF ou documento do cliente"
                        : "CPF ou documento do destinatário"
                    }
                  />
                </div>
                <div>
                  <Label>País de destino</Label>
                  <Select
                    value={shippingCountry}
                    onValueChange={(value) => {
                      setShippingCountry(value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Brasil">Brasil</SelectItem>
                      <SelectItem value="Paraguai">Paraguai</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    O frete segue a regra cadastrada em cada produto.
                  </p>
                </div>
                <div>
                  <Label>Cidade de destino</Label>
                  <Input value={shippingCity} onChange={(e) => setShippingCity(e.target.value)} />
                </div>
                <div>
                  <Label>Estado de destino</Label>
                  <Input
                    value={shippingState}
                    onChange={(e) => {
                      setShippingState(e.target.value.toUpperCase());
                    }}
                    maxLength={2}
                    placeholder="Ex.: SP"
                  />
                </div>
                <div>
                  <Label>CEP de destino</Label>
                  <div className="flex gap-2">
                    <Input
                      value={destinationCep}
                      onChange={(e) => setDestinationCep(formatCep(e.target.value))}
                      onBlur={() => {
                        if (destinationCep.replace(/\D/g, "").length === 8)
                          void fillDestinationFromCep();
                      }}
                      inputMode="numeric"
                      maxLength={9}
                      placeholder="00000-000"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void fillDestinationFromCep()}
                      disabled={loadingCep}
                    >
                      {loadingCep ? <Loader2 className="size-4 animate-spin" /> : "Buscar"}
                    </Button>
                  </div>
                </div>
                <div className="sm:col-span-2 rounded-lg border bg-primary/5 p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Percentual do frete</Label>
                      <div className="relative">
                        <Input
                          value={shippingPercentage ?? ""}
                          readOnly
                          inputMode="decimal"
                          className="pr-9"
                          placeholder="20"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                          %
                        </span>
                      </div>
                    </div>
                    <div>
                      <Label>Valor do frete ({currency})</Label>
                      <Input
                        value={shippingCost}
                        inputMode="decimal"
                        onChange={(event) => {
                          setShippingManuallyEdited(true);
                          setShippingCalculationError("");
                          setShippingCost(event.target.value);
                        }}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {secondaryCurrencyValues(freight)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {shippingManuallyEdited
                        ? "Frete informado manualmente."
                        : "Calculado pelas regras cadastradas em cada produto."}
                    </span>
                    {shippingManuallyEdited && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShippingManuallyEdited(false)}
                      >
                        Usar cálculo automático
                      </Button>
                    )}
                    <strong className="text-foreground">
                      {shippingManuallyEdited ? (
                        "Valor manual"
                      ) : shippingPercentage == null ? (
                        "Informe o estado para calcular"
                      ) : (
                        <>
                          {formatNumber(shippingPercentage, 2)}% ={" "}
                          <CurrencyValues
                            convert={rates.convert}
                            value={freight}
                            currency={currency}
                            layout="inline"
                            primaryFirst
                          />
                        </>
                      )}
                    </strong>
                  </div>
                  {shippingCalculationError && (
                    <p className="mt-1 text-xs text-destructive">{shippingCalculationError}</p>
                  )}
                </div>
                <div>
                  <Label>Outros custos variáveis ({currency})</Label>
                  <Input
                    value={variableCost}
                    onChange={(e) => setVariableCost(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {secondaryCurrencyValues(internalVariableCost)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Custo interno usado no cálculo do lucro bruto; não aumenta o valor cobrado do
                    cliente.
                  </p>
                </div>
                <div>
                  <Label>Data de emissão do pedido</Label>
                  <Input
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Previsão de entrega</Label>
                  <Input
                    type="date"
                    value={deliveryDeadline}
                    onChange={(e) => setDeliveryDeadline(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Data da entrega real</Label>
                  <Input
                    type="date"
                    value={deliveredAt}
                    onChange={(e) => setDeliveredAt(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Transportadora</Label>
                  <Input
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    placeholder="Nome da transportadora"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Código de rastreio</Label>
                  <Input
                    value={trackingCode}
                    onChange={(e) => setTrackingCode(e.target.value)}
                    placeholder="Informe quando estiver disponível"
                  />
                </div>
              </div>

              {!canManageDiscounts && (
                <p className="text-xs text-muted-foreground">
                  Descontos são definidos apenas por cargos de liderança.
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>WhatsApp do cliente</Label>
                  <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
                </div>
                <div>
                  <Label>Observações</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                </div>
                {sourceOrderId && (
                  <div className="sm:col-span-2">
                    <Label>Motivo da alteração</Label>
                    <Textarea
                      value={revisionNote}
                      onChange={(e) => setRevisionNote(e.target.value)}
                      placeholder="Ex.: endereço, quantidade e frete corrigidos a pedido do cliente"
                      rows={2}
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button type="button" onClick={() => finalize("pre_pedido")} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <ShoppingCart className="mr-1 h-4 w-4" />
                  )}
                  {catalogRequest
                    ? "Confirmar e gerar pedido"
                    : sourceOrderId
                      ? "Salvar nova versão"
                      : "Criar pedido"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* CARRINHO */}
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-center justify-between">
            <p className="font-medium">Itens do documento</p>
            <Button type="button" size="sm" variant="ghost" onClick={clearSale}>
              Limpar
            </Button>
          </div>
          {sourceOrderId && (
            <p className="rounded-md bg-amber-500/10 p-2 text-xs">
              {catalogRequest
                ? "Revisando uma solicitação do catálogo. O estoque será reservado e a entrega será criada somente após a confirmação."
                : "Editando um pedido existente. Ao salvar, uma nova versão será criada e a anterior continuará visível no histórico."}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Cliente: {customer?.name ?? (counterSale ? "Venda balcão" : "não selecionado")}
          </p>
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <Checkbox
              id="commission-enabled"
              checked={commissionEnabled}
              onCheckedChange={(checked) => {
                const enabled = checked === true;
                setCommissionEnabled(enabled);
                setLines((current) =>
                  current.map((line) => ({ ...line, commission_enabled: enabled })),
                );
              }}
            />
            <div>
              <Label htmlFor="commission-enabled">Este pedido tem comissão</Label>
              <p className="text-xs text-muted-foreground">
                A comissão é calculada por produto após o desconto do item.
              </p>
            </div>
          </div>

          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum item adicionado ainda.
            </p>
          ) : (
            <div className="space-y-3">
              {lines.map((l) => {
                const base = round2(l.quantity * l.unit_price);
                const canEditLineDiscount = canManageDiscounts || l.max_discount_percent > 0;
                const lineCommission = round2(
                  Math.max(0, base - l.discount) * (l.commission_percent / 100),
                );
                return (
                  <div key={l.key} className="rounded-lg border p-3">
                    {l.promotion_id && (
                      <div className="mb-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
                        <strong>Promoção ativa: {l.promotion_title}</strong>
                        <span className="ml-2">
                          sugestão de {currency}{" "}
                          {Number(l.promotion_original_price ?? l.unit_price).toLocaleString(
                            "pt-BR",
                            { minimumFractionDigits: 2 },
                          )}{" "}
                          por {currency}{" "}
                          {Number(l.unit_price).toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                        {l.promotion_ends_at && (
                          <span className="ml-2">
                            até {new Date(l.promotion_ends_at).toLocaleString("pt-BR")}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <Input
                        value={l.name}
                        disabled={Boolean(l.is_bonus)}
                        onChange={(e) => updateLine(l.key, { name: e.target.value })}
                        aria-label="Descrição do item"
                        className="h-8"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Remover item"
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    {l.is_bonus ? (
                      <p className="mt-2 text-xs text-primary">Bonificação: sem cobrança e sem comissão; o custo e a saída do estoque permanecem registrados.</p>
                    ) : (
                      <Button type="button" size="sm" variant="outline" className="mt-2"
                        onClick={() => addBonusLine(l)}>+ Adicionar unidade bonificada</Button>
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Quantidade</Label>
                        <DecimalInput
                          value={String(l.quantity)}
                          onChange={(e) =>
                            updateLine(l.key, { quantity: toNumber(e.target.value) })
                          }
                          inputMode="decimal"
                          className="h-8"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Preço ({currency})</Label>
                        <DecimalInput
                          value={String(l.unit_price)}
                          disabled={Boolean(l.is_bonus)}
                          onChange={(e) =>
                            updateLine(l.key, { unit_price: toNumber(e.target.value) })
                          }
                          inputMode="decimal"
                          className="h-8"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {secondaryCurrencyValues(l.unit_price)}
                        </p>
                      </div>
                      {canEditCosts && (
                        <div className="col-span-2 sm:col-span-1">
                          <Label className="text-xs">Custo manual por unidade ({currency})</Label>
                          <DecimalInput
                            value={l.unit_cost == null ? "" : String(l.unit_cost)}
                            onChange={(e) => updateLine(l.key, {
                              unit_cost: e.target.value.trim() === "" ? null : toNumber(e.target.value),
                            })}
                            inputMode="decimal"
                            placeholder="Usar custo do cadastro"
                            aria-label={`Custo por unidade de ${l.name}`}
                            className="h-8"
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            {l.unit_cost == null
                              ? "Em branco, usa o custo cadastrado no estoque."
                              : `Custo de ${formatNumber(l.quantity, 3)} unidade(s): ${formatMoney(round2(l.quantity * l.unit_cost), currency)}`}
                          </p>
                        </div>
                      )}
                      <div>
                        <Label className="text-xs">Desconto ({currency})</Label>
                        <DecimalInput
                          value={String(l.discount)}
                          disabled={Boolean(l.is_bonus) || !canEditLineDiscount}
                          onChange={(e) =>
                            updateLine(l.key, { discount: toNumber(e.target.value) })
                          }
                          inputMode="decimal"
                          className="h-8"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Desconto (%)</Label>
                        <DecimalInput
                          value={base ? String(round2((l.discount / base) * 100)) : "0"}
                          disabled={Boolean(l.is_bonus) || !canEditLineDiscount}
                          onChange={(e) =>
                            updateLine(l.key, {
                              discount: discountValue(base, toNumber(e.target.value), "percent"),
                            })
                          }
                          inputMode="decimal"
                          className="h-8"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Vender por valor ({currency})</Label>
                        <DecimalInput
                          value={String(round2(base - l.discount))}
                          disabled={!canEditLineDiscount}
                          onChange={(e) => sellByValue(l, toNumber(e.target.value))}
                          inputMode="decimal"
                          className="h-8"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {secondaryCurrencyValues(round2(base - l.discount))}
                        </p>
                      </div>
                      {commissionEnabled && (
                        <div className="col-span-2 grid gap-2 rounded-md bg-muted/40 p-2 sm:grid-cols-2">
                          <label className="flex items-center gap-2 text-xs font-medium">
                            <Checkbox
                              checked={l.commission_enabled}
                              onCheckedChange={(checked) =>
                                updateLine(l.key, { commission_enabled: checked === true })
                              }
                            />
                            Comissão neste produto
                          </label>
                          <div>
                            <Label className="text-xs">Comissão (%)</Label>
                            <DecimalInput
                              value={String(l.commission_percent)}
                              disabled={!l.commission_enabled}
                              min={0}
                              max={100}
                              step="0.01"
                              type="number"
                              onChange={(e) =>
                                updateLine(l.key, { commission_percent: toNumber(e.target.value) })
                              }
                              className="h-8"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground sm:col-span-2">
                            Comissão deste item:{" "}
                            <CurrencyValues
                              convert={rates.convert}
                              value={l.commission_enabled ? lineCommission : 0}
                              currency={currency}
                              layout="inline"
                              primaryFirst
                            />
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatNumber(l.available, 3)} disponível · {l.unit ?? "UN"} · desconto
                      permitido: {l.max_discount_percent}%
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-1 rounded-lg border p-3 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <CurrencyValues
                convert={rates.convert}
                value={gross}
                currency={currency}
                primaryFirst
              />
            </div>
            <div className="flex justify-between">
              <span>Descontos</span>
              <CurrencyValues
                convert={rates.convert}
                value={itemDiscounts + generalDiscount}
                currency={currency}
                primaryFirst
              />
            </div>
            <div className="flex justify-between">
              <span>Frete</span>
              <CurrencyValues
                convert={rates.convert}
                value={freight}
                currency={currency}
                primaryFirst
              />
            </div>
            {commissionEnabled && (
              <div className="flex justify-between">
                <span>Comissões</span>
                <CurrencyValues
                  convert={rates.convert}
                  value={commissionTotal}
                  currency={currency}
                  primaryFirst
                />
              </div>
            )}
            <div className="flex justify-between text-lg font-semibold">
              <span>Total</span>
              <CurrencyValues
                convert={rates.convert}
                value={total}
                currency={currency}
                emphasize
                primaryFirst
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* NOVO CLIENTE */}
      <Dialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo cliente</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Nome</Label>
              <Input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
            </div>
            <div>
              <Label>Documento</Label>
              <Input
                value={nc.document}
                onChange={(e) => setNc({ ...nc, document: e.target.value })}
              />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={createCustomer}>
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* COMPROVANTE */}
      <Dialog open={!!receipt} onOpenChange={(o) => !o && (setReceipt(null), clearSale())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Documento gerado</DialogTitle>
          </DialogHeader>
          {receipt && (
            <div className="space-y-3 text-sm">
              <p>
                Total de{" "}
                <CurrencyValues
                  convert={rates.convert}
                  value={receipt.total}
                  currency={receipt.currency}
                  layout="inline"
                  emphasize
                  primaryFirst
                />{" "}
                registrado.
              </p>
              <div>
                <Label>Formato de impressão</Label>
                <Select value={printFormat} onValueChange={(v) => setPrintFormat(v as PrintFormat)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="58">Bobina 58 mm</SelectItem>
                    <SelectItem value="80">Bobina 80 mm</SelectItem>
                    <SelectItem value="A4">Folha A4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    if (!printSalesDocument(receipt, printFormat))
                      toast.error("Libere as janelas pop-up para imprimir.");
                  }}
                >
                  <Printer className="mr-1 h-4 w-4" /> Nota do cliente
                </Button>
                {seesCompanyFinance && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (!printSalesDocument(receipt, printFormat, "internal"))
                        toast.error("Libere as janelas pop-up para imprimir.");
                    }}
                  >
                    <FileText className="mr-1 h-4 w-4" /> Relatório interno
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    window.open(
                      whatsappLink(whatsapp || customer?.phone, documentMessage(receipt)),
                      "_blank",
                      "noopener",
                    )
                  }
                >
                  <Send className="mr-1 h-4 w-4" /> Enviar no WhatsApp
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setReceipt(null);
                clearSale();
              }}
            >
              Nova operação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
