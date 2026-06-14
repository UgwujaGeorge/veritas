import { Link, Route, Routes } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import NetworkSelector from './components/NetworkSelector';
import WalletConnect from './components/WalletConnect';
import { NetworkProvider } from './lib/network';
import { WalletProvider } from './lib/wallet';
import CreateGrant from './pages/CreateGrant';
import GrantDetail from './pages/GrantDetail';
import Home from './pages/Home';
import Verdict from './pages/Verdict';

export default function App() {
  return (
    <NetworkProvider>
      <WalletProvider>
        <div className="app-shell">
          <header className="topbar">
            <Link className="brand" to="/">
              <ShieldCheck size={26} aria-hidden="true" />
              <span>Veritas</span>
            </Link>
            <nav className="topbar-actions">
              <NetworkSelector />
              <Link className="nav-link" to="/create">
                Create Grant
              </Link>
              <WalletConnect />
            </nav>
          </header>
          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/create" element={<CreateGrant />} />
              <Route path="/grant/:id" element={<GrantDetail />} />
              <Route path="/grant/:id/milestone/:milestoneIndex/verdict" element={<Verdict />} />
            </Routes>
          </main>
        </div>
      </WalletProvider>
    </NetworkProvider>
  );
}
