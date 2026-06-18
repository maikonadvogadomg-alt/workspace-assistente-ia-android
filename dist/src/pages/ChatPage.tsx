import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Mic, MicOff, Trash2, Settings2, Download,
  Upload, Volume2, VolumeX, X, Scale, ChevronDown,
  FileJson, FileText, Copy, Check, Phone, PhoneOff, Brain, Globe
} from "lucide-react";
import { MessageBubble } from "@/components/MessageBubble";
import { streamChat, type Message } from "@/lib/ai";
import {
  loadMessages, saveMessages, clearMessages,
  loadSystemPrompt, saveSystemPrompt,
  type KeySlot
} from "@/lib/storage";

interface Props {
  slots: KeySlot[];
  activeSlot: number;
  onSetActiveSlot: (idx: number) => void;
  onGoSettings: () => void;
  onGoPlayground?: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

// ─── TTS helpers ──────────────────────────────────────────────────────────────
function findBestVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.name.toLowerCase().includes("francisca")) ||
    voices.find((v) => v.name.toLowerCase().includes("brazil")) ||
    voices.find((v) => v.lang === "pt-BR" && v.localService) ||
    voices.find((v) => v.lang === "pt-BR") ||
    voices.find((v) => v.lang.startsWith("pt")) ||
    null
  );
}

function listPtVoices(): SpeechSynthesisVoice[] {
  return window.speechSynthesis.getVoices().filter(
    (v) => v.lang === "pt-BR" || v.lang.startsWith("pt")
  );
}

function speakText(text: string, rate = 0.92, pitch = 1.0, onEnd?: () => void, voiceURI?: string) {
  window.speechSynthesis.cancel();
  const clean = text
    .replace(/```[\s\S]*?```/g, "bloco de código")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^#{1,4}\s/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*]\s/gm, "")
    .replace(/^\d+\.\s/gm, "")
    .replace(/^>\s/gm, "")
    .trim();
  if (!clean) return;
  const utt = new SpeechSynthesisUtterance(clean);
  utt.lang = "pt-BR";
  utt.rate = rate;
  utt.pitch = pitch;
  const voices = window.speechSynthesis.getVoices();
  const voice = voiceURI
    ? (voices.find((v) => v.voiceURI === voiceURI) ?? findBestVoice())
    : findBestVoice();
  if (voice) utt.voice = voice;
  if (onEnd) utt.onend = onEnd;
  window.speechSynthesis.speak(utt);
}

// ─── Component ─────────────────────────────────────────────────────────────────
export function ChatPage({ slots, activeSlot, onSetActiveSlot, onGoSettings, onGoPlayground }: Props) {
  const PANEL_ID = 1;
  const [messages, setMessages] = useState<Message[]>(() => loadMessages(PANEL_ID));
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(() => localStorage.getItem("chat_tts") === "1");
  const [ttsRate, setTtsRate] = useState(() => parseFloat(localStorage.getItem("chat_tts_rate") ?? "0.92"));
  const [ttsPitch, setTtsPitch] = useState(() => parseFloat(localStorage.getItem("chat_tts_pitch") ?? "1.0"));
  const [ttsVoiceURI, setTtsVoiceURI] = useState(() => localStorage.getItem("chat_tts_voice") ?? "");
  const [ptVoices, setPtVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceConvo, setVoiceConvo] = useState(false); // interactive voice conversation mode
  const [streamingContent, setStreamingContent] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(() => loadSystemPrompt());
  const [showSystem, setShowSystem] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showTtsPanel, setShowTtsPanel] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [webSearch, setWebSearch] = useState(() => localStorage.getItem("chat_web_search") === "1");
  const [autoBrain, setAutoBrain] = useState(() => localStorage.getItem("chat_auto_brain") === "1");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const voiceConvoRef = useRef(false);
  voiceConvoRef.current = voiceConvo;
  const autoBrainRef = useRef(autoBrain);
  autoBrainRef.current = autoBrain;
  const webSearchRef = useRef(webSearch);
  webSearchRef.current = webSearch;

  const config = slots[activeSlot] ?? slots[0];
  const hasKey = !!config?.apiKey;

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, []);

  useEffect(scrollToBottom, [messages, streamingContent, scrollToBottom]);
  useEffect(() => { saveMessages(PANEL_ID, messages); }, [messages]);

  // ── Load available voices when panel opens ────────────────────────────────
  useEffect(() => {
    const load = () => { setPtVoices(listPtVoices()); };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // ── TTS controls ──────────────────────────────────────────────────────────
  const toggleTts = () => {
    setTtsEnabled((p) => { localStorage.setItem("chat_tts", p ? "0" : "1"); return !p; });
  };

  const changeRate = (r: number) => {
    setTtsRate(r); localStorage.setItem("chat_tts_rate", String(r));
  };

  const changePitch = (p: number) => {
    setTtsPitch(p); localStorage.setItem("chat_tts_pitch", String(p));
  };

  const changeVoice = (uri: string) => {
    setTtsVoiceURI(uri); localStorage.setItem("chat_tts_voice", uri);
  };

  // ── Voice recognition ─────────────────────────────────────────────────────
  const stopRecognition = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsRecording(false);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
  }, []);

  const startRecognition = useCallback((autoSend: boolean, onTranscript?: (t: string) => void) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Seu navegador não suporta reconhecimento de voz. Use o Chrome."); return; }
    const rec = new SR();
    rec.lang = "pt-BR";
    rec.continuous = autoSend;
    rec.interimResults = false;

    rec.onresult = (e) => {
      let transcript = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) transcript += e.results[i][0]?.transcript ?? "";
      }
      if (!transcript.trim()) return;
      if (autoSend) {
        onTranscript?.(transcript.trim());
        // Restart silence timer
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      } else {
        setInput((prev) => prev + (prev ? " " : "") + transcript.trim());
      }
    };

    rec.onend = () => {
      setIsRecording(false);
    };
    rec.onerror = () => {
      setIsRecording(false);
    };

    recognitionRef.current = rec;
    rec.start();
    setIsRecording(true);
  }, []);

  // ── Auto-brain save to localStorage ──────────────────────────────────────
  const saveBrainToStorage = useCallback((allMessages: Message[], accumulated: string) => {
    try {
      const now = new Date().toLocaleString("pt-BR");
      const userMsgs = allMessages.filter((m) => m.role === "user");
      const topics = userMsgs.slice(0, 8).map((m, i) => `${i + 1}. ${m.content.slice(0, 120).replace(/\n/g, " ")}...`).join("\n");
      const brain = [
        `# 🧠 Memória Auto-salva — Assistente IA Jurídico`,
        `Salvo em: ${now}`,
        `Mensagens: ${allMessages.length + 1}`,
        ``,
        `## Instrução do sistema`,
        loadSystemPrompt() || "Padrão.",
        ``,
        `## Tópicos desta sessão`,
        topics || "Sem mensagens.",
        ``,
        `## Última resposta da IA`,
        accumulated.slice(0, 800) + (accumulated.length > 800 ? "…" : ""),
      ].join("\n");
      localStorage.setItem("chat_brain_latest", brain);
      localStorage.setItem("chat_brain_ts", now);
    } catch {}
  }, []);

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string, isVoiceMode = false) => {
    if (!text.trim() || isLoading) return;
    if (!hasKey) { onGoSettings(); return; }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "60px";
    setIsLoading(true);
    setStreamingContent("");

    const baseSys = systemPrompt ||
      "Você é uma assistente jurídica inteligente, precisa e profissional. Responda sempre em português do Brasil de forma clara, detalhada e bem estruturada. Quando gerar código, use blocos de código com a linguagem especificada.";
    const sysPrompt = webSearchRef.current
      ? baseSys + "\n\nSempre que relevante, inclua links reais de fontes da internet (sites, leis, jurisprudência) no formato [texto](https://url). Use fontes confiáveis como planalto.gov.br, stj.jus.br, tst.jus.br, consultorimobiliario.com.br, etc."
      : baseSys;

    let accumulated = "";
    const currentMessages = [...messages, userMsg];

    await streamChat(
      { provider: config.provider, apiKey: config.apiKey, model: config.model },
      currentMessages,
      sysPrompt,
      (chunk) => {
        accumulated += chunk;
        setStreamingContent(accumulated);
        scrollToBottom();
      },
      () => {
        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: accumulated,
          timestamp: Date.now(),
        };
        setMessages((prev) => {
          const updated = [...prev, assistantMsg];
          // Auto-brain: save to localStorage after each response
          if (autoBrainRef.current) saveBrainToStorage(updated, accumulated);
          return updated;
        });
        setStreamingContent("");
        setIsLoading(false);

        // TTS response
        if (ttsEnabled || isVoiceMode) {
          speakText(accumulated, ttsRate, ttsPitch, () => {
            // In voice convo mode: restart listening after speaking
            if (voiceConvoRef.current && hasKey) {
              setTimeout(() => {
                startRecognition(true, (t) => sendMessage(t, true));
              }, 500);
            }
          }, ttsVoiceURI);
        }
      },
      (err) => {
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(), role: "assistant",
          content: `**Erro:** ${err}`, timestamp: Date.now(),
        }]);
        setStreamingContent(""); setIsLoading(false);
      },
    );
  }, [config, hasKey, isLoading, messages, onGoSettings, scrollToBottom, systemPrompt, ttsEnabled, ttsRate, ttsPitch, ttsVoiceURI, startRecognition, saveBrainToStorage]);

  // ── Voice conversation mode ──────────────────────────────────────────────
  const toggleVoiceConvo = () => {
    if (voiceConvo) {
      // Stop voice convo mode
      setVoiceConvo(false);
      stopRecognition();
      window.speechSynthesis.cancel();
    } else {
      // Start voice convo mode
      if (!hasKey) { onGoSettings(); return; }
      setVoiceConvo(true);
      setTtsEnabled(true); localStorage.setItem("chat_tts", "1");
      setTimeout(() => {
        startRecognition(true, (t) => sendMessage(t, true));
      }, 200);
    }
  };

  // ── Normal voice input ─────────────────────────────────────────────────
  const handleVoice = () => {
    if (voiceConvo) return; // handled by voice convo mode
    if (isRecording) {
      stopRecognition();
    } else {
      startRecognition(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const handleClear = () => {
    if (!confirm("Limpar toda a conversa?")) return;
    clearMessages(PANEL_ID);
    setMessages([]); setStreamingContent("");
    window.speechSynthesis.cancel();
  };

  const handleSystemChange = (val: string) => {
    setSystemPrompt(val); saveSystemPrompt(val);
  };

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "60px";
    el.style.height = Math.min(el.scrollHeight, 320) + "px";
  };

  const toggleWebSearch = () => {
    setWebSearch((p) => { localStorage.setItem("chat_web_search", p ? "0" : "1"); return !p; });
  };

  const downloadBrainFromStorage = () => {
    const content = localStorage.getItem("chat_brain_latest");
    if (!content) { alert("Nenhuma memória salva ainda. Ative 'Auto-memória' nas configurações ou envie uma mensagem primeiro."); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
    a.download = `cerebro-auto-${Date.now()}.md`; a.click(); setShowExport(false);
  };

  // ── Import doc into input ─────────────────────────────────────────────
  const handleImportDoc = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setInput((prev) => prev + (prev ? "\n\n" : "") + content);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 260) + "px";
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ── Import conversation from JSON ─────────────────────────────────────
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        const msgs: Message[] = Array.isArray(data) ? data : data.messages ?? [];
        if (msgs.length > 0 && msgs[0].role && msgs[0].content) {
          setMessages(msgs); setStreamingContent("");
          saveMessages(PANEL_ID, msgs);
        } else {
          alert("Arquivo JSON de conversa inválido.");
        }
      } catch { alert("Erro ao ler o arquivo JSON."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ── Export ────────────────────────────────────────────────────────────
  const exportJson = () => {
    const data = { exportedAt: new Date().toISOString(), model: config.model, messages };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = `conversa-ia-${Date.now()}.json`; a.click(); setShowExport(false);
  };

  const exportTxt = () => {
    const text = messages.map((m) => {
      const role = m.role === "user" ? "VOCÊ" : "IA";
      const time = new Date(m.timestamp).toLocaleString("pt-BR");
      return `[${role} — ${time}]\n${m.content}`;
    }).join("\n\n─────────────────────\n\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    a.download = `conversa-ia-${Date.now()}.txt`; a.click(); setShowExport(false);
  };

  const copyAll = () => {
    const text = messages.map((m) => `[${m.role === "user" ? "Você" : "IA"}]\n${m.content}`).join("\n\n---\n\n");
    navigator.clipboard.writeText(text);
    setCopiedAll(true); setTimeout(() => setCopiedAll(false), 2000); setShowExport(false);
  };

  const exportBrain = () => {
    const now = new Date().toLocaleString("pt-BR");
    const userMsgs = messages.filter((m) => m.role === "user");
    const aiMsgs = messages.filter((m) => m.role === "assistant");
    const topics = userMsgs.slice(0, 8).map((m, i) => `${i + 1}. ${m.content.slice(0, 120).replace(/\n/g, " ")}...`).join("\n");
    const lastAI = aiMsgs[aiMsgs.length - 1]?.content?.slice(0, 500) ?? "";
    const brain = [
      `# 🧠 Memória da Sessão — Assistente IA Jurídico`,
      `Gerado em: ${now}`,
      `Modelo: ${config.model || "não definido"}`,
      `Mensagens: ${messages.length} (${userMsgs.length} suas + ${aiMsgs.length} da IA)`,
      ``,
      `## Instrução do sistema (comportamento da IA)`,
      systemPrompt || "Padrão: assistente jurídica em português do Brasil.",
      ``,
      `## Tópicos abordados nesta sessão`,
      topics || "Nenhuma mensagem ainda.",
      ``,
      `## Último contexto da IA`,
      lastAI ? lastAI + (lastAI.length >= 500 ? "…" : "") : "Sem resposta da IA ainda.",
      ``,
      `## Como usar este arquivo`,
      `Cole o conteúdo acima como "Instrução do sistema" em uma nova conversa para a IA`,
      `lembrar do contexto. Ou use como referência para retomar o trabalho.`,
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([brain], { type: "text/markdown;charset=utf-8" }));
    a.download = `cerebro-ia-${Date.now()}.md`; a.click(); setShowExport(false);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 relative bg-[#0d1520]">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/15 bg-[#111d2e] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
            <Scale size={13} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-none">Assistente IA Jurídico</p>
            {config.model && <p className="text-[10px] text-white/35 mt-0.5">{config.model}</p>}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Key slots */}
          <div className="flex gap-0.5 mr-1">
            {slots.map((s, i) => (
              <button key={i} onClick={() => onSetActiveSlot(i)}
                title={`${s.label}: ${s.apiKey ? s.provider : "sem chave"}`}
                className={`h-6 px-1.5 rounded-md text-[10px] font-bold transition-all ${
                  activeSlot === i && s.apiKey ? "bg-violet-600 text-white"
                  : s.apiKey ? "bg-white/10 text-white/50 hover:bg-white/15"
                  : "bg-white/5 text-white/20"}`}>
                {i + 1}
              </button>
            ))}
          </div>

          {/* Voice conversation mode (small top button) */}
          <button onClick={toggleVoiceConvo}
            title={voiceConvo ? "Sair do modo conversa por voz" : "Modo conversa por voz (fala ↔ IA responde)"}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all font-bold text-xs ${
              voiceConvo ? "bg-green-500 text-white animate-pulse shadow-lg shadow-green-500/40" : "bg-green-500/15 text-green-400 hover:bg-green-500/25"}`}>
            {voiceConvo ? <PhoneOff size={16} /> : <Phone size={16} />}
          </button>

          {/* TTS toggle + panel */}
          <div className="relative">
            <button onClick={() => setShowTtsPanel((p) => !p)}
              title="Voz da IA (TTS)"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                ttsEnabled ? "bg-violet-600/25 text-violet-300" : "text-white/30 hover:bg-white/5 hover:text-white/60"}`}>
              {ttsEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
            {showTtsPanel && (
              <div className="absolute right-0 top-10 w-72 bg-[#152030] border border-white/20 rounded-2xl p-4 shadow-xl z-50 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-white/70">Voz da IA (TTS)</p>
                  <button onClick={() => setShowTtsPanel(false)}><X size={13} className="text-white/30" /></button>
                </div>

                {/* Toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/50">Leitura em voz alta</span>
                  <button onClick={toggleTts}
                    className={`w-10 h-5 rounded-full transition-all relative ${ttsEnabled ? "bg-violet-600" : "bg-white/10"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow ${ttsEnabled ? "left-5" : "left-0.5"}`} />
                  </button>
                </div>

                {/* Voice selector */}
                {ptVoices.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider mb-1">Voz disponível</p>
                    <select
                      value={ttsVoiceURI}
                      onChange={(e) => changeVoice(e.target.value)}
                      className="w-full bg-white/8 border border-white/15 rounded-xl px-3 py-2 text-xs text-white/80 focus:outline-none focus:ring-1 focus:ring-violet-500/50">
                      <option value="">Automático (Francisca se disponível)</option>
                      {ptVoices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} {v.localService ? "★" : "(online)"}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Velocidade */}
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-white/50">Velocidade</span>
                    <span className="text-xs text-violet-300 font-mono">{ttsRate.toFixed(2)}×</span>
                  </div>
                  <input type="range" min="0.5" max="1.8" step="0.05" value={ttsRate}
                    onChange={(e) => changeRate(parseFloat(e.target.value))}
                    className="w-full accent-violet-500" />
                  <div className="flex justify-between text-[9px] text-white/25 mt-0.5">
                    <span>Lento</span><span>Normal</span><span>Rápido</span>
                  </div>
                </div>

                {/* Tom (pitch) */}
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-white/50">Tom de voz</span>
                    <span className="text-xs text-violet-300 font-mono">{ttsPitch.toFixed(1)}</span>
                  </div>
                  <input type="range" min="0.5" max="2.0" step="0.1" value={ttsPitch}
                    onChange={(e) => changePitch(parseFloat(e.target.value))}
                    className="w-full accent-violet-500" />
                  <div className="flex justify-between text-[9px] text-white/25 mt-0.5">
                    <span>Grave</span><span>Normal</span><span>Agudo</span>
                  </div>
                </div>

                <button onClick={() => speakText("Olá! Sou sua assistente jurídica. Como posso ajudar?", ttsRate, ttsPitch, undefined, ttsVoiceURI)}
                  className="w-full py-2 rounded-xl bg-violet-600/20 text-violet-300 text-xs font-semibold border border-violet-500/20 hover:bg-violet-600/30 transition-all">
                  🔊 Testar voz agora
                </button>
                <p className="text-[10px] text-white/25 leading-relaxed">
                  ★ = voz local (melhor qualidade). Francisca (pt-BR neural) é preferida. Use Chrome no Android para melhor resultado.
                </p>
              </div>
            )}
          </div>

          {/* System prompt */}
          <button onClick={() => setShowSystem(!showSystem)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${showSystem ? "bg-violet-600/20 text-violet-400" : "text-white/30 hover:bg-white/5 hover:text-white/60"}`}
            title="Instrução para a IA">
            <Settings2 size={15} />
          </button>

          {/* Export dropdown */}
          <div className="relative">
            <button onClick={() => setShowExport((p) => !p)} disabled={messages.length === 0}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:bg-white/5 hover:text-white/60 transition-all disabled:opacity-20"
              title="Exportar / salvar conversa">
              <Download size={14} />
            </button>
            {showExport && (
              <div className="absolute right-0 top-10 w-56 bg-[#152030] border border-white/20 rounded-2xl p-2 shadow-xl z-50 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-white/30 px-2 py-1 font-semibold">Exportar conversa</p>
                <button onClick={exportBrain} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm text-white/80 hover:bg-violet-600/15 hover:text-white transition-all text-left border border-violet-500/20 mb-1">
                  <Brain size={14} className="text-violet-400" /> 🧠 Cérebro desta sessão
                </button>
                {localStorage.getItem("chat_brain_latest") && (
                  <button onClick={downloadBrainFromStorage} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm text-white/70 hover:bg-white/5 hover:text-white transition-all text-left">
                    <Brain size={14} className="text-emerald-400" /> ↓ Última memória salva
                  </button>
                )}
                <button onClick={exportJson} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm text-white/70 hover:bg-white/5 hover:text-white transition-all text-left">
                  <FileJson size={14} className="text-blue-400" /> Baixar JSON
                </button>
                <button onClick={exportTxt} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm text-white/70 hover:bg-white/5 hover:text-white transition-all text-left">
                  <FileText size={14} className="text-green-400" /> Baixar TXT
                </button>
                <button onClick={copyAll} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm text-white/70 hover:bg-white/5 hover:text-white transition-all text-left">
                  {copiedAll ? <Check size={14} className="text-green-400" /> : <Copy size={14} className="text-white/40" />}
                  {copiedAll ? "Copiado!" : "Copiar tudo"}
                </button>
                <div className="border-t border-white/8 mt-1 pt-1">
                  <label className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm text-white/70 hover:bg-white/5 hover:text-white transition-all cursor-pointer">
                    <Upload size={14} className="text-violet-400" /> Carregar JSON
                    <input ref={jsonRef} type="file" accept=".json" className="hidden" onChange={handleImportJson} />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Clear */}
          <button onClick={handleClear} disabled={messages.length === 0}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:bg-white/5 hover:text-red-400 transition-all disabled:opacity-20"
            title="Limpar conversa">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* ── System prompt ─────────────────────────────────────────────────────── */}
      {showSystem && (
        <div className="px-4 py-3 border-b border-white/15 bg-[#0a1525] shrink-0">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
              Instrução do sistema (o que a IA deve ser)
            </label>
            <button onClick={() => setShowSystem(false)}><X size={13} className="text-white/30" /></button>
          </div>
          <textarea value={systemPrompt} onChange={(e) => handleSystemChange(e.target.value)}
            placeholder="Ex: Você é advogada especialista em direito trabalhista. Cite artigos de lei. Responda de forma objetiva em português..."
            rows={3}
            className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-sm text-white/90 placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-violet-500/50 resize-none" />
        </div>
      )}

      {/* ── Web search active indicator ───────────────────────────────────────── */}
      {webSearch && (
        <div className="px-4 py-2 bg-blue-500/10 border-b border-blue-500/20 shrink-0 flex items-center gap-2">
          <Globe size={13} className="text-blue-400 shrink-0" />
          <p className="text-xs text-blue-300 flex-1">
            Busca na web ativa — a IA vai incluir links de fontes.
            {config.provider === "perplexity" ? " ✓ Perplexity tem internet real." : " Dica: use Perplexity para internet real."}
          </p>
          <button onClick={toggleWebSearch} className="text-[10px] text-blue-400/60 hover:text-blue-400">Desativar</button>
        </div>
      )}

      {/* ── Voice convo indicator ─────────────────────────────────────────────── */}
      {voiceConvo && (
        <div className="px-4 py-2 bg-green-500/10 border-b border-green-500/20 shrink-0 flex items-center gap-2">
          <div className="flex gap-0.5">
            {[1,2,3].map((i) => (
              <div key={i} className="w-1 bg-green-400 rounded-full animate-pulse" style={{ height: 8 + i * 4, animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
          <p className="text-xs text-green-300 font-medium">
            {isLoading ? "IA respondendo…" : isRecording ? "Ouvindo… fale agora" : "Modo voz ativo — aguardando fala"}
          </p>
          <button onClick={toggleVoiceConvo} className="ml-auto text-[10px] text-green-400/60 hover:text-green-400">
            Encerrar
          </button>
        </div>
      )}

      {/* ── Messages ──────────────────────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 px-3 sm:px-6"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#ffffff18 transparent" }}
        onClick={() => setShowExport(false)}>

        {!hasKey && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <Settings2 size={28} className="text-violet-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white mb-2">Configure sua chave de API</p>
              <p className="text-sm text-white/55 max-w-xs">Vá em Configurações (ícone abaixo) e cole sua chave de API para começar.</p>
            </div>
            <button onClick={onGoSettings} className="px-6 py-3 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-500 transition-all shadow-lg shadow-violet-600/30">
              Ir para Configurações
            </button>
          </div>
        )}

        {hasKey && messages.length === 0 && !streamingContent && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-violet-600/20 border border-violet-500/25 flex items-center justify-center">
              <span className="text-violet-300 text-lg font-black">IA</span>
            </div>
            <div className="space-y-1">
              <p className="text-white/70 text-sm font-medium">Pronta para ajudar com seus assuntos jurídicos.</p>
              <p className="text-white/40 text-xs">Digite, fale ou importe um documento.</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              <button onClick={() => setInput("Explique o que é habeas corpus")}
                className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white/55 hover:bg-white/8 hover:text-white/80 transition-all">
                O que é habeas corpus?
              </button>
              <button onClick={() => setInput("Como funciona o FGTS?")}
                className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white/55 hover:bg-white/8 hover:text-white/80 transition-all">
                Como funciona o FGTS?
              </button>
              <button onClick={() => setInput("Quais são os direitos do trabalhador CLT?")}
                className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white/55 hover:bg-white/8 hover:text-white/80 transition-all">
                Direitos CLT
              </button>
            </div>
          </div>
        )}

        <div className="max-w-3xl mx-auto w-full space-y-0.5">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {streamingContent && (
            <MessageBubble
              message={{ id: "streaming", role: "assistant", content: streamingContent, timestamp: Date.now() }}
              streaming
            />
          )}
        </div>
      </div>

      {/* ── Input area ────────────────────────────────────────────────────────── */}
      <div className="px-3 sm:px-6 pt-2 pb-3 border-t border-white/15 bg-[#111d2e] shrink-0">
        <div className="max-w-3xl mx-auto space-y-2">

          {/* ── Botão de voz grande — acessibilidade (acima do input, sempre visível) ── */}
          <div className="flex gap-2">
            <button
              onClick={toggleVoiceConvo}
              title={voiceConvo ? "Parar conversa por voz" : "Iniciar conversa por voz (mãos livres)"}
              aria-label={voiceConvo ? "Parar conversa por voz" : "Iniciar conversa por voz"}
              className={`flex-1 h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg ${
                voiceConvo
                  ? "bg-red-500 text-white shadow-red-500/40 animate-pulse"
                  : "bg-green-500 text-white shadow-green-500/30 hover:bg-green-400"
              }`}>
              {voiceConvo ? <PhoneOff size={20} /> : <Phone size={20} />}
              {voiceConvo
                ? (isLoading ? "IA respondendo…" : isRecording ? "Ouvindo… fale" : "Parar voz")
                : "Conversa por voz"}
            </button>

            <button onClick={toggleWebSearch}
              title={webSearch ? "Busca na web ativa — desativar" : "Ativar busca na web"}
              className={`h-12 px-4 rounded-2xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all ${
                webSearch ? "bg-blue-600/30 text-blue-300 ring-1 ring-blue-500/40" : "bg-white/5 text-white/30 hover:bg-white/10 hover:text-blue-300"}`}>
              <Globe size={16} />
              <span className="hidden sm:inline">Web</span>
            </button>
          </div>

          {/* ── Caixa de texto + microfone + enviar ── */}
          <div className={`flex gap-1 items-end bg-[#182840] border rounded-2xl overflow-hidden transition-all ${
            isLoading ? "border-violet-500/40" : "border-white/15 focus-within:border-violet-500/50"}`}>

            {/* Import doc */}
            <input ref={fileRef} type="file" accept=".txt,.md,.csv,.json,.xml,.html,.js,.ts,.py,.java,.pdf" className="hidden" onChange={handleImportDoc} />
            <button type="button" onClick={() => fileRef.current?.click()}
              className="ml-2 mb-2 w-9 h-9 rounded-xl flex items-center justify-center text-white/30 hover:bg-white/8 hover:text-white/70 transition-all shrink-0 cursor-pointer"
              title="Importar documento de texto">
              <Upload size={15} />
            </button>

            <textarea ref={textareaRef} value={input} onChange={autoResize} onKeyDown={handleKeyDown}
              placeholder={hasKey ? (voiceConvo ? "Modo voz ativo — ou digite aqui também" : "Digite sua mensagem… (Enter envia)") : "Configure a chave de API em Config para enviar"}
              disabled={isLoading}
              className="flex-1 bg-transparent py-3 text-sm text-white/95 placeholder:text-white/25 focus:outline-none resize-none overflow-y-auto disabled:opacity-70"
              style={{ minHeight: "48px", maxHeight: "200px", height: "48px" }} />

            <div className="flex items-end gap-1 pr-2 pb-1.5">
              {/* Mic (fala curta) */}
              <button onClick={handleVoice} disabled={isLoading}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                  isRecording ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/40" : "text-white/35 hover:bg-white/8 hover:text-white/70 disabled:opacity-20"}`}
                title={isRecording ? "Parar gravação" : "Falar (pt-BR)"}>
                {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
              </button>

              {/* Enviar */}
              <button
                onClick={() => {
                  if (!hasKey) { onGoSettings(); return; }
                  sendMessage(input);
                }}
                disabled={isLoading || !input.trim()}
                className="w-12 h-11 rounded-xl bg-violet-600 text-white flex items-center justify-center hover:bg-violet-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-violet-600/25"
                title={!hasKey ? "Toque para configurar a chave de API" : "Enviar mensagem"}>
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : !hasKey ? (
                  <Settings2 size={17} />
                ) : (
                  <Send size={17} />
                )}
              </button>
            </div>
          </div>

          <p className="text-center text-[9px] text-white/15">
            A IA pode cometer erros. Verifique informações importantes.
          </p>
        </div>
      </div>
    </div>
  );
}
