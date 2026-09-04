import 'server-only';
import { supabaseAdmin } from './supabase';
import { diffRosters, diffListone, type CurrentContract, type CurrentPlayer, type RosterDiff } from './sync';
import type { ListonePlayer } from './listone';
import type { PlayerStatus, Role } from './rules';

/**
 * Correzioni dell'admin sulle rose.
 *
 * Nessuna scrittura silenziosa: ogni modifica genera il movimento di credito
 * che la compensa e una riga nell'audit log con il motivo. Il saldo di una
 * squadra resta sempre la somma dei suoi movimenti, quindi si può sempre
 * ricostruire come ci si è arrivati.
 */

export interface EditResult { ok: boolean; message: string }

/** Cambia il prezzo d'acquisto di un giocatore già in rosa. */
export async function updateContractPrice(
  contractId: string, newPrice: number, actor: string, note: string,
): Promise<EditResult> {
  if (!Number.isInteger(newPrice) || newPrice < 0) {
    return { ok: false, message: 'Il prezzo deve essere un numero intero non negativo.' };
  }
  const db = supabaseAdmin();
  const { data: c } = await db.from('contracts')
    .select('id, league_id, team_id, price, released_at, players(name)')
    .eq('id', contractId).single();
  if (!c) return { ok: false, message: 'Contratto inesistente.' };
  if (c.released_at) return { ok: false, message: 'Questo contratto è già chiuso.' };
  if (c.price === newPrice) return { ok: true, message: 'Era già quel prezzo.' };

  const delta = c.price - newPrice;   // prezzo più basso = crediti che tornano
  const name = (c as unknown as { players: { name: string } | null }).players?.name ?? 'giocatore';

  await db.from('contracts').update({ price: newPrice }).eq('id', contractId);
  await db.from('credit_movements').insert({
    league_id: c.league_id, team_id: c.team_id, amount: delta, reason: 'adjustment',
    note: `Correzione prezzo ${name}: ${c.price} → ${newPrice}${note ? ` · ${note}` : ''}`,
  });
  await db.from('audit_log').insert({
    league_id: c.league_id, actor, action: 'contract_price_changed',
    payload: { contract_id: contractId, player: name, from: c.price, to: newPrice, note },
  });

  return {
    ok: true,
    message: `${name}: prezzo ${c.price} → ${newPrice}, ${delta >= 0 ? '+' : ''}${delta} crediti alla squadra.`,
  };
}

/** Toglie un giocatore da una rosa. Di norma restituisce i crediti pagati. */
export async function removeFromRoster(
  contractId: string, refundCredits: boolean, actor: string, note: string,
): Promise<EditResult> {
  const db = supabaseAdmin();
  const { data: c } = await db.from('contracts')
    .select('id, league_id, team_id, price, player_id, released_at, players(name)')
    .eq('id', contractId).single();
  if (!c) return { ok: false, message: 'Contratto inesistente.' };
  if (c.released_at) return { ok: false, message: 'Questo contratto è già chiuso.' };
  const name = (c as unknown as { players: { name: string } | null }).players?.name ?? 'giocatore';

  await db.from('contracts').update({
    released_at: new Date().toISOString(), release_type: 'correction',
    release_value: refundCredits ? c.price : 0,
  }).eq('id', contractId);

  if (refundCredits) {
    await db.from('credit_movements').insert({
      league_id: c.league_id, team_id: c.team_id, amount: c.price, reason: 'adjustment',
      note: `Correzione: ${name} tolto dalla rosa${note ? ` · ${note}` : ''}`,
    });
  }
  await db.from('audit_log').insert({
    league_id: c.league_id, actor, action: 'roster_player_removed',
    payload: { contract_id: contractId, player: name, price: c.price, refunded: refundCredits, note },
  });

  return { ok: true, message: `${name} tolto dalla rosa${refundCredits ? `, ${c.price} crediti restituiti` : ''}.` };
}

/**
 * Porta i crediti residui di una squadra al valore indicato.
 *
 * Non scrive un saldo: i crediti restano la somma dei movimenti, quindi qui si
 * registra soltanto la **differenza** fra quello che risulta e quello che deve
 * risultare. Il vantaggio è che la correzione si vede nel registro con tanto di
 * motivo, e un saldo sbagliato si può sempre ricostruire da capo.
 *
 * Serve dopo un'asta di riparazione o un import: l'app calcola i residui dai
 * prezzi che ha in pancia, l'app ufficiale ha i suoi, e la verità è quella
 * ufficiale.
 */
export async function setTeamCredits(
  teamId: string, target: number, actor: string, note: string,
): Promise<EditResult> {
  if (!Number.isInteger(target)) {
    return { ok: false, message: 'I crediti sono un numero intero.' };
  }
  // Un saldo negativo nel gioco non esiste, e un meno battuto per sbaglio
  // passerebbe inosservato fino al giorno dell'asta, quando le validazioni
  // sul budget comincerebbero a rifiutare tutto senza dire perché.
  if (target < 0) {
    return { ok: false, message: 'I crediti non possono essere negativi.' };
  }
  const db = supabaseAdmin();
  const { data: t } = await db.from('v_team_credits')
    .select('team_id, league_id, name, credits').eq('team_id', teamId).maybeSingle();
  if (!t) return { ok: false, message: 'Squadra inesistente.' };

  const attuali = Number(t.credits ?? 0);
  const delta = target - attuali;
  if (delta === 0) return { ok: true, message: `${t.name}: erano già ${target} crediti.` };

  await db.from('credit_movements').insert({
    league_id: t.league_id, team_id: teamId, amount: delta, reason: 'adjustment',
    created_by: actor,
    note: `Correzione crediti: ${attuali} → ${target}${note ? ` · ${note}` : ''}`,
  });
  await db.from('audit_log').insert({
    league_id: t.league_id, actor, action: 'credits_adjusted',
    payload: { team_id: teamId, team: t.name, from: attuali, to: target, delta, note },
  });

  return {
    ok: true,
    message: `${t.name}: ${attuali} → ${target} crediti (${delta > 0 ? '+' : ''}${delta}).`,
  };
}

/** Aggiunge uno svincolato a una rosa al prezzo indicato. */
export async function addToRoster(
  teamId: string, playerId: string, price: number, actor: string, note: string,
): Promise<EditResult> {
  if (!Number.isInteger(price) || price < 0) {
    return { ok: false, message: 'Il prezzo deve essere un numero intero non negativo.' };
  }
  const db = supabaseAdmin();
  const { data: team } = await db.from('teams').select('id, league_id, name').eq('id', teamId).single();
  if (!team) return { ok: false, message: 'Squadra inesistente.' };

  const { data: open } = await db.from('contracts')
    .select('id').eq('player_id', playerId).is('released_at', null).maybeSingle();
  if (open) return { ok: false, message: 'Quel giocatore è già nella rosa di qualcuno.' };

  const { data: player } = await db.from('players').select('name').eq('id', playerId).single();

  await db.from('contracts').insert({
    league_id: team.league_id, team_id: teamId, player_id: playerId,
    price, acquisition_type: 'correction',
  });
  await db.from('credit_movements').insert({
    league_id: team.league_id, team_id: teamId, amount: -price, reason: 'adjustment',
    note: `Correzione: ${player?.name} aggiunto alla rosa${note ? ` · ${note}` : ''}`,
  });
  await db.from('audit_log').insert({
    league_id: team.league_id, actor, action: 'roster_player_added',
    payload: { team: team.name, player: player?.name, price, note },
  });

  return { ok: true, message: `${player?.name} aggiunto a ${team.name} per ${price} crediti.` };
}

// ------------------------------------------------- sincronizzazione da file

export interface SyncPreview {
  rosters: RosterDiff;
  listone: ReturnType<typeof diffListone>;
  teamsInFile: string[];
  unknownTeams: string[];
}

/** Fotografia attuale del database, nella forma che serve al confronto. */
export async function currentSnapshot(leagueId: string): Promise<{
  contracts: CurrentContract[]; players: CurrentPlayer[]; teamIds: Map<string, string>;
}> {
  const db = supabaseAdmin();
  const [{ data: contracts }, { data: players }, { data: teams }] = await Promise.all([
    db.from('contracts')
      .select('id, price, acquisition_type, teams(name), players(ext_id, name, role, status)')
      .eq('league_id', leagueId).is('released_at', null),
    db.from('players').select('ext_id, name, club, quotation, out_of_list').eq('league_id', leagueId),
    db.from('teams').select('id, name').eq('league_id', leagueId),
  ]);

  type Row = {
    id: string; price: number; acquisition_type: string;
    teams: { name: string } | null;
    players: { ext_id: string; name: string; role: Role; status: PlayerStatus } | null;
  };

  return {
    contracts: ((contracts ?? []) as unknown as Row[])
      .filter((c) => c.players && c.teams)
      .map((c) => ({
        extId: c.players!.ext_id, name: c.players!.name, role: c.players!.role,
        teamName: c.teams!.name, price: c.price, status: c.players!.status,
        fromFlashAuction: c.acquisition_type === 'flash_auction',
      })),
    players: (players ?? []).map((p) => ({
      extId: p.ext_id, name: p.name, club: p.club,
      quotation: p.quotation, outOfList: !!p.out_of_list,
    })),
    teamIds: new Map((teams ?? []).map((t) => [t.name, t.id])),
  };
}

export async function previewSync(leagueId: string, incoming: ListonePlayer[]): Promise<SyncPreview> {
  const snap = await currentSnapshot(leagueId);
  const teamsInFile = [...new Set(incoming.map((p) => p.teamName).filter(Boolean))] as string[];
  return {
    rosters: diffRosters(snap.contracts, incoming),
    listone: diffListone(snap.players, incoming),
    teamsInFile,
    unknownTeams: teamsInFile.filter((t) => !snap.teamIds.has(t)),
  };
}

/**
 * Applica le differenze. Il listone si aggiorna sempre; le rose solo se
 * l'admin lo chiede esplicitamente, perché è lì che si può fare danno.
 */
export async function applySync(
  leagueId: string, incoming: ListonePlayer[], opts: { rosters: boolean; actor: string },
): Promise<{ ok: boolean; message: string; details: string[] }> {
  const db = supabaseAdmin();
  const details: string[] = [];

  // 1 · listone: sempre, è solo anagrafica
  for (let i = 0; i < incoming.length; i += 500) {
    const rows = incoming.slice(i, i + 500).map((p) => ({
      league_id: leagueId, ext_id: p.extId, name: p.name, role: p.role,
      club: p.club, quotation: p.quotation, out_of_list: p.outOfList,
    }));
    const { error } = await db.from('players').upsert(rows, { onConflict: 'league_id,ext_id' });
    if (error) return { ok: false, message: `Listone: ${error.message}`, details };
  }
  details.push(`${incoming.length} giocatori aggiornati nel listone`);

  if (!opts.rosters) {
    return { ok: true, message: 'Listone aggiornato. Le rose non sono state toccate.', details };
  }

  const snap = await currentSnapshot(leagueId);
  const diff = diffRosters(snap.contracts, incoming);

  const { data: allPlayers } = await db.from('players')
    .select('id, ext_id, name').eq('league_id', leagueId);
  const playerIds = new Map((allPlayers ?? []).map((p) => [p.ext_id, p.id]));

  const { data: openContracts } = await db.from('contracts')
    .select('id, player_id, team_id, price, players(ext_id)')
    .eq('league_id', leagueId).is('released_at', null);
  const contractByExt = new Map(
    ((openContracts ?? []) as unknown as { id: string; price: number; team_id: string; players: { ext_id: string } | null }[])
      .filter((c) => c.players)
      .map((c) => [c.players!.ext_id, c]),
  );

  const now = new Date().toISOString();

  // 2 · prezzi corretti
  for (const r of diff.repriced) {
    const c = contractByExt.get(r.extId);
    if (!c) continue;
    await db.from('contracts').update({ price: r.to }).eq('id', c.id);
    await db.from('credit_movements').insert({
      league_id: leagueId, team_id: c.team_id, amount: r.from - r.to, reason: 'adjustment',
      note: `Sincronizzazione: prezzo ${r.name} ${r.from} → ${r.to}`,
    });
  }
  if (diff.repriced.length) details.push(`${diff.repriced.length} prezzi corretti`);

  // 3 · usciti dalle rose
  //
  // Per la lega uscire dalla rosa è uno svincolo, e uno svincolo rende il 75%
  // del prezzo pagato — non il prezzo intero. Il valore arriva già calcolato
  // dal confronto (`rimborso`), con le stesse regole del mercato: così quello
  // che l'admin legge nell'anteprima è esattamente quello che viene scritto.
  //
  // `release_type` resta 'correction' perché descrive *come* è entrata questa
  // riga nel nostro database — a mano, riconciliando un file — non che tipo
  // di operazione sia stata in lega. Di conseguenza non consuma un cambio di
  // ruolo: se lo svincolo è avvenuto davvero fuori dall'app, il contatore va
  // corretto a mano dal pannello.
  for (const r of diff.removed) {
    const c = contractByExt.get(r.extId);
    if (!c) continue;
    await db.from('contracts').update({
      released_at: now, release_type: 'correction', release_value: r.rimborso,
    }).eq('id', c.id);
    await db.from('credit_movements').insert({
      league_id: leagueId, team_id: c.team_id, amount: r.rimborso, reason: 'adjustment',
      note: `Sincronizzazione: ${r.name} non è più in rosa`
        + ` · rimborso ${r.rimborso} di ${r.price}`
        + (r.tipoRimborso === 'free_100' ? ' (100%, fuori dalla Serie A o squalificato)' : ' (75%)'),
    });
  }
  if (diff.removed.length) details.push(`${diff.removed.length} usciti dalle rose`);

  // 4 · cambi di squadra: chiudo di là, apro di qua
  for (const m of diff.moved) {
    const c = contractByExt.get(m.extId);
    const toId = snap.teamIds.get(m.to);
    if (!c || !toId) continue;
    await db.from('contracts').update({
      released_at: now, release_type: 'correction', release_value: c.price,
    }).eq('id', c.id);
    await db.from('credit_movements').insert([
      {
        league_id: leagueId, team_id: c.team_id, amount: c.price, reason: 'adjustment',
        note: `Sincronizzazione: ${m.name} passa a ${m.to}`,
      },
      {
        league_id: leagueId, team_id: toId, amount: -m.price, reason: 'adjustment',
        note: `Sincronizzazione: ${m.name} arriva da ${m.from}`,
      },
    ]);
    await db.from('contracts').insert({
      league_id: leagueId, team_id: toId, player_id: playerIds.get(m.extId)!,
      price: m.price, acquisition_type: 'correction',
    });
  }
  if (diff.moved.length) details.push(`${diff.moved.length} cambi di squadra`);

  // 5 · nuovi in rosa
  for (const a of diff.added) {
    const toId = snap.teamIds.get(a.teamName);
    const pid = playerIds.get(a.extId);
    if (!toId || !pid) continue;
    await db.from('contracts').insert({
      league_id: leagueId, team_id: toId, player_id: pid,
      price: a.price, acquisition_type: 'correction',
    });
    await db.from('credit_movements').insert({
      league_id: leagueId, team_id: toId, amount: -a.price, reason: 'adjustment',
      note: `Sincronizzazione: ${a.name} entra in rosa per ${a.price}`,
    });
  }
  if (diff.added.length) details.push(`${diff.added.length} entrati nelle rose`);

  await db.from('audit_log').insert({
    league_id: leagueId, actor: opts.actor, action: 'roster_sync',
    payload: {
      repriced: diff.repriced.length, removed: diff.removed.length,
      moved: diff.moved.length, added: diff.added.length,
    },
  });

  return {
    ok: true,
    message: details.length ? 'Sincronizzazione completata.' : 'Non c\'era niente da cambiare.',
    details,
  };
}
