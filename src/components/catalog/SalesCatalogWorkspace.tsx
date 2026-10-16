import { MemberCatalogCreator } from "./MemberCatalogCreator";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useCurrentUser } from "@/hooks/useAuth";
import { useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CatalogSection } from "@/components/catalog/CatalogSection";
import { useSalesCatalog } from "@/hooks/useSalesCatalog";

export function SalesCatalogWorkspace() {
  const { roles, isAdmin, viewAs } = useCurrentUser();
  const [createLayout, setCreateLayout] = useState<"cards" | "lista" | null>(null);
  const [materialVersion, setMaterialVersion] = useState(0);
  const canCreate = !viewAs && roles.length > 0;
  const [tab, setTab] = useState<"products" | "catalogs" | "tables">("products");
  const query = useSalesCatalog();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Catálogo de produtos"
        description="Consulte produtos e preços; monte seus catálogos e tabelas com os materiais liberados."
      />
      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="products">
            Produtos{query.data ? ` (${query.data.items.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="catalogs">Catálogos online</TabsTrigger>
          <TabsTrigger value="tables">Tabelas de preços</TabsTrigger>
        </TabsList>
      </Tabs>
      {canCreate && tab !== "products" && (
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
          onCreated={() => setMaterialVersion((v) => v + 1)}
          onClose={() => setCreateLayout(null)}
        />
      )}
      {query.isLoading ? (
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
