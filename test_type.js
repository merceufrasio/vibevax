fetch('https://hhpanda.st/thai-at-tien-ma-luc-chi-linh-phi-ky')
  .then(r => r.text())
  .then(html => {
    const m = html.match(/data-type="([^"]*)"/);
    console.log(m ? m[1] : 'not found');
  });
