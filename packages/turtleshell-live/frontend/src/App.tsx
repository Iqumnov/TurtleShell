import React, { useEffect } from 'react';
import Lenis from 'lenis';
import { useSimStore } from './store/useSimStore';
import { KameChan } from './components/KameChan';
import { ControlPanel } from './components/ControlPanel';
import { Chip3DViewer } from './components/Chip3DViewer';
import { BlochSphereArray } from './components/BlochSphereArray';
import { MetricsPanel } from './components/MetricsPanel';
import { EventLogPanel } from './components/EventLogPanel';
import { CircuitHighlighter } from './components/CircuitHighlighter';
import { CorrelationMatrix } from './components/CorrelationMatrix';
import { EconomyPanel } from './components/EconomyPanel';
import { AcademicPanel } from './components/AcademicPanel';
import { PlatformBackground } from './components/PlatformBackground';

export const App: React.FC = () => {
  const theme = useSimStore((s) => s.theme);
  const lang = useSimStore((s) => s.language);
  const connectWS = useSimStore((s) => s.connectWS);
  const disconnectWS = useSimStore((s) => s.disconnectWS);
  const toggleTheme = useSimStore((s) => s.toggleTheme);
  const setLanguage = useSimStore((s) => s.setLanguage);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang === 'RU' ? 'ru' : 'en';
  }, [lang]);

  useEffect(() => {
    const prefersReducedMotion = Boolean(
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
    if (prefersReducedMotion) return;

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });

    let rafId = 0;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }

    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  useEffect(() => {
    connectWS();
    return () => {
      disconnectWS();
    };
  }, [connectWS, disconnectWS]);

  return (
    <div className="min-h-screen p-3 flex flex-col md:flex-row gap-4 antialiased text-[var(--text-main)] transition-colors duration-200 relative overflow-x-hidden">
      <PlatformBackground />
      
      {/* Left Toolbar Column (Fixed Width ~310px) */}
      <aside className="w-full md:w-[310px] flex-shrink-0 flex flex-col gap-3">
        
        {/* Header with compact ASCII turtle, Title, Theme & Language toggles */}
        <header
          className="hud-panel p-2.5 flex items-center justify-between gap-1 overflow-hidden select-text border border-[var(--border-color)] bg-[var(--panel-bg)] text-[var(--text-main)]"
        >
          <div className="flex items-center gap-2 min-w-0">
            <pre className="font-mono text-[9px] font-bold leading-none select-none text-[var(--text-main)] flex-shrink-0">
{`(o,o)
/---\\
 " "`}</pre>
            <h1 className="text-sm font-bold tracking-wider uppercase font-mono text-[var(--text-main)] truncate">
              TurtleShell
            </h1>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={toggleTheme}
              className="hud-button text-xs p-1 bg-[var(--bg-color)] text-[var(--text-main)] border border-[var(--text-main)]"
              title={lang === 'RU' ? 'Переключить тему' : 'Toggle Theme'}
            >
              {theme === 'dark' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-main)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-main)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
            <button
              onClick={() => setLanguage(lang === 'EN' ? 'RU' : 'EN')}
              className="hud-button text-xs px-1.5 py-0.5 font-bold bg-[var(--bg-color)] text-[var(--text-main)] border border-[var(--text-main)]"
              title={lang === 'RU' ? 'Сменить язык' : 'Switch Language'}
            >
              {lang}
            </button>
          </div>
        </header>

        {/* KameChan Assistant Box */}
        <KameChan />

        {/* Control Panel */}
        <ControlPanel />
      </aside>

      {/* Right Main Dashboard Workspace */}
      <main className="flex-1 min-w-0 flex flex-col gap-3">
        
        {/* Top Row: QPU Chip Diagnostics (Left) & Bloch Spheres (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          <Chip3DViewer />
          <BlochSphereArray />
        </div>

        {/* Row 2: 3-Column Telemetry Charts Row */}
        <MetricsPanel />

        {/* Row 3: 3-Column Row: Event Log (3) | Circuit Audit (4) | Correlation Matrix (5) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
          <div className="lg:col-span-3 flex flex-col">
            <EventLogPanel />
          </div>
          <div className="lg:col-span-4 flex flex-col">
            <CircuitHighlighter />
          </div>
          <div className="lg:col-span-5 flex flex-col">
            <CorrelationMatrix />
          </div>
        </div>

        {/* Row 4: Economy Panel & Academic Specification */}
        <EconomyPanel />
        <AcademicPanel />

      </main>

    </div>
  );
};

export default App;
