import { GoogleGenAI } from "@google/genai";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod";
import { env } from "@/lib/env";
import { ICP_V1 } from "@/lib/icp/defaults";
import { hasServiceDb, serviceClient } from "@/lib/db/service";
import type { Database } from "@/lib/db/database.types";

let _ai: GoogleGenAI | null = null;
function ai(): GoogleGenAI {
  if (!_ai) {
    if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");
    _ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return _ai;
}

// ---- OpenRouter (OpenAI-compatible) ----------------------------------------
// When OPENROUTER_API_KEY is set, both calls route here instead of Google. Gemini
// model ids are given the "google/" provider prefix. OpenRouter does not expose
// Google Search grounding, so the research agent runs on scraped evidence only.
function toOpenRouterModel(model: string): string {
  if (model.includes("/")) return model; // already provider-qualified
  if (model.startsWith("gemini")) return `google/${model}`;
  return model;
}

async function openRouterChat(opts: {
  model: string;
  prompt: string;
  json?: boolean;
}): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  if (!env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY missing");
  const body: Record<string, unknown> = {
    model: toOpenRouterModel(opts.model),
    messages: [{ role: "user", content: opts.prompt }],
    // Serve every request from Google's own infrastructure only.
    provider: { only: ["google-vertex", "google-ai-studio"], allow_fallbacks: false },
  };
  if (opts.json) body.response_format = { type: "json_object" };
  const res = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": env.APP_BASE_URL,
      "X-Title": "Sprinto Outreach Engine",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${t.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: json.choices?.[0]?.message?.content ?? "",
    tokensIn: json.usage?.prompt_tokens ?? 0,
    tokensOut: json.usage?.completion_tokens ?? 0,
  };
}

// Models occasionally wrap JSON in a ```json fence despite json mode — strip it.
function stripJsonFences(t: string): string {
  const m = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return (m ? m[1] : t).trim();
}

function cost(tokensIn: number, tokensOut: number): number {
  const p = ICP_V1.pricing;
  return (tokensIn / 1e6) * p.input_per_mtok + (tokensOut / 1e6) * p.output_per_mtok;
}

async function logCall(row: {
  company_id?: string | null;
  step: string;
  model: string;
  prompt_version: string;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  cost_usd: number;
  ok: boolean;
  error?: string | null;
}) {
  if (!hasServiceDb()) return;
  try {
    const payload: Database["public"]["Tables"]["llm_calls"]["Insert"] = {
      company_id: row.company_id ?? null,
      step: row.step,
      model: row.model,
      prompt_version: row.prompt_version,
      tokens_in: row.tokens_in,
      tokens_out: row.tokens_out,
      latency_ms: row.latency_ms,
      cost_usd: row.cost_usd,
      ok: row.ok,
      error: row.error ?? null,
    };
    await serviceClient().from("llm_calls").insert(payload as never);
  } catch {
    /* logging must never break the pipeline */
  }
}

export interface CallMeta {
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
}

export async function callJSON<T>(opts: {
  model: string;
  step: string;
  promptVersion: string;
  prompt: string;
  schema: z.ZodType<T>;
  companyId?: string | null;
  thinkingLevel?: "low" | "high";
}): Promise<{ data: T; meta: CallMeta }> {
  const start = Date.now();
  const jsonSchema = zodToJsonSchema(opts.schema, { target: "openApi3" });
  let text = "{}";
  let ti = 0;
  let to = 0;

  if (env.LLM_PROVIDER === "openrouter") {
    // No native responseSchema on OpenRouter's chat API; use JSON mode and carry the
    // schema in the prompt. Output is still validated with the same zod schema below.
    const prompt = `${opts.prompt}\n\nReturn ONLY a JSON object matching this JSON schema (no markdown, no commentary):\n${JSON.stringify(jsonSchema)}`;
    const r = await openRouterChat({ model: opts.model, prompt, json: true });
    text = r.text || "{}";
    ti = r.tokensIn;
    to = r.tokensOut;
  } else {
    const res = await ai().models.generateContent({
      model: opts.model,
      contents: opts.prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: jsonSchema as unknown as Record<string, unknown>,
        ...(opts.thinkingLevel ? { thinkingConfig: { thinkingBudget: opts.thinkingLevel === "low" ? 0 : 4096 } } : {}),
      },
    });
    text = res.text ?? "{}";
    ti = res.usageMetadata?.promptTokenCount ?? 0;
    to = res.usageMetadata?.candidatesTokenCount ?? 0;
  }

  const c = cost(ti, to);
  let parsed: T;
  try {
    parsed = opts.schema.parse(JSON.parse(stripJsonFences(text)));
  } catch (e) {
    await logCall({ ...base(opts), tokens_in: ti, tokens_out: to, latency_ms: Date.now() - start, cost_usd: c, ok: false, error: (e as Error).message });
    throw e;
  }
  await logCall({ ...base(opts), tokens_in: ti, tokens_out: to, latency_ms: Date.now() - start, cost_usd: c, ok: true });
  return { data: parsed, meta: { tokens_in: ti, tokens_out: to, cost_usd: c } };
}

export async function callText(opts: {
  model: string;
  step: string;
  promptVersion: string;
  prompt: string;
  grounded?: boolean;
  companyId?: string | null;
}): Promise<{ text: string; grounding: string[]; meta: CallMeta }> {
  const start = Date.now();
  let text = "";
  let ti = 0;
  let to = 0;
  const grounding: string[] = [];

  if (env.LLM_PROVIDER === "openrouter") {
    const r = await openRouterChat({ model: opts.model, prompt: opts.prompt });
    text = r.text;
    ti = r.tokensIn;
    to = r.tokensOut;
    // OpenRouter does not surface Google Search grounding; grounding stays empty.
  } else {
    const res = await ai().models.generateContent({
      model: opts.model,
      contents: opts.prompt,
      config: opts.grounded ? { tools: [{ googleSearch: {} }] } : {},
    });
    text = res.text ?? "";
    ti = res.usageMetadata?.promptTokenCount ?? 0;
    to = res.usageMetadata?.candidatesTokenCount ?? 0;
    const meta = res.candidates?.[0]?.groundingMetadata;
    const chunks = (meta as { groundingChunks?: { web?: { uri?: string } }[] } | undefined)?.groundingChunks ?? [];
    chunks.forEach((ch) => ch.web?.uri && grounding.push(ch.web.uri));
  }

  const c = cost(ti, to);
  await logCall({ ...base(opts), tokens_in: ti, tokens_out: to, latency_ms: Date.now() - start, cost_usd: c, ok: true });
  return { text, grounding, meta: { tokens_in: ti, tokens_out: to, cost_usd: c } };
}

function base(opts: { companyId?: string | null; step: string; model: string; promptVersion: string }) {
  return { company_id: opts.companyId ?? null, step: opts.step, model: opts.model, prompt_version: opts.promptVersion };
}
