// Supabase Edge Function: advisor
// ─────────────────────────────────────────────────────────────────────────────
// Narrates the dashboard's Advisor findings with a hosted model (Groq or Google
// Gemini). Holds the API key as a SECRET (never shipped to the browser) and does
// nothing else of substance:
// the findings themselves are computed client-side in src/lib/advisor/findings.ts,
// and this function may only turn them into prose.
//
// This is a Deno function — NOT part of the app's `tsc --noEmit`. Deploy separately
// (see setup notes at the bottom).
//
// Two providers are supported. They are interchangeable here because the job is
// only phrasing: the findings are computed client-side, and the client AUDITS the
// returned prose (see lib/advisor/narrate.ts) and falls back to the app-written
// briefing if a figure or a person's name is wrong. A weaker model can't ship a
// wrong number — worst case its draft is rejected.
//
// Secrets / env (Dashboard → Edge Functions → advisor → Secrets, or the CLI's
// `supabase secrets set …`):
//   ADVISOR_PROVIDER      'gemini' | 'groq' (optional; inferred from whichever key
//                         is present, preferring Gemini when both are)
//   GEMINI_API_KEY        Google AI Studio key
//   GEMINI_MODEL          model id or alias (optional; default gemini-flash-latest)
//   GROQ_API_KEY          Groq key — https://console.groq.com/keys
//   GROQ_MODEL            model id (optional; default llama-3.3-70b-versatile)
//   ADVISOR_ALLOW_ORIGIN  CORS allow-origin (optional; default '*')
//
// Request  (POST JSON): { findings: Finding[], scopeLabel: string, effortOn: boolean,
//                         prompt?: string }   ← editable voice brief (Settings → Advisor);
//                         ACCURACY_RULES are appended after it and outrank it.
// Response (JSON):      { configured: true, text: string, model: string }
//                       { configured: false }                  ← key missing
//                       { configured: true, error: "…" }        ← upstream failure
//
// PRIVACY: the payload is aggregate-only by construction — the client sends
// pre-formatted numbers and neutral claims, never task names, person names or
// campaign codes. Anything identifying reaching this function is a client bug.
// A guard below rejects payloads that look like raw records.

// @ts-nocheck  (Deno runtime globals; not typechecked by the app's tsc.)

// A rolling ALIAS, deliberately not a pinned version. Google retires superseded
// models in two ways that both look like our bug rather than theirs:
//   · older generations keep answering but with free-tier `limit: 0`, which surfaces
//     as `429 RESOURCE_EXHAUSTED` and reads as "you're out of quota"
//   · retired ones return `404 … no longer available to new users`
// Pinning a version means the advisor silently dies whenever that happens. Override
// per-project with the GEMINI_MODEL secret.
const DEFAULT_MODEL = 'gemini-flash-latest'

/**
 * Groq default. A plain instruct model on purpose: the GPT-OSS models on Groq are
 * reasoning-style and can spend this budget thinking (the same trap `thinkingConfig`
 * exists to dodge on Gemini), and we want phrasing, not reasoning. Override with
 * GROQ_MODEL to try `openai/gpt-oss-120b` or another production model.
 */
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

/**
 * Groq's version of the thinking ladder below — same problem, different spelling.
 * Reasoning models here would otherwise spend the answer budget thinking, and Groq
 * splits the off-switch by family: GPT-OSS takes `include_reasoning`, Qwen/MiniMax
 * take `reasoning_format`, the two are mutually exclusive, and a plain instruct
 * model (the default) accepts neither. Walk the ladder on 400; the last rung — an
 * empty variant — always validates.
 */
const GROQ_REASONING_VARIANTS: Array<Record<string, unknown>> = [
  { include_reasoning: false, reasoning_effort: 'low' }, // GPT-OSS 20B / 120B
  { reasoning_format: 'hidden' }, // Qwen, MiniMax
  {}, // llama-3.3-70b-versatile and other plain instruct models
]

const MAX_FINDINGS = 14
/**
 * Output budget. Generous on purpose — see `thinkingConfig` below: on a thinking
 * model this ceiling is shared with reasoning tokens, so a tight value yields a
 * truncated fragment rather than a short briefing.
 */
const MAX_OUTPUT_TOKENS = 4096

/**
 * How to ask a model not to spend the answer budget on reasoning — most specific
 * first, ending with "don't ask at all". Model generations disagree about this
 * field (`thinkingBudget` is 2.5-era, `thinkingLevel` is 3-era) and a model that
 * dislikes the one you sent replies `400 INVALID_ARGUMENT` with a generic message
 * that names no field, so sniffing the error text doesn't work. Walk the ladder
 * instead: the last rung always validates.
 */
const THINKING_VARIANTS: Array<Record<string, unknown>> = [
  { thinkingConfig: { thinkingBudget: 0 } },
  { thinkingConfig: { thinkingLevel: 'low' } },
  {},
]
/** Upper bound on a single fact string — anything longer isn't an aggregate. */
const MAX_FACT_LEN = 60

function cors(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': Deno.env.get('ADVISOR_ALLOW_ORIGIN') ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  })
}

/**
 * The voice brief. Deliberately about WRITING, not about content selection — the
 * facts are already chosen and ranked. The hard rules exist because the client
 * runs a numeric audit on the result and will reject a stray figure.
 */
/**
 * Voice brief used when the app doesn't send one.
 *
 * Mirrors DEFAULT_ADVISOR_PROMPT in src/constants.ts — keep the two in step. The
 * app's copy is what editors see and edit in Settings; this one is the floor for a
 * client that sends nothing.
 */
const DEFAULT_VOICE = `You are a workload analyst writing a short briefing for the manager of RMIT's GCMC creative team.

WHAT TO SAY:
- 3 short paragraphs, 130-200 words total. Flowing prose, no bullet points, no headings.
- You are given MORE findings than you should mention. Pick the 3-4 that together tell one coherent story and ignore the rest. Do not walk through them in order.
- Open on the single most consequential finding, stated plainly in one sentence. No scene-setting abstraction first.
- Connect the findings. The value is in the relationship between them - a concentration and a ramp are the same story about timing.
- Close on what it means for planning, drawn only from what you have already said. Do not introduce a new claim to end on.
- Where a caveat finding is present, work it in honestly rather than as a disclaimer at the end.

HOW TO WRITE IT:
- Plain professional English, British spelling. Short verbs beat abstract nouns.
- Phrasing pattern only — X is a placeholder and must never appear in your output, nor may the figure it stands for be invented: say "Videos took X% of the team's hours", do NOT say "Videos represents an X% share of overall effort".
- Banned as padding: "represents", "presents", "constitutes", "in terms of", "share of overall", "resource" as a noun, "centralized", "utilise", "leverage", "key driver", "capacity challenge", "operational pressure", "remains the primary".
- Don't lean on one framing word. If you have written "share" once, find another way the next time.
- Vary sentence length. Never one sentence per fact; that reads like a form letter.
- No hype, no "significantly", no exclamation marks. Confident and unexcited.
- Effort figures come from hand-set rate estimates, so treat them as comparative, never as measured hours.`

/**
 * Appended AFTER the voice brief, always, and worded to outrank it.
 *
 * This is the half of the prompt the app may NOT edit. Settings lets a manager
 * change how the briefing reads; it must not be able to talk the model into
 * inventing a figure or naming a person. The client's numeric audit is still the
 * real enforcement — this just stops us relying on it alone.
 */
const ACCURACY_RULES = `ACCURACY RULES - these override every instruction above, and a breach means the output is discarded:
- Use ONLY the numbers that appear in the supplied facts, copied character-for-character (including % signs, units and the minus sign).
- Never calculate, estimate, total, average or infer a new number. If you want to state a figure that isn't in the facts, leave it out.
- Never invent months, asset types, squads, people or campaigns that aren't in the facts.
- Never name an individual person.
- Do not say "the data shows", "based on the findings" or otherwise refer to this brief.
- Write prose only: no bullet points, no headings, no tables, no closing sign-off.`

/** Longest voice brief accepted from the app (matches ADVISOR_PROMPT_MAX). */
const MAX_PROMPT_LEN = 6000

/** The voice brief to use, plus the rules it can't override. */
function systemInstruction(raw: unknown): string {
  const voice = typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, MAX_PROMPT_LEN) : DEFAULT_VOICE
  return `${voice}

${ACCURACY_RULES}`
}

/** Rejects payloads carrying anything that looks like a raw record. */
function looksAggregate(findings: unknown): boolean {
  if (!Array.isArray(findings) || findings.length === 0) return false
  for (const f of findings) {
    if (!f || typeof f !== 'object') return false
    const { id, claim, facts } = f as Record<string, unknown>
    if (typeof id !== 'string' || typeof claim !== 'string') return false
    if (!facts || typeof facts !== 'object') return false
    for (const v of Object.values(facts as Record<string, unknown>)) {
      if (typeof v !== 'string' || v.length > MAX_FACT_LEN) return false
    }
  }
  return true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  // Provider is explicit when set, otherwise inferred from whichever key exists —
  // so a Groq-only project needs one secret and no provider flag, and an existing
  // Gemini project keeps working with no change at all.
  //
  // Trimmed as well as lowercased: these are typed into a dashboard field, and a
  // trailing space is invisible there but would otherwise fail to match.
  const geminiKey = Deno.env.get('GEMINI_API_KEY')?.trim()
  const groqKey = Deno.env.get('GROQ_API_KEY')?.trim()
  const declared = (Deno.env.get('ADVISOR_PROVIDER') ?? '').trim().toLowerCase()
  const provider = declared || (geminiKey ? 'gemini' : groqKey ? 'groq' : '')

  // Say WHICH of the three ways this is misconfigured. Returning a bare
  // `configured: false` for all of them sends you looking for a missing key when
  // the real problem is a typo'd provider name.
  if (declared && declared !== 'gemini' && declared !== 'groq') {
    return json(
      { configured: true, error: `ADVISOR_PROVIDER is "${declared}" — expected "gemini" or "groq".` },
      500,
    )
  }
  const key = provider === 'groq' ? groqKey : geminiKey
  if (!provider) return json({ configured: false })
  if (!key) {
    const missing = provider === 'groq' ? 'GROQ_API_KEY' : 'GEMINI_API_KEY'
    return json({ configured: true, error: `ADVISOR_PROVIDER is "${provider}" but ${missing} is not set.` }, 500)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ configured: true, error: 'Malformed JSON body.' }, 400)
  }

  const findings = (body.findings as unknown[])?.slice(0, MAX_FINDINGS)
  if (!looksAggregate(findings)) {
    return json({ configured: true, error: 'Payload rejected: findings must be aggregate facts.' }, 400)
  }

  const model =
    provider === 'groq'
      ? (Deno.env.get('GROQ_MODEL') ?? DEFAULT_GROQ_MODEL)
      : (Deno.env.get('GEMINI_MODEL') ?? DEFAULT_MODEL)
  const system = systemInstruction(body.prompt)
  const scopeLabel = typeof body.scopeLabel === 'string' ? body.scopeLabel : 'the current period'
  const measure = body.effortOn ? 'effort-weighted hours' : 'asset counts'

  const userPrompt = [
    `Scope: ${scopeLabel}. The dashboard is currently measuring ${measure}.`,
    '',
    'Findings (JSON, strongest first):',
    JSON.stringify(findings, null, 1),
    '',
    'Write the briefing now.',
  ].join('\n')

  // ── Groq (OpenAI-compatible chat completions) ──────────────────────────────
  // Short path by design: one request, no thinking-field ladder to walk, and the
  // same {text, model} contract the client already handles.
  if (provider === 'groq') {
    const groqCall = (reasoningVariant: Record<string, unknown>) =>
      fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          // Same rationale as the Gemini call: the numeric audit downstream is what
          // keeps this honest, so temperature buys phrasing at no cost to accuracy.
          temperature: 0.9,
          top_p: 0.95,
          max_completion_tokens: MAX_OUTPUT_TOKENS,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userPrompt },
          ],
          ...reasoningVariant,
        }),
      })

    let res: Response
    try {
      res = await groqCall(GROQ_REASONING_VARIANTS[0])
      // Only a 400 means "I don't accept that field" — any other status is about
      // the request's substance, so stop walking and report it below.
      for (let i = 1; i < GROQ_REASONING_VARIANTS.length && res.status === 400; i++) {
        res = await groqCall(GROQ_REASONING_VARIANTS[i])
      }
    } catch (e) {
      return json({ configured: true, error: `Groq unreachable: ${String(e)}` }, 502)
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      const status = res.status === 429 ? 429 : 502
      return json({ configured: true, error: `Groq ${res.status}: ${detail.slice(0, 900)}` }, status)
    }

    const data = await res.json().catch(() => null)
    const choice = data?.choices?.[0]
    // Belt and braces: if the ladder fell through to the empty variant on a model
    // that reasons inline anyway, its scratchpad arrives wrapped in <think> tags.
    // Never prose, always safe to drop.
    const text = (choice?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    if (!text.trim()) {
      return json({ configured: true, error: `Groq returned no text (${choice?.finish_reason ?? 'empty response'}).` }, 502)
    }
    // Same reasoning as Gemini's finishReason check: a briefing cut off mid-figure
    // is worse than none, and the audit would reject it anyway.
    if (choice?.finish_reason && choice.finish_reason !== 'stop') {
      const usage = JSON.stringify(data?.usage ?? {})
      return json(
        { configured: true, error: `Groq stopped early (${choice.finish_reason}). usage=${usage}` },
        502,
      )
    }

    return json({ configured: true, text: text.trim(), model })
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

  /**
   * `thinkingBudget: 0` matters more than it looks. Current flash models reason by
   * default and reasoning tokens are drawn from the SAME maxOutputTokens budget as
   * the answer, so a thinking model on a tight budget returns a cut-off fragment
   * (finishReason MAX_TOKENS) instead of prose. We want phrasing, not reasoning —
   * which findings matter was already decided client-side.
   */
  const requestBody = (thinkingVariant: Record<string, unknown>) => ({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      // High enough to read as written rather than assembled; the numeric audit
      // downstream is what keeps it honest, so temperature costs us nothing.
      temperature: 0.9,
      topP: 0.95,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      ...thinkingVariant,
    },
    // The briefing is about internal workload; don't let safety filters trip on
    // ordinary words like "pressure" or "brutal".
    safetySettings: [
      'HARM_CATEGORY_HARASSMENT',
      'HARM_CATEGORY_HATE_SPEECH',
      'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      'HARM_CATEGORY_DANGEROUS_CONTENT',
    ].map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' })),
  })

  const call = (thinkingVariant: Record<string, unknown>) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(requestBody(thinkingVariant)),
    })

  let res: Response
  try {
    res = await call(THINKING_VARIANTS[0])
    // Only a 400 means "I don't accept that field" — every other status is about the
    // request's substance, so stop walking and let the handling below report it.
    for (let i = 1; i < THINKING_VARIANTS.length && res.status === 400; i++) {
      res = await call(THINKING_VARIANTS[i])
    }
  } catch (e) {
    return json({ configured: true, error: `Gemini unreachable: ${String(e)}` }, 502)
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    // Surface rate limiting distinctly — the free tier hits it, and the client
    // should fall back quietly rather than showing an error.
    const status = res.status === 429 ? 429 : 502
    // Keep enough of the body to name the exhausted quota metric — the useful part
    // of a 429 sits well past the boilerplate about plans and billing.
    return json({ configured: true, error: `Gemini ${res.status}: ${detail.slice(0, 900)}` }, status)
  }

  const data = await res.json().catch(() => null)
  const candidate = data?.candidates?.[0]
  const text = candidate?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
  const finish = candidate?.finishReason
  if (!text.trim()) {
    const reason = finish ?? data?.promptFeedback?.blockReason ?? 'empty response'
    return json({ configured: true, error: `Gemini returned no text (${reason}).` }, 502)
  }
  // A briefing cut off mid-sentence is worse than no briefing: it strands half-written
  // figures that the client's numeric audit would reject anyway. Report the usage so
  // a budget problem is diagnosable instead of looking like a bad generation.
  if (finish && finish !== 'STOP') {
    const usage = JSON.stringify(data?.usageMetadata ?? {})
    return json({ configured: true, error: `Gemini stopped early (${finish}). usage=${usage}` }, 502)
  }

  return json({ configured: true, text: text.trim(), model })
})

// ── Setup / deploy ───────────────────────────────────────────────────────────
// 1) Get a key — Groq: https://console.groq.com/keys (free tier, no card)
//                Gemini: https://aistudio.google.com/apikey (free tier)
//
// 2) Add it as a secret. Dashboard route (no CLI needed):
//      Edge Functions → advisor → Secrets → Add new secret
//        GROQ_API_KEY = ...            [optional: GROQ_MODEL]
//      …or GEMINI_API_KEY = ...        [optional: GEMINI_MODEL]
//    CLI route: supabase secrets set GROQ_API_KEY=...
//
//    ⚠ If BOTH keys exist, Gemini wins — the tie is deliberate so an existing
//      deploy can't switch provider by surprise. To run Groq alongside a Gemini
//      key still in the project, add ADVISOR_PROVIDER = groq (or delete the
//      Gemini secret).
//
// 3) Deploy. Dashboard route: Edge Functions → advisor → paste this file into the
//    editor → Deploy.   CLI route: supabase functions deploy advisor
//    (Default JWT verification is fine — supabase-js `functions.invoke` sends the
//     anon key, which is a valid JWT.)
//
// 4) In the app build, set VITE_ADVISOR=1 to enable the client path.
//
// 5) Check it: the Advisor page's briefing footer names the model that wrote it.
//    In dev, `window.__advisor.narrate()` in the console returns the raw result
//    including any upstream error string.
