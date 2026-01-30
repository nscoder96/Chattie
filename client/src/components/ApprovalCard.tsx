import { useState } from 'react';

interface ApprovalCardProps {
  id: string;
  originalMessage: string;
  suggestedResponse: string;
  contact: { name?: string; phone?: string; email?: string };
  channel: string;
  createdAt: string;
  onApprove: (id: string, modifiedMessage?: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}

export default function ApprovalCard({
  id,
  originalMessage,
  suggestedResponse,
  contact,
  channel,
  createdAt,
  onApprove,
  onReject,
}: ApprovalCardProps) {
  const [editedMessage, setEditedMessage] = useState(suggestedResponse);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  const isModified = editedMessage !== suggestedResponse;

  async function handleApprove() {
    setLoading(true);
    try {
      await onApprove(id, isModified ? editedMessage : undefined);
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    setLoading(true);
    try {
      await onReject(id);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-gray-900">
            {contact.name || contact.phone || contact.email || 'Onbekend'}
          </span>
          <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            channel === 'WHATSAPP' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
          }`}>
            {channel === 'WHATSAPP' ? 'WhatsApp' : 'Email'}
          </span>
        </div>
        <span className="text-xs text-gray-400">
          {new Date(createdAt).toLocaleString('nl-NL')}
        </span>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase mb-1">Bericht van klant</p>
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">
            {originalMessage}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium text-gray-500 uppercase">Voorgesteld antwoord</p>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              {isEditing ? 'Klaar' : 'Bewerken'}
            </button>
          </div>
          {isEditing ? (
            <textarea
              value={editedMessage}
              onChange={e => setEditedMessage(e.target.value)}
              className="w-full bg-blue-50 rounded-lg p-3 text-sm text-gray-700 border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
            />
          ) : (
            <div className={`rounded-lg p-3 text-sm whitespace-pre-wrap ${
              isModified ? 'bg-yellow-50 text-gray-700 border border-yellow-200' : 'bg-blue-50 text-gray-700'
            }`}>
              {editedMessage}
            </div>
          )}
          {isModified && !isEditing && (
            <p className="text-xs text-yellow-600 mt-1">Aangepast</p>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-gray-100 flex gap-3">
        <button
          onClick={handleApprove}
          disabled={loading}
          className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
        >
          {isModified ? 'Aangepast versturen' : 'Goedkeuren & versturen'}
        </button>
        <button
          onClick={handleReject}
          disabled={loading}
          className="bg-red-50 hover:bg-red-100 disabled:bg-gray-100 text-red-700 text-sm font-medium py-2 px-4 rounded-lg transition-colors"
        >
          Afwijzen
        </button>
      </div>
    </div>
  );
}
