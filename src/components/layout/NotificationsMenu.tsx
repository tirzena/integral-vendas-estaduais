import { toast } from "sonner";
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function NotificationsMenu() {
  const { userId, viewAs } = useCurrentUser();
  const announced = useRef(new Set<string>());
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications", userId],
    enabled: !!userId && !viewAs,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!userId || viewAs) return;
    const channel = supabase
      .channel("notif-" + userId)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => queryClient.invalidateQueries({ queryKey: ["notifications", userId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, viewAs, queryClient]);

  const items = data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  useEffect(() => {
    if (!userId || viewAs) return;
    const changes = (data ?? []).filter((n) =>
      n.notification_type === "product_price_changed" && !n.read_at &&
      !announced.current.has(`${userId}:${n.id}`));
    if (!changes.length) return;
    changes.forEach((n) => announced.current.add(`${userId}:${n.id}`));
    toast.info(changes.length === 1 ? "Preço de produto atualizado" : `${changes.length} alterações de preços`, {
      description: changes.slice(0, 3).map((n) => n.body).join("\n"),
      duration: 15_000,
    });
    queryClient.invalidateQueries({ predicate: (query) =>
      ["inventory_items", "seller-portal", "seller-portal-data", "pdv-data", "estadual-seller-pdv", "order-editor"].includes(String(query.queryKey[0])) });
  }, [data, userId, viewAs, queryClient]);

  async function markAllRead() {
    if (!userId || viewAs) return;
    const { error } = await (supabase as any).rpc("acknowledge_my_notifications");
    if (error) return void toast.error("Não foi possível marcar as notificações como lidas.");
    queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="size-5" />
          {unread > 0 && (
            <Badge className="absolute -top-0.5 -right-0.5 size-4 justify-center rounded-full p-0 text-[10px]">
              {unread}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notificações
          {unread > 0 && (
            <button className="text-xs text-primary hover:underline" onClick={markAllRead}>
              Marcar todas como lidas
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Você não tem notificações no momento.
            </p>
          )}
          {items.map((n) => (
            <Link
              key={n.id}
              to={n.link || "/painel"}
              className="block px-3 py-2 hover:bg-muted"
            >
              <p className="text-sm font-medium">{n.title}</p>
              {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
              <p className="text-[11px] text-muted-foreground">{formatDateTime(n.created_at)}</p>
            </Link>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
