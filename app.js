const data = window.BCP_DATA;
const state = { query: '', team: '', faction: '', expanded: new Set() };
const listsById = new Map(data.lists.map((list) => [list.listId, list]));
const players = data.roster.map((player) => {
  const list = player.listId ? listsById.get(player.listId) : null;
  return list ? { ...player, ...list, playerId: player.playerId, hasPublishedList: true } : { ...player, pagePlayer: player.player.trim(), content: '', hasPublishedList: false };
});

const elements = {
  grid: document.querySelector('#list-grid'),
  template: document.querySelector('#list-template'),
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
    total.textContent = `${teamPlayers.length} players · ${published} ${published === 1 ? 'list' : 'lists'}`;
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
      if (!list.hasPublishedList) {
        card.classList.add('list-card--missing');
        const summary = fragment.querySelector('.list-card__summary');
        summary.disabled = true;
        fragment.querySelector('.list-card__toggle').hidden = true;
        cards.append(fragment);
        return;
      }
      fragment.querySelector('.list-card__content').innerHTML = list.linkedContent;
      fragment.querySelector('.source-link').href = list.sourceUrl;
      fragment.querySelector('.page-link').href = list.pageUrl;

      const summary = fragment.querySelector('.list-card__summary');
      summary.addEventListener('click', () => setExpanded(card, summary.getAttribute('aria-expanded') !== 'true'));
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
elements.heroCount.textContent = data.count;
document.querySelector('#event-link').href = data.eventUrl;
document.querySelector('#footer-event-link').href = data.eventUrl;

elements.search.addEventListener('input', (event) => { state.query = event.target.value; render(); });
elements.team.addEventListener('change', (event) => { state.team = event.target.value; render(); });
elements.faction.addEventListener('change', (event) => { state.faction = event.target.value; render(); });
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
