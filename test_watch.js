fetch('https://hhpanda.st/watch-thai-at-tien-ma-luc-chi-linh-phi-ky/tap-90-sv1.html', {
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  }
})
  .then(r => r.text())
  .then(html => {
    const matches = html.match(/<[^>]+data-type="([^"]+)"[^>]*>/gi);
    console.log('Watch page data-type:', matches ? matches.join('\n') : 'not found');
  });
