# Fiamma

App di dating cross-platform (iOS, Android, web) costruita con Expo + Supabase.
Il repository contiene una MVP funzionante: autenticazione, onboarding con foto,
discovery geolocalizzata, swipe con match reciproco, chat realtime con regali e
sticker, monete digitali, blocco e segnalazione, cancellazione account.

## Stack

- **Client**: Expo SDK 58, React Native 0.88, TypeScript, Expo Router
- **Backend**: Supabase (Postgres + PostGIS, Auth, Realtime, Edge Functions)
- **Foto**: Cloudflare R2 con URL firmati; resize e strip EXIF lato client
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
  functions/r2-sign/         URL firmati R2
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

## 2. Cloudflare R2

1. Crea un bucket privato e un token API con permesso Object Read & Write.
2. Configura il CORS del bucket (necessario per l'upload dal client):

```json
[
  {
    "AllowedOrigins": ["http://localhost:8081", "https://tuo-dominio.it"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

3. Aggiungi una lifecycle rule che elimini gli oggetti dopo N giorni: le foto
   rimosse dall'app lasciano il file su R2, perché la funzione firma solo URL.
4. Imposta i secret delle Edge Functions:

```bash
npx supabase secrets set \
  R2_ACCOUNT_ID=... \
  R2_BUCKET=fiamma-photos \
  R2_ACCESS_KEY_ID=... \
  R2_SECRET_ACCESS_KEY=...
```

5. Deploy delle funzioni:

```bash
npx supabase functions deploy r2-sign
npx supabase functions deploy delete-account
```

`r2-sign` verifica il JWT dell'utente e consente il PUT solo sotto il prefisso
`<user_id>/`. `delete-account` usa la service role key già iniettata da Supabase.

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

## Sicurezza implementata

- RLS su tutte le tabelle: nessuna tabella è leggibile in anonimo.
- Scritture sensibili (like, match, posizione, foto, blocchi, report) solo via
  RPC `SECURITY DEFINER`; il client non può forgiare match o coordinate.
- `profiles`, `profile_photos`, `matches` e `messages` visibili solo a chi è
  coinvolto in un match.
- Le coordinate esatte non escono mai dal DB: `get_deck` restituisce solo la
  distanza arrotondata in km.
- Le foto vengono ricodificate a 1200 px JPEG lato client: i metadati EXIF
  (incluso il GPS) vengono rimossi prima dell'upload.
- URL firmati con scadenza 1 ora; bucket privato.
- Limite di 100 like al giorno per utente, imposto nel DB.
- Blocco e segnalazione bloccano anche l'invio di nuovi messaggi a livello RLS.
- Messaggi limitati a 2000 caratteri nel DB, non solo nella UI.
- Le monete vivono in un ledger immutabile: saldo, regali e sblocchi passano solo
  da RPC atomiche. Il client può inserire esclusivamente messaggi di testo, quindi
  non può inviare regali o sticker senza pagarne il costo.

## Limiti noti / prossimi passi

- **Push notifications**: tabella `devices` pronta, invio non ancora implementato.
- **Moderazione automatica**: le foto sono approvate al primo caricamento; la
  coda `reports` è pensata per la revisione manuale. Aggiungere un modello
  NSFW open-source (es. NSFWJS) in una Edge Function.
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
- **R2 orfani**: la lifecycle rule è la soluzione; in alternativa aggiungere
  un endpoint DELETE firmato alla funzione.

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
