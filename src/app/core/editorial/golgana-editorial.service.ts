import { Injectable } from '@angular/core';

/**
 * Contenido editorial (noticias) consumido desde **golgana** — la fuente
 * canónica del contenido editorial. Golgana expone su AppSync con la query
 * pública `noticias { slug data }` (auth `@aws_api_key`), donde `data` es el
 * JSON del artículo (titulo, fechaPublicacion, imagenHero, seccion, …).
 *
 * La app de polla NO guarda noticias propias: este servicio le pega directo
 * al AppSync de golgana (igual que el script de sync server-side, pero en
 * tiempo real para el rail). Es lectura pública (apiKey de solo-lectura).
 *
 * TODO: el endpoint/clave de golgana están hardcodeados. Cuando golgana
 * redeploya, el AppSync apiKey rota — mover a config/env (o a un proxy en
 * polla-backend) para no tener que recompilar. Hoy es lectura pública.
 */
const GOLGANA_GRAPHQL_URL = 'https://53cwjhnjvvac3blko46qdp4lrm.appsync-api.us-east-1.amazonaws.com/graphql';
const GOLGANA_API_KEY = 'da2-orelnxhncfdqdkyejcf666ym6a';
/** Sitio editorial de golgana (para resolver imágenes relativas y los links). */
const GOLGANA_SITE = 'https://golgana.net';

export interface GolganaNoticia {
  slug: string;
  title: string;
  /** URL pública del artículo en el sitio editorial de golgana. */
  url: string;
  imageUrl: string | null;
  publishedAt: string;
}

interface ArticuloData {
  titulo?: string;
  fechaPublicacion?: string;
  imagenHero?: { src?: string } | null;
}

@Injectable({ providedIn: 'root' })
export class GolganaEditorialService {
  /** Últimas noticias publicadas en golgana, más recientes primero. */
  async listNoticias(limit = 4): Promise<GolganaNoticia[]> {
    const res = await fetch(GOLGANA_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': GOLGANA_API_KEY },
      body: JSON.stringify({ query: '{ noticias { slug data } }' }),
    });
    if (!res.ok) throw new Error(`golgana editorial HTTP ${res.status}`);
    const json = (await res.json()) as { data?: { noticias?: Array<{ slug: string; data: string }> } };
    const raw = json?.data?.noticias ?? [];

    const items: GolganaNoticia[] = [];
    for (const n of raw) {
      let d: ArticuloData;
      try { d = JSON.parse(n.data) as ArticuloData; } catch { continue; }
      if (!d?.titulo) continue;
      const src = d.imagenHero?.src ?? null;
      const imageUrl = src ? (src.startsWith('http') ? src : GOLGANA_SITE + src) : null;
      items.push({
        slug: n.slug,
        title: d.titulo,
        url: `${GOLGANA_SITE}/noticias/${n.slug}`,
        imageUrl,
        publishedAt: d.fechaPublicacion ?? '',
      });
    }
    items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    return items.slice(0, limit);
  }
}
