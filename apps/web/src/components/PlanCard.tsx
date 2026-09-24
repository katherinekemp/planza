import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Plan, PlanResponse } from '@planza/shared';
import { api } from '../lib/api.ts';
import { formatWhen } from '../lib/format.ts';
import { PlanForm } from './PlanForm.tsx';
import { Button, Card, ErrorText } from './ui.tsx';

const DATED_OPTIONS: { value: PlanResponse; label: string }[] = [
  { value: 'going', label: '🙌 Going' },
  { value: 'maybe', label: '🤔 Maybe' },
  { value: 'cant', label: "😢 Can't" },
];
const IDEA_OPTIONS: { value: PlanResponse; label: string }[] = [
  { value: 'interested', label: "👀 I'm in" },
];

const LABELS: Record<PlanResponse, string> = {
  going: 'Going',
  maybe: 'Maybe',
  interested: 'Interested',
  cant: "Can't",
};

interface Props {
  plan: Plan;
  showGroup?: boolean;
  canEdit: boolean;
}

export function PlanCard({ plan, showGroup, canEdit }: Props) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  // Any change to a plan can move it between lists (upcoming/ideas) and the feed, so refresh them all.
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['plans'] });

  const respond = useMutation({
    mutationFn: (response: PlanResponse) =>
      plan.myResponse === response ? api.clearResponse(plan.id) : api.respond(plan.id, response),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: () => api.deletePlan(plan.id), onSuccess: refresh });

  if (editing) {
    return (
      <Card>
        <PlanForm
          initial={plan}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            await api.updatePlan(plan.id, input);
            await refresh();
            setEditing(false);
          }}
        />
      </Card>
    );
  }

  const options = plan.startsAt ? DATED_OPTIONS : IDEA_OPTIONS;
  const byResponse = Object.groupBy(plan.responses, (r) => r.response);

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-600">
            {plan.startsAt ? formatWhen(plan.startsAt) : '💡 Idea'}
            {showGroup && (
              <>
                {' · '}
                <Link to={`/groups/${plan.groupId}`} className="text-stone-500 hover:underline">
                  {plan.groupName}
                </Link>
              </>
            )}
          </p>
          <h3 className="mt-0.5 text-base font-semibold">{plan.title}</h3>
          {plan.location && <p className="text-sm text-stone-600">📍 {plan.location}</p>}
        </div>
        {canEdit && (
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" className="px-2 py-1" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="danger"
              className="px-2 py-1"
              onClick={() => confirm('Delete this plan?') && remove.mutate()}
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      {plan.description && (
        <p className="whitespace-pre-line text-sm text-stone-700">{plan.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => respond.mutate(o.value)}
            disabled={respond.isPending}
            className={`rounded-full px-3 py-1 text-sm ring-1 transition-colors ${
              plan.myResponse === o.value
                ? 'bg-brand-500 text-white ring-brand-500'
                : 'bg-white text-stone-700 ring-stone-300 hover:bg-stone-100'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {plan.responses.length > 0 && (
        <div className="space-y-0.5 text-xs text-stone-500">
          {(Object.keys(LABELS) as PlanResponse[])
            .filter((r) => byResponse[r]?.length)
            .map((r) => (
              <p key={r}>
                <span className="font-medium text-stone-700">{LABELS[r]}:</span>{' '}
                {byResponse[r]!.map((x) => x.displayName).join(', ')}
              </p>
            ))}
        </div>
      )}

      <p className="text-xs text-stone-400">Posted by {plan.author.displayName}</p>
      <ErrorText error={respond.error ?? remove.error} />
    </Card>
  );
}
