fetch('https://hhpanda.st/player/player.php?action=dox_ajax_player&post_id=1280&chapter_st=tap-90&type=1&sv=1', {
  headers: {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://hhpanda.st/",
    "X-Requested-With": "XMLHttpRequest"
  }
})
  .then(r => r.text())
  .then(html => console.log('type 1:', html));
  
fetch('https://hhpanda.st/player/player.php?action=dox_ajax_player&post_id=1280&chapter_st=tap-90&sv=1', {
  headers: {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://hhpanda.st/",
    "X-Requested-With": "XMLHttpRequest"
  }
})
  .then(r => r.text())
  .then(html => console.log('type empty:', html));
