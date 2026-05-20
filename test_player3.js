fetch('https://hhpanda.st/player/player.php?action=dox_ajax_player&post_id=1280&chapter_st=tap-90&type=pro&sv=1', {
  headers: {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://hhpanda.st/watch-thai-at-tien-ma-luc-chi-linh-phi-ky/tap-90-sv1.html",
    "X-Requested-With": "XMLHttpRequest"
  }
})
  .then(r => r.text())
  .then(html => console.log('type pro:', html));
