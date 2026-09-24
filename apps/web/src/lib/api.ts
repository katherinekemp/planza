import type {
  CreateGroupInput,
  CreatePlanInput,
  Group,
  GroupMember,
  Invite,
  InvitePreview,
  Plan,
  PlanResponse,
  UpdateGroupInput,
  UpdatePlanInput,
  User,
} from '@planza/shared';
import { getToken } from './auth.ts';

const BASE = `${import.meta.env.VITE_API_URL ?? ''}/v1`;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  me: () => request<User>('GET', '/me'),
  updateMe: (displayName: string) => request<User>('PATCH', '/me', { displayName }),

  feed: () => request<Plan[]>('GET', '/feed'),

  groups: () => request<Group[]>('GET', '/groups'),
  group: (id: string) => request<Group>('GET', `/groups/${id}`),
  createGroup: (input: CreateGroupInput) => request<Group>('POST', '/groups', input),
  updateGroup: (id: string, input: UpdateGroupInput) =>
    request<Group>('PATCH', `/groups/${id}`, input),
  deleteGroup: (id: string) => request<void>('DELETE', `/groups/${id}`),
  members: (id: string) => request<GroupMember[]>('GET', `/groups/${id}/members`),
  setRole: (groupId: string, userId: string, role: 'admin' | 'member') =>
    request<void>('PATCH', `/groups/${groupId}/members/${userId}`, { role }),
  removeMember: (groupId: string, userId: string) =>
    request<void>('DELETE', `/groups/${groupId}/members/${userId}`),

  createInvite: (groupId: string) => request<Invite>('POST', `/groups/${groupId}/invites`),
  previewInvite: (token: string) => request<InvitePreview>('GET', `/invites/${token}`),
  acceptInvite: (token: string) => request<{ groupId: string }>('POST', `/invites/${token}/accept`),

  plans: (groupId: string, when: 'upcoming' | 'ideas' | 'past') =>
    request<Plan[]>('GET', `/groups/${groupId}/plans?when=${when}`),
  createPlan: (groupId: string, input: CreatePlanInput) =>
    request<Plan>('POST', `/groups/${groupId}/plans`, input),
  updatePlan: (id: string, input: UpdatePlanInput) => request<Plan>('PATCH', `/plans/${id}`, input),
  deletePlan: (id: string) => request<void>('DELETE', `/plans/${id}`),
  respond: (planId: string, response: PlanResponse) =>
    request<void>('PUT', `/plans/${planId}/response`, { response }),
  clearResponse: (planId: string) => request<void>('DELETE', `/plans/${planId}/response`),
};
