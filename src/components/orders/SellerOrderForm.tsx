import { Pdv } from "./Pdv";
import { useProductScope } from "@/hooks/useProductScope";
import { useEstadualAccess } from "@/hooks/useEstadualAccess";

export function SellerOrderForm({ onFinished }: { onFinished?: () => void }) {
  const { productId } = useProductScope();
  const access = useEstadualAccess();
  if (access.loading) return <p>Carregando permissões…</p>;
  if (!access.canWrite) return <p>Seu acesso está somente para consulta.</p>;
  return (
    <Pdv
      productId={productId}
      sellerPortal="estadual"
      readOnly={!access.canWrite}
      {...(onFinished ? { onFinished } : {})}
    />
  );
}
