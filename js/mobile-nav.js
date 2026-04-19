/* BrickStocks — mobile-nav.js */
(function () {
  const burger = document.querySelector('.nav-burger');
  const links  = document.querySelector('.nav-links');
  if (!burger || !links) return;

  burger.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = burger.classList.toggle('open');
    links.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });

  document.addEventListener('click', (e) => {
    if (!links.contains(e.target) && !burger.contains(e.target)) {
      burger.classList.remove('open');
      links.classList.remove('open');
      document.body.style.overflow = '';
    }
  });

  links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    burger.classList.remove('open');
    links.classList.remove('open');
    document.body.style.overflow = '';
  }));
})();
