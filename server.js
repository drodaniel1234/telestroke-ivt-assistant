import "dotenv/config";
import express from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = "claude-sonnet-5";

const schema = JSON.parse(
  await readFile(path.join(__dirname, "ivt_criteria_schema.json"), "utf-8")
);

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Locates a model-quoted sentence in the original note via exact string search,
// falling back to whitespace-tolerant matching (newlines/extra spaces in the
// note vs. single spaces in the quote) before giving up.
function locateQuote(noteText, quote) {
  if (typeof quote !== "string") return null;
  const trimmed = quote.trim();
  if (!trimmed) return null;

  const idx = noteText.indexOf(trimmed);
  if (idx !== -1) {
    return { start: idx, end: idx + trimmed.length };
  }

  const pattern = trimmed.split(/\s+/).map(escapeRegExp).join("\\s+");
  const match = noteText.match(new RegExp(pattern));
  if (match) {
    return { start: match.index, end: match.index + match[0].length };
  }

  return null;
}

function allCriteria() {
  return [
    ...schema.inclusion_criteria.map((c) => ({ ...c, category: "inclusion" })),
    ...schema.absolute_contraindications.map((c) => ({ ...c, category: "absolute" })),
    ...schema.relative_contraindications.map((c) => ({ ...c, category: "relative" })),
  ];
}

const SILENCE_UNKNOWN_EXCEPTIONS = [
  "DOAC exposure within 48 hours",
  "Severe coagulopathy",
  "Severe thrombocytopenia",
  "Moderate-severe TBI within 14 days",
  "Neurosurgery within 14 days",
  "Major non-CNS surgery within 10 days",
  "Major non-CNS trauma in last 14 days-3 months",
  "GI/GU bleeding within last 21 days",
  "Pre-existing disability and/or frailty",
];

const SYSTEM_PROMPT = `You are a clinical documentation assistant supporting a telestroke physician during an acute stroke consult. You will be given a telestroke note (plain text) and a list of IV thrombolytic (IVT) eligibility criteria. For each criterion, determine "yes", "no", or "unknown", explain your reasoning in plain clinical language, and quote the exact sentence in the note that reasoning came from.

Rules you must follow:
1. Only use what is documented. Do not infer, assume, or fill in a plausible answer.
2. Silence generally means "no", with a specific exception list. If the note simply doesn't mention a criterion at all, and it is NOT on the exception list below, treat it as "no" -- reasoning like "Not mentioned in an otherwise populated history; a condition of this significance would typically be documented if present." For these silence-based "no" answers, quote is null -- there is no specific sentence to point to, and the reasoning itself already explains the basis for the answer.
   Exception list -- these stay "unknown" on silence, never default to "no": ${SILENCE_UNKNOWN_EXCEPTIONS.join(", ")}. Silence on these is much more likely to mean "wasn't asked" than "confirmed absent" -- they depend on labs, recent-event recall, or medication reconciliation that's frequently incomplete in a rushed acute note.
2b. CTA-dependent findings need a further check: is the CTA actually resulted? Three criteria -- intracranial arterial dissection, intracranial vascular malformations, and aortic arch dissection -- are diagnosed on CTA (vessel imaging), not on history. Before applying rule 2's silence-defaults-to-no to these three specifically:
   - If the note says CTA is still pending/not yet resulted, these three become "unknown" (not "no"), with reasoning like "CTA pending; cannot assess vessel/aortic anatomy yet" and quote containing the exact "CTA pending" phrase (or equivalent). This overrides rule 2's default for these three items only.
   - If the note indicates CTA has resulted (with or without explicit findings for these three), rule 2's default applies normally: silence about them in a resulted-CTA context reasonably means "no".
   - Intra-axial neoplasm is visible on the non-contrast head CT, which is essentially always already resulted by the time of a telestroke note (unlike CTA, which frequently is not). Treat it under rule 2's normal default (silence after a resulted CT = "no") unless the note specifically says the CT itself is still pending.
   - ARIA is an MRI finding tied to amyloid immunotherapy history, not an acute CTA finding -- it is NOT subject to this CTA-pending gate. Treat it under rule 2's normal silence-defaults-to-no logic.
3. An explicit negative statement always counts as "no", regardless of the exception list -- "no h/o AFib," "denies arrhythmia," "no anticoagulants" are all equivalent. This rule applies universally; the exception list in rule 2 and the CTA gate in rule 2b only concern what to do when a topic is not mentioned or not yet resulted -- not when it's explicitly denied or explicitly found.
3a. Distinguish a true documentation gap from a normal, populated history. If the note explicitly states that history is unavailable or unobtainable (e.g. patient aphasic/unidentified/confused with no collateral, "no records found," "unable to obtain history"), then EVERYTHING becomes "unknown", including items that would otherwise default to "no" under rule 2 -- there is no reliable history to draw any negative from. This overrides rule 2 entirely for that note. Contrast this with a normal note that simply has a populated PMH/history section that doesn't happen to mention a given rare condition -- that case follows rule 2's default of "no".
4. Every answer must include a short "reasoning" sentence (under 20 words, in your own words -- it does not need to match the note's exact phrasing) explaining your clinical judgment. In addition, every "yes", explicit-negative "no" (rule 3), or CTA-pending "unknown" (rule 2b) answer must include a "quote" field containing the exact sentence from the note that supports it. quote is null for silence-based "unknown"/"no" answers (rules 1 and 2) -- there is no single sentence to point to, and reasoning alone explains the basis.
5. Do not compute or state overall eligibility. Output per-criterion answers only -- no summary judgment like "patient is eligible."
6. "quote" must be copied character-for-character from the note -- the exact original wording, spacing, and punctuation of one whole sentence, with no paraphrasing, no ellipses, and no edits. This is different from "reasoning", which may paraphrase freely. Never quote more than one sentence.
7. Output ONLY a JSON array, no prose, no markdown fences, and no explanation of your approach before or after it. Your entire response must be the JSON array and nothing else: [{"id":"...","v":"yes|no|unknown","reasoning":"...","quote":"exact sentence or null"}]`;

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/criteria", (req, res) => {
  res.json(schema);
});

app.post("/api/extract", async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: "No Anthropic API key configured on the server. Add ANTHROPIC_API_KEY to .env and restart.",
    });
  }

  const noteText = req.body?.noteText;
  if (typeof noteText !== "string" || !noteText.trim()) {
    return res.status(400).json({ error: "noteText is required." });
  }

  const criteriaList = allCriteria().map((c) => ({ id: c.id, label: c.label }));
  const userMessage = `Here is the IVT eligibility criteria list:\n${JSON.stringify(criteriaList)}\n\nHere is the telestroke note:\n${noteText}\n\nFor each criterion, return v, reasoning, and quote per the rules above. Return the JSON array now.`;

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 6000,
        thinking: { type: "disabled" },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      console.error("Anthropic API error:", anthropicRes.status, errBody);
      return res.status(502).json({ error: "Anthropic API request failed.", detail: errBody });
    }

    const data = await anthropicRes.json();
    const textBlocks = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const cleaned = textBlocks.replace(/```json|```/g, "").trim();

    const arrayStart = cleaned.indexOf("[");
    const arrayEnd = cleaned.lastIndexOf("]");
    const jsonSlice = arrayStart !== -1 && arrayEnd > arrayStart ? cleaned.slice(arrayStart, arrayEnd + 1) : cleaned;

    let parsed;
    try {
      parsed = JSON.parse(jsonSlice);
    } catch (parseErr) {
      console.error("Failed to parse model output as JSON:", cleaned);
      return res.status(502).json({ error: "Model did not return valid JSON.", raw: cleaned });
    }

    const results = parsed.map((item) => ({
      id: item.id,
      v: item.v,
      reasoning: item.reasoning || null,
      location: locateQuote(noteText, item.quote),
    }));

    res.json({ results });
  } catch (err) {
    console.error("Extraction error:", err);
    res.status(500).json({ error: "Extraction request failed.", detail: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Telestroke IVT assistant server running at http://localhost:${PORT}`);
  if (!ANTHROPIC_API_KEY) {
    console.warn("Warning: ANTHROPIC_API_KEY is not set. Extraction calls will fail until you add it to .env.");
  }
});
