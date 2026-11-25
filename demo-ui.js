// Démo : bandeau discret, réinitialisation
(function () {
  const prec = afterRender;
  afterRender = function () {
    prec();
    const main = document.getElementById('main'); if (!main || document.getElementById('demobar')) return;
    const d = document.createElement('div'); d.id = 'demobar'; d.className = 'demobar';
    d.innerHTML = '<b>Démonstration</b> — données fictives. <button class="lnk" data-act="demoReset">Réinitialiser</button>';
    main.prepend(d);
  };
  ACT.demoReset = async () => {
    await sb.auth.signOut();
    try { indexedDB.deleteDatabase('/pglite/rmpaie-demo-v11'); } catch (e) { }
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) { }
    toast('Démo réinitialisée : rouvrez la page pour repartir des données d’origine.'); relancer();
  };
})();
