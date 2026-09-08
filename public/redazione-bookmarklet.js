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
 *
 * Funziona su qualsiasi competizione della lega: campionato o coppa, la
 * pagina è la stessa e la competizione aperta si legge in testa. Alla fine
 * si prendono anche le classifiche — quelle vere della lega, non ricalcolate
 * da noi — di tutte le competizioni, così il pezzo può parlare di posizioni
 * senza che nessuno debba fidarsi della nostra aritmetica.
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

  /**
   * Il tabellone in cima: una riga "3-2" per ogni sfida della giornata.
   *
   * In coppa ne mostra **solo quelle del girone selezionato**, e dichiara qual
   * è. Ogni pagina di dettaglio (`?i=`) porta con sé il tabellone del girone a
   * cui appartiene la sua sfida: è così che si arriva a tutti e quattro gli
   * incontri di un turno senza toccare la tendina.
   */
  function leggiTabellone(testo) {
    var inizio = testo.indexOf('Giornata');
    var fine = testo.indexOf('Il calendario della competizione');
    if (inizio < 0) return { giornata: null, gruppo: null, sfide: [] };
    var blocco = testo.slice(inizio, fine > inizio ? fine : inizio + 2000);
    var gr = blocco.match(/^\s*Gruppo\s+([A-Z])\s*$/m);
    var gruppo = gr ? gr[1].toUpperCase() : null;
    var righe = blocco.split('\n');
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
    return { giornata: giornata, gruppo: gruppo, sfide: sfide };
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

  /**
   * Carica una pagina della lega in un iframe nascosto e la legge quando è
   * pronta. `pronto(doc, testo)` decide quando smettere di aspettare: ogni
   * pagina ha il suo segnale, e aspettare il segnale sbagliato vuol dire
   * leggere una tabella ancora vuota.
   */
  function leggiPagina(url, pronto, tentativiMax) {
    return new Promise(function (risolvi) {
      var f = document.createElement('iframe');
      f.setAttribute('aria-hidden', 'true');
      f.style.cssText = 'position:fixed;left:-99999px;top:0;width:1280px;height:2400px;border:0';
      f.src = url;
      var tentativi = 0;
      var t = setInterval(function () {
        tentativi++;
        var doc = null, testo = '';
        try { doc = f.contentDocument; testo = (doc && doc.body && doc.body.innerText) || ''; } catch (e) { /* non ancora */ }
        var ok = false;
        try { ok = !!(doc && pronto(doc, testo)); } catch (e) { ok = false; }
        if (ok || tentativi > (tentativiMax || 40)) {
          clearInterval(t);
          // il documento vive finché l'iframe è attaccato: chi riceve questo
          // oggetto legge quello che gli serve e poi chiama `chiudi()`
          risolvi({ ok: ok, doc: doc, testo: testo, chiudi: function () { f.remove(); } });
        }
      }, 500);
      document.body.appendChild(f);
    });
  }

  /** L'indirizzo di una sfida: `?i=N`, senza perdere il resto della query. */
  function indirizzoSfida(indice) {
    var q = new URLSearchParams(location.search);
    q.set('i', String(indice));
    return location.pathname + '?' + q.toString();
  }

  /**
   * Carica la sfida numero `indice` e la estrae.
   *
   * L'indice **non riparte da capo a ogni girone**: in un turno di coppa lo 0
   * e l'1 sono il gruppo A, il 2 e il 3 il gruppo B. Per questo non si legge
   * il tabellone una volta sola dalla pagina di partenza — quello mostra solo
   * il girone selezionato nella tendina — ma quello che ogni pagina di
   * dettaglio si porta dietro, che è già quello giusto.
   *
   * `posizioneNelGruppo` dice quante sfide di quel girone abbiamo già letto:
   * le pagine arrivano in ordine, quindi il contatore basta a sapere quale
   * riga del tabellone stiamo guardando.
   */
  function leggiSfida(indice, posizioneNelGruppo) {
    return leggiPagina(indirizzoSfida(indice), function (doc, testo) {
      return testo.indexOf('Totale parziali') >= 0 && doc.querySelector('ui-match-player');
    }, 40).then(function (p) {
      if (!p.ok) {
        var t = p.testo; p.chiudi();
        return { indice: indice, gruppo: null, sfida: null, testo: t,
                 dati: { errore: 'la pagina non ha finito di caricare' } };
      }
      var suo = leggiTabellone(p.testo);
      var quale = posizioneNelGruppo(suo.gruppo);
      var sfida = suo.sfide[quale] || null;
      var dati = sfida
        ? estrai(p.doc, p.testo, sfida)
        : { errore: 'il tabellone di questa pagina non contiene la sfida ' + (quale + 1) };
      var testo = p.testo;
      p.chiudi();
      return {
        indice: indice, gruppo: suo.gruppo, giornata: suo.giornata,
        quante: suo.sfide.length, sfida: sfida, testo: testo, dati: dati,
      };
    });
  }

  // =================================================================
  // 2 bis · le competizioni e le loro classifiche
  // =================================================================

  /**
   * Le competizioni della lega, con il loro id.
   *
   * La lega le tiene tutte nel menù di riordino: lì dentro ogni voce porta
   * `data-id` e il nome. È l'unico posto dove id e nome stanno insieme, ed è
   * quello che ci serve per andare a prendere una classifica che non è quella
   * aperta adesso.
   */
  function leggiCompetizioni(doc) {
    var d = doc || document;
    var voci = d.querySelectorAll('#competitionSettingsModal .list-group-item-league[data-id]');
    var fuori = [], visti = {};
    for (var i = 0; i < voci.length; i++) {
      var id = voci[i].getAttribute('data-id');
      var n = voci[i].querySelector('.competition-name');
      var nome = (n ? n.innerText : voci[i].innerText).trim();
      if (!id || visti[id]) continue;
      visti[id] = true;
      fuori.push({ id: id, nome: nome, tipo: /coppa/i.test(nome) ? 'coppa' : 'campionato' });
    }
    return fuori;
  }

  /**
   * Quale competizione è aperta adesso.
   *
   * Non si chiede alla pagina della giornata. Quella pagina cambia forma a
   * seconda di com'è fatta la competizione — con i gironi ha due tendine in
   * più e l'intestazione della lega non c'è — e la prima versione, che
   * cercava lì `.competition-current-name`, sulla coppa non trovava niente:
   * `tipo` partiva vuoto e l'import scriveva la coppa come campionato.
   *
   * La pagina della classifica invece ha sempre la stessa intestazione, e la
   * lega ci mostra quella della competizione **scelta nella sessione** — cioè
   * proprio quella della giornata che hai davanti. È la stessa pagina che
   * dobbiamo caricare comunque per le classifiche: la si legge una volta e
   * dice tutto, il nome corrente e l'elenco completo con gli id.
   *
   * Il `?id=` dell'indirizzo, quando c'è, resta il riscontro più diretto e
   * vince sul nome.
   */
  function competizioneDallaClassifica(doc) {
    var elenco = leggiCompetizioni(doc);
    var e = doc.querySelector('.competition-current-name');
    var nome = e ? e.innerText.trim() : '';
    var id = idCompetizione();
    var i;

    if (id) for (i = 0; i < elenco.length; i++) if (elenco[i].id === id) return { corrente: elenco[i], elenco: elenco };
    for (i = 0; i < elenco.length; i++) if (elenco[i].nome === nome) return { corrente: elenco[i], elenco: elenco };

    // ultima spiaggia: il nome letto qui, o i gironi visti nel tabellone
    var tipo = nome ? (/coppa/i.test(nome) ? 'coppa' : 'campionato') : tipoDalTabellone();
    return { corrente: { id: id, nome: nome || null, tipo: tipo }, elenco: elenco };
  }

  /**
   * L'indizio di riserva, preso dalla pagina che hai davanti: se il tabellone
   * della giornata parla di gironi, quella è la coppa. Nel campionato la
   * parola «Gruppo» non compare.
   */
  function tipoDalTabellone() {
    return /\bGruppo\s+[A-Z]\b/.test(document.body.innerText) ? 'coppa' : null;
  }

  /**
   * L'id della competizione aperta.
   *
   * La pagina di una giornata sta su `/{lega}/view/competition/<id>/round/<n>`:
   * la competizione è **nel percorso**, non in `?id=`. La query la usano le
   * pagine vecchie (calendario, classifica), e quando c'è vince lei perché è
   * quella che l'utente ha appena scelto.
   */
  function idCompetizione() {
    var q = new URLSearchParams(location.search).get('id');
    if (q) return q;
    var m = location.pathname.match(/competition\/(\d+)/);
    return m ? m[1] : null;
  }

  /** La prima riga non vuota di una cella. */
  function primaRiga(testo) {
    var righe = String(testo == null ? '' : testo).split('\n');
    for (var i = 0; i < righe.length; i++) {
      var v = righe[i].trim().replace(/\s+/g, ' ');
      if (v !== '') return v;
    }
    return '';
  }

  /**
   * Una tabella di classifica, riga per riga.
   *
   * Le celle vuote della lega (lo stemma, i bottoncini in fondo) si buttano:
   * quello che resta è sempre nello stesso ordine — posizione, squadra, poi i
   * numeri. Se una riga non ha quella forma non si indovina: si salta.
   *
   * Della cella del nome si prende **solo la prima riga**: sotto al nome la
   * lega ci mette la penalità in punti, che in pagina è nascosta ma dentro un
   * iframe no. Presa tutta, la squadra si chiamerebbe «DEPORTIVO APERITIVO 0»
   * e non la riconoscerebbe più nessuno.
   */
  function leggiTabellaClassifica(tabella) {
    var righe = [];
    var tr = tabella.querySelectorAll('tbody tr');
    for (var i = 0; i < tr.length; i++) {
      var celle = [];
      var td = tr[i].querySelectorAll('td');
      for (var j = 0; j < td.length; j++) {
        var v = td[j].innerText.trim().replace(/\s+/g, ' ');
        if (v !== '') celle.push(primaRiga(td[j].innerText));
      }
      if (celle.length < 11) continue;
      righe.push({
        posizione: numero(celle[0]), squadra: celle[1],
        giocate: numero(celle[2]), vinte: numero(celle[3]),
        pari: numero(celle[4]), perse: numero(celle[5]),
        golFatti: numero(celle[6]), golSubiti: numero(celle[7]),
        differenza: numero(celle[8]), punti: numero(celle[9]),
        fantapunti: numero(celle[10]),
      });
    }
    return righe;
  }

  /**
   * Il gruppo di una tabella di classifica.
   *
   * L'intestazione da sola non basta: dentro un iframe la lega scrive «Gruppo
   * A» anche sopra la classifica del campionato, che gruppi non ne ha. Il
   * segnale vero è che le tabelle siano più d'una — una classifica sola è la
   * classifica e basta. Quando i gruppi ci sono, il nome si legge; se non si
   * legge, si conta: prima tabella A, seconda B.
   */
  function gruppoDellaTabella(tabella, indice, quante) {
    if (quante < 2) return null;
    var th = tabella.querySelector('thead th');
    var g = (th ? th.innerText : '').match(/gruppo\s+([A-Z])\b/i);
    if (g) return g[1].toUpperCase();
    return String.fromCharCode(65 + indice);
  }

  var CLASSIFICA = function () { return '/' + location.pathname.split('/')[1] + '/classifica'; };

  function classificaPronta(doc) {
    var t = doc.querySelectorAll('table.smart-table');
    return t.length && t[0].querySelectorAll('tbody tr').length;
  }

  function tabelleDi(doc, c) {
    var fuori = [];
    var tabelle = doc.querySelectorAll('table.smart-table');
    for (var k = 0; k < tabelle.length; k++) {
      var righe = leggiTabellaClassifica(tabelle[k]);
      if (!righe.length) continue;
      fuori.push({
        competizioneId: c.id, competizione: c.nome, tipo: c.tipo,
        gruppo: gruppoDellaTabella(tabelle[k], k, tabelle.length),
        righe: righe,
      });
    }
    return fuori;
  }

  /**
   * Le classifiche di tutte le competizioni, e già che ci siamo la risposta
   * su che competizione stiamo importando.
   *
   * Si parte dalla classifica **senza `?id=`**: la lega tiene la competizione
   * scelta nella sessione, quindi quella pagina è la classifica di quello che
   * hai davanti. Da lì escono il nome corrente e l'elenco con gli id.
   *
   * Poi si passano le altre. Aprire `?id=` cambia la sessione per davvero, e
   * anche per la scheda aperta: per questo alla fine si torna sulla corrente,
   * così quando il preferito ha finito la lega è dov'era.
   */
  function leggiClassifiche() {
    // sulla pagina di una giornata la competizione sta nel percorso: si chiede
    // esplicitamente quella, invece di sperare che la sessione sia allineata
    var mio = idCompetizione();
    var partenza = CLASSIFICA() + (mio ? '?id=' + encodeURIComponent(mio) : '');
    return leggiPagina(partenza, classificaPronta, 30).then(function (p) {
      if (!p.ok) { p.chiudi(); return { corrente: { id: null, nome: null, tipo: tipoDalTabellone() }, classifiche: [] }; }

      var letto = competizioneDallaClassifica(p.doc);
      var corrente = letto.corrente;
      var raccolte = tabelleDi(p.doc, corrente);
      p.chiudi();

      var altre = letto.elenco.filter(function (c) {
        return c.id && (!corrente.id || c.id !== corrente.id);
      });

      function prossima(i) {
        if (i >= altre.length) return ripristina();
        var c = altre[i];
        return leggiPagina(CLASSIFICA() + '?id=' + encodeURIComponent(c.id), classificaPronta, 30)
          .then(function (q) {
            if (q.ok) raccolte = raccolte.concat(tabelleDi(q.doc, c));
            q.chiudi();
            return prossima(i + 1);
          });
      }

      /** Rimette la lega sulla competizione da cui siamo partiti. */
      function ripristina() {
        if (!altre.length || !corrente.id) return { corrente: corrente, classifiche: raccolte };
        return leggiPagina(CLASSIFICA() + '?id=' + encodeURIComponent(corrente.id), classificaPronta, 30)
          .then(function (q) { q.chiudi(); return { corrente: corrente, classifiche: raccolte }; });
      }

      return prossima(0);
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
  var sottotitolo = el('div', 'color:' + SPENTO + ';margin-top:2px', tab.giornata
    ? 'Giornata ' + tab.giornata
    : 'Giornata non riconosciuta');
  testa.appendChild(sottotitolo);
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
  var corrente = { id: idCompetizione(), nome: null, tipo: null };
  var classifiche = [];
  stato.textContent = 'Leggo le sfide…';

  /*
   * Quante sfide ha davvero questo turno non si sa in partenza.
   *
   * Nel campionato basterebbe il tabellone della pagina. In coppa no: quello
   * mostra un girone solo, mentre gli indici `?i=` scorrono su tutti. E oltre
   * l'ultimo la lega non dà errore, riavvolge al primo — chiedere `?i=4` di un
   * turno da quattro sfide restituisce di nuovo la prima.
   *
   * Quindi si conta per girone e si smette quando un girone è finito: la
   * pagina che avrebbe la sfida numero N di un girone che ne ha N è la prima
   * che si ripete. Vale identico per il campionato, dove il girone è uno solo.
   */
  var visteNelGruppo = {};
  var MASSIME = 16;

  (function prossima(i) {
    function finisci() {
      stato.textContent = 'Leggo le classifiche…';
      leggiClassifiche()
        .then(function (r) { corrente = r.corrente; classifiche = r.classifiche; mostra(); })
        .catch(function () { corrente.tipo = corrente.tipo || tipoDalTabellone(); mostra(); });
    }
    if (i >= MASSIME) { finisci(); return; }

    stato.textContent = 'Leggo la sfida ' + (i + 1) + '…';
    var chiave = null;
    leggiSfida(i, function (gruppo) {
      chiave = gruppo || '';
      var n = visteNelGruppo[chiave] || 0;
      visteNelGruppo[chiave] = n + 1;
      return n;
    }).then(function (r) {
      // il girone è esaurito: da qui in poi la lega ripete quelle già lette
      if (r.sfida === null && r.quante != null && visteNelGruppo[chiave] > r.quante) {
        visteNelGruppo[chiave] = r.quante;
        finisci();
        return;
      }
      raccolte.push(r);
      prossima(i + 1);
    });
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
    var invia = null;

    /*
     * Cosa stiamo per scrivere, in cima e deciso da te.
     *
     * La competizione l'estrattore la riconosce, ma non è lui ad avere
     * l'ultima parola: la sceglie chi importa. Sbagliarla non dà un errore
     * comprensibile — l'app dice che l'accoppiamento «non è in calendario» —
     * e per un giro l'ha pure indovinata male in silenzio, scrivendo la coppa
     * sul campionato. Una tendina costa un secondo e toglie di mezzo l'intera
     * categoria di problemi.
     */
    var gironiLetti = [];
    raccolte.forEach(function (r) {
      if (r.gruppo && gironiLetti.indexOf(r.gruppo) < 0) gironiLetti.push(r.gruppo);
    });
    gironiLetti.sort();

    var testata = el('div', 'background:' + CARTA + ';border:1px solid ' + BORDO
      + ';border-left:3px solid ' + VERDE + ';border-radius:10px;padding:12px 14px;margin-bottom:10px');

    var riga = el('div', 'display:flex;gap:10px;align-items:center;flex-wrap:wrap');
    riga.appendChild(el('label', 'font-weight:600', 'Sto importando:'));

    var scelta = document.createElement('select');
    scelta.style.cssText = 'padding:7px 10px;border-radius:8px;font:inherit;background:' + FONDO
      + ';color:' + CHIARO + ';border:1px solid ' + BORDO;
    [['', '— scegli —'],
     ['campionato', nomeDi('campionato') || 'Campionato'],
     ['coppa', nomeDi('coppa') || 'Coppa']].forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o[0]; opt.textContent = o[1];
      scelta.appendChild(opt);
    });
    scelta.value = corrente.tipo || '';
    riga.appendChild(scelta);

    var quante = el('span', 'color:' + SPENTO,
      raccolte.length + (raccolte.length === 1 ? ' sfida letta' : ' sfide lette')
      + (gironiLetti.length > 1 ? ', gruppi ' + gironiLetti.join(' e ') : ''));
    riga.appendChild(quante);
    testata.appendChild(riga);

    var nota = el('div', 'font-size:13px;margin-top:6px');
    testata.appendChild(nota);
    corpo.appendChild(testata);

    function aggiorna() {
      var t = scelta.value;
      nota.textContent = t === 'coppa'
        ? 'Finirà nel ' + (tab.giornata == null ? '?' : tab.giornata) + '° turno di coppa.'
        : t === 'campionato'
          ? 'Finirà nella giornata ' + (tab.giornata == null ? '?' : tab.giornata) + ' di campionato.'
          : 'Scegli la competizione: senza, l\'app non sa dove scrivere e rifiuta l\'import.';
      nota.style.color = t ? SPENTO : GIALLO;
      testata.style.borderLeftColor = t ? VERDE : GIALLO;
      if (invia) {
        invia.disabled = !t;
        invia.style.opacity = t ? '1' : '.5';
      }
    }
    scelta.onchange = aggiorna;

    /** Il nome che la lega dà a quella competizione, quando siamo riusciti a leggerlo. */
    function nomeDi(tipo) {
      for (var i = 0; i < classifiche.length; i++) {
        if (classifiche[i].tipo === tipo && classifiche[i].competizione) return classifiche[i].competizione;
      }
      return null;
    }

    raccolte.forEach(function (r) {
      var d = r.dati;
      var rotta = !!d.errore || !d.casa.conti.quadra || !d.ospite.conti.quadra;
      if (rotta) rotte++;

      var carta = el('div', 'background:' + CARTA + ';border:1px solid ' + BORDO
        + ';border-left:3px solid ' + (rotta ? ROSSO : VERDE)
        + ';border-radius:10px;padding:12px 14px;margin-bottom:10px');

      carta.appendChild(el('div', 'font-weight:600', r.sfida
        ? (r.gruppo ? 'Gruppo ' + r.gruppo + ' · ' : '')
          + r.sfida.casa + '  ' + r.sfida.golCasa + '-' + r.sfida.golOspite + '  ' + r.sfida.ospite
        : 'Sfida ' + (r.indice + 1) + ': non l\'ho letta'));

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

    if (classifiche.length) {
      var carta = el('div', 'background:' + CARTA + ';border:1px solid ' + BORDO
        + ';border-left:3px solid ' + VERDE + ';border-radius:10px;padding:12px 14px;margin-bottom:10px');
      carta.appendChild(el('div', 'font-weight:600', 'Classifiche lette dalla lega'));
      classifiche.forEach(function (c) {
        var testa = (c.competizione || 'competizione') + (c.gruppo ? ' · gruppo ' + c.gruppo : '');
        carta.appendChild(el('div', 'font-size:13px;color:' + SPENTO + ';margin-top:6px',
          testa + ': ' + c.righe.map(function (r) {
            return r.posizione + '. ' + r.squadra + ' ' + r.punti;
          }).join('  ·  ')));
      });
      corpo.appendChild(carta);
    }

    /* Si compone al momento dell'invio: la competizione è quella nella tendina. */
    function costruisciPayload() {
      return {
        lega: location.pathname.split('/')[1],
        competizione: corrente.id || idCompetizione(),
        competizioneNome: nomeDi(scelta.value) || corrente.nome,
        tipo: scelta.value || null,
        tipoRiconosciuto: corrente.tipo,
        giornata: tab.giornata,
        raccoltoIl: new Date().toISOString(),
        versioneEstrattore: 3,
        classifiche: classifiche,
        sfide: raccolte.map(function (r) {
          return { indice: r.indice, gruppo: r.gruppo || null, dati: r.dati, testo: r.testo };
        }),
      };
    }

    var coda = classifiche.length
      ? ' · ' + classifiche.length + (classifiche.length === 1 ? ' classifica letta' : ' classifiche lette')
      : ' · nessuna classifica letta';
    stato.textContent = (rotte
      ? rotte + ' ' + (rotte === 1 ? 'sfida' : 'sfide') + ' con i conti che non tornano'
      : raccolte.length + ' sfide lette, i conti tornano tutti') + coda;
    stato.style.color = rotte ? ROSSO : VERDE;

    var annulla = el('button', bottone(false), 'Annulla');
    annulla.onclick = function () { fondo.remove(); };
    piede.appendChild(annulla);

    invia = el('button', bottone(true), APP ? 'Invia all\'app' : 'Copia negli appunti');
    piede.appendChild(invia);
    aggiorna();

    invia.onclick = function () {
      if (!scelta.value) return;
      var payload = costruisciPayload();
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
