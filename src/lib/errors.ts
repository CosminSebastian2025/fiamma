const translations: Record<string, string> = {
  Email: 'Inserisci la tua email',
  'Email rate limit exceeded': 'Troppi tentativi: attendi qualche minuto e riprova.',
  'Token has expired or is invalid': 'Codice non valido o scaduto.',
  'Invalid login credentials': 'Credenziali non valide.',
  'User already registered': 'Esiste già un account con questa email.',
  'Failed to fetch': 'Connessione assente o Supabase non raggiungibile.',
  not_authenticated: 'Sessione scaduta: accedi di nuovo.',
  'new row violates row-level security policy': 'Operazione non consentita.',
  'duplicate key value violates unique constraint': 'Elemento già presente.',
  'JWT expired': 'Sessione scaduta: accedi di nuovo.',
};

export function errorMessage(error: unknown, fallback = 'Qualcosa è andato storto. Riprova.'): string {
  let message = '';
  if (error instanceof Error) message = error.message;
  else if (typeof error === 'string') message = error;
  if (!message) return fallback;

  const key = Object.keys(translations).find((candidate) => message.includes(candidate));
  if (key) return translations[key];

  if (/rate limit/i.test(message)) return 'Troppi tentativi: attendi qualche minuto e riprova.';
  return message;
}
