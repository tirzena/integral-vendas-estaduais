/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Link2, MapPinned, Pencil, Send, Trash2, Upload, UserPlus } from "lucide-react";
import { GoogleSheetDialog } from "@/components/contacts/GoogleSheetDialog";
import { getContactSheetLink, syncContactSheet } from "@/lib/sheets.functions";
import { assignContactLeads } from "@/lib/contacts.functions";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useProductScope } from "@/hooks/useProductScope";
import { usePeople } from "@/hooks/usePeople";
import { downloadCsv, stamp } from "@/lib/csv";
import { PageHeader, EmptyState } from "@/components/common/PageHeader";
import { RouteGuard } from "@/components/common/RouteGuard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/contatos")({
  validateSearch: (search: Record<string, unknown>) => ({
    lista: typeof search.lista === "string" ? search.lista : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Listas de contatos — OS" },
      {
        name: "description",
        content:
          "Suba planilhas de contatos, distribua para os vendedores e envie os escolhidos direto para o CRM.",
      },
      { property: "og:title", content: "Listas de contatos — OS" },
      {
        property: "og:description",
        content: "Importe planilhas, direcione contatos por membro e envie para o CRM.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RouteGuard capability="admin_area">
      <ContactListsPage />
    </RouteGuard>
  ),
});

const STATUS_OPTIONS = [
  { value: "novo", label: "Novo" },
  { value: "em_contato", label: "Em contato" },
  { value: "enviado_crm", label: "Enviado ao CRM" },
  { value: "descartado", label: "Descartado" },
];

const CSV_HEADERS = ["nome", "telefone", "email", "empresa", "cidade", "origem", "observacoes"];

/** Lê uma planilha simples em texto (CSV separado por ; ou ,). */
function parseCsv(text: string) {
  const clean = text.replace(/^\uFEFF/, "").trim();
  if (!clean) return [] as Record<string, string>[];
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  const sep =
    (lines[0]?.match(/;/g)?.length ?? 0) >= (lines[0]?.match(/,/g)?.length ?? 0) ? ";" : ",";
  const split = (line: string) =>
    line.split(sep).map((c) =>
      c
        .trim()
        .replace(/^"(.*)"$/, "$1")
        .trim(),
    );
  const header = split(lines[0]!).map((h) =>
    h
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""),
  );
  const rows: Record<string, string>[] = [];
  for (const line of lines.slice(1)) {
    const cells = split(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    if (Object.values(row).some((v) => v)) rows.push(row);
  }
  return rows;
}

function normalizeColumn(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const CONTACT_COLUMNS = [
  "nome",
  "name",
  "contato",
  "cliente",
  "telefone",
  "phone",
  "celular",
  "whatsapp",
  "email",
  "e mail",
  "empresa",
  "company",
  "cidade",
  "city",
  "origem",
  "origin",
  "fonte",
  "observacoes",
  "observacao",
  "notas",
  "notes",
];

function rowsToRecords(table: unknown[][]) {
  const candidates = table.slice(0, 50).map((row, index) => ({
    index,
    score: row.reduce((score, value) => {
      const key = normalizeColumn(value);
      return (
        score + (CONTACT_COLUMNS.some((known) => key === known || key.includes(known)) ? 1 : 0)
      );
    }, 0),
    filled: row.filter((value) => String(value ?? "").trim()).length,
  }));
  const detected = candidates.sort((a, b) => b.score - a.score || b.filled - a.filled)[0];
  const headerIndex =
    detected && detected.score > 0
      ? detected.index
      : Math.max(
          0,
          table.findIndex((row) => row.filter((value) => String(value ?? "").trim()).length >= 2),
        );
  const header = (table[headerIndex] ?? []).map(
    (value, index) => normalizeColumn(value) || `coluna ${index + 1}`,
  );
  return table
    .slice(headerIndex + 1)
    .map((cells) => {
      const row: Record<string, string> = {};
      header.forEach((key, index) => {
        const value = cells[index];
        row[key] =
          value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").trim();
      });
      return row;
    })
    .filter((row) => Object.values(row).some(Boolean));
}

function pick(row: Record<string, string>, keys: string[]) {
  for (const requested of keys) {
    const key = normalizeColumn(requested);
    const exact = row[key];
    if (exact) return exact;
    const found = Object.entries(row).find(
      ([column, value]) => value && (column.includes(key) || key.includes(column)),
    );
    if (found) return found[1];
  }
  return "";
}

function ContactListsPage() {
  const queryClient = useQueryClient();
  const navigate = Route.useNavigate();
  const { lista: selectedListId } = Route.useSearch();
  const { userId } = useCurrentUser();
  const { isAdmin, seesCompanySales } = usePermissions();
  const { products, productId, loading: productsLoading } = useProductScope();
  const { people, nameOf } = usePeople();
  const canManage = isAdmin || seesCompanySales;
  const getSheetLink = useServerFn(getContactSheetLink);
  const syncSheet = useServerFn(syncContactSheet);
  const saveContactAssignments = useServerFn(assignContactLeads);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState("todos");
  const [ownerFilter, setOwnerFilter] = useState("todos");
  const [selected, setSelected] = useState<string[]>([]);
  const [newListOpen, setNewListOpen] = useState(false);
  const [editListOpen, setEditListOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [listForm, setListForm] = useState<any>({});
  const [contactForm, setContactForm] = useState<any>({});
  const [sendProduct, setSendProduct] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const selectedProductId =
    productId !== "todos" && products.some((product) => product.id === productId)
      ? productId
      : null;

  const listsQuery = useQuery({
    queryKey: ["contact-lists", selectedProductId],
    enabled: !productsLoading,
    queryFn: async () => {
      let q = supabase.from("contact_lists").select("*").order("created_at", { ascending: false });
      if (selectedProductId) q = q.eq("product_id", selectedProductId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const lists = useMemo(() => listsQuery.data ?? [], [listsQuery.data]);
  const currentList = lists.find((l: any) => l.id === selectedListId) ?? lists[0] ?? null;
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["contact-leads"] });
    queryClient.invalidateQueries({ queryKey: ["contact-lists"] });
  }, [queryClient]);
  const catalogSlugs = useMemo(
    () =>
      lists
        .map((list: any) =>
          typeof list.source === "string" && list.source.startsWith("catalogo:")
            ? list.source.slice("catalogo:".length)
            : null,
        )
        .filter((slug: string | null): slug is string => !!slug),
    [lists],
  );
  const catalogsQuery = useQuery({
    queryKey: ["contact-list-catalogs", catalogSlugs],
    enabled: catalogSlugs.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("digital_catalogs")
        .select("slug,product_ids,category_ids,item_ids,offer_item_ids")
        .in("slug", catalogSlugs);
      if (error) throw error;
      return data ?? [];
    },
  });
  const catalogCategoriesQuery = useQuery({
    queryKey: ["contact-list-catalog-categories"],
    enabled: catalogSlugs.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_categories")
        .select("id,name,product_id")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const catalogItemsQuery = useQuery({
    queryKey: ["contact-list-catalog-items"],
    enabled: catalogSlugs.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("id,name,product_id,category_id")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const catalogBySlug = useMemo(
    () => new Map((catalogsQuery.data ?? []).map((catalog: any) => [catalog.slug, catalog])),
    [catalogsQuery.data],
  );
  const categoryNameById = useMemo(
    () =>
      new Map(
        (catalogCategoriesQuery.data ?? []).map((category: any) => [category.id, category.name]),
      ),
    [catalogCategoriesQuery.data],
  );
  const itemNameById = useMemo(
    () => new Map((catalogItemsQuery.data ?? []).map((item: any) => [item.id, item.name])),
    [catalogItemsQuery.data],
  );
  const categoryProductById = useMemo(
    () =>
      new Map(
        (catalogCategoriesQuery.data ?? []).map((category: any) => [
          category.id,
          category.product_id,
        ]),
      ),
    [catalogCategoriesQuery.data],
  );
  const itemProductById = useMemo(
    () => new Map((catalogItemsQuery.data ?? []).map((item: any) => [item.id, item.product_id])),
    [catalogItemsQuery.data],
  );

  function catalogScopeFor(list: any) {
    const slug =
      typeof list?.source === "string" && list.source.startsWith("catalogo:")
        ? list.source.slice("catalogo:".length)
        : null;
    const catalog: any = slug ? catalogBySlug.get(slug) : null;
    if (!catalog) return null;
    const itemIds = [...new Set([...(catalog.item_ids ?? []), ...(catalog.offer_item_ids ?? [])])];
    const productIds = new Set<string>((catalog.product_ids ?? []).filter(Boolean));
    for (const categoryId of catalog.category_ids ?? []) {
      const productId = categoryProductById.get(categoryId);
      if (productId) productIds.add(productId);
    }
    for (const itemId of itemIds) {
      const productId = itemProductById.get(itemId);
      if (productId) productIds.add(productId);
    }
    return {
      productIds: [...productIds],
      categories: [...productIds]
        .map((id: string) => products.find((product) => product.id === id)?.name)
        .filter(Boolean) as string[],
      subcategories: (catalog.category_ids ?? [])
        .map((id: string) => categoryNameById.get(id))
        .filter(Boolean) as string[],
      items: itemIds.map((id: string) => itemNameById.get(id)).filter(Boolean) as string[],
    };
  }

  useEffect(() => {
    if (!currentList?.id) return;
    let active = true;
    const run = async () => {
      const link = await getSheetLink({ data: { listId: currentList.id } }).catch(() => null);
      if (active && link)
        await syncSheet({ data: { listId: currentList.id } })
          .then(refresh)
          .catch(() => null);
    };
    void run();
    const timer = window.setInterval(() => void run(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [currentList?.id, getSheetLink, refresh, syncSheet]);

  const contactsQuery = useQuery({
    queryKey: ["contact-leads", currentList?.id],
    enabled: !!currentList?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_leads")
        .select("*")
        .eq("list_id", currentList!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const contacts = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    return (contactsQuery.data ?? []).filter((c: any) => {
      if (statusFilter !== "todos" && c.status !== statusFilter) return false;
      if (ownerFilter === "sem") {
        if (c.assigned_to) return false;
      } else if (ownerFilter !== "todos" && c.assigned_to !== ownerFilter) return false;
      if (!term) return true;
      return [c.name, c.phone, c.email, c.company, c.city, c.origin, c.notes]
        .filter(Boolean)
        .some((v: string) => v.toLowerCase().includes(term));
    });
  }, [contactsQuery.data, deferredSearch, statusFilter, ownerFilter]);

  async function createList() {
    if (!listForm.name?.trim()) return void toast.error("Dê um nome para a lista.");
    setBusy(true);
    const { data, error } = await supabase
      .from("contact_lists")
      .insert({
        name: listForm.name.trim(),
        description: listForm.description || null,
        source: listForm.source || null,
        product_id: listForm.product_id || selectedProductId,
        created_by: userId ?? null,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) return void toast.error("Não foi possível criar a lista.");
    toast.success("Lista criada.");
    setNewListOpen(false);
    setListForm({});
    await navigate({ search: { lista: data.id } });
    refresh();
  }

  async function removeList(id: string) {
    if (!confirm("Apagar esta lista e todos os contatos dela?")) return;
    const { error } = await supabase.from("contact_lists").delete().eq("id", id);
    if (error) return void toast.error("Não foi possível apagar a lista.");
    if (selectedListId === id) await navigate({ search: {} });
    toast.success("Lista apagada.");
    refresh();
  }

  function openEditList(l: any) {
    setEditForm({
      id: l.id,
      name: l.name ?? "",
      description: l.description ?? "",
      source: l.source ?? "",
      product_id: l.product_id ?? "",
    });
    setEditListOpen(true);
  }

  async function saveList() {
    if (!editForm.name?.trim()) return void toast.error("Dê um nome para a lista.");
    const catalogScope = catalogScopeFor(editForm);
    setBusy(true);
    const { error } = await supabase
      .from("contact_lists")
      .update({
        name: editForm.name.trim(),
        description: editForm.description || null,
        source: editForm.source || null,
        product_id:
          catalogScope?.productIds.length === 1
            ? catalogScope.productIds[0]
            : catalogScope
              ? null
              : editForm.product_id || null,
      })
      .eq("id", editForm.id);
    setBusy(false);
    if (error) return void toast.error("Não foi possível salvar a lista.");
    toast.success("Lista atualizada.");
    setEditListOpen(false);
    setEditForm({});
    refresh();
  }

  async function addContact() {
    if (!currentList) return;
    if (!contactForm.name?.trim()) return void toast.error("Informe o nome do contato.");
    setBusy(true);
    const { error } = await supabase.from("contact_leads").insert({
      list_id: currentList.id,
      product_id: currentList.product_id,
      name: contactForm.name.trim(),
      phone: contactForm.phone || null,
      email: contactForm.email || null,
      company: contactForm.company || null,
      city: contactForm.city || null,
      origin: contactForm.origin || null,
      notes: contactForm.notes || null,
      assigned_to: contactForm.assigned_to || null,
    });
    setBusy(false);
    if (error) return void toast.error("Não foi possível salvar o contato.");
    toast.success("Contato adicionado.");
    setNewContactOpen(false);
    setContactForm({});
    refresh();
  }

  async function importRows(rows: Record<string, string>[]) {
    if (!currentList) return void toast.error("Escolha ou crie uma lista antes de importar.");
    if (!rows.length)
      return void toast.error("A planilha está vazia ou em formato não reconhecido.");
    const payload = rows
      .map((r) => {
        const phone = pick(r, ["telefone", "phone", "celular", "whatsapp"]) || null;
        const email = pick(r, ["email", "e-mail"]) || null;
        const company = pick(r, ["empresa", "company"]) || null;
        // O nome é opcional: sem nome usamos telefone, e-mail ou empresa como identificação.
        const name =
          pick(r, ["nome", "name", "contato", "cliente"]) ||
          phone ||
          email ||
          company ||
          "Sem nome";
        return {
          list_id: currentList.id,
          product_id: currentList.product_id,
          name,
          phone,
          email,
          company,
          city: pick(r, ["cidade", "city"]) || null,
          origin: pick(r, ["origem", "origin", "fonte"]) || null,
          notes: pick(r, ["observacoes", "observacao", "notas", "notes"]) || null,
        };
      })
      // Só descarta linhas totalmente vazias.
      .filter((r) => r.phone || r.email || r.company || r.city || r.notes || r.name !== "Sem nome");
    if (!payload.length) return void toast.error("A planilha não tem nenhuma linha com dados.");
    setBusy(true);
    const { error } = await supabase.from("contact_leads").insert(payload);
    setBusy(false);
    if (error) return void toast.error("Não foi possível importar a planilha.");
    toast.success(`${payload.length} contato(s) importado(s).`);
    refresh();
  }

  async function importFile(file: File) {
    try {
      if (file.name.toLowerCase().endsWith(".xlsx")) {
        const { default: readXlsxFile } = await import("read-excel-file");
        const table = await readXlsxFile(file, { sheet: 1 });
        const rows = rowsToRecords(table);
        if (!rows.length)
          throw new Error("Nenhuma linha foi encontrada na primeira aba da planilha.");
        await importRows(rows);
        return;
      }
      await importRows(parseCsv(await file.text()));
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível ler esta planilha.");
    }
  }

  function exportList() {
    if (!currentList) return;
    downloadCsv(`contatos-${currentList.name}-${stamp()}.csv`, [
      [...CSV_HEADERS, "responsavel", "situacao"],
      ...contacts.map((c: any) => [
        c.name,
        c.phone ?? "",
        c.email ?? "",
        c.company ?? "",
        c.city ?? "",
        c.origin ?? "",
        c.notes ?? "",
        c.assigned_to ? nameOf(c.assigned_to) : "",
        STATUS_OPTIONS.find((s) => s.value === c.status)?.label ?? c.status,
      ]),
    ]);
  }

  function downloadTemplate() {
    downloadCsv("modelo-lista-de-contatos.csv", [
      CSV_HEADERS,
      [
        "Maria Silva",
        "+55 11 90000-0000",
        "maria@email.com",
        "Loja Maria",
        "São Paulo",
        "Instagram",
        "",
      ],
    ]);
  }

  async function updateContact(id: string, patch: any) {
    const { error } = await supabase.from("contact_leads").update(patch).eq("id", id);
    if (error) return void toast.error("Não foi possível salvar a alteração.");
    refresh();
    if (currentList?.id) void syncSheet({ data: { listId: currentList.id } }).catch(() => null);
  }

  async function assignContacts(contactIds: string[], memberId: string) {
    if (!contactIds.length || !currentList?.id) return;
    const assignedTo = memberId === "sem" ? null : memberId;
    const queryKey = ["contact-leads", currentList.id];
    const previous = queryClient.getQueryData<any[]>(queryKey);
    queryClient.setQueryData<any[]>(queryKey, (rows = []) =>
      rows.map((contact) =>
        contactIds.includes(contact.id) ? { ...contact, assigned_to: assignedTo } : contact,
      ),
    );
    try {
      await saveContactAssignments({ data: { contactIds, assignedTo } });
      toast.success(contactIds.length === 1 ? "Responsável alterado." : "Contatos direcionados.");
      await queryClient.invalidateQueries({ queryKey });
      if (currentList.id) void syncSheet({ data: { listId: currentList.id } }).catch(() => null);
    } catch (error: any) {
      queryClient.setQueryData(queryKey, previous);
      toast.error(error?.message ?? "Não foi possível salvar o responsável.");
    }
  }

  async function assignSelected(memberId: string) {
    if (!selected.length) return;
    await assignContacts(selected, memberId);
    setSelected([]);
  }

  async function deleteSelected() {
    if (!selected.length || !window.confirm(`Apagar ${selected.length} contato(s)?`)) return;
    const { error } = await supabase.from("contact_leads").delete().in("id", selected);
    if (error) return void toast.error("Não foi possível apagar os contatos.");
    setSelected([]);
    refresh();
  }

  /** Cria contato + oportunidade no funil da categoria escolhida. */
  async function sendToCrm() {
    const target = sendProduct || currentList?.product_id || selectedProductId || "";
    if (!target) return void toast.error("Escolha a categoria de destino.");
    const rows = (contactsQuery.data ?? []).filter((c: any) => selected.includes(c.id));
    if (!rows.length) return;

    setBusy(true);
    const { data: pipeline } = await supabase
      .from("pipelines")
      .select("id")
      .eq("product_id", target)
      .limit(1)
      .maybeSingle();
    const { data: stage } = pipeline
      ? await supabase
          .from("pipeline_stages")
          .select("id")
          .eq("pipeline_id", pipeline.id)
          .order("position")
          .limit(1)
          .maybeSingle()
      : { data: null as any };

    if (!pipeline || !stage) {
      setBusy(false);
      return void toast.error("A categoria escolhida ainda não tem funil configurado.");
    }

    let ok = 0;
    for (const row of rows) {
      const { data: customer, error: cErr } = await supabase
        .from("customers")
        .insert({
          name: row.name,
          phone: row.phone,
          whatsapp: row.phone,
          email: row.email,
          city: row.city,
          origin: row.origin ?? "lista de contatos",
          created_by: userId ?? null,
        })
        .select("id")
        .single();
      if (cErr || !customer) continue;
      const { data: opp, error: oErr } = await supabase
        .from("customer_products")
        .insert({
          customer_id: customer.id,
          product_id: target,
          pipeline_id: pipeline.id,
          stage_id: stage.id,
          owner_id: row.assigned_to ?? userId ?? null,
          commercial_status: "em_negociacao",
          lead_origin: row.origin ?? "lista de contatos",
          notes: row.notes,
        })
        .select("id")
        .single();
      if (oErr) continue;
      await supabase
        .from("contact_leads")
        .update({
          status: "enviado_crm",
          sent_to_crm_at: new Date().toISOString(),
          customer_product_id: opp?.id ?? null,
        })
        .eq("id", row.id);
      ok += 1;
    }
    setBusy(false);
    setSendOpen(false);
    setSelected([]);
    refresh();
    queryClient.invalidateQueries({ queryKey: ["crm"] });
    toast[ok ? "success" : "error"](
      ok ? `${ok} contato(s) enviado(s) para o CRM.` : "Nenhum contato pôde ser enviado.",
    );
  }

  const allChecked = contacts.length > 0 && selected.length === contacts.length;

  return (
    <>
      <PageHeader
        title="Listas de contatos"
        description="Suba planilhas de contatos, direcione para os vendedores e envie os escolhidos para o CRM."
        actions={
          canManage ? (
            <>
              <Button variant="outline" onClick={downloadTemplate}>
                <Download className="mr-2 size-4" /> Modelo de planilha
              </Button>
              <Button variant="outline" asChild>
                <Link to="/contatos/mapa">
                  <MapPinned className="mr-2 size-4" /> Busca avançada
                </Link>
              </Button>
              <Button onClick={() => setNewListOpen(true)}>Nova lista</Button>
            </>
          ) : null
        }
      />

      {listsQuery.isError ? (
        <EmptyState
          title="Não foi possível carregar as listas"
          description="A conexão falhou. Tente novamente para carregar as listas de contatos."
          action={<Button onClick={() => void listsQuery.refetch()}>Tentar novamente</Button>}
        />
      ) : lists.length === 0 ? (
        <EmptyState
          title="Nenhuma lista de contatos"
          description="Crie uma lista e importe a planilha com os contatos dos vendedores."
          action={
            canManage ? <Button onClick={() => setNewListOpen(true)}>Nova lista</Button> : undefined
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <div className="flex flex-col gap-2">
            {lists.map((l: any) => (
              <div
                key={l.id}
                onClick={() => {
                  void navigate({ search: { lista: l.id } });
                  setSelected([]);
                }}
                className={`group cursor-pointer rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  currentList?.id === l.id ? "border-primary bg-primary/5" : "hover:bg-muted"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <p className="truncate font-medium">{l.name}</p>
                  {canManage && (
                    <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        title="Editar lista"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditList(l);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:text-destructive"
                        title="Apagar lista"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeList(l.id);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {catalogScopeFor(l)?.categories.join(", ") ||
                    products.find((p) => p.id === l.product_id)?.name ||
                    "Sem categoria"}
                </p>
              </div>
            ))}
          </div>

          <Card>
            <CardContent className="space-y-4 pt-6">
              {currentList && (
                <div>
                  <h2 className="font-display text-xl font-semibold">{currentList.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    Planilha de contatos com preenchimento automático e manual.
                  </p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar contato…"
                  className="w-full sm:max-w-xs"
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Situação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas as situações</SelectItem>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {canManage && (
                  <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os responsáveis</SelectItem>
                      <SelectItem value="sem">Sem responsável</SelectItem>
                      {people.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <div className="ml-auto flex flex-wrap gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.csv,text/csv,text/plain"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void importFile(f);
                      e.target.value = "";
                    }}
                  />
                  {canManage && (
                    <Button
                      variant="outline"
                      onClick={() => fileRef.current?.click()}
                      disabled={busy}
                    >
                      <Upload className="mr-2 size-4" /> Importar planilha
                    </Button>
                  )}
                  {canManage && (
                    <Button variant="outline" onClick={() => setSheetOpen(true)} disabled={busy}>
                      <Link2 className="mr-2 size-4" /> Planilha do Google
                    </Button>
                  )}

                  <Button variant="outline" onClick={exportList}>
                    <Download className="mr-2 size-4" /> Exportar
                  </Button>
                  {canManage && (
                    <Button onClick={() => setNewContactOpen(true)}>
                      <UserPlus className="mr-2 size-4" /> Novo contato
                    </Button>
                  )}
                </div>
              </div>

              {selected.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2">
                  <span className="text-sm">{selected.length} selecionado(s)</span>
                  {canManage && (
                    <Select onValueChange={assignSelected}>
                      <SelectTrigger className="w-[210px]">
                        <SelectValue placeholder="Direcionar para o membro" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sem">Sem responsável</SelectItem>
                        {people.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    size="sm"
                    onClick={() => {
                      setSendProduct(currentList?.product_id ?? selectedProductId ?? "");
                      setSendOpen(true);
                    }}
                  >
                    <Send className="mr-2 size-4" /> Enviar para o CRM
                  </Button>
                  {isAdmin && (
                    <Button size="sm" variant="ghost" onClick={deleteSelected}>
                      <Trash2 className="mr-2 size-4" /> Apagar
                    </Button>
                  )}
                </div>
              )}

              {contactsQuery.isError ? (
                <EmptyState
                  title="Não foi possível carregar os contatos"
                  description="A conexão falhou. Tente novamente para carregar os contatos desta lista."
                  action={
                    <Button onClick={() => void contactsQuery.refetch()}>Tentar novamente</Button>
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">
                          <Checkbox
                            checked={allChecked}
                            onCheckedChange={(v) =>
                              setSelected(v ? contacts.map((c: any) => c.id) : [])
                            }
                            aria-label="Selecionar todos"
                          />
                        </TableHead>
                        <TableHead>Contato</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>E-mail</TableHead>
                        <TableHead>Cidade</TableHead>
                        <TableHead>Dados do catálogo</TableHead>
                        <TableHead>Responsável</TableHead>
                        <TableHead>Situação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contacts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                            Planilha vazia. Adicione um contato manualmente, importe uma planilha ou
                            aguarde os contatos enviados pelo catálogo.
                          </TableCell>
                        </TableRow>
                      ) : (
                        contacts.map((c: any) => (
                          <TableRow key={c.id}>
                            <TableCell>
                              <Checkbox
                                checked={selected.includes(c.id)}
                                onCheckedChange={(v) =>
                                  setSelected((prev) =>
                                    v ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                                  )
                                }
                                aria-label={`Selecionar ${c.name}`}
                              />
                            </TableCell>
                            <TableCell>
                              <p className="font-medium">{c.name}</p>
                              {c.company && (
                                <p className="text-xs text-muted-foreground">{c.company}</p>
                              )}
                            </TableCell>
                            <TableCell>{c.phone ?? "—"}</TableCell>
                            <TableCell>{c.email ?? "—"}</TableCell>
                            <TableCell>{c.city ?? "—"}</TableCell>
                            <TableCell className="min-w-[260px] max-w-sm">
                              {c.notes ? (
                                <p className="whitespace-pre-line text-xs text-muted-foreground">
                                  {c.notes}
                                </p>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell>
                              {canManage ? (
                                <Select
                                  value={c.assigned_to ?? "sem"}
                                  onValueChange={(v) => void assignContacts([c.id], v)}
                                >
                                  <SelectTrigger className="w-[170px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="sem">Sem responsável</SelectItem>
                                    {people.map((p) => (
                                      <SelectItem key={p.id} value={p.id}>
                                        {p.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span>{c.assigned_to ? nameOf(c.assigned_to) : "—"}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {c.status === "enviado_crm" ? (
                                <Badge variant="secondary">Enviado ao CRM</Badge>
                              ) : (
                                <Select
                                  value={c.status}
                                  onValueChange={(v) => updateContact(c.id, { status: v })}
                                >
                                  <SelectTrigger className="w-[150px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {STATUS_OPTIONS.map((s) => (
                                      <SelectItem key={s.value} value={s.value}>
                                        {s.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              {isAdmin && currentList && (
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => removeList(currentList.id)}>
                    <Trash2 className="mr-2 size-4" /> Apagar lista
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={newListOpen} onOpenChange={setNewListOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova lista de contatos</DialogTitle>
            <DialogDescription>
              Depois de criar, importe a planilha e direcione os contatos para os vendedores.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Nome da lista</Label>
              <Input
                value={listForm.name ?? ""}
                onChange={(e) => setListForm({ ...listForm, name: e.target.value })}
                placeholder="Ex.: Leads Instagram — setembro"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Categoria</Label>
              <Select
                value={listForm.product_id ?? selectedProductId ?? ""}
                onValueChange={(v) => setListForm({ ...listForm, product_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Origem</Label>
              <Input
                value={listForm.source ?? ""}
                onChange={(e) => setListForm({ ...listForm, source: e.target.value })}
                placeholder="Instagram, feira, indicação…"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Descrição</Label>
              <Textarea
                value={listForm.description ?? ""}
                onChange={(e) => setListForm({ ...listForm, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={createList} disabled={busy}>
              Criar lista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editListOpen} onOpenChange={setEditListOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar lista</DialogTitle>
            <DialogDescription>
              {catalogScopeFor(editForm)
                ? "A seleção de categorias e produtos acompanha o catálogo online."
                : "Ajuste o nome, a categoria, a origem e a descrição."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Nome da lista</Label>
              <Input
                value={editForm.name ?? ""}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            {catalogScopeFor(editForm) ? (
              <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
                {[
                  ["Categorias incluídas", catalogScopeFor(editForm)?.categories],
                  ["Subcategorias incluídas", catalogScopeFor(editForm)?.subcategories],
                  ["Produtos incluídos", catalogScopeFor(editForm)?.items],
                ].map(([label, values]) => (
                  <div key={label as string} className="grid gap-1.5">
                    <Label>{label as string}</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {(values as string[])?.length ? (
                        (values as string[]).map((value) => (
                          <Badge key={value} variant="secondary">
                            {value}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">Todos</span>
                      )}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Para alterar estes vínculos, edite o catálogo online correspondente.
                </p>
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label>Categoria</Label>
                <Select
                  value={editForm.product_id || "nenhuma"}
                  onValueChange={(v) =>
                    setEditForm({ ...editForm, product_id: v === "nenhuma" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma">Sem categoria</SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label>Origem</Label>
              <Input
                value={editForm.source ?? ""}
                onChange={(e) => setEditForm({ ...editForm, source: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Descrição</Label>
              <Textarea
                value={editForm.description ?? ""}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveList} disabled={busy}>
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newContactOpen} onOpenChange={setNewContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo contato</DialogTitle>
            <DialogDescription>Adicione um contato manualmente nesta lista.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { key: "name", label: "Nome" },
              { key: "phone", label: "Telefone" },
              { key: "email", label: "E-mail" },
              { key: "company", label: "Empresa" },
              { key: "city", label: "Cidade" },
              { key: "origin", label: "Origem" },
            ].map((f) => (
              <div key={f.key} className="grid gap-1.5">
                <Label>{f.label}</Label>
                <Input
                  value={contactForm[f.key] ?? ""}
                  onChange={(e) => setContactForm({ ...contactForm, [f.key]: e.target.value })}
                />
              </div>
            ))}
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Responsável</Label>
              <Select
                value={contactForm.assigned_to ?? ""}
                onValueChange={(v) => setContactForm({ ...contactForm, assigned_to: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem responsável" />
                </SelectTrigger>
                <SelectContent>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Observações</Label>
              <Textarea
                value={contactForm.notes ?? ""}
                onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={addContact} disabled={busy}>
              Salvar contato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar para o CRM</DialogTitle>
            <DialogDescription>
              Cada contato vira uma oportunidade na primeira etapa do funil, com o responsável já
              definido.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label>Categoria de destino</Label>
            <Select value={sendProduct} onValueChange={setSendProduct}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha a categoria" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button onClick={sendToCrm} disabled={busy}>
              Enviar {selected.length} contato(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GoogleSheetDialog
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        listId={currentList?.id ?? null}
      />
    </>
  );
}
