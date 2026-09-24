import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Group, InvitePreview, Plan } from '@planza/shared';
import { buildApp } from '../src/app.ts';
import { db, sqlClient } from '../src/db/client.ts';

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp(db, { logger: false });
});
afterAll(async () => {
  await app.close();
  await sqlClient.end();
});

// Small helper: make a request as a given user.
function as(email: string) {
  const call = async <T = unknown>(method: string, url: string, payload?: object) => {
    const res = await app.inject({
      method: method as 'GET',
      url,
      payload,
      headers: { authorization: `Bearer dev:${email}` },
    });
    return { status: res.statusCode, body: (res.body ? res.json() : undefined) as T };
  };
  return {
    get: <T>(url: string) => call<T>('GET', url),
    post: <T>(url: string, body?: object) => call<T>('POST', url, body ?? {}),
    put: <T>(url: string, body: object) => call<T>('PUT', url, body),
    patch: <T>(url: string, body: object) => call<T>('PATCH', url, body),
    del: <T>(url: string) => call<T>('DELETE', url),
  };
}

const alice = as('alice@example.com');
const bob = as('bob@example.com');
const eve = as('eve@example.com');

describe('Planza API', () => {
  it('rejects requests without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me' });
    expect(res.statusCode).toBe(401);
  });

  it('runs the core flow: group → invite → plan → RSVP', async () => {
    // Alice creates a group and is its owner.
    const created = await alice.post<Group>('/v1/groups', { name: 'Taco Tuesday Crew' });
    expect(created.status).toBe(201);
    expect(created.body.myRole).toBe('owner');
    const groupId = created.body.id;

    // Bob can't see it yet (404, not 403, so the group's existence isn't leaked).
    expect((await bob.get(`/v1/groups/${groupId}`)).status).toBe(404);

    // Alice makes an invite link; Bob previews and accepts it.
    const invite = await alice.post<{ token: string }>(`/v1/groups/${groupId}/invites`);
    expect(invite.status).toBe(201);
    const preview = await bob.get<InvitePreview>(`/v1/invites/${invite.body.token}`);
    expect(preview.body).toMatchObject({ groupName: 'Taco Tuesday Crew', alreadyMember: false });
    expect((await bob.post(`/v1/invites/${invite.body.token}/accept`)).status).toBe(200);
    expect((await bob.get<Group[]>('/v1/groups')).body.map((g) => g.id)).toContain(groupId);

    // Bob posts an idea (no date), then a dated plan.
    const idea = await bob.post<Plan>(`/v1/groups/${groupId}/plans`, {
      title: 'Try the new ramen place',
    });
    expect(idea.status).toBe(201);
    expect(idea.body.startsAt).toBeNull();

    const startsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const plan = await bob.post<Plan>(`/v1/groups/${groupId}/plans`, { title: 'Tacos', startsAt });
    expect(plan.status).toBe(201);

    // Ideas and upcoming plans are listed separately.
    const ideas = await alice.get<Plan[]>(`/v1/groups/${groupId}/plans?when=ideas`);
    expect(ideas.body.map((p) => p.title)).toEqual(['Try the new ramen place']);
    const upcoming = await alice.get<Plan[]>(`/v1/groups/${groupId}/plans?when=upcoming`);
    expect(upcoming.body.map((p) => p.title)).toEqual(['Tacos']);

    // Alice RSVPs; changing her answer overwrites rather than duplicates.
    await alice.put(`/v1/plans/${plan.body.id}/response`, { response: 'maybe' });
    await alice.put(`/v1/plans/${plan.body.id}/response`, { response: 'going' });
    const loaded = await alice.get<Plan>(`/v1/plans/${plan.body.id}`);
    expect(loaded.body.myResponse).toBe('going');
    expect(loaded.body.responses).toHaveLength(1);

    // The plan shows up in Alice's cross-group feed.
    const feed = await alice.get<Plan[]>('/v1/feed');
    expect(feed.body.map((p) => p.id)).toContain(plan.body.id);

    // Turning the idea into a real plan by giving it a date.
    const promoted = await bob.patch<Plan>(`/v1/plans/${idea.body.id}`, { startsAt });
    expect(promoted.body.startsAt).not.toBeNull();

    // Outsiders can't see plans.
    expect((await eve.get(`/v1/plans/${plan.body.id}`)).status).toBe(404);
  });

  it('enforces group settings', async () => {
    const { body: group } = await alice.post<Group>('/v1/groups', { name: 'Admins only' });
    await alice.patch(`/v1/groups/${group.id}`, { whoCanPost: 'admins', whoCanInvite: 'admins' });
    const { body: invite } = await alice.post<{ token: string }>(`/v1/groups/${group.id}/invites`);
    await bob.post(`/v1/invites/${invite.token}/accept`);

    // Bob is a regular member, so he can't post, invite, or change settings.
    expect((await bob.post(`/v1/groups/${group.id}/plans`, { title: 'Hi' })).status).toBe(403);
    expect((await bob.post(`/v1/groups/${group.id}/invites`)).status).toBe(403);
    expect((await bob.patch(`/v1/groups/${group.id}`, { name: 'Mine now' })).status).toBe(403);

    // Once promoted to admin, he can.
    await alice.patch(
      `/v1/groups/${group.id}/members/${(await bob.get<{ id: string }>('/v1/me')).body.id}`,
      {
        role: 'admin',
      },
    );
    expect((await bob.post(`/v1/groups/${group.id}/plans`, { title: 'Hi' })).status).toBe(201);
  });

  it('rejects revoked invites and invalid input', async () => {
    const { body: group } = await alice.post<Group>('/v1/groups', { name: 'Revoked' });
    const { body: invite } = await alice.post<{ id: string; token: string }>(
      `/v1/groups/${group.id}/invites`,
    );
    await alice.del(`/v1/invites/${invite.id}`);
    expect((await eve.post(`/v1/invites/${invite.token}/accept`)).status).toBe(404);

    expect((await alice.post('/v1/groups', { name: '' })).status).toBe(400);
    expect((await alice.get('/v1/groups/not-a-uuid')).status).toBe(400);
  });
});
