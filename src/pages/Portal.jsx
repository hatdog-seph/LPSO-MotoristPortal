import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Bell, CheckCircle2, CircleHelp, Clock3, FileText, Gavel, Home, LogOut, Menu, ShieldAlert, ShieldCheck, WalletCards, X } from 'lucide-react';
import lpsoLogo from '../data/images/lpso_logo.png';
import { useCitation } from '../context/CitationContext';


const NOTIF_SEEN_KEY = 'motoristNotifSeen';
import NavItem from '../components/NavItem';
import PaymentModal from '../components/PaymentModal';
import Overview from './Overview';
import CitationPage from './CitationPage';
import PaymentPage from './PaymentPage';
import HelpPage from './HelpPage';
import ReportEnforcer from './ReportEnforcer';
import ViolationFinder from './ViolationFinder';

export default function Portal() {
  const nav = useNavigate();
  const { citation, isAuthenticated, loading, logout: endSession } = useCitation();
  const [menu, setMenu] = useState(false);
  const [page, setPage] = useState('overview');
  const pageRef = useRef('overview');
  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  const [showPay, setShowPay] = useState(false);
  const [submitted, setSubmitted] = useState(null); // null | 'paid'
  const [notifOpen, setNotifOpen] = useState(false);
  const [seenNotifId, setSeenNotifId] = useState(() => localStorage.getItem(NOTIF_SEEN_KEY));

  
  const notification = useMemo(() => {
    if (!citation) return null;
    if (citation.status === 'Settled') {
      return {
        id: `${citation.ticket}-settled`,
        title: 'Payment confirmed',
        message: `Your QR Ph payment for ${citation.ticket} was verified by PayMongo. This citation is now Settled.`,
        tone: 'success',
      };
    }
    return {
      id: `${citation.ticket}-pending`,
      title: 'Payment pending',
      message: `Citation ${citation.ticket} has an outstanding balance of ₱${citation.total.toLocaleString()}.`,
      tone: 'pending',
    };
  }, [citation]);

  const hasUnread = !!notification && notification.id !== seenNotifId;

  const toggleNotif = () => {
    setNotifOpen((open) => !open);
    if (notification) {
      localStorage.setItem(NOTIF_SEEN_KEY, notification.id);
      setSeenNotifId(notification.id);
    }
  };

 
  useEffect(() => {
    if (citation?.status === 'Settled') {
      setSubmitted((prev) => (prev === null ? 'paid' : prev));
    }
  }, [citation?.status]);


  useEffect(() => {
    const onPopState = () => {
      setPage('overview');
      setMenu(false);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

 
  const navigateTo = (p) => {
    setMenu(false);
    if (p === pageRef.current) return;
    if (p === 'overview') {
    
      window.history.back();
    } else {
      if (pageRef.current === 'overview') {
        window.history.pushState({ portalPage: p }, '');
      }
      setPage(p);
    }
  };

  if (loading) {
    return (
      <div className="portal-loading">
        <div className="spinner" />
        <p>Loading your citation…</p>
      </div>
    );
  }

  if (!isAuthenticated || !citation) return <Navigate to="/login" replace />;

  const logout = () => {
    endSession();
    nav('/login', { replace: true });
  };

  return (
    <div className="portal">
      <header className="topbar">
        <div className="top-left">
          <button className="menu-btn" onClick={() => setMenu(!menu)}>
            <Menu />
          </button>
          <div className="brand">
            <div className="crest small logo-crest">
              <img src={lpsoLogo} alt="LPSO logo" />
            </div>
            <div>
              <b>eTicket</b>
              <span>Motorist Portal</span>
            </div>
          </div>
        </div>
        <div className="top-right">
          <div className="ticket-chip">
            <span>Ticket</span>
            <b>{citation.ticket}</b>
          </div>
          <div className="notif-wrap">
            <button className="icon-btn" onClick={toggleNotif} aria-label="Notifications">
              <Bell size={19} />
              {hasUnread && <i />}
            </button>
            {notifOpen && (
              <>
                <button className="notif-backdrop" aria-label="Close notifications" onClick={() => setNotifOpen(false)} />
                <div className="notif-panel">
                  <div className="notif-panel-head">Notifications</div>
                  {notification ? (
                    <div className={`notif-item ${notification.tone}`}>
                      <div className="notif-icon">
                        {notification.tone === 'success' ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}
                      </div>
                      <div>
                        <b>{notification.title}</b>
                        <p>{notification.message}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="notif-empty">You're all caught up.</div>
                  )}
                </div>
              </>
            )}
          </div>
          <button className="logout" onClick={logout}>
            <LogOut size={17} /> <span>Sign out</span>
          </button>
        </div>
      </header>

      {menu && <button className="drawer-backdrop" aria-label="Close menu" onClick={() => setMenu(false)} />}

      <div className={`side ${menu ? 'open' : ''}`}>
        <div className="side-head">
          <span>MENU</span>
          <button onClick={() => setMenu(false)}>
            <X />
          </button>
        </div>
        <NavItem icon={<Home />} label="Overview" active={page === 'overview'} onClick={() => navigateTo('overview')} />
        <NavItem icon={<FileText />} label="My Citation" active={page === 'citation'} onClick={() => navigateTo('citation')} />
        <NavItem icon={<WalletCards />} label="Payment" active={page === 'payment'} onClick={() => navigateTo('payment')} />
        <NavItem icon={<Gavel />} label="Violation Finder" active={page === 'violations'} onClick={() => navigateTo('violations')} />
        <NavItem icon={<ShieldAlert />} label="Report Enforcer" active={page === 'report'} onClick={() => navigateTo('report')} />
        <div className="side-sep" />
        <NavItem icon={<CircleHelp />} label="Help & Information" active={page === 'help'} onClick={() => navigateTo('help')} />
        <div className="side-note">
          <ShieldCheck size={18} />
          <div>
            <b>Private access</b>
            <p>This portal only displays the citation connected to your QR/ticket.</p>
          </div>
        </div>
      </div>

      <main className="content">
        {page === 'overview' && <Overview setPage={navigateTo} setShowPay={setShowPay} />}
        {page === 'citation' && <CitationPage setPage={navigateTo} setShowPay={setShowPay} />}
        {page === 'payment' && <PaymentPage submitted={submitted} setShowPay={setShowPay} />}
        {page === 'violations' && <ViolationFinder />}
        {page === 'report' && <ReportEnforcer />}
        {page === 'help' && <HelpPage />}
      </main>

      {showPay && (
        <PaymentModal
          onClose={() => setShowPay(false)}
          onPaid={() => {
            setSubmitted('paid');
            setShowPay(false);
            navigateTo('payment');
          }}
        />
      )}
    </div>
  );
}
