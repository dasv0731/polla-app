import { Injectable, signal } from '@angular/core';

/**
 * Estado global del modal de trivia. Usado por:
 *  · `<app-trivia-popup>` (mounted en shell) — lee isOpen + scopedMatchId
 *    para decidir qué renderizar.
 *  · `picks-list` (la fila inline match-trivia "Jugar") — llama
 *    `openForMatch(matchId)` en lugar del routerLink al /picks/trivia/:id.
 *  · El FAB del popup también usa `open()` (sin scope) — modal con
 *    cola de TODAS las preguntas live no respondidas.
 */
@Injectable({ providedIn: 'root' })
export class TriviaModalService {
  private _isOpen = signal(false);
  private _scopedMatchId = signal<string | null>(null);
  private _targetQuestionId = signal<string | null>(null);
  private _refreshTick = signal(0);

  isOpen = this._isOpen.asReadonly();
  scopedMatchId = this._scopedMatchId.asReadonly();
  /** Si se setea, el popup salta a esta pregunta tras cargar la cola.
   *  Reset a null cuando el modal cierra para que la próxima apertura
   *  arranque desde el principio de la cola. */
  targetQuestionId = this._targetQuestionId.asReadonly();
  /** Bumped cuando se pide al popup que recargue (e.g. al abrir scoped). */
  refreshTick = this._refreshTick.asReadonly();

  /** Abre modal mostrando solo las preguntas del match indicado.
   *  `questionId` opcional: si se pasa, el popup salta a esa pregunta
   *  específica (útil cuando el user clickea un chip "Preg N" — debe
   *  ver justamente esa, no siempre la primera). */
  openForMatch(matchId: string, questionId?: string) {
    this._scopedMatchId.set(matchId);
    this._targetQuestionId.set(questionId ?? null);
    this._isOpen.set(true);
    this._refreshTick.update((n) => n + 1);
  }

  /** Abre modal con la cola completa de live trivia. */
  open() {
    this._scopedMatchId.set(null);
    this._targetQuestionId.set(null);
    this._isOpen.set(true);
    this._refreshTick.update((n) => n + 1);
  }

  close() {
    this._isOpen.set(false);
    this._scopedMatchId.set(null);
    this._targetQuestionId.set(null);
  }
}
