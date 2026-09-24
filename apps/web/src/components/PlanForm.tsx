import { useState, type FormEvent } from 'react';
import type { CreatePlanInput, Plan } from '@planza/shared';
import { fromLocalInput, toLocalInput } from '../lib/format.ts';
import { Button, ErrorText, Input, Label, Textarea } from './ui.tsx';

interface Props {
  initial?: Plan;
  submitLabel: string;
  onSubmit: (input: CreatePlanInput) => Promise<unknown>;
  onCancel?: () => void;
}

/** Create or edit a plan. Leaving "Pick a date" unchecked posts it as an idea. */
export function PlanForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [hasDate, setHasDate] = useState(initial ? initial.startsAt !== null : true);
  const [when, setWhen] = useState(initial?.startsAt ? toLocalInput(initial.startsAt) : '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        title,
        location: location || undefined,
        description: description || undefined,
        startsAt: hasDate && when ? fromLocalInput(when) : null,
      });
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <Label>What's the plan?</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Tacos at Lola's, hike Torrey Pines…"
          required
          maxLength={120}
          autoFocus
        />
      </label>

      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setHasDate(true)}
          className={`rounded-full px-3 py-1 ${hasDate ? 'bg-brand-100 font-medium text-brand-700' : 'text-stone-500 hover:bg-stone-100'}`}
        >
          📅 Pick a date
        </button>
        <button
          type="button"
          onClick={() => setHasDate(false)}
          className={`rounded-full px-3 py-1 ${!hasDate ? 'bg-brand-100 font-medium text-brand-700' : 'text-stone-500 hover:bg-stone-100'}`}
        >
          💡 Just an idea
        </button>
      </div>

      {hasDate && (
        <label className="block">
          <Label>When</Label>
          <Input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            required
          />
        </label>
      )}

      <label className="block">
        <Label hint="optional">Where</Label>
        <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} />
      </label>

      <label className="block">
        <Label hint="optional">Details</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
        />
      </label>

      <ErrorText error={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
