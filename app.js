const data = window.BCP_DATA;
const state = { query: '', team: '', faction: '', expanded: new Set() };

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

const unique = (key) => [...new Set(data.lists.map((list) => list[key]))].sort((a, b) => a.localeCompare(b));

function addOptions(select, values) {
  values.forEach((value) => select.add(new Option(value, value)));
}

function searchableText(list) {
  return [list.pagePlayer, list.team, list.faction, list.content].join('\n').toLocaleLowerCase();
}

function filteredLists() {
  const query = state.query.trim().toLocaleLowerCase();
  return data.lists.filter((list) =>
    (!state.team || list.team === state.team) &&
    (!state.faction || list.faction === state.faction) &&
    (!query || searchableText(list).includes(query)),
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
  const lists = filteredLists();
  elements.grid.replaceChildren();
  elements.count.textContent = lists.length;
  elements.empty.hidden = lists.length !== 0;

  const teams = new Map();
  lists.forEach((list) => {
    if (!teams.has(list.team)) teams.set(list.team, []);
    teams.get(list.team).push(list);
  });

  let listNumber = 0;
  teams.forEach((teamLists, teamName) => {
    const group = document.createElement('section');
    group.className = 'team-group';
    const heading = document.createElement('h2');
    heading.textContent = teamName;
    const total = document.createElement('span');
    total.textContent = `${teamLists.length} ${teamLists.length === 1 ? 'list' : 'lists'}`;
    heading.append(total);
    const cards = document.createElement('div');
    cards.className = 'team-lists';
    group.append(heading, cards);

    teamLists.forEach((list) => {
      const fragment = elements.template.content.cloneNode(true);
      const card = fragment.querySelector('.list-card');
      card.dataset.id = list.listId;
      fragment.querySelector('.list-card__number').textContent = String(++listNumber);
      fragment.querySelector('.list-card__player').textContent = list.pagePlayer;
      fragment.querySelector('.list-card__faction').textContent = list.faction;
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

  const allOpen = lists.length > 0 && lists.every((list) => state.expanded.has(list.listId));
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
  const lists = filteredLists();
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
