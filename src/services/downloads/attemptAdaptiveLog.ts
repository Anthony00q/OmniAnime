import type { ConcurrencyObservationKind } from '../persistence/ServerStatsStore';
import type { AdaptiveDecision, AdaptiveDecisionKind } from './adaptiveConcurrency';
import { DIRECT_CONCURRENCY_LEVELS, type ConcurrencyApplicationMode } from './attemptConcurrency';

// Observabilidad del modo adaptativo: describe en el log lo que ya ocurre (seed,
// decisiones, workers reales, learning) sin decidir ni cambiar nada. Target es lo
// pedido y actual lo reportado; solo dice `applied` cuando actual lo alcanza.

// Solo estas cambian el target; los veredictos (probe-improved/kept/…) van al resumen.
const TARGET_CHANGE_KINDS: ReadonlySet<AdaptiveDecisionKind> = new Set<AdaptiveDecisionKind>([
  'probe-up',
  'probe-degraded',
  'decrease',
  'strong-backoff',
]);

const TOP_LEVEL = DIRECT_CONCURRENCY_LEVELS[DIRECT_CONCURRENCY_LEVELS.length - 1];

export interface AttemptAdaptiveLogOptions {
  server: string;
  seed: number;
  // Misma semántica que `seedSource` del registro experimental.
  seedSource: 'manual' | 'learned';
  decisions(): readonly AdaptiveDecision[];
  // Workers reales reportados al handle por quien descarga.
  actual(): number;
  applicationMode(): ConcurrencyApplicationMode;
  // Techo de exploración del intento (safeMax aprendido o el tope de la escalera).
  probeCeiling?(): number;
  log: (message: string) => void;
}

export interface AdaptiveDecisionCounts {
  probes: number;
  improved: number;
  kept: number;
  decreased: number;
}

// Conteos del resumen final, con la misma taxonomía que el controller.
export function countAdaptiveDecisions(decisions: readonly AdaptiveDecision[]): AdaptiveDecisionCounts {
  const counts: AdaptiveDecisionCounts = { probes: 0, improved: 0, kept: 0, decreased: 0 };
  for (const decision of decisions) {
    if (decision.kind === 'probe-up') counts.probes += 1;
    else if (decision.kind === 'probe-improved') counts.improved += 1;
    else if (decision.kind === 'probe-kept') counts.kept += 1;
    else if (TARGET_CHANGE_KINDS.has(decision.kind)) counts.decreased += 1;
  }
  return counts;
}

interface PendingChange {
  from: number;
  to: number;
  kind: AdaptiveDecisionKind;
}

function formatBps(bps: number): string {
  if (!Number.isFinite(bps) || bps < 0) return '0B/s';
  if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(2)}MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(1)}KB/s`;
  return `${Math.round(bps)}B/s`;
}

export class AttemptAdaptiveLog {
  private readonly options: AttemptAdaptiveLogOptions;
  private decisionCursor = 0;
  private readonly pending: PendingChange[] = [];
  private anyChangeLogged = false;
  private simpleLogged = false;
  private progressed = false;

  constructor(options: AttemptAdaptiveLogOptions) {
    this.options = options;
  }

  start(): void {
    const { server, seed, seedSource } = this.options;
    this.options.log(`[Adaptive] ${server} · seed=${seed} · source=${seedSource} · adaptive=ON`);
  }

  // Un paso de observación al ritmo del progreso del engine, nunca por tick.
  observe(): void {
    const { server } = this.options;
    this.progressed = true;
    // Primero las aplicaciones pendientes: una decisión y su aplicación pueden
    // observarse en pasos distintos.
    this.closeAppliedChanges();
    const decisions = this.options.decisions();
    while (this.decisionCursor < decisions.length) {
      const decision = decisions[this.decisionCursor];
      this.decisionCursor += 1;
      if (!TARGET_CHANGE_KINDS.has(decision.kind)) continue;
      this.anyChangeLogged = true;
      if (this.isApplied(decision.from, decision.to)) {
        this.options.log(`[Adaptive] ${server} · ${decision.from}→${decision.to} · ${decision.kind} · applied`);
      } else {
        // Diferido (Mega: siguiente slice) o aún sin aplicar en el pool hot.
        const deferred = this.options.applicationMode() === 'deferred';
        this.options.log(
          `[Adaptive] ${server} · ${decision.from}→${decision.to} · ${decision.kind} · ${deferred ? 'deferred' : 'pending'}`,
        );
        this.pending.push({ from: decision.from, to: decision.to, kind: decision.kind });
      }
    }
    // Camino simple (seed 1 o sin 206): una sola línea, sin cambios posteriores.
    if (
      !this.simpleLogged &&
      !this.anyChangeLogged &&
      this.options.applicationMode() === 'not-applicable' &&
      this.options.actual() === 1
    ) {
      this.simpleLogged = true;
      this.options.log(`[Adaptive] ${server} · seed=${this.options.seed} · simple · not-applicable`);
    }
  }

  // Una línea por observación elegible; con sharing, solo la exclusión.
  learning(
    observations: readonly { level: number; kind: ConcurrencyObservationKind; bps: number }[],
    eligible: boolean,
  ): void {
    if (!eligible) {
      if (observations.length > 0) this.options.log('[Adaptive] learning · skipped · reason=sharing');
      return;
    }
    for (const observation of observations) {
      this.options.log(
        `[Adaptive] learning · ${this.options.server} · level=${observation.level} · ${observation.kind} · bps=${formatBps(observation.bps)}`,
      );
    }
  }

  finish(): void {
    const { server } = this.options;
    const progressed = this.progressed;
    this.observe();
    for (const change of this.pending.splice(0)) {
      this.options.log(`[Adaptive] ${server} · ${change.from}→${change.to} · not-applied`);
    }
    // Sin progreso no hubo nada que explorar, y solo el margen agotado se explica.
    if (this.anyChangeLogged || this.simpleLogged || !progressed) return;
    const ceiling = this.options.probeCeiling?.() ?? TOP_LEVEL;
    if (this.options.seed >= TOP_LEVEL) {
      this.options.log(`[Adaptive] ${server} · seed=${this.options.seed} · tope de escalera · sin exploración`);
    } else if (this.options.seed >= ceiling) {
      this.options.log(
        `[Adaptive] ${server} · seed=${this.options.seed} · techo aprendido · sin exploración (safeMax=${ceiling})`,
      );
    }
  }

  private closeAppliedChanges(): void {
    const { server } = this.options;
    for (let i = this.pending.length - 1; i >= 0; i -= 1) {
      const change = this.pending[i];
      if (this.isApplied(change.from, change.to)) {
        this.pending.splice(i, 1);
        this.options.log(`[Adaptive] ${server} · ${change.from}→${change.to} · applied`);
      }
    }
  }

  // Aplicación real = actual alcanza el nivel pedido (semántica de
  // `applicationLagMs`); con actual=0 nada cuenta como aplicado.
  private isApplied(from: number, to: number): boolean {
    const actual = this.options.actual();
    if (!(actual > 0)) return false;
    return to > from ? actual >= to : actual <= to;
  }
}

export function createAttemptAdaptiveLog(options: AttemptAdaptiveLogOptions): AttemptAdaptiveLog {
  return new AttemptAdaptiveLog(options);
}
