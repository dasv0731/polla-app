import { Component, Input, OnChanges, SimpleChanges, signal } from '@angular/core';
import { getUrl } from 'aws-amplify/storage';

/**
 * Avatar reusable de un user.
 *
 * Inputs:
 *   - sub:       Cognito sub (key del cache de URLs)
 *   - handle:    para el fallback de iniciales y aria-label
 *   - avatarKey: storage key (e.g. `users/{sub}/avatar-{ts}.jpg`). Si está,
 *                resuelve la signed URL y muestra <img>. Si no, fallback
 *                a círculo con la inicial del handle.
 *   - size:      'sm' (24px) | 'md' (40px, default) | 'lg' (96px)
 *
 * Cache estática de URLs por avatarKey: signed URL dura ~1h, evitamos
 * resolver la misma key cada render. Si el user cambia el avatar, la nueva
 * key invalida la cache para esa entry.
 */
const URL_CACHE = new Map<string, { url: string; expiresAt: number }>();
const URL_TTL_MS = 55 * 60_000;   // 55 min, cert dura 1h, refresh 5 min antes

async function resolveAvatarUrl(key: string): Promise<string> {
  const cached = URL_CACHE.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.url;
  const out = await getUrl({ path: key, options: { expiresIn: 3600 } });
  const url = out.url.toString();
  URL_CACHE.set(key, { url, expiresAt: Date.now() + URL_TTL_MS });
  return url;
}

@Component({
  standalone: true,
  selector: 'app-user-avatar',
  template: `
    <span class="avatar"
          [class.avatar--sm]="size === 'sm'"
          [class.avatar--md]="size === 'md' || !size"
          [class.avatar--lg]="size === 'lg'"
          [attr.aria-label]="ariaLabel">
      @if (resolvedUrl()) {
        <img [src]="resolvedUrl()!" alt="" class="avatar__img" loading="lazy">
      } @else {
        <span class="avatar__initial">{{ initial }}</span>
      }
    </span>
  `,
  styles: [`
    .avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: var(--wf-fill, #e5e7eb);
      color: var(--wf-ink, #111);
      font-family: var(--wf-display, system-ui);
      font-weight: 700;
      overflow: hidden;
      vertical-align: middle;
      flex-shrink: 0;
    }
    .avatar--sm { width: 24px; height: 24px; font-size: 11px; }
    .avatar--md { width: 40px; height: 40px; font-size: 16px; }
    .avatar--lg { width: 96px; height: 96px; font-size: 36px; }
    .avatar__img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .avatar__initial { line-height: 1; user-select: none; }
  `],
})
export class UserAvatarComponent implements OnChanges {
  @Input() sub = '';
  @Input() handle = '';
  @Input() avatarKey: string | null | undefined = null;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';

  resolvedUrl = signal<string | null>(null);

  get initial(): string {
    return (this.handle?.[0] ?? '?').toUpperCase();
  }

  get ariaLabel(): string {
    return this.handle ? `Avatar de ${this.handle}` : 'Avatar';
  }

  async ngOnChanges(c: SimpleChanges) {
    // Reset URL si cambió la key (incluyendo de set a null).
    if (c['avatarKey']) {
      this.resolvedUrl.set(null);
      const key = this.avatarKey;
      if (!key) return;
      try {
        const url = await resolveAvatarUrl(key);
        // Race guard: si el input cambió mientras resolvíamos, descartar.
        if (this.avatarKey === key) this.resolvedUrl.set(url);
      } catch {
        // signed URL falló — fallback al círculo de inicial (resolvedUrl null).
      }
    }
  }
}
