/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState, type ReactNode } from "react";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useDeleteRow, useRows, useSaveRow, useSaveRows } from "@/lib/db";
import { PageHeader, EmptyState, DemoBadge } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useEstadualAccess } from "@/hooks/useEstadualAccess";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type FieldType =
  "text" | "email" | "tel" | "number" | "date" | "textarea" | "select" | "multiselect" | "switch";

export type Field = {
  name: string;
  label: string;
  type?: FieldType;
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  help?: string;
  defaultValue?: any;
  full?: boolean;
};

export type Column = {
  key: string;
  label: string;
  render?: (row: any) => ReactNode;
  className?: string;
};

type Props = {
  title: string;
  description?: string;
  table: string;
  columns: Column[];
  fields: Field[];
  searchKeys?: string[];
  filter?: Record<string, any>;
  inFilter?: { column: string; values: any[] } | null;
  orderBy?: { column: string; ascending?: boolean };
  select?: string;
  canWrite?: boolean;
  /** Quando falso, esconde o botão de cadastrar mantendo edição e exclusão. */
  canCreate?: boolean;
  createLabel?: string;
  extraActions?: ReactNode;
  /** Filtros extras exibidos ao lado da busca (valem para todas as visualizações). */
  extraFilters?: ReactNode;
  /** Substitui a tabela por outra visualização (lista, calendário...). */
  renderBody?: (rows: any[]) => ReactNode;
  banner?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  beforeSave?: (
    values: Record<string, any>,
    context: { editing: boolean; row: any | null },
  ) => Record<string, any>;
  rowActions?: (row: any) => ReactNode;
  sortRows?: (a: any, b: any) => number;
  /** Filtro extra aplicado às linhas já carregadas (ex.: período). */
  filterRow?: (row: any) => boolean;
  /** Transforma um cadastro novo em várias linhas (ex.: parcelamento). */
  expandSave?: (values: Record<string, any>) => Record<string, any>[];
  enabled?: boolean;
};

export function ResourcePage({
  title,
  description,
  table,
  columns,
  fields,
  searchKeys = ["name"],
  filter,
  inFilter,
  orderBy,
  select,
  canWrite = true,
  canCreate = true,
  createLabel = "Novo",
  extraActions,
  extraFilters,
  renderBody,
  banner,
  emptyTitle,
  emptyDescription,
  beforeSave,
  rowActions,
  sortRows,
  filterRow,
  expandSave,
  enabled = true,
}: Props) {
  const estadualAccess = useEstadualAccess();
  const effectiveCanWrite = canWrite && estadualAccess.canWrite;
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<any | null>(null);

  const query = useRows(table, {
    filter: filter ?? {},
    inFilter: inFilter ?? null,
    orderBy: orderBy ?? { column: "created_at", ascending: false },
    select: select ?? "*",
    enabled,
  });
  const save = useSaveRow(table, () => setOpen(false));
  const saveMany = useSaveRows(table, () => setOpen(false));
  const remove = useDeleteRow(table);

  const rows = useMemo(() => {
    let list = (query.data ?? []) as any[];
    if (filterRow) list = list.filter(filterRow);
    const t = term.trim().toLowerCase();
    if (t) {
      list = list.filter((row) =>
        searchKeys.some((key) =>
          String(row[key] ?? "")
            .toLowerCase()
            .includes(t),
        ),
      );
    }
    return sortRows ? [...list].sort(sortRows) : list;
  }, [query.data, term, searchKeys, sortRows, filterRow]);

  function openNew() {
    const initial: Record<string, any> = {};
    fields.forEach((f) => {
      initial[f.name] = f.defaultValue ?? (f.type === "multiselect" ? [] : f.type === "switch" ? true : "");
    });
    setValues(initial);
    setEditing(null);
    setErrors({});
    setOpen(true);
  }

  function openEdit(row: any) {
    const initial: Record<string, any> = {};
    fields.forEach((f) => {
      const value = row[f.name];
      initial[f.name] =
        f.type === "date" && value
          ? String(value).slice(0, 10)
          : (value ?? (f.type === "multiselect" ? [] : f.type === "switch" ? false : ""));
    });
    setValues(initial);
    setEditing(row);
    setErrors({});
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    fields.forEach((f) => {
      const v = values[f.name];
      if (f.required && (v === "" || v === null || v === undefined)) {
        next[f.name] = "Campo obrigatório.";
      }
      if (f.type === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))) {
        next[f.name] = "Informe um e-mail válido.";
      }
      if (f.type === "number" && v !== "" && v !== null && isNaN(Number(v))) {
        next[f.name] = "Informe um número válido.";
      }
    });
    setErrors(next);
    if (Object.keys(next).length) return;

    let payload: Record<string, any> = { ...(filter ?? {}) };
    fields.forEach((f) => {
      let v = values[f.name];
      if (f.type === "number") v = v === "" ? null : Number(v);
      if (v === "") v = null;
      payload[f.name] = v;
    });
    Object.keys(payload).forEach((k) => {
      if (payload[k] === "todos") delete payload[k];
    });
    if (beforeSave) payload = beforeSave(payload, { editing: !!editing, row: editing });
    if (editing) {
      payload["id"] = editing["id"];
      save.mutate(payload);
      return;
    }
    const expanded = expandSave ? expandSave(payload) : [payload];
    if (expanded.length > 1) saveMany.mutate(expanded);
    else save.mutate(expanded[0] ?? payload);
  }

  // Edição rápida de campos "select" (ex.: status) direto na célula da tabela.
  function quickField(columnKey: string): Field | undefined {
    return fields.find((f) => f.name === columnKey && f.type === "select");
  }

  function quickSave(row: any, field: string, value: string) {
    if (value === row[field]) return;
    save.mutate({ id: row.id, [field]: value } as any);
  }

  return (
    <div>
      <PageHeader
        title={title}
        {...(description ? { description } : {})}
        actions={
          <>
            {extraActions}
            {effectiveCanWrite && canCreate && (
              <Button onClick={openNew}>
                <Plus className="mr-2 size-4" /> {createLabel}
              </Button>
            )}
          </>
        }
      />

      {banner ? <div className="mb-6">{banner}</div> : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Filtrar nesta lista…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        {extraFilters}
        <span className="text-sm text-muted-foreground">{rows.length} registro(s)</span>
      </div>

      {query.isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando…
        </div>
      ) : query.isError ? (
        <EmptyState
          title="Não foi possível carregar os dados"
          description="Verifique sua conexão ou suas permissões de acesso e tente novamente."
          action={<Button onClick={() => query.refetch()}>Tentar de novo</Button>}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={emptyTitle ?? "Nenhum registro por aqui"}
          description={
            emptyDescription ?? "Cadastre o primeiro registro para começar a usar este módulo."
          }
          action={
            effectiveCanWrite && canCreate ? <Button onClick={openNew}>{createLabel}</Button> : undefined
          }
        />
      ) : renderBody ? (
        renderBody(rows)
      ) : (
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.key} className={c.className}>
                    {c.label}
                  </TableHead>
                ))}
                <TableHead className="w-24 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((c) => {
                    const qf = effectiveCanWrite ? quickField(c.key) : undefined;
                    return (
                      <TableCell key={c.key} className={c.className}>
                        <span className="inline-flex items-center gap-2">
                          {qf ? (
                            <Select
                              value={row[c.key] ? String(row[c.key]) : ""}
                              onValueChange={(val) => quickSave(row, c.key, val)}
                            >
                              <SelectTrigger
                                className="h-auto w-auto gap-1 border-none bg-transparent p-0 shadow-none focus:ring-0 [&>svg]:size-3 [&>svg]:text-muted-foreground"
                                aria-label={`Alterar ${c.label}`}
                              >
                                {c.render ? c.render(row) : (row[c.key] ?? "—")}
                              </SelectTrigger>
                              <SelectContent>
                                {(qf.options ?? []).map((o) => (
                                  <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : c.render ? (
                            c.render(row)
                          ) : (
                            (row[c.key] ?? "—")
                          )}
                          {c.key === columns[0]?.key && row.is_demo && <DemoBadge />}
                        </span>
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right whitespace-nowrap">
                    {rowActions?.(row)}
                    {effectiveCanWrite && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Editar"
                          onClick={() => openEdit(row)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Excluir"
                          onClick={() => setDeleting(row)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar registro" : "Novo registro"}</DialogTitle>
            <DialogDescription>
              Preencha os campos abaixo. Os itens marcados com * são obrigatórios.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div
                key={f.name}
                className={f.full || f.type === "textarea" || f.type === "multiselect" ? "sm:col-span-2" : undefined}
              >
                <Label htmlFor={f.name}>
                  {f.label}
                  {f.required && " *"}
                </Label>
                <div className="mt-1.5">
                  {f.type === "textarea" ? (
                    <Textarea
                      id={f.name}
                      value={values[f.name] ?? ""}
                      placeholder={f.placeholder}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                    />
                  ) : f.type === "multiselect" ? (
                    <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
                      {(f.options ?? []).map((option) => {
                        const selected: string[] = Array.isArray(values[f.name]) ? values[f.name] : [];
                        return (
                          <label key={option.value} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selected.includes(option.value)}
                              onChange={(event) => setValues((previous) => ({
                                ...previous,
                                [f.name]: event.target.checked
                                  ? [...selected, option.value]
                                  : selected.filter((value) => value !== option.value),
                              }))}
                            />
                            {option.label}
                          </label>
                        );
                      })}
                    </div>
                  ) : f.type === "select" ? (
                    <Select
                      value={values[f.name] ? String(values[f.name]) : ""}
                      onValueChange={(val) => setValues((v) => ({ ...v, [f.name]: val }))}
                    >
                      <SelectTrigger id={f.name}>
                        <SelectValue placeholder="Selecione…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(f.options ?? []).map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : f.type === "switch" ? (
                    <div className="flex h-9 items-center">
                      <Switch
                        id={f.name}
                        checked={!!values[f.name]}
                        onCheckedChange={(val) => setValues((v) => ({ ...v, [f.name]: val }))}
                      />
                    </div>
                  ) : (
                    <Input
                      id={f.name}
                      type={f.type ?? "text"}
                      value={values[f.name] ?? ""}
                      placeholder={f.placeholder}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                    />
                  )}
                </div>
                {f.help && !errors[f.name] && (
                  <p className="mt-1 text-xs text-muted-foreground">{f.help}</p>
                )}
                {errors[f.name] && (
                  <p className="mt-1 text-xs text-destructive">{errors[f.name]}</p>
                )}
              </div>
            ))}
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O registro será removido definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) remove.mutate(deleting.id);
                setDeleting(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
