(function() {
  const pageMap = { 'index.html': 'home', 'about.html': 'about', 'contact.html': 'contact', 'events.html': 'events' };
  const pageName = pageMap[window.location.pathname.split('/').pop()];
  if (!pageName) return;

  fetch('/api/content/' + pageName)
    .then(r => r.json())
    .then(data => {
      document.querySelectorAll('[data-content]').forEach(el => {
        const key = el.dataset.content;
        if (data[key] !== undefined) el.innerHTML = data[key];
      });
      document.querySelectorAll('[data-content-href]').forEach(el => {
        const key = el.dataset.contentHref;
        if (data[key] !== undefined && el.tagName === 'A') el.href = data[key];
      });
    })
    .catch(() => {});
})();
