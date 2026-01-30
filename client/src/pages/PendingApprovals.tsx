import { useEffect, useState } from 'react';
import { api } from '../api/client';
import ApprovalCard from '../components/ApprovalCard';

interface PendingResponse {
  id: string;
  originalMessage: string;
  suggestedResponse: string;
  createdAt: string;
  conversation: {
    channel: string;
    contact: {
      name?: string;
      phone?: string;
      email?: string;
    };
  };
}

export default function PendingApprovals() {
  const [items, setItems] = useState<PendingResponse[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = (await api.getPending()) as PendingResponse[];
      setItems(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij laden');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  async function handleApprove(id: string, modifiedMessage?: string) {
    await api.approvePending(id, modifiedMessage);
    setItems(prev => prev.filter(item => item.id !== id));
  }

  async function handleReject(id: string) {
    await api.rejectPending(id);
    setItems(prev => prev.filter(item => item.id !== id));
  }

  if (loading) return <div className="text-gray-500">Laden...</div>;
  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-lg">
        <p className="font-medium">Fout</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Goedkeuren
        {items.length > 0 && (
          <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
            {items.length}
          </span>
        )}
      </h1>

      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-500">Alles is bijgewerkt! Geen openstaande berichten.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(item => (
            <ApprovalCard
              key={item.id}
              id={item.id}
              originalMessage={item.originalMessage}
              suggestedResponse={item.suggestedResponse}
              contact={item.conversation.contact}
              channel={item.conversation.channel}
              createdAt={item.createdAt}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}
