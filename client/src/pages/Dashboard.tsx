import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import StatCard from '../components/StatCard';

interface Message {
  id: string;
  content: string;
  direction: 'INBOUND' | 'OUTBOUND';
  createdAt: string;
  contact: { name: string | null; phone: string | null; email: string | null };
  conversation: { id: string; channel: string };
}

interface Stats {
  totalContacts: number;
  totalConversations: number;
  pendingResponses: number;
  todayMessages: number;
  recentMessages: Message[];
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  async function loadStats() {
    try {
      const data = await api.getStats();
      setStats(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij laden');
    }
  }

  useEffect(() => {
    loadStats();
    // Refresh every 5 seconds for real-time updates
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-lg">
        <p className="font-medium">Fout</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return <div className="text-gray-500">Laden...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Contacten"
          value={stats.totalContacts}
          color="blue"
          icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
        />
        <StatCard
          label="Gesprekken"
          value={stats.totalConversations}
          color="green"
          icon="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
        <StatCard
          label="Te beoordelen"
          value={stats.pendingResponses}
          color="yellow"
          icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <StatCard
          label="Berichten vandaag"
          value={stats.todayMessages}
          color="purple"
          icon="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </div>

      {/* Recent messages feed */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Berichten vandaag</h2>
        </div>
        {stats.recentMessages && stats.recentMessages.length > 0 ? (
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {stats.recentMessages.map(msg => (
              <Link
                key={msg.id}
                to={`/conversations/${msg.conversation.id}`}
                className="block px-6 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        msg.conversation.channel === 'WHATSAPP' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {msg.conversation.channel === 'WHATSAPP' ? 'WhatsApp' : 'Email'}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        msg.direction === 'INBOUND' ? 'bg-gray-100 text-gray-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        {msg.direction === 'INBOUND' ? 'Ontvangen' : 'Verzonden'}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {msg.contact.name || msg.contact.phone || msg.contact.email || 'Onbekend'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 truncate">{msg.content}</p>
                  </div>
                  <span className="text-xs text-gray-400 ml-4 whitespace-nowrap">
                    {new Date(msg.createdAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="px-6 py-12 text-center text-gray-500">
            Nog geen berichten vandaag.
          </div>
        )}
      </div>
    </div>
  );
}
