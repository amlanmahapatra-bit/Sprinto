import { evaluate } from "@/lib/engine/score";
import type {
  IcpParams,
  QualificationResult,
  ResearchAgent,
  Signals,
  TraceEntry,
} from "@/lib/engine/types";

export function mergeSignals(base: Signals, delta: Partial<Signals>): Signals {
  const out: Signals = { ...base };
  (Object.keys(delta) as (keyof Signals)[]).forEach((k) => {
    const v = delta[k];
    if (v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
  });
  return out;
}

function changed(before: Signals, after: Signals): boolean {
  return (Object.keys(after) as (keyof Signals)[]).some((k) => {
    const a = before[k];
    const b = after[k];
    return JSON.stringify(a) !== JSON.stringify(b);
  });
}

export interface QualifyOptions {
  now?: Date;
  extraFlags?: string[];
}

/**
 * Deterministic qualification with the research-agent loop (ICP_SPEC §3, §5).
 * The agent only yields new signals (post quote-check); it never sets a score.
 */
export async function runQualification(
  initial: Signals,
  icp: IcpParams,
  agent: ResearchAgent | null,
  opts: QualifyOptions = {},
): Promise<QualificationResult> {
  const now = opts.now ?? new Date();
  let signals = { ...initial };
  const trace: TraceEntry[] = [];
  let loopsUsed = 0;
  const maxLoops = icp.verdict.max_research_loops;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const loopsRemaining = maxLoops - loopsUsed;
    const res = evaluate(signals, icp, {
      now,
      loopsRemaining,
      extraFlags: opts.extraFlags,
    });

    if (res.decision !== "RESEARCH_MORE") {
      trace.push({
        iteration: loopsUsed,
        score: res.score,
        confidence: res.confidence,
        decision: res.decision,
        ...(res.reason ? { reason: res.reason } : {}),
      });
      return finalize(res, signals, trace, loopsUsed);
    }

    // Decided to research.
    trace.push({
      iteration: loopsUsed,
      score: res.score,
      confidence: res.confidence,
      decision: "RESEARCH_MORE",
    });

    const delta = agent ? await agent(loopsUsed + 1, signals) : null;
    loopsUsed += 1;
    const merged = delta ? mergeSignals(signals, delta.signals) : signals;
    const addedNew = delta ? changed(signals, merged) : false;
    signals = merged;

    if (!addedNew && icp.verdict.stop_if_no_new_evidence) {
      const final = evaluate(signals, icp, {
        now,
        loopsRemaining: 0,
        extraFlags: opts.extraFlags,
      });
      trace.push({
        iteration: loopsUsed,
        score: final.score,
        confidence: final.confidence,
        decision: final.decision,
        reason: "no new evidence / loops exhausted",
      });
      return finalize(final, signals, trace, loopsUsed);
    }
    // otherwise loop again; if loops exhausted the next evaluate() returns a terminal verdict.
  }
}

function finalize(
  res: ReturnType<typeof evaluate>,
  signals: Signals,
  trace: TraceEntry[],
  loopsUsed: number,
): QualificationResult {
  return {
    verdict: res.decision,
    score: res.score,
    confidence: res.confidence,
    loops_used: loopsUsed,
    gates: res.gates,
    flags: res.flags,
    criterion_points: res.criterion_points,
    criterion_status: res.criterion_status,
    trace,
    signals,
    reason: res.reason,
  };
}

/** Build a mock research agent that replays scripted deltas (for tests / MOCK_EXTERNAL). */
export function scriptedAgent(
  deltas: { iteration: number; tool?: string; args?: Record<string, unknown>; signals: Partial<Signals> }[],
): ResearchAgent {
  return (iteration) => {
    const d = deltas.find((x) => x.iteration === iteration);
    if (!d) return null;
    return {
      iteration,
      tool: d.tool ?? "mock",
      args: d.args ?? {},
      signals: d.signals,
    };
  };
}
