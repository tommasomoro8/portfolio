// Category filter for the projects timeline: one category at a time, or All. Clicking the active
// category again goes back to All. Every click closes the open projects. Without JavaScript every
// project is shown and the CSS keeps the filter hidden.
(() => {
  const filters = document.querySelector('.lanes');
  if (!filters) return;
  const buttons = [...filters.querySelectorAll('.lane-btn')];
  const timeline = document.querySelector('.timeline');
  const rows = [...timeline.children];
  let current = 'all';

  // Show each year label only on the first visible project of that year, and tell each row the
  // category of the next visible one, whose colour its line blends into.
  function update() {
    let previous = null;
    for (const row of rows) {
      row.hidden = current !== 'all' && row.dataset.category !== current;
      if (row.hidden) continue;
      row.querySelector('.year').textContent = row.dataset.year === previous?.dataset.year ? '' : row.dataset.year;
      if (previous) previous.dataset.next = row.dataset.category;
      delete row.dataset.next;
      previous = row;
    }
  }

  filters.addEventListener('click', (event) => {
    const button = event.target.closest('.lane-btn');
    if (!button) return;
    current = button.dataset.category === current ? 'all' : button.dataset.category;
    for (const other of buttons) other.setAttribute('aria-pressed', String(other.dataset.category === current));
    for (const card of timeline.querySelectorAll('.card[open]')) card.open = false;
    update();
  });

  update();

  // A compact copy of each project's head, which stays at the top of the window while the open
  // project scrolls by (see the CSS), so it can be closed at any point: the page then goes back to
  // where the project starts. It is an extra for the pointer; the head itself still opens and closes.
  for (const row of rows) {
    const card = row.querySelector('.card');
    const bar = document.createElement('button');
    bar.type = 'button';
    bar.className = 'card-bar';
    bar.tabIndex = -1;
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = `${card.querySelector('.meta').outerHTML}<span class="bar-close">Close</span><b>${card.querySelector('h2').innerHTML}</b>`;
    bar.addEventListener('click', () => {
      card.open = false;
      row.scrollIntoView();
    });
    card.querySelector('.card-head').after(bar);
  }

  // Scroll animation: the line is drawn down to a point just below the middle of the window, easing
  // towards it, and each node lights up when the line reaches it. Without it the line is fully drawn.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  timeline.classList.add('anim');
  let head = 0; // how far the line is drawn, in px from the top of the timeline
  let last = 0;
  let frame = 0;

  function draw(now) {
    frame = 0;
    const top = timeline.getBoundingClientRect().top;
    const target = innerHeight * 0.6 - top;
    head += (target - head) * (1 - Math.exp(-Math.min(now - last, 50) / 90));
    if (Math.abs(target - head) < 0.5) head = target;
    last = now;
    const visible = rows.filter((row) => !row.hidden);
    const nodes = visible.map((row) => {
      const rect = row.querySelector('.node').getBoundingClientRect();
      return rect.top + rect.height / 2 - top;
    });
    visible.forEach((row, index) => {
      row.style.setProperty('--drawn', `${Math.max(0, head - nodes[index]).toFixed(1)}px`);
      row.classList.toggle('reached', head >= nodes[index]);
    });
    if (head !== target) frame = requestAnimationFrame(draw);
  }

  const redraw = () => { frame ||= requestAnimationFrame(draw); };
  addEventListener('scroll', redraw, { passive: true });
  addEventListener('resize', redraw);
  // Opening a project, loading its images or filtering moves the nodes.
  new ResizeObserver(redraw).observe(timeline);
})();

// Lightbox: the cover and the screenshots of a project open in a full-screen carousel instead of a
// new tab. The track scrolls sideways with scroll snapping, so swiping works by itself; the buttons
// and the arrow keys scroll it, Esc or a click beside the image closes it. Without JavaScript, and
// with a modifier key, the images stay plain links.
(() => {
  const icon = (path) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="${path}"/></svg>`;
  const dialog = document.createElement('dialog');
  if (!dialog.showModal) return;
  dialog.className = 'lightbox';
  dialog.setAttribute('aria-label', 'Project images');
  dialog.innerHTML = `
    <button type="button" class="lb-close" aria-label="Close">${icon('M6 6l12 12M18 6L6 18')}</button>
    <span class="lb-count" aria-live="polite"></span>
    <button type="button" class="lb-prev" aria-label="Previous image">${icon('M15 5l-7 7 7 7')}</button>
    <div class="lb-track"></div>
    <button type="button" class="lb-next" aria-label="Next image">${icon('M9 5l7 7-7 7')}</button>`;
  const [close, count, prev, track, next] = dialog.children;
  document.body.append(dialog);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let total = 0; // images of the open project
  let edge = 0; // copies at each end of the track: 1, or 0 for a single image
  let index = 0;
  let moving = false; // scrolling to `index` after a button or a key, rather than following a swipe
  let touching = false;
  let resting = 0;

  const width = () => track.firstChild.getBoundingClientRect().width;

  function show(i) {
    index = i;
    [...track.children].forEach((slide, n) => slide.setAttribute('aria-hidden', String(n !== i + edge)));
    count.textContent = `${i + 1} / ${total}`;
  }

  // The carousel goes round. A copy of the last image sits before the first one and a copy of the
  // first after the last, so the track slides on to the copy like to any other image; once it rests
  // there it moves by a whole lap to the image itself, which shows the same picture.
  function rewind() {
    const at = Math.round(track.scrollLeft / width());
    if (touching || !edge || (at > 0 && at <= total)) return;
    track.scrollLeft += (at ? -total : total) * width();
  }
  const rest = () => {
    clearTimeout(resting);
    resting = setTimeout(rewind, 100);
  };

  function go(step) {
    if (total < 2) return;
    // Start beside image `index`: a track still on a copy, or left behind by quick presses, is put
    // on the image itself first.
    const from = index + edge;
    if (Math.abs(track.scrollLeft / width() - from) > 1.25) track.scrollLeft = from * width();
    moving = true;
    show((index + step + total) % total);
    track.scrollTo({ left: (from + step) * width(), behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('.cover-link, .shot');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const links = [...link.closest('.detail').querySelectorAll('.cover-link, .shot')];
    const slides = links.map((item) => {
      // Each slide carries its own caption, the alt text, so the images do not jump when it changes.
      const slide = document.createElement('figure');
      const caption = document.createElement('figcaption');
      const alt = item.querySelector('img').alt;
      slide.className = 'lb-slide';
      caption.textContent = alt;
      caption.ariaHidden = 'true';
      slide.append(Object.assign(new Image(), { src: item.href, alt }), caption);
      return slide;
    });
    total = slides.length;
    edge = total > 1 ? 1 : 0;
    if (edge) {
      slides.unshift(slides.at(-1).cloneNode(true));
      slides.push(slides[1].cloneNode(true));
    }
    track.replaceChildren(...slides);
    prev.hidden = next.hidden = count.hidden = !edge;
    dialog.showModal();
    moving = false;
    track.scrollLeft = (links.indexOf(link) + edge) * width();
    show(links.indexOf(link));
  });

  track.addEventListener('scroll', () => {
    const at = (Math.round(track.scrollLeft / width()) - edge + total) % total;
    if (at === index) moving = false;
    else if (!moving) show(at);
    rest();
  });
  // A swipe or the wheel takes over from a scroll started by a button.
  for (const type of ['pointerdown', 'wheel']) track.addEventListener(type, () => { moving = false; }, { passive: true });
  // The track is not moved under a finger: it waits for the end of the swipe.
  track.addEventListener('touchstart', () => { touching = true; }, { passive: true });
  for (const type of ['touchend', 'touchcancel']) track.addEventListener(type, () => { touching = false; rest(); });
  addEventListener('resize', () => { if (dialog.open) track.scrollLeft = (index + edge) * width(); });

  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.classList.contains('lb-slide')) dialog.close();
  });
  dialog.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    go(step);
  });
})();
