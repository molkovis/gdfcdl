import { buildPlayerRanking } from './ranking.js';

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const state = { config: null, levels: [], players: [], ranking: { players: [], wins: [], completions: [] }, category: 'main', query: '', page: 1, playerQuery: '', playerCountry: 'all', playerPage: 1, selectedPlayerId: null };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const asset = path => new URL(path, document.baseURI).href;
  const interfaceText = () => state.config.interface || {};
  const categoryName = id => state.config.categories.find(category => category.id === id)?.name || id || interfaceText().unknownCategory || '';
  const levelCategories = level => Array.isArray(level.categories) ? level.categories : level.category ? [level.category] : [];
  const rankedCategoryName = level => {
    const rules = state.config.ranking || {}, labels = rules.categoryLabels || {};
    if (Number.isInteger(level.position) && level.position >= 1 && level.position <= rules.maxPosition) return labels[level.position <= rules.mainMaxPosition ? 'main' : 'extended'] || '';
    return categoryName(levelCategories(level)[0]);
  };
  const youtubeId = value => {
    if (!value) return '';
    try {
      const url = new URL(value);
      if (url.hostname.endsWith('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] || '';
      if (url.hostname.endsWith('youtube.com') || url.hostname.endsWith('youtube-nocookie.com')) {
        if (url.searchParams.get('v')) return url.searchParams.get('v');
        const parts = url.pathname.split('/').filter(Boolean);
        return ['embed', 'shorts', 'live', 'v'].includes(parts[0]) ? parts[1] || '' : '';
      }
    } catch { return ''; }
    return '';
  };
  const thumbnail = level => {
    const id = youtubeId(level.showcase);
    return id ? `https://img.youtube.com/vi/${encodeURIComponent(id)}/maxresdefault.jpg` : level.image || '';
  };
  const setBranding = () => {
    const branding = state.config.branding || {};
    const favicon = $('link[rel="icon"]'); if (favicon) favicon.href = asset(branding.icon || 'icon.jpg');
    ['#brand-icon', '#side-icon'].forEach(selector => { const element = $(selector); if (element) element.src = asset(branding.icon || 'icon.jpg'); });
    const masthead = $('#masthead-image'); if (masthead) masthead.src = asset(branding.banner || branding.icon || 'icon.jpg');
    const footerName = $('#footer-name'); if (footerName) footerName.textContent = state.config.siteName || '';
    const caption = $('#footer-caption'); if (caption) caption.textContent = branding.footerCaption || '';
    const headerTitle = $('#site-name'); if (headerTitle) headerTitle.textContent = branding.headerTitle || state.config.siteName || '';
  };
  const setCommon = () => {
    const detailPage = Boolean($('#detail-content'));
    document.documentElement.lang = state.config.language || 'ru';
    document.title = detailPage ? `${state.config.siteName} — ${state.config.detail?.pageTitleSuffix || ''}` : state.config.siteName;
    setBranding();
    const navigation = state.config.navigation || {};
    [['#top-levels-link', navigation.topLevels], ['#top-players-link', navigation.topPlayers]].forEach(([selector, item]) => {
      const link = $(selector);
      if (!link || !item) return;
      link.textContent = item.label || '';
      link.href = asset(item.href || './');
      if ((selector === '#top-players-link' && ($('#player-ranking') || $('#player-profile'))) || (selector === '#top-levels-link' && !$('#player-ranking') && !$('#player-profile'))) link.setAttribute('aria-current', 'page');
    });
    const note = $('#footer-note'); if (note) note.textContent = state.config.footerNote || '';
    const backTop = $('#back-top-label'); if (backTop) backTop.textContent = interfaceText().backToTop || '';
    const backLabel = $('#back-label'); if (backLabel) backLabel.textContent = state.config.detail?.backLabel || '';
  };
  const initialize = async () => {
    try {
      const [configResponse, levelsResponse, playersResponse] = await Promise.all([fetch(asset('data/config.json')), fetch(asset('data/levels.json')), fetch(asset('data/players.json'))]);
      if (!configResponse.ok || !levelsResponse.ok || !playersResponse.ok) throw new Error();
      state.config = await configResponse.json(); state.levels = await levelsResponse.json();
      const playerData = await playersResponse.json(); state.players = Array.isArray(playerData) ? playerData : Array.isArray(playerData?.players) ? playerData.players : [];
      state.ranking = buildPlayerRanking({ levels: state.levels, players: state.players, settings: state.config.ranking });
      setCommon();
      if ($('#player-profile')) renderPlayerProfile();
      else if ($('#player-ranking')) renderPlayerRanking();
      else if ($('#detail-content')) renderDetail();
      else renderHome();
    } catch {
      const root = $('#player-profile') || $('#player-list') || $('#detail-content') || $('#level-grid');
      if (root) root.innerHTML = `<section class="load-error"><h1>JSON</h1><p>${escapeHtml(state.config?.errors?.loadMessage || '')} ${escapeHtml(state.config?.errors?.serverHint || '')}</p></section>`;
    }
  };
  const renderHome = () => {
    const config = state.config, hero = config.hero || {}, list = config.list || {};
    $('#hero-eyebrow').textContent = hero.eyebrow || '';
    $('#hero-title').textContent = hero.title || '';
    $('#hero-description').textContent = hero.description || '';
    $('#total-levels').textContent = String(state.levels.filter(level => Number.isInteger(level.position) && level.position >= 1 && level.position <= config.ranking.mainMaxPosition).length).padStart(2, '0');
    $('#total-label').textContent = list.totalLabel || '';
    $('#empty-state').textContent = list.emptyMessage || '';
    $('#search').placeholder = list.searchPlaceholder || '';
    $('#search').addEventListener('input', event => { state.query = event.target.value.trim().toLocaleLowerCase(); state.page = 1; renderLevels(); });
    document.addEventListener('keydown', event => { if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); $('#search').focus(); } });
    $('#main-list-label').textContent = config.categories[0]?.name || '';
    $('#side-title').textContent = list.sideTitle || '';
    $('#side-description').textContent = list.sideDescription || '';
    renderStats(); renderLevels();
  };
  const renderStats = () => {
    const config = state.config, victors = state.ranking.wins.length;
    const labels = { levelCount: config.list.levelCountLabel, categoryCount: config.list.categoryCountLabel, victorCount: config.list.victorCountLabel };
    $('#stats').innerHTML = (config.stats || []).map(stat => {
      const value = stat.value === 'levelCount' ? state.levels.filter(level => Number.isInteger(level.position) && level.position >= 1 && level.position <= config.ranking.mainMaxPosition).length : stat.value === 'categoryCount' ? config.categories.filter(category => category.id !== 'all').length : stat.value === 'victorCount' ? victors : stat.displayValue ?? '';
      return `<div class="stat"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(labels[stat.value] || stat.label || '')}</span></div>`;
    }).join('');
  };
  const formatPoints = value => new Intl.NumberFormat(state.config.language || 'ru').format(value);
  const rankingCopy = () => state.config.playerRanking || {};
  const renderPlayerRanking = () => {
    const copy = rankingCopy();
    document.title = `${state.config.siteName} — ${copy.title || ''}`;
    $('#ranking-title').textContent = copy.title || '';
    $('#country-label').textContent = copy.countryFilterLabel || '';
    $('#country-filter').setAttribute('aria-label', copy.countryFilterLabel || '');
    $('#player-search').placeholder = copy.searchPlaceholder || '';
    const countryNames = new Intl.DisplayNames([state.config.language || 'ru'], { type: 'region' });
    const countries = [...new Set(state.ranking.players.map(item => String(item.player.country || '').toUpperCase()).filter(code => /^[A-Z]{2}$/.test(code)))].sort();
    $('#country-filter').innerHTML = `<option value="all">${escapeHtml(copy.allCountriesLabel || '')}</option>${countries.map(code => `<option value="${code}">${escapeHtml(countryNames.of(code) || code)}</option>`).join('')}`;
    $('#country-filter').value = state.playerCountry;
    $('#player-search').addEventListener('input', event => { state.playerQuery = event.target.value.trim().toLocaleLowerCase(); state.playerPage = 1; renderPlayerRows(); });
    $('#country-filter').addEventListener('change', event => { state.playerCountry = event.target.value; state.playerPage = 1; renderPlayerRows(); });
    $('#player-list').addEventListener('click', event => {
      const button = event.target.closest('[data-player-id]'); if (!button) return;
      state.selectedPlayerId = button.dataset.playerId;
      renderPlayerRows();
      renderSelectedPlayer();
    });
    renderPlayerRows();
    renderSelectedPlayer();
  };
  const renderPlayerRows = () => {
    const copy = rankingCopy();
    const filtered = state.ranking.players.filter(summary => {
      const matchesQuery = `${summary.player.nickname} ${summary.player.id} ${summary.player.country || ''}`.toLocaleLowerCase().includes(state.playerQuery);
      const matchesCountry = state.playerCountry === 'all' || String(summary.player.country || '').toUpperCase() === state.playerCountry;
      return matchesQuery && matchesCountry;
    });
    if (state.selectedPlayerId && !filtered.some(summary => summary.playerId === state.selectedPlayerId)) { state.selectedPlayerId = null; renderSelectedPlayer(); }
    const pageSize = Math.max(1, Number(copy.pageSize) || 20), pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    state.playerPage = Math.min(state.playerPage, pages);
    const shown = filtered.slice((state.playerPage - 1) * pageSize, state.playerPage * pageSize);
    $('#player-empty').textContent = copy.emptyMessage || '';
    $('#player-empty').hidden = filtered.length > 0;
    $('#player-list').innerHTML = shown.map(summary => {
      const code = String(summary.player.country || '').toUpperCase();
      const flag = /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map(char => char.codePointAt(0) + 127397)) : '';
      return `<button type="button" class="player-list-row" data-player-id="${escapeHtml(summary.playerId)}" aria-pressed="${summary.playerId === state.selectedPlayerId}"><span class="player-list-rank">#${summary.rank}</span><span class="player-list-name">${escapeHtml(summary.player.nickname)}</span><span class="player-list-score">${formatPoints(summary.points)}</span><span class="player-country-flag" aria-label="${escapeHtml(code)}">${flag}</span></button>`;
    }).join('');
    const pager = $('#player-pagination');
    pager.innerHTML = `<button type="button" data-player-page="${state.playerPage - 1}" ${state.playerPage <= 1 ? 'disabled' : ''}>${escapeHtml(copy.previousPageLabel || '←')}</button><button type="button" data-player-page="${state.playerPage + 1}" ${state.playerPage >= pages ? 'disabled' : ''}>${escapeHtml(copy.nextPageLabel || '→')}</button><span>${state.playerPage} / ${pages}</span>`;
    pager.onclick = event => { const button = event.target.closest('[data-player-page]'); if (!button || button.disabled) return; state.playerPage = Number(button.dataset.playerPage); renderPlayerRows(); };
    document.onkeydown = event => { if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) { event.preventDefault(); $('#player-search').focus(); } };
  };
  const renderSelectedPlayer = () => {
    const copy = rankingCopy(), root = $('#profile-panel');
    const summary = state.ranking.players.find(item => item.playerId === state.selectedPlayerId);
    if (!summary) {
      root.innerHTML = `<div class="profile-empty-state"><span class="profile-empty-icon" aria-hidden="true"></span><strong>${escapeHtml(copy.selectPlayerTitle || '')}</strong><span>${escapeHtml(copy.selectPlayerMessage || '')}</span></div>`;
      return;
    }
    const player = summary.player, hardest = summary.wins[0];
    const code = String(player.country || '').toUpperCase();
    const flag = /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map(char => char.codePointAt(0) + 127397)) : '';
    const external = player.youtube ? `<a href="${escapeHtml(player.youtube)}" target="_blank" rel="noopener noreferrer">↗</a>` : '';
    const hardestBlock = hardest
      ? `<a class="hardest-level-card" href="${asset(`level.html?id=${encodeURIComponent(hardest.levelSlug)}`)}"><span class="hardest-level-copy"><span>${escapeHtml(copy.hardestLabel || '')}</span><strong><b>#${hardest.position}</b> ${escapeHtml(hardest.levelName)}</strong></span><span aria-hidden="true">›</span></a>`
      : `<div class="player-profile-empty-message">${escapeHtml(copy.noPassesMessage || '')}</div>`;
    const chips = summary.wins.map(win => `<a class="player-level-chip" href="${asset(`level.html?id=${encodeURIComponent(win.levelSlug)}`)}">${escapeHtml(win.levelName)}</a>`).join('');
    root.innerHTML = `<header class="selected-player-heading">${flag ? `<span class="selected-player-flag" aria-label="${escapeHtml(code)}">${flag}</span>` : '<span class="selected-player-fallback" aria-hidden="true">●</span>'}<h2>${escapeHtml(player.nickname)} <a class="selected-profile-link" href="${asset(`player.html?id=${encodeURIComponent(player.id)}`)}" aria-label="${escapeHtml(copy.profileLinkLabel || '')}">↗</a> ${external}</h2></header><div class="selected-player-stats"><div class="selected-player-stat"><strong>#${summary.rank}</strong><span>${escapeHtml(copy.columns?.rank || '')}</span></div><div class="selected-player-stat"><strong>${formatPoints(summary.points)}</strong><span>${escapeHtml(copy.pointsUnit || '')}</span></div></div>${hardestBlock}<section class="player-levels-block"><div class="player-levels-heading"><span>${escapeHtml(copy.levelsLabel || '')}</span><span>${summary.completionCount}</span></div><div class="player-level-chips">${chips}</div></section>`;
  };
  const renderPlayerProfile = () => {
    const copy = rankingCopy(), detail = state.config.detail || {};
    document.title = `${state.config.siteName} — ${copy.profileTitle || ''}`;
    const playerId = new URLSearchParams(location.search).get('id');
    const player = state.players.find(item => item.id === playerId);
    const root = $('#player-profile'), back = $('#profile-back');
    back.textContent = `← ${copy.backLink || ''}`;
    if (!player) {
      root.innerHTML = `<section class="not-found"><p class="eyebrow">404 / ${escapeHtml(copy.profileTitle || '')}</p><h1>${escapeHtml(copy.profileMissing || '')}</h1></section>`;
      return;
    }
    const summary = state.ranking.players.find(item => item.playerId === player.id) || { rank: null, points: 0, completionCount: 0, wins: [] };
    const hardest = summary.wins[0];
    const bestLink = hardest ? `<a href="${asset(`level.html?id=${encodeURIComponent(hardest.levelSlug)}`)}">#${hardest.position} · ${escapeHtml(hardest.levelName)}</a>` : escapeHtml(copy.unrankedLabel || '');
    const externalProfile = player.youtube ? `<a href="${escapeHtml(player.youtube)}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.youtubeLabel || '')} ↗</a>` : '';
    root.innerHTML = `<section class="profile-heading"><div><p class="eyebrow">${escapeHtml(copy.profileTitle || '')} / ${escapeHtml(player.id)}</p><h1>${escapeHtml(player.nickname)}</h1>${externalProfile}</div><div class="profile-points"><strong>${formatPoints(summary.points)}</strong><span>${escapeHtml(copy.pointsUnit || '')}</span></div></section><section class="profile-stats"><div><span>${escapeHtml(copy.columns?.rank || '')}</span><strong>${summary.rank ? `#${summary.rank}` : escapeHtml(copy.unrankedLabel || '')}</strong></div><div><span>${escapeHtml(copy.columns?.completions || '')}</span><strong>${summary.completionCount}</strong></div><div><span>${escapeHtml(copy.hardestLabel || '')}</span><strong>${bestLink}</strong></div></section><section class="profile-history"><div class="victors-heading"><div><p class="eyebrow">${escapeHtml(player.nickname)}</p><h2>${escapeHtml(copy.historyTitle || '')}</h2></div><span>${summary.wins.length} ${escapeHtml(copy.completionUnit || '')}</span></div>${summary.wins.length ? `<div class="profile-pass-list">${summary.wins.map(win => `<article class="profile-pass"><span class="player-place">#${win.position}</span><a class="pass-level" href="${asset(`level.html?id=${encodeURIComponent(win.levelSlug)}`)}"><strong>${escapeHtml(win.levelName)}</strong><span>${escapeHtml(state.config.ranking.categoryLabels[win.category] || '')}</span></a><time>${escapeHtml(win.date)}</time><strong class="player-points">${formatPoints(win.points)}</strong>${win.video ? `<a class="pass-video" href="${escapeHtml(win.video)}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.videoLabel || detail.videoLink || '')} ↗</a>` : `<span class="pass-video muted">${escapeHtml(copy.noVideoLabel || '')}</span>`}</article>`).join('')}</div>` : `<div class="empty-victors">${escapeHtml(copy.noPassesMessage || '')}</div>`}</section>`;
  };
  const renderLevels = () => {
    const config = state.config, labels = interfaceText();
    const filtered = state.levels.filter(level => Number.isInteger(level.position) && level.position >= 1 && level.position <= state.config.ranking.mainMaxPosition && (!state.query || `${level.name || ''} ${level.creator || ''} ${level.levelId || ''}`.toLocaleLowerCase().includes(state.query)));
    filtered.sort((a, b) => (a.position ?? 99999) - (b.position ?? 99999));
    const pageSize = Math.max(1, Number(config.list.pageSize) || 12), pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    state.page = Math.min(state.page, pages);
    const shown = filtered.slice((state.page - 1) * pageSize, state.page * pageSize);
    $('#empty-state').hidden = filtered.length > 0;
    $('#level-grid').innerHTML = shown.map(level => {
      const image = thumbnail(level), victorCount = state.ranking.wins.filter(win => win.levelSlug === level.id).length;
      const art = image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(labels.thumbnailAltPrefix || '')} ${escapeHtml(level.name || '')}" loading="lazy" data-showcase="${escapeHtml(level.showcase || '')}">` : `<span class="row-placeholder-number">${String(level.position ?? '').padStart(2, '0')}</span><span class="row-placeholder-label">GDFC / DEMONLIST</span>`;
      const category = rankedCategoryName(level);
      return `<a class="level-row" href="${asset(`level.html?id=${encodeURIComponent(level.id)}`)}"><div class="row-art${image ? '' : ' image-placeholder'}">${art}</div><div class="row-rank">#${escapeHtml(level.position ?? labels.missingValue ?? '')}</div><div class="row-copy"><div class="row-tags"><span>${escapeHtml(level.difficulty || labels.unknownDifficulty || '')}</span><i></i><span>${escapeHtml(category)}</span></div><h3>${escapeHtml(level.name || labels.unknownLevelName || '')}</h3><p>${escapeHtml(level.creator || labels.unknownCreator || '')}</p></div><div class="row-victors"><strong>${String(victorCount).padStart(2, '0')}</strong><span>${escapeHtml(config.list.rowVictorLabel || '')}</span></div><span class="row-arrow" aria-hidden="true">↗</span></a>`;
    }).join('');
    $('#level-grid').querySelectorAll('img[data-showcase]').forEach(img => img.addEventListener('error', () => {
      if (img.dataset.fallbackTried !== 'true' && youtubeId(img.dataset.showcase)) { img.dataset.fallbackTried = 'true'; img.src = `https://img.youtube.com/vi/${encodeURIComponent(youtubeId(img.dataset.showcase))}/hqdefault.jpg`; }
      else { img.removeAttribute('src'); img.parentElement.classList.add('image-placeholder'); }
    }, { once: true }));
    const pagination = $('#pagination');
    pagination.innerHTML = pages > 1 ? `<button type="button" data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>←</button><span>${state.page} / ${pages}</span><button type="button" data-page="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''}>→</button>` : '';
    pagination.onclick = event => { const button = event.target.closest('[data-page]'); if (!button || button.disabled) return; state.page = Number(button.dataset.page); renderLevels(); $('#levels').scrollIntoView({ behavior: 'smooth' }); };
  };
  const renderDetail = () => {
    const id = new URLSearchParams(location.search).get('id'), level = state.levels.find(item => item.id === id), root = $('#detail-content'), detail = state.config.detail || {}, labels = interfaceText();
    if (!level) { root.innerHTML = `<section class="not-found"><p class="eyebrow">404 / ${escapeHtml(state.config.siteName)}</p><h1>${escapeHtml(detail.notFoundTitle || '')}</h1><p>${escapeHtml(detail.notFoundMessage || '')}</p><a class="back-link" href="${asset('./')}#levels">← ${escapeHtml(detail.backButton || '')}</a></section>`; return; }
    const image = thumbnail(level), victors = state.ranking.completions.filter(win => win.levelSlug === level.id), cats = rankedCategoryName(level);
    const fields = [[detail.positionLabel, level.position ? `#${level.position}` : detail.missingValue], [detail.categoryLabel, cats], [detail.difficultyLabel, level.difficulty], [detail.levelIdLabel, level.levelId], [detail.creatorLabel, level.creator]].filter(([, value]) => value);
    const showcase = level.showcase ? `<a class="showcase-link" href="${escapeHtml(level.showcase)}" target="_blank" rel="noopener noreferrer">${escapeHtml(detail.showcaseLink || '')} ↗</a>` : `<span class="muted">${escapeHtml(detail.missingShowcase || '')}</span>`;
    const art = image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(level.name || '')}" data-showcase="${escapeHtml(level.showcase || '')}">` : `<span class="row-placeholder-number">${String(level.position ?? '').padStart(2, '0')}</span>`;
    root.innerHTML = `<section class="detail-head"><div class="detail-art${image ? '' : ' image-placeholder'}">${art}<span class="detail-position">#${escapeHtml(level.position ?? detail.missingValue ?? '')}</span></div><div class="detail-title"><p class="eyebrow">${escapeHtml(cats)} / ${escapeHtml(level.difficulty || '')}</p><h1>${escapeHtml(level.name || '')}</h1><p>${escapeHtml(level.creator ? `${detail.createdBy || ''} ${level.creator}` : '')}</p><div class="detail-links">${showcase}<span>${escapeHtml(detail.levelIdPrefix || '')} ${escapeHtml(level.levelId || detail.missingValue || '')}</span></div></div></section><section class="detail-facts">${fields.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</section>${level.description ? `<section class="detail-description"><p class="eyebrow">${escapeHtml(detail.aboutTitle || '')}</p><p>${escapeHtml(level.description)}</p></section>` : ''}<section class="victors-section"><div class="victors-heading"><div><p class="eyebrow">${escapeHtml(detail.hallOfFame || '')}</p><h2>${escapeHtml(detail.victorsTitle || '')}</h2></div><span>${victors.length} ${escapeHtml(detail.victorsCountLabel || '')}</span></div>${victors.length ? `<div class="victor-list">${victors.map((victor, index) => `<article class="victor-row"><span class="victor-rank">${String(index + 1).padStart(2, '0')}</span><strong><a href="${asset(`player.html?id=${encodeURIComponent(victor.playerId)}`)}" aria-label="${escapeHtml(detail.victorProfileLabel || '')}">${escapeHtml(victor.player?.nickname || labels.victorFallbackName || '')}</a></strong><time>${escapeHtml(victor.date || '')}</time>${victor.video ? `<a href="${escapeHtml(victor.video)}" target="_blank" rel="noopener noreferrer">${escapeHtml(detail.videoLink || '')} ↗</a>` : `<span class="muted">${escapeHtml(detail.missingVideo || '')}</span>`}</article>`).join('')}</div>` : `<div class="empty-victors">${escapeHtml(detail.noVictorsMessage || '')}</div>`}</section>`;
    root.querySelectorAll('img[data-showcase]').forEach(img => img.addEventListener('error', () => {
      if (img.dataset.fallbackTried !== 'true' && youtubeId(img.dataset.showcase)) { img.dataset.fallbackTried = 'true'; img.src = `https://img.youtube.com/vi/${encodeURIComponent(youtubeId(img.dataset.showcase))}/hqdefault.jpg`; }
      else { img.removeAttribute('src'); img.parentElement.classList.add('image-placeholder'); }
    }, { once: true }));
  };
  initialize();
})();
