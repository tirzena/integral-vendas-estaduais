/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";

export type OrderReviewFilter =
  "pending" | "approved" | "rejected" | "changes_requested" | "payment_pending";
export function orderReviewStage(order: any): Exclude<OrderReviewFilter, "payment_pending"> {
  if (order.approval_status === "pending") return "pending";
  if (order.approval_status === "rejected")
    return order.review_outcome === "changes_requested" ? "changes_requested" : "rejected";
  if (
    order.approval_status == null &&
    order.origin === "catalogo" &&
    order.kind === "pre_pedido" &&
    order.status === "pre_pedido" &&
    order.stock_state === "nenhum"
  )
    return "pending";
  return "approved";
}
export const orderReviewLabels = {
  pending: "Em análise",
  approved: "Pedido aprovado",
  rejected: "Pedido reprovado",
  changes_requested: "Ajuste solicitado",
  payment_pending: "Aguardando financeiro",
};
export function matchesOrderReview(
  order: any,
  filter: OrderReviewFilter,
  pendingPayments: Set<string>,
) {
  return filter === "payment_pending"
    ? orderReviewStage(order) === "approved" && pendingPayments.has(order.id)
    : orderReviewStage(order) === filter;
}
export function usePendingPaymentOrders() {
  const { userId, viewAs } = useCurrentUser();
  return useQuery({
    queryKey: ["pending-payment-orders", userId, viewAs?.userId],
    enabled: !!userId && !viewAs,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("integral_pending_payment_orders");
      if (error) throw error;
      return new Set<string>(data ?? []);
    },
  });
}

export function useCanReviewOrders() {
  const { userId, viewAs } = useCurrentUser();
  return useQuery({
    queryKey: ["order-reviewer-access", userId],
    enabled: false,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("integral_order_reviewer_access");
      if (error) throw error;
      return Boolean(data);
    },
    select: () => false,
  });
}

export function useCanReviewFinancial() {
  const { userId, viewAs } = useCurrentUser();
  return useQuery({
    queryKey: ["financial-reviewer-access", userId],
    enabled: false,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("integral_financial_reviewer_access");
      if (error) throw error;
      return Boolean(data);
    },
    select: () => false,
  });
}

function useApprovalWorkspaceAccess() {
  const { userId, viewAs } = useCurrentUser();
  return useQuery({
    queryKey: ["approval-workspace-access", userId],
    enabled: false,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("integral_approval_workspace_access");
      if (error) throw error;
      return data as {
        view_orders: boolean;
        approve_orders: boolean;
        view_payments: boolean;
        approve_payments: boolean;
      };
    },
    select: () => ({
      view_orders: false,
      approve_orders: false,
      view_payments: false,
      approve_payments: false,
    }),
  });
}
export function useCanViewOrderApprovals() {
  const query = useApprovalWorkspaceAccess();
  return { ...query, data: query.data?.view_orders };
}
export function useCanViewFinancialApprovals() {
  const query = useApprovalWorkspaceAccess();
  return { ...query, data: query.data?.view_payments };
}
