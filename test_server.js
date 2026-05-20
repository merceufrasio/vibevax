fetch('https://hhpanda.st/thai-at-tien-ma-luc-chi-linh-phi-ky', {
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  }
})
  .then(r => r.text())
  .then(html => {
    const matches = html.match(/<[^>]+data-type="([^"]+)"[^>]*>/gi);
    console.log(matches ? matches.join('\n') : 'not found');
  });
