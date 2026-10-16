import { StudyGuide } from "./StudyGuide";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { MemberCatalogCreator } from "./MemberCatalogCreator";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useCurrentUser } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CatalogSection } from "@/components/catalog/CatalogSection";
import { useSalesCatalog } from "@/hooks/useSalesCatalog";

export function SalesCatalogWorkspace() {
  const { roles, viewAs } = useCurrentUser();
  const [createLayout, setCreateLayout] = useState<"cards" | "lista" | null>(null);
  const [materialVersion, setMaterialVersion] = useState(0);
  const canCreate = !viewAs && roles.length > 0;
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"products" | "catalogs" | "tables" | "study">(
    location.hash === "guia-de-estudo" ? "study" : "products",
  );
  useEffect(() => {
    if (location.hash === "guia-de-estudo") setTab("study");
  }, [location.hash]);
  const query = useSalesCatalog();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Catálogo"
        description="Consulte produtos e preços; monte seus catálogos e tabelas com os materiais liberados."
      />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as typeof tab);
          void navigate({ hash: value === "study" ? "guia-de-estudo" : "", replace: true });
        }}
      >
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="products">
            Produtos{query.data ? ` (${query.data.items.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="catalogs">Catálogos online</TabsTrigger>
          <TabsTrigger value="tables">Listas / Tabelas de preços</TabsTrigger>
          <TabsTrigger value="study">Guia de estudo</TabsTrigger>
        </TabsList>
      </Tabs>
      {canCreate && (tab === "catalogs" || tab === "tables") && (
        <div className="flex justify-end">
          <Button
            disabled={query.isLoading || query.isError || !query.data?.items.length}
            onClick={() => setCreateLayout(tab === "tables" ? "lista" : "cards")}
          >
            <Plus className="mr-2 size-4" />
            {tab === "tables" ? "Nova tabela de vendas" : "Novo catálogo online"}
          </Button>
        </div>
      )}
      {createLayout && query.data && (
        <MemberCatalogCreator
          layout={createLayout}
          items={query.data.items}
          categories={query.data.products}
          subcategories={query.data.categories}
          onCreated={() => setMaterialVersion((v) => v + 1)}
          onClose={() => setCreateLayout(null)}
        />
      )}
      {tab === "study" ? (
        <StudyGuide />
      ) : query.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando catálogo…</p>
      ) : query.isError ? (
        <div role="alert" className="surface-card p-4 text-sm">
          Não foi possível consultar o catálogo.{" "}
          <button type="button" className="text-primary underline" onClick={() => query.refetch()}>
            Tentar novamente
          </button>
        </div>
      ) : (
        <CatalogSection
          key={materialVersion}
          macros={query.data?.products ?? []}
          subs={query.data?.categories ?? []}
          sellerMode
          displaySection={tab}
        />
      )}
    </div>
  );
}
