import { z } from 'zod';

// Enums shared by the database, API, and web app.
export const RESPONSES = ['going', 'maybe', 'interested', 'cant'] as const;
export const ROLES = ['owner', 'admin', 'member'] as const;
export const PERMISSION_LEVELS = ['all_members', 'admins'] as const;

export type PlanResponse = (typeof RESPONSES)[number];
export type Role = (typeof ROLES)[number];
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

// ---- Request bodies ----

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
});

export const updateGroupSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  whoCanPost: z.enum(PERMISSION_LEVELS).optional(),
  whoCanInvite: z.enum(PERMISSION_LEVELS).optional(),
});

export const createPlanSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(200).optional(),
  // Omitted or null means the plan is just an idea.
  startsAt: z.iso.datetime({ offset: true }).nullable().optional(),
});

export const updatePlanSchema = createPlanSchema.partial();

export const respondSchema = z.object({
  response: z.enum(RESPONSES),
});

export const updateMeSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type RespondInput = z.infer<typeof respondSchema>;

// ---- Response shapes (what the API returns as JSON) ----

export interface User {
  id: string;
  email: string;
  displayName: string;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  whoCanPost: PermissionLevel;
  whoCanInvite: PermissionLevel;
  myRole: Role;
  memberCount: number;
  createdAt: string;
}

export interface GroupMember {
  userId: string;
  displayName: string;
  role: Role;
  joinedAt: string;
}

export interface Plan {
  id: string;
  groupId: string;
  groupName: string;
  author: { id: string; displayName: string };
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string | null;
  createdAt: string;
  responses: { userId: string; displayName: string; response: PlanResponse }[];
  myResponse: PlanResponse | null;
}

export interface Invite {
  id: string;
  token: string;
  expiresAt: string;
}

export interface InvitePreview {
  groupId: string;
  groupName: string;
  memberCount: number;
  alreadyMember: boolean;
}
