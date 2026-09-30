/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { firstNameOf, type AudienceContact, type AudienceFilters, type Channel } from "@/lib/campaigns";

type Options = {
  filters: AudienceFilters;
  channels: Channel[];
  productNames: Record<string, string>;
  sellerNames: Record<string, string>;
};

const PAGE = 500;
const MAX_PAGES = 20;

/**
 * Monta o público da campanha. Todo o cálculo (filtros, consentimento,
 * lista de supressão, contato válido e escopo por categoria) acontece no
 * servidor; o navegador só recebe o resultado, em páginas.
 */
export function useAudience({ filters, channels }: Options) {
  return useQuery({
    queryKey: ["campaign-audience", filters, channels],
    queryFn: async () => {
      const eligible: AudienceContact[] = [];
      const blocked: AudienceContact[] = [];

      for (let page = 0; page < MAX_PAGES; page += 1) {
        const { data, error } = await supabase.rpc("campaigns_audience" as any, {
          p_filters: filters as any,
          p_channels: channels,
          p_limit: PAGE,
          p_offset: page * PAGE,
        });
        if (error) throw error;
        const rows = (data ?? []) as any[];
        for (const r of rows) {
          const contact: AudienceContact = {
            customerId: r.customer_id,
            name: r.name ?? "",
            firstName: firstNameOf(r.name ?? ""),
            phone: r.phone ?? null,
            email: r.email ?? null,
            city: r.city ?? null,
            productName: r.product_name ?? null,
            sellerName: r.seller_name ?? null,
            birthDate: null,
            blockedReason: r.blocked_reason ?? null,
            channels: (r.channels ?? []) as Channel[],
          };
          if (contact.blockedReason || !contact.channels.length) blocked.push(contact);
          else eligible.push(contact);
        }
        if (rows.length < PAGE) break;
      }

      return { eligible, blocked, total: eligible.length + blocked.length };
    },
    enabled: channels.length > 0,
  });
}
