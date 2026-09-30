/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const FIELDS: { key: string; label: string; placeholder?: string; wide?: boolean }[] = [
  { key: "legal_name", label: "Razão social", placeholder: "Sua empresa Ltda." },
  { key: "document", label: "CPF / CNPJ", placeholder: "00.000.000/0001-00" },
  { key: "brand_name", label: "Nome da marca (topo da nota)", placeholder: "OS" },
  { key: "tagline", label: "Subtítulo da marca", placeholder: "GESTÃO E OPERAÇÕES" },
  {
    key: "state_registration",
    label: "Inscrição estadual / RUC",
    placeholder: "Número do registro",
  },
  { key: "zip_code", label: "CEP", placeholder: "00000-000" },
  { key: "address", label: "Endereço", placeholder: "Rua, número e complemento", wide: true },
  { key: "city", label: "Cidade", placeholder: "Sua cidade" },
  { key: "state", label: "Estado", placeholder: "UF" },
  { key: "country", label: "País", placeholder: "Brasil" },
  { key: "phone", label: "Telefone", placeholder: "+55 (00) 0000-0000" },
  { key: "phone_secondary", label: "Telefone secundário", placeholder: "+55 (00) 0000-0000" },
  { key: "whatsapp", label: "WhatsApp", placeholder: "+55 (00) 00000-0000" },
  { key: "email", label: "E-mail", placeholder: "contato@suaempresa.com" },
  { key: "website", label: "Site", placeholder: "https://suaempresa.com" },
  { key: "catalog_url", label: "Catálogo digital", placeholder: "https://suaempresa.com/catalogo" },
  { key: "logo_url", label: "Link do logo", placeholder: "https://suaempresa.com/logo.png" },
];

export function CompanySettingsCard() {
  const { isAdmin } = usePermissions();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["company-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
      return data ?? null;
    },
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const missing = FIELDS.filter((f) => !String(form?.[f.key] ?? "").trim());

  async function save() {
    setSaving(true);
    const payload: any = {};
    FIELDS.forEach((f) => (payload[f.key] = form[f.key] || null));
    payload.invoice_notes = form.invoice_notes || null;
    const { error } = data?.id
      ? await supabase.from("company_settings").update(payload).eq("id", data.id)
      : await supabase.from("company_settings").insert(payload);
    setSaving(false);
    if (error) toast.error("Não foi possível salvar os dados da empresa.");
    else {
      toast.success("Dados da empresa atualizados.");
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      queryClient.invalidateQueries({ queryKey: ["sales-docs"] });
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Dados da empresa (nota de faturamento)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Estes dados aparecem no cabeçalho e no rodapé da nota. O que ficar em branco sai
              marcado como “a preencher” no documento.
              {missing.length > 0 && (
                <span className="ml-1 font-medium text-amber-600">
                  {missing.length} campo(s) ainda em branco.
                </span>
              )}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className={f.wide ? "sm:col-span-2" : undefined}>
                  <Label htmlFor={`co-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`co-${f.key}`}
                    className="mt-1.5"
                    placeholder={f.placeholder ?? "a preencher"}
                    disabled={!isAdmin}
                    value={form?.[f.key] ?? ""}
                    onChange={(e) => setForm((s: any) => ({ ...s, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="sm:col-span-2">
                <Label htmlFor="co-invoice_notes">Texto padrão da nota</Label>
                <Textarea
                  id="co-invoice_notes"
                  className="mt-1.5"
                  disabled={!isAdmin}
                  value={form?.invoice_notes ?? ""}
                  onChange={(e) => setForm((s: any) => ({ ...s, invoice_notes: e.target.value }))}
                />
              </div>
            </div>
            {isAdmin ? (
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar dados da empresa
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Somente administradores podem alterar os dados da empresa.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
