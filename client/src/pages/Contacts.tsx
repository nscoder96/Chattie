import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

interface Contact {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  gardenSize: string | null;
  createdAt: string;
  conversations: Array<{
    id: string;
    channel: string;
    status: string;
    _count: { messages: number };
  }>;
}

export default function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await api.getContacts();
      setContacts(data as Contact[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="text-gray-500">Laden...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Contacten
        <span className="ml-2 text-sm font-normal text-gray-500">({contacts.length})</span>
      </h1>

      {contacts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">Nog geen contacten.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Naam</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Telefoon</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tuin</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gesprekken</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contacts.map(contact => {
                const mainConversation = contact.conversations[0];
                return (
                  <tr key={contact.id} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {mainConversation ? (
                        <Link to={`/conversations/${mainConversation.id}`} className="text-blue-600 hover:underline">
                          {contact.name || '-'}
                        </Link>
                      ) : (
                        contact.name || '-'
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{contact.phone || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{contact.email || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{contact.gardenSize || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {contact.conversations.map(c => (
                        <Link
                          key={c.id}
                          to={`/conversations/${c.id}`}
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mr-1 hover:opacity-80 ${
                            c.channel === 'WHATSAPP' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {c._count.messages} msg
                        </Link>
                      ))}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {new Date(contact.createdAt).toLocaleDateString('nl-NL')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
