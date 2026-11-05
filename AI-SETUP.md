# Gemini AI instellen

De app blijft werken zonder AI. Voor de optionele AI-analyse is een gratis Google AI Studio API-sleutel en een gratis Cloudflare Worker nodig.

## 1. Gemini API-sleutel
1. Ga naar https://aistudio.google.com/app/apikey.
2. Maak een API-sleutel aan voor de Gemini API.
3. Gebruik de gratis tier en koppel geen billing.
4. Houd de sleutel privé; plak hem nooit in GitHub of in de app.

Let op: Google vermeldt dat inhoud op de gratis Gemini API-tier kan worden gebruikt om producten te verbeteren. Stuur daarom geen onnodige persoonsgegevens mee.

## 2. Cloudflare Worker
1. Maak een gratis account op https://dash.cloudflare.com/.
2. Ga naar Workers & Pages en maak een Worker aan.
3. Vervang de voorbeeldcode door de inhoud van `worker/gemini-worker.js` en deploy.
4. Open Worker Settings → Variables and Secrets.
5. Voeg een Secret toe met naam `GEMINI_API_KEY` en plak daar de Google API-sleutel.
6. Voeg een tekstvariabele toe met naam `ALLOWED_ORIGIN` en als waarde de exacte origin van je gepubliceerde app, bijvoorbeeld `https://gebruikersnaam.github.io` (geen pad achter de domeinnaam).
7. Deploy opnieuw.

## 3. Koppelen in de app
1. Open de gepubliceerde app en ga naar Instellingen.
2. Plak de Worker-URL (bijvoorbeeld `https://naam.naam.workers.dev`) bij AI-vacatureanalyse.
3. Sla de koppeling op.
4. Bij AI-analyse vraagt de app eerst toestemming voordat de vacaturetekst naar Gemini wordt gestuurd.

## Gebruik en kosten
Cloudflare Workers Free heeft een limiet van 100.000 verzoeken per dag. Gemini gratis heeft eigen model- en gebruikslimieten; die kunnen wijzigen. Gebruik geen betaald Google Cloud-project en schakel geen billing in. Als Google de gratis quota wijzigt of op is, blijft lokale herkenning beschikbaar.

## Privacy
De vacaturetekst gaat via de Worker naar Google Gemini. De Worker slaat de tekst niet op. De app bewaart de originele tekst lokaal in je browser. Controleer de AI-resultaten zelf; ontbrekende gegevens worden leeg gelaten. Als je geen tekst naar Google wilt sturen, gebruik dan de lokale herkenningsknop.


## Android-app met Capacitor

De Android-WebView gebruikt doorgaans de origin `https://localhost`. Als AI ook in de Android-app moet werken, voeg deze origin toe aan de bestaande Cloudflare Worker-variabele `ALLOWED_ORIGIN`, gescheiden door een komma:

```text
https://melissa34556.github.io,https://localhost
```

Behoud beide adressen. De API-sleutel blijft uitsluitend als Cloudflare Secret `GEMINI_API_KEY` opgeslagen.
