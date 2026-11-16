# Fiamma

App di dating cross-platform (iOS, Android, web) costruita con Expo + Supabase.
Il repository contiene una MVP funzionante: autenticazione, onboarding con foto,
discovery geolocalizzata, swipe con match reciproco, chat realtime con regali e
sticker, monete digitali, blocco e segnalazione, cancellazione account.

## Stack

- **Client**: Expo SDK 58, React Native 0.88, TypeScript, Expo Router
- **Backend**: Supabase (Postgres + PostGIS, Auth, Realtime, Edge Functions)
- **Foto**: salvate solo nella memoria del dispositivo (nessun cloud); resize e strip EXIF lato client
- **Stato**: React Context per l'autenticazione, fetch diretti tipizzati

## Struttura

```
src/
  app/                 route Expo Router
    (tabs)/            discover, matches, profile
    chat/[matchId].tsx conversazione
    coins.tsx          portafoglio monete
    onboarding.tsx     profilo + foto
    sign-in.tsx        OTP via email
  components/          UI condivisa
  lib/                 API, tipi, auth, storage, tema
supabase/
  migrations/0001_init.sql   schema, RLS, RPC, seed interessi
  migrations/0002_coins.sql  monete, regali, sticker
  functions/delete-account/  cancellazione account
  functions/stripe-coin-checkout/  checkout pacchetti monete
  functions/stripe-webhook/        accredito monete dopo il pagamento
```

## 1. Supabase

1. Crea un progetto su [supabase.com](https://supabase.com) (piano Free sufficiente per l'MVP).
2. Applica la migrazione. Con la CLI:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

In alternativa incolla in ordine `supabase/migrations/0001_init.sql` e
`supabase/migrations/0002_coins.sql` nello SQL Editor. La prima abilita PostGIS,
crea tabelle, policy RLS, RPC e 24 interessi; la seconda aggiunge monete digitali,
regali e sticker.

### Template email per il codice OTP

L'app usa un codice a 6 cifre, non il magic link. In **Authentication → Email
Templates → Magic Link** aggiungi il token al corpo, ad esempio:

```html
<p>Il tuo codice Fiamma è <strong>{{ .Token }}</strong></p>
```

Senza `{{ .Token }}` l'utente riceve solo un link e non può inserire il codice.

### URL di redirect

In **Authentication → URL Configuration** imposta il Site URL su
`http://localhost:8081` in sviluppo e aggiungi gli URL di produzione.

## 2. Foto locali

Le foto del profilo non vengono caricate su alcun servizio: restano nella memoria
del dispositivo.

- **iOS/Android**: i file JPEG vengono salvati nella directory documenti dell'app
  (`expo-file-system`) e mappati su una chiave `<user_id>/local/<uuid>.jpg`
  conservata in AsyncStorage.
- **Web**: la foto viene salvata come data URL in localStorage, quindi vale il
  limite di circa 5 MB del browser (bastano poche foto per raggiungerlo).

Il database conserva solo la riga `profile_photos` con la chiave: serve a
`complete_onboarding` e alla gestione dell'ordine. Nessun altro utente può
vedere le foto, quindi discovery, match e chat mostrano le iniziali come
segnaposto. La cancellazione account rimuove anche i file locali.

Non servono secret, bucket o funzioni Edge per le foto. Il resize a 1200 px e la
ricodifica JPEG avvengono sul client e rimuovono i metadati EXIF (incluso il GPS)
prima del salvataggio.

### Tornare a uno storage condiviso

Se in futuro le foto devono essere visibili agli altri utenti, serve uno storage
cloud (Cloudflare R2, Supabase Storage o S3) con URL firmati: il client oggi
ignora le chiavi ricevute da `get_deck`/`get_matches`.

## 3. Pagamenti monete (Stripe)

Gli acquisti dei pacchetti monete passano da Stripe Checkout **solo su web**.
Su iOS e Android servono gli acquisti in-app dello store, perché le regole
Apple/Google vietano il checkout esterno per i beni digitali: lì il pulsante
resta disattivato.

1. Crea prodotto e prezzi una tantum nel sandbox:

```bash
stripe login
npm run stripe:catalog:dry   # verifica configurazione e prezzi
npm run stripe:catalog       # crea/aggiorna Fiamma Coins e i 4 prezzi
```

Lookup key: `coins_starter`, `coins_popular`, `coins_value`, `coins_pro`.
Se cambi un prezzo nella migrazione, aggiornalo anche nello script oppure passa
`STRIPE_COINS_STARTER_AMOUNT`, `STRIPE_COINS_POPULAR_AMOUNT`,
`STRIPE_COINS_VALUE_AMOUNT`, `STRIPE_COINS_PRO_AMOUNT` in centesimi.

2. Secret delle funzioni:

```bash
npx supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  APP_URL=http://localhost:8081
```

`APP_URL` è la URL web dell'app: dopo il pagamento Stripe riporta su `/coins`.
In produzione usa il dominio pubblico.

3. Deploy:

```bash
npx supabase functions deploy stripe-coin-checkout
npx supabase functions deploy stripe-webhook --no-verify-jwt
```

Il webhook non può usare il JWT utente: la firma Stripe è l'autenticazione.

4. In Stripe → Developers → Webhooks aggiungi l'endpoint
`https://<project-ref>.supabase.co/functions/v1/stripe-webhook` per gli eventi
`checkout.session.completed` e `checkout.session.async_payment_succeeded`, poi
copia il signing secret in `STRIPE_WEBHOOK_SECRET`.

In locale puoi inoltrare gli eventi:

```bash
stripe listen --forward-to https://<project-ref>.supabase.co/functions/v1/stripe-webhook
```

L'accredito è idempotente: `credit_coin_purchase` usa `checkout.session.id` come
`provider_ref` e ignora i duplicati. Se l'accredito fallisce il webhook risponde
500, così Stripe ritenta.

## 4. App

```bash
cp .env.example .env
# compila EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY
npm install
npx expo start
```

Senza `.env` l'app mostra una schermata di configurazione invece di crashare.

## 5. Web su Cloudflare Pages

Il web usa Expo Router in modalità SPA (`web.output = "single"` in `app.json`).

1. Build locale:

```bash
npm run build:web
```

L'output è nella cartella `dist/`.

2. Su Cloudflare Pages crea un progetto collegato al repository GitHub
   `CosminSebastian2025/fiamma` (branch `master`) e imposta:

   - **Build command**: `npm run build:web`
   - **Build output directory**: `dist`
   - **Root directory**: vuota (root del repository)
   - **Node version**: variabile `NODE_VERSION=22`

3. Aggiungi le variabili d'ambiente di build (Production e Preview):

```text
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_MAX_DISTANCE_KM=50
```

I valori `EXPO_PUBLIC_*` vengono incorporati nel bundle al momento della build:
dopo averli cambiati serve un nuovo deploy.

4. Le route profonde (`/chat/...`, `/discover`, ...) funzionano senza regole
   aggiuntive. Cloudflare Pages serve automaticamente la root per le route SPA
   quando non esiste un `404.html` di primo livello. Non aggiungere
   `/* /index.html 200` a `_redirects`: Cloudflare lo interpreta come un loop
   infinito e scarta la regola. Per questo `public/_redirects` contiene solo un
   commento e non va creato un `404.html` alla root.

5. Dopo il primo deploy, aggiorna:

   - **Supabase → Authentication → URL Configuration**: aggiungi l'URL
     `https://<progetto>.pages.dev` (e l'eventuale dominio custom).
   - **Supabase Edge Functions**: `npx supabase secrets set APP_URL=https://<progetto>.pages.dev`
     così Stripe torna su `/coins` dopo il pagamento.

6. Verifica locale della build di produzione:

```bash
npm run build:web
npx -y wrangler@latest pages dev dist --port 8091
```

`npx expo serve` non applica il fallback SPA di Pages: per il test locale usa
`wrangler pages dev dist`.

## Sicurezza implementata

- RLS su tutte le tabelle: nessuna tabella è leggibile in anonimo.
- Scritture sensibili (like, match, posizione, foto, blocchi, report) solo via
  RPC `SECURITY DEFINER`; il client non può forgiare match o coordinate.
- `profiles`, `profile_photos`, `matches` e `messages` visibili solo a chi è
  coinvolto in un match.
- Le coordinate esatte non escono mai dal DB: `get_deck` restituisce solo la
  distanza arrotondata in km.
- Le foto vengono ricodificate a 1200 px JPEG lato client: i metadati EXIF
  (incluso il GPS) vengono rimossi prima del salvataggio sul dispositivo.
- Le foto non lasciano il dispositivo: nessun URL pubblico o condivisibile.
- Limite di 100 like al giorno per utente, imposto nel DB.
- Blocco e segnalazione bloccano anche l'invio di nuovi messaggi a livello RLS.
- Messaggi limitati a 2000 caratteri nel DB, non solo nella UI.
- Le monete vivono in un ledger immutabile: saldo, regali e sblocchi passano solo
  da RPC atomiche. Il client può inserire esclusivamente messaggi di testo, quindi
  non può inviare regali o sticker senza pagarne il costo.

## Limiti noti / prossimi passi

- **Push notifications**: tabella `devices` pronta, invio non ancora implementato.
- **Moderazione automatica**: con le foto solo locali non c'è nulla da moderare
  lato server; la coda `reports` è pensata per la revisione manuale di profili e
  messaggi. Se in futuro le foto tornano sul cloud, aggiungere un modello NSFW
  open-source (es. NSFWJS) in una Edge Function.
- **Admin**: per l'MVP usare Supabase Studio (tabella `reports`). Un pannello
  separato è il passo successivo.
- **Abbonamenti**: non inclusi; integrare RevenueCat con webhook verso una
  Edge Function.
- **Acquisto monete**: Stripe Checkout attivo su web con webhook idempotente.
  Su iOS e Android mancano gli acquisti in-app (RevenueCat/StoreKit/Play Billing).
  Ogni nuovo utente riceve un bonus di benvenuto di 50 monete.
- **Rimborsi monete**: non implementati. Decidere la politica e, se serve, gestire
  `charge.refunded` con una RPC service-role che storni il saldo.
- **Recupero password / login social**: l'accesso è solo OTP email. Google e
  Apple richiedono un development build e la configurazione OAuth.
- **Videochiamate**: richiedono WebRTC e un relay TURN.
- **Foto locali**: non sono visibili agli altri utenti e non seguono l'account su
  un altro dispositivo. Per condividerle serve uno storage cloud.
- **Web e foto**: il salvataggio in localStorage è limitato a circa 5 MB; su web
  conviene usare meno foto o passare a IndexedDB/Storage.

## Comandi utili

```bash
npx tsc --noEmit        # typecheck
npx expo lint           # lint
npx expo-doctor         # diagnostica dipendenze/config
npx expo start --web    # smoke test nel browser
```

## Pubblicazione

Servono Apple Developer (99 $/anno) e Google Play (25 $ una tantum). Prima
dell'invio: privacy policy, EULA, età minima 18+, moderazione UGC e
cancellazione account in-app (tutti requisiti di App Store 1.2 e Google Play
UGC policy). Gli abbonamenti digitali devono passare da StoreKit/Play Billing.
