const BASE = '/admin';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // Stats
  getStats: () => request<{
    totalContacts: number;
    totalConversations: number;
    pendingResponses: number;
    todayMessages: number;
  }>('/stats'),

  // Config
  getConfig: () => request<unknown>('/config'),
  updateConfig: (data: Record<string, unknown>) =>
    request('/config', { method: 'PUT', body: JSON.stringify(data) }),

  // Scrape
  scrapeWebsite: (url: string) =>
    request('/scrape', { method: 'POST', body: JSON.stringify({ url }) }),
  updateScrapedContent: (data: Record<string, unknown>) =>
    request('/scraped-content', { method: 'PUT', body: JSON.stringify(data) }),

  // Conversations
  getConversations: (params?: { status?: string; channel?: string }) => {
    const search = new URLSearchParams();
    if (params?.status) search.set('status', params.status);
    if (params?.channel) search.set('channel', params.channel);
    const qs = search.toString();
    return request<unknown[]>(`/conversations${qs ? `?${qs}` : ''}`);
  },
  getConversation: (id: string) => request<unknown>(`/conversations/${id}`),
  pauseConversation: (id: string) =>
    request(`/conversations/${id}/pause`, { method: 'POST' }),
  resumeConversation: (id: string) =>
    request(`/conversations/${id}/resume`, { method: 'POST' }),
  followUpConversation: (id: string) =>
    request(`/conversations/${id}/follow-up`, { method: 'POST' }),

  // Pending
  getPending: () => request<unknown[]>('/pending'),
  approvePending: (id: string, modifiedMessage?: string) =>
    request(`/pending/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ modifiedMessage }),
    }),
  rejectPending: (id: string) =>
    request(`/pending/${id}/reject`, { method: 'POST' }),

  // Contacts
  getContacts: () => request<unknown[]>('/contacts'),

  // Send message
  sendMessage: (phone: string, message: string) =>
    request('/send', { method: 'POST', body: JSON.stringify({ phone, message }) }),
};
