export type Gender = 'woman' | 'man' | 'nonbinary';
export type SwipeDecision = 'like' | 'pass';
export type ReportReason =
  | 'harassment'
  | 'fake_profile'
  | 'underage'
  | 'nudity'
  | 'spam'
  | 'other';

export interface Profile {
  id: string;
  display_name: string;
  birthdate: string;
  gender: Gender;
  seeking: Gender[];
  bio: string;
  city: string | null;
  job_title: string | null;
  is_onboarded: boolean;
  last_active_at: string;
  created_at: string;
  updated_at: string;
}

export interface ProfilePhoto {
  id: string;
  user_id: string;
  storage_key: string;
  position: number;
  moderation_status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface Interest {
  id: number;
  label: string;
}

export interface DeckPhoto {
  id: string;
  key: string;
}

export interface DeckProfile {
  id: string;
  display_name: string;
  birthdate: string;
  bio: string;
  city: string | null;
  job_title: string | null;
  interests: string[];
  photos: DeckPhoto[];
  distance_km: number | null;
  photoUrls: string[];
}

export interface MatchRow {
  match_id: string;
  partner_id: string;
  display_name: string;
  birthdate: string;
  photo_key: string | null;
  last_message_at: string | null;
  last_message: string | null;
  unread_count: number;
  matched_at: string;
  photoUrl: string | null;
}

export interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface ProfileDraft {
  displayName: string;
  birthdate: string;
  gender: Gender;
  seeking: Gender[];
  bio: string;
  city: string;
  jobTitle: string;
}
