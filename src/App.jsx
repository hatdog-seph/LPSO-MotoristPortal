import { Routes, Route, Navigate } from 'react-router-dom';
import { CitationProvider } from './context/CitationContext';
import Login from './pages/Login';
import Portal from './pages/Portal';
import ScanEntry from './pages/ScanEntry';
import LockedModal from './components/LockedModal';

export default function App() {
  return (
    <CitationProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/t/:ticketNumber" element={<ScanEntry />} />
        <Route path="/portal/*" element={<Portal />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <LockedModal />
    </CitationProvider>
  );
}