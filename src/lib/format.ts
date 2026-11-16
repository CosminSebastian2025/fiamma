export function ageFromBirthdate(birthdate: string): number {
  const [year, month, day] = birthdate.split('-').map(Number);
  if (!year || !month || !day) return 0;
  const today = new Date();
  let age = today.getFullYear() - year;
  const beforeBirthday =
    today.getMonth() + 1 < month ||
    (today.getMonth() + 1 === month && today.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

export function parseBirthdate(input: string): string | null {
  const match = input.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`;
}

export function formatBirthdate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

export function formatListTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return formatMessageTime(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Ieri';
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays < 7) return `${diffDays}g`;
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function distanceLabel(km: number | null): string {
  if (km === null) return 'Vicino a te';
  if (km <= 1) return 'A meno di 1 km';
  return `A ${km} km`;
}

export function genderLabel(gender: string): string {
  switch (gender) {
    case 'woman':
      return 'Donna';
    case 'man':
      return 'Uomo';
    default:
      return 'Non binario';
  }
}
