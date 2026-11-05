const MODEL = "gemini-3.6-flash";
const FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];
const MAX_TEXT_LENGTH = 60000;
const WORKER_VERSION = "2026-11-05-vacancy-fetch";

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


const MAX_PAGE_BYTES = 2_000_000;
const MAX_REDIRECTS = 4;

function validateTarget(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("Vul een geldige vacaturelink in."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Alleen openbare http- en https-links zijn toegestaan.");
  }
  if (url.port && !["80", "443"].includes(url.port)) {
    throw new Error("Deze link gebruikt een niet-toegestane poort.");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") ||
      host.endsWith(".local") || host.endsWith(".internal") ||
      host.endsWith(". test") || host === "metadata.google.internal" ||
      /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(":")) {
    throw new Error("Deze link verwijst niet naar een toegestane openbare website.");
  }
  return url;
}

function decodeHtml(value) {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function extractPage(source, contentType) {
  if (contentType.includes("text/plain")) return { title: "", description: "", text: source };
  const title = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const h1 = source.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "";
  const og = source.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i)?.[1] || "";
  const description = source.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)?.[1] || "";
  let body = source.replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe|aside)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  body = decodeHtml(body).replace(/[ \t\f\v]+/g, " ").replace(/\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n").trim();
  return { title: decodeHtml(og || h1 || title.replace(/<[^>]+>/g, " ")).trim(),
    description: decodeHtml(description), text: body };
}

async function fetchPublicPage(raw) {
  let target = validateTarget(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(target.href, {
      method: "GET", redirect: "manual",
      headers: { "User-Agent": "MijnSollicitatiesVacancyReader/1.0", "Accept": "text/html,text/plain;q=0.9" },
      signal: AbortSignal.timeout(12000)
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("Location");
      if (!location || hop === MAX_REDIRECTS) throw new Error("De website stuurde te vaak door naar een andere pagina.");
      target = validateTarget(new URL(location, target).href);
      continue;
    }
    if (!response.ok) throw new Error("De website gaf een foutmelding (HTTP " + response.status + ").");
    const type = (response.headers.get("Content-Type") || "").toLowerCase();
    if (!type.includes("text/html") && !type.includes("text/plain")) {
      throw new Error("Deze link verwijst niet naar een uitleesbare webpagina. Gebruik eventueel de PDF.");
    }
    const length = Number(response.headers.get("Content-Length") || 0);
    if (length > MAX_PAGE_BYTES) throw new Error("De vacaturepagina is te groot om veilig uit te lezen.");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("De website heeft geen leesbare pagina teruggegeven.");
    const chunks = []; let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_PAGE_BYTES) { await reader.cancel(); throw new Error("De vacaturepagina is te groot om veilig uit te lezen."); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const source = new TextDecoder("utf-8").decode(bytes);
    const page = extractPage(source, type);
    return { ...page, url: target.href };
  }
  throw new Error("De vacaturepagina kon niet worden opgehaald.");
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

    if (url.pathname === "/fetch-vacancy" && request.method === "POST") {
      if (!originAllowed) return json({ error: "Deze app is niet toegestaan." }, 403, cors);
      try {
        const body = await request.json();
        const rawUrl = String(body.url || "").trim();
        if (!rawUrl || rawUrl.length > 2048) return json({ error: "Vul een geldige vacaturelink in." }, 400, cors);
        const page = await fetchPublicPage(rawUrl);
        const text = [page.title, page.description, page.text].filter(Boolean).join("\\n\\n").trim();
        if (text.length < 80) return json({ error: "De pagina bevat te weinig leesbare vacaturetekst. Mogelijk wordt de inhoud met JavaScript geladen." }, 422, cors);
        return json({ text: text.slice(0, 60000), url: page.url }, 200, cors);
      } catch (error) {
        return json({ error: error.message || "De vacaturepagina kon niet worden opgehaald." }, 422, cors);
      }
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
