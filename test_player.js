fetch('https://hhpanda.st/player/player.php?action=dox_ajax_player&post_id=1280&chapter_st=tap-90&sv=1')
  .then(r => r.text())
  .then(html => {
    console.log(html);
  });
