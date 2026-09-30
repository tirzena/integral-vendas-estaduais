import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { useEstadualAccess } from "@/hooks/useEstadualAccess";

export type Product = {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
  main_currency: "BRL" | "USD" | "PYG";
  category: string | null;
  image_url: string | null;
  is_demo: boolean;
};

type Ctx = {
  products: Product[];
  loading: boolean;
  productId: string | "todos";
  setProductId: (id: string | "todos") => void;
  current: Product | null;
  canSeeAll: boolean;
};

const ProductScopeContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "gestao360:product";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ProductScopeProvider({ children }: { children: ReactNode }) {
  const { userId, isAdmin: isAdminRole, roles, loading: userLoading } = useCurrentUser();
  const estadualAccess = useEstadualAccess();
  // Gestores e time de estoque também administram todas as categorias.
  const isAdmin = isAdminRole || roles.includes("gestor") || roles.includes("estoque");
  const [productId, setProductIdState] = useState<string | "todos">("todos");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "todos" || (stored && UUID_PATTERN.test(stored))) setProductIdState(stored);
    else if (stored) window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const setProductId = (id: string | "todos") => {
    setProductIdState(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["scope-products", userId, isAdmin, estadualAccess.grants],
    enabled: !!userId && !userLoading,
    queryFn: async () => {
      const { data: products, error } = await supabase
        .from("products")
        .select("id,name,color,is_active,main_currency,category,image_url,is_demo")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      if (isAdmin) return (products ?? []) as Product[];
      const { data: links } = await supabase
        .from("product_users")
        .select("product_id")
        .eq("user_id", userId!);
      const allowed = new Set((links ?? []).map((l) => l.product_id));
      const grantProductIds = new Set(
        estadualAccess.grants.map((grant) => grant.product_id).filter(Boolean) as string[],
      );
      const grantAllowsAllProducts = estadualAccess.grants.some((grant) => !grant.product_id);
      return ((products ?? []) as Product[]).filter(
        (p) => allowed.has(p.id) && (grantAllowsAllProducts || grantProductIds.has(p.id)),
      );
    },
  });

  const products = useMemo(() => data ?? [], [data]);
  const current = products.find((p) => p.id === productId) ?? null;

  useEffect(() => {
    if (isLoading || productId === "todos") return;
    if (products.some((product) => product.id === productId)) return;
    setProductIdState("todos");
    window.localStorage.setItem(STORAGE_KEY, "todos");
  }, [isLoading, productId, products]);

  return (
    <ProductScopeContext.Provider
      value={{
        products,
        loading: isLoading,
        productId,
        setProductId,
        current,
        canSeeAll: isAdmin,
      }}
    >
      {children}
    </ProductScopeContext.Provider>
  );
}

export function useProductScope() {
  const ctx = useContext(ProductScopeContext);
  if (!ctx) throw new Error("useProductScope precisa estar dentro de ProductScopeProvider");
  return ctx;
}

/** Lista de ids de produtos visíveis, útil para filtrar consultas. */
export function useVisibleProductIds() {
  const { products, productId } = useProductScope();
  if (productId !== "todos") return [productId];
  return products.map((p) => p.id);
}
