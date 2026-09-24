import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api.ts';
import { Button, Card, ErrorText, Input, Label } from '../components/ui.tsx';

export function ProfilePage() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  const [name, setName] = useState(me.data?.displayName ?? '');
  const save = useMutation({
    mutationFn: () => api.updateMe(name),
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user);
      // Your name appears on plans and member lists too.
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  return (
    <Card className="max-w-md">
      <h1 className="mb-4 text-lg font-semibold">Your profile</h1>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label className="block">
          <Label hint="what friends see">Display name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
        </label>
        <p className="text-sm text-stone-500">{me.data?.email}</p>
        <Button type="submit" disabled={save.isPending}>
          {save.isSuccess ? 'Saved ✓' : 'Save'}
        </Button>
        <ErrorText error={save.error} />
      </form>
    </Card>
  );
}
