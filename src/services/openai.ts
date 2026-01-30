import OpenAI from 'openai';
import { config } from '../config/index.js';
import { getBusinessConfig } from './scraper.js';
import type { ConversationContext, AIResponse } from '../types/index.js';
import type { BusinessConfig } from '@prisma/client';

const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
});

function buildSystemPrompt(businessConfig: BusinessConfig): string {
  const scrapedData = businessConfig.scrapedContent
    ? JSON.parse(businessConfig.scrapedContent)
    : null;

  const collectFields = JSON.parse(businessConfig.collectFields) as string[];

  // Build the fields to collect section
  const fieldsToCollect = collectFields.map((field, i) => {
    const fieldNames: Record<string, string> = {
      name: 'Naam van de klant',
      email: 'E-mailadres',
      phone: 'Telefoonnummer (06-nummer)',
      gardenSize: 'Afmetingen van de tuin (bij benadering in meters)',
      photos: 'Foto\'s van de tuin',
      address: 'Adres',
      budget: 'Budget indicatie',
      timeline: 'Wanneer ze het werk willen laten uitvoeren',
    };
    return `${i + 1}. **${fieldNames[field] || field}**`;
  }).join('\n');

  // Build business context from scraped data
  let businessContext = '';
  if (scrapedData?.categorized) {
    const cat = scrapedData.categorized;
    const dienstenList = cat.diensten?.map((d: { naam: string; beschrijving: string }) => `- ${d.naam}: ${d.beschrijving}`).join('\n') || '';
    const faqList = cat.veelgestelde_vragen?.map((q: { vraag: string; antwoord: string }) => `V: ${q.vraag}\nA: ${q.antwoord}`).join('\n\n') || '';

    businessContext = `
## Over het bedrijf
Naam: ${businessConfig.businessName}
${cat.over_het_bedrijf || ''}

## Diensten
${dienstenList}

${cat.werkgebied?.length > 0 ? `## Werkgebied\n${cat.werkgebied.join(', ')}` : ''}

${cat.prijsindicaties ? `## Prijsindicaties\n${cat.prijsindicaties}` : ''}

${faqList ? `## Veelgestelde vragen\n${faqList}` : ''}

${cat.projecten?.length > 0 ? `## Referenties/Projecten\n${cat.projecten.map((p: string) => `- ${p}`).join('\n')}` : ''}
`;
  } else if (scrapedData) {
    businessContext = `
## Over het bedrijf
Naam: ${businessConfig.businessName}
${scrapedData.description ? `Beschrijving: ${scrapedData.description}` : ''}
${scrapedData.services?.length > 0 ? `Diensten: ${scrapedData.services.join(', ')}` : ''}
${scrapedData.about ? `Over ons: ${scrapedData.about}` : ''}
`;
  } else {
    businessContext = `
## Over het bedrijf
Naam: ${businessConfig.businessName}
${businessConfig.businessDescription ? `Beschrijving: ${businessConfig.businessDescription}` : ''}
`;
  }

  // Tone mapping
  const toneInstructions: Record<string, string> = {
    friendly: 'Wees vriendelijk en warm in je communicatie.',
    professional: 'Wees professioneel maar toegankelijk.',
    casual: 'Wees casual en informeel, alsof je met een vriend praat.',
    formal: 'Wees formeel en beleefd, gebruik "u" in plaats van "je".',
  };

  const tone = businessConfig.tone
    ? toneInstructions[businessConfig.tone] || toneInstructions.friendly
    : toneInstructions.friendly;

  // Custom instructions
  const customInstructions = businessConfig.customInstructions
    ? `\n## Extra instructies van de bedrijfseigenaar\n${businessConfig.customInstructions}\n`
    : '';

  return `Je bent de assistent van ${businessConfig.businessName}. Je helpt potentiële klanten via WhatsApp.

BELANGRIJK: Je bent GEEN chatbot, GEEN AI, GEEN bot. Je bent simpelweg "de assistent van ${businessConfig.businessName}". Noem dit NOOIT anders.

${businessContext}

## Gespreksstijl
- Praat als een echt mens, niet als een robot
- Gebruik NIET elke keer de naam van de klant - dat is onnatuurlijk
- Houd berichten kort en conversationeel
- Reageer op wat de klant zegt, stel geen lijstjes met vragen
- Wees geïnteresseerd in hun project, niet aan het "afvinken" van een formulier
- ${tone}
${businessConfig.language === 'nl' ? '- Schrijf in het Nederlands' : '- Write in English'}
${customInstructions}

## Volgorde van informatie verzamelen
Verzamel informatie in DEZE VOLGORDE (één onderwerp per bericht):

1. **Adres** - Waar is de tuin? (We moeten eerst weten of het in ons werkgebied valt)
2. **Wensen/idee** - Wat willen ze met hun tuin? Vraag naar hun plannen, wat ze voor ogen hebben
3. **Foto's** - Vraag of ze foto's kunnen sturen van de huidige situatie
4. **E-mail** - Als laatste: vraag hun e-mailadres zodat we een offerte kunnen sturen

## Instructies
- Vraag maximaal 1 ding per bericht
- Als de klant al informatie geeft, reageer daar natuurlijk op en vraag dan pas naar het volgende
- Als ze foto's sturen, reageer erop ("Mooie tuin!" of "Ik zie wat je bedoelt") en ga door
- Rond het gesprek PAS af als alle informatie is verzameld
- Beantwoord vragen over het bedrijf, maar leid terug naar het gesprek

## Beperkingen
- Praat ALLEEN over ${businessConfig.businessName} en tuinwerkzaamheden
- Off-topic? Zeg vriendelijk: "Daar kan ik je helaas niet mee helpen, maar vertel - wat kan ik voor je tuin betekenen?"
- Noem NOOIT dat je een bot, AI, chatbot of automatisch systeem bent
${businessConfig.greetingMessage ? `\n## Eerste bericht\nBij een nieuwe klant, begin met: "${businessConfig.greetingMessage}"\n` : ''}

## Afsluiting
Als alle informatie (adres, wensen, foto's, e-mail) verzameld is, sluit af met:
"Bedankt voor alle informatie! Ik neem zo snel mogelijk telefonisch contact met jullie op."

## Formaat
Reageer altijd in JSON-formaat:
{
  "message": "Je antwoord aan de klant",
  "collectedInfo": {
    "name": "naam als genoemd",
    "email": "email als genoemd",
    "phone": "telefoonnummer als genoemd",
    "gardenSize": "afmetingen als genoemd"
  },
  "conversationComplete": true/false
}

Zet collectedInfo velden alleen als de klant die informatie IN DIT BERICHT geeft.
Zet conversationComplete op true alleen als ALLE benodigde informatie verzameld is.`;
}

export async function generateResponse(context: ConversationContext, customerMessage: string): Promise<AIResponse> {
  const businessConfig = await getBusinessConfig();
  const systemPrompt = buildSystemPrompt(businessConfig);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Add context about what we already know (only flags, no PII sent to OpenAI)
  if (context.contactName || context.contactEmail || context.gardenSize || context.hasPhotos) {
    let contextMessage = 'Reeds verzamelde informatie over deze klant:\n';
    if (context.contactName) contextMessage += `- Naam: ✓ verzameld\n`;
    if (context.contactEmail) contextMessage += `- E-mail: ✓ verzameld\n`;
    if (context.contactPhone) contextMessage += `- Telefoon: ✓ verzameld\n`;
    if (context.gardenSize) contextMessage += `- Tuinafmetingen: ✓ verzameld\n`;
    if (context.hasPhotos) contextMessage += `- Foto's: ✓ ontvangen\n`;
    messages.push({ role: 'system', content: contextMessage });
  }

  // Add conversation history
  for (const msg of context.messageHistory) {
    messages.push({
      role: msg.role === 'customer' ? 'user' : 'assistant',
      content: msg.content,
    });
  }

  // Add current message
  messages.push({ role: 'user', content: customerMessage });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages,
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 500,
  });

  const responseText = completion.choices[0]?.message?.content;
  if (!responseText) {
    throw new Error('No response from OpenAI');
  }

  try {
    const parsed = JSON.parse(responseText) as AIResponse;
    return parsed;
  } catch {
    // If JSON parsing fails, return the raw message
    return {
      message: responseText,
      conversationComplete: false,
    };
  }
}

export interface EmailClassification {
  classification: 'CUSTOMER' | 'SUPPLIER' | 'SPAM' | 'INTERNAL' | 'OTHER';
  confidence: number;
  reason: string;
}

export async function classifyEmail(
  from: string,
  subject: string,
  body: string
): Promise<EmailClassification> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: `Classificeer de volgende e-mail in één van deze categorieën:
- CUSTOMER: Een (potentiële) klant die vraagt over diensten, offertes, of afspraken
- SUPPLIER: Een leverancier, zakelijke partner, of B2B communicatie
- SPAM: Reclame, phishing, ongewenste berichten
- INTERNAL: Interne communicatie, systeem notificaties
- OTHER: Alles wat niet in bovenstaande categorieën past

Geef je antwoord als JSON met: classification, confidence (0-1), reason (kort).`,
      },
      {
        role: 'user',
        content: `Van: ${from}\nOnderwerp: ${subject}\n\n${body.slice(0, 500)}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 150,
  });

  const responseText = completion.choices[0]?.message?.content;
  if (!responseText) {
    return { classification: 'OTHER', confidence: 0, reason: 'No response from AI' };
  }

  try {
    return JSON.parse(responseText) as EmailClassification;
  } catch {
    return { classification: 'OTHER', confidence: 0, reason: 'Failed to parse classification' };
  }
}

export async function generateEmailDraft(
  originalEmail: { from: string; subject: string; body: string },
  conversationHistory: Array<{ role: 'customer' | 'assistant'; content: string }>
): Promise<string> {
  const businessConfig = await getBusinessConfig();

  // Build business knowledge context
  let businessKnowledge = '';
  if (businessConfig.scrapedContent) {
    try {
      const scraped = JSON.parse(businessConfig.scrapedContent);
      if (scraped.categorized) {
        const cat = scraped.categorized;
        const diensten = cat.diensten?.map((d: { naam: string; beschrijving: string }) => `- ${d.naam}: ${d.beschrijving}`).join('\n') || '';
        businessKnowledge = `
## Kennis over het bedrijf
${cat.over_het_bedrijf || ''}

## Diensten
${diensten}

${cat.werkgebied?.length > 0 ? `## Werkgebied\n${cat.werkgebied.join(', ')}` : ''}
${cat.prijsindicaties ? `## Prijsindicaties\n${cat.prijsindicaties}` : ''}
`;
      }
    } catch { /* ignore */ }
  }

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `Je bent de e-mailassistent van ${businessConfig.businessName}. Je beantwoordt inkomende klant-emails.

${businessKnowledge}

${businessConfig.customInstructions ? `## Extra instructies van de eigenaar\n${businessConfig.customInstructions}\n` : ''}

## Jouw werkwijze

### Stap 1: Analyseer de inkomende e-mail
- Waar gaat het over? Welke dienst wordt gevraagd?
- Wat zijn de belangrijke punten om op te reageren?
- Wat kunnen we achterwege laten? (niet op elk detail reageren)

### Stap 2: Schrijf een reactie
- Bedank voor het bericht
- Reageer kort en inhoudelijk op de kern van de vraag
- Gebruik je kennis over het bedrijf om relevant te antwoorden
- Houd het beknopt en persoonlijk

### Stap 3: Check ontbrekende gegevens
De volgende gegevens zijn nodig om een goed telefoongesprek voor te bereiden:
1. **Telefoonnummer (06-nummer)** — dit is het BELANGRIJKSTE, want de vervolgstap is altijd een telefoongesprek
2. **Afmetingen van de tuin** — vraag om de lengte en breedte (in meters), zodat we de vierkante meters kunnen inschatten
3. **Foto's van de tuin** — en specifiek ook van bijzondere plekjes in de tuin
4. **Adres** — waar is de tuin?

Het e-mailadres hebben we al (want ze mailen ons).

### Stap 4: Ontbrekende gegevens opvragen
Na je inhoudelijke reactie, voeg je ÉÉN KEER een duidelijk blok toe met ontbrekende gegevens.
NIET in de lopende tekst EN apart — alleen als apart blok onderaan.

Check elk van deze vier punten en vraag ALLES wat niet expliciet in de email staat:
1. Telefoonnummer (06) — zodat we een belafspraak kunnen inplannen
2. Afmetingen van de tuin (lengte x breedte in meters) — zodat we de vierkante meters kunnen inschatten
3. Foto's van de tuin en bijzondere plekjes
4. Adres van de tuin

Formuleer het als: "Om je zo goed mogelijk te kunnen helpen, ontvang ik graag nog:" gevolgd door een korte opsomming.
Laat ALLEEN gegevens weg die de klant AL EXPLICIET in de email heeft gegeven.

### Stap 5: Vervolgstap
De vervolgstap is ALTIJD een telefoongesprek. Vermeld dat je na ontvangst van de gegevens graag telefonisch contact opneemt om de wensen te bespreken.

## Regels
${businessConfig.language === 'nl' ? '- Schrijf in het Nederlands (je/jij)' : '- Write in English'}
- Professioneel maar vriendelijk en persoonlijk
- Korte, duidelijke zinnen
- Reageer ALLEEN op e-mails gerelateerd aan het bedrijf en diensten
- Niet-relevante e-mails: stel beleefd antwoord op dat dit adres voor zakelijke aanvragen is
- Geef ALLEEN de e-mail tekst terug, geen subject line of andere metadata
- Onderteken met "Met vriendelijke groet,\n${businessConfig.ownerName || businessConfig.businessName}"`,
    },
  ];

  // Add conversation history if any
  for (const msg of conversationHistory) {
    messages.push({
      role: msg.role === 'customer' ? 'user' : 'assistant',
      content: msg.content,
    });
  }

  messages.push({
    role: 'user',
    content: `Nieuwe e-mail ontvangen:
Van: ${originalEmail.from}
Onderwerp: ${originalEmail.subject}

${originalEmail.body}

Analyseer deze email en schrijf een passende reactie volgens de werkwijze hierboven.`,
  });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages,
    temperature: 0.7,
    max_tokens: 1000,
  });

  return completion.choices[0]?.message?.content || '';
}
