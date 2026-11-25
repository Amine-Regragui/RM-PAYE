/* RM Paie — mesure d'audience hébergée sur nos serveurs au Maroc.
   Sans cookie, sans adresse IP, sans identifiant : seul un compteur de pages vues par jour est incrémenté.
   Une « visite » est la première page d'une session de navigation (indicateur gardé dans sessionStorage, effacé à la fermeture). */
(function () {
  try {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || /bot|crawl|spider|headless/i.test(navigator.userAgent)) return;
    var cfg = window.RMPAIE_CONFIG || {}; if (!cfg.supabaseUrl || /VOTRE-PROJET/.test(cfg.supabaseUrl)) return;
    var page = location.pathname.replace(/index\.html$/, '').replace(/\.html$/, '') || '/';
    var q = new URLSearchParams(location.search), src = q.get('utm_source') || '';
    if (!src && document.referrer) { try { var h = new URL(document.referrer).hostname.replace(/^www\./, ''); if (h !== location.hostname.replace(/^www\./, '')) src = h; } catch (e) { } }
    var w = Math.min(screen.width, screen.height), app = /Mobi|Android|iPhone/i.test(navigator.userAgent) ? (w >= 600 ? 'tablette' : 'mobile') : (/iPad|Tablet/i.test(navigator.userAgent) ? 'tablette' : 'ordinateur');
    var nouvelle = false; try { nouvelle = !sessionStorage.getItem('rmpaie-visite'); sessionStorage.setItem('rmpaie-visite', '1'); } catch (e) { }
    var corps = JSON.stringify({ p_page: page, p_source: src || null, p_appareil: app, p_nouvelle: nouvelle });
    if (typeof sb !== 'undefined' && sb && sb.rpc) { sb.rpc('compter_visite', JSON.parse(corps)).then(function () { }, function () { }); return; }
    fetch(cfg.supabaseUrl + '/rest/v1/rpc/compter_visite', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + cfg.supabaseAnonKey }, body: corps }).catch(function () { });
  } catch (e) { }
})();
