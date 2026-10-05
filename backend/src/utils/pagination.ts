export interface PageQuery {
  page: number;
  limit: number;
}

export interface PageMeta extends PageQuery {
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export const toOffset = ({ page, limit }: PageQuery) => ({ limit, offset: (page - 1) * limit });

export const buildMeta = ({ page, limit }: PageQuery, total: number): PageMeta => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

/** Escapa los comodines de LIKE para que buscar "50%" sea literal */
export const likePattern = (term: string): string => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
