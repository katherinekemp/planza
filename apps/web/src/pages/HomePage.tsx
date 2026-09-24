import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../lib/api.ts';
import { PlanCard } from '../components/PlanCard.tsx';
import { Button, Card, Empty, ErrorText, Input, Loading } from '../components/ui.tsx';

export function HomePage() {
  const feed = useQuery({ queryKey: ['plans', 'feed'], queryFn: api.feed });
  const groups = useQuery({ queryKey: ['groups'], queryFn: api.groups });

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_16rem]">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Coming up</h2>
        {feed.isPending ? (
          <Loading />
        ) : feed.data?.length ? (
          feed.data.map((p) => <PlanCard key={p.id} plan={p} showGroup canEdit={false} />)
        ) : (
          <Empty>No upcoming plans yet. Open a group and suggest something!</Empty>
        )}
        <ErrorText error={feed.error} />
      </section>

      <aside className="space-y-3">
        <h2 className="text-lg font-semibold">Your groups</h2>
        {groups.data?.map((g) => (
          <Link
            key={g.id}
            to={`/groups/${g.id}`}
            className="block rounded-xl bg-white p-3 shadow-sm ring-1 ring-stone-200 hover:ring-brand-500"
          >
            <p className="font-medium">{g.name}</p>
            <p className="text-xs text-stone-500">
              {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
            </p>
          </Link>
        ))}
        <NewGroup />
      </aside>
    </div>
  );
}

function NewGroup() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: () => api.createGroup({ name }),
    onSuccess: (group) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      navigate(`/groups/${group.id}`);
    },
  });

  if (!open) {
    return (
      <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        + New group
      </Button>
    );
  }
  return (
    <Card>
      <form
        className="space-y-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Input
          placeholder="Group name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={80}
          autoFocus
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={create.isPending}>
            Create
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
        <ErrorText error={create.error} />
      </form>
    </Card>
  );
}
