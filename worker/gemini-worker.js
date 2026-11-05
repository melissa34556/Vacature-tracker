const MODEL = "gemini-3.6-flash";
const FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];
const MAX_TEXT_LENGTH = 60000;
const WORKER_VERSION = "2026-11-05-ai-fallback";

function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGIN || "")
    .split(",")
    .map(value => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function corsHeaders(origin, allowedOrigins) {
  const isAllowed = Boolean(origin) &&
    (allowedOrigins.includes("*") || allowedOrigins.includes(origin));
  return {
    "Access-Control-Allow-Origin": isAllowed
      ? (allowedOrigins.includes("*") ? "*" : origin)
      : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status, cors) {
  return Response.json(data, {
    status,
    headers: { ...cors, "Cache-Control": "no-store" }
  });
}

function isTemporaryOverload(status) {
  return [429, 500, 502, 503, 504].includes(status);
}

async function callGemini(model, apiKey, prompt) {
  return fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" +
      model + ":generateContent?key=" + encodeURIComponent(apiKey),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              company: { type: "STRING" },
              location: { type: "STRING" },
              hours: { type: "STRING" },
              salaryMin: { type: "STRING" },
              salaryMax: { type: "STRING" },
              summary: { type: "STRING" },
              tasks: { type: "STRING" },
              requirements: { type: "STRING" },
              offer: { type: "STRING" }
            },
            required: [
              "title", "company", "location", "hours", "salaryMin",
              "salaryMax", "summary", "tasks", "requirements", "offer"
            ]
          }
        }
      })
    }
  );
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = getAllowedOrigins(env);
    const originAllowed = Boolean(origin) &&
      (allowedOrigins.includes("*") || allowedOrigins.includes(origin));
    const cors = corsHeaders(origin, allowedOrigins);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        status: "ok",
        workerVersion: WORKER_VERSION,
        model: MODEL,
        fallbackModels: FALLBACK_MODELS,
        requestOrigin: origin || "(geen Origin-header; waarschijnlijk rechtstreeks geopend)",
        originAllowed,
        configuredOrigins: allowedOrigins,
        geminiApiKeyConfigured: Boolean(env.GEMINI_API_KEY)
      }, 200, cors);
    }

    if (url.pathname !== "/analyze" || request.method !== "POST") {
      return json({ error: "Niet gevonden." }, 404, cors);
    }

    if (!originAllowed) {
      return json({
        error: "Deze app is niet toegestaan.",
        diagnostic: {
          requestOrigin: origin || "(geen Origin-header)",
          configuredOrigins: allowedOrigins
        }
      }, 403, cors);
    }

    if (!env.GEMINI_API_KEY) {
      return json({ error: "De Gemini API-sleutel is nog niet ingesteld." }, 503, cors);
    }

    try {
      const body = await request.json();
      const text = String(body.text || "").trim();

      if (text.length < 80) {
        return json({ error: "Te weinig vacaturetekst." }, 400, cors);
      }
      if (text.length > MAX_TEXT_LENGTH) {
        return json({ error: "De tekst is te lang." }, 413, cors);
      }

      const prompt = `Analyseer de onderstaande vacaturetekst in het Nederlands. Vul alleen informatie in die expliciet of duidelijk uit de tekst blijkt. Verzin nooit gegevens. Gebruik lege strings als iets ontbreekt. Maak een korte, feitelijke samenvatting en vat werkzaamheden, gevraagd profiel en aanbod afzonderlijk samen. Geef uitsluitend JSON terug met de velden title, company, location, hours, salaryMin, salaryMax, summary, tasks, requirements, offer.

VACATURETEKST:
${text}`;

      let response = await callGemini(MODEL, env.GEMINI_API_KEY, prompt);
      let usedModel = MODEL;

      // Give the primary model one brief retry, then try supported alternatives
      // only for temporary capacity/rate-limit/server errors.
      if (!response.ok && isTemporaryOverload(response.status)) {
        await new Promise(resolve => setTimeout(resolve, 900));
        response = await callGemini(MODEL, env.GEMINI_API_KEY, prompt);
      }

      if (!response.ok && isTemporaryOverload(response.status)) {
        for (const fallbackModel of FALLBACK_MODELS) {
          const fallbackResponse = await callGemini(
            fallbackModel, env.GEMINI_API_KEY, prompt
          );
          response = fallbackResponse;
          usedModel = fallbackModel;
          if (response.ok || !isTemporaryOverload(response.status)) break;
        }
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data.error?.message ||
          "Google Gemini is tijdelijk niet beschikbaar. Probeer het later opnieuw.";
        return json({
          error: message,
          upstreamStatus: response.status,
          attemptedModels: [MODEL, ...FALLBACK_MODELS]
        }, 502, cors);
      }

      const output = data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "").join("") || "";
      let result;
      try {
        result = JSON.parse(output);
      } catch {
        return json({ error: "Gemini gaf geen geldige analyse terug." }, 502, cors);
      }

      return json({ ...result, modelUsed: usedModel }, 200, cors);
    } catch (error) {
      console.error("AI-aanvraag mislukt:", error);
      return json({
        error: "De AI-aanvraag is mislukt. Controleer de Worker-logs in Cloudflare."
      }, 500, cors);
    }
  }
};
