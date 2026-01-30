import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import PendingApprovals from './pages/PendingApprovals';
import Conversations from './pages/Conversations';
import ConversationDetail from './pages/ConversationDetail';
import Settings from './pages/Settings';
import Contacts from './pages/Contacts';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/pending" element={<PendingApprovals />} />
        <Route path="/conversations" element={<Conversations />} />
        <Route path="/conversations/:id" element={<ConversationDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
