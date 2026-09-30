/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { MediaEmbed } from "@/components/scripts/MediaEmbed";

export function LoginNoticesCard() {
  const [notices, setNotices] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    supabase
      .from("internal_notices")
      .select("id,title,content,is_urgent,is_pinned,publish_at,image_url,video_url")
      .eq("show_on_login", true)
      .eq("archived", false)
      .order("is_pinned", { ascending: false })
      .order("publish_at", { ascending: false })
      .limit(3)
      .then(({ data }) => {
        if (active) setNotices(data ?? []);
      });
    return () => {
      active = false;
    };
  }, []);

  if (notices.length === 0) return null;

  return (
    <Card className="mt-8">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="size-4 text-primary" /> Avisos e anúncios
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {notices.map((n) => (
          <div key={n.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{n.title}</p>
              {n.is_urgent && <Badge variant="destructive">Urgente</Badge>}
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
      </CardContent>
    </Card>
  );
}
