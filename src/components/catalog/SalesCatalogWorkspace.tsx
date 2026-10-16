import { useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CatalogSection } from "@/components/catalog/CatalogSection";
import { useSalesCatalog } from "@/hooks/useSalesCatalog";

export function SalesCatalogWorkspace() {
  const [tab, setTab] = useState<"products" | "catalogs" | "tables">("products");
  const query = useSalesCatalog();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Catálogo de produtos"
        description="Consulte os produtos disponíveis, os preços de venda e os materiais definidos pela direção."
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
          macros={query.data?.products ?? []}
          subs={query.data?.categories ?? []}
          sellerMode
          displaySection={tab}
        />
      )}
    </div>
  );
}
