import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { useState } from "react";
import { OrderApprovalQueue } from "@/components/finance/OrderApprovalQueue";

vi.mock("react", async (original) => {
 const actual = await original<typeof import("react")>();
 return {...actual,useState:vi.fn((initial: unknown)=>[initial,vi.fn()])};
});
vi.mock("@tanstack/react-query",()=>({
 useQuery:({queryKey}:any)=>({data:queryKey[0]==="approval-warehouses"?[]:{orders:[],pending_count:0},isLoading:false,error:null}),
 useQueryClient:()=>({invalidateQueries:vi.fn()}),
}));
vi.mock("@/hooks/useAuth",()=>({useCurrentUser:()=>({userId:"reviewer",isAdmin:true,roles:["admin"],viewAs:null})}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:vi.fn()}}));
vi.mock("@/lib/order-review-flow",()=>({useCanReviewOrders:()=>({data:true}),useCanViewOrderApprovals:()=>({data:true}),useCanViewFinancialApprovals:()=>({data:false})}));
vi.mock("@/components/finance/ReviewDecisionHistory",()=>({ReviewDecisionHistory:()=>null}));
vi.mock("@/components/finance/PendingPaymentReceipts",()=>({usePendingReceiptCount:()=>({data:0})}));
vi.mock("@/components/orders/CommissionBreakdown",()=>({CommissionBreakdown:()=>null}));
vi.mock("@/components/admin/OrderApprovals",()=>({OrderApprovals:()=>null}));
vi.mock("@/components/finance/CancellationReviewQueue",()=>({CancellationReviewQueue:()=>null,usePendingCancellations:()=>({data:[]})}));
vi.mock("@/components/finance/FinancialClosureQueue",()=>({FinancialClosureQueue:()=>null,usePendingFinancialClosures:()=>({data:[]})}));
vi.mock("@/components/ui/dialog",()=>({Dialog:({children}:any)=><div>{children}</div>,DialogContent:({children}:any)=><div>{children}</div>,DialogHeader:({children}:any)=><div>{children}</div>,DialogTitle:({children}:any)=><h3>{children}</h3>}));
vi.mock("@/components/ui/button",()=>({Button:({children}:any)=><button>{children}</button>}));
vi.mock("@/components/ui/input",()=>({Input:()=>null}));
vi.mock("@/components/ui/label",()=>({Label:({children}:any)=><label>{children}</label>}));

describe("fechamento da revisão de pedido",()=>{
 beforeEach(()=>vi.mocked(useState).mockReset().mockImplementation((initial:any)=>[initial,vi.fn()] as any));
 it("renderiza após aprovar ou fechar mesmo com rascunho antigo no estado",()=>{
  vi.mocked(useState).mockReturnValueOnce([null,vi.fn()]).mockReturnValueOnce([{items:[],customer_name:"Rascunho antigo"},vi.fn()]);
  expect(()=>renderToString(<OrderApprovalQueue/>)).not.toThrow();
  expect(renderToString(<OrderApprovalQueue/>)).not.toContain("Rascunho antigo");
 });
 it("continua mostrando os dados quando existe um pedido selecionado",()=>{
  const order={id:"order",number:1,customer_name:"Cliente da revisão",seller_name:"Vendedor",seller_id:"seller",currency:"BRL",total:100,commission_total:5,items:[],history:[]};
  vi.mocked(useState).mockReturnValueOnce([order,vi.fn()]).mockReturnValueOnce([order,vi.fn()]);
  expect(renderToString(<OrderApprovalQueue/>)).toContain("Cliente da revisão");
 });
});
