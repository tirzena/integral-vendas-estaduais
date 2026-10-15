/* eslint-disable @typescript-eslint/no-explicit-any */
/** Pagina consultas autorizadas sem tratar o limite da API como o total real. */
export async function readAllRows(query: any, orderBy = "id") {
  const rows: any[] = [];
  const ordered = query.order(orderBy);
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await ordered.range(offset, offset + 499);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < 500) return { data: rows, error: null };
  }
}
