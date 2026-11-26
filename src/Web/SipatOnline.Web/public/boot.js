// Starts the first calls of the portal while the app itself is still downloading, so they run side by side instead
// of one after the other: whose address this is, who is signed in and, on the participant's home, the trainings.
// The app picks each answer up once (see api.ts); anything missing or failed is simply asked again the usual way.
(function () {
  try {
    // the operation's address has its own sign-in and no participant home: the app asks there as it always did
    if (location.hostname.indexOf('ops.') === 0) {
      // a training link made on the operation's address (before that was fixed): the training is the company's, so
      // the person is sent to the company's own address, where they sign in and land on it
      var training = location.pathname === '/learning' && new URLSearchParams(location.search).get('treinamento');
      if (training && /^[0-9a-f-]{36}$/i.test(training)) {
        document.documentElement.style.visibility = 'hidden';
        var show = function () { document.documentElement.style.visibility = ''; };
        fetch('/api/training-links/' + training, { headers: { Accept: 'application/json' } })
          .then(function (response) { return response.ok ? response.json() : null; })
          .then(function (found) {
            if (found && /^[a-z0-9-]+$/.test(found.companyKey)) {
              location.replace('https://' + found.companyKey + '.' + location.host.slice(4) + '/learning?treinamento=' + training);
            } else show();
          }, show);
      }
      return;
    }
    var get = function (path) { return fetch(path, { credentials: 'include', headers: { Accept: 'application/json' } }); };
    var boot = { branding: get('/api/tenant/branding'), session: get('/api/identity/session') };
    if (location.pathname === '/learning' || location.pathname === '/') boot.home = get('/api/learning/home');
    // a call that fails here must not show as an unhandled error: the app decides what to do with it
    for (var key in boot) boot[key].catch(function () {});
    window.__sipatBoot = boot;
  } catch (error) { /* an old browser: the app loads the usual way */ }
})();
