'use client';

import { useRouter, useParams } from 'next/navigation';
import { BajaActivoForm } from '@/components/activos/BajaActivoForm';
import { PageHeader } from '@/components/ui/PageHeader';

export default function BajaActivoPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader backHref={`/activos/${id}`} title="Dar de Baja" />

      <div className="card p-6">
        <BajaActivoForm
          assetId={id}
          onSuccess={() => {
            router.push(`/activos/${id}`);
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}