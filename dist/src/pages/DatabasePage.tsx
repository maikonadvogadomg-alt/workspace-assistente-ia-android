import { useState, useEffect, useRef } from "react";
import {
  Database, Plug, Play, Table2, Trash2, RefreshCw,
  Sparkles, ChevronDown, ChevronRight, Copy, Check, X, AlertTriangle,
} from "lucide-react";
import { loadKeySlots, loadActiveSlot } from "@/lib/storage";
import { streamChat } from "@/lib/ai";
import type { Message } from "@/lib/ai";

// ── Neon HTTP SQL API ─────────────────────────────────────────────────────────
// Parses postgres://user:pass@host/db and calls Neon SQL-over-HTTP endpoint
interface SqlResult {
  rows: Record<string, unknown>[];
  fields: { name: string; dataTypeID: number }[];
  rowCount: number;
  command: string;
}

function parseConnStr(url: string): { user: string; password: string; host: string; database: string } | null {
  try {
    const clean = url.trim().replace(/^postgres(ql)?:\/\//, "");
    const atIdx = clean.lastIndexOf("@");
    if (atIdx === -1) return null;
    const credentials = clean.slice(0, atIdx);
    const rest = clean.slice(atIdx + 1);
    const colonCred = credentials.indexOf(":");
    const user = decodeURIComponent(colonCred === -1 ? credentials : credentials.slice(0, colonCred));
    const password = decodeURIComponent(colonCred === -1 ? "" : credentials.slice(colonCred + 1));
    const slashIdx = rest.indexOf("/");
    const host = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
    const database = slashIdx === -1 ? "" : rest.slice(slashIdx + 1).split("?")[0];
    return { user, password, host: host.split(":")[0], database };
  } catch { return null; }
}

async function runSql(connStr: string, query: string): Promise<SqlResult> {
  const parsed = parseConnStr(connStr);
  if (!parsed) throw new Error("URL de conexão inválida. Use: postgres://user:senha@host/banco");

  const { user, password, host, database } = parsed;
  const endpoint = `https://${host}/sql`;
  const authHeader = "Basic " + btoa(`${user}:${password}`);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": authHeader,
      "Neon-Connection-String": connStr,
      "Neon-Raw-Text-Output": "false",
      "Neon-Array-Mode": "false",
    },
    body: JSON.stringify({ query: query.trim(), params: [] }),
  });

  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try { const j = await res.json() as { message?: string; error?: string }; msg = j.message ?? j.error ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json() as Promise<SqlResult>;
}

// ── AI SQL generation ─────────────────────────────────────────────────────────
function aiGenerateSQL(prompt: string, schema: string): Promise<string> {
  const slots = loadKeySlots();
  const activeSlot = loadActiveSlot();
  const slot = slots[activeSlot];
  if (!slot?.apiKey) return Promise.reject(new Error("Configure uma chave de API no Chat → Config primeiro."));

  const systemPrompt = `Você é um especialista em SQL (PostgreSQL/Neon). Responda APENAS com o código SQL puro, sem explicações, sem markdown, sem blocos de código.\n${schema ? `\nEstrutura do banco:\n${schema}` : ""}`;

  const messages: Message[] = [
    { id: "ai-sql-1", role: "user", content: prompt, timestamp: Date.now() },
  ];

  let result = "";
  return new Promise((resolve, reject) => {
    streamChat(
      { provider: slot.provider, apiKey: slot.apiKey, model: slot.model },
      messages,
      systemPrompt,
      (chunk: string) => { result += chunk; },
      () => { resolve(result.trim().replace(/^```sql\n?/i, "").replace(/\n?```$/, "").trim()); },
      (err: string) => { reject(new Error(err)); }
    );
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
export function DatabasePage() {
  const [connStr, setConnStr] = useState(() => localStorage.getItem("juridico_db_url") ?? "");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connError, setConnError] = useState("");
  const [query, setQuery] = useState("SELECT version();");
  const [result, setResult] = useState<SqlResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [schema, setSchema] = useState<Record<string, { column: string; type: string }[]>>({});
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [openTables, setOpenTables] = useState<Set<string>>(new Set());
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const saveConn = (v: string) => { setConnStr(v); localStorage.setItem("juridico_db_url", v); };

  const handleConnect = async () => {
    if (!connStr.trim()) return;
    setConnecting(true); setConnError("");
    try {
      await runSql(connStr, "SELECT 1");
      setConnected(true);
      await loadSchema();
    } catch (e) {
      setConnError(e instanceof Error ? e.message : "Falha na conexão");
      setConnected(false);
    }
    setConnecting(false);
  };

  const handleDisconnect = () => {
    setConnected(false); setResult(null); setSchema({}); setConnError("");
  };

  const loadSchema = async () => {
    setSchemaLoading(true);
    try {
      const r = await runSql(connStr, `
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position;
      `);
      const grouped: Record<string, { column: string; type: string }[]> = {};
      for (const row of r.rows) {
        const t = String(row.table_name);
        if (!grouped[t]) grouped[t] = [];
        grouped[t].push({ column: String(row.column_name), type: String(row.data_type) });
      }
      setSchema(grouped);
    } catch { /* ignore schema errors */ }
    setSchemaLoading(false);
  };

  const handleRun = async () => {
    if (!query.trim() || !connected) return;
    setRunning(true); setRunError(""); setResult(null);
    try {
      const r = await runSql(connStr, query);
      setResult(r);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Erro ao executar");
    }
    setRunning(false);
  };

  const handleShowTables = () => {
    setQuery(`SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;`);
  };

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    const schemaText = Object.entries(schema).map(([t, cols]) =>
      `${t}(${cols.map((c) => `${c.column} ${c.type}`).join(", ")})`
    ).join("\n");
    try {
      const sql = await aiGenerateSQL(aiPrompt, schemaText);
      setQuery(sql);
      setShowAI(false);
      setAiPrompt("");
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Erro na IA");
    }
    setAiLoading(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(query);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  const schemaText = Object.entries(schema).map(([t, cols]) =>
    `${t}: ${cols.map((c) => c.column).join(", ")}`
  ).join("\n");

  const tableNames = Object.keys(schema);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#0d1520]">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-[#070f1a]">
        <Database size={15} className="text-violet-400 shrink-0" />
        <span className="text-sm font-semibold text-white/70">Banco de Dados</span>
        {connected && (
          <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> Conectado
          </span>
        )}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Sidebar — schema ─────────────────────────────────────────────── */}
        <div className="w-44 shrink-0 border-r border-white/10 bg-[#070f1a] flex flex-col">
          <div className="px-3 py-2 border-b border-white/8 flex items-center justify-between shrink-0">
            <span className="text-[9px] uppercase tracking-widest text-white/25 font-semibold">Tabelas</span>
            {connected && (
              <button onClick={loadSchema} className="text-white/20 hover:text-white/50 transition-all" title="Recarregar schema">
                <RefreshCw size={10} className={schemaLoading ? "animate-spin" : ""} />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto py-1" style={{ scrollbarWidth: "thin", scrollbarColor: "#ffffff10 transparent" }}>
            {!connected && (
              <p className="text-[10px] text-white/20 text-center px-3 py-4 leading-relaxed">
                Conecte ao banco para ver as tabelas
              </p>
            )}
            {connected && tableNames.length === 0 && !schemaLoading && (
              <p className="text-[10px] text-white/20 text-center px-3 py-4">Nenhuma tabela encontrada</p>
            )}
            {schemaLoading && (
              <div className="flex items-center justify-center py-4">
                <div className="w-4 h-4 border border-violet-500/40 border-t-violet-400 rounded-full animate-spin" />
              </div>
            )}
            {tableNames.map((table) => {
              const open = openTables.has(table);
              return (
                <div key={table}>
                  <button
                    onClick={() => {
                      setOpenTables((prev) => {
                        const next = new Set(prev);
                        open ? next.delete(table) : next.add(table);
                        return next;
                      });
                    }}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-white/5 transition-all text-left group"
                  >
                    {open ? <ChevronDown size={10} className="text-white/30 shrink-0" /> : <ChevronRight size={10} className="text-white/30 shrink-0" />}
                    <Table2 size={11} className="text-violet-400/70 shrink-0" />
                    <span className="text-[11px] text-white/60 truncate flex-1">{table}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setQuery(`SELECT * FROM ${table} LIMIT 50;`); }}
                      className="opacity-0 group-hover:opacity-100 text-[9px] text-white/30 hover:text-violet-300 shrink-0 px-1 transition-all"
                      title="SELECT * FROM ..."
                    >▶</button>
                  </button>
                  {open && schema[table]?.map((col) => (
                    <div key={col.column} className="flex items-center gap-1 px-4 py-0.5 ml-3">
                      <span className="text-[10px] text-white/40 flex-1 truncate">{col.column}</span>
                      <span className="text-[9px] text-white/20 font-mono shrink-0">{col.type.replace("character varying", "varchar").replace("timestamp without time zone", "timestamp")}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Main area ────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Connection bar */}
          <div className="shrink-0 px-3 py-2.5 border-b border-white/10 bg-[#0a131f]">
            {!connected ? (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] text-white/35 font-semibold uppercase tracking-wider">URL de conexão (Neon PostgreSQL)</p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={connStr}
                    onChange={(e) => saveConn(e.target.value)}
                    placeholder="postgres://user:senha@ep-xxx.neon.tech/banco"
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/40"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <button
                    onClick={handleConnect}
                    disabled={!connStr.trim() || connecting}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-40 shrink-0"
                  >
                    {connecting
                      ? <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                      : <Plug size={12} />}
                    {connecting ? "Conectando..." : "Conectar"}
                  </button>
                </div>
                {connError && (
                  <div className="flex items-start gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <AlertTriangle size={12} className="text-red-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-red-300">{connError}</p>
                  </div>
                )}
                <p className="text-[9px] text-white/20 leading-relaxed">
                  Acesse <strong className="text-white/30">console.neon.tech</strong> → seu projeto → <em>Connection string</em> e cole acima.
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                  <span className="text-[11px] text-green-300 font-mono flex-1 truncate">
                    {parseConnStr(connStr)?.host ?? connStr.slice(0, 40)}
                  </span>
                  <span className="text-[9px] text-green-400/50 shrink-0 font-semibold">{parseConnStr(connStr)?.database}</span>
                </div>
                <button onClick={handleDisconnect} className="text-white/20 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-all" title="Desconectar">
                  <X size={13} />
                </button>
              </div>
            )}
          </div>

          {/* SQL Editor */}
          <div className="shrink-0 border-b border-white/10">
            {/* Editor toolbar */}
            <div className="flex items-center gap-1 px-3 py-1.5 bg-[#0a131f] border-b border-white/8">
              <span className="text-[9px] uppercase tracking-widest text-white/20 font-semibold flex-1">SQL</span>
              <button onClick={handleCopy} className="flex items-center gap-1 text-[10px] text-white/25 hover:text-white/60 px-2 py-1 rounded hover:bg-white/5 transition-all">
                {copied ? <><Check size={9} className="text-green-400" /><span className="text-green-400">Copiado</span></> : <><Copy size={9} />Copiar</>}
              </button>
              <button onClick={handleShowTables}
                className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/70 px-2 py-1 rounded hover:bg-white/5 transition-all">
                <Table2 size={10} /> Ver tabelas
              </button>
              <button onClick={() => setShowAI(!showAI)}
                className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-all ${showAI ? "bg-violet-600/25 text-violet-300" : "text-white/30 hover:text-violet-300 hover:bg-white/5"}`}>
                <Sparkles size={10} /> IA gerar SQL
              </button>
            </div>

            {/* AI prompt */}
            {showAI && (
              <div className="flex items-center gap-2 px-3 py-2 bg-violet-900/20 border-b border-violet-500/20">
                <Sparkles size={12} className="text-violet-400 shrink-0" />
                <input
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAIGenerate(); } }}
                  placeholder="Ex: crie tabela clientes com nome, email, cpf, criado_em"
                  className="flex-1 bg-transparent text-xs text-white placeholder:text-white/25 focus:outline-none"
                  autoFocus
                />
                <button onClick={handleAIGenerate} disabled={aiLoading || !aiPrompt.trim()}
                  className="flex items-center gap-1 px-3 py-1 bg-violet-600 text-white text-[10px] font-bold rounded-lg hover:bg-violet-500 disabled:opacity-40 transition-all shrink-0">
                  {aiLoading ? <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" /> : "Gerar"}
                </button>
                <button onClick={() => setShowAI(false)} className="text-white/25 hover:text-white/60 p-0.5">
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleRun(); }
                if (e.key === "Tab") {
                  e.preventDefault();
                  const start = e.currentTarget.selectionStart;
                  const end = e.currentTarget.selectionEnd;
                  const next = query.slice(0, start) + "  " + query.slice(end);
                  setQuery(next);
                  setTimeout(() => { if (textareaRef.current) { textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2; } }, 0);
                }
              }}
              spellCheck={false}
              rows={6}
              placeholder="SELECT * FROM minhas_tabelas LIMIT 10;"
              className="w-full bg-[#060e1a] text-emerald-200 font-mono text-xs p-3 focus:outline-none leading-relaxed resize-none"
              style={{ scrollbarWidth: "thin", scrollbarColor: "#ffffff10 transparent", tabSize: 2 }}
            />

            {/* Run bar */}
            <div className="flex items-center gap-2 px-3 py-2 bg-[#0a131f] border-t border-white/8">
              <button
                onClick={handleRun}
                disabled={!connected || running || !query.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-40"
              >
                {running
                  ? <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                  : <Play size={11} />}
                {running ? "Executando..." : "Executar"}
              </button>
              <span className="text-[9px] text-white/20">Ctrl+Enter</span>
              {result && (
                <button onClick={() => setResult(null)} className="ml-auto text-white/20 hover:text-white/50 transition-all" title="Limpar resultado">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto min-h-0" style={{ scrollbarWidth: "thin", scrollbarColor: "#ffffff10 transparent" }}>
            {runError && (
              <div className="flex items-start gap-2 m-3 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-300 font-mono">{runError}</p>
              </div>
            )}

            {result && (
              <div className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold text-violet-300">{result.command}</span>
                  <span className="text-[10px] text-white/30">{result.rowCount} linha(s)</span>
                </div>

                {result.rows.length > 0 && result.fields.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-white/10">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-white/5 border-b border-white/10">
                          {result.fields.map((f) => (
                            <th key={f.name} className="px-3 py-2 text-left text-[10px] font-semibold text-white/50 uppercase tracking-wider whitespace-nowrap">
                              {f.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((row, i) => (
                          <tr key={i} className="border-b border-white/5 hover:bg-white/3 transition-all">
                            {result.fields.map((f) => (
                              <td key={f.name} className="px-3 py-2 text-white/60 font-mono whitespace-nowrap max-w-xs truncate">
                                {row[f.name] === null ? <span className="text-white/20 italic">null</span>
                                  : typeof row[f.name] === "object" ? JSON.stringify(row[f.name])
                                  : String(row[f.name])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <Check size={13} className="text-green-400 shrink-0" />
                    <p className="text-xs text-green-300">Operação executada com sucesso.</p>
                  </div>
                )}
              </div>
            )}

            {!result && !runError && (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 pb-8">
                <Database size={32} className="text-white/10 mb-3" />
                <p className="text-sm text-white/20 font-semibold mb-1">
                  {connected ? "Execute uma query para ver os resultados" : "Conecte ao banco de dados"}
                </p>
                {!connected && (
                  <p className="text-xs text-white/15 leading-relaxed max-w-xs">
                    Cole a URL de conexão do Neon acima e clique em <strong className="text-white/25">Conectar</strong>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Schema quick-copy */}
          {connected && schemaText && (
            <div className="shrink-0 border-t border-white/10 px-3 py-1.5 flex items-center gap-2">
              <span className="text-[9px] text-white/20">{tableNames.length} tabela(s) no banco</span>
              <button
                onClick={() => { navigator.clipboard.writeText(schemaText); }}
                className="ml-auto text-[9px] text-white/20 hover:text-white/50 transition-all"
              >
                copiar schema
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
