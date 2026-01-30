import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

interface Conversation {
  id: string;
  channel: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage: { content: string; direction: string; createdAt: string } | null;
  contact: { name?: string; phone?: string; email?: string };
}

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  PAUSED: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-gray-100 text-gray-800',
  ARCHIVED: 'bg-gray-100 text-gray-500',
};

export default function Conversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filter, setFilter] = useState({ status: '', channel: '' });
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const params: Record<string, string> = {};
      if (filter.status) params.status = filter.status;
      if (filter.channel) params.channel = filter.channel;
      const data = (await api.getConversations(params)) as Conversation[];
      setConversations(data);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Refresh every 5 seconds for real-time updates
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [filter.status, filter.channel]);

  if (loading) return <div className="text-gray-500">Laden...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Gesprekken</h1>

      <div className="flex gap-3 mb-4">
        <select
          value={filter.status}
          onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Alle statussen</option>
          <option value="ACTIVE">Actief</option>
          <option value="PAUSED">Gepauzeerd</option>
          <option value="COMPLETED">Afgerond</option>
        </select>
        <select
          value={filter.channel}
          onChange={e => setFilter(f => ({ ...f, channel: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Alle kanalen</option>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="EMAIL">Email</option>
        </select>
      </div>

      {conversations.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">Geen gesprekken gevonden.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {conversations.map(conv => (
            <Link
              key={conv.id}
              to={`/conversations/${conv.id}`}
              className="block p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium text-gray-900">
                      {conv.contact.name || conv.contact.phone || conv.contact.email || 'Onbekend'}
                    </p>
                    <p className="text-sm text-gray-500 truncate max-w-md">
                      {conv.lastMessage?.content || 'Geen berichten'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    conv.channel === 'WHATSAPP' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {conv.channel === 'WHATSAPP' ? 'WhatsApp' : 'Email'}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColors[conv.status] || ''}`}>
                    {conv.status}
                  </span>
                  <span className="text-xs text-gray-400">
                    {conv.messageCount} berichten
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(conv.updatedAt).toLocaleDateString('nl-NL')}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
