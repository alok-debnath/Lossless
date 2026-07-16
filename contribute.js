document.addEventListener('DOMContentLoaded', () => {
    const TARGET_OWNER = 'EchoMusicApp';
    const TARGET_REPO = 'Lossless';
    const GITHUB_API_URL = 'https://api.github.com';
    const TRACK_JSON_URL = 'https://raw.githubusercontent.com/EchoMusicApp/Lossless/main/music.json';

    let gitHubAccessToken = localStorage.getItem('gh_access_token') || null;
    let gitHubUsername = null;
    let selectedFiles = []; // { id, file, isValid, song, artist }
    let fileEntryIdCounter = 0;
    let activeSearchUnwirers = []; // cleanup fns from wireYtSearchBox, for rows wiped in bulk (resetUploadForm)
    let trackSourceMode = 'upload';
    let selectedExistingUrl = null;
    let allTrackItems = [];

    const loginSection  = document.getElementById('login-section');
    const formSection   = document.getElementById('form-section');
    const statusSection = document.getElementById('status-section');

    const loginBtn  = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userAvatar  = document.getElementById('user-avatar');
    const userNameEl  = document.getElementById('user-name');

    const destDirRadios     = document.querySelectorAll('input[name="dest-dir"]');
    const trackSourceRadios = document.querySelectorAll('input[name="canvas-source"]');

    const uploadPanel    = document.getElementById('upload-panel');
    const fileInput      = document.getElementById('file-input');
    const dropZone       = document.getElementById('drop-zone');
    const fileListEl     = document.getElementById('file-list');

    const songsToLinkSection = document.getElementById('songs-to-link-section');

    const existingPanel          = document.getElementById('existing-panel');
    const existingSearch         = document.getElementById('existing-search');
    const existingResults        = document.getElementById('existing-results');
    const existingSelectedBanner = document.getElementById('existing-selected-banner');
    const existingSelectedTitle  = document.getElementById('existing-selected-title');
    const existingSelectedUrlEl  = document.getElementById('existing-selected-url');
    const clearExistingBtn       = document.getElementById('clear-existing-btn');

    const songEntriesList = document.getElementById('song-entries-list');
    const addSongBtn      = document.getElementById('add-song-btn');
    const songCountBadge  = document.getElementById('song-count-badge');

    const submitBtn = document.getElementById('submit-track-btn');

    const statusLoader      = document.getElementById('status-loader');
    const statusSuccessIcon = document.getElementById('status-success-icon');
    const statusErrorIcon   = document.getElementById('status-error-icon');
    const statusTitle       = document.getElementById('status-title');
    const statusMessage     = document.getElementById('status-message');
    const prLinkContainer   = document.getElementById('pr-link-container');
    const prLink            = document.getElementById('pr-link');
    const statusActionBtn   = document.getElementById('status-action-btn');

    const hashParams   = new URLSearchParams(window.location.hash.substring(1));
    const tokenFromHash = hashParams.get('access_token');
    if (tokenFromHash) {
        gitHubAccessToken = tokenFromHash;
        localStorage.setItem('gh_access_token', tokenFromHash);
        history.replaceState(null, null, 'contribute.html');
    }

    if (gitHubAccessToken) {
        initializeContributorPortal();
    } else {
        showLoginView();
    }

    loginBtn.addEventListener('click', () => {
        if (window.location.protocol === 'file:') {
            window.location.href = 'https://lossless.echomusic.fun/api/auth';
        } else {
            window.location.href = '/api/auth';
        }
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('gh_access_token');
        gitHubAccessToken = null;
        gitHubUsername    = null;
        showLoginView();
    });

    async function initializeContributorPortal() {
        showLoadingState('Verifying Session', 'Please wait while we establish a secure session with GitHub...');
        try {
            const response = await fetch(`${GITHUB_API_URL}/user`, {
                headers: {
                    'Authorization': `Bearer ${gitHubAccessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) throw new Error('OAuth Token expired or invalid.');

            const userData = await response.json();
            gitHubUsername = userData.login;

            userAvatar.src     = userData.avatar_url;
            userNameEl.textContent = userData.login;

            loginSection.style.display  = 'none';
            statusSection.style.display = 'none';
            formSection.style.display   = 'block';

            await loadTrackItems();
            resetUploadForm();
        } catch (error) {
            console.error('Session Init Error:', error);
            localStorage.removeItem('gh_access_token');
            gitHubAccessToken = null;
            showLoginView();
        }
    }

    function showLoginView() {
        formSection.style.display   = 'none';
        statusSection.style.display = 'none';
        loginSection.style.display  = 'block';
    }

    async function loadTrackItems() {
        try {
            const res  = await fetch(TRACK_JSON_URL);
            if (!res.ok) return;
            const data = await res.json();
            if (data.items && Array.isArray(data.items)) {
                const seen = new Set();
                allTrackItems = data.items.filter(item => {
                    if (seen.has(item.url)) return false;
                    seen.add(item.url);
                    return true;
                });
            }
        } catch (e) {
            console.warn('Could not load music.json for search:', e);
        }
    }

    function resetUploadForm() {

        activeSearchUnwirers.forEach(unwire => unwire());
        activeSearchUnwirers = [];

        trackSourceMode = 'upload';
        uploadPanel.style.display    = 'block';
        existingPanel.style.display  = 'none';
        songsToLinkSection.style.display = 'none';

        selectedFiles = [];
        fileListEl.innerHTML   = '';
        dropZone.style.display = 'flex';
        fileInput.value        = '';

        selectedExistingUrl = null;
        existingSearch.value = '';
        existingResults.style.display        = 'none';
        existingResults.innerHTML            = '';
        existingSelectedBanner.style.display = 'none';

        

        songEntriesList.innerHTML = '';
        addSongEntry();

        updateSubmitButtonState();
    }

    destDirRadios.forEach(radio => {
        radio.addEventListener('change', () => updateSubmitButtonState());
    });

    trackSourceRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            trackSourceMode = radio.value;
            if (trackSourceMode === 'upload') {
                uploadPanel.style.display        = 'block';
                existingPanel.style.display      = 'none';
                songsToLinkSection.style.display = 'none';
            } else {
                uploadPanel.style.display        = 'none';
                existingPanel.style.display      = 'block';
                songsToLinkSection.style.display = 'block';
            }
            updateSubmitButtonState();
        });
    });

    dropZone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault(); e.stopPropagation();
            dropZone.classList.add('drag-active');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault(); e.stopPropagation();
            dropZone.classList.remove('drag-active');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) handleSelectedFiles(files);
    });

    fileInput.addEventListener('change', (e) => {
        if (fileInput.files.length > 0) handleSelectedFiles(fileInput.files);
        fileInput.value = '';
    });

    function handleSelectedFiles(fileList) {
        Array.from(fileList).forEach(file => {
            const entry = {
                id: ++fileEntryIdCounter,
                file,
                isValid: false,
                song: '',
                artist: '',
                aliases: [] // extra { id, song, artist } sharing this same file's URL
            };
            selectedFiles.push(entry);
            renderFileCard(entry);
            runFileValidation(entry);
        });
        dropZone.style.display = selectedFiles.length > 0 ? 'none' : 'flex';
        updateSubmitButtonState();
    }

    function removeFileEntry(id) {
        selectedFiles = selectedFiles.filter(f => f.id !== id);
        const card = fileListEl.querySelector(`[data-file-id="${id}"]`);
        if (card) card.remove();
        dropZone.style.display = selectedFiles.length > 0 ? 'none' : 'flex';
        updateSubmitButtonState();
    }

    function renderFileCard(entry) {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.dataset.fileId = entry.id;
        card.innerHTML = `
            <div class="file-card-top">
                <div class="file-meta">
                    <i class="fas fa-file-audio file-icon"></i>
                    <div>
                        <strong class="file-name-text">${escapeHtml(entry.file.name)}</strong>
                        <span class="file-size-text">${(entry.file.size / (1024 * 1024)).toFixed(2)} MB</span>
                    </div>
                </div>
                <button type="button" class="btn-remove-file" title="Remove File">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="file-card-status pending"><i class="fas fa-circle-notch fa-spin"></i> Validating…</div>
            <div class="song-entry-search" style="display: none; position: relative; margin-top: 0.75rem;">
                <div class="existing-search-box">
                    <i class="fas fa-search existing-search-icon"></i>
                    <input type="text" class="song-api-search" placeholder="Search YT Music for song..." autocomplete="off">
                    <i class="fas fa-circle-notch fa-spin search-loader" style="display: none; position: absolute; right: 2.6rem; color: var(--text-dim);"></i>
                    <button type="button" class="song-search-close" title="Close search"><i class="fas fa-times"></i></button>
                </div>
                <div class="api-search-results existing-results-list" style="display: none; max-height: 250px; overflow-y: auto; margin-top: 0.5rem; position: absolute; top: 100%; left: 0; z-index: 10; width: 100%; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
            </div>
            <div class="file-card-fields song-entry-fields" style="margin-top: 0.75rem;">
                <div class="song-entry-text-inputs">
                    <input type="text" class="file-card-song" placeholder="Song title (e.g. Lost in Yesterday)" autocomplete="off" maxlength="120">
                    <input type="text" class="file-card-artist" placeholder="Artist name (e.g. Tame Impala)" autocomplete="off" maxlength="120">
                </div>
                <div class="song-entry-actions">
                    <button type="button" class="song-search-toggle" title="Search YT Music">
                        <i class="fas fa-search"></i>
                    </button>
                </div>
            </div>
            <div class="file-card-aliases" style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.6rem;"></div>
            <button type="button" class="btn-add-song file-card-add-alias-btn" style="margin-top: 0.6rem; padding: 0.5rem 0.9rem; font-size: 0.8rem;">
                <i class="fas fa-plus"></i> Add another song for this file
            </button>
        `;

        card.querySelector('.btn-remove-file').addEventListener('click', () => removeFileEntry(entry.id));

        const songInput   = card.querySelector('.file-card-song');
        const artistInput = card.querySelector('.file-card-artist');
        songInput.addEventListener('input', () => {
            entry.song = songInput.value.trim();
            updateSubmitButtonState();
        });
        artistInput.addEventListener('input', () => {
            entry.artist = artistInput.value.trim();
            updateSubmitButtonState();
        });

        const aliasesEl = card.querySelector('.file-card-aliases');
        card.querySelector('.file-card-add-alias-btn').addEventListener('click', () => {
            addFileCardAlias(entry, aliasesEl);
        });

        const unwireSearch = wireYtSearchBox(card);
        card.querySelector('.btn-remove-file').addEventListener('click', unwireSearch);

        fileListEl.appendChild(card);
    }

    let fileAliasIdCounter = 0;

    // A file card's "+ Add another song for this file" row: an extra {song, artist}
    // pair that reuses the same uploaded file's URL (no separate audio, no separate
    // YT search — mirrors the old single-file "Songs to Link" many-songs-per-file flow).
    function addFileCardAlias(entry, aliasesEl) {
        const alias = { id: ++fileAliasIdCounter, song: '', artist: '' };
        entry.aliases.push(alias);

        const row = document.createElement('div');
        row.dataset.aliasId = alias.id;
        row.style.cssText = 'border-top: 1px dashed var(--card-border); padding-top: 0.6rem;';
        row.innerHTML = `
            <div class="song-entry-search" style="display: none; position: relative; margin-bottom: 0.5rem;">
                <div class="existing-search-box">
                    <i class="fas fa-search existing-search-icon"></i>
                    <input type="text" class="song-api-search" placeholder="Search YT Music for song..." autocomplete="off">
                    <i class="fas fa-circle-notch fa-spin search-loader" style="display: none; position: absolute; right: 2.6rem; color: var(--text-dim);"></i>
                    <button type="button" class="song-search-close" title="Close search"><i class="fas fa-times"></i></button>
                </div>
                <div class="api-search-results existing-results-list" style="display: none; max-height: 250px; overflow-y: auto; margin-top: 0.5rem; position: absolute; top: 100%; left: 0; z-index: 10; width: 100%; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
            </div>
            <div class="song-entry-fields">
                <div class="song-entry-text-inputs">
                    <input type="text" class="file-card-alias-song" placeholder="Additional song title" autocomplete="off" maxlength="120">
                    <input type="text" class="file-card-alias-artist" placeholder="Additional artist name" autocomplete="off" maxlength="120">
                </div>
                <div class="song-entry-actions">
                    <button type="button" class="song-search-toggle" title="Search YT Music">
                        <i class="fas fa-search"></i>
                    </button>
                    <button type="button" class="btn-remove-song-entry" title="Remove this song">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;

        const aliasSongInput   = row.querySelector('.file-card-alias-song');
        const aliasArtistInput = row.querySelector('.file-card-alias-artist');
        aliasSongInput.addEventListener('input', () => {
            alias.song = aliasSongInput.value.trim();
            updateSubmitButtonState();
        });
        aliasArtistInput.addEventListener('input', () => {
            alias.artist = aliasArtistInput.value.trim();
            updateSubmitButtonState();
        });

        const unwireSearch = wireYtSearchBox(row);

        row.querySelector('.btn-remove-song-entry').addEventListener('click', () => {
            entry.aliases = entry.aliases.filter(a => a.id !== alias.id);
            unwireSearch();
            row.remove();
            updateSubmitButtonState();
        });

        aliasesEl.appendChild(row);
        updateSubmitButtonState();
    }

    function setFileCardStatus(entry, state, message) {
        const card = fileListEl.querySelector(`[data-file-id="${entry.id}"]`);
        if (!card) return;
        const statusEl = card.querySelector('.file-card-status');
        statusEl.className = `file-card-status ${state}`;
        const icon = state === 'valid' ? 'fa-check-circle' : (state === 'invalid' ? 'fa-times-circle' : 'fa-circle-notch fa-spin');
        statusEl.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
    }

    async function runFileValidation(entry) {
        entry.isValid = false;
        setFileCardStatus(entry, 'pending', 'Validating…');
        updateSubmitButtonState();

        const file = entry.file;
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'flac') {
            setFileCardStatus(entry, 'invalid', 'Invalid extension — only .flac is accepted');
            updateSubmitButtonState();
            return;
        }

        const sizeMB = file.size / (1024 * 1024);
        if (!(sizeMB <= 99.0 && file.size > 0)) {
            setFileCardStatus(entry, 'invalid', `File size is ${sizeMB.toFixed(2)} MB — must be under 99 MB`);
            updateSubmitButtonState();
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const arr = (new Uint8Array(e.target.result)).subarray(0, 4);
            let header = "";
            for (let i = 0; i < arr.length; i++) header += String.fromCharCode(arr[i]);

            if (header === "fLaC") {
                entry.isValid = true;
                setFileCardStatus(entry, 'valid', `Valid FLAC — ${sizeMB.toFixed(2)} MB`);
            } else {
                setFileCardStatus(entry, 'invalid', 'Invalid fLaC signature — not a valid FLAC file');
            }
            updateSubmitButtonState();
        };
        reader.onerror = () => {
            setFileCardStatus(entry, 'invalid', 'Failed to read file.');
            updateSubmitButtonState();
        };
        reader.readAsArrayBuffer(file.slice(0, 4));
    }

    let searchDebounce = null;
    existingSearch.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(runExistingSearch, 220);
    });

    function runExistingSearch() {
        const q = existingSearch.value.trim().toLowerCase();
        if (!q) {
            existingResults.style.display = 'none';
            existingResults.innerHTML     = '';
            return;
        }
        const matches = allTrackItems.filter(item =>
            item.song.toLowerCase().includes(q)   ||
            item.artist.toLowerCase().includes(q) ||
            item.url.toLowerCase().includes(q)
        ).slice(0, 12);

        if (matches.length === 0) {
            existingResults.innerHTML     = '<p class="existing-no-results">No tracks found matching your query.</p>';
            existingResults.style.display = 'block';
            return;
        }

        existingResults.innerHTML = matches.map((item, idx) => `
            <button type="button" class="existing-result-item" data-url="${escapeAttr(item.url)}" data-label="${escapeAttr(item.song + ' — ' + item.artist)}">
                <span class="existing-result-label">
                    <span class="existing-result-song">${escapeHtml(item.song)}</span>
                    <span class="existing-result-artist">${escapeHtml(item.artist)}</span>
                </span>
                <span class="existing-result-url">${escapeHtml(shortenUrl(item.url))}</span>
            </button>
        `).join('');
        existingResults.style.display = 'block';

        existingResults.querySelectorAll('.existing-result-item').forEach(btn => {
            btn.addEventListener('click', () => {
                selectExistingTrack(btn.dataset.url, btn.dataset.label);
            });
        });
    }

    function selectExistingTrack(url, label) {
        selectedExistingUrl = url;
        existingSelectedTitle.textContent  = label;
        existingSelectedUrlEl.textContent  = shortenUrl(url);
        existingSelectedBanner.style.display = 'flex';
        existingResults.style.display = 'none';
        existingSearch.value          = '';
        updateSubmitButtonState();
    }

    clearExistingBtn.addEventListener('click', () => {
        selectedExistingUrl = null;
        existingSelectedBanner.style.display = 'none';
        existingSearch.value = '';
        updateSubmitButtonState();
    });

    function shortenUrl(url) {
        try {
            const u = new URL(url);
            return u.hostname + u.pathname;
        } catch {
            return url;
        }
    }

    let songEntryIdCounter = 0;

    function addSongEntry(songVal = '', artistVal = '') {
        const id = ++songEntryIdCounter;
        const row = document.createElement('div');
        row.className   = 'song-entry-row';
        row.dataset.id  = id;
        row.innerHTML = `
            <div class="song-entry-content" style="flex: 1; display: flex; flex-direction: column;">
                <div class="song-entry-search" style="display: none; position: relative; margin-bottom: 0.75rem;">
                    <div class="existing-search-box">
                        <i class="fas fa-search existing-search-icon"></i>
                        <input type="text" class="song-api-search" placeholder="Search YT Music for song..." autocomplete="off">
                        <i class="fas fa-circle-notch fa-spin search-loader" style="display: none; position: absolute; right: 2.6rem; color: var(--text-dim);"></i>
                        <button type="button" class="song-search-close" title="Close search"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="api-search-results existing-results-list" style="display: none; max-height: 250px; overflow-y: auto; margin-top: 0.5rem; position: absolute; top: 100%; left: 0; z-index: 10; width: 100%; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
                </div>
                <div class="song-entry-fields">
                    <div class="song-entry-text-inputs">
                        <input type="text"
                               class="song-entry-song"
                               placeholder="Song title (e.g. Lost in Yesterday)"
                               autocomplete="off"
                               maxlength="120"
                               value="${escapeAttr(songVal)}">
                        <input type="text"
                               class="song-entry-artist"
                               placeholder="Artist name (e.g. Tame Impala)"
                               autocomplete="off"
                               maxlength="120"
                               value="${escapeAttr(artistVal)}">
                    </div>
                    <div class="song-entry-actions">
                        <button type="button" class="song-search-toggle" title="Search YT Music">
                            <i class="fas fa-search"></i>
                        </button>
                    </div>
                </div>
            </div>
            <button type="button" class="btn-remove-song-entry" title="Remove this entry">
                <i class="fas fa-trash-alt"></i>
            </button>
        `;

        row.querySelectorAll('input[type="text"]').forEach(inp => {
            inp.addEventListener('input', () => {
                updateSubmitButtonState();
            });
        });

        const unwireSearch = wireYtSearchBox(row);

        row.querySelector('.btn-remove-song-entry').addEventListener('click', () => {
            unwireSearch();
            row.remove();
            updateSongCountBadge();
            updateSubmitButtonState();
        });

        songEntriesList.appendChild(row);
        updateSongCountBadge();
        updateSubmitButtonState();
    }

    // Wires the "Search YT Music for song..." box found inside `container` to
    // `/api/search`, autofilling the container's .song-entry-song/.song-entry-artist
    // (or .file-card-song/.file-card-artist) inputs on result click (dispatching a
    // real 'input' event so each container's own input-listener updates its state).
    // Shared between addSongEntry() rows and per-file cards so both get song lookup.
    function wireYtSearchBox(container) {
        const searchWrapper    = container.querySelector('.song-entry-search');
        const toggleBtn        = container.querySelector('.song-search-toggle');
        const closeBtn         = container.querySelector('.song-search-close');
        const searchInput      = container.querySelector('.song-api-search');
        const resultsContainer = container.querySelector('.api-search-results');
        const loaderIcon       = container.querySelector('.search-loader');
        const songInput        = container.querySelector('.song-entry-song, .file-card-song, .file-card-alias-song');
        const artistInput      = container.querySelector('.song-entry-artist, .file-card-artist, .file-card-alias-artist');
        let searchTimeout = null;

        function collapseSearch() {
            searchWrapper.style.display = 'none';
            searchWrapper.classList.remove('song-search-open');
            toggleBtn.style.display = '';
            resultsContainer.style.display = 'none';
            resultsContainer.innerHTML = '';
            searchInput.value = '';
        }

        function openSearch() {
            searchWrapper.style.display = 'block';
            searchWrapper.classList.add('song-search-open');
            toggleBtn.style.display = 'none';
            searchInput.focus();
        }

        toggleBtn.addEventListener('click', openSearch);
        closeBtn.addEventListener('click', collapseSearch);

        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            const query = searchInput.value.trim();
            if (!query) {
                resultsContainer.style.display = 'none';
                resultsContainer.innerHTML = '';
                loaderIcon.style.display = 'none';
                return;
            }

            loaderIcon.style.display = 'block';
            searchTimeout = setTimeout(async () => {
                try {
                    let apiUrl = `/api/search?q=${encodeURIComponent(query)}`;
                    if (window.location.protocol === 'file:') {
                        apiUrl = `https://lossless.echomusic.fun/api/search?q=${encodeURIComponent(query)}`;
                    }

                    const res = await fetch(apiUrl);
                    if (!res.ok) throw new Error('Network response was not ok');
                    const data = await res.json();

                    loaderIcon.style.display = 'none';
                    const items = data.results || [];

                    if (items.length === 0) {
                        resultsContainer.innerHTML = '<p class="existing-no-results">No songs found.</p>';
                        resultsContainer.style.display = 'block';
                        return;
                    }

                    resultsContainer.innerHTML = items.map((item, idx) => {
                        const songName = item.title || '';
                        const artistName = item.artist || 'Unknown Artist';
                        const thumbnail = item.thumbnail || '';

                        return `
                            <button type="button" class="existing-result-item" data-song="${escapeAttr(songName)}" data-artist="${escapeAttr(artistName)}">
                                ${thumbnail ? `<img src="${escapeAttr(thumbnail)}" alt="cover" style="width: 40px; height: 40px; border-radius: 4px; margin-right: 1rem; object-fit: cover;">` : ''}
                                <span class="existing-result-label" style="text-align: left;">
                                    <span class="existing-result-song">${escapeHtml(songName)}</span>
                                    <span class="existing-result-artist">${escapeHtml(artistName)}</span>
                                </span>
                            </button>
                        `;
                    }).join('');
                    resultsContainer.style.display = 'block';

                    resultsContainer.querySelectorAll('.existing-result-item').forEach(btn => {
                        btn.addEventListener('click', () => {
                            songInput.value = btn.dataset.song;
                            artistInput.value = btn.dataset.artist;
                            songInput.dispatchEvent(new Event('input'));
                            artistInput.dispatchEvent(new Event('input'));

                            collapseSearch();

                            songInput.style.borderColor = 'var(--accent-primary)';
                            artistInput.style.borderColor = 'var(--accent-primary)';
                            setTimeout(() => {
                                songInput.style.borderColor = '';
                                artistInput.style.borderColor = '';
                            }, 800);
                        });
                    });

                } catch (error) {
                    console.error('Error fetching YT Music data:', error);
                    loaderIcon.style.display = 'none';
                    resultsContainer.innerHTML = '<p class="existing-no-results" style="color: #ef4444;">Failed to fetch results. Please try again or enter manually.</p>';
                    resultsContainer.style.display = 'block';
                }
            }, 500);
        });

        const outsideClickHandler = (e) => {
            if (!container.contains(e.target)) {
                resultsContainer.style.display = 'none';
                if (searchWrapper.style.display !== 'none' && !searchInput.value.trim()) {
                    searchWrapper.style.display = 'none';
                }
            }
        };
        document.addEventListener('click', outsideClickHandler);

        // Removed rows/cards must unregister this or it leaks on `document` for
        // the rest of the session (container stays referenced, listener never fires
        // usefully again but never gets garbage collected either). Tracked centrally
        // too so a bulk wipe (resetUploadForm) can clean up rows it didn't remove
        // one-by-one via their own remove buttons.
        const unwire = () => document.removeEventListener('click', outsideClickHandler);
        activeSearchUnwirers.push(unwire);
        return unwire;
    }

    addSongBtn.addEventListener('click', () => addSongEntry());

    function getSongEntries() {
        const rows = songEntriesList.querySelectorAll('.song-entry-row');
        return Array.from(rows).map(row => ({
            song:   row.querySelector('.song-entry-song').value.trim(),
            artist: row.querySelector('.song-entry-artist').value.trim()
        }));
    }

    function updateSongCountBadge() {
        const count = songEntriesList.querySelectorAll('.song-entry-row').length;
        songCountBadge.textContent = count === 1 ? '1 song' : `${count} songs`;
    }

    function updateSubmitButtonState() {
        let trackReady = false;

        if (trackSourceMode === 'upload') {
            const validPair = (song, artist) =>
                song.length > 0 && artist.length > 0 && !/[<>]/.test(song) && !/[<>]/.test(artist);

            trackReady = selectedFiles.length > 0 && selectedFiles.every(f =>
                f.isValid &&
                validPair(f.song, f.artist) &&
                f.aliases.every(a => validPair(a.song, a.artist))
            );
        } else {
            const entries = getSongEntries();
            const validEntries = entries.filter(e =>
                e.song.length > 0 && e.artist.length > 0 &&
                !/[<>]/.test(e.song) && !/[<>]/.test(e.artist)
            );
            const hasSongs = validEntries.length > 0 && validEntries.length === entries.length;
            trackReady = hasSongs && !!selectedExistingUrl;
        }

        submitBtn.disabled = !trackReady;
    }

    submitBtn.addEventListener('click', async () => {
        if (submitBtn.disabled) return;

        const destDir = "Music";

        showLoadingView();

        try {
            if (trackSourceMode === 'upload') {
                await submitWithNewUpload(selectedFiles, destDir);
            } else {
                const entries = getSongEntries();
                for (const entry of entries) {
                    if (/[<>]/g.test(entry.song) || /[<>]/g.test(entry.artist)) {
                        throw new Error('HTML tags are not allowed in song or artist fields.');
                    }
                }
                await submitWithExistingTrack(entries, destDir);
            }
        } catch (error) {
            console.error('Submission error:', error);
            showErrorState(error.message || 'An unknown network error occurred during submission.');
        }
    });

    async function submitWithNewUpload(fileEntries, destDir) {
        const targetNames = fileEntries.map(f => f.file.name.toLowerCase().replace(/[^a-z0-9._-]/g, '_'));
        const dupeName = targetNames.find((name, idx) => targetNames.indexOf(name) !== idx);
        if (dupeName) {
            throw new Error(`Two selected files would produce the same filename ("${gitHubUsername.toLowerCase()}-${dupeName}"). Rename one of the source files and try again.`);
        }

        const primaryEntry = fileEntries[0];
        const branchSlug   = primaryEntry.file.name.toLowerCase().replace(/[^a-z0-9._-]/g, '_').split('.')[0];
        const branchName   = fileEntries.length === 1
            ? `lossless-${gitHubUsername.toLowerCase()}-${branchSlug}`
            : `lossless-${gitHubUsername.toLowerCase()}-batch-${Date.now()}`;

        const forkOwner = await forkAndSync(branchName, primaryEntry.song);

        const uploadedEntries = [];
        let fileNum = 1;
        for (const fileEntry of fileEntries) {
            const sanitizedOriginalName = fileEntry.file.name.toLowerCase().replace(/[^a-z0-9._-]/g, '_');
            const newFilename = `${gitHubUsername.toLowerCase()}-${sanitizedOriginalName}`;
            const targetPath  = `Music/${newFilename}`;
            const trackUrl    = `https://lossless.echomusic.fun/${targetPath}`;

            updateLoadingMessage('Uploading Tracks', `Uploading ${fileNum}/${fileEntries.length}: ${newFilename}…`);
            const base64Audio = await readFileAsBase64(fileEntry.file);

            const uploadRes = await fetch(`${GITHUB_API_URL}/repos/${forkOwner}/${TARGET_REPO}/contents/${targetPath}`, {
                method: 'PUT',
                headers: buildHeaders(),
                body: JSON.stringify({
                    message: `feat: upload lossless track for ${fileEntry.song}`,
                    content: base64Audio,
                    branch: branchName
                })
            });
            if (!uploadRes.ok) throw new Error(`Failed to upload ${newFilename} to your fork.`);

            uploadedEntries.push({ song: fileEntry.song, artist: fileEntry.artist, url: trackUrl });
            fileEntry.aliases.forEach(alias => {
                uploadedEntries.push({ song: alias.song, artist: alias.artist, url: trackUrl });
            });
            fileNum++;
        }

        await updateTrackJson(forkOwner, branchName, uploadedEntries);
        const prUrl = await openPullRequest(forkOwner, branchName, uploadedEntries, destDir);
        showSuccessState(prUrl);
    }

    async function submitWithExistingTrack(entries, destDir) {
        const primaryEntry = entries[0];
        const slug        = primaryEntry.song.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
        const branchName  = `lossless-${gitHubUsername.toLowerCase()}-${slug}-link`;

        const forkOwner = await forkAndSync(branchName, primaryEntry.song);

        const newEntries = entries.map(e => ({ song: e.song, artist: e.artist, url: selectedExistingUrl }));
        await updateTrackJson(forkOwner, branchName, newEntries);
        const prUrl = await openPullRequest(forkOwner, branchName, newEntries, destDir);
        showSuccessState(prUrl);
    }

    async function forkAndSync(branchName, songLabel) {
        updateLoadingMessage('Configuring Repository', `Forking ${TARGET_OWNER}/${TARGET_REPO} to your profile…`);

        const forkRes = await fetch(`${GITHUB_API_URL}/repos/${TARGET_OWNER}/${TARGET_REPO}/forks`, {
            method: 'POST',
            headers: buildHeaders()
        });
        if (!forkRes.ok) throw new Error('Could not fork the upstream repository to your GitHub profile.');

        const forkData  = await forkRes.json();
        const forkOwner = forkData.owner.login;

        await sleep(3000);

        updateLoadingMessage('Syncing Branches', 'Ensuring your fork is up-to-date with upstream main…');
        const syncRes = await fetch(`${GITHUB_API_URL}/repos/${forkOwner}/${TARGET_REPO}/merge-upstream`, {
            method: 'POST',
            headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ branch: 'main' })
        });
        if (!syncRes.ok && syncRes.status !== 409 && syncRes.status !== 422) {
            console.warn('Warning syncing fork:', await syncRes.text());
        }

        updateLoadingMessage('Creating Work Branch', 'Creating a separate branch for your track…');
        const refRes = await fetch(`${GITHUB_API_URL}/repos/${forkOwner}/${TARGET_REPO}/git/ref/heads/main`, {
            headers: buildHeaders()
        });
        if (!refRes.ok) throw new Error('Failed to get the latest commit SHA of main.');

        const refData  = await refRes.json();
        const mainSha  = refData.object.sha;

        const branchRes = await fetch(`${GITHUB_API_URL}/repos/${forkOwner}/${TARGET_REPO}/git/refs`, {
            method: 'POST',
            headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: mainSha })
        });
        if (!branchRes.ok) {
            const txt = await branchRes.text();
            if (!txt.includes('already exists')) throw new Error('Failed to create branch: ' + txt);
        }

        return forkOwner;
    }

    async function updateTrackJson(forkOwner, branchName, entries) {
        updateLoadingMessage('Updating Database', `Adding ${entries.length} song entr${entries.length === 1 ? 'y' : 'ies'} to music.json…`);

        const trackApiUrl = `${GITHUB_API_URL}/repos/${forkOwner}/${TARGET_REPO}/contents/music.json?ref=${branchName}`;
        const trackRes = await fetch(trackApiUrl, { headers: buildHeaders() });
        if (!trackRes.ok) throw new Error('Failed to download music.json from your fork.');

        const trackData    = await trackRes.json();
        const trackSha     = trackData.sha;
        const trackContent = decodeBase64Utf8(trackData.content);
        const trackObj     = JSON.parse(trackContent);

        if (!trackObj.items || !Array.isArray(trackObj.items)) {
            throw new Error('music.json items database is missing or corrupt.');
        }

        trackObj.items.unshift(...entries);

        const updatedContent = encodeBase64Utf8(JSON.stringify(trackObj, null, 2) + '\n');

        const updateRes = await fetch(`${GITHUB_API_URL}/repos/${forkOwner}/${TARGET_REPO}/contents/music.json`, {
            method: 'PUT',
            headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `feat: update music.json — add ${entries.length} song(s)`,
                content: updatedContent,
                sha:     trackSha,
                branch:  branchName
            })
        });
        if (!updateRes.ok) throw new Error('Failed to write updated music.json to your fork.');
    }

    async function openPullRequest(forkOwner, branchName, entries, destDir) {
        updateLoadingMessage('Submitting Contribution', 'Opening Pull Request on the upstream repository…');

        const isSingle = entries.length === 1;
        const prTitle  = isSingle
            ? `feat: add lossless track for ${entries[0].song} — ${entries[0].artist}`
            : `feat: add ${entries.length} songs to lossless — ${entries.map(e => e.song).slice(0, 3).join(', ')}${entries.length > 3 ? '…' : ''}`;

        const songTable = entries.map(e =>
            `| ${e.song} | ${e.artist} | \`${e.url}\` |`
        ).join('\n');

        const prBody = `This Pull Request was submitted automatically via the Echo Music Lossless portal.\n\n### 🎵 Submission Metadata\n* **Category:** ${destDir}\n* **Total Songs Linked:** ${entries.length}\n\n### 🎶 Song Entries\n| Song Title | Artist | File |\n|---|---|---|\n${songTable}\n\n*Validation checks will run automatically on this contribution.*`;

        const prRes = await fetch(`${GITHUB_API_URL}/repos/${TARGET_OWNER}/${TARGET_REPO}/pulls`, {
            method: 'POST',
            headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: prTitle,
                head:  `${forkOwner}:${branchName}`,
                base:  'main',
                body:  prBody
            })
        });
        if (!prRes.ok) {
            const errData = await prRes.json();
            throw new Error(errData.message || 'Failed to submit the Pull Request upstream.');
        }

        const prData = await prRes.json();
        return prData.html_url;
    }

    function showLoadingState(title, message) {
        formSection.style.display   = 'none';
        loginSection.style.display  = 'none';
        statusSection.style.display = 'block';
        statusLoader.style.display  = 'block';
        statusSuccessIcon.style.display = 'none';
        statusErrorIcon.style.display   = 'none';
        prLinkContainer.style.display   = 'none';
        statusActionBtn.style.display   = 'none';
        statusTitle.textContent   = title;
        statusMessage.textContent = message;
    }

    function showLoadingView() {
        showLoadingState('Submitting Track…', 'Initializing your contribution. Do not close this browser window.');
    }

    function updateLoadingMessage(title, message) {
        statusTitle.textContent   = title;
        statusMessage.textContent = message;
    }

    function showSuccessState(prUrl) {
        statusLoader.style.display      = 'none';
        statusSuccessIcon.style.display = 'block';
        statusTitle.textContent = 'Submission Sent!';
        statusMessage.innerHTML = 'Thank you for your lossless track submission! We have automatically created a Pull Request.<br><br>The continuous integration validation checks will run. Once they pass, a maintainer will review and manually merge your contribution into the live repository.';
        prLink.href = prUrl;
        prLinkContainer.style.display = 'block';
        statusActionBtn.textContent = 'Submit Another';
        statusActionBtn.style.display = 'inline-flex';
        statusActionBtn.onclick = () => {
            resetUploadForm();
            statusSection.style.display = 'none';
            formSection.style.display   = 'block';
        };
    }

    function showErrorState(errorMsg) {
        statusLoader.style.display    = 'none';
        statusErrorIcon.style.display = 'block';
        statusTitle.textContent = 'Submission Failed';
        statusMessage.textContent = errorMsg;
        statusActionBtn.textContent = 'Modify & Retry';
        statusActionBtn.style.display = 'inline-flex';
        statusActionBtn.onclick = () => {
            statusSection.style.display = 'none';
            formSection.style.display   = 'block';
        };
    }

    function buildHeaders() {
        return {
            'Authorization': `Bearer ${gitHubAccessToken}`,
            'Accept': 'application/vnd.github.v3+json'
        };
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload  = () => resolve(reader.result.split(',')[1]);
            reader.onerror = err => reject(err);
        });
    }

    function decodeBase64Utf8(base64Str) {
        const binString = atob(base64Str.replace(/\s/g, ''));
        return new TextDecoder().decode(Uint8Array.from(binString, m => m.charCodeAt(0)));
    }

    function encodeBase64Utf8(str) {
        const binString = Array.from(new TextEncoder().encode(str), byte => String.fromCharCode(byte)).join('');
        return btoa(binString);
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeAttr(str) {
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
});
