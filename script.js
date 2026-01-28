const API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
    const VIXSRC_URL = "vixsrc.to";
    const CORS_PROXIES_REQUIRING_ENCODING = [""];
    const CORS_LIST = [
        "cors-anywhere.com/",
        "corsproxy.io/",
        "api.allorigins.win/raw?url=",
        ...CORS_PROXIES_REQUIRING_ENCODING,
    ];
    let CORS = "corsproxy.io/";

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

    // Funzione per il menu mobile a tendina
    function toggleMobileMenu() {
        const controls = document.getElementById('header-controls');
        const btn = document.getElementById('mobile-menu-btn');
        controls.classList.toggle('active');
        btn.innerHTML = controls.classList.contains('active') ? "✕" : "☰";
    }
    // ===== FUNZIONI HELPER =====
function showSection(sectionId) {
    // Qui l'ID deve essere 'player', come nel tuo div
    const sections = ['home', 'results', 'player']; 
    
    sections.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.classList.add("hidden");
        }
    });
    
    const target = document.getElementById(sectionId);
    if (target) {
        target.classList.remove("hidden");
    }
}

    function showNotification(message) {
        const notification = document.createElement("div");
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 10px;
            left: 10px;
            background: rgba(229, 9, 20, 0.95);
            color: white;
            padding: 0.8rem 1rem;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            z-index: 1000;
            animation: slideIn 0.3s ease;
            font-size: 0.9rem;
            text-align: center;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = "slideOut 0.3s ease";
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }

    // ===== MIGLIORAMENTI MOBILE =====
    function setupMobileEnhancements() {
        // Rileva se è un dispositivo touch
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        if (isTouchDevice) {
            console.log("📱 Dispositivo touch rilevato, applicando ottimizzazioni mobile");
            
            // Aggiungi classe al body per CSS specifico
            document.body.classList.add('touch-device');
            
            // Migliora la scroll experience sui caroselli
            document.querySelectorAll('.carousel-track').forEach(track => {
                track.style.scrollSnapType = 'x mandatory';
                track.style.scrollPadding = '0 15px';
                
                // Aggiungi snap points
                const cards = track.querySelectorAll('.card');
                cards.forEach(card => {
                    card.style.scrollSnapAlign = 'start';
                });
            });
        }
        
        // Gestione della viewport per iOS
        function setViewportHeight() {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        }
        
        window.addEventListener('resize', setViewportHeight);
        window.addEventListener('orientationchange', setViewportHeight);
        setViewportHeight();
    }

    // ===== INIZIALIZZAZIONE =====
    document.addEventListener("DOMContentLoaded", async () => {
        // 1. GESTIONE AUTO-IMPORT BACKUP
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('backup')) {
            const backupCode = urlParams.get('backup');
            console.log("🚀 Rilevato backup nell'URL, avvio importazione automatica...");
            await importaBackup(backupCode);
            return;
        }

        // 2. CONFIGURAZIONE CORS PROXY
        const corsSelect = document.getElementById("cors-select");
        if (corsSelect) {
            CORS_LIST.forEach((proxy) => {
                const option = document.createElement("option");
                option.value = proxy;
                option.textContent = proxy.replace(/\/|\?|=/g, "");
                corsSelect.appendChild(option);
            });
            corsSelect.value = CORS;

            corsSelect.addEventListener("change", (e) => {
                CORS = e.target.value;
                console.log("🌐 CORS proxy cambiato:", CORS);
                showNotification(`CORS proxy cambiato: ${CORS.replace(/\/|\?|=/g, "")}`);
            });
        }

        // 3. SETUP VIDEO.JS
        if (typeof videojs !== "undefined") {
            setupVideoJsXhrHook();
        } else {
            window.addEventListener("load", setupVideoJsXhrHook);
        }

        // 4. SETUP MOBILE ENHANCEMENTS
        setupMobileEnhancements();

        // 5. CARICAMENTO SEZIONI HOME DA TMDB
        console.log("📡 Caricamento contenuti da TMDB...");
        for (const [key, endpoint] of Object.entries(endpoints)) {
            try {
                const items = await fetchList(key);
                const section = document.getElementById(key);
                if (section) {
                    const carouselTrack = section.querySelector(".carousel-track");
                    if (carouselTrack) {
                        items.forEach((item) => {
                            carouselTrack.appendChild(createCard(item));
                        });
                    } else {
                        console.error(`Carousel track non trovato per ${key}`);
                    }
                }
            } catch (err) {
                console.error(`Errore nel caricamento della sezione ${key}:`, err);
            }
        }

        // 6. CARICAMENTO DATI UTENTE
        await loadContinuaDaCookie();
        await loadPreferiti();
        await loadGenreSections();
        
        // 7. SETUP EVENT LISTENERS
        setupEventListeners();
        setupCarouselNavigation();
        
        // 8. SETUP HEADER SCROLL
        window.addEventListener("scroll", () => {
            const header = document.getElementById("header");
            if (window.scrollY > 50) {
                header.classList.add("scrolled");
            } else {
                header.classList.remove("scrolled");
            }
        });
        
        console.log("✅ Sito pronto!");
    });

    // ===== GESTIONE CORS =====
    function extractBaseUrl(url) {
        try {
            const CORS = document.getElementById("cors-select").value;
            let cleanUrl = url;
            if (url.includes(CORS)) {
                cleanUrl = url.split(CORS)[1];
            }

            const urlObj = new URL(cleanUrl);
            return `${urlObj.protocol}//${urlObj.host}`;
        } catch (e) {
            console.error("Error extracting base URL:", e);
            return "";
        }
    }

    function resolveUrl(url, baseUrl = "https://vixsrc.to") {
        if (url.startsWith("http://") || url.startsWith("https://")) {
            return url;
        }

        if (url.startsWith("/")) {
            return baseUrl + url;
        }

        return baseUrl + "/" + url;
    }

    function applyCorsProxy(url) {
        const CORS = document.getElementById("cors-select").value;
        const requiresEncoding = CORS_PROXIES_REQUIRING_ENCODING.some(
            (proxy) => CORS === proxy
        );
        let cleanUrl = url;
        if (url.includes(CORS)) {
            if (requiresEncoding) {
                cleanUrl = decodeURIComponent(url.split(CORS)[1]);
            } else {
                cleanUrl = url.split(CORS)[1];
            }
        }
        if (
            !cleanUrl.startsWith("http://") &&
            !cleanUrl.startsWith("https://")
        ) {
            cleanUrl = resolveUrl(cleanUrl);
            console.log("🔗 Resolved relative URL:", url, "->", cleanUrl);
        }
        if (
            cleanUrl.startsWith("data:") ||
            cleanUrl.startsWith("blob:") ||
            !cleanUrl.startsWith("https://vixsrc.to")
        ) {
            return url;
        }

        console.log("🔒 Applying CORS proxy to:", cleanUrl);
        if (requiresEncoding) {
            return `https://${CORS}${encodeURIComponent(cleanUrl)}`;
        } else {
            return `https://${CORS}${cleanUrl}`;
        }
    }

    const xhrRequestHook = (options) => {
        const originalUri = options.uri;
        options.uri = applyCorsProxy(originalUri);

        console.log("📡 XHR Request intercepted:");
        console.log("   Original:", originalUri);
        console.log("   Proxied:", options.uri);

        return options;
    };

    function setupVideoJsXhrHook() {
        if (typeof videojs === "undefined" || !videojs.Vhs) {
            console.warn("⚠️ Video.js or Vhs not loaded yet");
            return;
        }

        if (requestHookInstalled) {
            console.log("✅ XHR hook already installed");
            return;
        }

        console.log("🔧 Setting up Video.js XHR hook");
        videojs.Vhs.xhr.onRequest(xhrRequestHook);
        requestHookInstalled = true;
        console.log("✅ Video.js XHR hook installed");
    }

    function removeVideoJsXhrHook() {
        if (
            typeof videojs !== "undefined" &&
            videojs.Vhs &&
            requestHookInstalled
        ) {
            console.log("🧹 Removing XHR hook");
            videojs.Vhs.xhr.offRequest(xhrRequestHook);
            requestHookInstalled = false;
        }
    }

    // ===== GESTIONE UI =====
    function setupEventListeners() {
        // Ricerca
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
        const res = await fetch(
            `https://api.themoviedb.org/3/${endpoints[type]}?api_key=${API_KEY}&language=it-IT`
        );
        const j = await res.json();
        return j.results;
    }

    async function fetchTVSeasons(tvId) {
        if (tvId === 87623) {
            // Hercai: override stagioni personalizzate
            return [
                { season_number: 1, name: "Stagione 1" },
                { season_number: 2, name: "Stagione 2" },
                { season_number: 3, name: "Stagione 3" },
            ];
        }

        const res = await fetch(
            `https://api.themoviedb.org/3/tv/${tvId}?api_key=${API_KEY}&language=it-IT`
        );
        const j = await res.json();
        return j.seasons || [];
    }

    async function fetchEpisodes(tvId, seasonNum) {
        if (tvId === 87623) {
            const episodeCounts = {
                1: 44,
                2: 100,
                3: 112,
            };

            const count = episodeCounts[seasonNum] || 0;

            return Array.from({ length: count }, (_, i) => ({
                episode_number: i + 1,
                name: `Episodio ${i + 1}`,
            }));
        }

        const res = await fetch(
            `https://api.themoviedb.org/3/tv/${tvId}/season/${seasonNum}?api_key=${API_KEY}&language=it-IT`
        );
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

        const poster = item.poster_path
            ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
            : "https://via.placeholder.com/500x750?text=No+Image&color=333";

        const rawTitle = item.title || item.name || "";
        const anno = item.release_date?.slice(0, 4) || item.first_air_date?.slice(0, 4) || "—";
        const voto = item.vote_average?.toFixed(1) || "—";
        
        // --- NUOVA LOGICA: DETERMINAZIONE TIPO (Film o Serie TV) ---
        // Se media_type è presente usiamo quello, altrimenti controlliamo se ha un 'name' (tipico delle serie) o 'first_air_date'
        const isTV = item.media_type === 'tv' || (item.name && !item.title) || !!item.first_air_date;
        const typeLabel = isTV ? "Serie TV" : "Film";
        const typeClass = isTV ? "badge-tv" : "badge-movie";
        // -----------------------------------------------------------

        const title = rawTitle.length > 40 ? rawTitle.substring(0, 40) + "..." : rawTitle;

        let genreText = "";
        const createGenreTag = (name) => `<span class="genre-tag">${name} </span>`;

        if (item.genres && item.genres.length > 0) {
            genreText = item.genres.slice(0, 2)
                .map(g => createGenreTag(g.name))
                .join(""); 
        } 
        else if (item.genre_ids && item.genre_ids.length > 0) {
            genreText = item.genre_ids.slice(0, 2)
                .map(id => GENRES[id])
                .filter(Boolean)
                .map(name => createGenreTag(name))
                .join("");
        }

        let badge = "";
        cookieNames.forEach((name) => {
            const value = getCookie(name);
            const savedTime = parseFloat(value);
            if (savedTime > 10) {
                const match = name.match(/_S(\d+)_E(\d+)/);
                if (match) {
                    badge = `<div class="card-badge">S${match[1]} E${match[2]}</div>`;
                } else {
                    badge = `<div class="card-badge">⏪</div>`;
                }
            }
        });

        card.innerHTML = `
            <div class="card-image">
                <img src="${poster}" alt="${rawTitle}" loading="lazy">
                <div class="card-type-tag ${typeClass}">${typeLabel}</div>
                <div class="card-overlay"></div>
                ${badge}
                <div class="card-actions">
                    ${isRemovable ? 
                        `<button class="card-action-btn remove-btn" title="Rimuovi">🗑️</button>` : 
                        `<button class="card-action-btn fav-btn" title="Aggiungi ai preferiti">♥</button>`
                    }
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

        // ... resto degli event listener (favBtn, removeBtn, click card) rimangono invariati ...
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
                        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
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
            setTimeout(() => {
                openPlayer(item);
            }, 300);
        });

        return card;
    }

    // ===== GESTIONE PLAYER =====
    async function openPlayer(item) {
        currentItem = item;
        showSection('player');

        const title = item.title || item.name;
        const mediaType = item.media_type || (item.title ? "movie" : "tv");

        document.getElementById("player-title").textContent = title;
        document.getElementById("player-meta").innerHTML = ``;
        document.getElementById("player-overview").textContent = item.overview || "...";

        if (mediaType === "tv") {
            document.getElementById("episode-warning").classList.remove("hidden");
            await loadTVSeasons(item.id);
        } else {
            document.getElementById("episode-warning").classList.add("hidden");
            document.getElementById("episode-selector").classList.add("hidden");
            await loadVideo(true, item.id);
        }

        window.scrollTo(0, 0);
    }


    // ===== CARICAMENTO DINAMICO GENERI (Struttura Identica a PopularTV) =====
    async function loadGenreSections() {
        const container = document.getElementById("genre-sections-container");
        if (!container) return;

        // Pulisce il contenitore
        container.innerHTML = "";

        for (const genre of GENRE_SECTIONS) {
            const sectionId = `genre-${genre.id}-${genre.type}`;
            
            // --- QUESTA È LA PARTE CHE DEVI GUARDARE ---
            // Generiamo l'HTML identico alle tue altre sezioni
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
            // -------------------------------------------
            
            container.insertAdjacentHTML('beforeend', sectionHTML);

            try {
                // Scarica i film
                const res = await fetch(
                    `https://api.themoviedb.org/3/discover/${genre.type}?api_key=${API_KEY}&language=it-IT&with_genres=${genre.id}&sort_by=popularity.desc`
                );
                const data = await res.json();
                
                // Trova la track appena creata
                const currentSection = document.getElementById(sectionId);
                const track = currentSection.querySelector(".carousel-track");
                
                // Aggiungi le card
                data.results.forEach(item => {
                    item.media_type = genre.type; 
                    track.appendChild(createCard(item));
                });

            } catch (err) {
                console.error(`Errore genere ${genre.name}:`, err);
            }
        }
    }

    // Funzione helper per lo scroll (necessaria perché usiamo onclick nell'HTML sopra)
    function scrollGenre(sectionId, direction) {
        const section = document.getElementById(sectionId);
        if (section) {
            const track = section.querySelector(".carousel-track");
            const scrollAmount = track.clientWidth * 0.8;
            track.scrollBy({
                left: direction * scrollAmount,
                behavior: "smooth"
            });
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

        if (currentSeasons.length > 0) {
            await loadEpisodes(tvId, currentSeasons[0].season_number);
        }
    }

    async function loadEpisodes(tvId, seasonNum) {
        const episodes = await fetchEpisodes(tvId, seasonNum);
        const container = document.getElementById("episodes-list");
        container.innerHTML = "";

        episodes.forEach((ep) => {
            const div = document.createElement("div");
            div.className = "episode-item";
            div.innerHTML = `
                <div class="episode-number">Episodio ${ep.episode_number}</div>
                <div class="episode-title">${ep.name || "Senza titolo"}</div>
            `;
            div.onclick = () => {
                document.querySelectorAll(".episode-item").forEach((e) => e.classList.remove("active"));
                div.classList.add("active");
                document.getElementById("episode-warning").classList.add("hidden");
                loadVideo(false, tvId, seasonNum, ep.episode_number);
            };
            container.appendChild(div);
        });
    }

    // ===== STREAMING =====
    async function getDirectStream(tmdbId, isMovie, season = null, episode = null) {
        try {
            showLoading(true, "Connessione al server...");

            let vixsrcUrl = `https://${VIXSRC_URL}/${isMovie ? "movie" : "tv"}/${tmdbId}`;
            if (!isMovie && season !== null && episode !== null) {
                vixsrcUrl += `/${season}/${episode}`;
            }

            console.log("🎬 Fetching stream from:", vixsrcUrl);

            showLoading(true, "Recupero pagina vixsrc...");
            const response = await fetch(applyCorsProxy(vixsrcUrl));
            const html = await response.text();

            console.log("✅ Page fetched successfully, length:", html.length);

            showLoading(true, "Estrazione parametri stream...");

            const playlistParamsRegex = /window\.masterPlaylist[^:]+params:[^{]+({[^<]+?})/;
            const playlistParamsMatch = html.match(playlistParamsRegex);

            if (!playlistParamsMatch) {
                console.error("❌ HTML Preview:", html.substring(0, 1000));
                throw new Error("Impossibile trovare i parametri della playlist");
            }

            let playlistParamsStr = playlistParamsMatch[1]
                .replace(/'/g, '"')
                .replace(/\s+/g, "")
                .replace(/\n/g, "")
                .replace(/\\n/g, "")
                .replace(",}", "}");

            console.log("📋 Playlist params string:", playlistParamsStr);

            let playlistParams;
            try {
                playlistParams = JSON.parse(playlistParamsStr);
            } catch (e) {
                console.error("❌ Failed to parse params:", playlistParamsStr);
                throw new Error("Errore nel parsing dei parametri: " + e.message);
            }

            console.log("✅ Parsed params:", playlistParams);

            const playlistUrlRegex = /window\.masterPlaylist\s*=\s*\{[\s\S]*?url:\s*'([^']+)'/;
            const playlistUrlMatch = html.match(playlistUrlRegex);

            if (!playlistUrlMatch) {
                throw new Error("Impossibile trovare l'URL della playlist");
            }

            const playlistUrl = playlistUrlMatch[1];
            console.log("🔗 Playlist URL:", playlistUrl);

            const canPlayFHDRegex = /window\.canPlayFHD\s+?=\s+?(\w+)/;
            const canPlayFHDMatch = html.match(canPlayFHDRegex);
            const canPlayFHD = canPlayFHDMatch && canPlayFHDMatch[1] === "true";

            console.log("🎥 Can play FHD:", canPlayFHD);

            const hasQuery = /\?[^#]+/.test(playlistUrl);
            const separator = hasQuery ? "&" : "?";

            const m3u8Url = playlistUrl + separator + "expires=" + playlistParams.expires + "&token=" + playlistParams.token + (canPlayFHD ? "&h=1" : "");

            console.log("🎬 Generated m3u8 URL:", m3u8Url);

            baseStreamUrl = extractBaseUrl(m3u8Url);
            console.log("🏠 Base stream URL:", baseStreamUrl);

            showLoading(false);
            return {
                iframeUrl: vixsrcUrl,
                m3u8Url: m3u8Url,
            };
        } catch (error) {
            console.error("❌ Error in getDirectStream:", error);
            showLoading(false);
            showError("Errore durante l'estrazione dello stream", error.message);
            return null;
        }
    }


// ===== SOLUZIONE IBRIDA (IFRAME per iOS / PLAYER per altri) =====
    async function loadVideo(isMovie, id, season = null, episode = null) {
        showLoading(true);
        
        // Nascondi avvisi
        const warning = document.getElementById("episode-warning");
        if (warning) warning.classList.add("hidden");

        // Rilevamento iOS (iPhone/iPad)
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

        // Se siamo su iPhone/iPad, usiamo l'IFRAME (Metodo sicuro)
        if (isIOS || isSafari) {
            console.log("🍏 iOS rilevato: Passaggio alla modalità Iframe");
            
            // 1. Pulizia player Video.js se esistente
            if (player) {
                try { player.dispose(); } catch (e) {}
                player = null;
            }

            const videoContainer = document.querySelector(".video-container");
            videoContainer.innerHTML = ""; // Svuota tutto

            // 2. Calcolo URL Embed VixSrc
            // Nota: VixSrc non ha un URL /embed/ pulito pubblico documentato, 
            // ma caricando la pagina in iframe si ottiene il player.
            let embedUrl = `https://${VIXSRC_URL}/${isMovie ? "movie" : "tv"}/${id}`;
            if (!isMovie && season && episode) {
                embedUrl += `/${season}/${episode}`;
            }

            // 3. Creazione Iframe
            const iframe = document.createElement("iframe");
            iframe.src = embedUrl;
            iframe.style.width = "100%";
            iframe.style.height = "100%";
            iframe.style.border = "none";
            iframe.style.backgroundColor = "#000";
            iframe.allow = "fullscreen; autoplay; encrypted-media";
            
            // Aggiungiamo l'iframe al contenitore
            videoContainer.appendChild(iframe);
            
            showLoading(false);
            
            // Nota: Con l'iframe perdiamo il tracciamento del tempo (resume)
            // ma garantiamo che il video si veda.
            return; 
        }

        // ============================================================
        // DA QUI IN GIÙ: LOGICA PER PC/ANDROID (EXTRACTION MODE)
        // ============================================================
        try {
            setupVideoJsXhrHook();

            if (player) {
                try { player.dispose(); } catch (e) { console.warn(e); }
                player = null;
            }

            const videoContainer = document.querySelector(".video-container");
            const oldVideo = document.getElementById("player-video");
            if (oldVideo) oldVideo.remove();
            
            // Rimuovi eventuali iframe precedenti se c'erano
            const oldIframe = videoContainer.querySelector("iframe");
            if (oldIframe) oldIframe.remove();

            const newVideo = document.createElement("video");
            newVideo.id = "player-video";
            newVideo.className = "video-js vjs-theme-vixflix vjs-big-play-centered";
            newVideo.setAttribute("controls", "");
            newVideo.setAttribute("preload", "auto");
            newVideo.setAttribute("crossorigin", "anonymous");
            
            const loadingOverlay = document.getElementById("loading-overlay");
            // Reinserisci l'overlay se è stato rimosso dalla pulizia iframe
            if (!loadingOverlay) {
                // ... codice per ricreare overlay se necessario, o assumiamo esista
            } else {
                videoContainer.insertBefore(newVideo, loadingOverlay);
            }

            // Recupero Stream (Logica originale)
            const streamData = await getDirectStream(id, isMovie, season, episode);
            if (!streamData || !streamData.m3u8Url) throw new Error("Stream non trovato");

            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

player = videojs("player-video", {
    controls: true,
    fluid: true,
    aspectRatio: "16:9",
    html5: {
        vhs: {
            overrideNative: !isIOS, // usa player nativo su iPhone
            bandwidth: 5000000
        }
    }
});

const controlBar = player.getChild('controlBar');

// Trova il componente esistente che mostra il tempo corrente
const currentTimeDisplay = controlBar.getChild('CurrentTimeDisplay');

// Se esiste, lo estendiamo per mostrare anche la durata totale
if (currentTimeDisplay) {
    const originalUpdate = currentTimeDisplay.update;

    currentTimeDisplay.update = function (...args) {
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

            player.src({ src: applyCorsProxy(streamData.m3u8Url), type: "application/x-mpegURL" });

            player.ready(() => {
    showLoading(false);
    const savedVol = localStorage.getItem("vix_volume");
    if (savedVol) player.volume(parseFloat(savedVol));
    trackAndResume(player, id, isMovie ? 'movie' : 'tv', season, episode);
    player.play().catch(() => {});

    player.on('loadedmetadata', () => player.controlBar.getChild('CurrentTimeDisplay')?.update());
            
        });
    }
});

        } catch (error) {
            console.error("❌ Errore player:", error);
            showLoading(false);
            showNotification("Impossibile caricare il player nativo.", "error");
        }
    }
    // ===== LOGICA SALVATAGGIO E RIPRESA (Unificata) =====
    function trackAndResume(playerInstance, tmdbId, mediaType, season, episode) {
        // Genera nome univoco del cookie
        let cookieName = `videoTime_${mediaType}_${tmdbId}`;
        if (mediaType === "tv") {
            cookieName += `_S${season}_E${episode}`;
        }

        // 1. RESUME: Controlla se esiste un salvataggio
        const savedTime = getCookie(cookieName);
        if (savedTime) {
            const time = parseFloat(savedTime);
            // Se c'è un tempo salvato valido (> 5 secondi)
            if (time > 5) {
                playerInstance.currentTime(time);
                showNotification(`⏪ Ripreso da ${formatTime(time)}`);
            }
        }

        // 2. TRACKING: Salva il tempo mentre guardi
        playerInstance.on('timeupdate', () => {
            const current = playerInstance.currentTime();
            const duration = playerInstance.duration();
            
            // Se mancano meno di 60 secondi alla fine, cancella cookie (visione finita)
            if (duration > 0 && (duration - current) < 60) {
                setCookie(cookieName, "", -1); 
            } else {
                // Altrimenti salva ogni secondo (cookie dura 30 giorni)
                if (current > 5) {
                    setCookie(cookieName, current.toFixed(0), 30); 
                }
            }
        });
    }

    // ===== GESTIONE CAROSELLI =====
    function setupCarouselNavigation() {
        document.querySelectorAll(".carousel-btn").forEach(btn => {
            btn.addEventListener("click", function() {
                const target = this.getAttribute("data-target");
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
        carouselElement.scrollBy({
            left: direction * scrollAmount,
            behavior: "smooth"
        });
    }

    // ===== GESTIONE PREFERITI =====
    function getPreferiti() {
        const raw = localStorage.getItem("preferiti");
        return raw ? JSON.parse(raw) : [];
    }

    function addPreferito(item) {
        const preferiti = getPreferiti();
        const id = `${item.media_type || (item.title ? "movie" : "tv")}-${item.id}`;
        if (!preferiti.includes(id)) {
            preferiti.push(id);
            localStorage.setItem("preferiti", JSON.stringify(preferiti));
        }
    }

    function removePreferito(item) {
        const preferiti = getPreferiti();
        const id = `${item.media_type || (item.title ? "movie" : "tv")}-${item.id}`;
        const updated = preferiti.filter((p) => p !== id);
        localStorage.setItem("preferiti", JSON.stringify(updated));
    }

    async function loadPreferiti() {
        const ids = getPreferiti();
        const items = [];

        for (const id of ids) {
            const [mediaType, tmdbId] = id.split("-");
            try {
                const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${API_KEY}&language=it-IT`);
                const data = await res.json();
                data.media_type = mediaType;
                items.push(data);
            } catch (err) {
                console.error("❌ Errore nel recupero TMDB:", err);
            }
        }

        const carousel = document.getElementById("preferiti-carousel");
        if (carousel) {
            carousel.innerHTML = "";

            items.forEach((item) => {
                const card = createCard(item, [], false);

                // Pulsante per rimuovere dai preferiti
                const removeBtn = document.createElement("button");
                removeBtn.innerHTML = "🗑️";
                removeBtn.className = "card-action-btn remove-btn";
                removeBtn.title = "Rimuovi dai preferiti";

                removeBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    removePreferito(item);
                    showNotification(`⭐ "${item.title || item.name}" rimosso dai preferiti`);
                    setTimeout(() => location.reload(), 500);
                });

                // Rimuovi il tasto "Aggiungi ai preferiti" visto che già lo è
                const favBtn = card.querySelector(".fav-btn");
                if (favBtn) {
                    favBtn.remove();
                }
                
                // Aggiungi il tasto rimuovi
                const cardActions = card.querySelector(".card-actions");
                if (cardActions) {
                    cardActions.innerHTML = ""; // Pulisci azioni esistenti
                    cardActions.appendChild(removeBtn);
                }

                carousel.appendChild(card);
            });

            // Mostra la sezione se ci sono contenuti
            const section = document.getElementById("preferiti");
            if (section) {
                if (items.length > 0) {
                    section.classList.remove("hidden");
                } else {
                    section.classList.add("hidden");
                }
            }
        }
    }

    // ===== GESTIONE COOKIE & TIME =====
    function setCookie(name, value, days) {
        const d = new Date();
        d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
        document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/`;
    }

    function getCookie(name) {
        const target = name + "=";
        return document.cookie
            .split(";")
            .map((c) => c.trim())
            .filter((c) => c.startsWith(target))
            .map((c) => decodeURIComponent(c.substring(target.length)))[0] || null;
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    }

// ===== CARICAMENTO SEZIONE CONTINUA A GUARDARE (CORRETTO) =====
    async function loadContinuaDaCookie() {
    const carousel = document.getElementById("continua-carousel");
    const section = document.getElementById("continua-visione");

    if (!carousel || !section) return;

    carousel.innerHTML = ""; // Pulisci
    const allCookies = document.cookie.split(';').map(c => c.trim());
    const lastCookieByContent = new Map(); // key = `${type}_${tmdbId}` -> { name, value, parts, index }

    // Prima passata: per ogni cookie videoTime_ memorizza l'ultima occorrenza (indice maggiore)
    for (let i = 0; i < allCookies.length; i++) {
        const cookie = allCookies[i];
        const separatorIndex = cookie.indexOf('=');
        if (separatorIndex === -1) continue;
        const name = cookie.substring(0, separatorIndex);
        if (!name.startsWith("videoTime_")) continue;

        const rawValue = cookie.substring(separatorIndex + 1);
        const value = parseFloat(rawValue);
        if (isNaN(value) || value < 10) continue;

        const parts = name.split('_'); // videoTime_type_id_Sxx_Exx
        if (parts.length < 3) continue;
        const type = parts[1];
        const tmdbId = parts[2];
        const key = `${type}_${tmdbId}`;

        // Sovrascrivi sempre con l'ultima occorrenza (indice maggiore)
        lastCookieByContent.set(key, { name, value, parts, type, tmdbId, index: i });
    }

    const processedIds = new Set();
    let hasItems = false;

    // Seconda passata: itera solo sui cookie "ultimi" trovati
    for (const [key, info] of lastCookieByContent.entries()) {
        const { name, parts, type, tmdbId, index } = info;

        if (processedIds.has(key)) continue;
        processedIds.add(key);

        hasItems = true;

        try {
            // Scarica dati TMDB
            const res = await fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${API_KEY}&language=it-IT`);
            const item = await res.json();

            // Variabili per Serie TV
            let season = null, episode = null;

            // Se è una serie e abbiamo i dati di stagione/episodio nel cookie
            if (type === 'tv' && parts.length >= 5) {
                season = parts[3].replace(/^S/i, '');
                episode = parts[4].replace(/^E/i, '');
                // Modifica titolo visualizzato nella card
                item.name = `${item.name} (S${season}x${episode})`;
            }

            // Crea la card
            const card = createCard(item, [name], true);

            // --- LOGICA CLICK SPECIALE PER SERIE TV ---
            if (type === 'tv' && season !== null && episode !== null) {
                card.addEventListener("click", async (e) => {
                    if (e.target.closest('.remove-btn')) return;
                    e.stopImmediatePropagation();
                    e.preventDefault();

                    await openPlayer(item);
                    console.log(`▶ Ripresa forzata serie (ultimo cookie index ${index}): S${season} E${episode}`);
                    loadVideo(false, tmdbId, parseInt(season, 10), parseInt(episode, 10));
                }, true);
            } else {
                // click normale per film o serie senza episodio info
                card.addEventListener("click", async (e) => {
                    if (e.target.closest('.remove-btn')) return;
                    e.stopImmediatePropagation();
                    e.preventDefault();

                    await openPlayer(item);
                    loadVideo(false, tmdbId);
                }, true);
            }

            carousel.appendChild(card);
            shownContinuaIds.add(item.id);

        } catch (err) {
            console.error("Errore caricamento continua a guardare:", err);
        }
    }

    section.classList.toggle("hidden", !hasItems);
}

    // ===== RICERCA =====
    async function performSearch(query) {
        const res = await fetch(
            `https://api.themoviedb.org/3/search/multi?api_key=${API_KEY}&language=it-IT&query=${encodeURIComponent(query)}`
        );
        const data = await res.json();

        const resultsDiv = document.getElementById("results");
        if (!resultsDiv) return;
        
        resultsDiv.innerHTML = `
            <h2>Risultati della ricerca per: "${query}"</h2>
            <div class="carousel-section">
                <div class="carousel-container">
                    <div class="carousel-track" id="search-carousel"></div>
                </div>
            </div>
        `;

        const carousel = document.getElementById("search-carousel");
        if (!carousel) return;

        const filteredResults = data.results.filter(
            (item) => item.media_type !== "person" && item.poster_path
        );

        if (filteredResults.length === 0) {
            resultsDiv.innerHTML += `<p style="text-align: center; margin-top: 2rem; color: var(--text-secondary);">Nessun risultato trovato per "${query}"</p>`;
        } else {
            filteredResults.forEach((item) => {
                carousel.appendChild(createCard(item));
            });
        }
        
        showSection('results');
    }

    // ===== BACKUP =====
    function esportaBackup() {
        const payload = { 
            preferiti: getPreferiti(), 
            cookies: document.cookie.split(";").map(c => c.trim()).filter(c => c.startsWith("videoTime_")) 
        };
        const json = JSON.stringify(payload);
        const compressed = LZString.compressToEncodedURIComponent(json);
        const fullUrl = `${window.location.origin}${window.location.pathname}?backup=${compressed}`;

        const apiUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(fullUrl)}`;
        
        // Mostriamo un caricamento temporaneo nel paragrafo
        const outputElem = document.getElementById("codiceGenerato");
        outputElem.innerHTML = "⏳ Generazione link in corso...";
        outputElem.classList.add("show");
        
        fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`)
            .then(res => res.json())
            .then(data => {
                const shortUrl = data.contents.trim();
                navigator.clipboard.writeText(shortUrl);
                
                // Aggiorniamo il contenuto dinamicamente
                outputElem.innerHTML = `
                    <div style="margin-bottom: 5px;">✅ <strong>Backup Pronto!</strong></div>
                    <div style="font-size: 0.8rem; opacity: 0.8; margin-bottom: 8px;">Il link è stato copiato negli appunti:</div>
                    <a href="${shortUrl}" target="_blank">${shortUrl}</a>
                `;
                
                showNotification("✅ Backup generato e copiato!");
            })
            .catch(() => {
                outputElem.style.background = "rgba(229, 9, 20, 0.1)";
                outputElem.style.borderColor = "var(--primary)";
                outputElem.innerHTML = `❌ Errore generazione. Copia manualmente:<br><small>${fullUrl}</small>`;
                prompt("Copia il link di backup manualmente:", fullUrl);
            });
    }
    
    async function importaBackup(input) {
        if (!input) return alert("Inserisci un codice o un link di backup");
        let str = input.trim();

        if (str.includes("backup=")) {
            console.log("🔍 Estrazione codice da parametro URL...");
            str = str.split("backup=")[1].split("&")[0];
        } else if (str.startsWith("http") && !str.includes("backup=")) {
            console.log("🔗 Rilevato link breve, reindirizzamento...");
            window.location.href = str;
            return;
        }

        console.log("📦 Decodifica del codice in corso...");

        try {
            let json = LZString.decompressFromEncodedURIComponent(str);
            
            if (!json) {
                json = LZString.decompressFromBase64(str.replace(/ /g, "+"));
            }

            if (!json) throw new Error("La stringa non è un backup valido o è corrotta.");

            const data = JSON.parse(json);

            if (data.preferiti && Array.isArray(data.preferiti)) {
                localStorage.setItem("preferiti", JSON.stringify(data.preferiti));
            }

            if (data.cookies && Array.isArray(data.cookies)) {
                data.cookies.forEach(entry => {
                    const parts = entry.split("=");
                    if (parts.length >= 2) {
                        const name = parts[0].trim();
                        const value = parts.slice(1).join("=").trim();
                        setCookie(name, value, 365);
                    }
                });
            }
            
            showNotification("✅ Backup importato con successo!");
            setTimeout(() => {
                window.location.href = window.location.origin + window.location.pathname;
            }, 500);

        } catch (err) {
            console.error("❌ Errore critico importazione:", err);
            showNotification("❌ Errore: Il codice inserito non è valido.");
        }
    }

    // ===== FUNZIONI UI PLAYER =====
    function goBack() {
        if (player) {
            player.dispose();
            player = null;
        }
        showSection('home');
    }

    function showLoading(show, message = "Caricamento stream...") {
        const overlay = document.getElementById("loading-overlay");
        if (overlay) {
            overlay.style.display = show ? "flex" : "none";
            const loadingText = overlay.querySelector(".loading-text");
            if (loadingText) {
                loadingText.textContent = message;
            }
        }
    }

    function showError(message, details = "") {
        showLoading(false);
        const container = document.querySelector(".video-container");
        if (container) {
            const errorDiv = document.createElement("div");
            errorDiv.className = "error-message";
            errorDiv.innerHTML = `<h3>⚠️ Errore</h3><p>${message}</p>${details ? `<p style="font-size:0.9em;opacity:0.7;margin-top:0.5em;">${details}</p>` : ""}`;
            container.appendChild(errorDiv);

            setTimeout(() => {
                errorDiv.remove();
            }, 5000);
        }
    }

    // ===== SHORTCUTS KEYBOARD =====
    function setupKeyboardShortcuts() {
        document.removeEventListener("keydown", handleKeyboardShortcuts);
        document.addEventListener("keydown", handleKeyboardShortcuts);
    }

    function handleKeyboardShortcuts(event) {
        if (!player || !player.readyState()) {
            return;
        }

        if (
            event.target.tagName === "INPUT" ||
            event.target.tagName === "TEXTAREA" ||
            event.target.isContentEditable
        ) {
            return;
        }

        const key = event.key.toLowerCase();

        switch (key) {
            case " ":
                event.preventDefault();
                if (player.paused()) {
                    player.play();
                } else {
                    player.pause();
                }
                console.log("⌨️ Play/Pause toggled");
                break;

            case "arrowright":
                event.preventDefault();
                const newTimeForward = Math.min(player.currentTime() + 5, player.duration());
                player.currentTime(newTimeForward);
                showSeekFeedback("+5s");
                break;

            case "arrowleft":
                event.preventDefault();
                const newTimeBackward = Math.max(player.currentTime() - 5, 0);
                player.currentTime(newTimeBackward);
                showSeekFeedback("-5s");
                break;

            case "arrowup":
                event.preventDefault();
                const newVolumeUp = Math.min(player.volume() + 0.1, 1);
                player.volume(newVolumeUp);
                showVolumeFeedback(Math.round(newVolumeUp * 100));
                break;

            case "arrowdown":
                event.preventDefault();
                const newVolumeDown = Math.max(player.volume() - 0.1, 0);
                player.volume(newVolumeDown);
                showVolumeFeedback(Math.round(newVolumeDown * 100));
                break;

            case "f":
                event.preventDefault();
                if (player.isFullscreen()) {
                    player.exitFullscreen();
                } else {
                    player.requestFullscreen();
                }
                console.log("⌨️ Fullscreen toggled");
                break;

            case "m":
                event.preventDefault();
                player.muted(!player.muted());
                console.log("⌨️ Mute toggled:", player.muted() ? "ON" : "OFF");
                break;
        }
    }

    function showSeekFeedback(text) {
        const feedback = document.createElement("div");
        feedback.className = "keyboard-feedback";
        feedback.textContent = text;
        feedback.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: #e50914;
            padding: 20px 40px;
            border-radius: 10px;
            font-size: 2rem;
            font-weight: bold;
            z-index: 100;
            pointer-events: none;
            animation: feedbackFade 0.8s ease;
        `;

        const videoContainer = document.querySelector(".video-container");
        if (videoContainer) {
            videoContainer.appendChild(feedback);
            setTimeout(() => feedback.remove(), 800);
        }
    }

    function showVolumeFeedback(volumePercent) {
        let volumeDisplay = document.getElementById("volume-feedback");

        if (!volumeDisplay) {
            volumeDisplay = document.createElement("div");
            volumeDisplay.id = "volume-feedback";
            volumeDisplay.style.cssText = `
                position: absolute;
                top: 50%;
                right: 40px;
                transform: translateY(-50%);
                background: rgba(0, 0, 0, 0.8);
                color: #fff;
                padding: 15px 25px;
                border-radius: 8px;
                font-size: 1.5rem;
                font-weight: bold;
                z-index: 100;
                pointer-events: none;
                display: flex;
                align-items: center;
                gap: 10px;
            `;

            const videoContainer = document.querySelector(".video-container");
            if (videoContainer) {
                videoContainer.appendChild(volumeDisplay);
            }
        }

        volumeDisplay.innerHTML = `<span>🔊</span><span>${volumePercent}%</span>`;
        volumeDisplay.style.opacity = "1";

        if (volumeDisplay.timeoutId) {
            clearTimeout(volumeDisplay.timeoutId);
        }

        volumeDisplay.timeoutId = setTimeout(() => {
            volumeDisplay.style.opacity = "0";
        }, 1000);
    }

    // ===== STYLES DINAMICI =====
    const style = document.createElement("style");
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(400px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(400px); opacity: 0; }
        }
        @keyframes feedbackFade {
            0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
            20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
        }
        #volume-feedback {
            transition: opacity 0.3s ease;
        }
    `;
    document.head.appendChild(style);
    
    
    document.querySelectorAll('#results .carousel-btn').forEach(btn => {
    btn.disabled = false;
});