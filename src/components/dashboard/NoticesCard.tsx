/* eslint-disable @typescript-eslint/no-explicit-any */
import { Link } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRows } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { MediaEmbed } from "@/components/scripts/MediaEmbed";

export function NoticesCard() {
  const query = useRows<any>("internal_notices", {
    orderBy: { column: "publish_at", ascending: false },
    limit: 100,
  });
  const now = Date.now();
  const notices = (query.data ?? []).filter((n) => {
    const publishesAt = n.publish_at ? new Date(n.publish_at).getTime() : 0;
    const expiresAt = n.expires_at ? new Date(n.expires_at).getTime() : null;
    const here = !n.target_systems?.length || n.target_systems.includes("direcao_geral");
    return here && !n.archived && publishesAt <= now && (expiresAt === null || expiresAt >= now);
  }).slice(0, 5);

  if (query.isLoading || query.isError || notices.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="size-4 text-primary" /> Avisos internos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {notices.map((n) => (
          <div key={n.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{n.title}</p>
              {n.is_urgent && <Badge variant="destructive">Urgente</Badge>}
              {n.is_pinned && <Badge variant="secondary">Fixado</Badge>}
            </div>
            <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{n.content}</p>
            {(n.image_url || n.video_url) && (
              <div className="mt-3 space-y-2">
                {n.image_url && <MediaEmbed url={n.image_url} label={n.title} />}
                {n.video_url && <MediaEmbed url={n.video_url} label={n.title} />}
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.publish_at)}</p>
          </div>
        ))}
        <Button variant="outline" className="w-full" asChild>
          <Link to="/avisos">Ver todos os avisos</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
