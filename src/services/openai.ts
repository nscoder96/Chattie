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
  if (scrapedData) {
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

  return `Je bent een vriendelijke en professionele assistent voor ${businessConfig.businessName}. Je helpt potentiële klanten die contact opnemen via WhatsApp of e-mail.

${businessContext}

## Jouw doel
Je moet de volgende informatie verzamelen voordat een offerte gemaakt kan worden:
${fieldsToCollect}

## Instructies
- ${tone}
- Wees efficiënt - verzamel de informatie in zo min mogelijk berichten
- Als de klant al informatie geeft, bevestig dit en vraag naar de ontbrekende informatie
- Als ze foto's sturen, bedank ze en ga door met de volgende vraag
- Zodra je alle informatie hebt, bedank de klant en zeg dat ze binnenkort een reactie ontvangen
- Beantwoord eenvoudige vragen over het bedrijf, maar leid het gesprek terug naar het verzamelen van de benodigde informatie
${businessConfig.language === 'nl' ? '- Schrijf in het Nederlands' : '- Write in English'}
${customInstructions}
${businessConfig.greetingMessage ? `\n## Eerste bericht\nAls dit het eerste bericht is van een nieuwe klant, begin dan met: "${businessConfig.greetingMessage}"\n` : ''}
${businessConfig.closingMessage ? `\n## Afsluiting\nAls alle informatie verzameld is, sluit af met: "${businessConfig.closingMessage}"\n` : ''}

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

  // Add context about what we already know
  if (context.contactName || context.contactEmail || context.gardenSize || context.hasPhotos) {
    let contextMessage = 'Reeds verzamelde informatie over deze klant:\n';
    if (context.contactName) contextMessage += `- Naam: ${context.contactName}\n`;
    if (context.contactEmail) contextMessage += `- E-mail: ${context.contactEmail}\n`;
    if (context.contactPhone) contextMessage += `- Telefoon: ${context.contactPhone}\n`;
    if (context.gardenSize) contextMessage += `- Tuinafmetingen: ${context.gardenSize}\n`;
    if (context.hasPhotos) contextMessage += `- Foto's: Ontvangen\n`;
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

export async function generateEmailDraft(
  originalEmail: { from: string; subject: string; body: string },
  conversationHistory: Array<{ role: 'customer' | 'assistant'; content: string }>
): Promise<string> {
  const businessConfig = await getBusinessConfig();

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `Je bent een assistent voor ${businessConfig.businessName} die helpt met het beantwoorden van e-mails.

${businessConfig.businessDescription ? `Over het bedrijf: ${businessConfig.businessDescription}` : ''}

Schrijf een professionele maar vriendelijke e-mail reactie.
${businessConfig.language === 'nl' ? '- Schrijf in het Nederlands (je/jij tenzij anders aangegeven)' : '- Write in English'}
- Korte, duidelijke zinnen
- Vraag om de benodigde informatie als die ontbreekt

${businessConfig.customInstructions ? `Extra instructies: ${businessConfig.customInstructions}` : ''}

Geef ALLEEN de e-mail tekst terug, geen subject line of andere metadata.`,
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

Schrijf een passende reactie.`,
  });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages,
    temperature: 0.7,
    max_tokens: 1000,
  });

  return completion.choices[0]?.message?.content || '';
}
