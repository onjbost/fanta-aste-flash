'use client';

import { useActionState } from 'react';
import {
  adminOpenRoom, adminOpenLot, adminCloseLot, adminCloseSession, type ActionState,
} from '../actions';
import type { LotView } from './AuctionRoom';

export function RoomControls({ sessionId, isLive, lots }: {
  sessionId: string; isLive: boolean; lots: LotView[];
}) {
  const [openState, doOpenRoom, openingRoom] = useActionState<ActionState, FormData>(adminOpenRoom, null);
  const [lotState, doOpenLot, openingLot] = useActionState<ActionState, FormData>(adminOpenLot, null);
  const [closeState, doCloseLot, closingLot] = useActionState<ActionState, FormData>(adminCloseLot, null);
  const [endState, doCloseSession, ending] = useActionState<ActionState, FormData>(adminCloseSession, null);

  const next = lots.find((l) => l.status === 'called');
  const live = lots.find((l) => l.status === 'live');
  const state = openState ?? lotState ?? closeState ?? endState;

  return (
    <div className="panel" style={{ padding: 16, marginBottom: 20, background: 'var(--surface-2)' }}>
      <p className="eyebrow" style={{ margin: '0 0 10px' }}>Regia · solo admin</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {!isLive && (
          <form action={doOpenRoom}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <button className="primary" disabled={openingRoom}>
              {openingRoom ? 'Apro…' : 'Apri la sala'}
            </button>
          </form>
        )}

        {isLive && next && !live && (
          <form action={doOpenLot}>
            <input type="hidden" name="lotId" value={next.id} />
            <button className="primary" disabled={openingLot}>
              {openingLot ? 'Apro…' : `Apri lotto ${next.index} · ${next.player.name}`}
            </button>
          </form>
        )}

        {isLive && live && (
          <form action={doCloseLot}>
            <input type="hidden" name="lotId" value={live.id} />
            <button disabled={closingLot} style={{ color: 'var(--crit)', borderColor: 'var(--crit)' }}>
              {closingLot ? 'Chiudo…' : 'Chiudi subito il lotto'}
            </button>
          </form>
        )}

        {isLive && !next && !live && (
          <form action={doCloseSession}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <button className="primary" disabled={ending}>
              {ending ? 'Chiudo…' : 'Chiudi la serata'}
            </button>
          </form>
        )}
      </div>

      {state && (
        <div className={state.ok ? 'callout' : 'callout crit'} role="status" style={{ marginBottom: 0 }}>
          {state.message}
        </div>
      )}
    </div>
  );
}
