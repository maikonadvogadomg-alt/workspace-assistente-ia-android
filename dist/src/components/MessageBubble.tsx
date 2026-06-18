import { useState } from "react";
import { Copy, Check, Code2, ExternalLink } from "lucide-react";
import type { Message } from "@/lib/ai";

interface Props {
  message: Message;
  streaming?: boolean;
}

function sendToPlayground(code: string, lang: string) {
  const filename = lang ? `codigo.${lang === "javascript" ? "js" : lang === "typescript" ? "ts" : lang === "python" ? "py" : lang === "html" ? "html" : lang === "css" ? "css" : lang || "txt"}` : "codigo.txt";
  localStorage.setItem("chat_code_import", JSON.stringify({ code, lang, filename, ts: Date.now() }));
  window.dispatchEvent(new CustomEvent("chat:to-playground"));
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const toPlayground = () => {
    sendToPlayground(code, lang);
    setSent(true); setTimeout(() => setSent(false), 3000);
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-white/15 bg-[#090f1a] shadow-lg">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0e1828] border-b border-white/15">
        <div className="flex items-center gap-2">
          <Code2 size={13} className="text-violet-400" />
          <span className="text-xs text-white/60 font-mono font-medium">{lang || "código"}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toPlayground}
            className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors hover:bg-violet-600/20 border border-violet-500/20"
            style={{ color: sent ? "#4ade80" : "#a78bfa" }}
            title="Enviar ao Playground">
            {sent ? <><Check size={11} /><span>Enviado!</span></> : <><ExternalLink size={11} /><span>Playground</span></>}
          </button>
          <button onClick={copy}
            className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/80 transition-colors px-2.5 py-1 rounded-lg hover:bg-white/5 font-medium">
            {copied ? <><Check size={11} className="text-green-400" /><span className="text-green-400">Copiado!</span></> : <><Copy size={11} />Copiar</>}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto p-5 text-sm text-emerald-300 font-mono leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// Inline markdown renderer (bold, italic, inline code, links, bare URLs)
function InlineMarkdown({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  // Process inline: **bold**, *italic*, `code`, [text](url), bare https:// URLs
  const inline = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+?)`|\[(.+?)\]\((.+?)\)|(https?:\/\/[^\s\)>,"]+))/g;
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = inline.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={k++}>{text.slice(last, m.index)}</span>);
    if (m[2]) parts.push(<strong key={k++} className="font-bold text-white">{m[2]}</strong>);
    else if (m[3]) parts.push(<em key={k++} className="italic text-white/90">{m[3]}</em>);
    else if (m[4]) parts.push(<code key={k++} className="bg-white/10 text-emerald-300 rounded px-1.5 py-0.5 text-[0.85em] font-mono">{m[4]}</code>);
    else if (m[5] && m[6]) parts.push(<a key={k++} href={m[6]} target="_blank" rel="noopener noreferrer" className="text-violet-300 underline hover:text-violet-200 inline-flex items-center gap-0.5">{m[5]}<ExternalLink size={10} className="inline shrink-0" /></a>);
    else if (m[7]) {
      const url = m[7].replace(/[.,;:!?]+$/, "");
      const domain = url.replace(/^https?:\/\//, "").split("/")[0];
      parts.push(<a key={k++} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-300 underline hover:text-blue-200 break-all inline-flex items-center gap-0.5">{domain}<ExternalLink size={10} className="inline shrink-0 ml-0.5" /></a>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={k++}>{text.slice(last)}</span>);
  return <>{parts}</>;
}

function renderContent(content: string, streaming: boolean) {
  const nodes: React.ReactNode[] = [];
  // First, extract code blocks
  const codeReg = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIdx = 0; let match: RegExpExecArray | null; let ki = 0;

  while ((match = codeReg.exec(content)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(...renderText(content.slice(lastIdx, match.index), ki, false));
      ki += 100;
    }
    nodes.push(<CodeBlock key={`cb${ki++}`} lang={match[1]} code={match[2].trimEnd()} />);
    lastIdx = match.index + match[0].length;
  }

  const tail = content.slice(lastIdx);
  nodes.push(...renderText(tail, ki, streaming));
  return nodes;
}

function renderText(text: string, startKey: number, streaming: boolean): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = text.split("\n");
  let k = startKey;
  let i = 0;
  let listItems: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!listItems) return;
    if (listItems.ordered) {
      nodes.push(
        <ol key={k++} className="list-decimal list-inside space-y-1 my-2 text-white/90">
          {listItems.items.map((it, idx) => (
            <li key={idx} className="leading-relaxed"><InlineMarkdown text={it} /></li>
          ))}
        </ol>
      );
    } else {
      nodes.push(
        <ul key={k++} className="list-disc list-inside space-y-1 my-2 text-white/90">
          {listItems.items.map((it, idx) => (
            <li key={idx} className="leading-relaxed"><InlineMarkdown text={it} /></li>
          ))}
        </ul>
      );
    }
    listItems = null;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Headings
    const hm = line.match(/^(#{1,4})\s(.+)/);
    if (hm) {
      flushList();
      const level = hm[1].length;
      const cls = level === 1 ? "text-lg font-bold text-white mt-3 mb-1"
        : level === 2 ? "text-base font-bold text-white mt-2.5 mb-1"
        : level === 3 ? "text-sm font-bold text-white/90 mt-2 mb-0.5"
        : "text-sm font-semibold text-white/80 mt-1.5";
      nodes.push(<p key={k++} className={cls}><InlineMarkdown text={hm[2]} /></p>);
      i++; continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      flushList();
      nodes.push(<hr key={k++} className="border-white/10 my-3" />);
      i++; continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      flushList();
      nodes.push(
        <blockquote key={k++} className="border-l-2 border-violet-500/50 pl-3 my-1.5 text-white/60 italic">
          <InlineMarkdown text={line.slice(2)} />
        </blockquote>
      );
      i++; continue;
    }

    // Unordered list
    const ulm = line.match(/^[\-\*]\s(.+)/);
    if (ulm) {
      if (!listItems) listItems = { ordered: false, items: [] };
      if (!listItems.ordered) {
        listItems.items.push(ulm[1]);
      } else {
        flushList();
        listItems = { ordered: false, items: [ulm[1]] };
      }
      i++; continue;
    }

    // Ordered list
    const olm = line.match(/^\d+\.\s(.+)/);
    if (olm) {
      if (!listItems) listItems = { ordered: true, items: [] };
      if (listItems.ordered) {
        listItems.items.push(olm[1]);
      } else {
        flushList();
        listItems = { ordered: true, items: [olm[1]] };
      }
      i++; continue;
    }

    // Empty line — paragraph break
    if (line.trim() === "") {
      flushList();
      nodes.push(<div key={k++} className="h-2" />);
      i++; continue;
    }

    // Normal line
    flushList();
    const isLast = i === lines.length - 1;
    nodes.push(
      <span key={k++} className="text-white/90 leading-relaxed">
        <InlineMarkdown text={line} />
        {!isLast && "\n"}
        {isLast && streaming && (
          <span className="inline-block w-0.5 h-4 bg-violet-400 ml-0.5 animate-pulse align-middle" />
        )}
      </span>
    );
    i++;
  }

  flushList();

  if (streaming && nodes.length === 0) {
    nodes.push(<span key={k++} className="inline-block w-0.5 h-4 bg-violet-400 animate-pulse align-middle" />);
  }

  return nodes;
}

export function MessageBubble({ message, streaming }: Props) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const copyMsg = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  if (isUser) {
    return (
      <div className="flex justify-end mb-3 mt-1 group">
        <div className="max-w-[80%] bg-violet-700 text-white rounded-2xl rounded-tr-sm px-5 py-3.5 text-sm leading-relaxed shadow-lg shadow-violet-900/30 relative">
          <span className="whitespace-pre-wrap">{message.content}</span>
          <button onClick={copyMsg} className="absolute -bottom-4 right-0 opacity-0 group-hover:opacity-100 transition-all text-[9px] text-white/30 hover:text-white/70 px-1.5 py-0.5 rounded">
            {copied ? "✓" : <Copy size={9} />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 mb-3 mt-1 group">
      <div className="w-7 h-7 rounded-xl bg-violet-600/25 border border-violet-500/40 flex items-center justify-center shrink-0 mt-1">
        <span className="text-violet-300 text-[9px] font-black">IA</span>
      </div>
      <div className="flex-1 min-w-0 text-sm leading-relaxed relative">
        {renderContent(message.content, !!streaming)}
        {!streaming && (
          <button onClick={copyMsg}
            className="mt-1 opacity-0 group-hover:opacity-100 transition-all text-[10px] text-white/30 hover:text-white/70 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/5">
            {copied ? <><Check size={9} className="text-green-400" />Copiado</> : <><Copy size={9} />Copiar tudo</>}
          </button>
        )}
      </div>
    </div>
  );
}
