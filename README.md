# Mijn sollicitaties — technische basis

Dit is een eerste, mobile-first PWA-prototype. De interface is Nederlandstalig en ontworpen voor telefoons, met een bredere desktopweergave.

## Inbegrepen
- Vacatures toevoegen, bewerken, verwijderen, zoeken en filteren.
- De afgesproken acht sollicitatiestatussen.
- Documenten opslaan met type: CV, Motivatiebrief, Certificaat, Diploma, Referentie of Overig.
- Lokale opslag via IndexedDB; bestanden blijven op het apparaat/browserprofiel.
- JSON-back-up met documenten en terugzetten.
- Kleurthema's, eigen accentkleur en donkere modus.
- Service worker voor basis-offlinegebruik na de eerste laadbeurt.

## Lokaal testen
Gebruik een lokale webserver; service workers werken niet betrouwbaar via `file://`.

Bijvoorbeeld met Python:
```bash
python -m http.server 8000
```
Open daarna `http://localhost:8000`.

## Publiceren
Upload de inhoud van deze map naar een HTTPS-host, bijvoorbeeld GitHub Pages. Open de gepubliceerde URL op Android in Chrome en kies via het browsermenu **Installeren** of **Toevoegen aan startscherm**.

## Belangrijke beperkingen van deze eerste basis
- Gegevens staan lokaal in de browser. Browsergegevens wissen of een ander apparaat gebruiken betekent dat je een back-up nodig hebt.
- Dit prototype heeft nog geen accounts, cloudsync, automatische herinneringen, recruiter/contactbeheer, koppeling van documenten aan meerdere vacatures of OCR.
- De Google Fonts-import is optioneel; zonder internet gebruikt de app een fallback-lettertype.
- De app is een werkende basis, geen afgeronde of beveiligingsgeaudite productie-app. Bewaar back-ups op een veilige plek.

\n## Optionele AI-vacatureanalyse (Gemini)\n\nDe AI-functie gebruikt een aparte Cloudflare Worker als beveiligde tussenlaag. De Gemini API-sleutel wordt uitsluitend als Cloudflare Secret opgeslagen en staat nooit in de browser of repository. Zie `AI-SETUP.md` voor de installatie. De app verstuurt vacaturetekst alleen na een bevestiging per analyse. Google vermeldt dat inhoud op de gratis Gemini API-tier kan worden gebruikt om producten te verbeteren; stuur daarom geen onnodige persoonsgegevens mee. De lokale herkenning blijft beschikbaar zonder AI.\n