'use client';

import { useState } from 'react';

export function CopySql({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="msgcard">
      <div className="msgcard-head">
        <span>Comando per Supabase</span>
        <button type="button" onClick={copy}>{copied ? 'Copiato ✓' : 'Copia'}</button>
      </div>
      <pre className="msgcard-body">{sql}</pre>
    </div>
  );
}
