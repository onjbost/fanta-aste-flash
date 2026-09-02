/**
 * La Redazione — raccolta della giornata dalla pagina della lega.
 *
 * Gira dentro leghe.fantacalcio.it, lanciato dal preferito che trovi in
 * /admin/redazione. Non sa niente della tua password: vede la pagina come la
 * vedi tu, già loggato, e basta.
 *
 * Non legge il testo della pagina: legge i componenti. Ogni giocatore è un
 * <ui-match-player> che porta con sé l'id del listone, il ruolo, il voto, il
 * fantavoto, la fascia di capitano e le icone degli eventi — ognuna con la
 * sua chiave (`scoredGoals`, `yellowCards`, …). Da lì escono dati esatti,
 * non un'interpretazione di un testo.
 *
 * I subentri la lega non li dichiara: si applicano le regole del Classico.
 * Un titolare senza voto lo rileva il primo panchinaro *dello stesso ruolo*
 * che ha preso voto, seguendo l'ordine della panchina; se quel ruolo in
 * panchina è finito, quel posto resta vuoto e la squadra gioca in dieci.
 *
 * Il pannello che vedi prima di inviare non è cortesia: ogni squadra porta
 * la sua verifica dei conti. La somma dei fantavoti di chi è sceso in campo
 * deve fare il totale scritto dalla lega. Se torna, la regola è stata
 * applicata bene — ed è una dimostrazione, non un indizio.
 */
(function () {
  'use strict';

  var CFG = window.__FANTA_REDAZIONE || {};
  var APP = (CFG.app || '').replace(/\/$/, '');
  var SEGRETO = CFG.secret || '';
  var ID = 'fanta-redazione-pannello';

  var vecchio = document.getElementById(ID);
  if (vecchio) vecchio.remove();
  if (!/leghe\.fantacalcio\.it$/.test(location.hostname)) {
    alert('Va lanciato dalla pagina di una giornata su leghe.fantacalcio.it.');
    return;
  }

  // =================================================================
  // 1 · lettura
  // =================================================================

  function numero(testo) {
    var t = String(testo == null ? '' : testo).trim().replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
  }

  /** Il tabellone in cima: una riga "3-2" per ogni sfida della giornata. */
  function leggiTabellone(testo) {
    var inizio = testo.indexOf('Giornata');
    var fine = testo.indexOf('Il calendario della competizione');
    if (inizio < 0) return { giornata: null, sfide: [] };
    var righe = testo.slice(inizio, fine > inizio ? fine : inizio + 2000).split('\n');
    var giornata = null, sfide = [], i;
    for (i = 0; i < righe.length; i++) {
      var g = righe[i].match(/^Giornata\s+(\d+)$/);
      if (g && giornata === null) giornata = Number(g[1]);
      if (/^\d+\s*-\s*\d+$/.test(righe[i].trim()) && i >= 2 && righe[i + 1]) {
        var gol = righe[i].replace(/\s/g, '').split('-');
        sfide.push({
          casa: righe[i - 2].trim(), allenatoreCasa: righe[i - 1].trim(),
          ospite: righe[i + 1].trim(), allenatoreOspite: (righe[i + 2] || '').trim(),
          golCasa: Number(gol[0]), golOspite: Number(gol[1]),
        });
      }
    }
    return { giornata: giornata, sfide: sfide };
  }

  /** Un giocatore, dai suoi attributi. */
  function leggiGiocatore(el, titolare, ordine) {
    var carta = el.querySelector('nz-card[data-id]');
    var fascia = el.querySelector('span.captain');
    var ruolo = el.querySelector('ui-role [data-role]');
    var eventi = {};
    var etichette = {};
    var icone = el.querySelectorAll('ui-live-event-icon[data-icon-key]');
    for (var i = 0; i < icone.length; i++) {
      var k = icone[i].getAttribute('data-icon-key');
      eventi[k] = (eventi[k] || 0) + 1;
      var img = icone[i].querySelector('img');
      if (img && img.alt) etichette[k] = img.alt;
    }
    var nome = el.querySelector('.player-name');
    return {
      extId: carta ? carta.getAttribute('data-id') : null,
      nome: nome ? nome.innerText.trim() : '',
      ruolo: ruolo ? ruolo.getAttribute('data-role') : null,
      titolare: titolare, ordine: ordine,
      voto: numero((el.querySelector('ui-match-grade') || {}).innerText),
      fantavoto: numero((el.querySelector('ui-match-fantagrade') || {}).innerText),
      fascia: fascia ? fascia.textContent.trim() : null,   // C, V o niente
      eventi: eventi, etichette: etichette,
    };
  }

  /** Le due formazioni: colonna 0 = casa, colonna 1 = ospite. */
  function leggiFormazioni(doc) {
    var root = doc.querySelector('ui-match-players');
    if (!root) return null;
    var blocchi = [], i;
    for (i = 0; i < root.children.length; i++) {
      if (root.children[i].querySelectorAll('ui-match-player').length) blocchi.push(root.children[i]);
    }
    var squadre = [[], []];
    blocchi.forEach(function (blocco, b) {
      for (var c = 0; c < blocco.children.length && c < 2; c++) {
        var elenco = blocco.children[c].querySelectorAll('ui-match-player');
        for (var p = 0; p < elenco.length; p++) {
          squadre[c].push(leggiGiocatore(elenco[p], b === 0, p));
        }
      }
    });
    return squadre;
  }

  /** I totali scritti dalla lega, riga per riga: [casa, etichetta, ospite]. */
  function leggiTotali(testo) {
    function coppia(etichetta) {
      var re = new RegExp('(-?[\\d.,]+)\\s*\\n\\s*' + etichetta + '\\s*\\n\\s*(-?[\\d.,]+)');
      var m = testo.match(re);
      return m ? [numero(m[1]), numero(m[2])] : [null, null];
    }
    var moduli = testo.match(/\b[3-5]-[1-6]-[1-4]\b/g) || [];
    var date = testo.match(/\d{2}\/\d{2}\/\d{4}[, ]+\d{2}:\d{2}:\d{2}/g) || [];
    return {
      soloVoti: coppia('solo voti'),
      modificatore: coppia('modificatore difesa'),
      capitano: coppia('fattore capitano'),
      totale: coppia('con bonus\\/malus'),
      moduli: moduli, inviate: date,
    };
  }

  // =================================================================
  // 2 · i conti, che sono anche la verifica
  // =================================================================

  var EPS = 0.01;
  var MAX_SOSTITUZIONI = CFG.maxSostituzioni == null ? 3 : CFG.maxSostituzioni;

  /**
   * Chi è davvero sceso in campo, applicando le regole del Classico.
   *
   * Per ogni titolare senza voto si cerca in panchina, nell'ordine deciso
   * dall'allenatore, il primo giocatore **dello stesso ruolo** che ha preso
   * voto. Se non c'è — perché quel ruolo in panchina è finito o è tutto
   * senza voto — quel posto resta vuoto: la squadra gioca in dieci.
   *
   * Non si cerca la combinazione che fa tornare il totale: quella strada
   * sembra funzionare e sbaglia, perché due panchinari con lo stesso
   * fantavoto danno la stessa somma e si finisce per nominare quello
   * sbagliato. Qui si applica la regola, e il totale serve a verificarla.
   */
  function ricostruisci(squadra, tot, lato) {
    var titolari = squadra.filter(function (g) { return g.titolare; });
    var panchina = squadra.filter(function (g) { return !g.titolare; });

    var usati = [], subentrati = [], inDieci = [];
    titolari.forEach(function (t) {
      if (t.fantavoto != null) return;                       // ha giocato
      if (subentrati.length >= MAX_SOSTITUZIONI) { inDieci.push(t); return; }
      var scelto = null;
      for (var i = 0; i < panchina.length && !scelto; i++) {
        var p = panchina[i];
        if (usati.indexOf(p) < 0 && p.ruolo === t.ruolo && p.fantavoto != null) scelto = p;
      }
      if (scelto) { usati.push(scelto); subentrati.push({ dentro: scelto, alPostoDi: t }); }
      else inDieci.push(t);
    });

    var base = titolari.reduce(function (s, g) { return s + (g.fantavoto || 0); }, 0);
    var daPanchina = subentrati.reduce(function (s, x) { return s + x.dentro.fantavoto; }, 0);
    var modificatore = tot.modificatore[lato] || 0;
    var capitano = tot.capitano[lato] || 0;
    var atteso = tot.totale[lato];
    var calcolato = base + daPanchina + modificatore + capitano;

    return {
      titolari: titolari, panchina: panchina,
      subentrati: subentrati, inDieci: inDieci,
      base: base, modificatore: modificatore, capitano: capitano,
      atteso: atteso, calcolato: Math.round(calcolato * 100) / 100,
      quadra: atteso == null ? null : Math.abs(calcolato - atteso) < EPS,
    };
  }

  function estrai(doc, testo, sfida) {
    var squadre = leggiFormazioni(doc);
    if (!squadre) return { errore: 'formazioni non trovate' };
    var tot = leggiTotali(testo);
    var casa = ricostruisci(squadre[0], tot, 0);
    var ospite = ricostruisci(squadre[1], tot, 1);
    return {
      casa: {
        nome: sfida.casa, allenatore: sfida.allenatoreCasa, gol: sfida.golCasa,
        modulo: tot.moduli[0] || null, fantapunti: tot.totale[0], soloVoti: tot.soloVoti[0],
        modificatore: casa.modificatore, bonusCapitano: casa.capitano,
        inviataIl: tot.inviate[0] || null,
        giocatori: squadre[0], conti: conti(casa),
      },
      ospite: {
        nome: sfida.ospite, allenatore: sfida.allenatoreOspite, gol: sfida.golOspite,
        modulo: tot.moduli[1] || null, fantapunti: tot.totale[1], soloVoti: tot.soloVoti[1],
        modificatore: ospite.modificatore, bonusCapitano: ospite.capitano,
        inviataIl: tot.inviate[1] || null,
        giocatori: squadre[1], conti: conti(ospite),
      },
    };
  }

  function conti(r) {
    return {
      quadra: r.quadra, atteso: r.atteso, calcolato: r.calcolato,
      senzaVoto: r.subentrati.length + r.inDieci.length,
      subentrati: r.subentrati.map(function (x) {
        return { dentro: x.dentro.nome, extId: x.dentro.extId, ruolo: x.dentro.ruolo,
                 fantavoto: x.dentro.fantavoto, alPostoDi: x.alPostoDi.nome };
      }),
      inDieci: r.inDieci.map(function (g) { return { nome: g.nome, ruolo: g.ruolo }; }),
    };
  }

  /** Carica una sfida in un iframe nascosto e la estrae. */
  function leggiSfida(indice, sfida) {
    return new Promise(function (risolvi) {
      var f = document.createElement('iframe');
      f.setAttribute('aria-hidden', 'true');
      f.style.cssText = 'position:fixed;left:-99999px;top:0;width:1280px;height:2400px;border:0';
      f.src = location.pathname + '?i=' + indice;
      var tentativi = 0;
      var t = setInterval(function () {
        tentativi++;
        var doc = null, testo = '';
        try { doc = f.contentDocument; testo = (doc && doc.body && doc.body.innerText) || ''; } catch (e) { /* non ancora */ }
        var pronto = testo.indexOf('Totale parziali') >= 0 && doc && doc.querySelector('ui-match-player');
        if (pronto || tentativi > 40) {
          clearInterval(t);
          var dati = pronto ? estrai(doc, testo, sfida) : { errore: 'la pagina non ha finito di caricare' };
          f.remove();
          risolvi({ indice: indice, sfida: sfida, testo: testo, dati: dati });
        }
      }, 500);
      document.body.appendChild(f);
    });
  }

  // =================================================================
  // 3 · pannello
  // =================================================================

  var FONDO = '#11151c', CARTA = '#1a212c', BORDO = '#2b3543', CODICE = '#0d1117';
  var CHIARO = '#e8edf4', SPENTO = '#8d9bb0', VERDE = '#3fb950', GIALLO = '#d29922', ROSSO = '#f85149';

  function el(tag, stile, testo) {
    var e = document.createElement(tag);
    if (stile) e.style.cssText = stile;
    if (testo != null) e.textContent = testo;
    return e;
  }
  function bottone(primario) {
    return 'padding:9px 18px;border-radius:9px;font:inherit;font-weight:600;cursor:pointer;border:1px solid '
      + (primario ? '#2f6f3f' : BORDO) + ';background:' + (primario ? '#238636' : 'transparent')
      + ';color:' + (primario ? '#fff' : CHIARO);
  }

  var fondo = el('div', 'position:fixed;inset:0;z-index:2147483647;background:rgba(4,7,12,.72);'
    + 'display:flex;align-items:center;justify-content:center;'
    + 'font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif');
  fondo.id = ID;
  var box = el('div', 'background:' + FONDO + ';color:' + CHIARO + ';border:1px solid ' + BORDO + ';'
    + 'border-radius:14px;width:min(820px,95vw);max-height:90vh;display:flex;flex-direction:column;'
    + 'box-shadow:0 24px 64px rgba(0,0,0,.6);overflow:hidden');
  fondo.appendChild(box);

  var tab = leggiTabellone(document.body.innerText);

  var testa = el('div', 'padding:18px 22px;border-bottom:1px solid ' + BORDO);
  testa.appendChild(el('div', 'font-size:16px;font-weight:600', 'La Redazione · raccolta della giornata'));
  testa.appendChild(el('div', 'color:' + SPENTO + ';margin-top:2px', tab.giornata
    ? 'Giornata ' + tab.giornata + ' · ' + tab.sfide.length + ' sfide'
    : 'Giornata non riconosciuta'));
  box.appendChild(testa);

  var corpo = el('div', 'padding:14px 22px;overflow:auto;flex:1');
  box.appendChild(corpo);
  var piede = el('div', 'padding:14px 22px;border-top:1px solid ' + BORDO
    + ';display:flex;gap:10px;align-items:center;justify-content:flex-end');
  box.appendChild(piede);
  var stato = el('div', 'color:' + SPENTO + ';margin-right:auto');
  piede.appendChild(stato);
  document.body.appendChild(fondo);

  if (!tab.sfide.length) {
    corpo.appendChild(el('div', 'color:' + ROSSO,
      'Non ho trovato il tabellone della giornata. Sei sulla pagina di una giornata della lega?'));
    var chiudi = el('button', bottone(false), 'Chiudi');
    chiudi.onclick = function () { fondo.remove(); };
    piede.appendChild(chiudi);
    return;
  }

  var raccolte = [];
  stato.textContent = 'Leggo le sfide…';

  (function prossima(i) {
    if (i >= tab.sfide.length) { mostra(); return; }
    stato.textContent = 'Leggo la sfida ' + (i + 1) + ' di ' + tab.sfide.length + '…';
    leggiSfida(i, tab.sfide[i]).then(function (r) { raccolte.push(r); prossima(i + 1); });
  })(0);

  function schieramento(s) {
    var box = el('div', 'flex:1;min-width:0');
    var t = el('div', 'font-weight:600;display:flex;gap:6px;align-items:baseline');
    t.appendChild(el('span', '', s.nome));
    t.appendChild(el('span', 'color:' + SPENTO + ';font-weight:400;font-size:12px',
      (s.modulo || '—') + ' · ' + (s.fantapunti != null ? s.fantapunti : '?') + ' fp'));
    box.appendChild(t);

    var c = s.conti;
    var esito = el('div', 'font-size:13px;margin-top:4px;color:' + (c.quadra ? VERDE : ROSSO),
      c.quadra
        ? '✓ i conti tornano: ' + c.calcolato + ' = ' + c.atteso
        : '✗ i conti non tornano: calcolo ' + c.calcolato + ', la lega dice ' + c.atteso);
    box.appendChild(esito);

    if (c.subentrati.length) {
      box.appendChild(el('div', 'font-size:13px;color:' + SPENTO,
        'entrati: ' + c.subentrati.map(function (x) {
          return x.dentro + ' per ' + x.alPostoDi;
        }).join(' · ')));
    }
    if (c.inDieci.length) {
      box.appendChild(el('div', 'font-size:13px;color:' + GIALLO,
        '⚠ in ' + (11 - c.inDieci.length) + ': fuori ' + c.inDieci.map(function (g) {
          return g.nome + ' (' + g.ruolo + ')';
        }).join(', ') + ' — nessun pari ruolo con voto in panchina'));
    }
    if (!s.inviataIl) {
      box.appendChild(el('div', 'font-size:13px;color:' + GIALLO, '⚠ formazione non inviata'));
    }
    return box;
  }

  function mostra() {
    corpo.innerHTML = '';
    var rotte = 0;

    raccolte.forEach(function (r) {
      var d = r.dati;
      var rotta = !!d.errore || !d.casa.conti.quadra || !d.ospite.conti.quadra;
      if (rotta) rotte++;

      var carta = el('div', 'background:' + CARTA + ';border:1px solid ' + BORDO
        + ';border-left:3px solid ' + (rotta ? ROSSO : VERDE)
        + ';border-radius:10px;padding:12px 14px;margin-bottom:10px');

      carta.appendChild(el('div', 'font-weight:600',
        r.sfida.casa + '  ' + r.sfida.golCasa + '-' + r.sfida.golOspite + '  ' + r.sfida.ospite));

      if (d.errore) {
        carta.appendChild(el('div', 'color:' + ROSSO + ';margin-top:6px', '✗ ' + d.errore));
      } else {
        var due = el('div', 'display:flex;gap:22px;margin-top:8px');
        due.appendChild(schieramento(d.casa));
        due.appendChild(schieramento(d.ospite));
        carta.appendChild(due);
      }

      var apri = el('button', 'margin-top:10px;background:none;border:0;color:#58a6ff;cursor:pointer;'
        + 'font:inherit;padding:0', 'mostra i dati estratti');
      var pre = el('pre', 'display:none;white-space:pre-wrap;word-break:break-word;background:' + CODICE + ';'
        + 'border:1px solid ' + BORDO + ';border-radius:8px;padding:10px;margin-top:8px;max-height:300px;'
        + 'overflow:auto;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:' + SPENTO);
      pre.textContent = JSON.stringify(d, null, 1);
      apri.onclick = function () {
        var chiuso = pre.style.display === 'none';
        pre.style.display = chiuso ? 'block' : 'none';
        apri.textContent = chiuso ? 'nascondi' : 'mostra i dati estratti';
      };
      carta.appendChild(apri);
      carta.appendChild(pre);
      corpo.appendChild(carta);
    });

    var payload = {
      lega: location.pathname.split('/')[1],
      competizione: (location.pathname.match(/competition\/(\d+)/) || [])[1] || null,
      giornata: tab.giornata,
      raccoltoIl: new Date().toISOString(),
      versioneEstrattore: 2,
      sfide: raccolte.map(function (r) {
        return { indice: r.indice, dati: r.dati, testo: r.testo };
      }),
    };

    stato.textContent = rotte
      ? rotte + ' ' + (rotte === 1 ? 'sfida' : 'sfide') + ' con i conti che non tornano'
      : raccolte.length + ' sfide lette, i conti tornano tutti';
    stato.style.color = rotte ? ROSSO : VERDE;

    var annulla = el('button', bottone(false), 'Annulla');
    annulla.onclick = function () { fondo.remove(); };
    piede.appendChild(annulla);

    var invia = el('button', bottone(true), APP ? 'Invia all\'app' : 'Copia negli appunti');
    piede.appendChild(invia);

    invia.onclick = function () {
      invia.disabled = true;
      if (!APP) {
        navigator.clipboard.writeText(JSON.stringify(payload, null, 1)).then(function () {
          stato.textContent = 'Copiato negli appunti.';
          stato.style.color = VERDE;
          invia.textContent = 'Copiato';
        });
        return;
      }
      invia.textContent = 'Invio…';
      fetch(APP + '/api/redazione/importa', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-redazione-secret': SEGRETO },
        body: JSON.stringify(payload),
      }).then(function (res) {
        return res.json().catch(function () { return { errore: 'risposta illeggibile (' + res.status + ')' }; });
      }).then(function (r) {
        if (r && r.ok) {
          stato.textContent = 'Ricevuto dall\'app.';
          stato.style.color = VERDE;
          invia.textContent = 'Fatto';
          setTimeout(function () { window.open(APP + '/admin/redazione', '_blank'); }, 400);
        } else {
          stato.textContent = 'L\'app ha risposto: ' + ((r && r.errore) || 'errore sconosciuto');
          stato.style.color = ROSSO;
          invia.disabled = false; invia.textContent = 'Riprova';
        }
      }).catch(function (e) {
        stato.textContent = 'Non sono riuscito a contattare l\'app: ' + e.message;
        stato.style.color = ROSSO;
        invia.disabled = false; invia.textContent = 'Riprova';
      });
    };
  }
})();
