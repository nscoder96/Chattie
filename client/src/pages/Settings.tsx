import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface Config {
  businessName: string;
  businessDescription: string | null;
  websiteUrl: string | null;
  ownerName: string | null;
  ownerEmail: string;
  ownerPhone: string | null;
  customInstructions: string | null;
  tone: string | null;
  language: string;
  collectFields: string;
  responseMode: string;
  greetingMessage: string | null;
  closingMessage: string | null;
  scrapedContent: string | null;
  scrapedAt: string | null;
}

interface Dienst {
  naam: string;
  beschrijving: string;
}

interface CategorizedContent {
  diensten: Dienst[];
  prijsindicaties: string | null;
  werkgebied: string[];
  veelgestelde_vragen: Array<{ vraag: string; antwoord: string }>;
  over_het_bedrijf: string;
  contactinfo: { adres?: string; telefoon?: string; email?: string; openingstijden?: string };
  projecten: string[];
}

const COMMON_FIELDS: { key: string; label: string }[] = [
  { key: 'name', label: 'Naam' },
  { key: 'email', label: 'E-mail' },
  { key: 'phone', label: 'Telefoon' },
  { key: 'address', label: 'Adres' },
  { key: 'gardenSize', label: 'Tuinafmetingen' },
  { key: 'photos', label: "Foto's" },
  { key: 'budget', label: 'Budget' },
  { key: 'preferredDate', label: 'Voorkeursdatum' },
];

export default function Settings() {
  const [config, setConfig] = useState<Config | null>(null);
  const [collectFields, setCollectFields] = useState<string[]>([]);
  const [customFieldInput, setCustomFieldInput] = useState('');
  const [categorized, setCategorized] = useState<CategorizedContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function load() {
    try {
      const data = (await api.getConfig()) as Config;
      setConfig(data);
      try {
        setCollectFields(JSON.parse(data.collectFields));
      } catch {
        setCollectFields(['name', 'email', 'phone']);
      }
      if (data.websiteUrl) setScrapeUrl(data.websiteUrl);
      if (data.scrapedContent) {
        try {
          const scraped = JSON.parse(data.scrapedContent);
          if (scraped.categorized) {
            setCategorized(scraped.categorized);
          }
        } catch { /* ignore parse errors */ }
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.updateConfig({
        businessName: config.businessName,
        businessDescription: config.businessDescription,
        websiteUrl: config.websiteUrl,
        ownerName: config.ownerName,
        ownerEmail: config.ownerEmail,
        ownerPhone: config.ownerPhone,
        customInstructions: config.customInstructions,
        tone: config.tone,
        language: config.language,
        collectFields,
        responseMode: config.responseMode,
        greetingMessage: config.greetingMessage,
        closingMessage: config.closingMessage,
      });
      setMessage({ type: 'success', text: 'Instellingen opgeslagen!' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Fout bij opslaan' });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveContent() {
    if (!categorized) return;
    setSavingContent(true);
    setMessage(null);
    try {
      await api.updateScrapedContent({ categorized });
      setMessage({ type: 'success', text: 'Bedrijfsinformatie opgeslagen!' });
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Fout bij opslaan' });
    } finally {
      setSavingContent(false);
    }
  }

  async function handleScrape() {
    if (!scrapeUrl) return;
    setScraping(true);
    setMessage(null);
    try {
      await api.scrapeWebsite(scrapeUrl);
      setMessage({ type: 'success', text: 'Website succesvol gescraped!' });
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Fout bij scrapen' });
    } finally {
      setScraping(false);
    }
  }

  function updateField(field: keyof Config, value: string | null) {
    setConfig(prev => prev ? { ...prev, [field]: value } : prev);
  }

  // Helpers for editing categorized content
  function updateDienst(index: number, field: keyof Dienst, value: string) {
    setCategorized(prev => {
      if (!prev) return prev;
      const diensten = [...prev.diensten];
      diensten[index] = { ...diensten[index], [field]: value };
      return { ...prev, diensten };
    });
  }

  function removeDienst(index: number) {
    setCategorized(prev => {
      if (!prev) return prev;
      return { ...prev, diensten: prev.diensten.filter((_, i) => i !== index) };
    });
  }

  function addDienst() {
    setCategorized(prev => {
      if (!prev) return prev;
      return { ...prev, diensten: [...prev.diensten, { naam: '', beschrijving: '' }] };
    });
  }

  function updateWerkgebied(value: string) {
    setCategorized(prev => {
      if (!prev) return prev;
      return { ...prev, werkgebied: value.split(',').map(s => s.trim()).filter(Boolean) };
    });
  }

  function updateFAQ(index: number, field: 'vraag' | 'antwoord', value: string) {
    setCategorized(prev => {
      if (!prev) return prev;
      const faq = [...prev.veelgestelde_vragen];
      faq[index] = { ...faq[index], [field]: value };
      return { ...prev, veelgestelde_vragen: faq };
    });
  }

  function removeFAQ(index: number) {
    setCategorized(prev => {
      if (!prev) return prev;
      return { ...prev, veelgestelde_vragen: prev.veelgestelde_vragen.filter((_, i) => i !== index) };
    });
  }

  function addFAQ() {
    setCategorized(prev => {
      if (!prev) return prev;
      return { ...prev, veelgestelde_vragen: [...prev.veelgestelde_vragen, { vraag: '', antwoord: '' }] };
    });
  }

  if (loading) return <div className="text-gray-500">Laden...</div>;
  if (!config) return <div className="text-red-500">Kan instellingen niet laden.</div>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Instellingen</h1>

      {message && (
        <div className={`mb-4 p-4 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Bedrijfsgegevens</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bedrijfsnaam</label>
            <input
              type="text"
              value={config.businessName}
              onChange={e => updateField('businessName', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beschrijving</label>
            <textarea
              value={config.businessDescription || ''}
              onChange={e => updateField('businessDescription', e.target.value || null)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Eigenaar naam</label>
              <input
                type="text"
                value={config.ownerName || ''}
                onChange={e => updateField('ownerName', e.target.value || null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Eigenaar email</label>
              <input
                type="email"
                value={config.ownerEmail}
                onChange={e => updateField('ownerEmail', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Eigenaar telefoon</label>
            <input
              type="text"
              value={config.ownerPhone || ''}
              onChange={e => updateField('ownerPhone', e.target.value || null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Website scrapen</h2>
          <div className="flex gap-3">
            <input
              type="url"
              value={scrapeUrl}
              onChange={e => setScrapeUrl(e.target.value)}
              placeholder="https://www.voorbeeld.nl"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={handleScrape}
              disabled={scraping || !scrapeUrl}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {scraping ? 'Bezig...' : 'Scrapen'}
            </button>
          </div>
          {config.scrapedAt && (
            <p className="text-xs text-gray-400">
              Laatst gescraped: {new Date(config.scrapedAt).toLocaleString('nl-NL')}
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">AI-instellingen</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Toon</label>
              <select
                value={config.tone || 'friendly'}
                onChange={e => updateField('tone', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="friendly">Vriendelijk</option>
                <option value="professional">Professioneel</option>
                <option value="casual">Informeel</option>
                <option value="formal">Formeel</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Taal</label>
              <select
                value={config.language}
                onChange={e => updateField('language', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="nl">Nederlands</option>
                <option value="en">Engels</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Modus</label>
            <select
              value={config.responseMode}
              onChange={e => updateField('responseMode', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="approval">Goedkeuring vereist</option>
              <option value="auto">Automatisch versturen</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Extra instructies</label>
            <textarea
              value={config.customInstructions || ''}
              onChange={e => updateField('customInstructions', e.target.value || null)}
              rows={4}
              placeholder="Specifieke instructies voor de AI..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Te verzamelen velden</label>
            <p className="text-xs text-gray-400 mb-3">Selecteer welke gegevens de AI bij klanten moet verzamelen.</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {COMMON_FIELDS.map(field => {
                const active = collectFields.includes(field.key);
                return (
                  <button
                    key={field.key}
                    type="button"
                    onClick={() => setCollectFields(prev =>
                      active ? prev.filter(f => f !== field.key) : [...prev, field.key]
                    )}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      active
                        ? 'bg-blue-100 text-blue-700 border border-blue-300'
                        : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    {active && <span className="mr-1">&#10003;</span>}
                    {field.label}
                  </button>
                );
              })}
              {/* Custom fields that aren't in COMMON_FIELDS */}
              {collectFields
                .filter(f => !COMMON_FIELDS.some(cf => cf.key === f))
                .map(field => (
                  <button
                    key={field}
                    type="button"
                    onClick={() => setCollectFields(prev => prev.filter(f => f !== field))}
                    className="px-3 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-700 border border-blue-300 transition-colors"
                  >
                    <span className="mr-1">&#10003;</span>
                    {field}
                    <span className="ml-1 text-blue-400">&times;</span>
                  </button>
                ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customFieldInput}
                onChange={e => setCustomFieldInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = customFieldInput.trim();
                    if (val && !collectFields.includes(val)) {
                      setCollectFields(prev => [...prev, val]);
                      setCustomFieldInput('');
                    }
                  }
                }}
                placeholder="Eigen veld toevoegen..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => {
                  const val = customFieldInput.trim();
                  if (val && !collectFields.includes(val)) {
                    setCollectFields(prev => [...prev, val]);
                    setCustomFieldInput('');
                  }
                }}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium px-3"
              >
                Toevoegen
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Berichten</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Begroeting</label>
            <textarea
              value={config.greetingMessage || ''}
              onChange={e => updateField('greetingMessage', e.target.value || null)}
              rows={2}
              placeholder="Eerste bericht aan nieuwe klanten..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Afsluiting</label>
            <textarea
              value={config.closingMessage || ''}
              onChange={e => updateField('closingMessage', e.target.value || null)}
              rows={2}
              placeholder="Bericht wanneer alle info verzameld is..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium py-3 px-4 rounded-lg transition-colors"
        >
          {saving ? 'Opslaan...' : 'Instellingen opslaan'}
        </button>
      </form>

      {/* Scraped Business Information - editable */}
      {categorized && (
        <div className="mt-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Bedrijfsinformatie (van website)</h2>
            <button
              type="button"
              onClick={handleSaveContent}
              disabled={savingContent}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {savingContent ? 'Opslaan...' : 'Wijzigingen opslaan'}
            </button>
          </div>
          <p className="text-sm text-gray-500 -mt-4">
            Deze informatie is automatisch van de website gehaald. Pas aan wat de AI moet weten.
          </p>

          {/* Over het bedrijf */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Over het bedrijf</h3>
            <textarea
              value={categorized.over_het_bedrijf}
              onChange={e => setCategorized(prev => prev ? { ...prev, over_het_bedrijf: e.target.value } : prev)}
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Diensten */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Diensten</h3>
              <button
                type="button"
                onClick={addDienst}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                + Dienst toevoegen
              </button>
            </div>
            {categorized.diensten.map((dienst, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={dienst.naam}
                    onChange={e => updateDienst(i, 'naam', e.target.value)}
                    placeholder="Naam dienst"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeDienst(i)}
                    className="text-red-400 hover:text-red-600 p-1"
                    title="Verwijderen"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <textarea
                  value={dienst.beschrijving}
                  onChange={e => updateDienst(i, 'beschrijving', e.target.value)}
                  placeholder="Beschrijving"
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>

          {/* Werkgebied */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Werkgebied</h3>
            <input
              type="text"
              value={categorized.werkgebied.join(', ')}
              onChange={e => updateWerkgebied(e.target.value)}
              placeholder="Regio's gescheiden door komma's"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400">Scheid regio's met komma's</p>
          </div>

          {/* Prijsindicaties */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Prijsindicaties</h3>
            <textarea
              value={categorized.prijsindicaties || ''}
              onChange={e => setCategorized(prev => prev ? { ...prev, prijsindicaties: e.target.value || null } : prev)}
              rows={3}
              placeholder="Informatie over prijzen die de AI mag delen..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Veelgestelde vragen */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Veelgestelde vragen</h3>
              <button
                type="button"
                onClick={addFAQ}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                + Vraag toevoegen
              </button>
            </div>
            {categorized.veelgestelde_vragen.length === 0 && (
              <p className="text-sm text-gray-400">Nog geen veelgestelde vragen. Voeg ze toe zodat de AI betere antwoorden kan geven.</p>
            )}
            {categorized.veelgestelde_vragen.map((faq, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={faq.vraag}
                    onChange={e => updateFAQ(i, 'vraag', e.target.value)}
                    placeholder="Vraag"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeFAQ(i)}
                    className="text-red-400 hover:text-red-600 p-1"
                    title="Verwijderen"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <textarea
                  value={faq.antwoord}
                  onChange={e => updateFAQ(i, 'antwoord', e.target.value)}
                  placeholder="Antwoord"
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>

          {/* Contactinfo */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Contactinformatie</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Telefoon</label>
                <input
                  type="text"
                  value={categorized.contactinfo.telefoon || ''}
                  onChange={e => setCategorized(prev => prev ? { ...prev, contactinfo: { ...prev.contactinfo, telefoon: e.target.value || undefined } } : prev)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input
                  type="text"
                  value={categorized.contactinfo.email || ''}
                  onChange={e => setCategorized(prev => prev ? { ...prev, contactinfo: { ...prev.contactinfo, email: e.target.value || undefined } } : prev)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Adres</label>
                <input
                  type="text"
                  value={categorized.contactinfo.adres || ''}
                  onChange={e => setCategorized(prev => prev ? { ...prev, contactinfo: { ...prev.contactinfo, adres: e.target.value || undefined } } : prev)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Openingstijden</label>
                <input
                  type="text"
                  value={categorized.contactinfo.openingstijden || ''}
                  onChange={e => setCategorized(prev => prev ? { ...prev, contactinfo: { ...prev.contactinfo, openingstijden: e.target.value || undefined } } : prev)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Projecten */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Projecten / Referenties</h3>
            <textarea
              value={categorized.projecten.join('\n')}
              onChange={e => setCategorized(prev => prev ? { ...prev, projecten: e.target.value.split('\n').filter(Boolean) } : prev)}
              rows={4}
              placeholder="Eén project per regel..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400">Eén project per regel</p>
          </div>

          <button
            type="button"
            onClick={handleSaveContent}
            disabled={savingContent}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            {savingContent ? 'Opslaan...' : 'Bedrijfsinformatie opslaan'}
          </button>
        </div>
      )}
    </div>
  );
}
