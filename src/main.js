// Category filter for the projects timeline: one category at a time, or All. Clicking the active
// category again goes back to All. Without JavaScript every project is shown and the filter stays
// hidden.
(() => {
  const filters = document.querySelector('.lanes');
  if (!filters) return;
  const buttons = [...filters.querySelectorAll('.lane-btn')];
  const rows = [...document.querySelectorAll('.timeline > .row')];
  let current = 'all';

  // Show each year label only on the first visible project of that year.
  function update() {
    let previousYear = null;
    for (const row of rows) {
      row.hidden = current !== 'all' && row.dataset.category !== current;
      if (row.hidden) continue;
      row.querySelector('.year').textContent = row.dataset.year === previousYear ? '' : row.dataset.year;
      previousYear = row.dataset.year;
    }
  }

  filters.addEventListener('click', (event) => {
    const button = event.target.closest('.lane-btn');
    if (!button) return;
    current = button.dataset.category === current ? 'all' : button.dataset.category;
    for (const other of buttons) other.setAttribute('aria-pressed', String(other.dataset.category === current));
    update();
  });

  filters.hidden = false;
  document.querySelector('.lanes-hint').hidden = false;
  update();
})();
