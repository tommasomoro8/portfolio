// Category filters for the projects timeline. Without JavaScript every project is shown
// and the filter buttons stay hidden.
(() => {
  const filters = document.querySelector('.filters');
  if (!filters) return;
  const buttons = [...filters.querySelectorAll('button[data-category]')];
  const projects = [...document.querySelectorAll('.timeline > .project')];
  const isPressed = (button) => button.getAttribute('aria-pressed') === 'true';

  // Show each year label only on the first visible project of that year.
  function update() {
    const active = new Set(buttons.filter(isPressed).map((button) => button.dataset.category));
    let previousYear = null;
    for (const project of projects) {
      project.hidden = !active.has(project.dataset.category);
      if (project.hidden) continue;
      project.querySelector('.year').classList.toggle('is-repeat', project.dataset.year === previousYear);
      previousYear = project.dataset.year;
    }
  }

  filters.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-category]');
    if (!button) return;
    // At least one category stays active.
    if (isPressed(button) && buttons.filter(isPressed).length === 1) return;
    button.setAttribute('aria-pressed', String(!isPressed(button)));
    update();
  });

  filters.hidden = false;
  update();
})();
