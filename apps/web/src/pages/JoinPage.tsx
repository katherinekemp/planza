import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams } from 'react-router';
import { api } from '../lib/api.ts';
import { Button, Card, ErrorText, Loading } from '../components/ui.tsx';

export function JoinPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api.previewInvite(token),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => api.acceptInvite(token),
    onSuccess: ({ groupId }) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      navigate(`/groups/${groupId}`, { replace: true });
    },
  });

  if (preview.isPending) return <Loading />;
  if (preview.data?.alreadyMember)
    return <Navigate to={`/groups/${preview.data.groupId}`} replace />;

  return (
    <Card className="mx-auto max-w-sm space-y-4 text-center">
      {preview.data ? (
        <>
          <p className="text-4xl">🎉</p>
          <div>
            <p className="text-sm text-stone-500">You've been invited to join</p>
            <h1 className="text-xl font-bold">{preview.data.groupName}</h1>
            <p className="text-sm text-stone-500">
              {preview.data.memberCount} {preview.data.memberCount === 1 ? 'member' : 'members'}
            </p>
          </div>
          <Button className="w-full" onClick={() => accept.mutate()} disabled={accept.isPending}>
            Join group
          </Button>
          <ErrorText error={accept.error} />
        </>
      ) : (
        <ErrorText error={preview.error} />
      )}
    </Card>
  );
}
