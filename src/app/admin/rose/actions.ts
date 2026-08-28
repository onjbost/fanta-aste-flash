'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import { updateContractPrice, removeFromRoster, addToRoster } from '@/lib/adminEdits';
import { previewSync, applySync, type SyncPreview } from '@/lib/adminEdits';
import { parseListone, checkRosters, type ListonePlayer } from '@/lib/listone';
import { parseCsv } from '@/lib/csv';
import ExcelJS from 'exceljs';

export type EditState = { ok: boolean; message: string } | null;

async function requireAdmin() {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data: m } = await db.from('team_members')
    .select('is_admin, team_id, league_id').eq('user_id', auth.user.id).maybeSingle();
  return m?.is_admin ? { id: m.team_id, league_id: m.league_id, userId: auth.user.id } : null;
}

export async function editPrice(_prev: EditState, form: FormData): Promise<EditState> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Serve essere admin.' };
  const r = await updateContractPrice(
    String(form.get('contractId') ?? ''),
    Number(form.get('price')),
    admin.userId,
    String(form.get('note') ?? '').trim(),
  );
  revalidatePath('/admin/rose');
  revalidatePath('/');
  return r;
}

export async function removePlayer(_prev: EditState, form: FormData): Promise<EditState> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Serve essere admin.' };
  const r = await removeFromRoster(
    String(form.get('contractId') ?? ''),
    form.get('refund') === 'on',
    admin.userId,
    String(form.get('note') ?? '').trim(),
  );
  revalidatePath('/admin/rose');
  revalidatePath('/');
  return r;
}

export async function addPlayer(_prev: EditState, form: FormData): Promise<EditState> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Serve essere admin.' };
  const r = await addToRoster(
    String(form.get('teamId') ?? ''),
    String(form.get('playerId') ?? ''),
    Number(form.get('price')),
    admin.userId,
    String(form.get('note') ?? '').trim(),
  );
  revalidatePath('/admin/rose');
  revalidatePath('/');
  return r;
}

// ------------------------------------------------------- import da file

export type SyncState = {
  ok: boolean;
  message: string;
  preview?: SyncPreview;
  checks?: ReturnType<typeof checkRosters>;
  applied?: string[];
} | null;

async function readUpload(file: File): Promise<ListonePlayer[]> {
  const bytes = await file.arrayBuffer();
  if (file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.txt')) {
    return parseListone(parseCsv(new TextDecoder('utf-8').decode(bytes))).players;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.worksheets[0];
  const grid: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cell.value == null ? '' : String(
        typeof cell.value === 'object' && 'result' in cell.value
          ? (cell.value as { result: unknown }).result ?? ''
          : cell.value,
      ).trim();
    });
    grid.push(Array.from(cells, (c) => c ?? ''));
  });
  return parseListone(grid).players;
}

/**
 * Un solo punto d'ingresso per il file: la prima volta mostra le differenze,
 * la seconda — con la conferma spuntata — le applica. Il file resta nel campo
 * del browser tra i due passaggi, quindi non va ricaricato.
 */
export async function syncFromFile(_prev: SyncState, form: FormData): Promise<SyncState> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Serve essere admin.' };

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Scegli il file esportato dalla lega.' };
  }

  let players: ListonePlayer[];
  try {
    players = await readUpload(file);
  } catch (e) {
    return { ok: false, message: `Non riesco a leggerlo: ${(e as Error).message}` };
  }
  if (players.length === 0) return { ok: false, message: 'Il file non contiene giocatori riconoscibili.' };

  const preview = await previewSync(admin.league_id, players);
  const checks = checkRosters(players);

  const confirm = form.get('confirm') === 'on';
  if (!confirm) {
    return {
      ok: true,
      message: `${players.length} giocatori letti. Controlla le differenze, poi conferma per applicarle.`,
      preview, checks,
    };
  }

  if (preview.unknownTeams.length > 0) {
    return {
      ok: false,
      message: `Nel file ci sono squadre che non conosco: ${preview.unknownTeams.join(', ')}. Correggi i nomi prima di applicare.`,
      preview, checks,
    };
  }

  const result = await applySync(admin.league_id, players, {
    rosters: form.get('rosters') === 'on',
    actor: admin.userId,
  });

  revalidatePath('/admin/rose');
  revalidatePath('/listone');
  revalidatePath('/');
  return { ok: result.ok, message: result.message, applied: result.details, checks };
}
