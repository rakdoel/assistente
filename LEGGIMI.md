# Quaderno

Taccuino personale (cose da fare, calendario, lavori in corso, coach). Pagina statica pubblicata con GitHub Pages.
I dati stanno in Supabase, dietro login. La chiave API di Claude sta solo nei segreti di Supabase.

File
- index.html, shim.js, config.js: l'app. In config.js vanno URL e chiave "anon" del progetto Supabase.
- supabase/schema.sql: la tabella e le regole (ognuno vede solo le proprie righe).
- supabase/functions/coach/index.ts: la funzione che chiama Claude.
