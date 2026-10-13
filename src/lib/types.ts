// Shapes returned by the Render72 Events API.
// https://render72.pages.dev/api/test/events and /api/test/events/{id}

export type EventType = 'EVENT' | 'WORKSHOP';
export type EventMode = 'OFFLINE' | 'ONLINE';
export type EventStatus = 'ACTIVE' | 'COMPLETED' | 'CLOSED';
export type RegistrationStatus = 'OPEN' | 'CLOSED' | 'SOLD_OUT';

export interface ScheduleSummary {
  start_date: string; // YYYY-MM-DD, IST
  start_time: string; // HH:MM, IST
  end_date: string;
  end_time: string;
}

export interface Session {
  event_date: string;
  start_time: string;
  end_time: string;
  venue: string;
}

export interface Prize {
  rank: number | null;
  title: string;
  amount: number;
  description: string;
}

export interface Faq {
  question: string;
  answer: string;
}

export interface Organizer {
  id: string;
  name: string;
  org_type: string;
}

export interface Coordinator {
  id: string;
  name: string;
  role: string;
  contact: string;
}

export interface EventSummary {
  id: string;
  name: string;
  blurb: string;
  cover_image_url: string;
  cover_image_alt: string;
  category: string;
  tags: string[];
  event_type: EventType;
  event_mode: EventMode;
  event_status: EventStatus;
  is_featured: boolean;
  is_technical: boolean;
  price: number;
  is_per_head: boolean;
  min_teamsize: number;
  max_teamsize: number;
  total_seats: number;
  seats_filled: number;
  registration_status: RegistrationStatus;
  registration_deadline: string; // ISO 8601 with +05:30
  schedule_summary: ScheduleSummary;
}

export interface EventDetail extends EventSummary {
  description: string;
  banner_image_url: string;
  banner_image_alt: string;
  gallery_images: string[];
  highlights: string[];
  what_to_expect: string[];
  eligibility: string[];
  prerequisites: string[];
  rules: string[];
  prizes: Prize[];
  faqs: Faq[];
  schedules: Session[];
  organizers: Organizer[];
  coordinators: Coordinator[];
}

/** The fields that change while the site is live; the browser refreshes these from the API. */
export type LiveFields = Pick<
  EventSummary,
  'id' | 'event_status' | 'registration_status' | 'seats_filled' | 'total_seats' | 'registration_deadline'
>;
