import { expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@tanstack/react-router", () => ({createFileRoute: () => (config: unknown) => config}));
vi.mock("@/integrations/supabase/client", () => ({supabase: {}}));
vi.mock("@/hooks/useAuth", () => ({useCurrentUser: () => ({userId: "viewer"})}));
vi.mock("@/hooks/useProductScope", () => ({useProductScope: () => ({products: [{id: "category",name: "Categoria"}], productId: "todos"})}));
vi.mock("@tanstack/react-query", () => ({useQuery: () => ({data: [{id: "product",name: "Produto de estudo",product_id: "category",brand: "Marca",public_description: "Descrição pública",intended_use: "Finalidade documentada",information_source_url: "https://www.fda.gov/",description: "PRIVATE_NOTES",cost: "PRIVATE_COST"}], isLoading: false,isError: false})}));

import { StudyGuide } from "../src/routes/_authenticated/guia-de-estudo";

it("renders the library with public product information and study controls", () => {
  const html = renderToStaticMarkup(createElement(StudyGuide));
  for (const text of ["Guia de estudo", "Produto de estudo", "Descrição pública", "Conhecer o produto", "Glossário", "Referências", "Progresso de estudo"]) expect(html).toContain(text);
  for (const text of ["PRIVATE_NOTES", "PRIVATE_COST", "Pharmalabz"]) expect(html).not.toContain(text);
});
