(function () {
  if (window.top !== window.self) {
    try { window.top.location.replace(location.href); }
    catch (_) { document.documentElement.innerHTML = ''; }
    return;
  }

  var h     = (location.hostname || '').toLowerCase();
  var proto = location.protocol || '';

  var ALLOWED = [
    'espacopreludio.com',
    'www.espacopreludio.com',
    'espacopreludio.com.br',
    'www.espacopreludio.com.br',
    'localhost',
    '127.0.0.1'
  ];

  var blocked = (proto === 'file:') || (h && ALLOWED.indexOf(h) === -1);

  if (blocked) {
    document.documentElement.innerHTML =
      '<style>*{margin:0;padding:0}html,body{background:#0d1117;height:100%;display:flex;' +
      'align-items:center;justify-content:center}p{color:#ccc;font:15px/1.7 sans-serif;' +
      'text-align:center;max-width:320px}a{color:#5b8af5;text-decoration:none}</style>' +
      '<p>Este conteúdo só está disponível no site oficial.<br>' +
      '<a href="https://espacopreludio.com.br">espacopreludio.com.br</a></p>';
    setTimeout(function () {
      location.replace('https://espacopreludio.com.br');
    }, 2500);
  }
})();
