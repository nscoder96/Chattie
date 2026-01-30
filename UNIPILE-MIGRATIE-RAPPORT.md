# Unipile Migratie Rapport - Chattie

## 1. Huidige Setup (Twilio + Custom Code)

### Architectuur
- **Stack:** TypeScript/Node.js + Express
- **WhatsApp:** Twilio WhatsApp Sandbox
- **Email:** Gmail API (OAuth2)
- **AI/LLM:** OpenAI GPT-4
- **Database:** Prisma + SQLite
- **Hosting:** Railway

### Huidige Flow
1. Klant stuurt WhatsApp bericht
2. Twilio webhook POST naar `/whatsapp/webhook` (URL-encoded form data)
3. Bericht opgeslagen in database (Contact + Conversation + Message)
4. AI genereert antwoord via OpenAI (met bedrijfscontext + gesprekshistorie)
5. Antwoord verzonden via Twilio REST API (`client.messages.create()`)
6. Gmail: polling elke 60s, concept-mails aangemaakt voor inkomende berichten

### Twilio Features in Gebruik
- WhatsApp Sandbox (niet Business API)
- Media messaging (foto's ontvangen)
- Webhook voor inkomende berichten
- REST API voor berichten verzenden
- Geen Twilio Studio, Functions, of Templates

---

## 2. Gap Analysis

### Directe Equivalenten

| Functionaliteit | Twilio | Unipile |
|-----------------|--------|---------|
| WhatsApp berichten ontvangen | Webhook (form-encoded) | Webhook (JSON) |
| WhatsApp berichten sturen | `client.messages.create()` | `POST /api/v1/chats/{chat_id}/messages` |
| Foto's ontvangen | `MediaUrl0` in webhook | `attachments` array in webhook |
| Contact identificatie | `From` (telefoonnummer) | `sender_id` (telefoonnummer) |
| Profiel naam | `ProfileName` in webhook | Beschikbaar via chat/attendee data |

### Wat Unipile EXTRA biedt
- **Unified API**: WhatsApp + Gmail + LinkedIn + Instagram in 1 API
- **Geen per-bericht kosten**: Onbeperkt berichten
- **Geen Meta Business verificatie**: QR-code setup
- **Email via dezelfde API**: Geen aparte Gmail OAuth nodig
- **Hosted auth wizard**: Klant-onboarding via link

### Wat je VERLIEST bij migratie
- **Officieel Meta BSP-status**: Twilio is officieel, Unipile werkt via persoonlijk WhatsApp
- **Twilio SDK**: Moet vervangen door HTTP requests
- **Message templates**: Unipile werkt met free-form berichten, geen goedgekeurde templates
- **Leveringsbevestigingen**: Twilio heeft robuuste status callbacks

### Risico's
- **WhatsApp QR-code stabiliteit**: Sessie kan verlopen, vereist herverbinding
- **Compliance**: Niet via officieel Meta kanaal, minder geschikt voor enterprise
- **Webhook betrouwbaarheid**: Gebruikers melden dat dit soms issues geeft

---

## 3. Technische Migratie Mapping

### API Endpoints Mapping

```
TWILIO                                    UNIPILE
────────────────────────────────────────  ────────────────────────────────────────
Webhook ontvangst:                        Webhook ontvangst:
POST /whatsapp/webhook                    POST /whatsapp/webhook (zelfde URL)
Content-Type: form-urlencoded             Content-Type: application/json

Bericht sturen:                           Bericht sturen:
twilio.messages.create({                  POST https://{DSN}/api/v1/chats/{chat_id}/messages
  body: message,                          Headers: X-API-KEY: {TOKEN}
  from: 'whatsapp:+14155238886',          Body: { text: message }
  to: 'whatsapp:+316...'
})

Email sturen:                             Email sturen:
gmail.users.messages.send(...)            POST https://{DSN}/api/v1/emails
                                          Body: { account_id, to, subject, body }

Account verbinden:                        Account verbinden:
Twilio Console + Meta verificatie         POST /api/v1/hosted/accounts/link
                                          → Hosted auth wizard URL
```

### Webhook Payload Vergelijking

**Twilio (huidig - form-encoded):**
```
From=whatsapp%3A%2B31653967819
Body=Hallo
ProfileName=Niek
NumMedia=0
MessageSid=SM...
```

**Unipile (nieuw - JSON):**
```json
{
  "id": "msg_123",
  "chat_id": "chat_456",
  "account_id": "acc_789",
  "text": "Hallo",
  "sender_id": "+31653967819",
  "timestamp": "2026-01-26T10:00:00Z",
  "is_sender": false,
  "attachments": []
}
```

### Code Aanpassingen

**whatsapp.ts service - VOOR (Twilio):**
```typescript
import twilio from 'twilio';
const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

export async function sendWhatsAppMessage(to: string, message: string) {
  const result = await client.messages.create({
    body: message,
    from: 'whatsapp:+14155238886',
    to: `whatsapp:${to}`,
  });
  return result.sid;
}
```

**whatsapp.ts service - NA (Unipile):**
```typescript
const UNIPILE_BASE = `https://${UNIPILE_DSN}/api/v1`;
const UNIPILE_KEY = process.env.UNIPILE_API_KEY;

export async function sendWhatsAppMessage(chatId: string, message: string) {
  const response = await fetch(`${UNIPILE_BASE}/chats/${chatId}/messages`, {
    method: 'POST',
    headers: {
      'X-API-KEY': UNIPILE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: message }),
  });
  const data = await response.json();
  return data.id;
}
```

**Webhook handler - VOOR (Twilio):**
```typescript
// URL-encoded form data
whatsappRouter.use(express.urlencoded({ extended: false }));
const message = req.body as TwilioWhatsAppMessage;
const phone = message.From.replace('whatsapp:', '');
const content = message.Body;
```

**Webhook handler - NA (Unipile):**
```typescript
// JSON data
const message = req.body;
const phone = message.sender_id;
const content = message.text;
const chatId = message.chat_id;      // Nodig voor antwoord sturen
const accountId = message.account_id; // Nodig voor klant-routing
```

---

## 4. Multi-Client Architectuur

### Database Schema Uitbreiding

```prisma
// Nieuwe modellen voor multi-tenant
model Client {
  id              String   @id @default(cuid())
  name            String   // "Hoveniersbedrijf Smit"
  ownerEmail      String

  // Unipile account IDs
  whatsappAccountId String? // Unipile account_id voor WhatsApp
  emailAccountId    String? // Unipile account_id voor Email

  businessConfig  BusinessConfig?
  contacts        Contact[]

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

### Routing Logica

```typescript
// Inkomend webhook bericht → route naar juiste klant
async function routeIncomingMessage(webhookPayload: UnipileMessage) {
  const accountId = webhookPayload.account_id;

  // Zoek welke klant bij dit account hoort
  const client = await prisma.client.findFirst({
    where: {
      OR: [
        { whatsappAccountId: accountId },
        { emailAccountId: accountId },
      ],
    },
    include: { businessConfig: true },
  });

  if (!client) {
    console.error(`Geen klant gevonden voor account ${accountId}`);
    return;
  }

  // Verwerk met de juiste klant-configuratie
  await handleMessage(client, webhookPayload);
}
```

### Klant Onboarding Flow

1. Nieuwe klant aanmaken in database
2. Hosted auth link genereren: `POST /api/v1/hosted/accounts/link`
3. Link sturen naar klant → klant scant QR-code (WhatsApp) of logt in (Gmail)
4. Callback ontvangen met `account_id`
5. `account_id` koppelen aan klant in database
6. Webhook ontvangt berichten met `account_id` → routing naar juiste klant

### Schalen van 1 → 10+ klanten

| Klanten | Accounts (WA+Email) | Unipile Kosten |
|---------|---------------------|----------------|
| 1 | 2 | €49/maand (basis) |
| 5 | 10 | €49/maand (basis) |
| 6 | 12 | €60/maand (12 x €5) |
| 10 | 20 | €100/maand (20 x €5) |
| 25 | 50 | €250/maand (50 x €5) |

---

## 5. Migratieplan

### Fase 1: Parallel Testen (Week 1)
- [ ] Unipile trial account aanmaken (7 dagen gratis)
- [ ] Test WhatsApp account verbinden via QR-code
- [ ] Test webhook ontvangen en bericht sturen
- [ ] Vergelijk betrouwbaarheid met Twilio
- [ ] Test email integratie via Unipile

### Fase 2: Code Aanpassen (Week 2)
- [ ] Unipile service layer bouwen (`src/services/unipile.ts`)
- [ ] Webhook handler aanpassen voor JSON payload
- [ ] Email service migreren van Gmail API naar Unipile
- [ ] Feature flag toevoegen: `MESSAGING_PROVIDER=twilio|unipile`
- [ ] Testen met beide providers parallel

### Fase 3: Eerste Klant Migreren (Week 3)
- [ ] Michael's WhatsApp verbinden via Unipile hosted auth
- [ ] Michael's Gmail verbinden via Unipile hosted auth
- [ ] Multi-tenant database schema deployen
- [ ] Monitoren op webhook-betrouwbaarheid
- [ ] Twilio als fallback actief houden

### Fase 4: Volledige Overstap (Week 4+)
- [ ] Twilio code verwijderen als Unipile stabiel is
- [ ] Nieuwe klanten onboarden via Unipile
- [ ] Twilio account downgraden/opzeggen

### Rollback Strategie
- Feature flag: schakel terug naar Twilio met 1 config change
- Twilio account actief houden eerste 2 maanden na migratie
- Database structuur is provider-agnostisch (berichten blijven bewaard)

---

## 6. Kostenanalyse

### Scenario 1: Michael alleen (1 klant)

| | Twilio + Gmail API | Unipile |
|---|---|---|
| Vaste kosten | ~€5/maand (Railway) | ~€5/maand (Railway) + €49/maand (Unipile) |
| WhatsApp | ~€0.01/bericht (Twilio + Meta) | Inbegrepen |
| Gmail | Gratis (Google API) | Inbegrepen |
| OpenAI | ~€5-15/maand | ~€5-15/maand |
| **Totaal (500 msg/maand)** | **~€15-25/maand** | **~€59-69/maand** |

**Conclusie 1 klant:** Twilio is goedkoper bij laag volume.

### Scenario 2: 5 klanten

| | Twilio + Gmail API per klant | Unipile |
|---|---|---|
| WhatsApp (5x 500 msg) | ~€25/maand | €49/maand (alles inbegrepen) |
| Gmail setup per klant | OAuth per klant configureren | Via hosted auth wizard |
| Beheerkosten | Hoog (5x OAuth, 5x config) | Laag (1 API, 1 webhook) |
| **Totaal** | **~€50-75/maand** | **~€54-69/maand** |

**Conclusie 5 klanten:** Vergelijkbaar, maar Unipile is veel makkelijker te beheren.

### Scenario 3: 10+ klanten

| | Twilio + Gmail API | Unipile |
|---|---|---|
| 10 klanten (20 accounts) | ~€100-150/maand + beheer | €100/maand |
| 25 klanten (50 accounts) | ~€250-375/maand + beheer | €250/maand |
| **Schaal voordeel** | Lineair duurder | Voorspelbaar |

**Conclusie 10+ klanten:** Unipile wint op kosten EN beheerbaarheid.

### Break-Even Punt
- **Kosten**: ~5-6 klanten
- **Beheer**: Vanaf klant 2 is Unipile al voordeliger (geen per-klant OAuth setup)

---

## 7. Risico Assessment

| Risico | Impact | Kans | Mitigatie |
|--------|--------|------|----------|
| WhatsApp QR sessie verloopt | Hoog - klant offline | Medium | Account status webhook monitoren, auto-notificatie bij CREDENTIALS status |
| Webhook niet geleverd | Hoog - berichten gemist | Laag | Retry logica (5 pogingen), fallback polling |
| Meta blokkeert unofficial API | Kritiek | Laag | Twilio als fallback behouden, migratie naar official API mogelijk |
| Unipile downtime | Hoog | Laag | SOC 2 gecertificeerd, SLA monitoren |
| Klant wil officieel Meta BSP | Medium | Laag | Twilio optie behouden voor enterprise klanten |

---

## 8. Go/No-Go Aanbeveling

### GO als:
- Je van plan bent om **meerdere klanten** te bedienen (>3)
- Je de **beheerlast** wilt minimaliseren (1 API voor alles)
- Je klanten **geen officieel Meta BSP** vereisen
- Je de **7-daagse trial** eerst test op stabiliteit

### NO-GO als:
- Je maar **1-2 klanten** hebt en dat zo blijft
- Klanten **enterprise compliance** vereisen (officieel Meta kanaal)
- **Webhook betrouwbaarheid** bij testing niet voldoende is

### Aanbeveling
**Start met de 7-daagse trial** en test parallel met de huidige Twilio setup. De multi-tenant architectuur en unified API van Unipile maken het de betere keuze zodra je meer dan 3 klanten hebt. Houd Twilio als fallback voor klanten die een officieel kanaal vereisen.

---

## Bronnen
- [Unipile API Pricing](https://www.unipile.com/pricing-api/)
- [Unipile Developer Docs](https://developer.unipile.com/)
- [Unipile Webhooks](https://developer.unipile.com/docs/new-messages-webhook)
- [Unipile Provider Limits](https://developer.unipile.com/docs/provider-limits-and-restrictions)
- [Twilio WhatsApp Pricing](https://www.twilio.com/en-us/whatsapp/pricing)
