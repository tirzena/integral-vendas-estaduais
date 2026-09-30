/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Lock, Plus, Unlock, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useProductScope } from "@/hooks/useProductScope";
import { CURRENCIES, formatDateTime, formatMoney } from "@/lib/format";
import type { Currency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CurrencyValues } from "@/components/common/CurrencyValues";

type Register = any;

const MOVEMENT_KINDS = [
  { value: "entrada", label: "Entrada (reforço/recebimento)" },
  { value: "saida", label: "Saída (sangria/pagamento)" },
];

/** Caixa do dia: abertura, movimentações e fechamento. */
export function CashRegisterSection() {
  const { userId, isAdmin } = usePermissions();
  const { productId } = useProductScope();
  const qc = useQueryClient();
  const [tab, setTab] = useState("abertos");

  const registersQuery = useQuery({
    queryKey: ["cash-registers", productId],
    queryFn: async () => {
      let q = supabase
        .from("cash_registers")
        .select("*")
        .order("opened_at", { ascending: false })
        .limit(200);
      if (productId !== "todos") q = q.eq("product_id", productId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Register[];
    },
  });

  const movementsQuery = useQuery({
    queryKey: ["cash-movements-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_movements")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const profilesQuery = useQuery({
    queryKey: ["cash-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,full_name");
      return (data ?? []) as any[];
    },
  });

  const nameOf = (id?: string | null) =>
    profilesQuery.data?.find((p) => p.id === id)?.full_name ?? "—";

  const movementsOf = (registerId: string) =>
    (movementsQuery.data ?? []).filter((m) => m.register_id === registerId);

  const totalsOf = (register: Register) => {
    const rows = movementsOf(register.id);
    let inflow = 0;
    let outflow = 0;
    for (const m of rows) {
      const value = Number(m.amount ?? 0);
      if (m.kind === "saida") outflow += value;
      else inflow += value;
    }
    const opening = Number(register.opening_amount ?? 0);
    return { inflow, outflow, balance: opening + inflow - outflow, opening, count: rows.length };
  };

  const open = (registersQuery.data ?? []).filter((r) => r.status !== "fechado");
  const closed = (registersQuery.data ?? []).filter((r) => r.status === "fechado");

  const summary = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    let balance = 0;
    for (const r of open) {
      const t = totalsOf(r);
      inflow += t.inflow;
      outflow += t.outflow;
      balance += t.balance;
    }
    return { inflow, outflow, balance };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, movementsQuery.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["cash-registers"] });
    qc.invalidateQueries({ queryKey: ["cash-movements-all"] });
  };

  const openRegister = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from("cash_registers").insert({
        ...payload,
        opened_by: userId ?? null,
        product_id: productId === "todos" ? null : productId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Caixa aberto.");
      refresh();
    },
    onError: (e: any) => toast.error(e.message ?? "Não foi possível abrir o caixa."),
  });

  const closeRegister = useMutation({
    mutationFn: async ({ id, closing_amount, notes }: any) => {
      const { error } = await supabase
        .from("cash_registers")
        .update({
          status: "fechado",
          closed_at: new Date().toISOString(),
          closed_by: userId ?? null,
          closing_amount,
          notes,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Caixa fechado.");
      refresh();
    },
    onError: (e: any) => toast.error(e.message ?? "Não foi possível fechar o caixa."),
  });

  const addMovement = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from("cash_movements").insert({
        ...payload,
        created_by: userId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Movimentação lançada.");
      refresh();
    },
    onError: (e: any) => toast.error(e.message ?? "Não foi possível lançar."),
  });

  const removeRegister = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cash_registers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Caixa removido.");
      refresh();
    },
    onError: (e: any) => toast.error(e.message ?? "Não foi possível remover."),
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={<ArrowUpRight className="h-4 w-4 text-emerald-600" />}
          label="Entradas nos caixas abertos"
          value={<CurrencyValues value={summary.inflow} currency="BRL" emphasize />}
        />
        <SummaryCard
          icon={<ArrowDownRight className="h-4 w-4 text-destructive" />}
          label="Saídas nos caixas abertos"
          value={<CurrencyValues value={summary.outflow} currency="BRL" emphasize />}
        />
        <SummaryCard
          icon={<Wallet className="h-4 w-4 text-primary" />}
          label="Saldo atual em caixa"
          value={<CurrencyValues value={summary.balance} currency="BRL" emphasize />}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="abertos">Caixas abertos ({open.length})</TabsTrigger>
            <TabsTrigger value="fechados">Caixas fechados ({closed.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <OpenRegisterDialog onSubmit={(v) => openRegister.mutate(v)} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsContent value="abertos" className="space-y-3">
          {registersQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando caixas…</p>
          ) : open.length === 0 ? (
            <EmptyState text="Nenhum caixa aberto agora. Use “Abrir caixa” para começar o dia." />
          ) : (
            open.map((r) => (
              <RegisterCard
                key={r.id}
                register={r}
                totals={totalsOf(r)}
                movements={movementsOf(r)}
                nameOf={nameOf}
                canDelete={isAdmin}
                onClose={(closing_amount, notes) =>
                  closeRegister.mutate({ id: r.id, closing_amount, notes })
                }
                onMovement={(payload) =>
                  addMovement.mutate({
                    ...payload,
                    register_id: r.id,
                    currency: r.currency,
                    product_id: r.product_id,
                  })
                }
                onDelete={() => removeRegister.mutate(r.id)}
              />
            ))
          )}
        </TabsContent>
        <TabsContent value="fechados" className="space-y-3">
          {closed.length === 0 ? (
            <EmptyState text="Nenhum caixa fechado ainda." />
          ) : (
            closed.map((r) => (
              <RegisterCard
                key={r.id}
                register={r}
                totals={totalsOf(r)}
                movements={movementsOf(r)}
                nameOf={nameOf}
                canDelete={isAdmin}
                onDelete={() => removeRegister.mutate(r.id)}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-muted p-2">{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function OpenRegisterDialog({ onSubmit }: { onSubmit: (v: any) => void }) {
  const [openDialog, setOpenDialog] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("0");
  const [currency, setCurrency] = useState<Currency>("BRL");
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={openDialog} onOpenChange={setOpenDialog}>
      <DialogTrigger asChild>
        <Button>
          <Unlock className="mr-2 h-4 w-4" /> Abrir caixa
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abrir caixa do dia</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome do caixa</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Caixa loja / Caixa online"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Valor de abertura</Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Moeda</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              onSubmit({
                name: name.trim() || "Caixa do dia",
                opening_amount: Number(amount || 0),
                currency,
                notes: notes.trim() || null,
                status: "aberto",
              });
              setOpenDialog(false);
              setName("");
              setAmount("0");
              setNotes("");
            }}
          >
            Abrir caixa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegisterCard({
  register,
  totals,
  movements,
  nameOf,
  canDelete,
  onClose,
  onMovement,
  onDelete,
}: {
  register: Register;
  totals: { inflow: number; outflow: number; balance: number; opening: number; count: number };
  movements: any[];
  nameOf: (id?: string | null) => string;
  canDelete: boolean;
  onClose?: (closingAmount: number, notes: string | null) => void;
  onMovement?: (payload: any) => void;
  onDelete: () => void;
}) {
  const currency = (register.currency ?? "BRL") as Currency;
  const isOpen = register.status !== "fechado";

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-base">{register.name ?? "Caixa"}</CardTitle>
          <p className="text-xs text-muted-foreground">
            Aberto em {formatDateTime(register.opened_at)} por {nameOf(register.opened_by)}
            {register.closed_at
              ? ` · Fechado em ${formatDateTime(register.closed_at)} por ${nameOf(register.closed_by)}`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isOpen ? "default" : "secondary"}>{isOpen ? "Aberto" : "Fechado"}</Badge>
          {isOpen && onMovement ? (
            <MovementDialog currency={currency} onSubmit={onMovement} />
          ) : null}
          {isOpen && onClose ? <CloseDialog suggested={totals.balance} onSubmit={onClose} /> : null}
          {canDelete ? (
            <Button variant="ghost" size="sm" onClick={onDelete}>
              Excluir
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 text-sm sm:grid-cols-4">
          <Metric
            label="Abertura"
            value={<CurrencyValues value={totals.opening} currency={currency} />}
          />
          <Metric
            label="Entradas"
            value={<CurrencyValues value={totals.inflow} currency={currency} />}
            tone="up"
          />
          <Metric
            label="Saídas"
            value={<CurrencyValues value={totals.outflow} currency={currency} />}
            tone="down"
          />
          <Metric
            label={isOpen ? "Saldo atual" : "Fechamento"}
            value={
              <CurrencyValues
                value={isOpen ? totals.balance : (register.closing_amount ?? totals.balance)}
                currency={currency}
              />
            }
          />
        </div>
        {movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma movimentação neste caixa.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">Data</th>
                  <th className="p-2">Descrição</th>
                  <th className="p-2">Categoria</th>
                  <th className="p-2">Forma</th>
                  <th className="p-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="p-2 whitespace-nowrap">{formatDateTime(m.occurred_at)}</td>
                    <td className="p-2">{m.description ?? "—"}</td>
                    <td className="p-2">{m.category ?? "—"}</td>
                    <td className="p-2">{m.payment_method ?? "—"}</td>
                    <td
                      className={`p-2 text-right font-medium ${m.kind === "saida" ? "text-destructive" : "text-emerald-600"}`}
                    >
                      {m.kind === "saida" ? "-" : "+"}
                      <CurrencyValues
                        value={Number(m.amount ?? 0)}
                        currency={(m.currency ?? currency) as Currency}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {register.notes ? (
          <p className="text-xs text-muted-foreground">Observações: {register.notes}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`font-semibold ${tone === "up" ? "text-emerald-600" : tone === "down" ? "text-destructive" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function MovementDialog({
  currency,
  onSubmit,
}: {
  currency: Currency;
  onSubmit: (payload: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("entrada");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [method, setMethod] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1 h-4 w-4" /> Movimentação
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lançar movimentação ({currency})</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tipo</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOVEMENT_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Valor</Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Forma de pagamento</Label>
              <Input
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                placeholder="Dinheiro, Pix, cartão…"
              />
            </div>
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label>Categoria</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Venda, sangria, reforço…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!amount}
            onClick={() => {
              onSubmit({
                kind,
                amount: Number(amount || 0),
                description: description.trim() || null,
                category: category.trim() || null,
                payment_method: method.trim() || null,
                occurred_at: new Date().toISOString(),
              });
              setOpen(false);
              setAmount("");
              setDescription("");
              setCategory("");
              setMethod("");
            }}
          >
            Lançar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseDialog({
  suggested,
  onSubmit,
}: {
  suggested: number;
  onSubmit: (closingAmount: number, notes: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(suggested.toFixed(2)));
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Lock className="mr-1 h-4 w-4" /> Fechar caixa
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fechar caixa</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Saldo calculado pelo sistema: <strong>{suggested.toFixed(2)}</strong>. Informe o valor
            conferido.
          </p>
          <div>
            <Label>Valor conferido no fechamento</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label>Observações do fechamento</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              onSubmit(Number(amount || 0), notes.trim() || null);
              setOpen(false);
            }}
          >
            Confirmar fechamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
