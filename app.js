const data = window.BCP_DATA;
const state = { query: '', team: '', faction: '', perspectivePlayerId: '', expanded: new Set() };
const listsById = new Map(data.lists.map((list) => [list.listId, list]));
const ratingsByPlayerId = new Map(data.ratings.players.filter((player) => player.matched).map((player) => [player.playerId, player]));
const teamRatings = new Map(data.ratings.teams.map((team) => [team.team, team]));
const matchupsByPlayerId = new Map(data.matchupAnalysis.entries.map((matchup) => [matchup.playerId, matchup]));
const players = data.roster.map((player) => {
  const list = player.listId ? listsById.get(player.listId) : null;
  const rating = ratingsByPlayerId.get(player.playerId) || null;
  return list ? { ...player, ...list, playerId: player.playerId, hasPublishedList: true, rating } : { ...player, pagePlayer: player.player.trim(), content: '', hasPublishedList: false, rating };
});
const forceDispositions = ['Take and Hold', 'Disruption', 'Purge the Foe', 'Reconnaissance', 'Priority Assets'];
const kaashif = players.find((player) => player.pagePlayer === 'Kaashif Hymabaccus');
const ownTeam = players.filter((player) => player.team.trim() === kaashif.team.trim());
state.perspectivePlayerId = kaashif.playerId;

function forceDisposition(player) {
  return forceDispositions.find((disposition) => player.faction.endsWith(` - ${disposition}`));
}

function populateLayouts(fragment, player, perspective) {
  const disposition = forceDisposition(player);
  const perspectiveDisposition = forceDisposition(perspective);
  const objectiveMatchup = data.layoutReference.objectiveMatchups
    .find((matchup) => matchup.playerDisposition === perspectiveDisposition && matchup.opponentDisposition === disposition);
  const objectiveStrip = fragment.querySelector('.objective-strip');
  const strip = fragment.querySelector('.layout-strip');
  const layouts = data.layoutReference.layouts
    .filter((layout) => {
      if (perspectiveDisposition === disposition) return layout.attackerDisposition === disposition && layout.defenderDisposition === disposition;
      return [layout.attackerDisposition, layout.defenderDisposition].includes(perspectiveDisposition)
        && [layout.attackerDisposition, layout.defenderDisposition].includes(disposition);
    })
    .sort((a, b) => a.variant.localeCompare(b.variant));
  if (layouts.length !== 3 || !objectiveMatchup) {
    objectiveStrip.remove();
    strip.remove();
    return;
  }
  const cards = fragment.querySelector('.objective-strip__cards');
  [
    { owner: perspective.pagePlayer, card: objectiveMatchup.player },
    { owner: player.pagePlayer, card: objectiveMatchup.opponent },
  ].forEach(({ owner, card }) => {
    const figure = document.createElement('figure');
    figure.className = 'objective-card';
    const caption = document.createElement('figcaption');
    const playerName = document.createElement('strong');
    playerName.textContent = owner;
    const missionName = document.createElement('span');
    missionName.textContent = `${card.disposition} — ${card.mission}`;
    caption.append(playerName, missionName);
    const image = document.createElement('img');
    image.src = card.asset;
    image.alt = `${owner}: ${card.mission} primary objective card`;
    image.loading = 'lazy';
    image.width = 1653;
    image.height = 2833;
    figure.append(caption, image);
    cards.append(figure);
  });
  fragment.querySelector('.layout-strip__heading').textContent = `${perspectiveDisposition} vs ${disposition}`;
  const maps = fragment.querySelector('.layout-strip__maps');
  layouts.forEach((layout) => {
    const useSuggestion = perspective.playerId === kaashif.playerId && layout.suggestedDeployment;
    const link = document.createElement('a');
    link.className = 'layout-thumbnail';
    link.href = useSuggestion ? layout.plannerUrl : layout.basePlannerUrl;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.setAttribute('aria-label', `Open ${layout.id} in the deployment planner`);
    const label = document.createElement('strong');
    label.textContent = `Layout ${layout.variant}${useSuggestion ? ' · suggested deployment' : ''}`;
    const image = document.createElement('img');
    image.src = useSuggestion ? layout.asset : layout.baseAsset;
    image.alt = `${layout.variant}: ${perspectiveDisposition} vs ${disposition}`;
    image.loading = 'lazy';
    image.width = 522;
    image.height = 708;
    link.append(label, image);
    maps.append(link);
  });
}

const elements = {
  grid: document.querySelector('#list-grid'),
  template: document.querySelector('#list-template'),
  perspective: document.querySelector('#perspective-player'),
  perspectiveMeta: document.querySelector('#perspective-meta'),
  search: document.querySelector('#search'),
  team: document.querySelector('#team-filter'),
  faction: document.querySelector('#faction-filter'),
  clear: document.querySelector('#clear-filters'),
  count: document.querySelector('#result-count'),
  heroCount: document.querySelector('#hero-count'),
  expandAll: document.querySelector('#expand-all'),
  empty: document.querySelector('#empty-state'),
};

const unique = (key) => [...new Set(players.map((player) => player[key].trim()))].sort((a, b) => a.localeCompare(b));

function addOptions(select, values) {
  values.forEach((value) => select.add(new Option(value, value)));
}

function searchableText(player) {
  return [player.pagePlayer, player.team, player.faction, player.content].join('\n').toLocaleLowerCase();
}

function filteredPlayers() {
  const query = state.query.trim().toLocaleLowerCase();
  return players.filter((player) =>
    (!state.team || player.team.trim() === state.team) &&
    (!state.faction || player.faction.trim() === state.faction) &&
    (!query || searchableText(player).includes(query)),
  );
}

function setExpanded(card, open) {
  const id = card.dataset.id;
  const summary = card.querySelector('.list-card__summary');
  const body = card.querySelector('.list-card__body');
  summary.setAttribute('aria-expanded', String(open));
  body.hidden = !open;
  open ? state.expanded.add(id) : state.expanded.delete(id);
}

function render() {
  const visiblePlayers = filteredPlayers();
  const perspective = players.find((player) => player.playerId === state.perspectivePlayerId) || kaashif;
  elements.grid.replaceChildren();
  elements.count.textContent = visiblePlayers.length;
  elements.empty.hidden = visiblePlayers.length !== 0;

  const teams = new Map();
  visiblePlayers.forEach((player) => {
    const team = player.team.trim();
    if (!teams.has(team)) teams.set(team, []);
    teams.get(team).push(player);
  });

  let playerNumber = 0;
  teams.forEach((teamPlayers, teamName) => {
    const group = document.createElement('section');
    group.className = 'team-group';
    const heading = document.createElement('h2');
    heading.textContent = teamName;
    const total = document.createElement('span');
    const published = teamPlayers.filter((player) => player.hasPublishedList).length;
    const teamRating = teamRatings.get(teamName);
    const average = teamRating?.averageRating ?? '—';
    const averageRank = teamRating?.averageRank ? `#${teamRating.averageRank.toLocaleString()} / ${data.ratings.rankedPlayerCount.toLocaleString()}` : '—';
    total.append(
      `${teamPlayers.length} players · ${published} ${published === 1 ? 'list' : 'lists'}`,
      document.createElement('br'),
      `Glicko avg ${average} · ${teamRating?.ratedPlayers || 0}/4 rated · ${teamRating?.averageEleventhEditionGames ?? '—'} avg games`,
      document.createElement('br'),
      `Avg rank ${averageRank}`,
    );
    heading.append(total);
    const cards = document.createElement('div');
    cards.className = 'team-lists';
    group.append(heading, cards);

    teamPlayers.forEach((list) => {
      const fragment = elements.template.content.cloneNode(true);
      const card = fragment.querySelector('.list-card');
      card.dataset.id = list.listId || list.playerId;
      fragment.querySelector('.list-card__number').textContent = String(++playerNumber);
      fragment.querySelector('.list-card__player').textContent = list.pagePlayer;
      fragment.querySelector('.list-card__faction').textContent = list.hasPublishedList ? list.faction : `${list.faction} · No list submitted`;
      const ratingLink = fragment.querySelector('.player-rating');
      const games = fragment.querySelector('.player-games');
      const rank = fragment.querySelector('.player-rank');
      const matchupLink = fragment.querySelector('.matchup-rating');
      const matchup = matchupsByPlayerId.get(list.playerId);
      if (matchup) {
        matchupLink.href = matchup.pageUrl;
        matchupLink.textContent = matchup.stars;
        matchupLink.title = `Kaashif matchup read: ${matchup.rating}/5 (${matchup.confidence.toLowerCase()} confidence)`;
        matchupLink.setAttribute('aria-label', `Kaashif matchup read: ${matchup.rating} out of 5 stars`);
      } else {
        matchupLink.textContent = 'My team';
        matchupLink.classList.add('matchup-rating--team');
        matchupLink.removeAttribute('href');
      }
      if (list.rating) {
        ratingLink.href = list.rating.profileUrl;
        ratingLink.textContent = `Glicko ${list.rating.rating}`;
        games.textContent = `${list.rating.eleventhEditionGames} games`;
        rank.textContent = `#${list.rating.rank.toLocaleString()} / ${list.rating.rankedPlayerCount.toLocaleString()}`;
        ratingLink.title = `Tabletop Tools Glicko-2: ${list.rating.rating} ±${list.rating.displayBand} from ${list.rating.eleventhEditionGames} 11th-edition games`;
      } else {
        ratingLink.removeAttribute('target');
        ratingLink.removeAttribute('rel');
        ratingLink.textContent = 'Unrated';
        ratingLink.classList.add('player-rating--unrated');
        games.textContent = '—';
        rank.textContent = '—';
      }
      if (!list.hasPublishedList) {
        card.classList.add('list-card--missing');
        fragment.querySelector('.objective-strip').remove();
        fragment.querySelector('.layout-strip').remove();
        const summary = fragment.querySelector('.list-card__summary');
        summary.removeAttribute('role');
        summary.removeAttribute('tabindex');
        summary.setAttribute('aria-disabled', 'true');
        fragment.querySelector('.list-card__toggle').hidden = true;
        cards.append(fragment);
        return;
      }
      fragment.querySelector('.list-card__content').innerHTML = list.linkedContent;
      fragment.querySelector('.source-link').href = list.sourceUrl;
      fragment.querySelector('.page-link').href = list.pageUrl;
      populateLayouts(fragment, list, perspective);

      const summary = fragment.querySelector('.list-card__summary');
      summary.addEventListener('click', (event) => {
        if (!event.target.closest('a')) setExpanded(card, summary.getAttribute('aria-expanded') !== 'true');
      });
      summary.addEventListener('keydown', (event) => {
        if (event.target.closest('a') || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        setExpanded(card, summary.getAttribute('aria-expanded') !== 'true');
      });
      fragment.querySelector('.copy-list').addEventListener('click', async (event) => {
        await navigator.clipboard.writeText(list.content);
        event.currentTarget.textContent = 'Copied';
        setTimeout(() => { event.currentTarget.textContent = 'Copy list'; }, 1500);
      });

      cards.append(fragment);
      if (state.expanded.has(list.listId)) setExpanded(cards.lastElementChild, true);
    });
    elements.grid.append(group);
  });

  const publishedLists = visiblePlayers.filter((player) => player.hasPublishedList);
  const allOpen = publishedLists.length > 0 && publishedLists.every((list) => state.expanded.has(list.listId));
  elements.expandAll.textContent = allOpen ? 'Collapse all' : 'Expand all';
}

function clearFilters() {
  state.query = '';
  state.team = '';
  state.faction = '';
  elements.search.value = '';
  elements.team.value = '';
  elements.faction.value = '';
  render();
}

addOptions(elements.team, unique('team'));
addOptions(elements.faction, unique('faction'));
ownTeam.forEach((player) => elements.perspective.add(new Option(player.pagePlayer, player.playerId)));
elements.perspective.value = state.perspectivePlayerId;
elements.perspectiveMeta.textContent = `South London Squad · ${forceDisposition(kaashif)}`;
elements.heroCount.textContent = data.count;
document.querySelector('#event-link').href = data.eventUrl;
document.querySelector('#footer-event-link').href = data.eventUrl;
document.querySelector('#ranked-player-count').textContent = data.ratings.rankedPlayerCount.toLocaleString();

elements.search.addEventListener('input', (event) => { state.query = event.target.value; render(); });
elements.team.addEventListener('change', (event) => { state.team = event.target.value; render(); });
elements.faction.addEventListener('change', (event) => { state.faction = event.target.value; render(); });
elements.perspective.addEventListener('change', (event) => {
  state.perspectivePlayerId = event.target.value;
  const perspective = players.find((player) => player.playerId === state.perspectivePlayerId) || kaashif;
  elements.perspectiveMeta.textContent = `South London Squad · ${forceDisposition(perspective)}`;
  render();
});
elements.clear.addEventListener('click', clearFilters);
elements.empty.querySelector('button').addEventListener('click', clearFilters);
elements.expandAll.addEventListener('click', () => {
  const lists = filteredPlayers().filter((player) => player.hasPublishedList);
  const allOpen = lists.length > 0 && lists.every((list) => state.expanded.has(list.listId));
  lists.forEach((list) => allOpen ? state.expanded.delete(list.listId) : state.expanded.add(list.listId));
  render();
});
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement !== elements.search) {
    event.preventDefault();
    elements.search.focus();
  }
  if (event.key === 'Escape' && document.activeElement === elements.search) {
    elements.search.value = '';
    state.query = '';
    elements.search.blur();
    render();
  }
});

render();
