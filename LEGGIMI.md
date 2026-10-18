# Quaderno

Taccuino personale (cose da fare, calendario, lavori in corso, coach). Pagina statica pubblicata con GitHub Pages.
I dati stanno in Supabase, dietro login. La chiave API di Claude sta solo nei segreti di Supabase.

File
- index.html, shim.js, config.js: l'app. In config.js vanno URL e chiave "anon" del progetto Supabase.
- supabase/schema.sql: la tabella e le regole (ognuno vede solo le proprie righe).
- supabase/functions/coach/index.ts: la funzione che chiama Claude.

## Aggiornamento automatico da calendario e mail

Uno script Google (`google/sync.gs`) gira da solo nel tuo account e manda calendario e mail alla funzione `sync`
(`supabase/functions/sync`). Claude estrae gli impegni dalle mail e li scrive nel quaderno.
Servono il segreto `SYNC_SECRET` in Supabase (Edge Functions, Secrets) e "Verify JWT" spento per la funzione `sync`.
