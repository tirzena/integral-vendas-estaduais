import { Languages } from "lucide-react";
import { LANGS, getLang, setLang, useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Botão de troca de idioma do sistema (PT / ES / EN). */
export function LanguageSwitcher({ className }: { className?: string }) {
  const lang = useLang();
  const current = LANGS.find((l) => l.value === lang) ?? LANGS[0]!;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={className} aria-label="Idioma" data-no-i18n>
          <Languages className="size-4" />
          <span className="hidden sm:inline">{current.flag} {current.value.toUpperCase()}</span>
          <span className="sm:hidden">{current.flag}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-no-i18n>
        <DropdownMenuLabel>Idioma · Idioma · Language</DropdownMenuLabel>
        {LANGS.map((l) => (
          <DropdownMenuItem
            key={l.value}
            onClick={() => setLang(l.value)}
            className={l.value === getLang() ? "font-semibold" : undefined}
          >
            <span className="mr-2">{l.flag}</span>
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
