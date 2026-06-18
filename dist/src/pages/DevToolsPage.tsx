import { useState, useEffect } from "react";
import {
  Smartphone, Search, CheckCircle2, XCircle, AlertCircle,
  Download, ExternalLink, ChevronDown, ChevronRight,
  Wand2, Copy, Check, FileCode2, Star,
  BookOpen, Terminal, Settings, Key, Eye, EyeOff,
  Save, RotateCcw, Shield, Zap, Github, AlertTriangle, RefreshCw, Database,
} from "lucide-react";

// ─── Shared helpers ────────────────────────────────────────────────────────────
function CodeBlock({ code, title }: { code: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const dl = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
    a.download = title; a.click();
  };
  return (
    <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0a0a14]">
      <div className="flex items-center justify-between px-4 py-2 bg-[#0e1828] border-b border-white/15">
        <div className="flex items-center gap-2"><FileCode2 size={13} className="text-violet-400" /><span className="text-xs text-white/50 font-mono">{title}</span></div>
        <div className="flex gap-2">
          <button onClick={dl} className="text-[10px] text-white/30 hover:text-white/60 px-2 py-1 rounded hover:bg-white/5"><Download size={10} className="inline mr-1" />Baixar</button>
          <button onClick={copy} className="text-[10px] text-white/30 hover:text-white/60 px-2 py-1 rounded hover:bg-white/5">
            {copied ? <><Check size={10} className="inline mr-1 text-green-400" /><span className="text-green-400">Copiado!</span></> : <><Copy size={10} className="inline mr-1" />Copiar</>}
          </button>
        </div>
      </div>
      <pre className="p-4 text-xs text-emerald-300 font-mono overflow-x-auto whitespace-pre-wrap" style={{ maxHeight: 240, overflowY: "auto" }}>{code}</pre>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PWA → APK PAGE
// ══════════════════════════════════════════════════════════════════════════════

function generateManifest(name: string, color: string, basePath: string) {
  return JSON.stringify({
    name, short_name: name.split(" ")[0], description: `Aplicativo ${name}`,
    start_url: basePath || "/", scope: basePath || "/",
    display: "standalone", orientation: "any",
    background_color: color, theme_color: color, lang: "pt-BR",
    icons: [
      { src: `${basePath}icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: `${basePath}icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  }, null, 2);
}

function generateSW(basePath: string) {
  return `const CACHE = "app-cache-v2";
const BASE = "${basePath || "/"}";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll([BASE, BASE + "index.html"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.url.includes("/api/")) return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match(BASE + "index.html")));
    return;
  }
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request);
      const fresh = fetch(e.request).then((r) => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => cached);
      return cached || fresh;
    })
  );
});`;
}

function generateIndexSnippet(basePath: string) {
  return `<!-- Cole no <head> do seu index.html -->
<link rel="manifest" href="manifest.webmanifest" />
<meta name="theme-color" content="#0f0f0f" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Meu App" />
<link rel="apple-touch-icon" href="icon-192.png" />

<!-- Cole antes do </body> -->
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('${basePath || "/"}sw.js').catch(() => {});
    });
  }
</script>`;
}

interface CheckResult { label: string; ok: boolean; warn?: boolean; detail: string; fix?: string; }

async function analyzeUrl(url: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const isHttps = url.startsWith("https://");
  results.push({ label: "HTTPS", ok: isHttps, detail: isHttps ? "Site usa HTTPS — obrigatório para PWA." : "Site precisa de HTTPS.", fix: isHttps ? undefined : "Use Netlify, Vercel ou Cloudflare Pages." });
  let html = "";
  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
    const data = await res.json() as { contents?: string };
    html = data.contents ?? "";
  } catch {
    results.push({ label: "Acesso à página", ok: false, detail: "Não foi possível acessar a URL.", fix: "Verifique se o site está no ar." });
    return results;
  }
  results.push({ label: "Manifest", ok: /manifest\.webmanifest|manifest\.json/i.test(html), detail: /manifest\.webmanifest|manifest\.json/i.test(html) ? "Manifest encontrado." : "Nenhum manifest encontrado.", fix: /manifest\.webmanifest|manifest\.json/i.test(html) ? undefined : 'Adicione <link rel="manifest" href="manifest.webmanifest" /> no <head>.' });
  results.push({ label: "Service Worker", ok: /serviceWorker|sw\.js/i.test(html), detail: /serviceWorker|sw\.js/i.test(html) ? "Service Worker encontrado." : "Service Worker não encontrado.", fix: /serviceWorker|sw\.js/i.test(html) ? undefined : "Crie sw.js e registre com navigator.serviceWorker.register('sw.js')." });
  results.push({ label: "theme-color", ok: /theme-color/i.test(html), warn: !/theme-color/i.test(html), detail: /theme-color/i.test(html) ? "theme-color definido." : "theme-color não encontrado.", fix: /theme-color/i.test(html) ? undefined : 'Adicione <meta name="theme-color" content="#000000" />.' });
  results.push({ label: "Apple PWA", ok: /apple-mobile-web-app-capable/i.test(html), warn: !/apple-mobile-web-app-capable/i.test(html), detail: /apple-mobile-web-app-capable/i.test(html) ? "Suporte Apple configurado." : "Suporte Apple não configurado.", fix: /apple-mobile-web-app-capable/i.test(html) ? undefined : 'Adicione <meta name="apple-mobile-web-app-capable" content="yes" />.' });
  results.push({ label: "Viewport responsivo", ok: /viewport/i.test(html), detail: /viewport/i.test(html) ? "Viewport configurado." : "Viewport não encontrado.", fix: /viewport/i.test(html) ? undefined : 'Adicione <meta name="viewport" content="width=device-width, initial-scale=1.0" />.' });
  return results;
}

const APK_TOOLS = [
  { id: "pwabuilder", name: "PWABuilder", badge: "Gratuito", badgeColor: "green", ease: 3, url: "https://pwabuilder.com", desc: "Ferramenta oficial da Microsoft. Analisa o PWA e gera o APK completo com assinatura digital. Permite enviar à Play Store.", steps: ["Acesse pwabuilder.com", "Cole o link do seu app publicado", "Clique em Start → aguarde análise", "Clique em Android → Store package", "Baixe o .zip com o APK", "Mande pelo WhatsApp para instalar"] },
  { id: "median", name: "Median.co", badge: "Pago ($)", badgeColor: "orange", ease: 3, url: "https://median.co", desc: "O mais simples. Cole a URL, configure ícone e cores, em minutos baixa o APK. Não precisa saber programar.", steps: ["Acesse median.co e crie uma conta", "Clique em New App → Cole a URL", "Configure nome, ícone e cores", "Clique em Build Android", "Baixe o APK gerado (plano pago)"] },
  { id: "capacitor", name: "Capacitor (Ionic)", badge: "Gratuito", badgeColor: "green", ease: 1, url: "https://capacitorjs.com", desc: "Converte qualquer app web em APK Android/iOS. Requer Node.js e Android Studio no computador.", steps: ["Instale Node.js no PC", "npm install @capacitor/core @capacitor/cli @capacitor/android", "Execute: npx cap init", "Build do projeto: npm run build", "npx cap add android", "npx cap open android (abre Android Studio)", "Build → Generate Signed APK"] },
  { id: "eas", name: "Expo EAS Build", badge: "Gratuito", badgeColor: "green", ease: 2, url: "https://expo.dev/eas", desc: "Para apps Expo/React Native. Gera o APK na nuvem sem precisar do Android Studio.", steps: ["Crie conta gratuita em expo.dev", "npm install -g eas-cli", "eas login", "eas build:configure", "eas build -p android --profile preview", "Aguarde ~10 min", "Baixe o APK no painel do expo.dev"] },
];

function Stars({ n }: { n: number }) {
  return <div className="flex gap-0.5">{[1,2,3].map((i) => <Star key={i} size={10} className={i <= n ? "text-yellow-400 fill-yellow-400" : "text-white/15"} />)}</div>;
}

const PROD_URL = "https://insight-dashboard-meulegale1.replit.app/assistente/";
// URL pública real (dev preview ou produção — injetado pelo vite.config.ts)
const PUBLIC_APP_URL: string =
  (import.meta.env.VITE_APP_URL as string | undefined) ?? PROD_URL;
const EAS_SLUG = "assistente-ia-juridico";
const EAS_GQL = "https://api.expo.dev/graphql";

// GitHub Actions workflow file pushed automaticamente
const EAS_WORKFLOW = `name: EAS Build — APK Android
on:
  workflow_dispatch:
  push:
    branches: [main, master]

jobs:
  build:
    name: Gerar APK Android
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Instalar dependências
        run: npm install --legacy-peer-deps
      - name: Instalar EAS CLI
        run: npm install -g eas-cli
      - name: Build APK Android
        run: eas build --platform android --profile preview --non-interactive
        env:
          EXPO_TOKEN: \${{ secrets.EXPO_TOKEN }}
`;

// EAS JSON mínimo para build preview (gera .apk, não .aab)
const EAS_JSON = JSON.stringify({
  cli: { version: ">= 12.0.0" },
  build: {
    preview: { android: { buildType: "apk" } },
    production: { android: { buildType: "app-bundle" } },
  },
  submit: { production: {} },
}, null, 2);

interface EasBuild {
  id: string; status: string; platform: string;
  createdAt: string; artifacts: { buildUrl: string | null } | null; appVersion: string | null;
}

async function easRequest(token: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch(EAS_GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`EAS API: ${res.status}`);
  const json = await res.json() as { data?: unknown; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

async function ghPushFile(ghToken: string, owner: string, repo: string, path: string, content: string, msg: string) {
  const headers = { Authorization: `Bearer ${ghToken}`, "Content-Type": "application/json" };
  // Verifica se existe (para pegar o sha e fazer update)
  let sha: string | undefined;
  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, { headers });
    if (r.ok) { const d = await r.json() as { sha: string }; sha = d.sha; }
  } catch { /* arquivo novo */ }
  const body: Record<string, string> = { message: msg, content: btoa(unescape(encodeURIComponent(content))) };
  if (sha) body.sha = sha;
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT", headers, body: JSON.stringify(body),
  });
  if (!res.ok) { const err = await res.json() as { message?: string }; throw new Error(err.message ?? `GitHub: ${res.status}`); }
}

async function ghTriggerWorkflow(ghToken: string, owner: string, repo: string) {
  const headers = { Authorization: `Bearer ${ghToken}`, "Content-Type": "application/json" };
  for (const ref of ["main", "master"]) {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/eas-build.yml/dispatches`, {
      method: "POST", headers, body: JSON.stringify({ ref }),
    });
    if (res.ok || res.status === 204) return;
  }
}

function EasBuildSection() {
  const [easToken, setEasToken] = useState(() => localStorage.getItem("eas_token") ?? "");
  const [ghToken] = useState(() => localStorage.getItem("juridico_github_token") ?? "");
  const [ghRepo, setGhRepo] = useState(() => localStorage.getItem("juridico_github_repo") ?? "");
  const [showEas, setShowEas] = useState(false);
  const [username, setUsername] = useState(() => localStorage.getItem("eas_username") ?? "");
  const [appId, setAppId] = useState(() => localStorage.getItem("eas_appid") ?? "");
  const [builds, setBuilds] = useState<EasBuild[]>([]);
  const [loading, setLoading] = useState(false);
  const [directLoading, setDirectLoading] = useState(false);
  const [ghLoading, setGhLoading] = useState(false);
  const [log, setLog] = useState<{ text: string; type: "ok" | "err" | "info" | "warn" }[]>([]);
  const [polling, setPolling] = useState<string | null>(null);
  const [secretUrl, setSecretUrl] = useState("");

  const addLog = (text: string, type: "ok" | "err" | "info" | "warn" = "info") =>
    setLog((p) => [...p, { text, type }]);

  const saveEasToken = (t: string) => { setEasToken(t); localStorage.setItem("eas_token", t); };

  const statusColor = (s: string) => ({ FINISHED: "text-green-400", IN_PROGRESS: "text-yellow-400", IN_QUEUE: "text-yellow-400", ERRORED: "text-red-400", CANCELLED: "text-red-400" })[s] ?? "text-white/40";
  const statusLabel = (s: string) => ({ FINISHED: "✓ APK pronto", IN_PROGRESS: "⏳ Compilando...", IN_QUEUE: "⏳ Na fila...", ERRORED: "✗ Erro", CANCELLED: "✗ Cancelado" })[s] ?? s;

  // Resolve username + appId e busca builds
  const fetchBuilds = async (token = easToken) => {
    if (!token.trim()) return;
    setLoading(true); setLog([]);
    try {
      const meData = await easRequest(token, `query { me { username } }`) as { me: { username: string } };
      const uname = meData.me.username;
      setUsername(uname); localStorage.setItem("eas_username", uname);

      const appData = await easRequest(token,
        `query($appFullName: String!) { app { byFullName(fullName: $appFullName) { id slug } } }`,
        { appFullName: `@${uname}/${EAS_SLUG}` }
      ) as { app: { byFullName: { id: string; slug: string } | null } };

      const aid = appData.app.byFullName?.id ?? "";
      if (aid) { setAppId(aid); localStorage.setItem("eas_appid", aid); }

      const buildsData = await easRequest(token,
        `query($appFullName: String!) { app { byFullName(fullName: $appFullName) { builds(limit: 10, filter: { platform: ANDROID }) { edges { node { id status platform createdAt appVersion artifacts { buildUrl } } } } } } }`,
        { appFullName: `@${uname}/${EAS_SLUG}` }
      ) as { app: { byFullName: { builds: { edges: { node: EasBuild }[] } } | null } };
      const list = buildsData.app.byFullName?.builds.edges.map((e) => e.node) ?? [];
      setBuilds(list);
      if (list.length === 0) addLog("Nenhum build ainda. Clique em Disparar para criar o primeiro.", "info");
      else addLog(`✓ ${list.length} build(s) encontrado(s)`, "ok");
    } catch (e) {
      addLog(`Erro: ${e instanceof Error ? e.message : "token inválido ou projeto não encontrado"}`, "err");
    }
    setLoading(false);
  };

  // ── DISPARO DIRETO via API do Expo (sem GitHub) ──────────────────────────────
  const handleDirectBuild = async () => {
    if (!easToken.trim()) { addLog("Cole seu token EAS primeiro.", "err"); return; }
    setDirectLoading(true); setLog([]);
    try {
      addLog("1/3 — Verificando token Expo...");
      const meData = await easRequest(easToken, `query { me { username } }`) as { me: { username: string } };
      const uname = meData.me.username;
      setUsername(uname); localStorage.setItem("eas_username", uname);
      addLog(`✓ Conta: @${uname}`, "ok");

      addLog("2/3 — Buscando ID do projeto...");
      const appData = await easRequest(easToken,
        `query($appFullName: String!) { app { byFullName(fullName: $appFullName) { id slug } } }`,
        { appFullName: `@${uname}/${EAS_SLUG}` }
      ) as { app: { byFullName: { id: string } | null } };
      const aid = appData.app.byFullName?.id;
      if (!aid) {
        addLog(`Projeto @${uname}/${EAS_SLUG} não encontrado no Expo.`, "err");
        addLog("→ Crie o projeto primeiro em expo.dev ou abra o painel abaixo.", "warn");
        setDirectLoading(false); return;
      }
      setAppId(aid); localStorage.setItem("eas_appid", aid);
      addLog(`✓ Projeto encontrado (ID: ${aid.slice(0,8)}…)`, "ok");

      addLog("3/3 — Disparando build Android...");
      const buildData = await easRequest(easToken,
        `mutation CreateBuild($input: BuildInput!) { build { createBuild(input: $input) { build { id status platform } } } }`,
        { input: { appId: aid, platform: "ANDROID", buildProfile: "preview" } }
      ) as { build: { createBuild: { build: EasBuild } } };
      const newBuild = buildData.build.createBuild.build;
      setBuilds((p) => [newBuild, ...p]);
      addLog(`✓ Build iniciado! ID: ${newBuild.id.slice(0, 8)}… — aguarde ~10 min`, "ok");
      addLog("Use 'Monitorar' na lista abaixo para ver quando ficar pronto.", "info");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "falha";
      addLog(`Erro: ${msg}`, "err");
      if (msg.includes("GitHub") || msg.includes("source") || msg.includes("git")) {
        addLog("O Expo precisa do código-fonte via GitHub. Configure a integração em expo.dev.", "warn");
      } else if (msg.includes("not found") || msg.includes("404")) {
        addLog("Projeto não encontrado. Verifique o slug ou crie em expo.dev.", "warn");
      }
      if (username) {
        addLog(`→ Abra o painel em expo.dev/accounts/${username}/projects/${EAS_SLUG}/builds`, "warn");
      }
    }
    setDirectLoading(false);
  };

  // ── DISPARO via GitHub Actions (fallback com código-fonte) ───────────────────
  const handleGhBuild = async () => {
    if (!easToken.trim() || !ghToken.trim() || !ghRepo.trim()) return;
    const uname = username;
    const [owner, repo] = ghRepo.includes("/") ? ghRepo.split("/") : [uname || "?", ghRepo];
    setGhLoading(true); setLog([]);
    try {
      addLog("1/3 — Verificando conta Expo...");
      const meData = await easRequest(easToken, `query { me { username } }`) as { me: { username: string } };
      addLog(`✓ @${meData.me.username}`, "ok");

      addLog("2/3 — Enviando arquivos para GitHub...");
      await ghPushFile(ghToken, owner, repo, "eas.json", EAS_JSON, "ci: add eas.json");
      await ghPushFile(ghToken, owner, repo, ".github/workflows/eas-build.yml", EAS_WORKFLOW, "ci: add EAS Build workflow");
      addLog("✓ Arquivos enviados", "ok");

      addLog("3/3 — Disparando build...");
      await ghTriggerWorkflow(ghToken, owner, repo);
      addLog("✓ Build disparado no GitHub Actions!", "ok");
      setSecretUrl(`https://github.com/${owner}/${repo}/settings/secrets/actions/new`);
      await new Promise((r) => setTimeout(r, 5000));
      await fetchBuilds();
    } catch (e) {
      addLog(`Erro: ${e instanceof Error ? e.message : "falha"}`, "err");
    }
    setGhLoading(false);
  };

  // Monitora um build
  const pollBuild = async (buildId: string) => {
    setPolling(buildId);
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 15000));
      try {
        const data = await easRequest(easToken,
          `query($id: ID!) { builds(filter: { buildId: $id }) { edges { node { id status artifacts { buildUrl } } } } }`,
          { id: buildId }
        ) as { builds: { edges: { node: EasBuild }[] } };
        const b = data.builds.edges[0]?.node;
        if (!b) break;
        setBuilds((prev) => prev.map((x) => x.id === buildId ? { ...x, ...b } : x));
        if (["FINISHED", "ERRORED", "CANCELLED"].includes(b.status)) break;
      } catch { break; }
    }
    setPolling(null);
  };

  const hasDirect = easToken.trim().length > 0;
  const hasGh = hasDirect && ghToken.trim().length > 0 && ghRepo.trim().length > 0;

  return (
    <div className="bg-[#0a1a0e] border border-green-500/25 rounded-2xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Zap size={15} className="text-green-400" />
        <span className="text-sm font-bold text-white">EAS Build — Gerar APK direto</span>
        <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold">Gratuito</span>
      </div>

      {/* Token EAS */}
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-1.5">Token EAS (expo.dev)</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input type={showEas ? "text" : "password"} value={easToken} onChange={(e) => saveEasToken(e.target.value)}
              placeholder="expo_xxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-green-500/50 font-mono pr-8" />
            <button onClick={() => setShowEas(!showEas)} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60">
              {showEas ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          <button onClick={() => fetchBuilds()} disabled={loading || !easToken.trim()}
            className="px-3 py-2.5 bg-white/5 border border-white/10 text-white/50 text-xs font-bold rounded-xl hover:bg-white/10 disabled:opacity-30 transition-all flex items-center gap-1.5 shrink-0">
            {loading ? <div className="w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" /> : <RefreshCw size={12} />}
            Checar
          </button>
        </div>
        {username && (
          <p className="text-[10px] text-green-400/70 mt-1">✓ Conectado como <strong>@{username}</strong></p>
        )}
        {!easToken && (
          <a href="https://expo.dev/settings/access-tokens" target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-green-400/70 hover:text-green-400 mt-1 inline-flex items-center gap-1">
            <ExternalLink size={9} /> Criar token em expo.dev → Settings → Access Tokens
          </a>
        )}
      </div>

      {/* ── Botão DISPARAR DIRETO ── */}
      <button
        onClick={handleDirectBuild}
        disabled={directLoading || !hasDirect}
        className="w-full py-4 bg-green-700 hover:bg-green-600 disabled:opacity-30 text-white text-base font-bold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-700/30 active:scale-95"
      >
        {directLoading
          ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Disparando build...</>
          : <><Zap size={18} />Gerar APK agora (direto no EAS)</>}
      </button>

      {/* Se tiver GitHub configurado — mostrar opção adicional */}
      {hasGh && (
        <div className="space-y-2">
          <p className="text-[10px] text-white/25 uppercase tracking-widest font-semibold">Alternativa — via GitHub Actions</p>
          <div className="flex gap-2">
            <input value={ghRepo} onChange={(e) => { setGhRepo(e.target.value); localStorage.setItem("juridico_github_repo", e.target.value); }}
              placeholder="usuario/repositorio"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-green-500/50 font-mono" />
            <button onClick={handleGhBuild} disabled={ghLoading}
              className="px-3 py-2 bg-white/8 border border-white/15 text-white/50 text-xs font-bold rounded-xl hover:bg-white/15 disabled:opacity-30 transition-all flex items-center gap-1.5 shrink-0">
              {ghLoading ? <div className="w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" /> : <Github size={12} />}
              GitHub
            </button>
          </div>
        </div>
      )}

      {/* Log */}
      {log.length > 0 && (
        <div className="bg-[#060e06] border border-white/8 rounded-xl p-3 space-y-1">
          {log.map((l, i) => (
            <p key={i} className={`text-[11px] font-mono ${l.type === "ok" ? "text-green-400" : l.type === "err" ? "text-red-400" : l.type === "warn" ? "text-yellow-400" : "text-white/45"}`}>{l.text}</p>
          ))}
        </div>
      )}

      {/* Aviso de secret GitHub */}
      {secretUrl && (
        <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-xl p-3 space-y-2">
          <p className="text-xs font-bold text-yellow-300">⚠ Adicione o EXPO_TOKEN no GitHub para funcionar</p>
          <div className="flex gap-1.5 flex-col text-[10px]">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-black/30 rounded-lg">
              <span className="text-white/40">Name:</span><code className="text-emerald-300 font-mono">EXPO_TOKEN</code>
            </div>
            <div className="flex items-center gap-2 px-2 py-1.5 bg-black/30 rounded-lg">
              <span className="text-white/40">Value:</span><code className="text-emerald-300 font-mono">seu token EAS acima</code>
            </div>
          </div>
          <a href={secretUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-yellow-600 text-white text-xs font-bold rounded-lg hover:bg-yellow-500 transition-all">
            <ExternalLink size={12} /> Abrir configuração do GitHub
          </a>
        </div>
      )}

      {/* Atalho: painel expo.dev */}
      {username && (
        <button
          onClick={() => { const u = `https://expo.dev/accounts/${username}/projects/${EAS_SLUG}/builds`; const w = window.open(u, "_blank"); if (!w) window.location.href = u; }}
          className="w-full py-2 bg-white/5 border border-white/10 text-white/35 text-xs font-bold rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-1.5"
        >
          <ExternalLink size={12} /> Ver todos os builds em expo.dev
        </button>
      )}

      {/* Lista de builds */}
      {builds.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-white/25 font-semibold">Builds</p>
          {builds.map((b) => (
            <div key={b.id} className="flex items-center gap-3 px-3 py-2.5 bg-white/3 border border-white/8 rounded-xl">
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold ${statusColor(b.status)}`}>{statusLabel(b.status)}</p>
                <p className="text-[10px] text-white/30 font-mono">v{b.appVersion ?? "?"} · {new Date(b.createdAt).toLocaleDateString("pt-BR")}</p>
              </div>
              {b.status === "FINISHED" && b.artifacts?.buildUrl ? (
                <a href={b.artifacts.buildUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-[11px] font-bold rounded-lg hover:bg-green-500 transition-all shrink-0">
                  <Download size={11} /> Baixar APK
                </a>
              ) : ["IN_PROGRESS", "IN_QUEUE"].includes(b.status) ? (
                <button onClick={() => pollBuild(b.id)} disabled={polling === b.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-600/30 text-yellow-300 text-[11px] font-bold rounded-lg disabled:opacity-50 shrink-0">
                  <RefreshCw size={11} className={polling === b.id ? "animate-spin" : ""} />
                  {polling === b.id ? "Aguardando..." : "Monitorar"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// APK WIZARD — analisa, corrige e envia tudo pro GitHub com 1 botão
// ══════════════════════════════════════════════════════════════════════════════
function ApkWizardBlock({ appUrl, setAppUrl }: { appUrl: string; setAppUrl: (v: string) => void }) {
  const [ghToken, setGhToken] = useState(() => localStorage.getItem("juridico_github_token") ?? "");
  const [ghUser,  setGhUser]  = useState(() => localStorage.getItem("juridico_github_user")  ?? "");
  const [ghRepo,  setGhRepo]  = useState(() => localStorage.getItem("juridico_github_repo")  ?? "");
  const [tokenLoading, setTokenLoading] = useState(false);
  const [repos, setRepos] = useState<{ name: string; full_name: string }[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [iconColor, setIconColor] = useState("#7c3aed");
  const [iconEmoji, setIconEmoji] = useState("⚖️");
  const [appName,  setAppName]  = useState("Assistente IA Jurídico");
  const [analyzing, setAnalyzing] = useState(false);
  const [checks, setChecks] = useState<{
    manifest: boolean; icon192: boolean; icon512: boolean; sw: boolean; manifestUrl: string;
  } | null>(null);
  type StepSt = "idle"|"loading"|"ok"|"err";
  const [steps, setSteps] = useState<{ label: string; st: StepSt }[]>([]);
  const [running, setRunning] = useState(false);
  const [actionUrl, setActionUrl] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  type ApkMethod = "twa" | "capacitor" | "pwabuilder";
  const [apkMethod, setApkMethod] = useState<ApkMethod>("twa");

  const loadRepos = async (token: string) => {
    if (!token.trim()) return;
    setReposLoading(true);
    try {
      const r = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner", {
        headers: { Authorization: `Bearer ${token.trim()}`, Accept: "application/vnd.github.v3+json" }
      });
      if (r.ok) {
        const d = await r.json() as { name: string; full_name: string }[];
        if (Array.isArray(d)) setRepos(d);
      }
    } catch { /* silencioso */ }
    setReposLoading(false);
  };

  // Auto-carrega conta + repos se token já salvo
  useEffect(() => {
    const t = localStorage.getItem("juridico_github_token");
    if (t && t.length > 10) loadRepos(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveToken = async (v: string) => {
    setGhToken(v);
    localStorage.setItem("juridico_github_token", v);
    if (!v.trim()) { setGhUser(""); setRepos([]); localStorage.removeItem("juridico_github_user"); return; }
    setTokenLoading(true);
    try {
      const r = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${v.trim()}`, Accept: "application/vnd.github.v3+json" }
      });
      if (r.ok) {
        const d = await r.json() as { login?: string };
        const login = d.login ?? "";
        setGhUser(login);
        localStorage.setItem("juridico_github_user", login);
        loadRepos(v); // carrega repos automaticamente após detectar conta
      } else {
        setGhUser(""); localStorage.removeItem("juridico_github_user");
      }
    } catch { setGhUser(""); }
    setTokenLoading(false);
  };
  // Extrai só o nome do repo — aceita "repo", "owner/repo" ou URL completa
  const getRepoName = () => {
    let v = ghRepo.trim()
      .replace(/^https?:\/\/github\.com\/[^/]+\//, "") // strip URL prefix
      .replace(/\/$/, "");
    // Se ainda tem "/" (formato owner/repo), pega só a parte depois da "/"
    if (v.includes("/")) v = v.split("/").pop() ?? v;
    return v;
  };

  const saveRepo = (v: string) => { setGhRepo(v); localStorage.setItem("juridico_github_repo", v); };

  // ── GitHub push helpers ───────────────────────────────────────────────────────
  const getRepo = () => {
    const repoName = getRepoName();
    const user = ghUser.trim();
    if (!user || !repoName) return "";
    return `${user}/${repoName}`;
  };

  // Cria repositório se não existir
  const ensureRepo = async (): Promise<boolean> => {
    const repoName = getRepoName();
    const token = ghToken.trim();
    if (!repoName || !token || !ghUser.trim()) return false;
    // Verifica se já existe
    const check = await fetch(`https://api.github.com/repos/${ghUser}/${repoName}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" }
    });
    if (check.ok) return true; // já existe
    // Cria
    const create = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
      body: JSON.stringify({ name: repoName, private: false, auto_init: true, description: appName })
    });
    if (create.ok) { await new Promise(r => setTimeout(r, 2000)); return true; }
    return false;
  };

  const ghPut = async (path: string, b64: string, msg: string): Promise<boolean> => {
    const token = ghToken.trim(); const repo = getRepo();
    if (!token || !repo) return false;
    const url = `https://api.github.com/repos/${repo}/contents/${path}`;
    const h = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" };
    let sha: string | undefined;
    try { const g = await fetch(url, { headers: h }); if (g.ok) { const d = await g.json() as { sha?: string }; sha = d.sha; } } catch { /* novo */ }
    const r = await fetch(url, { method: "PUT", headers: h, body: JSON.stringify({ message: msg, content: b64, ...(sha ? { sha } : {}) }) });
    return r.ok;
  };

  const pushText = (path: string, content: string) =>
    ghPut(path, btoa(unescape(encodeURIComponent(content))), `🤖 ${path}`);

  // ── Icon generator ────────────────────────────────────────────────────────────
  const genIconB64 = (size: number, color: string, emoji: string): string => {
    const c = document.createElement("canvas"); c.width = size; c.height = size;
    const ctx = c.getContext("2d")!;
    // Gradient background
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, color);
    // Darken for second stop
    const hex2rgb = (h: string) => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
    const [r, gv, b] = hex2rgb(color.length === 7 ? color : "#7c3aed");
    g.addColorStop(1, `rgb(${Math.max(0,r-40)},${Math.max(0,gv-40)},${Math.max(0,b-20)})`);
    ctx.fillStyle = g;
    // Rounded rect (safe radius)
    const rad = size * 0.2;
    ctx.beginPath();
    ctx.moveTo(rad, 0); ctx.lineTo(size - rad, 0);
    ctx.quadraticCurveTo(size, 0, size, rad);
    ctx.lineTo(size, size - rad);
    ctx.quadraticCurveTo(size, size, size - rad, size);
    ctx.lineTo(rad, size);
    ctx.quadraticCurveTo(0, size, 0, size - rad);
    ctx.lineTo(0, rad);
    ctx.quadraticCurveTo(0, 0, rad, 0);
    ctx.closePath();
    ctx.fill();
    // Emoji
    ctx.font = `${Math.floor(size * 0.46)}px serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(emoji, size / 2, size * 0.54);
    return c.toDataURL("image/png").split(",")[1];
  };

  // ── Content generators ────────────────────────────────────────────────────────
  const makeManifest = () => {
    const base = appUrl.replace(/\/$/, "");
    let pathname = "/";
    try { pathname = new URL(base).pathname.replace(/\/?$/, "/"); } catch { /* skip */ }
    return JSON.stringify({
      name: appName,
      short_name: appName.split(" ").slice(-2).join(" "),
      description: `${appName} — assistente jurídico com inteligência artificial`,
      lang: "pt-BR",
      start_url: pathname,
      scope: pathname,
      display: "standalone",
      orientation: "portrait",
      theme_color: iconColor,
      background_color: "#0d1520",
      categories: ["business", "productivity"],
      icons: [
        { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
        { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
      screenshots: [
        { src: "icon-512.png", sizes: "512x512", type: "image/png", form_factor: "narrow" }
      ],
    }, null, 2);
  };

  const makeSW = () => {
    const base = appUrl.replace(/\/$/, "");
    let pathname = "/";
    try { pathname = new URL(base).pathname.replace(/\/?$/, "/"); } catch { /* skip */ }
    return `// Service Worker — gerado automaticamente
const CACHE = 'pwa-v1';
const SHELL = ['${pathname}'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});`;
  };

  const makeWorkflow = (manifestUrl: string) =>
`name: Gerar APK Android
on:
  workflow_dispatch:
  push:
    branches: [main]
    paths: ['.github/workflows/generate-apk.yml', 'manifest.webmanifest']
jobs:
  build-apk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Java 17 (fix Gradle)
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
          cache: 'gradle'

      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      - name: Android SDK
        uses: android-actions/setup-android@v3

      - name: SDK licenses + build tools
        run: |
          yes | sdkmanager --licenses || true
          sdkmanager "build-tools;34.0.0" "platforms;android-34" "platform-tools" || true

      - name: Exportar variáveis Android/Java
        run: |
          JAVA17="\${JAVA_HOME_17_X64:-\$JAVA_HOME}"
          echo "JAVA_HOME=\$JAVA17"         >> \$GITHUB_ENV
          echo "ANDROID_HOME=\$ANDROID_SDK_ROOT" >> \$GITHUB_ENV
          echo "\$JAVA17/bin"               >> \$GITHUB_PATH

      - name: Instalar Bubblewrap
        run: npm install -g @bubblewrap/cli

      - name: Init TWA
        run: |
          mkdir -p apk-build && cd apk-build
          bubblewrap init --manifest "${manifestUrl}" --directory . --skipPwaValidation 2>&1 || true

      - name: Build APK
        working-directory: apk-build
        run: |
          export JAVA_HOME="\${JAVA_HOME_17_X64:-\$JAVA_HOME}"
          export ANDROID_HOME="\${ANDROID_SDK_ROOT:-\$ANDROID_HOME}"
          export PATH="\$JAVA_HOME/bin:\$PATH"
          bubblewrap build --skipPwaValidation 2>&1

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: apk-android
          path: 'apk-build/**/*.apk'
          retention-days: 30
          if-no-files-found: warn
`;

  const makeCapacitorWorkflow = () =>
`name: Build Android APK
on:
  workflow_dispatch:
  push:
    branches: [main, master]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Java 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
          cache: 'gradle'

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Android SDK
        uses: android-actions/setup-android@v3

      - name: SDK licenses + build tools
        run: |
          yes | sdkmanager --licenses || true
          sdkmanager "build-tools;34.0.0" "platforms;android-34" || true

      - name: Exportar JAVA_HOME/ANDROID_HOME
        run: |
          JAVA17="\${JAVA_HOME_17_X64:-\$JAVA_HOME}"
          echo "JAVA_HOME=\$JAVA17"              >> \$GITHUB_ENV
          echo "ANDROID_HOME=\$ANDROID_SDK_ROOT" >> \$GITHUB_ENV
          echo "\$JAVA17/bin"                    >> \$GITHUB_PATH

      - name: Instalar dependências
        run: npm install

      - name: Copiar assets web para Android
        run: npx cap copy android

      - name: Build APK debug
        working-directory: android
        run: |
          chmod +x ./gradlew
          ./gradlew assembleDebug --no-daemon -Dorg.gradle.jvmargs=-Xmx2g 2>&1

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: app-debug
          path: android/app/build/outputs/apk/debug/app-debug.apk
          retention-days: 30
          if-no-files-found: error
`;

  // ── Análise rápida ────────────────────────────────────────────────────────────
  const analyze = async () => {
    const base = appUrl.replace(/\/$/, "");
    setAnalyzing(true); setChecks(null);
    const checkImg = (u: string) => new Promise<boolean>(res => {
      const img = new Image(); img.onload = () => res(true); img.onerror = () => res(false);
      img.src = u + "?t=" + Date.now();
    });
    let manifestUrl = "";
    for (const p of ["/manifest.webmanifest", "/manifest.json"]) {
      try { const r = await fetch(`${base}${p}`, { cache: "no-store" }); if (r.ok) { manifestUrl = `${base}${p}`; break; } } catch { /* skip */ }
    }
    const [icon192, icon512, sw] = await Promise.all([
      checkImg(`${base}/icon-192.png`),
      checkImg(`${base}/icon-512.png`),
      fetch(`${base}/sw.js`, { cache: "no-store" }).then(r => r.ok).catch(() => false),
    ]);
    setChecks({ manifest: !!manifestUrl, icon192, icon512, sw, manifestUrl: manifestUrl || `${base}/manifest.webmanifest` });
    setAnalyzing(false);
  };

  // ── BOTÃO PRINCIPAL: Configura tudo e gera APK ────────────────────────────────
  const setupAll = async () => {
    const repo = getRepo();
    const needsGh = apkMethod !== "pwabuilder";

    // PWABuilder sem GitHub: só abre o site direto
    if (apkMethod === "pwabuilder" && !ghToken.trim()) {
      const t = `https://www.pwabuilder.com/?site=${encodeURIComponent(appUrl.replace(/\/$/, "") + "/manifest.webmanifest")}`;
      setSteps([{ label: "✅ Abrindo PWABuilder com seu link…", st: "ok" }]);
      const w = window.open(t, "_blank");
      if (!w) window.location.href = t;
      return;
    }

    if (needsGh && (!ghToken.trim() || !ghUser.trim() || !ghRepo.trim())) {
      setSteps([{ label: "❌ Cole o token do GitHub — a conta é detectada automaticamente", st: "err" }]);
      return;
    }
    setRunning(true); setSteps([]); setActionUrl("");

    const run = async (label: string, fn: () => Promise<boolean>) => {
      let idx = 0;
      setSteps(prev => { idx = prev.length; return [...prev, { label, st: "loading" }]; });
      await new Promise(r => setTimeout(r, 40));
      const ok = await fn();
      setSteps(prev => prev.map((s, i) => i === idx ? { ...s, st: ok ? "ok" : "err" } : s));
      return ok;
    };

    // ── Garante que o repositório existe (cria se não existir) ─────────────────
    const repoOk = await run(`Verificando/criando repositório ${ghUser}/${ghRepo}…`, ensureRepo);
    if (!repoOk) {
      setSteps(prev => [...prev, { label: "❌ Não foi possível criar/acessar o repositório. Verifique o token (escopo: repo + workflow).", st: "err" }]);
      setRunning(false); return;
    }

    const base = appUrl.replace(/\/$/, "");
    const manifestUrl = `${base}/manifest.webmanifest`;

    // ── Arquivos PWA (todos os métodos precisam) ────────────────────────────────
    const mOk  = await run("manifest.webmanifest completo (todos os campos)…", () =>
      pushText("manifest.webmanifest", makeManifest()));
    const i192 = await run("Ícone 192×192 com gradiente " + iconEmoji + "…", () =>
      ghPut("icon-192.png", genIconB64(192, iconColor, iconEmoji), "🤖 icon-192.png"));
    const i512 = await run("Ícone 512×512 com gradiente " + iconEmoji + "…", () =>
      ghPut("icon-512.png", genIconB64(512, iconColor, iconEmoji), "🤖 icon-512.png"));
    const swOk = await run("Service worker otimizado (sw.js)…", () =>
      pushText("sw.js", makeSW()));

    // ── Workflow específico do método ───────────────────────────────────────────
    let wfOk = false;
    if (apkMethod === "twa") {
      wfOk = await run("Workflow GitHub Actions — TWA/Bubblewrap (Java 17)…", () =>
        pushText(".github/workflows/generate-apk.yml", makeWorkflow(manifestUrl)));
    } else if (apkMethod === "capacitor") {
      // Usa build-apk.yml para sobrescrever o arquivo existente no repo do usuário
      wfOk = await run("Workflow GitHub Actions — Capacitor (Java 17, sem setup-gradle)…", () =>
        pushText(".github/workflows/build-apk.yml",
          makeCapacitorWorkflow()));
    } else if (apkMethod === "pwabuilder") {
      // Para PWABuilder: envia os arquivos e abre o site
      wfOk = mOk && i192 && i512 && swOk;
      if (wfOk) {
        setSteps(prev => [...prev, { label: "Abrindo PWABuilder com seu app…", st: "loading" }]);
        await new Promise(r => setTimeout(r, 500));
        const t = `https://www.pwabuilder.com/?site=${encodeURIComponent(manifestUrl)}`;
        const w = window.open(t, "_blank");
        if (!w) window.location.href = t;
        setSteps(prev => prev.map((s, i) => i === prev.length - 1 ? { ...s, st: "ok" } : s));
      }
    }

    const allOk = mOk && i192 && i512 && swOk && wfOk;
    if (allOk) {
      if (apkMethod !== "pwabuilder") {
        const actUrl = `https://github.com/${repo}/actions`;
        setActionUrl(actUrl);
        setSteps(prev => [...prev, { label: "✅ Tudo enviado! Build iniciado no GitHub Actions.", st: "ok" }]);
      } else {
        setSteps(prev => [...prev, { label: "✅ Arquivos enviados + PWABuilder aberto!", st: "ok" }]);
      }
    } else {
      setSteps(prev => [...prev, { label: "⚠ Algum passo falhou — verifique token (repo + workflow).", st: "err" }]);
    }
    setRunning(false);
  };

  const score = checks ? [checks.manifest, checks.icon192, checks.icon512, checks.sw].filter(Boolean).length : 0;
  const allDone = steps.length > 0 && steps.every(s => s.st === "ok");

  return (
    <div className="space-y-3">

      {/* ── Configuração ── */}
      <div className="bg-[#0e1828] border border-white/10 rounded-2xl p-4 space-y-3">
        <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">Link do app</p>
        <input value={appUrl} onChange={e => setAppUrl(e.target.value)}
          placeholder="https://meuapp.replit.app/assistente/"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-violet-500/50 font-mono" />

        <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold pt-1">Nome do app</p>
        <input value={appName} onChange={e => setAppName(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500/50" />

        <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold pt-1">Ícone do app</p>
        <div className="flex items-center gap-3">
          {/* Preview */}
          <div className="w-14 h-14 rounded-2xl shrink-0 flex items-center justify-center text-2xl shadow-lg"
            style={{ background: `linear-gradient(135deg, ${iconColor}, #4f46e5)` }}>
            {iconEmoji}
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <input type="color" value={iconColor} onChange={e => setIconColor(e.target.value)}
                className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer shrink-0" />
              <input value={iconColor} onChange={e => setIconColor(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-violet-500/50" />
            </div>
            <input value={iconEmoji} onChange={e => setIconEmoji(e.target.value)}
              placeholder="emoji do ícone (ex: ⚖️ 🏛 📋)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500/50" />
          </div>
        </div>

        <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold pt-1">GitHub</p>

        {/* Token + status da conta */}
        <div className="relative">
          <input type="password" value={ghToken} onChange={e => { void saveToken(e.target.value); }}
            placeholder="Cole o token aqui (ghp_...) — detecta a conta automaticamente"
            className={`w-full bg-white/5 border rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-violet-500/50 font-mono pr-28 ${apkMethod !== "pwabuilder" && ghToken && !ghUser && !tokenLoading ? "border-red-500/60" : "border-white/10"}`} />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
            {tokenLoading
              ? <div className="w-3.5 h-3.5 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
              : ghUser
              ? <span className="text-[11px] text-green-400 font-bold truncate max-w-[100px]">✓ {ghUser}</span>
              : ghToken
              ? <span className="text-[10px] text-red-400">token inválido</span>
              : null}
          </div>
        </div>

        {/* Lista de repositórios — aparece automático após o token */}
        {apkMethod !== "pwabuilder" && ghToken && (
          <div className="space-y-1.5">
            {reposLoading && repos.length === 0 && (
              <p className="text-[11px] text-white/30 text-center py-2">Carregando seus repositórios...</p>
            )}
            {repos.length > 0 && (
              <>
                <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold px-1">Selecione o repositório</p>
                <div className="space-y-1 max-h-44 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#ffffff15 transparent" }}>
                  {repos.map(r => (
                    <button key={r.full_name} onClick={() => saveRepo(r.name)}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all ${getRepoName() === r.name ? "bg-green-600/20 border border-green-500/30" : "bg-white/3 border border-white/8 hover:bg-white/6"}`}>
                      <span className="text-[11px] text-white/25 font-mono shrink-0">{ghUser}/</span>
                      <span className="text-[12px] text-white/80 font-mono flex-1 truncate">{r.name}</span>
                      {getRepoName() === r.name && <span className="text-green-400 text-xs shrink-0">✓</span>}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-white/20 px-1">Ou digite outro nome abaixo — cria automaticamente se não existir</p>
              </>
            )}
            <div className="flex items-center gap-1.5">
              {ghUser && <span className="text-xs text-white/30 font-mono shrink-0">{ghUser}/</span>}
              <input value={getRepoName()} onChange={e => saveRepo(e.target.value)}
                placeholder="nome-do-repositorio"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-violet-500/50 font-mono" />
            </div>
          </div>
        )}
        {apkMethod !== "pwabuilder" && !ghToken.trim() && (
          <p className="text-[11px] text-amber-400/80 px-1">⬆ Cole o token — a conta e repositórios aparecem automaticamente</p>
        )}
        {apkMethod === "pwabuilder" && (
          <p className="text-[11px] text-violet-400/70 px-1">PWABuilder não precisa de token — só abre o site com seu link</p>
        )}
      </div>

      {/* ── Seleção de método ── */}
      <div className="bg-[#0e1828] border border-white/10 rounded-2xl p-3 space-y-2">
        <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold px-1">Onde vai gerar o APK?</p>
        <div className="grid grid-cols-1 gap-2">
          {([
            { id: "twa",        label: "🐙 GitHub Actions — TWA",       sub: "App nativo que carrega seu site (recomendado)", badge: "★ Java 17 incluso" },
            { id: "capacitor",  label: "⚡ GitHub Actions — Capacitor",  sub: "App híbrido com wrapper Capacitor",             badge: "Java 17 incluso" },
            { id: "pwabuilder", label: "🌐 PWABuilder (site)",           sub: "Envia arquivos ao repo e abre o PWABuilder",    badge: "Sem GitHub Actions" },
          ] as const).map(m => (
            <button key={m.id} onClick={() => setApkMethod(m.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${apkMethod === m.id ? "bg-violet-600/20 border-violet-500/50" : "bg-white/3 border-white/8 hover:bg-white/5"}`}>
              <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${apkMethod === m.id ? "border-violet-400" : "border-white/20"}`}>
                {apkMethod === m.id && <div className="w-2 h-2 rounded-full bg-violet-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold ${apkMethod === m.id ? "text-white" : "text-white/50"}`}>{m.label}</p>
                <p className="text-[10px] text-white/30 truncate">{m.sub}</p>
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${apkMethod === m.id ? "bg-violet-500/30 text-violet-300" : "bg-white/5 text-white/20"}`}>{m.badge}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Botão principal ── */}
      {(() => {
        const needsGh = apkMethod !== "pwabuilder";
        const missingUrl = !appUrl.trim();
        const missingToken = needsGh && !ghToken.trim();
        const missingRepo  = needsGh && !ghRepo.trim();
        const isDisabled   = running || missingUrl || missingToken || missingRepo;
        const blockReason  = missingUrl ? "Cole o link do app acima"
          : missingToken ? "Preencha o token do GitHub acima"
          : missingRepo  ? "Preencha o repositório do GitHub acima"
          : null;
        return (
          <>
            <button onClick={setupAll} disabled={isDisabled}
              className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white text-lg font-bold rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl shadow-emerald-600/30">
              {running
                ? <><div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />Configurando e enviando…</>
                : allDone
                ? <><CheckCircle2 size={22} />Tudo pronto! Refazer</>
                : apkMethod === "pwabuilder"
                ? <><Zap size={22} />Abrir PWABuilder com meu app</>
                : <><Zap size={22} />Configurar tudo e gerar APK</>}
            </button>
            {blockReason
              ? <p className="text-[11px] text-amber-400 font-semibold text-center -mt-1">⬆ {blockReason}</p>
              : <p className="text-[10px] text-white/25 text-center -mt-1">
                  {apkMethod === "twa"        && "Gera manifest + ícones + SW → envia workflow TWA → GitHub Actions roda sozinho"}
                  {apkMethod === "capacitor"  && "Gera manifest + ícones + SW → envia workflow Capacitor → GitHub Actions roda sozinho"}
                  {apkMethod === "pwabuilder" && "Abre o PWABuilder já com seu link — baixe o APK direto no site"}
                </p>
            }
          </>
        );
      })()}

      {/* ── Progresso ── */}
      {steps.length > 0 && (
        <div className="bg-[#0a0f1a] border border-white/8 rounded-2xl p-4 space-y-2">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2.5">
              {s.st === "loading"
                ? <div className="w-4 h-4 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin shrink-0" />
                : s.st === "ok"
                ? <span className="text-green-400 shrink-0">✅</span>
                : <span className="text-red-400 shrink-0">❌</span>}
              <span className={`text-xs font-mono ${s.st === "ok" ? "text-white/50" : s.st === "err" ? "text-red-300" : "text-white/80"}`}>{s.label}</span>
            </div>
          ))}
          {actionUrl && (
            <button onClick={() => { const w = window.open(actionUrl, "_blank"); if (!w) window.location.href = actionUrl; }}
              className="w-full mt-2 py-2.5 bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold rounded-xl hover:bg-emerald-600/30 flex items-center justify-center gap-1.5">
              <Github size={13} /> Ver APK sendo gerado no GitHub Actions →
            </button>
          )}
        </div>
      )}

      {/* ── Análise detalhada (opcional) ── */}
      <button onClick={() => { setShowDetails(!showDetails); if (!showDetails && !checks) analyze(); }}
        className="w-full py-2 bg-white/3 border border-white/8 text-white/35 text-xs font-bold rounded-xl hover:bg-white/5 flex items-center justify-center gap-1.5">
        <Search size={12} /> {showDetails ? "Ocultar" : "Ver"} análise detalhada do app
      </button>

      {showDetails && (
        <div className="bg-[#0e1828] border border-white/10 rounded-2xl p-4 space-y-2">
          <div className="flex gap-2 mb-2">
            <input value={appUrl} onChange={e => setAppUrl(e.target.value)} readOnly
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/60 font-mono min-w-0" />
            <button onClick={analyze} disabled={analyzing}
              className="px-3 py-2 bg-violet-600/50 text-white text-xs font-bold rounded-xl hover:bg-violet-600 disabled:opacity-40 flex items-center gap-1 shrink-0">
              {analyzing ? <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" /> : <Search size={12} />} Analisar
            </button>
          </div>
          {checks && (
            <>
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${score === 4 ? "bg-green-500" : score >= 2 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${score * 25}%` }} />
              </div>
              {[
                { label: "manifest.webmanifest", ok: checks.manifest },
                { label: "icon-192.png (192×192)", ok: checks.icon192 },
                { label: "icon-512.png (512×512)", ok: checks.icon512 },
                { label: "sw.js (service worker)", ok: checks.sw },
              ].map(({ label, ok }) => (
                <div key={label} className="flex items-center gap-2">
                  <span>{ok ? "✅" : "❌"}</span>
                  <span className={`text-xs font-mono ${ok ? "text-white/40" : "text-white/70"}`}>{label}</span>
                  {!ok && <span className="text-[10px] text-violet-400/70 ml-auto">← o botão verde cria isso</span>}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── PWABuilder (alternativa) ── */}
      <details className="bg-[#0e1828] border border-white/8 rounded-2xl overflow-hidden">
        <summary className="px-4 py-3 text-xs text-white/30 font-bold cursor-pointer hover:text-white/50 flex items-center gap-2">
          <ExternalLink size={12} /> Alternativa: abrir PWABuilder no site
        </summary>
        <div className="px-4 pb-4">
          <button onClick={() => { const t = `https://www.pwabuilder.com/?site=${encodeURIComponent(appUrl || PROD_URL)}`; const w = window.open(t, "_blank"); if (!w) window.location.href = t; }}
            className="w-full py-3 bg-violet-600/40 border border-violet-500/30 hover:bg-violet-600/60 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all">
            <ExternalLink size={16} /> Abrir PWABuilder com minha URL
          </button>
        </div>
      </details>

      {/* ── QR code ── */}
      <div className="bg-[#0e1828] border border-white/8 rounded-2xl p-4 flex flex-col items-center gap-2">
        <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">Instalar sem APK (mais rápido)</p>
        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&color=7c3aed&bgcolor=0e1828&data=${encodeURIComponent(appUrl || PROD_URL)}&qzone=1&format=png`}
          alt="QR Code" className="w-24 h-24 rounded-xl" />
        <p className="text-[10px] text-white/25 text-center">Câmera → abre Chrome → ⋮ → Adicionar à tela inicial</p>
      </div>

    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
function PwaSection() {
  const [url, setUrl] = useState("");
  const [appName, setAppName] = useState("Meu App");
  const [themeColor, setThemeColor] = useState("#0d1520");
  const [basePath, setBasePath] = useState("/");
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState<"analyze" | "generate" | "apk">("analyze");
  const [openTool, setOpenTool] = useState<string | null>("pwabuilder");
  const [apkUrl, setApkUrl] = useState(PUBLIC_APP_URL);
  const [apkGenLoading, setApkGenLoading] = useState(false);
  const [apkGenMsg, setApkGenMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const handleAutoApk = async () => {
    const targetUrl = apkUrl.trim() || PROD_URL;
    if (!targetUrl.startsWith("https://")) {
      setApkGenMsg({ type: "err", text: "URL deve começar com https://" });
      return;
    }
    setApkGenLoading(true);
    setApkGenMsg(null);
    try {
      const res = await fetch("/api/generate-apk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: targetUrl,
          packageId: "br.com.assistente.ia.juridico",
          name: appName || "Assistente IA Jurídico",
          themeColor: "#0d1520",
          backgroundColor: "#0d1520",
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: res.statusText })) as { error?: string; detail?: string };
        throw new Error(j.detail ?? j.error ?? res.statusText);
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "assistente-ia-apk.zip";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      setApkGenMsg({ type: "ok", text: "✅ APK gerado! Abrindo download… Dentro do ZIP está o .apk para instalar no Android." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      setApkGenMsg({ type: "err", text: `❌ ${msg}` });
    }
    setApkGenLoading(false);
  };

  const analyze = async () => {
    if (!url.trim()) return;
    setLoading(true); setResults(null);
    try { setResults(await analyzeUrl(url.trim())); } catch { setResults([]); }
    setLoading(false);
  };
  const score = results ? results.filter((r) => r.ok).length : 0;
  const total = results?.length ?? 0;
  const pwaReady = results ? results.filter((r) => !r.warn).every((r) => r.ok) : false;

  const navSections = [
    { id: "analyze" as const, label: "🔍 Analisar URL", desc: "Verifica se seu app é PWA" },
    { id: "generate" as const, label: "⚡ Gerar arquivos PWA", desc: "manifest, sw.js e HTML prontos" },
    { id: "apk" as const, label: "📱 Gerar APK — 4 ferramentas", desc: "Do mais fácil ao mais completo" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Smartphone size={18} className="text-violet-400" />
        <h2 className="text-base font-bold text-white">PWA → APK</h2>
      </div>
      <p className="text-xs text-white/40">Analise, gere arquivos PWA e transforme qualquer site em app instalável.</p>

      {navSections.map((s) => (
        <div key={s.id} className="bg-[#0e1828] border border-white/10 rounded-2xl overflow-hidden">
          <button onClick={() => setSection(section === s.id ? "analyze" : s.id)} className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-white/3 transition-all">
            <div>
              <p className="text-sm font-semibold text-white">{s.label}</p>
              <p className="text-xs text-white/35">{s.desc}</p>
            </div>
            {section === s.id ? <ChevronDown size={15} className="text-violet-400 shrink-0" /> : <ChevronRight size={15} className="text-white/25 shrink-0" />}
          </button>

          {section === s.id && (
            <div className="px-4 pb-4 pt-1 border-t border-white/10 space-y-3 mt-1">

              {s.id === "analyze" && (
                <>
                  <div className="flex gap-2">
                    <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && analyze()} placeholder="https://meuapp.netlify.app" className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-violet-500/50" />
                    <button onClick={analyze} disabled={loading || !url.trim()} className="px-4 py-2.5 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-500 disabled:opacity-40 transition-all flex items-center gap-1.5">
                      {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Search size={14} />} Analisar
                    </button>
                  </div>
                  {results && (
                    <div className="space-y-2">
                      <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${pwaReady ? "bg-green-500/10 border-green-500/30" : "bg-yellow-500/10 border-yellow-500/30"}`}>
                        <div>
                          <p className={`text-sm font-bold ${pwaReady ? "text-green-300" : "text-yellow-300"}`}>{pwaReady ? "✓ App pronto para PWA!" : `⚠ ${total - score} item(ns) precisam de atenção`}</p>
                          <p className="text-xs text-white/40">{score}/{total} verificações passando</p>
                        </div>
                        {pwaReady && <button onClick={() => setSection("apk")} className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-500">→ Gerar APK</button>}
                      </div>
                      {results.map((r, i) => (
                        <div key={i} className={`flex gap-3 px-4 py-3 rounded-xl border ${r.ok ? "bg-green-500/5 border-green-500/20" : r.warn ? "bg-yellow-500/5 border-yellow-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                          <div className="shrink-0 mt-0.5">{r.ok ? <CheckCircle2 size={14} className="text-green-400" /> : r.warn ? <AlertCircle size={14} className="text-yellow-400" /> : <XCircle size={14} className="text-red-400" />}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-white/70 font-mono">{r.label}</p>
                            <p className="text-xs text-white/40 mt-0.5">{r.detail}</p>
                            {r.fix && !r.ok && <div className="mt-1.5 p-2 bg-white/5 rounded-lg"><p className="text-[10px] text-violet-300 font-semibold mb-0.5">Como corrigir:</p><p className="text-[10px] text-white/50">{r.fix}</p></div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {s.id === "generate" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="block text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-1.5">Nome do App</label><input value={appName} onChange={(e) => setAppName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500/40" /></div>
                    <div><label className="block text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-1.5">Cor principal</label><div className="flex gap-2"><input type="color" value={themeColor} onChange={(e) => setThemeColor(e.target.value)} className="w-10 h-10 rounded-lg border border-white/10 bg-white/5 cursor-pointer" /><input value={themeColor} onChange={(e) => setThemeColor(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-violet-500/40" /></div></div>
                    <div className="sm:col-span-2"><label className="block text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-1.5">Caminho base</label><input value={basePath} onChange={(e) => setBasePath(e.target.value)} placeholder="/" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500/40" /><p className="text-[10px] text-white/25 mt-1">Use / para raiz, /assistente/ para subrotas.</p></div>
                  </div>
                  <CodeBlock title="manifest.webmanifest" code={generateManifest(appName, themeColor, basePath)} />
                  <CodeBlock title="sw.js" code={generateSW(basePath)} />
                  <CodeBlock title="snippet para index.html" code={generateIndexSnippet(basePath)} />
                </div>
              )}

              {s.id === "apk" && (
                <ApkWizardBlock appUrl={apkUrl} setAppUrl={setApkUrl} />
              )}

            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MANUAL PAGE
// ══════════════════════════════════════════════════════════════════════════════

interface Cmd { cmd: string; desc: string; }
interface ManSection { id: string; title: string; emoji: string; commands?: Cmd[]; content?: React.ReactNode; }

function CmdBlock({ cmd, desc }: Cmd) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-[#0a0a14] border border-white/5 group">
      <div className="flex-1 min-w-0"><code className="text-emerald-300 font-mono text-xs block break-all">{cmd}</code><p className="text-[11px] text-white/40 mt-0.5">{desc}</p></div>
      <button onClick={() => { navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="opacity-0 group-hover:opacity-100 p-1 rounded text-white/30 hover:text-white/70 shrink-0 mt-0.5 transition-all">
        {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      </button>
    </div>
  );
}

const MAN_SECTIONS: ManSection[] = [
  { id: "git", title: "Git — Controle de versão", emoji: "📦", commands: [
    { cmd: "git init", desc: "Inicia repositório Git na pasta atual" },
    { cmd: "git clone https://github.com/user/repo.git", desc: "Clona repositório do GitHub" },
    { cmd: "git status", desc: "Mostra arquivos modificados" },
    { cmd: "git add .", desc: "Adiciona todos os arquivos para commit" },
    { cmd: 'git commit -m "mensagem"', desc: "Salva mudanças com descrição" },
    { cmd: "git push origin main", desc: "Envia commits para o GitHub" },
    { cmd: "git pull", desc: "Baixa mudanças do repositório remoto" },
    { cmd: "git log --oneline", desc: "Histórico resumido de commits" },
  ]},
  { id: "npm", title: "npm / pnpm — Pacotes Node.js", emoji: "📦", commands: [
    { cmd: "npm init -y", desc: "Cria package.json padrão" },
    { cmd: "npm install", desc: "Instala dependências do package.json" },
    { cmd: "npm install nome-pacote", desc: "Instala pacote específico" },
    { cmd: "npm run dev", desc: "Servidor de desenvolvimento" },
    { cmd: "npm run build", desc: "Gera arquivos de produção" },
    { cmd: "pnpm add nome-pacote", desc: "Adiciona pacote com pnpm" },
    { cmd: "pnpm dlx create-vite meu-app", desc: "Cria novo projeto Vite" },
  ]},
  { id: "terminal", title: "Terminal — Comandos do sistema", emoji: "💻", commands: [
    { cmd: "ls", desc: "Lista arquivos e pastas (Linux/Mac)" },
    { cmd: "dir", desc: "Lista arquivos e pastas (Windows)" },
    { cmd: "cd nome-pasta", desc: "Entra em uma pasta" },
    { cmd: "cd ..", desc: "Volta uma pasta" },
    { cmd: "mkdir nome-pasta", desc: "Cria nova pasta" },
    { cmd: "rm -rf nome-pasta", desc: "Remove pasta e conteúdo (CUIDADO!)" },
    { cmd: "pwd", desc: "Mostra o caminho da pasta atual" },
    { cmd: "node --version", desc: "Versão do Node.js instalada" },
  ]},
  { id: "pwa", title: "PWA — Progressive Web App", emoji: "📱", commands: [
    { cmd: "pwabuilder.com", desc: "Gera APK a partir de qualquer URL de PWA" },
    { cmd: "app.netlify.com/drop", desc: "Publica site arrastando a pasta (grátis)" },
    { cmd: "npx serve .", desc: "Servidor local para testar o app" },
  ]},
  { id: "vite", title: "Vite / React — Frontend", emoji: "⚡", commands: [
    { cmd: "pnpm dlx create-vite meu-app --template react-ts", desc: "Cria projeto React + TypeScript" },
    { cmd: "npm run dev", desc: "Servidor de desenvolvimento (hot reload)" },
    { cmd: "npm run build", desc: "Build de produção em dist/" },
    { cmd: "npm install tailwindcss @tailwindcss/vite", desc: "Instala Tailwind CSS" },
    { cmd: "npm install lucide-react", desc: "Instala ícones Lucide para React" },
    { cmd: "npm install wouter", desc: "Router leve para React" },
  ]},
  { id: "deploy", title: "Deploy — Publicar aplicações", emoji: "🚀", commands: [
    { cmd: "app.netlify.com/drop", desc: "Arrasta a pasta → link imediato (estático)" },
    { cmd: "vercel deploy", desc: "Publica com Vercel CLI" },
    { cmd: "railway up", desc: "Publica backend + banco com Railway" },
    { cmd: "gh-pages -d dist", desc: "Publica no GitHub Pages" },
  ]},
  { id: "api", title: "APIs de IA — Provedores", emoji: "🤖", content: (
    <div className="space-y-2">
      {[
        { name: "OpenAI", key: "sk-...", url: "platform.openai.com/api-keys", model: "gpt-4o", free: false },
        { name: "Groq", key: "gsk_...", url: "console.groq.com/keys", model: "llama-3.3-70b", free: true },
        { name: "Google Gemini", key: "AIza...", url: "aistudio.google.com", model: "gemini-2.0-flash", free: true },
        { name: "OpenRouter", key: "sk-or-...", url: "openrouter.ai/keys", model: "todos os modelos", free: true },
      ].map((p) => (
        <div key={p.name} className="bg-[#0a0a14] border border-white/5 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-white/70">{p.name}</span>
            {p.free && <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-bold">GRÁTIS</span>}
          </div>
          <code className="text-emerald-300 text-[10px] block">{p.key}</code>
          <p className="text-[10px] text-white/30 mt-1">{p.model}</p>
          <a href={`https://${p.url}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-violet-400 hover:underline">{p.url}</a>
        </div>
      ))}
    </div>
  )},
];

function ManualSection() {
  const [search, setSearch] = useState("");
  const [openSection, setOpenSection] = useState<string | null>("git");

  const filtered = MAN_SECTIONS.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    if (s.title.toLowerCase().includes(q)) return true;
    if (s.commands?.some((c) => c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q))) return true;
    return false;
  }).map((s) => ({
    ...s,
    commands: search ? s.commands?.filter((c) => c.cmd.toLowerCase().includes(search.toLowerCase()) || c.desc.toLowerCase().includes(search.toLowerCase())) : s.commands,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <BookOpen size={18} className="text-violet-400" />
        <h2 className="text-base font-bold text-white">Manual do Dev</h2>
      </div>
      <div className="relative">
        <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar comando..." className="w-full bg-[#0e1828] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-violet-500/50" />
      </div>
      {filtered.map((s) => (
        <div key={s.id} className="bg-[#0e1828] border border-white/10 rounded-2xl overflow-hidden">
          <button onClick={() => setOpenSection(openSection === s.id ? null : s.id)} className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-white/3 transition-all">
            <div className="flex items-center gap-2.5">
              <span className="text-base">{s.emoji}</span>
              <span className="text-sm font-semibold text-white/80">{s.title}</span>
              {s.commands && <span className="text-[10px] bg-white/5 text-white/30 px-1.5 py-0.5 rounded-full">{s.commands.length}</span>}
            </div>
            {openSection === s.id ? <ChevronDown size={14} className="text-violet-400" /> : <ChevronRight size={14} className="text-white/30" />}
          </button>
          {(openSection === s.id || !!search) && (
            <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-1.5">
              {s.content ?? s.commands?.map((c) => <CmdBlock key={c.cmd} {...c} />)}
            </div>
          )}
        </div>
      ))}
      {filtered.length === 0 && (
        <div className="text-center py-10"><Terminal size={28} className="text-white/10 mx-auto mb-2" /><p className="text-white/30 text-sm">Nenhum resultado para "<strong>{search}</strong>"</p></div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CONFIG PAGE (chaves de API)
// ══════════════════════════════════════════════════════════════════════════════

const DEFAULT_KEYS = [
  { label: "OpenAI", key: "", hint: "sk-...", url: "platform.openai.com/api-keys", free: false },
  { label: "Groq (Gratuito)", key: "", hint: "gsk_...", url: "console.groq.com/keys", free: true },
  { label: "Anthropic / Claude", key: "", hint: "sk-ant-...", url: "console.anthropic.com", free: false },
  { label: "Google Gemini", key: "", hint: "AIza...", url: "aistudio.google.com/app/apikey", free: true },
  { label: "OpenRouter (todos em 1)", key: "", hint: "sk-or-...", url: "openrouter.ai/keys", free: true },
];

function loadExtKeys() {
  try {
    const raw = localStorage.getItem("devtools_api_keys");
    if (!raw) return DEFAULT_KEYS;
    const saved = JSON.parse(raw) as { label: string; key: string }[];
    return DEFAULT_KEYS.map((d) => ({ ...d, key: saved.find((s) => s.label === d.label)?.key ?? "" }));
  } catch { return DEFAULT_KEYS; }
}

function ExtConfigSection() {
  const [keys, setKeys] = useState(loadExtKeys);
  const [showKeys, setShowKeys] = useState<boolean[]>(DEFAULT_KEYS.map(() => false));
  const [savedMsg, setSavedMsg] = useState("");

  const updateKey = (i: number, val: string) => setKeys((prev) => prev.map((k, idx) => idx === i ? { ...k, key: val } : k));
  const toggleShow = (i: number) => setShowKeys((prev) => prev.map((v, idx) => idx === i ? !v : v));
  const handleSave = () => {
    localStorage.setItem("devtools_api_keys", JSON.stringify(keys.map((k) => ({ label: k.label, key: k.key }))));
    setSavedMsg("✓ Salvo!"); setTimeout(() => setSavedMsg(""), 2500);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Key size={18} className="text-violet-400" />
        <h2 className="text-base font-bold text-white">Chaves Extras de API</h2>
      </div>
      <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-3 flex items-start gap-2">
        <Zap size={13} className="text-violet-400 shrink-0 mt-0.5" />
        <p className="text-xs text-violet-300"><strong>Dica:</strong> Use o <strong>OpenRouter</strong> (<code>sk-or-...</code>) para acessar GPT-4o, Claude, Gemini com <strong>uma chave só</strong>. Grátis em openrouter.ai</p>
      </div>
      {keys.map((k, i) => (
        <div key={k.label} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/35 flex items-center gap-1.5">
              {k.label} {k.free && <span className="bg-green-500/20 text-green-400 text-[9px] px-1.5 py-0.5 rounded-full font-bold">GRÁTIS</span>}
            </label>
            <a href={`https://${k.url}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-0.5">Obter <ExternalLink size={8} /></a>
          </div>
          <div className="relative">
            <input type={showKeys[i] ? "text" : "password"} value={k.key} onChange={(e) => updateKey(i, e.target.value)} placeholder={k.hint} autoComplete="off" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder:text-white/15 focus:outline-none focus:ring-1 focus:ring-violet-500/50 font-mono" />
            <button onClick={() => toggleShow(i)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60">{showKeys[i] ? <EyeOff size={14} /> : <Eye size={14} />}</button>
          </div>
          {k.key && <div className="flex items-center gap-1 text-[10px] text-green-400"><CheckCircle2 size={10} /> Chave preenchida</div>}
        </div>
      ))}
      <div className="flex items-start gap-2 bg-white/3 border border-white/8 rounded-xl px-4 py-3">
        <Shield size={12} className="text-violet-400 shrink-0 mt-0.5" />
        <p className="text-xs text-white/35">Suas chaves ficam salvas <strong className="text-white/50">apenas neste navegador</strong>. Nenhum servidor as acessa.</p>
      </div>
      <button onClick={handleSave} className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${savedMsg ? "bg-green-600 text-white" : "bg-violet-600 text-white hover:bg-violet-500"}`}>
        <Save size={14} /> {savedMsg || "Salvar chaves"}
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DATABASE PAGE
// ══════════════════════════════════════════════════════════════════════════════

interface TableField { name: string; type: string; extra?: string; }
interface TableTemplate { id: string; label: string; emoji: string; desc: string; fields: TableField[]; }

const TABLE_TEMPLATES: TableTemplate[] = [
  {
    id: "conversas", label: "Conversas IA", emoji: "💬", desc: "Histórico de mensagens do assistente jurídico",
    fields: [
      { name: "id", type: "SERIAL", extra: "PRIMARY KEY" },
      { name: "sessao_id", type: "UUID", extra: "NOT NULL DEFAULT gen_random_uuid()" },
      { name: "papel", type: "VARCHAR(20)", extra: "NOT NULL CHECK (papel IN ('user','assistant','system'))" },
      { name: "conteudo", type: "TEXT", extra: "NOT NULL" },
      { name: "modelo", type: "VARCHAR(60)" },
      { name: "criado_em", type: "TIMESTAMPTZ", extra: "NOT NULL DEFAULT NOW()" },
    ],
  },
  {
    id: "clientes", label: "Clientes", emoji: "👥", desc: "Cadastro de clientes do escritório",
    fields: [
      { name: "id", type: "SERIAL", extra: "PRIMARY KEY" },
      { name: "nome", type: "VARCHAR(200)", extra: "NOT NULL" },
      { name: "cpf_cnpj", type: "VARCHAR(20)", extra: "UNIQUE" },
      { name: "email", type: "VARCHAR(200)" },
      { name: "telefone", type: "VARCHAR(30)" },
      { name: "endereco", type: "TEXT" },
      { name: "observacoes", type: "TEXT" },
      { name: "criado_em", type: "TIMESTAMPTZ", extra: "NOT NULL DEFAULT NOW()" },
    ],
  },
  {
    id: "processos", label: "Processos", emoji: "⚖️", desc: "Controle de processos e casos jurídicos",
    fields: [
      { name: "id", type: "SERIAL", extra: "PRIMARY KEY" },
      { name: "numero", type: "VARCHAR(50)", extra: "UNIQUE" },
      { name: "cliente_id", type: "INTEGER", extra: "REFERENCES clientes(id)" },
      { name: "tipo", type: "VARCHAR(100)" },
      { name: "descricao", type: "TEXT" },
      { name: "status", type: "VARCHAR(30)", extra: "NOT NULL DEFAULT 'ativo'" },
      { name: "prazo", type: "DATE" },
      { name: "valor_causa", type: "NUMERIC(15,2)" },
      { name: "criado_em", type: "TIMESTAMPTZ", extra: "NOT NULL DEFAULT NOW()" },
    ],
  },
  {
    id: "documentos", label: "Documentos", emoji: "📄", desc: "Repositório de documentos e peças jurídicas",
    fields: [
      { name: "id", type: "SERIAL", extra: "PRIMARY KEY" },
      { name: "processo_id", type: "INTEGER", extra: "REFERENCES processos(id)" },
      { name: "titulo", type: "VARCHAR(300)", extra: "NOT NULL" },
      { name: "tipo", type: "VARCHAR(80)" },
      { name: "conteudo", type: "TEXT" },
      { name: "url_arquivo", type: "TEXT" },
      { name: "criado_em", type: "TIMESTAMPTZ", extra: "NOT NULL DEFAULT NOW()" },
    ],
  },
  {
    id: "usuarios", label: "Usuários", emoji: "🔐", desc: "Autenticação e controle de acesso",
    fields: [
      { name: "id", type: "SERIAL", extra: "PRIMARY KEY" },
      { name: "email", type: "VARCHAR(200)", extra: "NOT NULL UNIQUE" },
      { name: "nome", type: "VARCHAR(200)" },
      { name: "senha_hash", type: "TEXT" },
      { name: "perfil", type: "VARCHAR(30)", extra: "NOT NULL DEFAULT 'advogado'" },
      { name: "ativo", type: "BOOLEAN", extra: "NOT NULL DEFAULT TRUE" },
      { name: "criado_em", type: "TIMESTAMPTZ", extra: "NOT NULL DEFAULT NOW()" },
    ],
  },
  {
    id: "tarefas", label: "Tarefas / Agenda", emoji: "📅", desc: "Controle de prazos e compromissos",
    fields: [
      { name: "id", type: "SERIAL", extra: "PRIMARY KEY" },
      { name: "titulo", type: "VARCHAR(300)", extra: "NOT NULL" },
      { name: "descricao", type: "TEXT" },
      { name: "processo_id", type: "INTEGER", extra: "REFERENCES processos(id)" },
      { name: "responsavel_id", type: "INTEGER", extra: "REFERENCES usuarios(id)" },
      { name: "prazo", type: "TIMESTAMPTZ" },
      { name: "concluida", type: "BOOLEAN", extra: "NOT NULL DEFAULT FALSE" },
      { name: "criado_em", type: "TIMESTAMPTZ", extra: "NOT NULL DEFAULT NOW()" },
    ],
  },
];

function generateCreateTable(t: TableTemplate): string {
  const cols = t.fields.map((f) => `  ${f.name.padEnd(20)} ${f.type}${f.extra ? " " + f.extra : ""}`).join(",\n");
  return `CREATE TABLE IF NOT EXISTS ${t.id} (\n${cols}\n);\n`;
}

function parseConnStr(raw: string) {
  try {
    const url = new URL(raw);
    return {
      host: url.hostname,
      db: url.pathname.replace("/", ""),
      user: url.username,
      ok: true,
    };
  } catch { return { host: "", db: "", user: "", ok: false }; }
}

function DatabaseSection() {
  const [connStr, setConnStr] = useState(() => localStorage.getItem("devtools_neon_db") ?? "");
  const [savedConn, setSavedConn] = useState(false);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set(["conversas", "clientes", "processos"]));
  const [sql, setSql] = useState("");
  const [copied, setCopied] = useState(false);
  const [queryText, setQueryText] = useState("SELECT NOW();");
  const [queryResult, setQueryResult] = useState<string>("");
  const [querying, setQuerying] = useState(false);

  const info = parseConnStr(connStr);

  const saveConn = () => {
    localStorage.setItem("devtools_neon_db", connStr);
    setSavedConn(true); setTimeout(() => setSavedConn(false), 2000);
  };

  const toggleTable = (id: string) => {
    setSelectedTables((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setSql("");
  };

  const generateSQL = () => {
    const tables = TABLE_TEMPLATES.filter((t) => selectedTables.has(t.id));
    const lines = ["-- Gerado pelo Assistente IA Jurídico", "-- Execute no Neon Console, psql ou DBeaver", ""];
    tables.forEach((t) => { lines.push(`-- ${t.emoji} ${t.label}`); lines.push(generateCreateTable(t)); });
    setSql(lines.join("\n"));
  };

  const copySQL = () => { navigator.clipboard.writeText(sql); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const runQuery = async () => {
    if (!connStr || !queryText.trim()) return;
    setQuerying(true); setQueryResult("");
    try {
      // Neon HTTP API — funciona de qualquer navegador
      const url = new URL(connStr);
      const endpoint = `https://${url.hostname}/sql`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${btoa(url.username + ":" + url.password)}`,
          "Neon-Connection-String": connStr,
        },
        body: JSON.stringify({ query: queryText }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { rows?: unknown[]; command?: string; rowCount?: number };
      if (data.rows && data.rows.length > 0) {
        setQueryResult(JSON.stringify(data.rows, null, 2));
      } else {
        setQueryResult(`✓ ${data.command ?? "OK"} — ${data.rowCount ?? 0} linha(s) afetada(s)`);
      }
    } catch (e) {
      setQueryResult(`Erro: ${e instanceof Error ? e.message : "falha na conexão"}\n\nDica: Cole o SQL no Neon Console para executar direto.`);
    }
    setQuerying(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Database size={18} className="text-violet-400" />
        <h2 className="text-base font-bold text-white">Banco de Dados</h2>
      </div>

      {/* Connection String */}
      <div className="bg-[#0e1828] border border-white/10 rounded-2xl p-4 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">String de Conexão (Neon, Supabase, Railway…)</p>
        <div className="relative">
          <input
            type="password"
            value={connStr}
            onChange={(e) => setConnStr(e.target.value)}
            placeholder="postgresql://user:pass@host.neon.tech/dbname"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/15 font-mono focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          />
        </div>
        {info.ok && (
          <div className="flex flex-wrap gap-2">
            <span className="text-[10px] bg-green-500/15 text-green-400 px-2 py-1 rounded-full font-mono">{info.db}</span>
            <span className="text-[10px] bg-blue-500/15 text-blue-400 px-2 py-1 rounded-full font-mono">{info.host}</span>
            <span className="text-[10px] bg-violet-500/15 text-violet-400 px-2 py-1 rounded-full font-mono">user: {info.user}</span>
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <button onClick={saveConn} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${savedConn ? "bg-green-600 text-white" : "bg-violet-600 text-white hover:bg-violet-500"}`}>
            <Save size={12} /> {savedConn ? "Salvo!" : "Salvar conexão"}
          </button>
          <a href="https://neon.tech" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs text-white/40 border border-white/10 hover:text-white/70 hover:bg-white/5">
            <ExternalLink size={11} /> Criar banco Neon (grátis)
          </a>
          <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs text-white/40 border border-white/10 hover:text-white/70 hover:bg-white/5">
            <ExternalLink size={11} /> Supabase (grátis)
          </a>
        </div>
      </div>

      {/* Table Generator */}
      <div className="bg-[#0e1828] border border-white/10 rounded-2xl p-4 space-y-3">
        <p className="text-sm font-semibold text-white">Gerar tabelas SQL</p>
        <p className="text-xs text-white/40">Selecione as tabelas que precisa e gere o SQL pronto para executar:</p>
        <div className="grid grid-cols-2 gap-2">
          {TABLE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => toggleTable(t.id)}
              className={`flex items-start gap-2 p-3 rounded-xl border text-left transition-all ${selectedTables.has(t.id) ? "bg-violet-600/15 border-violet-500/40 text-white" : "bg-white/3 border-white/8 text-white/50 hover:border-white/20 hover:text-white/70"}`}
            >
              <span className="text-base shrink-0">{t.emoji}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{t.label}</p>
                <p className="text-[10px] text-white/35 leading-snug mt-0.5 line-clamp-2">{t.desc}</p>
              </div>
            </button>
          ))}
        </div>
        <button onClick={generateSQL} disabled={selectedTables.size === 0} className="w-full py-2.5 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-500 disabled:opacity-40 transition-all flex items-center justify-center gap-2">
          <Zap size={14} /> Gerar SQL ({selectedTables.size} tabela{selectedTables.size !== 1 ? "s" : ""})
        </button>
        {sql && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-white/40 font-mono">SQL gerado — pronto para executar</p>
              <button onClick={copySQL} className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 font-semibold">
                {copied ? <><Check size={10} />Copiado!</> : <><Copy size={10} />Copiar tudo</>}
              </button>
            </div>
            <pre className="text-[10px] text-emerald-300 font-mono bg-[#0a0a14] border border-white/8 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap" style={{ maxHeight: 300, overflowY: "auto" }}>{sql}</pre>
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2.5 space-y-1">
              <p className="text-[10px] text-yellow-300 font-semibold">Como executar este SQL:</p>
              <ol className="text-[10px] text-yellow-200/60 space-y-0.5 list-decimal list-inside">
                <li>Copie o SQL acima</li>
                <li>Abra console.neon.tech (ou Supabase → SQL Editor)</li>
                <li>Cole e clique em Run</li>
                <li>Tabelas criadas!</li>
              </ol>
            </div>
          </div>
        )}
      </div>

      {/* Query Runner */}
      <div className="bg-[#0e1828] border border-white/10 rounded-2xl p-4 space-y-3">
        <p className="text-sm font-semibold text-white">Executar consulta SQL</p>
        <p className="text-xs text-white/40">Funciona com bancos Neon. Cole a string de conexão acima primeiro.</p>
        <textarea
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          rows={4}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-emerald-300 font-mono placeholder:text-white/15 focus:outline-none focus:ring-1 focus:ring-violet-500/50 resize-none"
          placeholder="SELECT * FROM clientes LIMIT 10;"
        />
        <div className="flex gap-2 flex-wrap">
          {["SELECT NOW()", "SELECT * FROM clientes LIMIT 5", "\\dt (via psql)", "SELECT version()"].map((q) => (
            <button key={q} onClick={() => setQueryText(q)} className="text-[10px] px-2.5 py-1 rounded-full bg-white/5 text-white/40 hover:bg-violet-600/20 hover:text-violet-300 border border-white/8 font-mono transition-all">{q}</button>
          ))}
        </div>
        <button onClick={runQuery} disabled={querying || !connStr || !queryText.trim()} className="w-full py-2.5 bg-emerald-700 text-white text-sm font-bold rounded-xl hover:bg-emerald-600 disabled:opacity-40 transition-all flex items-center justify-center gap-2">
          {querying ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Zap size={14} />}
          {querying ? "Executando..." : "Executar Query"}
        </button>
        {queryResult && (
          <pre className="text-xs font-mono text-white/70 bg-[#0a0a14] border border-white/8 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap" style={{ maxHeight: 200, overflowY: "auto" }}>{queryResult}</pre>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN DevToolsPage
// ══════════════════════════════════════════════════════════════════════════════

type DevTab = "pwa" | "manual" | "keys" | "banco";

export function DevToolsPage() {
  const [tab, setTab] = useState<DevTab>("pwa");

  const tabs: { id: DevTab; icon: React.ReactNode; label: string }[] = [
    { id: "pwa", icon: <Smartphone size={15} />, label: "PWA→APK" },
    { id: "manual", icon: <BookOpen size={15} />, label: "Manual" },
    { id: "banco", icon: <Database size={15} />, label: "Banco" },
    { id: "keys", icon: <Key size={15} />, label: "Chaves" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0d1520]">
      {/* Sub-nav */}
      <div className="shrink-0 flex border-b border-white/10 bg-[#0d1520] px-2 pt-2 gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-xs font-semibold transition-all border-b-2 shrink-0 ${tab === t.id ? "text-violet-400 border-violet-500 bg-white/5" : "text-white/35 border-transparent hover:text-white/60 hover:bg-white/3"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4" style={{ scrollbarWidth: "thin", scrollbarColor: "#ffffff18 transparent" }}>
        {tab === "pwa" && <PwaSection />}
        {tab === "manual" && <ManualSection />}
        {tab === "banco" && <DatabaseSection />}
        {tab === "keys" && <ExtConfigSection />}
      </div>
    </div>
  );
}
