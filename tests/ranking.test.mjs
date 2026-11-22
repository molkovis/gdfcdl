import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPlayerRanking, findPlayerProfile, pointsForPosition, sortPlayerRanking } from '../ranking.js';

const settings = JSON.parse(readFileSync(new URL('../data/config.json', import.meta.url), 'utf8')).ranking;
const rank = input => buildPlayerRanking({ ...input, settings });
const score = position => pointsForPosition(position, settings);
const player = (id, nickname = id) => ({ id, nickname });
const pass = (playerId, date = '2026-01-15', extra = {}) => ({ playerId, percent: 100, date, video: '', ...extra });
const level = (id, position, victors = [], extra = {}) => ({ id, levelId: `gd-${id}`, name: `Level ${id}`, category: position <= 75 ? 'main' : 'extended', position, victors, ...extra });

test('exponential score formula matches top 1, top 2, and top 150', () => {
  assert.equal(score(1), 1000);
  assert.equal(score(2), 960);
  assert.equal(score(150), 42);
  assert.equal(score(0), 0);
  assert.equal(score(151), 0);
});

test('only first full completion per playerId and levelId is counted', () => {
  const ranking = rank({
    players: [player('p1')],
    levels: [level('a', 1, [
      pass('p1', '2026-02-10', { video: 'https://example.com/later' }),
      pass('p1', '2026-01-10', { video: 'https://example.com/first' }),
      pass('p1', '2026-01-05', { percent: 98 }),
      pass('unknown', '2026-01-01')
    ])]
  });
  assert.equal(ranking.players.length, 1);
  assert.equal(ranking.players[0].completionCount, 1);
  assert.equal(ranking.players[0].wins[0].date, '2026-01-10');
  assert.equal(ranking.players[0].wins[0].video, 'https://example.com/first');
});

test('score is recalculated from current position while pass metadata is preserved', () => {
  const victor = pass('p1', '2026-01-15', { video: 'https://example.com/run' });
  const players = [player('p1')];
  const first = rank({ players, levels: [level('a', 1, [victor])] }).players[0].wins[0];
  const moved = rank({ players, levels: [level('a', 2, [victor])] }).players[0].wins[0];
  assert.equal(first.points, 1000);
  assert.equal(moved.points, 960);
  assert.equal(moved.date, first.date);
  assert.equal(moved.video, first.video);
});

test('deleted levels and positions outside top 150 contribute no points', () => {
  const players = [player('p1')];
  const outOfRange = rank({ players, levels: [level('a', 151, [pass('p1')])] });
  const deleted = rank({ players, levels: [] });
  assert.deepEqual(outOfRange.players, []);
  assert.equal(outOfRange.completions[0].points, 0);
  assert.deepEqual(deleted.players, []);
});

test('position 75 to 76 is still eligible and uses the live position score', () => {
  const players = [player('p1')], victor = pass('p1');
  const main = rank({ players, levels: [level('a', 75, [victor])] }).players[0].wins[0];
  const extended = rank({ players, levels: [level('a', 76, [victor])] }).players[0].wins[0];
  assert.equal(main.category, 'main');
  assert.equal(extended.category, 'extended');
  assert.ok(main.points > extended.points);
  assert.equal(extended.points, score(76));
});

test('multiple unique completions are summed and hardest level is retained', () => {
  const ranking = rank({
    players: [player('p1')],
    levels: [level('a', 3, [pass('p1')]), level('b', 10, [pass('p1', '2026-02-10')])]
  });
  const summary = findPlayerProfile(ranking, 'p1');
  assert.equal(summary.completionCount, 2);
  assert.equal(summary.points, score(3) + score(10));
  assert.equal(summary.wins[0].levelSlug, 'a');
});

test('unknown players and malformed completion records are ignored', () => {
  const ranking = rank({
    players: [player('p1')],
    levels: [
      level('a', 1, [pass('missing'), pass('p1', 'not-a-date'), pass('p1', '2026-01-01', { video: 'javascript:alert(1)' })]),
      { ...level('b', 2, [pass('p1')]), levelId: '' }
    ]
  });
  assert.deepEqual(ranking.players, []);
});

test('ranking ties use completion count, hardest position, then stable playerId', () => {
  const ranking = rank({
    players: [player('zeta'), player('alpha'), player('beta')],
    levels: [
      level('edge-a', 149, [pass('zeta'), pass('alpha'), pass('beta')]),
      level('edge-b', 150, [pass('beta')])
    ]
  });
  assert.deepEqual(ranking.players.map(item => item.playerId), ['beta', 'alpha', 'zeta']);
  assert.equal(ranking.players[0].completionCount, 2);
});

test('profile lookup, player search, and alternate sorting use calculated summaries', () => {
  const ranking = rank({
    players: [player('p1', 'Alpha'), player('p2', 'Bravo')],
    levels: [
      level('a', 1, [pass('p1'), pass('p2')]),
      level('b', 2, [pass('p2', '2026-02-01')])
    ]
  });
  assert.equal(findPlayerProfile(ranking, 'p2').completionCount, 2);
  assert.equal(sortPlayerRanking(ranking.players, { query: 'brav' })[0].playerId, 'p2');
  assert.deepEqual(sortPlayerRanking(ranking.players, { sort: 'completions' }).map(item => item.playerId), ['p2', 'p1']);
});
