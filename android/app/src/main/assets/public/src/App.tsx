import { useState, useCallback, useEffect, Component } from "react";
import type { ReactNode } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { MessageSquare, Code2, Settings, RefreshCw, AlertTriangle, Wrench, Database } from "lucide-react";
import { ChatPage } from "@/pages/ChatPage";
import { PlaygroundPage } from "@/pages/PlaygroundPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { DevToolsPage } from "@/pages/DevToolsPage";
import { DatabasePage } from "@/pages/DatabasePage";
import { loadKeySlots, loadActiveSlot, saveKeySlots, saveActiveSlot } from "@/lib/storage";
import type { KeySlot } from "@/lib/storage";

// Pré-carrega tokens salvos pelo Saulo (não apagar)
(function seedDefaults() {
  if (!localStorage.getItem("eas_token")) {
    localStorage.setItem("eas_token", "ooQzIV1OjhokLnwJhrEbZatGC6liIM4MPR27h3eg");
  }
})();

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() {
    if (this.state.error) return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center bg-[#0f0f0f]">
        <AlertTriangle size={40} className="text-red-400" />
        <p className="text-white/70 text-sm font-semibold">Erro ao carregar o Playground</p>
        <p className="text-white/30 text-xs font-mono break-all">{this.state.error}</p>
        <button onClick={() => { this.setState({ error: null }); window.location.reload(); }}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-500">
          <RefreshCw size={14} /> Recarregar
        </button>
      </div>
    );
    return this.props.children;
  }
}

type Page = "chat" | "playground" | "devtools" | "database" | "settings";

function MainApp() {
  const [page, setPage] = useState<Page>("chat");
  const [slots, setSlots] = useState<KeySlot[]>(() => loadKeySlots());
  const [activeSlot, setActiveSlot] = useState<number>(() => loadActiveSlot());
  const [pendingPlayground, setPendingPlayground] = useState(false);

  const handleSaveSlots = useCallback((updated: KeySlot[]) => {
    setSlots(updated); saveKeySlots(updated);
  }, []);

  const handleSetActiveSlot = useCallback((idx: number) => {
    setActiveSlot(idx); saveActiveSlot(idx);
  }, []);

  // Listen for "send code to playground" events from MessageBubble
  useEffect(() => {
    const handler = () => {
      setPendingPlayground(true);
      setPage("playground");
    };
    window.addEventListener("chat:to-playground", handler);
    return () => window.removeEventListener("chat:to-playground", handler);
  }, []);

  const handlePlaygroundImportDone = useCallback(() => {
    setPendingPlayground(false);
  }, []);

  return (
    <div className="flex flex-col w-screen overflow-hidden bg-[#0f0f0f] text-white" style={{ height: "100dvh" }}>

      {/* ── Top navigation ─────────────────────────────────────────────────── */}
      <nav className="shrink-0 flex border-b border-white/10 bg-[#0d1520] relative">
        {([
          { id: "chat", icon: MessageSquare, label: "Chat" },
          { id: "playground", icon: Code2, label: "Editor" },
          { id: "devtools", icon: Wrench, label: "DevTools" },
          { id: "database", icon: Database, label: "Banco" },
          { id: "settings", icon: Settings, label: "Config" },
        ] as { id: Page; icon: typeof MessageSquare; label: string }[]).map(({ id, icon: Icon, label }) => {
          const active = page === id;
          const hasBadge = id === "playground" && pendingPlayground && page !== "playground";
          return (
            <button key={id} onClick={() => setPage(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 px-1 transition-all relative ${
                active ? "text-violet-400" : "text-white/35 hover:text-white/70"}`}>
              <div className="relative shrink-0">
                <Icon size={16} strokeWidth={active ? 2.5 : 1.5} />
                {hasBadge && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full border border-[#0d1520]" />
                )}
              </div>
              <span className="text-[11px] font-medium">{label}</span>
              {active && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-violet-500 rounded-b-full" />}
            </button>
          );
        })}
      </nav>

      {/* ── Page content ───────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {page === "chat" && (
          <ChatPage
            slots={slots}
            activeSlot={activeSlot}
            onSetActiveSlot={handleSetActiveSlot}
            onGoSettings={() => setPage("settings")}
            onGoPlayground={() => setPage("playground")}
          />
        )}
        {page === "playground" && (
          <ErrorBoundary>
            <PlaygroundPage
              pendingImport={pendingPlayground}
              onImportDone={handlePlaygroundImportDone}
            />
          </ErrorBoundary>
        )}
        {page === "devtools" && <DevToolsPage />}
        {page === "database" && <DatabasePage />}
        {page === "settings" && (
          <SettingsPage
            slots={slots}
            activeSlot={activeSlot}
            onSaveSlots={handleSaveSlots}
            onSetActiveSlot={handleSetActiveSlot}
          />
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Switch>
        <Route path="/" component={MainApp} />
      </Switch>
    </WouterRouter>
  );
}
