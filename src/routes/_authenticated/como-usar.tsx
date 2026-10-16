import { createFileRoute } from "@tanstack/react-router";
import { SystemUsageGuide } from "@/components/help/SystemUsageGuide";
export const Route = createFileRoute("/_authenticated/como-usar")({head: () => ({meta:[{title:"Como usar o sistema — Sistema Integral"}]}),component: () => <SystemUsageGuide system="state" />});
