import { createFileRoute, redirect } from "@tanstack/react-router";
import { catalogAudience, catalogPublicUrl } from "@/lib/catalog-views";

// Public catalogs are owned by the central publishing backend. Keeping a second
// renderer here required a privileged server key and drifted from that version.
export const Route = createFileRoute("/catalogo/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({
    publico: catalogAudience(search["publico"]),
  }),
  beforeLoad: ({ params, search }) => {
    throw redirect({ href: catalogPublicUrl(params.slug, search.publico), reloadDocument: true });
  },
});
