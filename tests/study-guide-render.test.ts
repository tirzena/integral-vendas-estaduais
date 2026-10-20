import { expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@tanstack/react-router", () => ({createFileRoute: () => (config: unknown) => config}));
vi.mock("@/lib/storage", () => ({useProductCatalogConfigs: () => ({data: {},refetch: () => Promise.resolve()}),useProductImages: () => ({data: {"registered.jpg": "https://example.com/signed-image.jpg"}})}));
vi.mock("@/integrations/supabase/client", () => ({supabase: {}}));
vi.mock("@/hooks/useAuth", () => ({useCurrentUser: () => ({userId: "viewer"})}));
vi.mock("@/hooks/useProductScope", () => ({useProductScope: () => ({products: [{id: "category",name: "Categoria"}], productId: "todos"})}));
vi.mock("@tanstack/react-query", () => ({useQuery: () => ({data: [{id: "product",name: "Produto de estudo",product_id: "category",brand: "Marca",public_description: "Descrição pública",
          image_url: "registered.jpg",intended_use: "Finalidade documentada",information_source_url: "https://www.fda.gov/",description: "PRIVATE_NOTES",cost: "PRIVATE_COST"}], isLoading: false,isError: false})}));

import { StudyGuide } from "../src/components/catalog/StudyGuide";

it("renders the library with public product information and study controls", () => {
  const html = renderToStaticMarkup(createElement(StudyGuide));
  for (const text of ["Guia de estudo", "Produto de estudo", "Descrição pública", "Conhecer o produto", "Glossário", "Referências", "Progresso de estudo"]) expect(html).toContain(text);
  expect(html).toContain("https://example.com/signed-image.jpg");
  expect(html).not.toContain('src="registered.jpg"');
  for (const text of ["PRIVATE_NOTES", "PRIVATE_COST", "Pharmalabz"]) expect(html).not.toContain(text);
});
