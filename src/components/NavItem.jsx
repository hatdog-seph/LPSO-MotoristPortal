import { ChevronRight } from 'lucide-react';

export default function NavItem({ icon, label, active, onClick }) {
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {active && <ChevronRight size={16} />}
    </button>
  );
}
