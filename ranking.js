const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const validOptionalVideo = value => {
  if (value == null || value === '') return true;
  if (typeof value !== 'string') return false;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); }
  catch { return false; }
};

export function pointsForPosition(position, options = {}) {
  const settings = options;
  if (!Number.isFinite(settings.minPoints) || !Number.isFinite(settings.maxPoints) || !Number.isFinite(settings.decayFactor) || !Number.isInteger(settings.maxPosition)) return 0;
  if (!Number.isInteger(position) || position < 1 || position > settings.maxPosition) return 0;
  return Math.round(settings.minPoints + (settings.maxPoints - settings.minPoints) * settings.decayFactor ** (position - 1));
}

export function buildPlayerRanking({ levels = [], players = [], settings = {} } = {}) {
  const rules = settings;
  if (rules.enabled === false || !Number.isInteger(rules.maxPosition) || !Number.isInteger(rules.mainMaxPosition) || !Array.isArray(levels)) return { players: [], wins: [], completions: [] };
  const playerRecords = Array.isArray(players) ? players : Array.isArray(players?.players) ? players.players : [];
  const registered = new Map();
  for (const player of playerRecords) {
    if (!player || typeof player.id !== 'string' || !player.id.trim() || typeof player.nickname !== 'string' || !player.nickname.trim()) continue;
    if (!registered.has(player.id)) registered.set(player.id, player);
  }

  const candidates = [];
  for (const level of levels) {
    if (!level || !Number.isInteger(level.position) || level.position < 1) continue;
    if (typeof level.levelId !== 'string' || !level.levelId.trim() || !Array.isArray(level.victors)) continue;
    for (let index = 0; index < level.victors.length; index += 1) {
      const record = level.victors[index];
      if (!record || typeof record.playerId !== 'string' || !registered.has(record.playerId)) continue;
      if (record.percent !== 100) continue;
      if (!validDate(record.date) || !validOptionalVideo(record.video)) continue;
      candidates.push({
        playerId: record.playerId,
        levelId: level.levelId,
        levelSlug: level.id,
        levelName: typeof level.name === 'string' ? level.name : '',
        position: level.position,
        category: level.position <= rules.mainMaxPosition ? 'main' : level.position <= rules.maxPosition ? 'extended' : level.category || 'extended',
        date: record.date,
        video: record.video || '',
        sourceIndex: index
      });
    }
  }

  candidates.sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position || a.sourceIndex - b.sourceIndex);
  const uniqueWins = new Map();
  for (const win of candidates) {
    const key = `${win.playerId}\u0000${win.levelId}`;
    if (!uniqueWins.has(key)) uniqueWins.set(key, { ...win, player: registered.get(win.playerId), points: pointsForPosition(win.position, rules) });
  }

  const completions = [...uniqueWins.values()];
  const rankedWins = completions.filter(win => win.position <= rules.maxPosition);
  const summaries = new Map();
  for (const win of rankedWins) {
    let summary = summaries.get(win.playerId);
    if (!summary) {
      summary = { playerId: win.playerId, player: registered.get(win.playerId), points: 0, completionCount: 0, hardestPosition: Infinity, wins: [] };
      summaries.set(win.playerId, summary);
    }
    summary.points += win.points;
    summary.completionCount += 1;
    summary.hardestPosition = Math.min(summary.hardestPosition, win.position);
    summary.wins.push(win);
  }

  const rankedPlayers = [...summaries.values()];
  for (const summary of rankedPlayers) summary.wins.sort((a, b) => a.position - b.position || a.levelName.localeCompare(b.levelName));
  rankedPlayers.sort((a, b) => b.points - a.points || b.completionCount - a.completionCount || a.hardestPosition - b.hardestPosition || a.playerId.localeCompare(b.playerId));
  rankedPlayers.forEach((summary, index) => { summary.rank = index + 1; });

  return { players: rankedPlayers, wins: rankedWins, completions };
}

export function findPlayerProfile(ranking, playerId) {
  return ranking.players.find(summary => summary.playerId === playerId) || null;
}

export function sortPlayerRanking(players, { query = '', sort = 'points' } = {}) {
  const needle = String(query).trim().toLocaleLowerCase();
  const results = players.filter(summary => `${summary.player.nickname} ${summary.player.id} ${summary.player.country || ''}`.toLocaleLowerCase().includes(needle));
  if (sort === 'completions') return results.sort((a, b) => b.completionCount - a.completionCount || b.points - a.points || a.hardestPosition - b.hardestPosition || a.playerId.localeCompare(b.playerId));
  if (sort === 'hardest') return results.sort((a, b) => a.hardestPosition - b.hardestPosition || b.points - a.points || b.completionCount - a.completionCount || a.playerId.localeCompare(b.playerId));
  return results.sort((a, b) => a.rank - b.rank);
}
