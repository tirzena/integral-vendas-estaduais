/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { ResourcePage } from "@/components/common/ResourcePage";
import { useProductScope } from "@/hooks/useProductScope";
import { useCurrentUser } from "@/hooks/useAuth";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { MediaEmbed } from "@/components/scripts/MediaEmbed";

const SYSTEM_OPTIONS = [
  { value: "direcao_geral", label: "Direção Geral" },
  { value: "captacao", label: "Captação" },
  { value: "vendas_estaduais", label: "Vendas Estaduais" },
  { value: "lideranca_regional", label: "Liderança Regional" },
  { value: "distribuidores_municipais", label: "Distribuidores Municipais" },
  { value: "estoques", label: "Estoques" },
  { value: "fornecedores", label: "Fornecedores" },
  { value: "transportes", label: "Transportes" },
];

const systemLabel = (codes: string[] | null) =>
  !codes?.length ? "Todos os sistemas" : codes.map((code) => SYSTEM_OPTIONS.find((s) => s.value === code)?.label ?? code).join(", ");

export const Route = createFileRoute("/_authenticated/avisos")({
  head: () => ({
    meta: [
      { title: "Avisos internos — OS" },
      { name: "description", content: "Comunicados internos por produto, equipe e perfil." },
      { property: "og:title", content: "Avisos internos — OS" },
      { property: "og:description", content: "Comunicados internos da empresa." },
    ],
  }),
  component: Avisos,
});

function inputDateToday() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function safeDateTime(value: unknown, endOfDay = false) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 12,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
  );
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date.toISOString();
}

function Avisos() {
  const { productId } = useProductScope();
  const { userId, isAdmin } = useCurrentUser();
  const filter = productId === "todos" ? {} : { product_id: productId };

  return (
    <ResourcePage
      title="Avisos internos"
      description="Publique para todos os sistemas ou selecione os destinos do comunicado."
      table="internal_notices"
      filter={filter}
      canWrite={isAdmin}
      filterRow={(row) => isAdmin || !row.target_systems?.length || row.target_systems.includes("direcao_geral")}
      searchKeys={["title", "content"]}
      emptyTitle="Nenhum aviso publicado"
      emptyDescription="Publique um comunicado para toda a equipe ou para os sistemas escolhidos."
      beforeSave={(v) => ({
        ...v,
        publish_at: safeDateTime(v["publish_at"]) ?? new Date().toISOString(),
        expires_at: v["expires_at"] ? safeDateTime(v["expires_at"], true) : null,
        author_id: v["author_id"] ?? userId,
        target_systems: Array.isArray(v["target_systems"]) ? v["target_systems"] : [],
      })}
      columns={[
        {
          key: "title",
          label: "Aviso",
          render: (r: any) => (
            <div className="min-w-64 space-y-2">
              <p className="font-medium">{r.title}</p>
              {r.image_url && <MediaEmbed url={r.image_url} label={r.title} />}
              {r.video_url && <MediaEmbed url={r.video_url} label={r.title} />}
            </div>
          ),
        },
        {
          key: "priority",
          label: "Prioridade",
          render: (r: any) => (
            <Badge variant={r.is_urgent ? "destructive" : "secondary"}>
              {r.is_urgent ? "Urgente" : (r.priority ?? "normal")}
            </Badge>
          ),
        },
        { key: "target_systems", label: "Sistemas", render: (r: any) => systemLabel(r.target_systems) },
        {
          key: "show_on_login",
          label: "Tela de login",
          render: (r: any) => (
            <Badge variant={r.show_on_login ? "default" : "outline"}>
              {r.show_on_login ? "Visível" : "Interno"}
            </Badge>
          ),
        },
        {
          key: "publish_at",
          label: "Publicação",
          render: (r: any) => formatDateTime(r.publish_at),
        },
        { key: "expires_at", label: "Expira", render: (r: any) => formatDateTime(r.expires_at) },
      ]}
      fields={[
        { name: "title", label: "Título", required: true, full: true },
        {
          name: "target_systems",
          label: "Sistemas de destino",
          type: "multiselect",
          options: SYSTEM_OPTIONS,
          defaultValue: [],
          help: "Sem seleção, o aviso aparece em todos os sistemas. É possível escolher vários.",
        },
        {
          name: "priority",
          label: "Prioridade",
          type: "select",
          defaultValue: "normal",
          options: [
            { value: "baixa", label: "Baixa" },
            { value: "normal", label: "Normal" },
            { value: "alta", label: "Alta" },
          ],
        },
        { name: "is_urgent", label: "Marcar como urgente", type: "switch", defaultValue: false },
        { name: "is_pinned", label: "Fixar no topo", type: "switch", defaultValue: false },
        {
          name: "show_on_login",
          label: "Mostrar na tela de login",
          type: "switch",
          defaultValue: false,
        },
        {
          name: "require_read_receipt",
          label: "Exigir confirmação de leitura",
          type: "switch",
          defaultValue: false,
        },
        {
          name: "publish_at",
          label: "Publicar em",
          type: "date",
          defaultValue: inputDateToday(),
          required: true,
        },
        { name: "expires_at", label: "Expira em", type: "date" },
        {
          name: "image_url",
          label: "Imagem",
          placeholder: "Cole o link da imagem",
          help: "Aceita um link direto para a imagem.",
          full: true,
        },
        {
          name: "video_url",
          label: "Vídeo",
          placeholder: "Cole o link do YouTube, Vimeo ou vídeo direto",
          help: "O vídeo será exibido dentro do aviso quando o link permitir incorporação.",
          full: true,
        },
        { name: "content", label: "Conteúdo", type: "textarea", required: true },
      ]}
    />
  );
}
