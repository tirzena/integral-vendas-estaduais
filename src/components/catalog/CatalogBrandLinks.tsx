import { ExternalLink } from "lucide-react";

/** Shared brand access for the internal catalog and its public storefront. */
export function CatalogBrandLinks() {
  return (
    <nav className="integral-catalog-brands" aria-label="Sites das marcas">
      <a href="https://www.tirzena.com" target="_blank" rel="noopener noreferrer"
        className="integral-catalog-brand integral-catalog-brand--green">
        <span><strong>Tirzena</strong><small>www.tirzena.com</small></span>
        <span className="integral-catalog-brand-action">Acessar site <ExternalLink size={16} aria-hidden="true" /></span>
        <span className="sr-only"> (abre em nova aba)</span>
      </a>
      <a href="https://www.retrazin.com" target="_blank" rel="noopener noreferrer"
        className="integral-catalog-brand integral-catalog-brand--pink">
        <span><strong>Retrazin</strong><small>www.retrazin.com</small></span>
        <span className="integral-catalog-brand-action">Acessar site <ExternalLink size={16} aria-hidden="true" /></span>
        <span className="sr-only"> (abre em nova aba)</span>
      </a>
    </nav>
  );
}
