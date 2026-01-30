# Chattie - Handleiding voor de bedrijfseigenaar

## Wat doet Chattie?

Chattie is jouw persoonlijke AI-assistent die:
- **WhatsApp-berichten** automatisch beantwoordt en klanten kwalificeert
- **Gmail-aanvragen** beantwoordt met concept-mails die jij kunt goedkeuren
- **Klantgegevens** verzamelt en overzichtelijk opslaat
- **Off-topic berichten** beleefd afwijst en het gesprek terugbrengt naar je diensten
- **E-mails classificeert** en alleen klant-e-mails beantwoordt (leveranciers/spam worden gelabeld)

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
- De AI praat **alleen over je bedrijf en diensten** - off-topic vragen worden beleefd afgewezen

### Zelf ingrijpen in een WhatsApp-gesprek

**Optie 1: Via het Dashboard (aanbevolen)**
- Open het dashboard in je browser
- Ga naar "Gesprekken" en klik op het gesprek
- Gebruik de knoppen "Pauzeren", "Hervatten" of "Follow-up"

**Optie 2: Gesprek overnemen via API**
- URL: `POST /admin/conversations/{id}/pause`

**Optie 3: Bericht handmatig sturen**
- Via het dashboard of via de API
- URL: `POST /admin/send`
- Body: `{"phone": "+316xxxxxxxx", "message": "Je bericht hier"}`

### Wanneer grijp je in?
- Als de klant een complexe vraag stelt die de bot niet kan beantwoorden
- Als je zelf een offerte wilt bespreken
- Als een klant specifiek om een mens vraagt

---

## 2. Gmail Integratie

### Hoe het werkt
- Chattie checkt elke minuut je inbox op nieuwe berichten
- Inkomende e-mails worden **automatisch geclassificeerd**:
  - **Klant** → AI maakt concept-antwoord aan
  - **Leverancier** → Wordt gelabeld, geen concept
  - **Ongewenst** → Wordt gelabeld en als gelezen gemarkeerd
  - **Overig** → Wordt gelabeld en als gelezen gemarkeerd
- Labels verschijnen in Gmail als `Klant`, `Leverancier`, `Ongewenst`, `Intern` of `Overig`.

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
- **2e poging:** Na 2 dagen zonder reactie, maakt Chattie een follow-up concept aan
- **3e poging:** Chattie maakt een afsluitend concept aan ("We hebben geprobeerd contact met u op te nemen...")

---

## 3. Dashboard

Het dashboard is bereikbaar via je browser op dezelfde URL als de server.

### Pagina's

| Pagina | Wat het doet |
|--------|-------------|
| **Dashboard** | Overzicht: contacten, gesprekken, te beoordelen berichten, berichten vandaag |
| **Goedkeuren** | Bekijk, bewerk en keur AI-antwoorden goed of wijs ze af |
| **Gesprekken** | Lijst van alle gesprekken met filter op status en kanaal |
| **Contacten** | Tabel met alle klantgegevens |
| **Instellingen** | Bedrijfsconfiguratie, AI-instellingen, website scrapen |

### Goedkeuren (belangrijkste pagina)
- Hier zie je alle berichten die wachten op jouw goedkeuring
- Per bericht zie je:
  - Het originele klantbericht
  - Het voorgestelde AI-antwoord
- Je kunt:
  - **Goedkeuren** → Bericht wordt direct verstuurd
  - **Bewerken & versturen** → Pas de tekst aan en verstuur
  - **Afwijzen** → Bericht wordt niet verstuurd

---

## 4. Instellingen

Je kunt de volgende instellingen wijzigen via het dashboard:
- **businessName**: Naam van je bedrijf
- **businessDescription**: Beschrijving van je bedrijf
- **customInstructions**: Hoe de AI zich gedraagt
- **tone**: Communicatiestijl (vriendelijk, professioneel, informeel, formeel)
- **language**: Taal (Nederlands of Engels)
- **collectFields**: Welke info de bot moet verzamelen
- **responseMode**: Goedkeuring vereist of automatisch versturen
- **greetingMessage**: Eerste begroeting
- **closingMessage**: Afsluitend bericht

### Website scrapen
Via Instellingen kun je je website URL invoeren en op "Scrapen" klikken. De AI analyseert je website en gebruikt de informatie om beter te antwoorden over je diensten, werkgebied en prijzen.

---

## 5. Verantwoordelijkheidsverdeling

### Systeem (automatisch)
- Beantwoordt WhatsApp-berichten van klanten
- Classificeert inkomende e-mails (klant/leverancier/spam)
- Maakt concept-antwoorden voor klant-e-mails
- Verzamelt klantinformatie (naam, email, telefoon, tuingegevens)
- Labelt e-mails in Gmail
- Stuurt follow-up concepten na 2 dagen
- Wijst off-topic berichten af
- Beschermt klant-PII (stuurt geen persoonlijke gegevens naar AI)

### Jij (bedrijfseigenaar)
- Beoordeelt en keurt AI-reacties goed via het dashboard
- Checkt dashboard voor nieuwe leads
- Beoordeelt en verstuurt e-mail concepten in Gmail
- Pauzeert bot bij complexe gesprekken
- Maakt offertes voor gekwalificeerde leads
- Belt klanten die hun info hebben gegeven

### Ontwikkelaar
- Server uptime en Railway deployment
- API key beheer (OpenAI, Twilio, Gmail)
- Bug fixes en feature updates
- Database backups

---

## 6. Tips

- De bot reageert alleen op nieuwe berichten. Als jij zelf hebt ingegrepen, wacht de bot tot er een nieuw bericht van de klant komt.
- Alle gesprekken worden opgeslagen — je kunt altijd terugkijken wat er is gezegd.
- De AI leert niet automatisch bij, maar je kunt de instructies op elk moment aanpassen via het dashboard.
- Bij twijfel: pauzeer het gesprek en neem zelf contact op met de klant.
- Gmail labels helpen je snel te zien welke e-mails van klanten zijn en welke van leveranciers.
