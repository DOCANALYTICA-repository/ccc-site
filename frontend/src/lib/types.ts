export type Role = "ADMIN" | "STAFF" | "FACULTY" | "STUDENT" | "MEMBER" | "GUEST";
export type InvitationStatus = "UNCONFIRMED" | "CONFIRMED" | "DECLINED" | "ARRIVED_IN_CAMPUS";
export type EventStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
export type ContactSource = "MANUAL" | "IMPORT" | "WALK_IN";

export interface AuthedUser {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface NetworkProfile {
  userId: string;
  displayName: string;
  organization: string | null;
  designation: string | null;
  headline: string | null;
  bio: string | null;
  publicEmail: string | null;
  linkedInUrl: string | null;
  discoverable: boolean;
  shareDesignation: boolean;
  shareHeadline: boolean;
  shareBio: boolean;
  shareEmail: boolean;
  shareLinkedIn: boolean;
}

export interface Tag {
  id: string;
  name: string;
}

export interface Contact {
  id: string;
  fullName: string;
  organization: string | null;
  designation: string | null;
  profileUrl: string | null;
  email: string | null;
  altEmail: string | null;
  phone: string | null;
  altPhone: string | null;
  dietaryNotes: string | null;
  notes: string | null;
  source: ContactSource;
  tags: Tag[];
  createdAt: string;
  updatedAt: string;
}

export interface EventRecord {
  id: string;
  name: string;
  description: string | null;
  venue: string | null;
  startAt: string | null;
  endAt: string | null;
  timezone: string;
  status: EventStatus;
  invitationCount?: number;
}

export interface InvitationContact {
  id: string;
  fullName: string;
  organization: string | null;
  designation: string | null;
  phone: string | null;
  email: string | null;
  dietaryNotes: string | null;
  profileUrl: string | null;
}

export interface Invitation {
  id: string;
  eventId: string;
  contactId: string;
  contact: InvitationContact;
  arrivalAt: string | null;
  departureAt: string | null;
  status: InvitationStatus;
  statusUpdatedAt: string | null;
  addedDuringEvent: boolean;
  travelMode: string | null;
  accommodation: string | null;
  notes: string | null;
}

export interface DuplicateWarning {
  field: string;
  contactId: string;
  contactName: string;
}
