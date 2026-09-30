import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ShieldCheck, ShieldAlert, Clock, Loader2 } from "lucide-react";
import { getPublicAuthenticityBatch, validateAuthenticityCode } from "@/lib/authenticity.functions";
import { type AuthenticityResult } from "@/lib/authenticity";
export const Route = createFileRoute("/verificar/$batchId")({ component: LotPresentation });
function ValidationPage({ batchId }: { batchId: string }) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<AuthenticityResult | null>(null);
  const batch = useQuery({
    queryKey: ["public-authenticity", batchId],
    queryFn: () => getPublicAuthenticityBatch({ data: { batchId } }),
    retry: false,
  });
  const verify = useMutation({
    mutationFn: () => validateAuthenticityCode({ data: { batchId, code } }),
    onSuccess: setResult,
  });
  const date = (v: string) =>
    new Date(v + "T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const message =
    result?.status === "registered"
      ? "Código original cadastrado. Primeira validação confirmada."
      : result?.status === "already_used"
        ? "Atenção: este código já foi validado."
        : result?.status === "not_found"
          ? "Código não encontrado. A autenticidade desta embalagem não foi confirmada."
          : result?.status === "limited"
            ? "Muitas tentativas. Aguarde um minuto para tentar novamente."
            : "Lote indisponível para validação.";
  return (
    <div
      className="bg-black px-5 py-10 text-white"
      style={{
        backgroundImage:
          "radial-gradient(ellipse at 90% 35%,#064e3b66,transparent 55%),radial-gradient(ellipse at 0 85%,#83184355,transparent 55%)",
      }}
    >
      <div className="mx-auto max-w-xl">
        <header className="mb-10">
          <span className="text-5xl font-black tracking-tight">
            Tirzena<span className="text-pink-500">.</span>
          </span>
          <div className="mt-4 h-1 bg-gradient-to-r from-emerald-400 to-pink-600" />
          <p className="mt-4 text-sm tracking-widest text-emerald-300">VERIFICAÇÃO DA EMBALAGEM</p>
        </header>
        {batch.isPending ? (
          <p>Carregando lote…</p>
        ) : batch.isError ? (
          <p role="alert">Consulta indisponível. Tente novamente.</p>
        ) : !batch.data ? (
          <p>Lote não encontrado.</p>
        ) : (
          <section className="rounded-3xl border border-white/30 bg-white/5 p-6 backdrop-blur">
            <ShieldCheck className="mb-4 size-10 text-emerald-400" />
            <h1 className="text-2xl font-bold">{batch.data.product_name}</h1>
            <dl className="my-6 grid grid-cols-2 gap-4 text-sm">
              <div className="col-span-2">
                <dt className="text-white/60">Lote</dt>
                <dd className="text-xl font-bold">{batch.data.lot_number}</dd>
              </div>
              <div>
                <dt className="text-white/60">Fabricação</dt>
                <dd>{date(batch.data.manufacture_date)}</dd>
              </div>
              <div>
                <dt className="text-white/60">Validade</dt>
                <dd>{date(batch.data.expiry_date)}</dd>
              </div>
            </dl>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setResult(null);
                verify.mutate();
              }}
            >
              <label htmlFor="box-code" className="font-semibold">
                Código exclusivo da sua caixinha
              </label>
              <input
                id="box-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setResult(null);
                }}
                autoComplete="off"
                maxLength={64}
                required
                placeholder="Digite o código impresso na embalagem"
                className="mt-3 w-full rounded-xl border border-white/40 bg-black/40 p-4 text-white"
              />
              <button
                disabled={verify.isPending || !code.trim() || !batch.data.active}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 p-4 font-bold text-black disabled:opacity-50"
              >
                {verify.isPending && <Loader2 className="size-4 animate-spin" />}Validar código
              </button>
            </form>
            {verify.isError && (
              <p role="alert" className="mt-4 text-rose-300">
                {verify.error.message}
              </p>
            )}
            {result && (
              <div
                role="status"
                className={`mt-6 rounded-xl border p-4 ${result.status === "registered" ? "border-emerald-400 text-emerald-300" : result.status === "already_used" ? "border-amber-400 text-amber-200" : "border-rose-400 text-rose-300"}`}
              >
                {result.status === "registered" ? (
                  <ShieldCheck />
                ) : result.status === "already_used" ? (
                  <Clock />
                ) : (
                  <ShieldAlert />
                )}
                <p className="mt-2 font-semibold">{message}</p>
                {result.firstValidatedAt && (
                  <p className="mt-2 text-sm">
                    Primeira validação:{" "}
                    {new Date(result.firstValidatedAt).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}{" "}
                    (horário de Brasília).
                  </p>
                )}
              </div>
            )}
            <p className="mt-6 text-xs leading-relaxed text-white/60">
              Este serviço verifica o registro do código da embalagem. Um código cadastrado não
              garante o conteúdo físico, a conservação ou a segurança do produto. Um código já
              utilizado pode indicar reutilização ou cópia da embalagem.
            </p>
          </section>
        )}
        <footer className="mt-10 h-1 bg-gradient-to-r from-emerald-400 to-pink-600" />
      </div>
    </div>
  );
}

// Imagens extraídas do PDF original fornecido pelo usuário; sem dependência do Drive.
const PRESENTATION_IMAGES: Record<number, string> = {
  2: "/presentation/tirzena/page-1.webp",
  3: "/presentation/tirzena/page-2.webp",
  4: "/presentation/tirzena/page-3.webp",
  5: "/presentation/tirzena/page-4.webp",
  6: "/presentation/tirzena/page-6.webp",
  7: "/presentation/tirzena/page-7.webp",
  8: "/presentation/tirzena/page-8.webp",
};
const PRESENTATION_PAGES = [
  { title: "Apresentação", source: 2 },
  { title: "Índice", source: 3 },
  { title: "Preparação e aplicação", source: 4 },
  { title: "Verificação da embalagem", source: 1 },
  { title: "Dosagem e fornecimento", source: 5 },
  { title: "Documento do lote", source: 6 },
  { title: "Conservação", source: 7 },
  { title: "Informações e depoimentos", source: 8 },
] as const;
const INFORMATION_GROUP = "https://chat.whatsapp.com/HK2sFvvyMCZ60YXoeOEf2D";
const TESTIMONIAL_GROUP = "https://chat.whatsapp.com/JygWCmb9Qy3C4ps5YnscmX";

function LotPresentation() {
  const { batchId } = Route.useParams();
  return (
    <main className="min-h-screen bg-[#151518] text-white">
      <nav
        aria-label="Páginas da apresentação do lote"
        className="sticky top-0 z-10 border-b border-white/15 bg-black/90 px-3 py-3 backdrop-blur"
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <a href="#pagina-1" className="font-black tracking-tight">
            Tirzena<span className="text-pink-500">.</span>
          </a>
          <div className="flex flex-wrap justify-end gap-1">
            {PRESENTATION_PAGES.map((page, index) => (
              <a
                key={page.title}
                href={`#pagina-${index + 1}`}
                aria-label={`Página ${index + 1}: ${page.title}`}
                className="grid size-8 place-items-center rounded-md border border-white/20 text-sm hover:border-emerald-400 focus-visible:outline-2 focus-visible:outline-emerald-400"
              >
                {index + 1}
              </a>
            ))}
          </div>
        </div>
      </nav>
      <div className="mx-auto max-w-3xl space-y-5 py-5 sm:space-y-8 sm:py-8">
        {PRESENTATION_PAGES.map((page, index) => {
          const number = index + 1;
          const image = PRESENTATION_IMAGES[page.source];
          return (
            <section
              key={number}
              id={`pagina-${number}`}
              aria-label={`Página ${number}: ${page.title}`}
              className="scroll-mt-20 overflow-hidden border-y border-white/20 bg-black shadow-xl sm:border-x"
            >
              {number === 4 ? (
                <ValidationPage batchId={batchId} />
              ) : (
                <div className="relative">
                  {image && number !== 2 ? (
                    <img
                      src={image}
                      alt={page.title}
                      width={1072}
                      height={1517}
                      className="block h-auto w-full"
                      loading={number === 1 ? "eager" : "lazy"}
                    />
                  ) : number !== 2 ? (
                    <div className="flex aspect-[210/297] flex-col justify-center bg-gradient-to-br from-black via-emerald-950/30 to-pink-950/30 px-8 py-12">
                      <p className="text-sm uppercase tracking-widest text-emerald-300">
                        Rascunho · imagem original pendente
                      </p>
                      <h2 className="mt-5 text-3xl font-bold">{page.title}</h2>
                      <p className="mt-5 text-white/60">
                        Página {number} · imagem {page.source} na ordem solicitada.
                      </p>
                    </div>
                  ) : null}
                  {number === 2 && (
                    <nav
                      aria-label="Índice da apresentação"
                      className="min-h-[650px] bg-gradient-to-br from-black via-emerald-950/30 to-pink-950/30 px-6 py-10 sm:min-h-[900px] sm:px-12 sm:py-14"
                    >
                      <p className="text-6xl font-black">
                        T<span className="text-pink-500">.</span>
                      </p>
                      <div className="my-6 h-1 bg-gradient-to-r from-emerald-400 to-pink-600" />
                      <h2 className="mb-6 text-2xl font-bold">Sumário</h2>
                      {PRESENTATION_PAGES.slice(2, 7).map((entry, entryIndex) => (
                        <a
                          key={entry.title}
                          href={`#pagina-${entryIndex + 3}`}
                          className="flex items-center justify-between gap-4 border-b border-white/15 py-3 text-sm text-white hover:text-emerald-300 sm:py-5 sm:text-xl"
                        >
                          <span>{entry.title}</span>
                          <span>{entryIndex + 3}</span>
                        </a>
                      ))}
                      <a
                        href={INFORMATION_GROUP}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-4 border-b border-white/15 py-3 text-sm text-emerald-300 sm:py-5 sm:text-xl"
                      >
                        <span>Link de informações</span>
                        <span>8 ↗</span>
                      </a>
                      <a
                        href={TESTIMONIAL_GROUP}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-4 border-b border-white/15 py-3 text-sm text-pink-300 sm:py-5 sm:text-xl"
                      >
                        <span>Link de depoimentos</span>
                        <span>8 ↗</span>
                      </a>
                    </nav>
                  )}
                  {number === 8 && (
                    <div className="relative mx-5 -mt-[110%] mb-6 rounded-2xl bg-black p-5 text-center sm:absolute sm:inset-x-8 sm:top-[19%] sm:mx-0 sm:mb-0 sm:mt-0 sm:min-h-[18%] sm:p-8">
                      <h2 className="text-xl font-bold sm:text-3xl">Comunidade Tirzena</h2>
                      <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/80 sm:text-base">
                        Escolha o grupo de informações ou participe do grupo de depoimentos para
                        compartilhar seu antes e depois e contar sua experiência.
                      </p>
                      <div className="mt-4 rounded-xl border border-white/20 p-3 text-left">
                        <h3 className="font-bold text-emerald-300">Informações</h3>
                        <p className="mt-2 text-xs leading-relaxed text-white/80">
                          Sumário: apresentação, preparação e aplicação, validação da embalagem,
                          dosagem e fornecimento, documento de referência e conservação.
                        </p>
                      </div>
                      <a
                        href={INFORMATION_GROUP}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-5 block rounded-full border-2 border-white bg-black px-5 py-5 text-lg font-bold uppercase text-emerald-300 hover:bg-emerald-950 focus-visible:outline-2 focus-visible:outline-emerald-400"
                      >
                        Entrar no grupo de informações
                      </a>
                      <div className="mt-4 rounded-xl border border-pink-400/40 p-3 text-left">
                        <h3 className="font-bold text-pink-300">Depoimentos</h3>
                        <p className="mt-2 text-xs leading-relaxed text-white/80">
                          Compartilhe seu antes e depois, publique seu depoimento e conte sua
                          experiência com a comunidade Tirzena.
                        </p>
                      </div>
                      <a
                        href={TESTIMONIAL_GROUP}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 block rounded-full border-2 border-pink-400 bg-black px-5 py-4 text-base font-bold text-pink-300 hover:bg-pink-950 focus-visible:outline-2 focus-visible:outline-pink-400"
                      >
                        Entrar no grupo de depoimentos
                      </a>
                    </div>
                  )}
                </div>
              )}
              {number === 6 && (
                <p className="border-t border-white/15 px-5 py-3 text-xs text-white/70">
                  Documento de referência fornecido: lote L-TNZ-26045. Os dados do lote consultado
                  aparecem na página 4.
                </p>
              )}
              <footer className="flex items-center justify-between gap-2 border-t border-white/15 px-5 py-4 text-sm text-white/70">
                {number > 1 ? (
                  <a href={`#pagina-${number - 1}`} className="hover:text-emerald-300">
                    Anterior
                  </a>
                ) : (
                  <span />
                )}
                <span>{number} / 8</span>
                {number < 8 ? (
                  <a href={`#pagina-${number + 1}`} className="hover:text-emerald-300">
                    Próxima
                  </a>
                ) : (
                  <a href="#pagina-1" className="hover:text-emerald-300">
                    Início
                  </a>
                )}
              </footer>
            </section>
          );
        })}
      </div>
    </main>
  );
}
