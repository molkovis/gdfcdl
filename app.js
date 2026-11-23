import { buildPlayerRanking, pointsForPosition } from './ranking.js';

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
      const [configResponse, levelsResponse, playersResponse] = await Promise.all([fetch(asset('data/config.json'), { cache: 'no-cache' }), fetch(asset('data/levels.json'), { cache: 'no-cache' }), fetch(asset('data/players.json'), { cache: 'no-cache' })]);
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
    $('#empty-state').textContent = list.emptyMessage || '';
    $('#search').placeholder = list.searchPlaceholder || '';
    $('#search').addEventListener('input', event => { state.query = event.target.value.trim().toLocaleLowerCase(); state.page = 1; renderLevels(); });
    document.addEventListener('keydown', event => { if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); $('#search').focus(); } });
    $('#main-list-label').textContent = config.categories[0]?.name || '';
    renderLevels();
  };
  const formatPoints = value => new Intl.NumberFormat(state.config.language || 'ru').format(value);
  const rankingCopy = () => state.config.playerRanking || {};
  const levelsVerifiedBy = player => state.levels.filter(level => {
    const values = Array.isArray(level.verifier) ? level.verifier : [level.verifier];
    return values.some(value => typeof value === 'string' && (value.trim().toLocaleLowerCase() === String(player.nickname || '').trim().toLocaleLowerCase() || value.trim() === player.id));
  }).sort((a, b) => (a.position || Infinity) - (b.position || Infinity));
  const levelChips = levels => levels.map(level => `<a class="player-level-chip" href="${asset(`level.html?id=${encodeURIComponent(level.id)}`)}">${escapeHtml(level.name || '')}</a>`).join('');
  const recordsForPlayer = player => {
    const seen = new Set(), records = [];
    for (const level of state.levels) for (const record of Array.isArray(level.victors) ? level.victors : []) {
      if (!record || record.playerId !== player.id || seen.has(level.id) || !Number.isFinite(Number(record.percent)) || Number(record.percent) < 0 || Number(record.percent) > 100) continue;
      seen.add(level.id);
      records.push({ level, percent: Number(record.percent), date: record.date || '', video: typeof record.video === 'string' ? record.video : '' });
    }
    return records.sort((a, b) => (a.level.position || Infinity) - (b.level.position || Infinity));
  };
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
    const verified = levelsVerifiedBy(player);
    const mainWins = summary.wins.filter(win => win.category === 'main').map(win => ({ id: win.levelSlug, name: win.levelName }));
    const extendedWins = summary.wins.filter(win => win.category === 'extended').map(win => ({ id: win.levelSlug, name: win.levelName }));
    const winsBlock = (title, items, className) => `<section class="player-levels-block ${className}"><div class="player-levels-heading"><span>${title}</span><span>${items.length}</span></div><div class="player-level-chips">${levelChips(items)}</div></section>`;
    root.innerHTML = `<header class="selected-player-heading">${flag ? `<span class="selected-player-flag" aria-label="${escapeHtml(code)}">${flag}</span>` : '<span class="selected-player-fallback" aria-hidden="true">●</span>'}<h2>${escapeHtml(player.nickname)} <a class="selected-profile-link" href="${asset(`player.html?id=${encodeURIComponent(player.id)}`)}" aria-label="${escapeHtml(copy.profileLinkLabel || '')}">↗</a> ${external}</h2></header><div class="selected-player-stats"><div class="selected-player-stat"><strong>#${summary.rank}</strong><span>${escapeHtml(copy.columns?.rank || '')}</span></div><div class="selected-player-stat"><strong>${formatPoints(summary.points)}</strong><span>${escapeHtml(copy.pointsUnit || '')}</span></div></div>${hardestBlock}${mainWins.length ? winsBlock(escapeHtml(copy.mainLevelsLabel || 'Main уровни'), mainWins, 'main-levels-block') : ''}${extendedWins.length ? winsBlock(escapeHtml(copy.extendedLevelsLabel || 'Extended уровни'), extendedWins, 'extended-levels-block') : ''}<section class="player-levels-block verified-levels-block"><div class="player-levels-heading"><span>${escapeHtml(copy.verifiedLevelsLabel || 'Из которых проверены')}</span><span>${verified.length}</span></div><div class="player-level-chips">${levelChips(verified)}</div>${verified.length ? '' : `<p class="verified-empty">${escapeHtml(copy.noVerifiedLevels || 'Пока нет проверенных уровней')}</p>`}</section>`;
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
    const code = String(player.country || '').toUpperCase();
    const flag = /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map(char => char.codePointAt(0) + 127397)) : '';
    const verified = levelsVerifiedBy(player), records = recordsForPlayer(player);
    const mainWins = summary.wins.filter(win => win.category === 'main').map(win => ({ id: win.levelSlug, name: win.levelName }));
    const extendedWins = summary.wins.filter(win => win.category === 'extended').map(win => ({ id: win.levelSlug, name: win.levelName }));
    const levelSection = (title, items, className = '') => `<section class="profile-level-section ${className}"><div class="profile-level-section-title"><strong>${title}</strong><span>${items.length}</span></div><div class="profile-level-chips">${items.length ? levelChips(items) : `<span class="profile-no-levels">${escapeHtml(className.includes('verified') ? copy.noVerifiedLevels || 'Пока нет проверенных уровней' : copy.noPassesMessage || '')}</span>`}</div></section>`;
    const recordsMarkup = records.length ? records.map(({ level, percent, date, video }) => `<article class="record-row"><span class="record-rank">#${escapeHtml(level.position ?? '—')}</span><a class="record-name" href="${asset(`level.html?id=${encodeURIComponent(level.id)}`)}">${escapeHtml(level.name || '')}</a><time>${escapeHtml(date)}</time><span class="record-percent">${percent}%</span><span class="record-check ${percent === 100 ? 'is-complete' : ''}" aria-label="${percent === 100 ? 'Полное прохождение' : 'Неполное прохождение'}">${percent === 100 ? '✓' : '·'}</span>${video ? `<a class="record-video" href="${escapeHtml(video)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(copy.videoLabel || 'Видео прохождения')}">▶</a>` : '<span class="record-video record-video-empty">▶</span>'}</article>`).join('') : `<div class="empty-victors">${escapeHtml(copy.noPassesMessage || '')}</div>`;
    root.innerHTML = `<section class="profile-overview"><header class="profile-identity">${flag ? `<span class="profile-country-flag" aria-label="${escapeHtml(code)}">${flag}</span>` : ''}<h1>${escapeHtml(player.nickname)} ${externalProfile}</h1><span class="profile-link-icon" aria-hidden="true">↗</span></header><div class="profile-overview-stats"><div><span class="profile-stat-icon trophy-icon">♜</span><strong>${summary.rank ? `#${summary.rank}` : escapeHtml(copy.unrankedLabel || '')}</strong><small>${escapeHtml(copy.columns?.rank || '')}</small></div><div><span class="profile-stat-icon points-icon">✦</span><strong>${formatPoints(summary.points)}</strong><small>${escapeHtml(copy.pointsUnit || '')}</small></div></div>${hardest ? `<a class="hardest-level-card" href="${asset(`level.html?id=${encodeURIComponent(hardest.levelSlug)}`)}"><span class="hardest-level-copy"><span>${escapeHtml(copy.hardestLabel || '')}</span><strong><b>#${hardest.position}</b> ${escapeHtml(hardest.levelName)}</strong></span><span aria-hidden="true">›</span></a>` : ''}${levelSection(escapeHtml(copy.mainLevelsLabel || '★ Main уровни'), mainWins, 'main-levels-block')}${extendedWins.length ? levelSection(escapeHtml(copy.extendedLevelsLabel || '● Extended уровни'), extendedWins, 'extended-levels-block') : ''}${levelSection(escapeHtml(copy.verifiedLevelsLabel || '✿ Из которых проверены'), verified, 'verified-levels-block')}</section><section class="profile-records"><header><h2>▤ ${escapeHtml(copy.recordsTitle || copy.historyTitle || 'Рекорды')}</h2><span>${records.length}</span></header><div class="profile-record-list">${recordsMarkup}</div></section>`;
  };
  const renderLevels = () => {
    const config = state.config, labels = interfaceText();
    const filtered = state.levels.filter(level => Number.isInteger(level.position) && level.position >= 1 && level.position <= state.config.ranking.mainMaxPosition && (!state.query || `${level.name || ''} ${(level.creators || [level.creator || '']).join(' ')} ${level.verifier || ''} ${level.levelId || ''}`.toLocaleLowerCase().includes(state.query)));
    filtered.sort((a, b) => (a.position ?? 99999) - (b.position ?? 99999));
    const pageSize = Math.max(1, Number(config.list.pageSize) || 12), pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    state.page = Math.min(state.page, pages);
    const shown = filtered.slice((state.page - 1) * pageSize, state.page * pageSize);
    $('#empty-state').hidden = filtered.length > 0;
    $('#level-grid').innerHTML = shown.map(level => {
      const image = thumbnail(level), creators = Array.isArray(level.creators) ? level.creators.filter(Boolean) : [level.creator].filter(Boolean), verifier = level.verifier || '', points = pointsForPosition(level.position, config.ranking);
      const art = image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(labels.thumbnailAltPrefix || '')} ${escapeHtml(level.name || '')}" loading="lazy" data-showcase="${escapeHtml(level.showcase || '')}">` : `<span class="row-placeholder-number">${String(level.position ?? '').padStart(2, '0')}</span><span class="row-placeholder-label">GDFC / DEMONLIST</span>`;
      return `<a class="level-row" href="${asset(`level.html?id=${encodeURIComponent(level.id)}`)}"><div class="row-art${image ? '' : ' image-placeholder'}">${art}</div><div class="row-rank">#${escapeHtml(level.position ?? labels.missingValue ?? '')}</div><div class="row-copy"><h3>${escapeHtml(level.name || labels.unknownLevelName || '')}</h3><div class="row-meta"><span><small>${escapeHtml(config.list.creatorLabel || 'Создатели')}</small>${escapeHtml(creators.join(', ') || labels.unknownCreator || '')}</span><span class="row-verifier"><small>${escapeHtml(config.list.verifierLabel || 'Верифер')}</small>${escapeHtml(verifier || config.list.unknownVerifier || 'Не указан')}</span><span class="row-points"><small>${escapeHtml(config.list.pointsLabel || 'Баллы за уровень')}</small>${escapeHtml(points)}</span></div></div><span class="row-arrow" aria-hidden="true">↗</span></a>`;
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
    const image = thumbnail(level), victors = state.ranking.completions.filter(win => win.levelSlug === level.id);
    const creators = Array.isArray(level.creators) ? level.creators.filter(Boolean) : [level.creator].filter(Boolean);
    const fields = [[detail.levelIdLabel || 'ID Geometry Dash', level.levelId], [detail.pointsLabel || 'Баллы за уровень', pointsForPosition(level.position, state.config.ranking)]].filter(([, value]) => value !== undefined && value !== '');
    const videoId = youtubeId(level.showcase);
    const showcase = videoId ? `<div class="detail-showcase"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}" title="${escapeHtml(level.name || '')} showcase" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>` : level.showcase ? `<a class="showcase-link" href="${escapeHtml(level.showcase)}" target="_blank" rel="noopener noreferrer">${escapeHtml(detail.showcaseLink || '')} ↗</a>` : `<span class="muted">${escapeHtml(detail.missingShowcase || '')}</span>`;
    const art = image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(level.name || '')}" data-showcase="${escapeHtml(level.showcase || '')}">` : `<span class="row-placeholder-number">${String(level.position ?? '').padStart(2, '0')}</span>`;
    root.innerHTML = `<section class="detail-card"><header class="detail-heading"><span class="detail-rank">#${escapeHtml(level.position ?? '')}</span><h1>${escapeHtml(level.name || '')}</h1><p class="detail-creators">${escapeHtml(detail.createdBy || 'Создатели')}: ${escapeHtml(creators.join(', ') || labels.unknownCreator || '')}</p><p class="detail-verifier">✓ ${escapeHtml(detail.verifiedBy || 'Верифицирован')}: ${escapeHtml(level.verifier || 'Не указан')}</p></header>${level.description ? `<p class="detail-description">${escapeHtml(level.description)}</p>` : ''}${showcase}<section class="detail-facts">${fields.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</section><section class="victors-section"><div class="victors-heading"><div><p class="eyebrow">${escapeHtml(detail.hallOfFame || '')}</p><h2>${escapeHtml(detail.victorsTitle || '')}</h2></div><span>${victors.length} ${escapeHtml(detail.victorsCountLabel || '')}</span></div>${victors.length ? `<div class="victor-list">${victors.map((victor, index) => `<article class="victor-row"><span class="victor-rank">${String(index + 1).padStart(2, '0')}</span><strong><a href="${asset(`player.html?id=${encodeURIComponent(victor.playerId)}`)}" aria-label="${escapeHtml(detail.victorProfileLabel || '')}">${escapeHtml(victor.player?.nickname || labels.victorFallbackName || '')}</a></strong><time>${escapeHtml(victor.date || '')}</time>${victor.video ? `<a href="${escapeHtml(victor.video)}" target="_blank" rel="noopener noreferrer">${escapeHtml(detail.videoLink || '')} ↗</a>` : `<span class="muted">${escapeHtml(detail.missingVideo || '')}</span>`}</article>`).join('')}</div>` : `<div class="empty-victors">${escapeHtml(detail.noVictorsMessage || '')}</div>`}</section></section>`;
    root.querySelectorAll('img[data-showcase]').forEach(img => img.addEventListener('error', () => {
      if (img.dataset.fallbackTried !== 'true' && youtubeId(img.dataset.showcase)) { img.dataset.fallbackTried = 'true'; img.src = `https://img.youtube.com/vi/${encodeURIComponent(youtubeId(img.dataset.showcase))}/hqdefault.jpg`; }
      else { img.removeAttribute('src'); img.parentElement.classList.add('image-placeholder'); }
    }, { once: true }));
  };
  initialize();
})();
