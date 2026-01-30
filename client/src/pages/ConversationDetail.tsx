import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import MessageBubble from '../components/MessageBubble';

interface Message {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  content: string;
  createdAt: string;
}

interface ConversationData {
  id: string;
  channel: string;
  status: string;
  contact: { name?: string; phone?: string; email?: string };
  messages: Message[];
}

export default function ConversationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [conv, setConv] = useState<ConversationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  async function load() {
    try {
      const data = (await api.getConversation(id!)) as ConversationData;
      setConv(data);
    } catch (err) {
      console.error('Failed to load conversation:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function handlePause() {
    setActionLoading(true);
    try {
      await api.pauseConversation(id!);
      await load();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResume() {
    setActionLoading(true);
    try {
      await api.resumeConversation(id!);
      await load();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleFollowUp() {
    setActionLoading(true);
    try {
      await api.followUpConversation(id!);
      await load();
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <div className="text-gray-500">Laden...</div>;
  if (!conv) return <div className="text-red-500">Gesprek niet gevonden.</div>;

  const contactLabel = conv.contact.name || conv.contact.phone || conv.contact.email || 'Onbekend';

  return (
    <div className="max-w-3xl">
      <button
        onClick={() => navigate('/conversations')}
        className="text-sm text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Terug
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{contactLabel}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              conv.channel === 'WHATSAPP' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
            }`}>
              {conv.channel === 'WHATSAPP' ? 'WhatsApp' : 'Email'}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              conv.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
              conv.status === 'PAUSED' ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {conv.status}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          {conv.status === 'ACTIVE' && (
            <button
              onClick={handlePause}
              disabled={actionLoading}
              className="bg-yellow-50 hover:bg-yellow-100 text-yellow-700 text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              Pauzeren
            </button>
          )}
          {conv.status === 'PAUSED' && (
            <button
              onClick={handleResume}
              disabled={actionLoading}
              className="bg-green-50 hover:bg-green-100 text-green-700 text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              Hervatten
            </button>
          )}
          {(conv.status === 'ACTIVE' || conv.status === 'PAUSED') && (
            <button
              onClick={handleFollowUp}
              disabled={actionLoading}
              className="bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              Follow-up
            </button>
          )}
        </div>
      </div>

      <div className="bg-gray-100 rounded-xl p-4 space-y-3 min-h-[400px]">
        {conv.messages.length === 0 ? (
          <p className="text-gray-400 text-center py-8">Geen berichten.</p>
        ) : (
          conv.messages.map(msg => (
            <MessageBubble
              key={msg.id}
              content={msg.content}
              direction={msg.direction}
              createdAt={msg.createdAt}
            />
          ))
        )}
      </div>
    </div>
  );
}
