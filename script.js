// script.js (unico file, copy-paste)
// Mantiene la logica originale; lettore/streaming migliorati (proxy, timeout, refresh token/m3u8)

const API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
const VIXSRC_URL = "vixsrc.to";
// PROXY LIST presa dall'index-wzrcuT8C.js
const CORS_PROXIES_REQUIRING_ENCODING = [""];
const CORS_LIST = [
    "api.codetabs.com/v1/proxy?quest=", // query-style proxy (needs encoding)
    "cors.bridged.cc/",                 // prefix-style
    "thingproxy.freeboard.io/",         // prefix-style
];
let CORS = "cors.bridged.cc/";

const shownContinuaIds = new Set();
const endpoints = {
    trending: `trending/all/week`,
    nowPlaying: `movie/now_playing`,
    popularMovies: `movie/popular`,
    onTheAir: `tv/on_the_air`,
    popularTV: `tv/popular`,
};
const GENRE_SECTIONS = [
    { id: 28, name: "💥 Film d'Azione", type: "movie" },
    { id: 16, name: "✨ Animazione", type: "movie" },
    { id: 35, name: "😂 Commedia", type: "movie" },
    { id: 27, name: "👻 Horror", type: "movie" },
    { id: 878, name: "👽 Fantascienza", type: "movie" },
    { id: 53, name: "🔪 Thriller", type: "movie" },
    { id: 10749, name: "💕 Romantico", type: "movie" },
    { id: 10765, name: "🐉 Serie Fantasy & Sci-Fi", type: "tv" },
    { id: 80, name: "🕵️ Crime", type: "movie" }
];

let currentItem = null;
let currentSeasons = [];
let player = null;
let baseStreamUrl = "";
let requestHookInstalled = false;

let allowedMovies = [];
let allowedTV = [];
let allowedEpisodes = [];

/* =================== UTILS =================== */
function log(...args) {
    if (window && window.console) console.log("[script.js]", ...args);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function withTimeout(promise, ms, msg = "timeout") {
    return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
}
function saveJSON(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { log("saveJSON failed", e); }
}
function loadJSON(key) {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}

/* ================= STORAGE KEYS ================= */
const STORAGE = {
    WORKING_PROXY: "sw_working_proxy_v1",
    PROXY_METRICS: "sw_proxy_metrics_v1",
    LAST_TOKEN: "sw_last_token_v1",
    LAST_M3U8: "sw_last_m3u8_v1",
};

/* ============== PROXY & FETCH HELPERS ============== */

const StreamConfig = {
    PROXIES: CORS_LIST.map(entry => {
        if (entry.includes("?") && entry.includes("url=") || entry.toLowerCase().includes("?quest=")) return { url: entry, mode: "query" };
        return { url: entry, mode: "prefix" };
    }),
    PROXY_TEST_TIMEOUT_MS: 4000,
    FETCH_TIMEOUT_MS: 12000,
    MAX_FETCH_RETRIES: 2,
    PROXY_CACHE_TTL_MS: 1000 * 60 * 10, // 10 min
    TOKEN_REFRESH_AHEAD_MS: 20 * 1000,  // 20s
    DEBUG: true
};

/**
 * Compose proxied URL ensuring scheme is present.
 * - For query proxies: returns <scheme>://<proxy.url><encoded target>
 * - For prefix proxies: returns <scheme>://<proxy.url-without-trailing-slash>/<target-without-protocol>
 */
function composeProxiedUrl(proxy, targetUrl) {
    if (!proxy || !proxy.url) return targetUrl;

    // ensure target exists
    const target = String(targetUrl || "");

    // ensure proxy base has scheme
    let proxyBase = String(proxy.url || "");
    if (!/^https?:\/\//i.test(proxyBase)) {
        proxyBase = "https://" + proxyBase;
    }

    if (proxy.mode === "query") {
        // proxyBase already contains the ?... part for query-style proxies (e.g. api.codetabs.com/v1/proxy?quest=)
        // ensure it ends with = or & so encoding appends cleanly
        return proxyBase + encodeURIComponent(target);
    } else {
        // prefix
        // remove trailing slash from proxyBase and leading protocol from target
        const p = proxyBase.replace(/\/$/, "");
        const t = target.replace(/^https?:\/\//i, "");
        return p + "/" + t;
    }
}

async function testOneProxy(proxy, testUrl) {
    const url = composeProxiedUrl(proxy, testUrl);
    const t0 = performance.now();
    try {
        const resp = await withTimeout(fetch(url, { method: "GET", mode: "cors" }), StreamConfig.PROXY_TEST_TIMEOUT_MS, "proxy test timeout");
        const t1 = performance.now();
        return { ok: resp.ok, latency: t1 - t0, status: resp.status };
    } catch (e) {
        return { ok: false, latency: Infinity, error: e.message };
    }
}

async function findBestProxy(testTarget = `https://${VIXSRC_URL}/`) {
    // honor user selection in #cors-select
    const corsSelect = document.getElementById("cors-select");
    if (corsSelect && corsSelect.value) {
        const val = corsSelect.value;
        log("User selected CORS proxy:", val);
        CORS = val;
        return { url: val, mode: val.includes("?") && val.includes("url=") ? "query" : "prefix" };
    }

    const cached = loadJSON(STORAGE.WORKING_PROXY);
    if (cached && (Date.now() - (cached.checkedAt || 0)) < StreamConfig.PROXY_CACHE_TTL_MS) {
        log("Using cached proxy", cached.proxy);
        return cached.proxy;
    }

    const proxies = StreamConfig.PROXIES || [];
    if (!proxies.length) return null;

    const tests = await Promise.all(proxies.map(async p => ({ proxy: p, res: await testOneProxy(p, testTarget) })));
    const oks = tests.filter(t => t.res.ok).sort((a,b) => a.res.latency - b.res.latency);
    let chosen;
    if (oks.length) chosen = oks[0].proxy;
    else chosen = proxies[0];

    saveJSON(STORAGE.WORKING_PROXY, { proxy: chosen, checkedAt: Date.now() });
    const metrics = loadJSON(STORAGE.PROXY_METRICS) || {};
    metrics[chosen.url] = { lastTested: Date.now(), ok: oks.length>0, latency: oks[0] ? oks[0].res.latency : null };
    saveJSON(STORAGE.PROXY_METRICS, metrics);

    if (!document.getElementById("cors-select")) CORS = chosen.url;
    log("chosen proxy:", chosen.url);
    return chosen;
}

async function fetchWithProxy(targetUrl, { proxy = null, init = {}, timeout = StreamConfig.FETCH_TIMEOUT_MS, retries = StreamConfig.MAX_FETCH_RETRIES } = {}) {
    let attempt = 0;
    let lastErr = null;
    while (attempt <= retries) {
        attempt++;
        try {
            const url = proxy ? composeProxiedUrl(proxy, targetUrl) : targetUrl;
            const resp = await withTimeout(fetch(url, init), timeout, "fetch timeout");
            return resp;
        } catch (e) {
            lastErr = e;
            log("fetchWithProxy attempt", attempt, "error", e.message);
            await sleep(150 * attempt);
        }
    }
    throw lastErr;
}

/* ============== CORS helpers (original) ============== */

function extractBaseUrl(url) {
    try {
        const corsSelect = document.getElementById("cors-select");
        const currentCors = corsSelect ? corsSelect.value : CORS;
        let cleanUrl = String(url || "");
        if (currentCors && cleanUrl.includes(currentCors)) {
            const parts = cleanUrl.split(currentCors);
            cleanUrl = parts.slice(1).join(currentCors) || parts[0];
            try { cleanUrl = decodeURIComponent(cleanUrl); } catch(e) {}
        }
        if (!/^https?:\/\//i.test(cleanUrl)) return DEFAULT_BASE;
        const urlObj = new URL(cleanUrl);
        return `${urlObj.protocol}//${urlObj.host}`;
    } catch (e) {
        console.error("Error extracting base URL:", e);
        return DEFAULT_BASE;
    }
}

function resolveUrl(url, baseUrl = DEFAULT_BASE) {
    try {
        if (!url) return baseUrl;
        const trimmed = String(url).trim();
        if (/^https?:\/\//i.test(trimmed)) return trimmed;
        if (trimmed.startsWith("//")) return window.location.protocol + trimmed;
        if (trimmed.startsWith("/")) return baseUrl.replace(/\/$/, "") + trimmed;
        return baseUrl.replace(/\/$/, "") + "/" + trimmed;
    } catch (e) {
        console.error("Error resolving URL:", e);
        return url;
    }
}

function applyCorsProxy(url) {
    try {
        if (!url) return url;
        const corsSelect = document.getElementById("cors-select");
        const currentCors = corsSelect ? corsSelect.value : CORS;
        const requiresEncoding = CORS_PROXIES_REQUIRING_ENCODING.includes(currentCors);
        let original = String(url);
        if (/^(data:|blob:)/i.test(original)) return original;
        if (currentCors && original.startsWith(`https://${currentCors}`)) return original;
        if (currentCors && original.includes(currentCors)) {
            const parts = original.split(currentCors);
            original = parts.slice(1).join(currentCors) || parts[0];
            try { original = decodeURIComponent(original); } catch(e){}
        }
        if (!/^https?:\/\//i.test(original)) {
            original = resolveUrl(original);
            log("Resolved relative URL:", url, "->", original);
        }
        if (!original.startsWith(DEFAULT_BASE) && !original.startsWith(window.location.origin)) {
            return original;
        }
        log("Applying CORS proxy to:", original);
        const prefix = `https://${currentCors.replace(/\/$/, "")}`;
        if (requiresEncoding) return `${prefix}/${encodeURIComponent(original)}`;
        const withoutProto = original.replace(/^https?:\/\//i, "");
        return `${prefix}/${withoutProto}`;
    } catch (e) {
        console.error("applyCorsProxy error:", e);
        return url;
    }
}

/* ============== Video.js XHR hook (original) ============== */

const xhrRequestHook = (options) => {
    try {
        const originalUri = options && (options.uri || options.url || "");
        const proxied = applyCorsProxy(originalUri);
        if (options.uri !== undefined) options.uri = proxied;
        if (options.url !== undefined) options.url = proxied;
        log("📡 XHR Request intercepted:", originalUri, "->", proxied);
    } catch (e) {
        console.error("xhrRequestHook error:", e);
    }
    return options;
};

function setupVideoJsXhrHook() {
    try {
        if (typeof videojs === "undefined" || !videojs.Vhs || !videojs.Vhs.xhr) {
            console.warn("⚠️ Video.js Vhs xhr non disponibile");
            return;
        }
        if (requestHookInstalled) {
            log("✅ XHR hook already installed");
            return;
        }
        log("🔧 Setting up Video.js XHR hook");
        videojs.Vhs.xhr.onRequest(xhrRequestHook);
        requestHookInstalled = true;
        log("✅ Video.js XHR hook installed");
    } catch (e) {
        console.error("setupVideoJsXhrHook error:", e);
    }
}

function removeVideoJsXhrHook() {
    try {
        if (typeof videojs !== "undefined" && videojs.Vhs && videojs.Vhs.xhr && requestHookInstalled) {
            log("🧹 Removing XHR hook");
            videojs.Vhs.xhr.offRequest(xhrRequestHook);
            requestHookInstalled = false;
        }
    } catch (e) {
        console.error("removeVideoJsXhrHook error:", e);
    }
}

/* ============== TOKEN / M3U8 refresh helpers ============== */

function computeExpiresAt(expiresValue) {
    try {
        const v = Number(expiresValue);
        if (!isNaN(v)) {
            if (v > 1e12) return v;
            if (v > 1e9) return v * 1000;
            return Date.now() + v * 1000;
        }
        const d = Date.parse(String(expiresValue));
        if (!isNaN(d)) return d;
    } catch (e) {}
    return Date.now() + 5 * 60 * 1000;
}

let streamRefreshTimeout = null;

function scheduleStreamRefresh(tmdbId, isMovie, season, episode, tokenInfo, proxy) {
    try {
        if (!tokenInfo || !tokenInfo.expiresAt) return;
        const msLeft = tokenInfo.expiresAt - Date.now();
        const ahead = StreamConfig.TOKEN_REFRESH_AHEAD_MS;
        const when = Math.max(1000, msLeft - ahead);
        if (streamRefreshTimeout) clearTimeout(streamRefreshTimeout);
        streamRefreshTimeout = setTimeout(() => {
            attemptRefreshInPlace(tmdbId, isMovie, season, episode, proxy).catch(e => log("refresh error", e));
        }, when);
        log("Scheduled stream refresh in ms:", when);
    } catch (e) { log("scheduleStreamRefresh error", e); }
}

async function attemptRefreshInPlace(tmdbId, isMovie, season, episode, proxy) {
    try {
        log("Attempting in-place refresh for", tmdbId);
        const newStream = await getDirectStream(tmdbId, isMovie, season, episode, proxy);
        if (!newStream || !newStream.m3u8Url) throw new Error("No new m3u8 obtained");
        const proxied = proxy ? composeProxiedUrl(proxy, newStream.m3u8Url) : applyCorsProxy(newStream.m3u8Url);
        if (player) {
            try {
                player.src({ src: proxied, type: "application/x-mpegURL" });
                player.play().catch(() => {});
                log("Player reloaded with refreshed m3u8");
            } catch (e) {
                log("Error reloading player", e);
            }
        }
        const newTokenInfo = newStream.tokenInfo || loadJSON(STORAGE.LAST_TOKEN);
        scheduleStreamRefresh(tmdbId, isMovie, season, episode, newTokenInfo, proxy);
        return true;
    } catch (e) {
        log("attemptRefreshInPlace failed:", e);
        return false;
    }
}

/* ============== STREAM EXTRACTION (improved) ============== */

/**
 * getDirectStream(tmdbId, isMovie, season, episode, optionalProxy)
 * returns { iframeUrl, m3u8Url, tokenInfo }
 */
async function getDirectStream(tmdbId, isMovie, season = null, episode = null, optionalProxy = null) {
    try {
        showLoading(true, "Connessione al server...");

        let vixsrcUrl = `https://${VIXSRC_URL}/${isMovie ? "movie" : "tv"}/${tmdbId}`;
        if (!isMovie && season !== null && episode !== null) vixsrcUrl += `/${season}/${episode}`;

        log("🎬 Fetching stream page:", vixsrcUrl);

        const selectedProxy = optionalProxy || await findBestProxy(`https://${VIXSRC_URL}/`);
        const resp = await fetchWithProxy(vixsrcUrl, { proxy: selectedProxy, init: { method: "GET" } });
        const html = await resp.text();

        log("Page fetched, length:", html.length);
        showLoading(true, "Estrazione parametri stream...");

        const playlistParamsRegex = /window\.masterPlaylist[^:]+params:[^{]+({[^<]+?})/;
        const playlistParamsMatch = html.match(playlistParamsRegex);
        if (!playlistParamsMatch) {
            console.error("HTML preview:", html.substring(0, 1000));
            throw new Error("Impossibile trovare i parametri della playlist");
        }

        let playlistParamsStr = playlistParamsMatch[1]
            .replace(/'/g, '"')
            .replace(/\s+/g, "")
            .replace(/\n/g, "")
            .replace(/\\n/g, "")
            .replace(",}", "}");

        log("Playlist params string:", playlistParamsStr);

        let playlistParams;
        try {
            playlistParams = JSON.parse(playlistParamsStr);
        } catch (e) {
            console.error("Failed to parse params:", playlistParamsStr);
            throw new Error("Errore nel parsing dei parametri: " + e.message);
        }

        log("Parsed params:", playlistParams);

        const playlistUrlRegex = /window\.masterPlaylist\s*=\s*\{[\s\S]*?url:\s*'([^']+)'/;
        const playlistUrlMatch = html.match(playlistUrlRegex);
        if (!playlistUrlMatch) throw new Error("Impossibile trovare l'URL della playlist");
        const playlistUrl = playlistUrlMatch[1];
        log("Playlist URL:", playlistUrl);

        const canPlayFHDRegex = /window\.canPlayFHD\s+?=\s+?(\w+)/;
        const canPlayFHDMatch = html.match(canPlayFHDRegex);
        const canPlayFHD = canPlayFHDMatch && canPlayFHDMatch[1] === "true";

        const hasQuery = /\?[^#]+/.test(playlistUrl);
        const separator = hasQuery ? "&" : "?";

        // Keep same token fields as original
        const expiresField = playlistParams.expires;
        const tokenField = playlistParams.token;
        const m3u8Url = playlistUrl + separator + "expires=" + expiresField + "&token=" + tokenField + (canPlayFHD ? "&h=1" : "");

        log("🎬 Generated m3u8 URL:", m3u8Url);

        baseStreamUrl = extractBaseUrl(m3u8Url);
        log("🏠 Base stream URL:", baseStreamUrl);

        // Persist token info and m3u8
        const expiresAt = computeExpiresAt(expiresField);
        const tokenInfo = { token: tokenField, expiresAt, raw: playlistParams, obtainedAt: Date.now() };
        saveJSON(STORAGE.LAST_TOKEN, tokenInfo);
        saveJSON(STORAGE.LAST_M3U8, { url: m3u8Url, proxied: (selectedProxy ? composeProxiedUrl(selectedProxy, m3u8Url) : applyCorsProxy(m3u8Url)), obtainedAt: Date.now() });

        // schedule refresh
        scheduleStreamRefresh(tmdbId, isMovie, season, episode, tokenInfo, selectedProxy);

        showLoading(false);
        return { iframeUrl: vixsrcUrl, m3u8Url, tokenInfo };
    } catch (error) {
        console.error("❌ Error in getDirectStream:", error);
        showLoading(false);
        showError("Errore durante l'estrazione dello stream", (error && error.message) || String(error));
        return null;
    }
}

/* ============== PLAYER / LOAD VIDEO (modified) ============== */

async function openPlayer(item) {
    currentItem = item;
    showSection('player');

    const title = item.title || item.name;
    const mediaType = item.media_type || (item.title ? "movie" : "tv");

    const playerTitle = document.getElementById("player-title");
    if (playerTitle) playerTitle.textContent = title;
    const playerOverview = document.getElementById("player-overview");
    if (playerOverview) playerOverview.textContent = item.overview || "...";

    if (mediaType === "tv") {
        const warning = document.getElementById("episode-warning");
        if (warning) warning.classList.remove("hidden");
        await loadTVSeasons(item.id);
    } else {
        const warning = document.getElementById("episode-warning");
        if (warning) warning.classList.add("hidden");
        await loadVideo(true, item.id);
    }

    window.scrollTo(0, 0);
}

async function loadVideo(isMovie, id, season = null, episode = null) {
    showLoading(true);
    const warning = document.getElementById("episode-warning");
    if (warning) warning.classList.add("hidden");

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    // On iOS/Safari use iframe method (original behaviour)
    if (isIOS || isSafari) {
        log("iOS/Safari detected - using iframe");
        if (player) { try { player.dispose(); } catch(e){} player = null; }
        const videoContainer = document.querySelector(".video-container");
        if (videoContainer) videoContainer.innerHTML = "";

        let embedUrl = `https://${VIXSRC_URL}/${isMovie ? "movie" : "tv"}/${id}`;
        if (!isMovie && season && episode) embedUrl += `/${season}/${episode}`;

        const iframe = document.createElement("iframe");
        iframe.src = embedUrl;
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.border = "none";
        iframe.style.backgroundColor = "#000";
        iframe.allow = "fullscreen; autoplay; encrypted-media";
        videoContainer.appendChild(iframe);

        showLoading(false);
        return;
    }

    // PC/Android path: improved extraction + proxy + Video.js integration
    try {
        setupVideoJsXhrHook();

        if (player) { try { player.dispose(); } catch (e) { console.warn(e); } player = null; }

        const videoContainer = document.querySelector(".video-container");
        const oldVideo = document.getElementById("player-video");
        if (oldVideo) oldVideo.remove();
        const oldIframe = videoContainer ? videoContainer.querySelector("iframe") : null;
        if (oldIframe) oldIframe.remove();

        const newVideo = document.createElement("video");
        newVideo.id = "player-video";
        newVideo.className = "video-js vjs-theme-vixflix vjs-big-play-centered";
        newVideo.setAttribute("controls", "");
        newVideo.setAttribute("preload", "auto");
        newVideo.setAttribute("crossorigin", "anonymous");

        const loadingOverlay = document.getElementById("loading-overlay");
        if (videoContainer) {
            if (loadingOverlay) videoContainer.insertBefore(newVideo, loadingOverlay);
            else videoContainer.appendChild(newVideo);
        }

        // get stream (uses proxy selection, fetchWithProxy, token logic)
        const selectedProxy = await findBestProxy(`https://${VIXSRC_URL}/`);
        const streamData = await getDirectStream(id, isMovie, season, episode, selectedProxy);
        if (!streamData || !streamData.m3u8Url) throw new Error("Stream non trovato");

        // init Video.js player
        const isIosClient = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

        player = videojs("player-video", {
            controls: true,
            fluid: true,
            aspectRatio: "16:9",
            html5: {
                vhs: {
                    overrideNative: !isIosClient,
                    bandwidth: 5000000
                }
            }
        });

        const controlBar = player.getChild('controlBar');
        const currentTimeDisplay = controlBar && controlBar.getChild('CurrentTimeDisplay');
        if (currentTimeDisplay) {
            const originalUpdate = currentTimeDisplay.update;
            currentTimeDisplay.update = function(...args) {
                originalUpdate.apply(this, args);
                const current = player.currentTime();
                const duration = player.duration();
                const format = (sec) => {
                    if (isNaN(sec) || !isFinite(sec)) return '--:--';
                    const m = Math.floor(sec / 60);
                    const s = Math.floor(sec % 60).toString().padStart(2, '0');
                    return `${m}:${s}`;
                };
                this.el().innerHTML = `${format(current)} / ${format(duration)}`;
            };
        }

        // apply CORS proxy to manifest if required (Video.js XHR hook will handle sub-requests)
        const proxiedM3u8 = selectedProxy ? composeProxiedUrl(selectedProxy, streamData.m3u8Url) : applyCorsProxy(streamData.m3u8Url);

        player.src({ src: proxiedM3u8, type: "application/x-mpegURL" });

        player.ready(() => {
            showLoading(false);
            const savedVol = localStorage.getItem("vix_volume");
            if (savedVol) player.volume(parseFloat(savedVol));
            trackAndResume(player, id, isMovie ? 'movie' : 'tv', season, episode);
            player.play().catch(()=>{});
            player.on('loadedmetadata', () => player.controlBar.getChild('CurrentTimeDisplay')?.update());
        });

    } catch (error) {
        console.error("❌ Errore player:", error);
        showLoading(false);
        showNotification("Impossibile caricare il player nativo.");
    }
}

/* ============== resto del file originale (UI, TMDB, cards, backup, etc.) ============== */

// ===== FUNZIONI HELPER (già presenti sopra: showSection, showNotification, setupMobileEnhancements) =====

// ===== GESTIONE UI =====
function setupEventListeners() {
    let searchTimeout;
    const searchInput = document.getElementById("search");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            if (query.length < 2) {
                showSection('home');
                return;
            }
            searchTimeout = setTimeout(() => performSearch(query), 500);
        });
    }

    // Suppress video.js warnings
    const originalConsoleWarn = console.warn;
    console.warn = function (...args) {
        const message = args[0];
        if (
            typeof message === "string" &&
            (message.includes("videojs.mergeOptions is deprecated") ||
                message.includes("MouseEvent.mozPressure") ||
                message.includes("MouseEvent.mozInputSource"))
        ) {
            return;
        }
        originalConsoleWarn.apply(console, args);
    };
}

// ===== API TMDB =====
async function fetchList(type) {
    const res = await fetch(`https://api.themoviedb.org/3/${endpoints[type]}?api_key=${API_KEY}&language=it-IT`);
    const j = await res.json();
    return j.results;
}

async function fetchTVSeasons(tvId) {
    if (tvId === 87623) {
        return [
            { season_number: 1, name: "Stagione 1" },
            { season_number: 2, name: "Stagione 2" },
            { season_number: 3, name: "Stagione 3" },
        ];
    }
    const res = await fetch(`https://api.themoviedb.org/3/tv/${tvId}?api_key=${API_KEY}&language=it-IT`);
    const j = await res.json();
    return j.seasons || [];
}

async function fetchEpisodes(tvId, seasonNum) {
    if (tvId === 87623) {
        const episodeCounts = { 1: 44, 2: 100, 3: 112 };
        const count = episodeCounts[seasonNum] || 0;
        return Array.from({ length: count }, (_, i) => ({ episode_number: i + 1, name: `Episodio ${i + 1}` }));
    }
    const res = await fetch(`https://api.themoviedb.org/3/tv/${tvId}/season/${seasonNum}?api_key=${API_KEY}&language=it-IT`);
    const j = await res.json();
    return j.episodes || [];
}

const GENRES = {
    28: "Azione", 12: "Avventura", 16: "Animazione", 35: "Commedia", 80: "Crime",
    99: "Documentario", 18: "Dramma", 10751: "Famiglia", 14: "Fantasy", 36: "Storia",
    27: "Horror", 10402: "Musica", 9648: "Mistero", 10749: "Romance", 878: "Fantascienza",
    10770: "Film TV", 53: "Thriller", 10752: "Guerra", 37: "Western",
    10759: "Action & Adventure", 10762: "Kids", 10763: "News", 10764: "Reality",
    10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics"
};

// ===== GESTIONE CARD =====
function createCard(item, cookieNames = [], isRemovable = false) {
    const card = document.createElement("div");
    card.className = "card fade-in";

    const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "https://via.placeholder.com/500x750?text=No+Image&color=333";
    const rawTitle = item.title || item.name || "";
    const anno = item.release_date?.slice(0, 4) || item.first_air_date?.slice(0, 4) || "—";
    const voto = item.vote_average?.toFixed(1) || "—";

    const isTV = item.media_type === 'tv' || (item.name && !item.title) || !!item.first_air_date;
    const typeLabel = isTV ? "Serie TV" : "Film";
    const typeClass = isTV ? "badge-tv" : "badge-movie";

    const title = rawTitle.length > 40 ? rawTitle.substring(0, 40) + "..." : rawTitle;

    let genreText = "";
    const createGenreTag = (name) => `<span class="genre-tag">${name} </span>`;

    if (item.genres && item.genres.length > 0) {
        genreText = item.genres.slice(0, 2).map(g => createGenreTag(g.name)).join("");
    } else if (item.genre_ids && item.genre_ids.length > 0) {
        genreText = item.genre_ids.slice(0, 2).map(id => GENRES[id]).filter(Boolean).map(name => createGenreTag(name)).join("");
    }

    let badge = "";
    cookieNames.forEach((name) => {
        const value = getCookie(name);
        const savedTime = parseFloat(value);
        if (savedTime > 10) {
            const match = name.match(/_S(\d+)_E(\d+)/);
            if (match) badge = `<div class="card-badge">S${match[1]} E${match[2]}</div>`;
            else badge = `<div class="card-badge">⏪</div>`;
        }
    });

    card.innerHTML = `
        <div class="card-image">
            <img src="${poster}" alt="${rawTitle}" loading="lazy">
            <div class="card-type-tag ${typeClass}">${typeLabel}</div>
            <div class="card-overlay"></div>
            ${badge}
            <div class="card-actions">
                ${isRemovable ? `<button class="card-action-btn remove-btn" title="Rimuovi">🗑️</button>` : `<button class="card-action-btn fav-btn" title="Aggiungi ai preferiti">♥</button>`}
            </div>
        </div>
        <div class="card-content">
            <div class="card-title">${title}</div>
            <div class="card-meta">
                <span class="card-year">${anno}</span>
                <span class="card-rating">★ ${voto}</span>
            </div>
            ${genreText ? `<div class="card-genres">${genreText}</div>` : ''}
        </div>
    `;

    const favBtn = card.querySelector(".fav-btn");
    if (favBtn) {
        favBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            addPreferito(item);
            showNotification(`⭐ "${rawTitle}" aggiunto ai preferiti`);
            setTimeout(() => location.reload(), 500);
        });
    }

    const removeBtn = card.querySelector(".remove-btn");
    if (removeBtn) {
        removeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const confirmDelete = confirm(`Vuoi rimuovere "${rawTitle}" dalla visione?`);
            if (confirmDelete) {
                cookieNames.forEach((name) => {
                    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
                });
                card.remove();
                shownContinuaIds.delete(item.id);
                const container = document.getElementById("continua-carousel");
                if (container && container.children.length === 0) {
                    document.getElementById("continua-visione").classList.add("hidden");
                }
                showNotification(`🗑️ "${rawTitle}" rimosso dalla visione`);
            }
        });
    }

    card.addEventListener("click", () => {
        card.classList.add("clicked");
        setTimeout(() => { openPlayer(item); }, 300);
    });

    return card;
}

// ===== loadGenreSections, scrollGenre, loadTVSeasons, loadEpisodes (kept) =====
async function loadGenreSections() {
    const container = document.getElementById("genre-sections-container");
    if (!container) return;
    container.innerHTML = "";
    for (const genre of GENRE_SECTIONS) {
        const sectionId = `genre-${genre.id}-${genre.type}`;
        const sectionHTML = `
            <section id="${sectionId}" class="carousel-section container">
                <div class="carousel-header">
                    <h2 class="section-title">${genre.name}</h2>
                    <div class="carousel-nav">
                        <button class="carousel-btn left" onclick="scrollGenre('${sectionId}', -1)">‹</button>
                        <button class="carousel-btn right" onclick="scrollGenre('${sectionId}', 1)">›</button>
                    </div>
                </div>
                <div class="carousel-container">
                    <div class="carousel-track"></div>
                </div>
            </section>
        `;
        container.insertAdjacentHTML('beforeend', sectionHTML);
        try {
            const res = await fetch(`https://api.themoviedb.org/3/discover/${genre.type}?api_key=${API_KEY}&language=it-IT&with_genres=${genre.id}&sort_by=popularity.desc`);
            const data = await res.json();
            const currentSection = document.getElementById(sectionId);
            const track = currentSection.querySelector(".carousel-track");
            data.results.forEach(item => { item.media_type = genre.type; track.appendChild(createCard(item)); });
        } catch (err) { console.error(`Errore genere ${genre.name}:`, err); }
    }
}

function scrollGenre(sectionId, direction) {
    const section = document.getElementById(sectionId);
    if (section) {
        const track = section.querySelector(".carousel-track");
        const scrollAmount = track.clientWidth * 0.8;
        track.scrollBy({ left: direction * scrollAmount, behavior: "smooth" });
    }
}

async function loadTVSeasons(tvId) {
    const seasons = await fetchTVSeasons(tvId);
    currentSeasons = seasons.filter((s) => s.season_number > 0);
    const selector = document.getElementById("season-select");
    selector.innerHTML = "";
    currentSeasons.forEach((season) => {
        const opt = document.createElement("option");
        opt.value = season.season_number;
        opt.textContent = `Stagione ${season.season_number}`;
        selector.appendChild(opt);
    });
    selector.onchange = () => loadEpisodes(tvId, parseInt(selector.value));
    document.getElementById("episode-selector").classList.remove("hidden");
    if (currentSeasons.length > 0) await loadEpisodes(tvId, currentSeasons[0].season_number);
}

async function loadEpisodes(tvId, seasonNum) {
    const episodes = await fetchEpisodes(tvId, seasonNum);
    const container = document.getElementById("episodes-list");
    container.innerHTML = "";
    episodes.forEach((ep) => {
        const div = document.createElement("div");
        div.className = "episode-item";
        div.innerHTML = `<div class="episode-number">Episodio ${ep.episode_number}</div><div class="episode-title">${ep.name || "Senza titolo"}</div>`;
        div.onclick = () => {
            document.querySelectorAll(".episode-item").forEach((e) => e.classList.remove("active"));
            div.classList.add("active");
            document.getElementById("episode-warning").classList.add("hidden");
            loadVideo(false, tvId, seasonNum, ep.episode_number);
        };
        container.appendChild(div);
    });
}

// ===== trackAndResume =====
function trackAndResume(playerInstance, tmdbId, mediaType, season, episode) {
    let cookieName = `videoTime_${mediaType}_${tmdbId}`;
    if (mediaType === "tv") cookieName += `_S${season}_E${episode}`;
    const savedTime = getCookie(cookieName);
    if (savedTime) {
        const time = parseFloat(savedTime);
        if (time > 5) { try { playerInstance.currentTime(time); showNotification(`⏪ Ripreso da ${formatTime(time)}`); } catch(e){} }
    }
    playerInstance.on('timeupdate', () => {
        const current = playerInstance.currentTime();
        const duration = playerInstance.duration();
        if (duration > 0 && (duration - current) < 60) setCookie(cookieName, "", -1);
        else if (current > 5) setCookie(cookieName, current.toFixed(0), 30);
    });
}

// ===== CAROUSEL NAV, PREFERITI, BACKUP, IMPORT (kept) =====
function setupCarouselNavigation() {
    document.querySelectorAll(".carousel-btn").forEach(btn => {
        btn.addEventListener("click", function() {
            const carousel = this.closest(".carousel-section").querySelector(".carousel-track");
            if (carousel) {
                const direction = this.classList.contains("left") ? -1 : 1;
                scrollCarousel(carousel, direction);
            }
        });
    });
}
function scrollCarousel(carouselElement, direction) {
    if (!carouselElement) return;
    const scrollAmount = carouselElement.clientWidth * 0.8;
    carouselElement.scrollBy({ left: direction * scrollAmount, behavior: "smooth" });
}

function getPreferiti() { const raw = localStorage.getItem("preferiti"); return raw ? JSON.parse(raw) : []; }
function addPreferito(item) { const preferiti = getPreferiti(); const id = `${item.media_type || (item.title ? "movie" : "tv")}-${item.id}`; if (!preferiti.includes(id)) { preferiti.push(id); localStorage.setItem("preferiti", JSON.stringify(preferiti)); } }
function removePreferito(item) { const preferiti = getPreferiti(); const id = `${item.media_type || (item.title ? "movie" : "tv")}-${item.id}`; const updated = preferiti.filter((p) => p !== id); localStorage.setItem("preferiti", JSON.stringify(updated)); }

async function loadPreferiti() {
    const ids = getPreferiti(); const items = [];
    for (const id of ids) {
        const [mediaType, tmdbId] = id.split("-");
        try { const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${API_KEY}&language=it-IT`); const data = await res.json(); data.media_type = mediaType; items.push(data); } catch (err) { console.error("Errore TMDB:", err); }
    }
    const carousel = document.getElementById("preferiti-carousel");
    if (carousel) {
        carousel.innerHTML = "";
        items.forEach(item => {
            const card = createCard(item, [], false);
            const removeBtn = document.createElement("button");
            removeBtn.innerHTML = "🗑️"; removeBtn.className = "card-action-btn remove-btn"; removeBtn.title = "Rimuovi dai preferiti";
            removeBtn.addEventListener("click", (e) => { e.stopPropagation(); removePreferito(item); showNotification(`⭐ "${item.title || item.name}" rimosso dai preferiti`); setTimeout(()=>location.reload(),500); });
            const favBtn = card.querySelector(".fav-btn"); if (favBtn) favBtn.remove();
            const cardActions = card.querySelector(".card-actions"); if (cardActions) { cardActions.innerHTML = ""; cardActions.appendChild(removeBtn); }
            carousel.appendChild(card);
        });
        const section = document.getElementById("preferiti");
        if (section) section.classList.toggle("hidden", items.length === 0);
    }
}

// ===== COOKIE helpers =====
function setCookie(name, value, days) {
    const d = new Date(); d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/`;
}
function getCookie(name) {
    const target = name + "=";
    return document.cookie.split(";").map(c => c.trim()).filter(c => c.startsWith(target)).map(c => decodeURIComponent(c.substring(target.length)))[0] || null;
}
function formatTime(seconds) { const mins = Math.floor(seconds / 60); const secs = Math.floor(seconds % 60); return `${mins}:${secs.toString().padStart(2, "0")}`; }

// ===== loadContinuaDaCookie (kept) =====
async function loadContinuaDaCookie() {
    const carousel = document.getElementById("continua-carousel");
    const section = document.getElementById("continua-visione");
    if (!carousel || !section) return;
    carousel.innerHTML = "";
    const allCookies = document.cookie.split(';').map(c => c.trim());
    const lastCookieByContent = new Map();
    for (let i = 0; i < allCookies.length; i++) {
        const cookie = allCookies[i];
        const separatorIndex = cookie.indexOf('=');
        if (separatorIndex === -1) continue;
        const name = cookie.substring(0, separatorIndex);
        if (!name.startsWith("videoTime_")) continue;
        const rawValue = cookie.substring(separatorIndex + 1);
        const value = parseFloat(rawValue);
        if (isNaN(value) || value < 10) continue;
        const parts = name.split('_');
        if (parts.length < 3) continue;
        const type = parts[1];
        const tmdbId = parts[2];
        const key = `${type}_${tmdbId}`;
        lastCookieByContent.set(key, { name, value, parts, type, tmdbId, index: i });
    }
    const processedIds = new Set();
    let hasItems = false;
    for (const [key, info] of lastCookieByContent.entries()) {
        const { name, parts, type, tmdbId, index } = info;
        if (processedIds.has(key)) continue;
        processedIds.add(key);
        hasItems = true;
        try {
            const res = await fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${API_KEY}&language=it-IT`);
            const item = await res.json();
            let season = null, episode = null;
            if (type === 'tv' && parts.length >= 5) {
                season = parts[3].replace(/^S/i, '');
                episode = parts[4].replace(/^E/i, '');
                item.name = `${item.name} (S${season}x${episode})`;
            }
            const card = createCard(item, [name], true);
            if (type === 'tv' && season !== null && episode !== null) {
                card.addEventListener("click", async (e) => {
                    if (e.target.closest('.remove-btn')) return;
                    e.stopImmediatePropagation(); e.preventDefault();
                    await openPlayer(item);
                    loadVideo(false, tmdbId, parseInt(season, 10), parseInt(episode, 10));
                }, true);
            } else {
                card.addEventListener("click", async (e) => {
                    if (e.target.closest('.remove-btn')) return;
                    e.stopImmediatePropagation(); e.preventDefault();
                    await openPlayer(item);
                    loadVideo(false, tmdbId);
                }, true);
            }
            carousel.appendChild(card);
            shownContinuaIds.add(item.id);
        } catch (err) { console.error("Errore caricamento continua a guardare:", err); }
    }
    section.classList.toggle("hidden", !hasItems);
}

// ===== RICERCA =====
async function performSearch(query) {
    const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${API_KEY}&language=it-IT&query=${encodeURIComponent(query)}`);
    const data = await res.json();
    const resultsDiv = document.getElementById("results");
    if (!resultsDiv) return;
    resultsDiv.innerHTML = `<h2>Risultati della ricerca per: "${query}"</h2><div class="carousel-section"><div class="carousel-container"><div class="carousel-track" id="search-carousel"></div></div></div>`;
    const carousel = document.getElementById("search-carousel");
    if (!carousel) return;
    const filteredResults = data.results.filter(item => item.media_type !== "person" && item.poster_path);
    if (filteredResults.length === 0) resultsDiv.innerHTML += `<p style="text-align: center; margin-top: 2rem; color: var(--text-secondary);">Nessun risultato trovato per "${query}"</p>`;
    else filteredResults.forEach(item => carousel.appendChild(createCard(item)));
    showSection('results');
}

// ===== BACKUP =====
function esportaBackup() {
    const payload = { preferiti: getPreferiti(), cookies: document.cookie.split(";").map(c => c.trim()).filter(c => c.startsWith("videoTime_")) };
    const json = JSON.stringify(payload);
    const compressed = LZString.compressToEncodedURIComponent(json);
    const fullUrl = `${window.location.origin}${window.location.pathname}?backup=${compressed}`;
    const apiUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(fullUrl)}`;
    const outputElem = document.getElementById("codiceGenerato");
    if (outputElem) {
        outputElem.innerHTML = "⏳ Generazione link in corso..."; outputElem.classList.add("show");
        fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`)
            .then(res => res.json())
            .then(data => { const shortUrl = data.contents.trim(); navigator.clipboard.writeText(shortUrl); outputElem.innerHTML = `<div style="margin-bottom: 5px;">✅ <strong>Backup Pronto!</strong></div><div style="font-size: 0.8rem; opacity: 0.8; margin-bottom: 8px;">Il link è stato copiato negli appunti:</div><a href="${shortUrl}" target="_blank">${shortUrl}</a>`; showNotification("✅ Backup generato e copiato!"); })
            .catch(() => { if (outputElem) { outputElem.style.background = "rgba(229, 9, 20, 0.1)"; outputElem.style.borderColor = "var(--primary)"; outputElem.innerHTML = `❌ Errore generazione. Copia manualmente:<br><small>${fullUrl}</small>`; prompt("Copia il link di backup manualmente:", fullUrl); } });
    } else {
        prompt("Backup URL (copia):", fullUrl);
    }
}
async function importaBackup(input) {
    if (!input) return alert("Inserisci un codice o un link di backup");
    let str = input.trim();
    if (str.includes("backup=")) { str = str.split("backup=")[1].split("&")[0]; }
    else if (str.startsWith("http") && !str.includes("backup=")) { window.location.href = str; return; }
    try {
        let json = LZString.decompressFromEncodedURIComponent(str);
        if (!json) json = LZString.decompressFromBase64(str.replace(/ /g, "+"));
        if (!json) throw new Error("La stringa non è un backup valido o è corrotta.");
        const data = JSON.parse(json);
        if (data.preferiti && Array.isArray(data.preferiti)) localStorage.setItem("preferiti", JSON.stringify(data.preferiti));
        if (data.cookies && Array.isArray(data.cookies)) data.cookies.forEach(entry => { const parts = entry.split("="); if (parts.length >= 2) { const name = parts[0].trim(); const value = parts.slice(1).join("=").trim(); setCookie(name, value, 365); }});
        showNotification("✅ Backup importato con successo!"); setTimeout(()=>{ window.location.href = window.location.origin + window.location.pathname; }, 500);
    } catch (err) { console.error("Errore import backup:", err); showNotification("❌ Errore: Il codice inserito non è valido."); }
}

// ===== UI PLAYER =====
function goBack() { if (player) { player.dispose(); player = null; } showSection('home'); }
function showLoading(show, message = "Caricamento stream...") {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) { overlay.style.display = show ? "flex" : "none"; const loadingText = overlay.querySelector(".loading-text"); if (loadingText) loadingText.textContent = message; }
}
function showError(message, details = "") {
    showLoading(false);
    const container = document.querySelector(".video-container");
    if (container) {
        const errorDiv = document.createElement("div");
        errorDiv.className = "error-message";
        errorDiv.innerHTML = `<h3>⚠️ Errore</h3><p>${message}</p>${details ? `<p style="font-size:0.9em;opacity:0.7;margin-top:0.5em;">${details}</p>` : ""}`;
        container.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
    }
}

// ===== SHORTCUTS & FEEDBACK =====
function setupKeyboardShortcuts() { document.removeEventListener("keydown", handleKeyboardShortcuts); document.addEventListener("keydown", handleKeyboardShortcuts); }
function handleKeyboardShortcuts(event) {
    if (!player || !player.readyState()) return;
    if (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA" || event.target.isContentEditable) return;
    const key = event.key.toLowerCase();
    switch (key) {
        case " ":
            event.preventDefault(); if (player.paused()) player.play(); else player.pause(); break;
        case "arrowright":
            event.preventDefault(); player.currentTime(Math.min(player.currentTime() + 5, player.duration())); showSeekFeedback("+5s"); break;
        case "arrowleft":
            event.preventDefault(); player.currentTime(Math.max(player.currentTime() - 5, 0)); showSeekFeedback("-5s"); break;
        case "arrowup":
            event.preventDefault(); player.volume(Math.min(player.volume() + 0.1, 1)); showVolumeFeedback(Math.round(player.volume()*100)); break;
        case "arrowdown":
            event.preventDefault(); player.volume(Math.max(player.volume() - 1, 0)); showVolumeFeedback(Math.round(player.volume()*100)); break;
        case "f":
            event.preventDefault(); if (player.isFullscreen()) player.exitFullscreen(); else player.requestFullscreen(); break;
        case "m":
            event.preventDefault(); player.muted(!player.muted()); break;
    }
}
function showSeekFeedback(text) {
    const feedback = document.createElement("div"); feedback.className = "keyboard-feedback"; feedback.textContent = text;
    feedback.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.8);color:#e50914;padding:20px 40px;border-radius:10px;font-size:2rem;font-weight:bold;z-index:100;pointer-events:none;animation:feedbackFade 0.8s ease;`;
    const videoContainer = document.querySelector(".video-container"); if (videoContainer) { videoContainer.appendChild(feedback); setTimeout(()=>feedback.remove(),800); }
}
function showVolumeFeedback(volumePercent) {
    let volumeDisplay = document.getElementById("volume-feedback");
    if (!volumeDisplay) {
        volumeDisplay = document.createElement("div"); volumeDisplay.id = "volume-feedback"; volumeDisplay.style.cssText = `position:absolute;top:50%;right:40px;transform:translateY(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:15px 25px;border-radius:8px;font-size:1.5rem;font-weight:bold;z-index:100;pointer-events:none;display:flex;align-items:center;gap:10px;`;
        const videoContainer = document.querySelector(".video-container"); if (videoContainer) videoContainer.appendChild(volumeDisplay);
    }
    volumeDisplay.innerHTML = `<span>🔊</span><span>${volumePercent}%</span>`; volumeDisplay.style.opacity = "1";
    if (volumeDisplay.timeoutId) clearTimeout(volumeDisplay.timeoutId);
    volumeDisplay.timeoutId = setTimeout(()=>{ volumeDisplay.style.opacity = "0"; }, 1000);
}

// ===== DYNAMIC STYLES =====
const style = document.createElement("style");
style.textContent = `
@keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(400px); opacity: 0; } }
@keyframes feedbackFade { 0% { opacity: 0; transform: translate(-50%,-50%) scale(0.8); } 20% { opacity: 1; transform: translate(-50%,-50%) scale(1); } 80% { opacity: 1; transform: translate(-50%,-50%) scale(1); } 100% { opacity: 0; transform: translate(-50%,-50%) scale(0.8); } }
#volume-feedback { transition: opacity 0.3s ease; }
`;
document.head.appendChild(style);

// ===== INIT =====
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has("backup")) {
            const backupCode = urlParams.get("backup");
            if (typeof importaBackup === "function") await importaBackup(backupCode);
            return;
        }

        const corsSelect = document.getElementById("cors-select");
        if (corsSelect) {
            corsSelect.innerHTML = "";
            CORS_LIST.forEach((proxy) => {
                const option = document.createElement("option");
                option.value = proxy;
                option.textContent = proxy.replace(/\/|\?|=/g, "");
                corsSelect.appendChild(option);
            });
            corsSelect.value = CORS || CORS_LIST[0] || "";
            CORS = corsSelect.value;
            corsSelect.addEventListener("change", (e) => {
                CORS = e.target.value;
                showNotification(`CORS proxy cambiato: ${CORS.replace(/\/|\?|=/g, "")}`);
                saveJSON(STORAGE.WORKING_PROXY, { proxy: { url: CORS, mode: CORS.includes("?") && CORS.includes("url=") ? "query" : "prefix" }, checkedAt: Date.now() });
            });
        } else {
            const best = await findBestProxy(`https://${VIXSRC_URL}/`);
            if (best) CORS = best.url;
        }

        if (typeof videojs !== "undefined") setupVideoJsXhrHook();
        else window.addEventListener("load", setupVideoJsXhrHook, { once: true });

        if (typeof setupMobileEnhancements === "function") setupMobileEnhancements();

        if (typeof endpoints === "object" && endpoints !== null) {
            for (const [key] of Object.entries(endpoints)) {
                try {
                    if (typeof fetchList !== "function") break;
                    const items = await fetchList(key);
                    const section = document.getElementById(key);
                    if (section) {
                        const carouselTrack = section.querySelector(".carousel-track");
                        if (carouselTrack && Array.isArray(items)) items.forEach(item => { if (typeof createCard === "function") carouselTrack.appendChild(createCard(item)); });
                    }
                } catch (err) { console.error(`Errore caricamento sezione ${key}:`, err); }
            }
        }

        if (typeof loadContinuaDaCookie === "function") await loadContinuaDaCookie();
        if (typeof loadPreferiti === "function") await loadPreferiti();
        if (typeof loadGenreSections === "function") await loadGenreSections();

        if (typeof setupEventListeners === "function") setupEventListeners();
        if (typeof setupCarouselNavigation === "function") setupCarouselNavigation();

        const header = document.getElementById("header");
        if (header) {
            let scrollTimeout = null;
            window.addEventListener("scroll", () => {
                if (scrollTimeout) clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(() => {
                    if (window.scrollY > 50) header.classList.add("scrolled"); else header.classList.remove("scrolled");
                }, 50);
            }, { passive: true });
        }

        window.addEventListener("beforeunload", removeVideoJsXhrHook);

        log("✅ Sito pronto!");
    } catch (e) {
        console.error("Errore durante l'inizializzazione:", e);
    }
});

// small enable for carousel buttons present in DOM
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('#results .carousel-btn').forEach(btn => { btn.disabled = false; });
});

// Expose debug API
window.StreamMerged = {
    findBestProxy, composeProxiedUrl, fetchWithProxy, getDirectStream, attemptRefreshInPlace, loadState: () => ({
        workingProxy: loadJSON(STORAGE.WORKING_PROXY),
        lastToken: loadJSON(STORAGE.LAST_TOKEN),
        lastM3u8: loadJSON(STORAGE.LAST_M3U8),
        proxyMetrics: loadJSON(STORAGE.PROXY_METRICS)
    })
};