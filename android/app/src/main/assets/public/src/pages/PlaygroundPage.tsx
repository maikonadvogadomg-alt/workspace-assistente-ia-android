import { useState, useRef, useCallback, useEffect } from "react";
import JSZip from "jszip";
import {
  Play, Download, Save, Trash2, Maximize2, Minimize2,
  FolderOpen, Code2, ChevronRight, ChevronDown, ChevronLeft,
  File, Folder, Upload, Github, ExternalLink, X,
  Copy, FilePlus, FolderPlus, Edit2, Check, RefreshCw,
  BookOpen, List
} from "lucide-react";
import {
  loadPlaygroundSavesIDB, savePlaygroundIDB, deleteSaveIDB, type PlaygroundSave,
} from "@/lib/storage";

// ─── Types ────────────────────────────────────────────────────────────────────
interface FileNode { name: string; path: string; content: string; type: "file"; }
interface FolderNode { name: string; path: string; type: "folder"; children: TreeNode[]; expanded: boolean; }
type TreeNode = FileNode | FolderNode;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, "pt-BR");
  }).map((n) => n.type === "folder" ? { ...n, children: sortNodes(n.children) } : n);
}

function buildTree(files: Record<string, string>): TreeNode[] {
  const root: FolderNode = { name: "", path: "", type: "folder", children: [], expanded: true };
  for (const [path, content] of Object.entries(files)) {
    const parts = path.split("/");
    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i];
      const folderPath = parts.slice(0, i + 1).join("/");
      let node = current.children.find((n) => n.name === name && n.type === "folder") as FolderNode | undefined;
      if (!node) { node = { name, path: folderPath, type: "folder", children: [], expanded: true }; current.children.push(node); }
      current = node;
    }
    current.children.push({ name: parts[parts.length - 1], path, content, type: "file" });
  }
  return sortNodes(root.children);
}

function getLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    html: "HTML", css: "CSS", js: "JavaScript", ts: "TypeScript",
    jsx: "JSX", tsx: "TSX", json: "JSON", py: "Python",
    md: "Markdown", txt: "Texto", xml: "XML", sql: "SQL",
    sh: "Shell", yaml: "YAML", yml: "YAML", toml: "TOML",
    rs: "Rust", go: "Go", java: "Java", kt: "Kotlin", swift: "Swift",
    php: "PHP", rb: "Ruby", cs: "C#", cpp: "C++", c: "C",
  };
  return map[ext] ?? (ext ? ext.toUpperCase() : "Arquivo");
}

// Binary extensions — mostrados diferente no editor, mas SEMPRE importados
const BINARY_EXTS = new Set(["png","jpg","jpeg","gif","webp","ico","bmp","tiff","woff","woff2","ttf","otf","eot","mp4","mp3","wav","ogg","flac","pdf","exe","dll","so","dylib","class","pyc","wasm"]);
function isBinary(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return BINARY_EXTS.has(ext);
}

// Armazena arquivo binário como base64 (com prefixo para identificação)
function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return "[binary:" + btoa(bin) + "]";
}

function isBinContent(content: string): boolean {
  return content.startsWith("[binary:");
}

function b64ToBuf(content: string): Uint8Array {
  const b64 = content.slice(8, -1);
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const STARTER_FILES: Record<string, string> = {
  "index.html": `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Meu Projeto</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <h1>Olá, Mundo!</h1>
  <p>Edite os arquivos e clique em <strong>Visualizar</strong>.</p>
  <script src="main.js"></script>
</body>
</html>`,
  "style.css": `body {
  font-family: sans-serif;
  padding: 2rem;
  background: #0f0f0f;
  color: #fff;
}
h1 { color: #7c3aed; }`,
  "main.js": `// JavaScript do projeto
console.log("Projeto carregado!");`,
};

// ─── FileTree component ───────────────────────────────────────────────────────
function FileTreeItem({
  node, depth, activeFile, onSelect, onDelete, onRename, onToggle,
}: {
  node: TreeNode; depth: number; activeFile: string;
  onSelect: (path: string) => void;
  onDelete: (path: string, type: "file" | "folder") => void;
  onRename: (oldPath: string, newName: string) => void;
  onToggle: (path: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(node.name);
  const [hovered, setHovered] = useState(false);

  const confirmRename = () => {
    if (newName.trim() && newName !== node.name) onRename(node.path, newName.trim());
    setRenaming(false);
  };

  const isActive = node.type === "file" && activeFile === node.path;
  const bin = node.type === "file" && isBinary(node.name);

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1 px-1 rounded-lg cursor-pointer group transition-all select-none ${
          isActive ? "bg-violet-600/20 text-violet-300" : "hover:bg-white/5 text-white/60 hover:text-white/90"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => node.type === "file" ? onSelect(node.path) : onToggle(node.path)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {node.type === "folder" ? (
          <>
            {node.expanded ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />}
            <Folder size={13} className="shrink-0 text-yellow-400/70" />
          </>
        ) : (
          <>
            <span className="w-3" />
            <File size={13} className={`shrink-0 ${bin ? "text-orange-400/50" : "text-blue-400/70"}`} />
          </>
        )}

        {renaming ? (
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirmRename(); if (e.key === "Escape") setRenaming(false); }}
            onBlur={confirmRename} onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-white/10 rounded px-1 text-xs text-white focus:outline-none" />
        ) : (
          <span className={`flex-1 text-xs truncate ${bin ? "text-white/35 italic" : ""}`}>{node.name}</span>
        )}

        {hovered && !renaming && (
          <div className="flex items-center gap-0.5 ml-auto shrink-0" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setRenaming(true); setNewName(node.name); }} className="p-0.5 rounded hover:bg-white/10 text-white/30 hover:text-white/70" title="Renomear"><Edit2 size={10} /></button>
            <button onClick={() => onDelete(node.path, node.type)} className="p-0.5 rounded hover:bg-red-500/20 text-white/30 hover:text-red-400" title="Excluir"><Trash2 size={10} /></button>
          </div>
        )}
      </div>

      {node.type === "folder" && node.expanded && node.children.map((child) => (
        <FileTreeItem key={child.path} node={child} depth={depth + 1} activeFile={activeFile}
          onSelect={onSelect} onDelete={onDelete} onRename={onRename} onToggle={onToggle} />
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface PlaygroundProps {
  pendingImport?: boolean;
  onImportDone?: () => void;
}

export function PlaygroundPage({ pendingImport, onImportDone }: PlaygroundProps) {
  const [files, setFiles] = useState<Record<string, string>>(STARTER_FILES);
  const [activeFile, setActiveFile] = useState("index.html");
  const [tree, setTree] = useState<TreeNode[]>(() => buildTree(STARTER_FILES));
  const [preview, setPreview] = useState("");
  const [projectName, setProjectName] = useState("meu-projeto");
  const [saves, setSaves] = useState<PlaygroundSave[]>([]);
  // Carrega saves do IndexedDB na montagem
  useEffect(() => {
    loadPlaygroundSavesIDB().then((s) => setSaves(s)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showSaves, setShowSaves] = useState(false);
  const [fullPreview, setFullPreview] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [githubToken, setGithubToken] = useState(() => localStorage.getItem("juridico_github_token") ?? "");
  const [githubRepo, setGithubRepo] = useState(() => localStorage.getItem("juridico_github_repo") ?? "");
  const [showGithub, setShowGithub] = useState(false);

  // Auto-carrega repos se já tem token salvo — silencioso (sem mensagem de erro)
  useEffect(() => {
    const saved = localStorage.getItem("juridico_github_token");
    if (saved && saved.length > 10) fetchRepos(saved, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [githubStatus, setGithubStatus] = useState("");
  const [githubPagesUrl, setGithubPagesUrl] = useState("");
  const [githubUser, setGithubUser] = useState(() => localStorage.getItem("juridico_github_user") ?? "");
  const [sendName, setSendName] = useState("");
  const [repos, setRepos] = useState<{ full_name: string; private: boolean; updated_at: string }[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [ghTab, setGhTab] = useState<"import" | "send">("import");
  const [importStatus, setImportStatus] = useState("");
  const [copied, setCopied] = useState(false);
  const [chatImport, setChatImport] = useState<{ code: string; lang: string; filename: string } | null>(null);
  const [editorLang, setEditorLang] = useState("");
  const zipRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sideZipRef = useRef<HTMLInputElement>(null);
  const sideFileRef = useRef<HTMLInputElement>(null);

  const rebuildTree = useCallback((f: Record<string, string>) => { setTree(buildTree(f)); }, []);

  // Reset language override when switching files
  useEffect(() => { setEditorLang(""); }, [activeFile]);

  // ── Check for code sent from Chat — aplica direto, sem clique extra ───────
  useEffect(() => {
    if (!pendingImport) return;
    const raw = localStorage.getItem("chat_code_import");
    if (raw) {
      try {
        const data = JSON.parse(raw) as { code: string; lang: string; filename: string; ts: number };
        const fname = data.filename || `codigo.${data.lang || "txt"}`;
        // Aplica imediatamente — sem mostrar banner de confirmação
        setFiles((prev) => {
          const next = { ...prev, [fname]: data.code };
          rebuildTree(next);
          return next;
        });
        setActiveFile(fname);
        setShowGithub(false); // fecha painel GitHub se estiver aberto
        setImportStatus(`✓ "${fname}" recebido do Chat!`);
        setTimeout(() => setImportStatus(""), 3000);
        localStorage.removeItem("chat_code_import");
      } catch { /* ignore */ }
    }
    onImportDone?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingImport]);

  // Mantido apenas para compatibilidade — não é mais usado pelo fluxo principal
  const applyChatImport = () => {
    if (!chatImport) return;
    const fname = chatImport.filename || `codigo.${chatImport.lang || "txt"}`;
    const newFiles = { ...files, [fname]: chatImport.code };
    updateFiles(newFiles);
    setActiveFile(fname);
    localStorage.removeItem("chat_code_import");
    setChatImport(null);
    setImportStatus(`✓ Arquivo "${fname}" importado do chat!`);
    setTimeout(() => setImportStatus(""), 3000);
  };
  const updateFiles = (newFiles: Record<string, string>) => { setFiles(newFiles); rebuildTree(newFiles); };

  // ── File editing ──────────────────────────────────────────────────────────
  const handleEditorChange = (val: string) => { setFiles((prev) => ({ ...prev, [activeFile]: val })); };
  const handleSelectFile = (path: string) => { setActiveFile(path); setPreview(""); };

  // ── Tree mutations ────────────────────────────────────────────────────────
  const handleToggle = (folderPath: string) => {
    const toggle = (nodes: TreeNode[]): TreeNode[] =>
      nodes.map((n) => n.path === folderPath && n.type === "folder" ? { ...n, expanded: !n.expanded }
        : n.type === "folder" ? { ...n, children: toggle(n.children) } : n);
    setTree((prev) => toggle(prev));
  };

  const handleDelete = (path: string, type: "file" | "folder") => {
    if (!confirm(`Excluir ${type === "folder" ? "pasta" : "arquivo"} "${path}"?`)) return;
    const newFiles = { ...files };
    if (type === "file") {
      delete newFiles[path];
      if (activeFile === path) setActiveFile(Object.keys(newFiles)[0] ?? "");
    } else {
      Object.keys(newFiles).forEach((k) => { if (k.startsWith(path + "/") || k === path) delete newFiles[k]; });
      if (activeFile.startsWith(path)) setActiveFile(Object.keys(newFiles)[0] ?? "");
    }
    updateFiles(newFiles);
  };

  const handleRename = (oldPath: string, newName: string) => {
    const parts = oldPath.split("/"); parts[parts.length - 1] = newName;
    const newPath = parts.join("/");
    const newFiles: Record<string, string> = {};
    for (const [k, v] of Object.entries(files)) {
      if (k === oldPath) newFiles[newPath] = v;
      else if (k.startsWith(oldPath + "/")) newFiles[newPath + k.slice(oldPath.length)] = v;
      else newFiles[k] = v;
    }
    if (activeFile === oldPath) setActiveFile(newPath);
    updateFiles(newFiles);
  };

  const handleNewFile = () => {
    const name = prompt("Nome do novo arquivo (ex: pagina.html):") ?? "";
    if (!name.trim()) return;
    updateFiles({ ...files, [name.trim()]: "" });
    setActiveFile(name.trim());
  };

  const handleNewFolder = () => {
    const name = prompt("Nome da pasta:") ?? "";
    if (!name.trim()) return;
    updateFiles({ ...files, [`${name.trim()}/.gitkeep`]: "" });
  };

  const handleCopyContent = () => {
    navigator.clipboard.writeText(files[activeFile] ?? "");
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  // ── Import ZIP — sem filtro, sem limite ──────────────────────────────────
  const handleImportZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus(`Descompactando ${file.name}...`);
    try {
      const zip = await JSZip.loadAsync(file);
      const newFiles: Record<string, string> = {};
      let total = 0, binaryCount = 0;

      for (const [zipPath, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;
        // Remove prefixo de pasta raiz (comum em downloads GitHub)
        const cleanPath = zipPath.replace(/^[^/]+\//, "") || zipPath;
        if (!cleanPath) continue;
        total++;

        const buf = await zipEntry.async("arraybuffer").catch(() => new ArrayBuffer(0));

        if (isBinary(cleanPath)) {
          // Armazena binário como base64 — sem descartar NENHUM arquivo
          newFiles[cleanPath] = bufToB64(buf);
          binaryCount++;
        } else {
          let text: string;
          try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
          } catch {
            text = new TextDecoder("iso-8859-1").decode(buf);
          }
          newFiles[cleanPath] = text;
        }

        if (total % 500 === 0) setImportStatus(`Extraindo... ${total} arquivos`);
      }

      if (Object.keys(newFiles).length > 0) {
        updateFiles(newFiles);
        const first = Object.keys(newFiles).find((k) => !isBinary(k)) ?? Object.keys(newFiles)[0];
        setActiveFile(first);
        setProjectName(file.name.replace(/\.zip$/i, ""));
        setImportStatus(`✓ ${total} arquivo(s) importado(s)${binaryCount > 0 ? ` (${binaryCount} binário(s) preservado(s))` : ""}`);
      } else {
        setImportStatus("ZIP vazio ou sem arquivos.");
      }
    } catch (err) {
      setImportStatus(`Erro ao abrir ZIP: ${err instanceof Error ? err.message : "falha"}`);
    }
    e.target.value = "";
    setTimeout(() => setImportStatus(""), 5000);
  };

  // ── Import file (any type — sem filtro) ──────────────────────────────────
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buf = ev.target?.result as ArrayBuffer;
      if (isBinary(file.name)) {
        // Binário: armazena como base64
        updateFiles({ ...files, [file.name]: bufToB64(buf) });
        setActiveFile(file.name);
        e.target.value = ""; return;
      }
      let content: string;
      try {
        // Tenta UTF-8 strict; se falhar usa Latin-1 (resolve arquivos brasileiros com acentos)
        content = new TextDecoder("utf-8", { fatal: true }).decode(buf);
      } catch {
        content = new TextDecoder("iso-8859-1").decode(buf);
      }
      updateFiles({ ...files, [file.name]: content });
      setActiveFile(file.name);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  // ── Export ZIP — inclui binários corretamente ─────────────────────────────
  const handleExportZip = async () => {
    const zip = new JSZip();
    const folder = zip.folder(projectName) ?? zip;
    for (const [path, content] of Object.entries(files)) {
      if (isBinContent(content)) {
        folder.file(path, b64ToBuf(content));
      } else {
        folder.file(path, content);
      }
    }
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${projectName}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── Visualize ─────────────────────────────────────────────────────────────
  const handleVisualize = () => {
    const htmlKey = Object.keys(files).find((k) => k === "index.html") ?? Object.keys(files).find((k) => k.endsWith(".html")) ?? "";
    const html = files[htmlKey] ?? "";
    if (!html) { alert("Nenhum arquivo .html encontrado."); return; }
    let result = html;
    // Inline all CSS files
    const cssKeys = Object.keys(files).filter((k) => k.endsWith(".css"));
    for (const k of cssKeys) {
      const fname = k.split("/").pop() ?? k;
      result = result.replace(new RegExp(`<link[^>]+href=["']([^"']*${fname})["'][^>]*>`, "gi"), `<style>${files[k]}</style>`);
    }
    // Inline all JS files
    const jsKeys = Object.keys(files).filter((k) => k.endsWith(".js") && !k.endsWith(".min.js"));
    for (const k of jsKeys) {
      const fname = k.split("/").pop() ?? k;
      result = result.replace(new RegExp(`<script[^>]+src=["']([^"']*${fname})["'][^>]*></script>`, "gi"), `<script>${files[k]}</script>`);
    }
    setPreview(result);
    setFullPreview(false);
  };

  // ── VS Code ───────────────────────────────────────────────────────────────
  const handleOpenVSCode = () => {
    if (githubRepo) {
      window.open(`https://vscode.dev/github/${githubRepo}`, "_blank");
    } else {
      // Use StackBlitz for HTML/CSS/JS projects
      const hasHtml = Object.keys(files).some((k) => k.endsWith(".html"));
      if (hasHtml) {
        const form = document.createElement("form");
        form.method = "POST";
        form.action = "https://stackblitz.com/run";
        form.target = "_blank";
        const addField = (name: string, val: string) => {
          const input = document.createElement("input");
          input.type = "hidden"; input.name = name; input.value = val;
          form.appendChild(input);
        };
        addField("project[title]", projectName);
        addField("project[description]", "Projeto do Playground");
        addField("project[template]", "html");
        Object.entries(files).forEach(([path, content]) => {
          if (!content.startsWith("[arquivo binário")) {
            addField(`project[files][${path}]`, content);
          }
        });
        document.body.appendChild(form); form.submit(); document.body.removeChild(form);
      } else {
        window.open("https://vscode.dev/", "_blank");
        setTimeout(() => {
          navigator.clipboard.writeText(files[activeFile] ?? "");
          alert("VS Code aberto! Cole o conteúdo com Ctrl+V.");
        }, 800);
      }
    }
  };

  // ── Save/Load — IndexedDB, sem limite ────────────────────────────────────
  const handleSaveProject = () => {
    const updated: PlaygroundSave[] = [
      { id: crypto.randomUUID(), name: projectName, files, savedAt: Date.now() },
      ...saves.filter((s) => s.name !== projectName),
    ];
    setSaves(updated);
    savePlaygroundIDB(updated).catch(() => {});
  };

  const handleLoadProject = (s: PlaygroundSave) => {
    try {
      const loaded = s.files ?? (s.code ? (() => { try { return JSON.parse(s.code) as Record<string,string>; } catch { return { "index.html": s.code ?? "" }; } })() : {});
      updateFiles(loaded);
      setActiveFile(Object.keys(loaded)[0] ?? "");
      setProjectName(s.name);
      setPreview(""); setShowSaves(false);
    } catch { alert("Erro ao carregar projeto."); }
  };

  // ── GitHub ────────────────────────────────────────────────────────────────
  // Usa ZIP download: 1 request, sem limite de arquivos, sem erros de encoding
  const handleGithubPull = async () => {
    if (!githubToken || !githubRepo) { alert("Configure o token e repositório."); return; }
    const fullRepo = githubRepo.includes("/") ? githubRepo : `${githubUser}/${githubRepo}`;
    const [owner, repo] = fullRepo.split("/");
    const h = { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github.v3+json" };
    setGithubStatus("Buscando lista de arquivos…");
    try {
      // Usa a Git Trees API (sem redirect CORS — funciona direto no browser)
      type GhTree = { tree: { path: string; type: string; sha: string }[]; truncated: boolean };
      let treeData: GhTree | null = null;
      for (const ref of ["HEAD", "main", "master", "develop"]) {
        const r = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`,
          { headers: h }
        );
        if (r.ok) { treeData = await r.json() as GhTree; break; }
      }
      if (!treeData) throw new Error("Repositório não encontrado ou token sem permissão.");

      // Baixa TODOS os arquivos — sem filtro nenhum
      const blobs = treeData.tree.filter((n: { path: string; type: string; sha: string }) => n.type === "blob");
      setGithubStatus(`Baixando ${blobs.length} arquivo(s)…`);

      const newFiles: Record<string, string> = {};
      let done = 0, binaryCount = 0;

      // Baixa em lotes de 8 para não sobrecarregar o rate limit
      const BATCH = 8;
      for (let i = 0; i < blobs.length; i += BATCH) {
        await Promise.all(blobs.slice(i, i + BATCH).map(async (node: { path: string; type: string; sha: string }) => {
          const path = node.path ?? "";
          if (!path) return;
          try {
            const cr = await fetch(
              `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`,
              { headers: h }
            );
            if (!cr.ok) return;
            const cd = await cr.json() as { content?: string; encoding?: string };
            if (cd.encoding === "base64" && cd.content) {
              const b64 = cd.content.replace(/\n/g, "");
              if (isBinary(path)) {
                // Armazena com prefixo [binary:] para compatibilidade com o resto do sistema
                newFiles[path] = "[binary:" + b64 + "]"; binaryCount++;
              } else {
                try {
                  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
                  newFiles[path] = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
                } catch {
                  try {
                    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
                    newFiles[path] = new TextDecoder("iso-8859-1").decode(bytes);
                  } catch {
                    // Fallback: trata como binário se não conseguir decodificar
                    newFiles[path] = "[binary:" + b64 + "]"; binaryCount++;
                  }
                }
              }
            }
          } catch { /* pula arquivo com erro individual */ }
          done++;
        }));
        setGithubStatus(`Baixando… ${done}/${blobs.length}`);
      }

      if (Object.keys(newFiles).length === 0) throw new Error("Nenhum arquivo importado. Verifique o token e o repositório.");
      updateFiles(newFiles);
      setActiveFile(Object.keys(newFiles).find(k => !isBinary(k)) ?? Object.keys(newFiles)[0] ?? "");
      setProjectName(repo);
      setGithubStatus(
        `✓ ${done} arquivo(s) de ${owner}/${repo}` +
        (binaryCount > 0 ? ` (${binaryCount} binário(s))` : "") +
        (treeData.truncated ? " — repositório grande, alguns arquivos omitidos" : "")
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "falha";
      setGithubStatus(`Erro: ${msg}`);
    }
  };

  // Resolve full_name: se já tem "/" usa direto, senão prepend githubUser
  const resolveRepo = (name: string) => {
    const clean = name.trim().replace(/\s+/g, "-").toLowerCase();
    return clean.includes("/") ? clean : `${githubUser}/${clean}`;
  };

  const handleGithubPush = async () => {
    if (!githubToken) { alert("Configure o token primeiro."); return; }
    const fullRepo = resolveRepo(sendName || githubRepo || projectName);
    if (!fullRepo.includes("/") || fullRepo.startsWith("/")) { alert("Não foi possível determinar o usuário GitHub. Tente abrir o painel novamente."); return; }
    const textCount = Object.values(files).filter((v) => v !== "" && !v.startsWith("[arquivo binário")).length;
    setGithubStatus(`Enviando ${textCount} arquivo(s) para "${fullRepo}"...`);
    try {
      const ok = await pushFiles(githubToken, fullRepo, `Salvo via Assistente IA – ${new Date().toLocaleString("pt-BR")}`);
      if (!ok) throw new Error("Não foi possível obter o branch do repositório.");
      const savedName = fullRepo.includes("/") ? fullRepo.split("/")[1] : fullRepo;
      setGithubRepo(savedName);
      localStorage.setItem("juridico_github_repo", savedName);
      if (sendName) setSendName("");
      setGithubStatus(`✓ ${textCount} arquivo(s) enviado(s) para ${fullRepo}!`);
    } catch (e) { setGithubStatus(`Erro: ${e instanceof Error ? e.message : "falha"}`); }
  };

  const handleGithubPublish = async () => {
    if (!githubToken) { alert("Configure o token primeiro."); return; }
    const fullRepo = resolveRepo(sendName || githubRepo || projectName);
    if (!fullRepo.includes("/") || fullRepo.startsWith("/")) { alert("Não foi possível determinar o usuário GitHub. Tente abrir o painel novamente."); return; }
    setGithubStatus("Enviando arquivos...");
    setGithubPagesUrl("");
    try {
      const ok = await pushFiles(githubToken, fullRepo, `Publicado via Assistente IA – ${new Date().toLocaleString("pt-BR")}`);
      if (!ok) throw new Error("Não foi possível obter o branch do repositório.");
      const [owner, repoName] = fullRepo.split("/");
      const headers = { Authorization: `Bearer ${githubToken}`, "Content-Type": "application/json" };
      setGithubStatus("Ativando GitHub Pages...");
      // Try to enable pages (may already exist — ignore errors)
      for (const branch of ["main", "master"]) {
        const r = await fetch(`https://api.github.com/repos/${owner}/${repoName}/pages`, {
          method: "POST", headers,
          body: JSON.stringify({ source: { branch, path: "/" } }),
        });
        if (r.ok || r.status === 409) break;
      }
      const pagesUrl = `https://${owner}.github.io/${repoName}/`;
      setGithubPagesUrl(pagesUrl);
      const savedName2 = fullRepo.includes("/") ? fullRepo.split("/")[1] : fullRepo;
      setGithubRepo(savedName2);
      localStorage.setItem("juridico_github_repo", savedName2);
      if (sendName) setSendName("");
      setGithubStatus("✓ Publicado! Aguarde ~2 min para o site ficar no ar.");
    } catch (e) { setGithubStatus(`Erro: ${e instanceof Error ? e.message : "falha"}`); }
  };

  const fetchRepos = async (token: string, silent = false) => {
    if (!token) return;
    setReposLoading(true);
    if (!silent) setGithubStatus("");
    try {
      const userRes = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${token}` } });
      if (!userRes.ok) {
        if (!silent) setGithubStatus("Token inválido ou expirado — crie um novo token.");
        setReposLoading(false); return;
      }
      const userData = await userRes.json() as { login?: string };
      if (userData.login) { setGithubUser(userData.login); localStorage.setItem("juridico_github_user", userData.login); }
      const res = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { full_name: string; private: boolean; updated_at: string }[];
      if (Array.isArray(data)) { setRepos(data); setGithubStatus(""); }
      else if (!silent) setGithubStatus("Não foi possível carregar os repositórios.");
    } catch {
      // Só mostra erro se não tem repos carregados ainda
      if (!silent) setGithubStatus("Erro ao carregar repositórios. Use 'atualizar' para tentar de novo.");
    }
    setReposLoading(false);
  };

  // Cria o repo se não existir e retorna o full_name
  const ensureRepo = async (token: string, owner: string, repoName: string, headers: Record<string,string>) => {
    const checkRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, { headers });
    if (!checkRes.ok) {
      await fetch("https://api.github.com/user/repos", {
        method: "POST", headers,
        body: JSON.stringify({ name: repoName, description: `Projeto ${repoName}`, auto_init: true, private: false }),
      });
      await new Promise((r) => setTimeout(r, 2500));
    }
  };

  // Envia arquivos para o repo (cria se não existir)
  const pushFiles = async (token: string, fullRepo: string, commitMsg: string): Promise<boolean> => {
    const [owner, repoName] = fullRepo.split("/");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    await ensureRepo(token, owner, repoName, headers);
    // Tenta main, depois master
    let branch = "main";
    let latestSha: string | null = null;
    for (const b of ["main", "master"]) {
      const r = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/ref/heads/${b}`, { headers });
      if (r.ok) { const d = await r.json() as { object?: { sha: string } }; latestSha = d.object?.sha ?? null; branch = b; break; }
    }
    if (!latestSha) return false;
    const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/commits/${latestSha}`, { headers });
    const commitData = await commitRes.json() as { tree?: { sha: string } };
    const baseTreeSha = commitData.tree?.sha;
    const textFiles = Object.entries(files).filter(([, v]) => v !== "" && !v.startsWith("[arquivo binário"));
    const treeItems = await Promise.all(textFiles.map(async ([path, content]) => {
      const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/blobs`, {
        method: "POST", headers,
        body: JSON.stringify({ content: btoa(unescape(encodeURIComponent(content))), encoding: "base64" }),
      });
      const blobData = await blobRes.json() as { sha: string };
      return { path, mode: "100644", type: "blob", sha: blobData.sha };
    }));
    const newTree = await (await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/trees`, {
      method: "POST", headers, body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
    })).json() as { sha: string };
    const newCommit = await (await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/commits`, {
      method: "POST", headers,
      body: JSON.stringify({ message: commitMsg, tree: newTree.sha, parents: [latestSha] }),
    })).json() as { sha: string };
    await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/refs/heads/${branch}`, {
      method: "PATCH", headers, body: JSON.stringify({ sha: newCommit.sha }),
    });
    return true;
  };

  const handleOpenVSCodeGithub = () => {
    if (githubRepo) window.open(`https://vscode.dev/github/${githubRepo}`, "_blank");
    else alert("Configure o repositório GitHub primeiro.");
  };

  const currentContent = files[activeFile] ?? "";
  const fileCount = Object.keys(files).length;
  const isActiveBinary = isBinary(activeFile) || isBinContent(currentContent);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#0f0f0f]">
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/10 bg-[#111111] shrink-0 flex-wrap gap-y-1.5">
        <div className="flex items-center gap-1.5 mr-1">
          <Code2 size={15} className="text-violet-400" />
          <input value={projectName} onChange={(e) => setProjectName(e.target.value)}
            className="bg-transparent text-sm font-semibold text-white/70 focus:outline-none w-32 border-b border-transparent focus:border-violet-500/50" />
          <span className="text-[10px] text-white/25">{fileCount} arq.</span>
        </div>

        <button onClick={handleVisualize} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-bold rounded-lg hover:bg-violet-500 transition-all shadow shadow-violet-600/30">
          <Play size={12} /> Visualizar
        </button>

        <div className="flex items-center gap-0.5 flex-wrap">
          {/* inputs ocultos — fora do label para máxima compatibilidade touch/PWA */}
          <input ref={zipRef}  type="file" accept=".zip,.gz,.tar" className="hidden" onChange={handleImportZip} />
          <input ref={fileRef} type="file" className="hidden" onChange={handleImportFile} />

          {/* Import ZIP — no size limit */}
          <button type="button" onClick={() => zipRef.current?.click()}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:bg-white/5 hover:text-violet-400 cursor-pointer transition-all" title="Importar ZIP (sem limite de tamanho)">
            <Upload size={14} />
          </button>

          {/* Import single file */}
          <button type="button" onClick={() => fileRef.current?.click()}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:bg-white/5 hover:text-white/70 cursor-pointer transition-all" title="Importar arquivo">
            <FilePlus size={14} />
          </button>

          {/* Export ZIP */}
          <button onClick={handleExportZip} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:bg-white/5 hover:text-white/70 transition-all" title="Exportar projeto como ZIP">
            <Download size={14} />
          </button>

          {/* New file */}
          <button onClick={handleNewFile} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:bg-white/5 hover:text-green-400 transition-all" title="Novo arquivo">
            <FilePlus size={14} />
          </button>

          {/* New folder */}
          <button onClick={handleNewFolder} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:bg-white/5 hover:text-yellow-400 transition-all" title="Nova pasta">
            <FolderPlus size={14} />
          </button>

          {/* Save */}
          <button onClick={handleSaveProject} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:bg-white/5 hover:text-violet-400 transition-all" title="Salvar projeto (até 30)">
            <Save size={14} />
          </button>

          {/* Load saved */}
          <button onClick={() => setShowSaves(!showSaves)} className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${showSaves ? "bg-white/10 text-white/70" : "text-white/30 hover:bg-white/5 hover:text-white/70"}`} title="Projetos salvos">
            <FolderOpen size={14} />
          </button>

          {/* GitHub */}
          <button onClick={() => { setShowGithub(!showGithub); if (!showGithub && githubToken && repos.length === 0) fetchRepos(githubToken); }} className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${showGithub ? "bg-white/10 text-white/70" : "text-white/30 hover:bg-white/5 hover:text-white/70"}`} title="GitHub — importar/exportar">
            <Github size={14} />
          </button>

          {/* Open in StackBlitz/VS Code */}
          <button onClick={handleOpenVSCode} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:bg-white/5 hover:text-blue-400 transition-all" title="Abrir no StackBlitz / VS Code Web">
            <ExternalLink size={14} />
          </button>

          {/* Fullscreen preview */}
          <button onClick={() => setFullPreview(!fullPreview)} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:bg-white/5 hover:text-white/70 transition-all" title="Preview em tela cheia">
            {fullPreview ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* ── Chat import banner ───────────────────────────────────────────────── */}
      {chatImport && (
        <div className="px-4 py-2.5 bg-violet-600/15 border-b border-violet-500/25 shrink-0 flex items-center gap-3">
          <Code2 size={13} className="text-violet-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-violet-300">Código recebido do Chat</p>
            <p className="text-[10px] text-violet-400/60 truncate">{chatImport.filename} — {chatImport.lang || "texto"}</p>
          </div>
          <button onClick={applyChatImport}
            className="px-3 py-1 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-500 transition-all shrink-0">
            Importar
          </button>
          <button onClick={() => { setChatImport(null); localStorage.removeItem("chat_code_import"); }}
            className="text-violet-400/40 hover:text-violet-300 shrink-0">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Import status ────────────────────────────────────────────────────── */}
      {importStatus && (
        <div className={`px-4 py-2 text-xs shrink-0 flex items-center gap-2 ${importStatus.startsWith("✓") ? "bg-green-500/10 text-green-400" : importStatus.startsWith("Erro") ? "bg-red-500/10 text-red-400" : "bg-white/5 text-white/50"}`}>
          <RefreshCw size={11} className={importStatus.startsWith("Descompact") ? "animate-spin" : ""} />
          {importStatus}
        </div>
      )}

      {/* ── GitHub painel ─────────────────────────────────────────────────────── */}
      {showGithub && (
        <div className="border-b border-white/10 bg-[#070f1a] shrink-0 overflow-y-auto" style={{ maxHeight: "60vh" }}>
          {/* Cabeçalho */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8 sticky top-0 bg-[#070f1a] z-10">
            <div className="flex items-center gap-2">
              <Github size={14} className="text-white/50" />
              <span className="text-xs font-semibold text-white/60">GitHub</span>
              {githubToken && (
                <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">conectado</span>
              )}
            </div>
            <button onClick={() => setShowGithub(false)} className="text-white/25 hover:text-white/60 p-1">
              <X size={13} />
            </button>
          </div>

          <div className="px-4 py-3 space-y-3">

            {/* ── Token ── */}
            {!githubToken ? (
              <div className="space-y-2">
                <p className="text-[10px] text-white/50 font-semibold uppercase tracking-wider">Cole seu token GitHub</p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      if (v.length > 10) {
                        setGithubToken(v);
                        localStorage.setItem("juridico_github_token", v);
                        fetchRepos(v);
                      }
                    }}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-violet-500/50 font-mono"
                    autoComplete="off"
                  />
                  <a href="https://github.com/settings/tokens/new?scopes=repo&description=Assistente+IA" target="_blank" rel="noopener noreferrer"
                    className="px-3 py-2 text-[10px] text-violet-400 border border-violet-500/20 rounded-xl hover:bg-violet-500/10 transition-all shrink-0 flex items-center gap-1 whitespace-nowrap">
                    <ExternalLink size={10} /> Criar token
                  </a>
                </div>
                <p className="text-[10px] text-white/20 leading-relaxed">
                  Cole o token — detecta a conta automaticamente. Escopo necessário: <strong className="text-white/40">repo</strong> + <strong className="text-white/40">workflow</strong>
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-xl">
                <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                <span className="text-xs text-green-300 flex-1">
                  {githubUser ? `Olá, ${githubUser}!` : "Token configurado"}
                </span>
                <button onClick={() => { setGithubToken(""); setGithubUser(""); setRepos([]); localStorage.removeItem("juridico_github_token"); localStorage.removeItem("juridico_github_user"); }}
                  className="text-[10px] text-white/25 hover:text-red-400 transition-all">trocar</button>
              </div>
            )}

            {/* ── Abas Importar / Enviar ── */}
            {githubToken && (
              <>
                <div className="flex rounded-xl overflow-hidden border border-white/10">
                  <button onClick={() => setGhTab("import")}
                    className={`flex-1 py-2 text-xs font-semibold transition-all ${ghTab === "import" ? "bg-green-600/25 text-green-300" : "bg-white/3 text-white/35 hover:bg-white/6"}`}>
                    ↓ Importar
                  </button>
                  <button onClick={() => setGhTab("send")}
                    className={`flex-1 py-2 text-xs font-semibold transition-all border-l border-white/10 ${ghTab === "send" ? "bg-blue-600/25 text-blue-300" : "bg-white/3 text-white/35 hover:bg-white/6"}`}>
                    ↑ Enviar
                  </button>
                </div>

                {/* ── ABA IMPORTAR ── */}
                {ghTab === "import" && (
                  <div className="space-y-2">

                    {/* Lista de repositórios — carrega automático, é o fluxo principal */}
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">Seus repositórios</p>
                      <button onClick={() => fetchRepos(githubToken)} className="flex items-center gap-1 text-[10px] text-white/25 hover:text-white/50 transition-all">
                        {reposLoading
                          ? <div className="w-3 h-3 border border-white/20 border-t-white/50 rounded-full animate-spin" />
                          : <RefreshCw size={10} />}
                        {!reposLoading && "atualizar"}
                      </button>
                    </div>

                    {reposLoading && repos.length === 0 && (
                      <p className="text-[11px] text-white/30 text-center py-3">Carregando repositórios...</p>
                    )}

                    {repos.length > 0 && (
                      <div className="space-y-1 max-h-52 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#ffffff15 transparent" }}>
                        {repos.map((r) => (
                          <button
                            key={r.full_name}
                            onClick={() => {
                              setGithubRepo(r.full_name);
                              localStorage.setItem("juridico_github_repo", r.full_name);
                              setGithubStatus("");
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all ${githubRepo === r.full_name ? "bg-green-600/20 border border-green-500/30" : "bg-white/3 border border-white/8 hover:bg-white/6"}`}
                          >
                            <Github size={11} className="text-white/25 shrink-0" />
                            <span className="text-[11px] text-white/75 font-mono flex-1 truncate">{r.full_name.split("/")[1]}</span>
                            {r.private && <span className="text-[8px] text-white/20 border border-white/10 px-1 py-0.5 rounded shrink-0">privado</span>}
                            {githubRepo === r.full_name && <Check size={11} className="text-green-400 shrink-0" />}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Fallback manual — se a lista não carregar */}
                    {!reposLoading && repos.length === 0 && (
                      <div>
                        <p className="text-[10px] text-white/30 text-center py-1 mb-1">Lista não carregou — digite o nome:</p>
                        <input
                          type="text"
                          value={githubRepo}
                          onChange={e => { setGithubRepo(e.target.value); localStorage.setItem("juridico_github_repo", e.target.value); setGithubStatus(""); }}
                          placeholder={githubUser ? `${githubUser}/nome-do-repo` : "usuario/nome-do-repo"}
                          className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/80 text-[12px] font-mono placeholder:text-white/20 focus:outline-none focus:border-green-500/40"
                        />
                      </div>
                    )}

                    {/* Botão importar */}
                    <button
                      onClick={handleGithubPull}
                      disabled={!githubRepo.trim()}
                      className="w-full py-2.5 rounded-xl bg-green-600/20 border border-green-500/25 text-green-300 text-sm font-bold hover:bg-green-600/30 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                    >
                      ↓ Importar {githubRepo.trim() ? `"${githubRepo.trim().split("/").pop()}"` : "repositório selecionado"}
                    </button>
                  </div>
                )}

                {/* ── ABA ENVIAR ── */}
                {ghTab === "send" && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] text-white/40 font-semibold uppercase tracking-wider mb-1.5">
                        Nome do repositório
                        {githubUser && <span className="normal-case text-white/20 font-normal"> — será salvo em <strong className="text-white/35">{githubUser}/</strong></span>}
                      </p>
                      <input
                        value={sendName}
                        onChange={(e) => {
                          const v = e.target.value
                            .toLowerCase()
                            .replace(/\s+/g, "-")
                            .replace(/[^a-z0-9\-._]/g, "");
                          setSendName(v);
                        }}
                        placeholder={projectName || "nome-do-projeto"}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-blue-500/40 font-mono"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                      />
                      <p className="text-[10px] text-white/20 mt-1">
                        {sendName
                          ? <>Será salvo em: <strong className="text-white/40">{resolveRepo(sendName)}</strong></>
                          : "Pode ser qualquer nome. Se não existir, cria automaticamente."}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={handleGithubPush}
                        className="py-2.5 rounded-xl bg-blue-600/20 border border-blue-500/25 text-blue-300 text-xs font-bold hover:bg-blue-600/30 transition-all">
                        ↑ Salvar no GitHub
                      </button>
                      <button onClick={handleGithubPublish}
                        className="py-2.5 rounded-xl bg-violet-600/20 border border-violet-500/25 text-violet-300 text-xs font-bold hover:bg-violet-600/30 transition-all">
                        🌐 Publicar site
                      </button>
                    </div>

                    <div className="px-3 py-2 bg-violet-500/8 border border-violet-500/15 rounded-xl">
                      <p className="text-[9px] text-violet-200/50 leading-relaxed">
                        <strong className="text-violet-300">Salvar</strong> = arquivos vão pro GitHub.<br />
                        <strong className="text-violet-300">Publicar</strong> = arquivos vão pro GitHub <em>e</em> vira um site HTTPS ao vivo (<code className="text-violet-300/70">{githubUser || "usuario"}.github.io/nome</code>). Ideal para depois gerar APK.
                      </p>
                    </div>

                    {githubPagesUrl && (
                      <a href={githubPagesUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-between px-3 py-2.5 bg-green-500/10 border border-green-500/25 rounded-xl hover:bg-green-500/15 transition-all group">
                        <div>
                          <p className="text-[10px] font-bold text-green-300">Site publicado!</p>
                          <p className="text-[10px] text-green-400/50 font-mono truncate">{githubPagesUrl}</p>
                        </div>
                        <ExternalLink size={12} className="text-green-400/50 group-hover:text-green-300 shrink-0 ml-2" />
                      </a>
                    )}
                  </div>
                )}

                {/* Status (ambas as abas) */}
                {githubStatus && (
                  <div className={`px-3 py-2 rounded-xl text-xs flex items-start gap-2 ${githubStatus.startsWith("✓") ? "bg-green-500/10 border border-green-500/20 text-green-300" : githubStatus.startsWith("Erro") ? "bg-red-500/10 border border-red-500/20 text-red-300" : "bg-white/5 text-white/50"}`}>
                    {!githubStatus.startsWith("✓") && !githubStatus.startsWith("Erro") && (
                      <div className="w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin shrink-0 mt-0.5" />
                    )}
                    <span>{githubStatus}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Saved projects ───────────────────────────────────────────────────── */}
      {showSaves && (
        <div className="border-b border-white/10 bg-[#0d0d0d] px-4 py-3 shrink-0 max-h-44 overflow-y-auto">
          <p className="text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-2">Projetos salvos ({saves.length}/30)</p>
          {saves.length === 0 && <p className="text-xs text-white/30">Nenhum projeto salvo ainda.</p>}
          <div className="flex flex-col gap-1">
            {saves.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 group">
                <button className="flex-1 text-left" onClick={() => handleLoadProject(s)}>
                  <p className="text-xs text-white/70">{s.name}</p>
                  <p className="text-[10px] text-white/30">{new Date(s.savedAt).toLocaleString("pt-BR")}</p>
                </button>
                <button onClick={() => { const n = saves.filter((x) => x.id !== s.id); setSaves(n); savePlaygroundIDB(n).catch(() => {}); deleteSaveIDB(s.id).catch(() => {}); }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-red-400/50 hover:text-red-400 hover:bg-red-500/10">
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main editor area ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 relative">
        {/* File tree toggle — sempre visível quando fechado */}
        {!fullPreview && sidebarCollapsed && (
          <button onClick={() => setSidebarCollapsed(false)}
            className="w-6 shrink-0 border-r border-white/10 bg-[#0a0a0a] flex flex-col items-center justify-center gap-1.5 hover:bg-white/5 transition-all group"
            title="Abrir painel de arquivos">
            <ChevronRight size={12} className="text-white/25 group-hover:text-violet-400" />
            <span className="text-[8px] text-white/15 group-hover:text-violet-400 [writing-mode:vertical-lr] tracking-widest uppercase">Arquivos</span>
          </button>
        )}

        {/* File tree */}
        {!fullPreview && !sidebarCollapsed && (
          <div className="w-44 sm:w-52 shrink-0 border-r border-white/10 bg-[#0a0a0a] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 shrink-0">
              <span className="text-[9px] uppercase tracking-widest text-white/25 font-semibold">Arquivos ({Object.keys(files).length})</span>
              <div className="flex gap-0.5">
                <button onClick={handleNewFile} className="p-0.5 rounded hover:bg-white/5 text-white/25 hover:text-green-400" title="Novo arquivo"><FilePlus size={11} /></button>
                <button onClick={handleNewFolder} className="p-0.5 rounded hover:bg-white/5 text-white/25 hover:text-yellow-400" title="Nova pasta"><FolderPlus size={11} /></button>
                <button onClick={() => setSidebarCollapsed(true)} className="p-0.5 rounded hover:bg-white/5 text-white/25 hover:text-white/60" title="Fechar painel"><ChevronLeft size={11} /></button>
              </div>
            </div>

            {/* File list */}
            <div className="flex-1 px-1 py-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#ffffff10 transparent" }}>
              {tree.map((node) => (
                <FileTreeItem key={node.path} node={node} depth={0} activeFile={activeFile}
                  onSelect={handleSelectFile} onDelete={handleDelete} onRename={handleRename} onToggle={handleToggle} />
              ))}
            </div>

            {/* ── Import area — always visible ── */}
            <div className="shrink-0 border-t border-white/8 p-2 space-y-1.5">
              <p className="text-[8px] uppercase tracking-widest text-white/20 font-semibold px-1">Importar</p>

              {/* ZIP */}
              <label className="flex items-center gap-2 px-2 py-2 rounded-lg bg-white/3 hover:bg-violet-500/15 border border-white/8 hover:border-violet-500/30 cursor-pointer transition-all group">
                <Upload size={13} className="text-white/30 group-hover:text-violet-400 shrink-0" />
                <span className="text-[11px] text-white/50 group-hover:text-violet-300">ZIP / arquivo</span>
                <input ref={sideZipRef} type="file" accept=".zip,.gz,.tar" className="hidden" onChange={handleImportZip} />
              </label>

              {/* Single file */}
              <label className="flex items-center gap-2 px-2 py-2 rounded-lg bg-white/3 hover:bg-white/6 border border-white/8 cursor-pointer transition-all group">
                <FilePlus size={13} className="text-white/30 group-hover:text-white/60 shrink-0" />
                <span className="text-[11px] text-white/50 group-hover:text-white/70">Arquivo único</span>
                <input ref={sideFileRef} type="file" className="hidden" onChange={handleImportFile} />
              </label>

              {/* GitHub */}
              <button
                onClick={() => { setShowGithub(!showGithub); if (!showGithub && githubToken) fetchRepos(githubToken); }}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg border transition-all ${showGithub ? "bg-white/8 border-white/15 text-white/70" : "bg-white/3 border-white/8 text-white/50 hover:bg-white/6"}`}
              >
                <Github size={13} className="shrink-0" />
                <span className="text-[11px]">GitHub</span>
                {githubToken && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />}
              </button>
            </div>
          </div>
        )}

        {/* Editor */}
        {!fullPreview && (
          <div className="flex-1 flex flex-col min-w-0">
            {/* Tab bar */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10 bg-[#111111] shrink-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-[10px] text-white/30 font-mono truncate max-w-[120px]">{activeFile}</span>
                {isActiveBinary && <span className="text-[9px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded-full shrink-0">binário</span>}
              </div>
              {/* Language selector — like VS Code bottom bar */}
              <select
                value={editorLang || getLanguage(activeFile)}
                onChange={(e) => setEditorLang(e.target.value)}
                title="Linguagem do arquivo"
                className="text-[10px] bg-white/5 text-white/40 hover:text-white/70 border border-white/10 rounded px-1.5 py-0.5 focus:outline-none focus:border-violet-500/40 cursor-pointer mx-2 shrink-0"
              >
                {["Texto","HTML","CSS","JavaScript","TypeScript","JSX","TSX","JSON","Python","Markdown","SQL","Shell","YAML","TOML","Rust","Go","Java","Kotlin","Swift","PHP","Ruby","C#","C++","C","XML","Arquivo"].map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <button onClick={handleCopyContent} className="flex items-center gap-1 text-[10px] text-white/25 hover:text-white/60 px-2 py-1 rounded hover:bg-white/5 shrink-0">
                {copied ? <><Check size={10} className="text-green-400" /><span className="text-green-400">Copiado</span></> : <><Copy size={10} />Copiar</>}
              </button>
            </div>

            {isActiveBinary ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center px-6">
                  <div className="text-4xl mb-3">
                    {/\.(png|jpg|jpeg|gif|webp|bmp|ico)$/i.test(activeFile) ? "🖼️"
                      : /\.(mp4|webm|mov|avi)$/i.test(activeFile) ? "🎬"
                      : /\.(mp3|wav|ogg|flac)$/i.test(activeFile) ? "🎵"
                      : /\.(pdf)$/i.test(activeFile) ? "📄"
                      : /\.(woff|woff2|ttf|otf|eot)$/i.test(activeFile) ? "🔤"
                      : "📦"}
                  </div>
                  <p className="text-white/40 text-sm font-semibold mb-1">Arquivo binário</p>
                  <p className="text-white/25 text-xs font-mono mb-3 break-all">{activeFile}</p>
                  {isBinContent(currentContent) && (
                    <p className="text-white/20 text-[10px]">
                      Tamanho: {(b64ToBuf(currentContent).length / 1024).toFixed(1)} KB · preservado no projeto
                    </p>
                  )}
                  <p className="text-white/15 text-[10px] mt-2">
                    Binários são preservados e exportados corretamente no ZIP.
                  </p>
                </div>
              </div>
            ) : (
              <textarea
                value={currentContent}
                onChange={(e) => handleEditorChange(e.target.value)}
                spellCheck={false}
                className="flex-1 bg-[#0c0c0c] text-emerald-200 font-mono text-xs resize-none p-4 focus:outline-none leading-relaxed"
                style={{ scrollbarWidth: "thin", scrollbarColor: "#ffffff10 transparent", tabSize: 2 }}
                onKeyDown={(e) => {
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const start = e.currentTarget.selectionStart;
                    const end = e.currentTarget.selectionEnd;
                    const val = e.currentTarget.value;
                    const next = val.substring(0, start) + "  " + val.substring(end);
                    handleEditorChange(next);
                    setTimeout(() => { e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2; }, 0);
                  }
                }}
              />
            )}
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div className={`flex flex-col border-l border-white/10 ${fullPreview ? "flex-1" : "w-1/2"}`}>
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#111111] border-b border-white/10 shrink-0">
              <span className="text-[10px] text-white/30">Visualização</span>
              <div className="flex gap-1">
                <button onClick={() => setFullPreview(!fullPreview)} className="p-1 rounded text-white/25 hover:text-white/60 hover:bg-white/5">
                  {fullPreview ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                </button>
                <button onClick={() => setPreview("")} className="p-1 rounded text-white/25 hover:text-red-400 hover:bg-red-500/10">
                  <X size={11} />
                </button>
              </div>
            </div>
            <iframe
              srcDoc={preview}
              sandbox="allow-scripts allow-forms allow-modals"
              className="flex-1 bg-white border-0"
              title="preview"
            />
          </div>
        )}
      </div>
    </div>
  );
}
