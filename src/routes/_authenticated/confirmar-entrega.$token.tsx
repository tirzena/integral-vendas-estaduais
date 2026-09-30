/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleCheck, Loader2, PackageCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/confirmar-entrega/$token")({
  component: ConfirmarEntrega,
});

function ConfirmarEntrega() {
  const { token } = Route.useParams();
  const started = useRef(false);
  const detail = useQuery({
    queryKey: ["delivery-qr-detail", token],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("delivery_qr_detail", { p_token: token });
      if (error) throw error;
      return data;
    },
  });
  const confirm = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("delivery_confirm_by_qr", {
        p_token: token,
      });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!detail.data || started.current) return;
    started.current = true;
    confirm.mutate();
  }, [confirm, detail.data]);

  if (detail.isLoading || confirm.isPending)
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 size-10 animate-spin text-primary" />
          <p className="font-medium">Confirmando a entrega…</p>
          <p className="text-sm text-muted-foreground">A baixa será registrada neste instante.</p>
        </div>
      </div>
    );

  const error = detail.error ?? confirm.error;
  if (error)
    return (
      <Card className="mx-auto mt-12 max-w-lg">
        <CardContent className="space-y-4 pt-6 text-center">
          <p className="font-semibold text-destructive">Não foi possível confirmar esta entrega.</p>
          <p className="text-sm text-muted-foreground">{(error as any)?.message}</p>
          <Button asChild>
            <Link to="/entregas">Voltar às entregas</Link>
          </Button>
        </CardContent>
      </Card>
    );

  return (
    <Card className="mx-auto mt-12 max-w-lg border-emerald-200">
      <CardContent className="space-y-5 pt-7 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <CircleCheck className="size-9" />
        </span>
        <div>
          <h1 className="text-2xl font-bold">Entrega concluída</h1>
          <p className="mt-1 text-muted-foreground">
            Pedido #{String(detail.data?.number ?? "").padStart(2, "0")} registrado como entregue.
          </p>
        </div>
        <div className="rounded-xl border bg-muted/20 p-4 text-left text-sm">
          <p>
            <strong>Recebedor:</strong> {detail.data?.recipient || "Não informado"}
          </p>
          <p>
            <strong>Destino:</strong>{" "}
            {[detail.data?.address, detail.data?.city, detail.data?.state]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Button asChild className="w-full">
          <Link to="/entregas">
            <PackageCheck className="mr-2 size-4" /> Voltar às entregas
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
