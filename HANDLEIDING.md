# Chattie - Handleiding voor de bedrijfseigenaar

## Wat doet Chattie?

Chattie is jouw persoonlijke AI-assistent die:
- **WhatsApp-berichten** automatisch beantwoordt en klanten kwalificeert
- **Gmail-aanvragen** beantwoordt met concept-mails die jij kunt goedkeuren
- **Klantgegevens** verzamelt en overzichtelijk opslaat

---

## 1. WhatsApp Chatbot

### Hoe het werkt
- Een klant stuurt een bericht naar je WhatsApp Business nummer
- De AI reageert automatisch, stelt vragen en verzamelt informatie:
  - Naam
  - E-mailadres
  - Telefoonnummer
  - Tuinafmetingen
  - Foto's van de tuin
- Zodra alle info verzameld is, krijg jij een melding

### Zelf ingrijpen in een WhatsApp-gesprek

**Optie 1: Gesprek overnemen (aanbevolen)**
- Stuur via de admin API een commando om de bot te pauzeren voor een specifiek gesprek
- Daarna kun je zelf reageren via de Twilio-console of via de API
- URL: `POST /admin/conversations/{id}/pause`

**Optie 2: Bericht handmatig sturen**
- Via de admin API kun je zelf een bericht sturen naar een klant:
- URL: `POST /admin/send`
- Body: `{"phone": "+316xxxxxxxx", "message": "Je bericht hier"}`

**Optie 3: Overzicht bekijken**
- Bekijk alle gesprekken: `GET /admin/contacts`
- Bekijk openstaande gesprekken: `GET /admin/pending`
- Bekijk statistieken: `GET /admin/stats`

### Wanneer grijp je in?
- Als de klant een complexe vraag stelt die de bot niet kan beantwoorden
- Als je zelf een offerte wilt bespreken
- Als een klant specifiek om een mens vraagt

---

## 2. Gmail Integratie

### Hoe het werkt
- Chattie checkt elke minuut je inbox op nieuwe berichten
- Bij een nieuw bericht maakt de AI een **concept-mail** (draft) aan
- De concept-mail verschijnt in je Gmail "Concepten" map
- Jij bekijkt het concept, past het eventueel aan, en verstuurt het

### Jouw workflow (oudste eerst)
1. Open Gmail en ga naar je inbox
2. Begin onderaan (oudste berichten eerst)
3. Bij elk bericht: check of er al een concept klaarstaat
4. Beoordeel het concept:
   - **Goed?** → Verstuur het
   - **Aanpassing nodig?** → Pas aan en verstuur
   - **Niet relevant?** → Verwijder het concept
5. Werk zo naar boven toe

### Follow-up patroon
Als een klant niet reageert of niet opneemt:
- **1e poging:** Concept wordt automatisch aangemaakt na binnenkomst
- **2e poging:** Na X dagen zonder reactie, maakt Chattie een follow-up concept aan
- **3e poging:** Chattie maakt een afsluitend concept aan ("We hebben geprobeerd contact met u op te nemen...")

---

## 3. Overzicht & Beheer

### Dashboard (Admin API)

| Wat | URL | Methode |
|-----|-----|---------|
| Alle contacten bekijken | `/admin/contacts` | GET |
| Openstaande gesprekken | `/admin/pending` | GET |
| Statistieken | `/admin/stats` | GET |
| Configuratie bekijken | `/admin/config` | GET |
| Configuratie aanpassen | `/admin/config` | PUT |
| Website scrapen | `/admin/scrape` | POST |
| Bericht sturen | `/admin/send` | POST |
| Gesprek pauzeren | `/admin/conversations/{id}/pause` | POST |

### Configuratie aanpassen
Je kunt de volgende instellingen wijzigen:
- **businessName**: Naam van je bedrijf
- **customInstructions**: Hoe de AI zich gedraagt
- **tone**: Communicatiestijl (friendly, professional, casual, formal)
- **collectFields**: Welke info de bot moet verzamelen
- **greetingMessage**: Eerste begroeting
- **closingMessage**: Afsluitend bericht

---

## 4. Tips

- De bot reageert alleen op nieuwe berichten. Als jij zelf hebt ingegrepen, wacht de bot tot er een nieuw bericht van de klant komt.
- Alle gesprekken worden opgeslagen — je kunt altijd terugkijken wat er is gezegd.
- De AI leert niet automatisch bij, maar je kunt de instructies op elk moment aanpassen.
- Bij twijfel: pauzeer het gesprek en neem zelf contact op met de klant.
