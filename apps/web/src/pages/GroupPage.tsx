import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { Group, PermissionLevel } from '@planza/shared';
import { api } from '../lib/api.ts';
import { PlanCard } from '../components/PlanCard.tsx';
import { PlanForm } from '../components/PlanForm.tsx';
import {
  Button,
  Card,
  Empty,
  ErrorText,
  Input,
  Label,
  Loading,
  Textarea,
} from '../components/ui.tsx';

type Tab = 'upcoming' | 'ideas' | 'past' | 'members' | 'settings';

const isAdmin = (g: Group) => g.myRole === 'owner' || g.myRole === 'admin';

export function GroupPage() {
  const { groupId = '' } = useParams();
  const [tab, setTab] = useState<Tab>('upcoming');
  const group = useQuery({ queryKey: ['groups', groupId], queryFn: () => api.group(groupId) });

  if (group.isPending) return <Loading />;
  if (group.error) return <ErrorText error={group.error} />;
  const g = group.data;

  const tabs: [Tab, string][] = [
    ['upcoming', 'Upcoming'],
    ['ideas', 'Ideas'],
    ['past', 'Past'],
    ['members', `Members (${g.memberCount})`],
    ...(isAdmin(g) ? [['settings', 'Settings'] as [Tab, string]] : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{g.name}</h1>
          {g.description && <p className="text-stone-600">{g.description}</p>}
        </div>
        <InviteButton group={g} />
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-stone-200">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
              tab === key
                ? 'border-brand-500 font-medium text-stone-900'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {(tab === 'upcoming' || tab === 'ideas' || tab === 'past') && (
        <PlanList group={g} when={tab} />
      )}
      {tab === 'members' && <Members group={g} />}
      {tab === 'settings' && <Settings group={g} />}
    </div>
  );
}

function PlanList({ group, when }: { group: Group; when: 'upcoming' | 'ideas' | 'past' }) {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  const [composing, setComposing] = useState(false);
  const plans = useQuery({
    queryKey: ['plans', group.id, when],
    queryFn: () => api.plans(group.id, when),
  });
  const canPost = group.whoCanPost === 'all_members' || isAdmin(group);

  return (
    <div className="space-y-3">
      {when !== 'past' &&
        canPost &&
        (composing ? (
          <Card>
            <PlanForm
              submitLabel="Post"
              onCancel={() => setComposing(false)}
              onSubmit={async (input) => {
                await api.createPlan(group.id, input);
                await queryClient.invalidateQueries({ queryKey: ['plans'] });
                setComposing(false);
              }}
            />
          </Card>
        ) : (
          <Button onClick={() => setComposing(true)}>+ Suggest a plan</Button>
        ))}

      {plans.isPending ? (
        <Loading />
      ) : plans.data?.length ? (
        plans.data.map((p) => (
          <PlanCard key={p.id} plan={p} canEdit={p.author.id === me.data?.id || isAdmin(group)} />
        ))
      ) : (
        <Empty>
          {when === 'upcoming' && 'Nothing on the calendar yet.'}
          {when === 'ideas' &&
            'No ideas yet. Post something without a date to float it by the group.'}
          {when === 'past' && 'No past plans yet.'}
        </Empty>
      )}
      <ErrorText error={plans.error} />
    </div>
  );
}

function InviteButton({ group }: { group: Group }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const create = useMutation({
    mutationFn: () => api.createInvite(group.id),
    onSuccess: (invite) => setLink(`${window.location.origin}/join/${invite.token}`),
  });
  if (group.whoCanInvite === 'admins' && !isAdmin(group)) return null;

  if (!link) {
    return (
      <Button variant="secondary" onClick={() => create.mutate()} disabled={create.isPending}>
        🔗 Invite friends
      </Button>
    );
  }
  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <Input readOnly value={link} className="sm:w-72" onFocus={(e) => e.target.select()} />
      <Button
        variant="secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(link);
          setCopied(true);
        }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </Button>
    </div>
  );
}

function Members({ group }: { group: Group }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  const members = useQuery({
    queryKey: ['groups', group.id, 'members'],
    queryFn: () => api.members(group.id),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['groups', group.id] });

  const setRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'admin' | 'member' }) =>
      api.setRole(group.id, userId, role),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api.removeMember(group.id, userId),
    onSuccess: (_, userId) => {
      if (userId === me.data?.id) {
        queryClient.invalidateQueries({ queryKey: ['groups'] });
        navigate('/');
      } else refresh();
    },
  });

  return (
    <div className="space-y-2">
      {members.data?.map((m) => {
        const isMe = m.userId === me.data?.id;
        return (
          <Card key={m.userId} className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">
                {m.displayName} {isMe && <span className="text-stone-400">(you)</span>}
              </p>
              <p className="text-xs capitalize text-stone-500">{m.role}</p>
            </div>
            <div className="flex gap-1">
              {group.myRole === 'owner' && !isMe && (
                <Button
                  variant="ghost"
                  className="px-2 py-1"
                  onClick={() =>
                    setRole.mutate({
                      userId: m.userId,
                      role: m.role === 'admin' ? 'member' : 'admin',
                    })
                  }
                >
                  {m.role === 'admin' ? 'Remove admin' : 'Make admin'}
                </Button>
              )}
              {isAdmin(group) && !isMe && m.role !== 'owner' && (
                <Button
                  variant="danger"
                  className="px-2 py-1"
                  onClick={() => confirm(`Remove ${m.displayName}?`) && remove.mutate(m.userId)}
                >
                  Remove
                </Button>
              )}
              {isMe && m.role !== 'owner' && (
                <Button
                  variant="danger"
                  className="px-2 py-1"
                  onClick={() => confirm('Leave this group?') && remove.mutate(m.userId)}
                >
                  Leave
                </Button>
              )}
            </div>
          </Card>
        );
      })}
      <ErrorText error={members.error ?? setRole.error ?? remove.error} />
    </div>
  );
}

function Settings({ group }: { group: Group }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [whoCanPost, setWhoCanPost] = useState(group.whoCanPost);
  const [whoCanInvite, setWhoCanInvite] = useState(group.whoCanInvite);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () => api.updateGroup(group.id, { name, description, whoCanPost, whoCanInvite }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setSaved(true);
    },
  });
  const del = useMutation({
    mutationFn: () => api.deleteGroup(group.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      navigate('/');
    },
  });

  const permissionSelect = (value: PermissionLevel, onChange: (v: PermissionLevel) => void) => (
    <select
      value={value}
      onChange={(e) => {
        onChange(e.target.value as PermissionLevel);
        setSaved(false);
      }}
      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
    >
      <option value="all_members">Everyone in the group</option>
      <option value="admins">Only admins</option>
    </select>
  );

  return (
    <div className="space-y-6">
      <Card>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label className="block">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          </label>
          <label className="block">
            <Label hint="optional">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </label>
          <label className="block">
            <Label>Who can post plans</Label>
            {permissionSelect(whoCanPost, setWhoCanPost)}
          </label>
          <label className="block">
            <Label>Who can invite people</Label>
            {permissionSelect(whoCanInvite, setWhoCanInvite)}
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={save.isPending}>
              Save
            </Button>
            {saved && <span className="text-sm text-green-600">Saved ✓</span>}
          </div>
          <ErrorText error={save.error} />
        </form>
      </Card>

      {group.myRole === 'owner' && (
        <Card className="ring-red-200">
          <p className="mb-2 text-sm font-medium text-red-700">Danger zone</p>
          <Button
            variant="danger"
            className="ring-1 ring-red-300"
            onClick={() =>
              confirm(`Delete "${group.name}" and all its plans? This can't be undone.`) &&
              del.mutate()
            }
          >
            Delete group
          </Button>
          <ErrorText error={del.error} />
        </Card>
      )}
    </div>
  );
}
