import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  BadgeDollarSign,
  Bell,
  ChevronDown,
  ClipboardList,
  Coins,
  ContactRound,
  FileText,
  Handshake,
  KanbanSquare,
  KeyRound,
  LayoutDashboard,
  Layers,
  LogOut,
  Moon,
  Megaphone,
  TrendingUp,
  MessageCircle,
  BookOpen,
  MessagesSquare,
  Package,
  Search,
  Siren,
  Send,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Sun,
  Trophy,
  Truck,
  Users,
  UsersRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, ROLE_LABELS } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useViewAs, setViewAs } from "@/hooks/useImpersonation";
import { useProductScope } from "@/hooks/useProductScope";
import { useRates } from "@/hooks/useRates";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { NotificationsMenu } from "@/components/layout/NotificationsMenu";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

export const NAV_GROUPS = [
  {
    label: "Vendas Estaduais",
    items: [
      { to: "/painel", label: "Visão geral", icon: LayoutDashboard },
      { to: "/crm", label: "Leads e CRM", icon: KanbanSquare },
      { to: "/clientes", label: "Clientes", icon: Users },
    ],
  },
  {
    label: "Comercial",
    items: [
      { to: "/produtos", label: "Catálogo e preços", icon: Package },
      { to: "/pedidos", label: "Pedidos", icon: FileText },
      { to: "/promocoes", label: "Promoções", icon: Sparkles },
      { to: "/entregas", label: "Entregas", icon: Truck },
    ],
  },
  {
    label: "Resultados",
    items: [
      { to: "/financeiro", label: "Pagamentos e comissões", icon: BadgeDollarSign },
      { to: "/ranking", label: "Metas e ranking", icon: Trophy },
      { to: "/relatorios", label: "Relatórios", icon: FileText },
    ],
  },
  {
    label: "Equipe e comunicação",
    items: [
      { to: "/equipe", label: "Vendedores", icon: UsersRound },
      { to: "/tarefas", label: "Tarefas", icon: ClipboardList },
      { to: "/avisos", label: "Notificações", icon: Megaphone },
      { to: "/chat", label: "Chat interno", icon: MessagesSquare },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

/* Aba exclusiva da administração. */
const ADMIN_NAV_ITEM = { to: "/admin", label: "Visão interna (admin)", icon: ShieldCheck } as const;
const DIVISION_NAV_ITEM = { to: "/sistemas-divisionais", label: "Integrações e APIs", icon: Settings } as const;
const SUPPLIER_NAV_ITEM = {
  to: "/fornecedor",
  label: "Meu fornecimento",
  icon: Handshake,
} as const;

function NavList({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin: realAdmin, roles } = useCurrentUser();
  const { canOpen, viewAs } = usePermissions();
  const isAdmin = viewAs ? false : realAdmin;
  const sellerOnly = roles.includes("vendedor") && !isAdmin && roles.every((role) => role === "vendedor");
  const sellerHidden = new Set([
    "/trafego-pago",
    "/compras",
    "/fornecedores",
    "/investimentos",
    "/equipe",
    "/acessos",
    "/autenticidade",
    "/integracoes",
    "/configuracoes",
  ]);
  const groups = [
    ...NAV_GROUPS.map((g) => ({
      label: g.label,
      items: [
        ...g.items.filter((i) => canOpen(i.to) && (!sellerOnly || !sellerHidden.has(i.to))),

      ],
    })),

  ].filter((g) => g.items.length > 0);

  return (
    <nav className="flex flex-col gap-3 px-2 pb-6">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          {!collapsed && (
            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
              {group.label}
            </p>
          )}
          {collapsed && <div className="mx-2 my-1 h-px bg-sidebar-foreground/10" />}
          {group.items.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                title={item.label}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  collapsed && "justify-center px-2",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const navigate = useNavigate();
  const { profile, email, roles, loading } = useCurrentUser();
  const { products, productId, setProductId, canSeeAll } = useProductScope();
  const rates = useRates();

  useEffect(() => {
    const saved = window.localStorage.getItem("os-integral-theme");
    if (saved === "light") setTheme("light");
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("os-integral-theme", theme);
  }, [theme]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="integral-shell flex min-h-screen bg-background">
      <aside
        className={cn(
          "integral-sidebar sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto bg-sidebar transition-[width] lg:flex",
          collapsed ? "w-[68px]" : "w-[250px]",
        )}
      >
        <div className="integral-brand flex items-center gap-3 px-4 py-5">
          {!collapsed && (
            <div className="min-w-0">
              <p className="integral-brand-word">sistemaintegral</p>
              <span className="integral-brand-rule" />
              <p className="integral-brand-subtitle">Vendas Estaduais</p>
            </div>
          )}
          {collapsed && <span className="text-lg font-black text-primary">SI</span>}
        </div>
        <NavList collapsed={collapsed} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <ViewAsBanner />
        <header className="integral-topbar sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b bg-card/90 px-3 py-2.5 backdrop-blur md:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
                <KanbanSquare className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 overflow-y-auto bg-sidebar p-0">
              <SheetTitle className="px-4 pt-5">
                <span className="integral-brand-word text-sidebar-foreground">
                  sistemaintegral
                </span>
              </SheetTitle>
              <div className="pt-4">
                <NavList onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            aria-label="Recolher menu"
            onClick={() => setCollapsed((v) => !v)}
          >
            <KanbanSquare className="size-5" />
          </Button>

          <div className="integral-role hidden items-center gap-2 rounded-lg border px-3 py-1.5 text-xs lg:flex">
            <ShieldCheck className="size-4 text-primary" />
            <span><strong className="block truncate font-semibold">{roles.map((role) => ROLE_LABELS[role]).join(" · ") || "Equipe"}</strong><small className="text-muted-foreground">Acesso protegido</small></span>
          </div>

          <Button
            variant="outline"
            className="integral-search text-muted-foreground min-w-0 flex-1 justify-start gap-2 md:max-w-xs"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="size-4" />
            <span className="truncate">Buscar em tudo…</span>
          </Button>

          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Produto" />
            </SelectTrigger>
            <SelectContent>
              {canSeeAll && <SelectItem value="todos">Todas as categorias</SelectItem>}
              {!canSeeAll && <SelectItem value="todos">Meus produtos</SelectItem>}
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="integral-rate-strip" aria-label="Cotações atuais">
            <span><b>BRL</b> R$ {rates.factors["USD-BRL"]?.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "—"}</span>
            <span><b>USD</b> $ 1,00</span>
            <span><b>PYG</b> Gs. {rates.factors["USD-PYG"]?.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) ?? "—"}</span>
          </div>

          <Button variant="ghost" size="icon" asChild aria-label="Chat interno">
            <Link to="/chat">
              <MessagesSquare className="size-5" />
            </Link>
          </Button>

          <LanguageSwitcher />

          <NotificationsMenu />

          <Button variant="ghost" size="icon" aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-1.5">
                <Avatar className="size-8">
                  <AvatarImage src={profile?.avatar_url ?? undefined} />
                  <AvatarFallback>{initials(profile?.full_name ?? email)}</AvatarFallback>
                </Avatar>
                <span className="integral-profile-name hidden max-w-28 truncate text-xs font-semibold xl:inline">{profile?.full_name || email}</span>
                <ChevronDown className="hidden size-4 xl:inline" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>
                <p className="truncate">{profile?.full_name || email}</p>
                <p className="truncate text-xs font-normal text-muted-foreground">{email}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {roles.map((r) => (
                    <Badge key={r} variant="secondary" className="text-[10px]">
                      {ROLE_LABELS[r]}
                    </Badge>
                  ))}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/configuracoes">
                  <Settings className="mr-2 size-4" /> Meu perfil e configurações
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/avisos">
                  <Bell className="mr-2 size-4" /> Avisos internos
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut}>
                <LogOut className="mr-2 size-4" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="integral-main min-w-0 flex-1 px-3 py-5 md:px-6 md:py-7">
          {loading ? <div className="text-sm text-muted-foreground">Carregando…</div> : children}
        </main>
      </div>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

/** Faixa que aparece quando o administrador está vendo a tela de outra pessoa. */
function ViewAsBanner() {
  const viewAs = useViewAs();
  if (!viewAs) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-primary px-3 py-2 text-primary-foreground md:px-6">
      <p className="text-sm">
        Você está vendo o sistema como <strong>{viewAs.name}</strong>.
      </p>
      <Button size="sm" variant="secondary" onClick={() => setViewAs(null)}>
        Voltar para a minha visão
      </Button>
    </div>
  );
}
